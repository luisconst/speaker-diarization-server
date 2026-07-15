"""
Shared service functions for segment creation, speaker management, and embedding operations.
Extracted from api.py, conversation_api.py, and streaming_websocket.py to eliminate duplication.
"""
import os
import json
import logging
import numpy as np
from datetime import timedelta
from typing import Any, Optional, Tuple, List
from sqlalchemy import exists
from sqlalchemy.orm import Session, joinedload

from .models import Speaker, Conversation, ConversationSegment, SpeakerEmotionProfile
from .diarization import auto_enroll_unknown_speaker

logger = logging.getLogger(__name__)


def data_path() -> str:
    """Single source of truth for the data directory (audio, temp, recordings)."""
    return os.getenv("DATA_PATH", "./data")


def load_known_speakers(db: Session) -> List[Tuple[int, str, Any]]:
    """Return the (id, name, embedding) tuple list consumed by the engine."""
    speakers = db.query(Speaker).all()
    return [(s.id, s.name, s.get_embedding()) for s in speakers]


def resolve_audio_path(conversation, segment=None) -> Optional[str]:
    """
    Resolve the best audio file path for a segment.
    Prefers full conversation audio (where offsets are valid),
    falls back to segment audio file.

    Returns:
        Path string or None if no audio available
    """
    if conversation.audio_path and os.path.exists(conversation.audio_path):
        return conversation.audio_path
    if segment and segment.segment_audio_path and os.path.exists(segment.segment_audio_path):
        return segment.segment_audio_path
    return None


def create_segment_from_result(
    seg: dict,
    conversation_id: int,
    conv_start,
    db: Session,
    threshold: float,
    segment_audio_path: str = None,
    start_offset_base: float = 0.0,
    engine=None,
) -> ConversationSegment:
    """
    Create a ConversationSegment from a diarization result dict.

    Handles speaker identification, unknown auto-enrollment,
    word serialization, and embedding caching.

    Args:
        seg: Dict from transcribe_with_diarization result
        conversation_id: Parent conversation ID
        conv_start: Conversation start datetime
        db: Database session
        threshold: Speaker similarity threshold
        segment_audio_path: Optional path to segment WAV file (for streaming)
        start_offset_base: Offset to add to segment times (for streaming)
        engine: SpeakerRecognitionEngine (needed for cache updates during streaming)

    Returns:
        ConversationSegment (added to session but not committed)
    """
    speaker_id = None
    speaker_name = seg["speaker"]
    confidence = seg.get("confidence", 0.0)

    if seg.get("is_known"):
        speaker = db.query(Speaker).filter(Speaker.name == speaker_name).first()
        if speaker:
            speaker_id = speaker.id
    else:
        embedding = seg.get("embedding")
        if embedding is not None and speaker_name and speaker_name.startswith("Unknown_"):
            speaker_id, speaker_name = auto_enroll_unknown_speaker(
                embedding, db, threshold=threshold
            )
            # Add to speaker cache if engine provided (streaming mode)
            if speaker_id and engine and hasattr(engine, 'add_speaker_to_cache'):
                engine.add_speaker_to_cache(
                    speaker_id=speaker_id,
                    speaker_name=speaker_name,
                    embedding=embedding,
                    profile_type='general'
                )
            confidence = 1.0 if speaker_id else confidence

    words_json = json.dumps(seg["words"]) if seg.get("words") else None

    seg_start = start_offset_base + seg["start"]
    seg_end = start_offset_base + seg["end"]

    segment = ConversationSegment(
        conversation_id=conversation_id,
        speaker_id=speaker_id,
        speaker_name=speaker_name,
        text=seg.get("text", ""),
        start_time=conv_start + timedelta(seconds=seg_start),
        end_time=conv_start + timedelta(seconds=seg_end),
        start_offset=seg_start,
        end_offset=seg_end,
        confidence=confidence,
        emotion_category=seg.get("emotion_category"),
        emotion_confidence=seg.get("emotion_confidence"),
        detector_breakdown=json.dumps(seg["detector_breakdown"]) if seg.get("detector_breakdown") else None,
        segment_audio_path=segment_audio_path,
        words_data=words_json,
        avg_logprob=seg.get("avg_logprob")
    )

    if seg.get("embedding") is not None:
        segment.set_speaker_embedding(seg["embedding"])
    if seg.get("emotion_embedding") is not None:
        segment.set_emotion_embedding(seg["emotion_embedding"])

    db.add(segment)
    return segment


def _invalidate_speaker_cache(engine) -> None:
    """Tell a streaming engine to forget its speaker-profile cache after a mutation.

    Safe to call with any engine-like object or None; just a noop if the engine
    doesn't expose clear_speaker_cache (e.g. in batch mode).
    """
    if engine is None:
        return
    clear = getattr(engine, "clear_speaker_cache", None)
    if clear is not None:
        clear()


def recalculate_speaker_embedding(
    speaker: Speaker,
    db: Session,
    engine,
) -> int:
    """
    Recalculate a speaker's embedding from all their non-misidentified segments.
    Uses cached embeddings where available, falls back to audio extraction.

    Returns:
        Number of embeddings used, or 0 if no valid segments found
    """
    _invalidate_speaker_cache(engine)
    # joinedload prevents an N+1 on seg.conversation when embeddings are missing.
    segments = (
        db.query(ConversationSegment)
        .options(joinedload(ConversationSegment.conversation))
        .filter(
            ConversationSegment.speaker_id == speaker.id,
            ConversationSegment.is_misidentified == False,
        )
        .all()
    )

    if not segments:
        return 0

    embeddings = []
    batch_segments = []

    for seg in segments:
        stored = seg.get_speaker_embedding()
        if stored is not None and not np.isnan(stored).any():
            embeddings.append(stored)
        else:
            audio_path = resolve_audio_path(seg.conversation, seg)
            if audio_path:
                batch_segments.append({
                    'audio_file': audio_path,
                    'start_time': seg.start_offset,
                    'end_time': seg.end_offset
                })

    if batch_segments:
        extracted = engine.extract_segment_embeddings_batch(batch_segments)
        embeddings.extend([e for e in extracted if e is not None and not np.isnan(e).any()])

    if not embeddings:
        return 0

    speaker.set_embedding(np.mean(embeddings, axis=0))
    return len(embeddings)


def recalculate_emotion_profile(
    speaker_id: int,
    emotion_category: str,
    db: Session,
    engine,
) -> Optional[str]:
    """
    Recalculate a speaker's emotion profile from all corrected, non-misidentified segments.

    Returns:
        "updated", "created", "deleted", or None if nothing changed
    """
    _invalidate_speaker_cache(engine)
    segments = (
        db.query(ConversationSegment)
        .options(joinedload(ConversationSegment.conversation))
        .filter(
            ConversationSegment.speaker_id == speaker_id,
            ConversationSegment.emotion_corrected == True,
            ConversationSegment.emotion_misidentified == False,
            ConversationSegment.emotion_category == emotion_category,
        )
        .all()
    )

    emotion_embeddings = []
    voice_embeddings = []

    for seg in segments:
        # Emotion embedding
        stored_emb = seg.get_emotion_embedding()
        if stored_emb is not None and not np.isnan(stored_emb).any():
            emotion_embeddings.append(stored_emb)
        else:
            audio_path = resolve_audio_path(seg.conversation, seg)
            if audio_path:
                try:
                    data = engine.extract_emotion(audio_path, seg.start_offset, seg.end_offset, extract_embedding=True)
                    if data and 'embedding' in data and not np.isnan(data['embedding']).any():
                        emotion_embeddings.append(data['embedding'])
                except Exception as e:
                    logger.warning(f"Could not extract emotion embedding for segment {seg.id}: {e}")

        # Voice embedding
        voice_emb = seg.get_speaker_embedding()
        if voice_emb is not None and not np.isnan(voice_emb).any():
            voice_embeddings.append(voice_emb)

    profile = db.query(SpeakerEmotionProfile).filter(
        SpeakerEmotionProfile.speaker_id == speaker_id,
        SpeakerEmotionProfile.emotion_category == emotion_category
    ).first()

    if emotion_embeddings:
        avg_emb = np.mean(emotion_embeddings, axis=0)
        avg_voice = np.mean(voice_embeddings, axis=0) if voice_embeddings else None

        if profile:
            profile.set_embedding(avg_emb)
            profile.sample_count = len(emotion_embeddings)
            if avg_voice is not None:
                profile.set_voice_embedding(avg_voice)
                profile.voice_sample_count = len(voice_embeddings)
            else:
                profile.set_voice_embedding(None)
                profile.voice_sample_count = 0
            return "updated"
        else:
            profile = SpeakerEmotionProfile(
                speaker_id=speaker_id,
                emotion_category=emotion_category,
                sample_count=len(emotion_embeddings),
                voice_sample_count=len(voice_embeddings) if voice_embeddings else 0
            )
            profile.set_embedding(avg_emb)
            if avg_voice is not None:
                profile.set_voice_embedding(avg_voice)
            db.add(profile)
            return "created"
    elif profile:
        db.delete(profile)
        return "deleted"

    return None


def delete_unknown_speakers(db: Session, engine=None) -> Tuple[int, List[str]]:
    """
    Delete all speakers with names starting with 'Unknown_'.
    Handles FK cleanup (nullify segments, delete emotion profiles).

    Returns:
        Tuple of (deleted_count, list of deleted names)
    """
    _invalidate_speaker_cache(engine)
    unknowns = db.query(Speaker).filter(Speaker.name.like("Unknown_%")).all()
    if not unknowns:
        return 0, []

    ids = [s.id for s in unknowns]
    names = [s.name for s in unknowns]

    db.query(ConversationSegment).filter(
        ConversationSegment.speaker_id.in_(ids)
    ).update({"speaker_id": None}, synchronize_session=False)

    db.query(SpeakerEmotionProfile).filter(
        SpeakerEmotionProfile.speaker_id.in_(ids)
    ).delete(synchronize_session=False)

    for speaker in unknowns:
        db.delete(speaker)

    return len(unknowns), names


def cleanup_orphaned_unknowns(db: Session, engine=None) -> List[str]:
    """
    Delete Unknown_* speakers that have zero segments assigned.

    Returns:
        List of deleted speaker names
    """
    _invalidate_speaker_cache(engine)
    has_segments = exists().where(ConversationSegment.speaker_id == Speaker.id)
    orphans = db.query(Speaker).filter(
        Speaker.name.like("Unknown_%"),
        ~has_segments,
    ).all()

    deleted = [s.name for s in orphans]
    for speaker in orphans:
        db.delete(speaker)
    return deleted


def export_conversation_to_directory(conversation_id: int, db: Session):
    """
    Generate markdown for a conversation and save it to settings.export_directory
    if configured.
    """
    from .config import get_config
    config = get_config()
    settings = config.get_settings()
    
    export_dir = getattr(settings, 'export_directory', '')
    if not export_dir or not os.path.exists(export_dir):
        return
        
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        return
        
    import re
    
    # Safe title
    safe_title = re.sub(r'[^\w\s-]', '', conversation.title or f"transcript_{conversation_id}")
    safe_title = safe_title.strip().replace(' ', '_')
    if not safe_title:
        safe_title = f"transcript_{conversation_id}"
        
    segments = db.query(ConversationSegment).filter(
        ConversationSegment.conversation_id == conversation_id
    ).order_by(ConversationSegment.start_offset.asc()).all()
    
    participants = list(set(s.speaker_name for s in segments if s.speaker_name))
    tags_list = json.loads(conversation.tags) if conversation.tags else []
    
    md = '---\n'
    md += f'title: "{conversation.title or "transcript_" + str(conversation_id)}"\n'
    md += f'date: {conversation.start_time.strftime("%Y-%m-%d") if conversation.start_time else "unknown"}\n'
    md += f'category: {conversation.category or "outro"}\n'
    if participants:
        md += f'participants: {json.dumps(participants, ensure_ascii=False)}\n'
    if tags_list:
        md += f'tags: {json.dumps(tags_list, ensure_ascii=False)}\n'
    if conversation.duration:
        mins = int(conversation.duration // 60)
        md += f'duration: "{mins} min"\n'
    md += '---\n\n'
    
    if conversation.summary:
        md += conversation.summary.strip() + "\n\n"
        
    md += '## Transcrição\n\n'
    current_speaker = None
    for s in segments:
        speaker = s.speaker_name or 'Unknown'
        h = int(s.start_offset // 3600)
        m = int((s.start_offset % 3600) // 60)
        s_val = int(s.start_offset % 60)
        time_str = f"{h:02d}:{m:02d}:{s_val:02d}"
        if speaker != current_speaker:
            md += f'\n**{speaker}** ({time_str})\n'
            current_speaker = speaker
        md += f'> {s.text or ""}\n'
        
    file_path = os.path.join(export_dir, f"{safe_title}.md")
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(md)
        logger.info(f"💾 Automatically exported conversation {conversation_id} to {file_path}")
    except Exception as e:
        logger.error(f"❌ Failed to auto-export conversation {conversation_id} to {file_path}: {e}")


async def auto_summarize_and_export(conversation_id: int, db: Session):
    """
    Check settings: if auto_summarize is True, run Ollama to generate a summary.
    Then, export the markdown note to the export directory.
    """
    from .config import get_config
    from .summarization import SummarizationEngine
    import json as json_module
    
    config = get_config()
    settings = config.get_settings()
    
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        return
        
    if getattr(settings, 'auto_summarize', False):
        segments = db.query(ConversationSegment).filter(
            ConversationSegment.conversation_id == conversation_id
        ).order_by(ConversationSegment.start_offset).all()
        
        if segments:
            ollama_url = getattr(settings, 'ollama_url', 'http://localhost:11434')
            ollama_model = getattr(settings, 'ollama_model', 'llama3')
            engine = SummarizationEngine(ollama_url=ollama_url, model=ollama_model)
            
            if await engine.is_available():
                transcript = engine.build_transcript_text(segments)
                
                # Choose prompt
                custom_prompts = None
                cfg_custom = getattr(settings, 'custom_prompts', None)
                if cfg_custom:
                    try:
                        custom_prompts = json_module.loads(cfg_custom) if isinstance(cfg_custom, str) else cfg_custom
                    except Exception:
                        pass
                        
                chosen_prompt = None
                if custom_prompts:
                    if conversation.tags:
                        try:
                            tags_list = json_module.loads(conversation.tags) if isinstance(conversation.tags, str) else conversation.tags
                            for tag in tags_list:
                                if tag in custom_prompts:
                                    chosen_prompt = custom_prompts[tag]
                                    break
                        except Exception:
                            pass
                    if not chosen_prompt and conversation.category and conversation.category in custom_prompts:
                        chosen_prompt = custom_prompts[conversation.category]
                    if not chosen_prompt and "default" in custom_prompts:
                        chosen_prompt = custom_prompts["default"]
                        
                result = await engine.summarize(
                    transcript, 
                    category=conversation.category or 'default',
                    custom_prompt=chosen_prompt,
                    custom_prompts=custom_prompts
                )
                if result.get('success'):
                    conversation.summary = result['summary_markdown']
                    if result.get('action_items'):
                        conversation.action_items = json_module.dumps(result['action_items'], ensure_ascii=False)
                    db.commit()
                    logger.info(f"✓ Automatically summarized conversation {conversation_id}")
                    
    # Always export after processing finishes
    export_conversation_to_directory(conversation_id, db)


