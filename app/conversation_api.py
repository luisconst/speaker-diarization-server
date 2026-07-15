"""
API endpoints for conversation management
"""
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
import asyncio
import json
import os

from .database import get_db, utc_now
from .models import Conversation, ConversationSegment, Speaker, SpeakerEmotionProfile
from .schemas import (
    ConversationResponse,
    ConversationsListResponse,
    ConversationUpdate,
    IdentifySpeakerRequest,
    ToggleMisidentifiedRequest,
    SegmentTextUpdate,
)
from .diarization import SpeakerRecognitionEngine
from .api import get_engine
from .config import get_config
from .services import (
    cleanup_orphaned_unknowns,
    create_segment_from_result,
    data_path,
    load_known_speakers,
    recalculate_emotion_profile,
    recalculate_speaker_embedding,
    resolve_audio_path,
)
import logging
import numpy as np

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversations", tags=["Conversations"])


@router.get("", response_model=ConversationsListResponse)
async def list_conversations(
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = None,
    speaker_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    uploaded_by: Optional[str] = None,
    category: Optional[str] = None,
    sort_by: Optional[str] = "start_time",
    sort_order: Optional[str] = "desc",
    db: Session = Depends(get_db)
):
    """
    List all conversations with pagination, filtering, and sorting.
    Returns lightweight summaries without segments for better performance.
    """
    # Map sort_by string to actual model column attribute safely
    sort_by_map = {
        "title": Conversation.title,
        "start_time": Conversation.start_time,
        "duration": Conversation.duration,
        "uploaded_by": Conversation.uploaded_by,
        "updated_at": Conversation.updated_at
    }
    
    order_column = sort_by_map.get(sort_by, Conversation.start_time)
    
    if sort_order == "asc":
        query = db.query(Conversation).order_by(order_column.asc())
    else:
        query = db.query(Conversation).order_by(order_column.desc())

    if status:
        query = query.filter(Conversation.status == status)

    if uploaded_by:
        query = query.filter(Conversation.uploaded_by == uploaded_by)

    if category:
        query = query.filter(Conversation.category == category)

    if speaker_id is not None:
        query = query.filter(Conversation.transcript_segments.any(ConversationSegment.speaker_id == speaker_id))

    if start_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            query = query.filter(Conversation.start_time >= start_dt)
        except ValueError:
            pass

    if end_date:
        try:
            end_dt = datetime.strptime(end_date + " 23:59:59", "%Y-%m-%d %H:%M:%S")
            query = query.filter(Conversation.start_time <= end_dt)
        except ValueError:
            pass

    # Get total count
    total = query.count()

    # Get paginated results (no segments loaded)
    conversations = query.offset(skip).limit(limit).all()

    return ConversationsListResponse(
        conversations=conversations,
        total=total,
        skip=skip,
        limit=limit
    )



@router.get("/categories")
async def list_categories():
    """List available conversation categories"""
    return {
        "categories": [
            {"id": "reuniao", "name": "Reunião", "icon": "briefcase"},
            {"id": "aula", "name": "Aula", "icon": "graduation-cap"},
            {"id": "encontro", "name": "Encontro", "icon": "users"},
            {"id": "entrevista", "name": "Entrevista", "icon": "mic"},
            {"id": "podcast", "name": "Podcast", "icon": "headphones"},
            {"id": "video", "name": "Vídeo", "icon": "video"},
            {"id": "outro", "name": "Outro", "icon": "file-text"}
        ]
    }


@router.get("/users")
async def list_users(db: Session = Depends(get_db)):
    """List distinct users who have uploaded conversations"""
    users = db.query(Conversation.uploaded_by).filter(
        Conversation.uploaded_by.isnot(None)
    ).distinct().all()
    return {"users": [u[0] for u in users if u[0]]}


@router.get("/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(conversation_id: int, db: Session = Depends(get_db)):
    """Get conversation details with all segments"""
    from sqlalchemy.orm import selectinload
    conversation = db.query(Conversation).options(
        selectinload(Conversation.transcript_segments)
    ).filter(
        Conversation.id == conversation_id
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return conversation


@router.get("/{conversation_id}/audio")
async def download_conversation_audio(conversation_id: int, db: Session = Depends(get_db)):
    """Download the full original audio file of a conversation"""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    if not conversation.audio_path or not os.path.exists(conversation.audio_path):
        raise HTTPException(status_code=404, detail="Audio file not found or deleted")
        
    ext = os.path.splitext(conversation.audio_path)[1].lower()
    media_type = "audio/wav"
    if ext == ".mp3":
        media_type = "audio/mpeg"
    elif ext == ".m4a":
        media_type = "audio/mp4"
    elif ext == ".flac":
        media_type = "audio/flac"
    elif ext == ".ogg":
        media_type = "audio/ogg"
        
    safe_title = "".join([c if c.isalnum() or c in " .-_()" else "_" for c in conversation.title]) if conversation.title else f"conversation_{conversation_id}"
    filename = f"{safe_title}{ext}"
    
    return FileResponse(
        path=conversation.audio_path,
        media_type=media_type,
        filename=filename
    )



@router.patch("/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    conversation_id: int,
    update_data: ConversationUpdate,
    db: Session = Depends(get_db)
):
    """Update conversation metadata"""
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if update_data.title is not None:
        conversation.title = update_data.title
    if update_data.status is not None:
        conversation.status = update_data.status
        
    if update_data.category is not None:
        conversation.category = update_data.category
        
    if update_data.tags is not None:
        import json as json_module
        conversation.tags = json_module.dumps(update_data.tags, ensure_ascii=False)

    db.commit()
    db.refresh(conversation)

    # Auto-export updated markdown
    from .services import export_conversation_to_directory
    export_conversation_to_directory(conversation_id, db)

    return conversation


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: int, db: Session = Depends(get_db)):
    """Delete conversation and associated audio"""
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Delete audio file
    if conversation.audio_path and os.path.exists(conversation.audio_path):
        os.remove(conversation.audio_path)

    db.delete(conversation)
    db.commit()

    return {"message": f"Conversation {conversation_id} deleted"}


def _background_reprocess(conversation_id: int, threshold: float):
    from .database import SessionLocal
    db = SessionLocal()
    try:
        conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conversation:
            logger.error(f"Background reprocess failed: Conversation {conversation_id} not found")
            return
            
        logger.info(f"🔄 Starting background reprocessing for conversation {conversation_id}...")

        # Load engine
        engine = get_engine()
        known_speakers = load_known_speakers(db)
        
        # Run sequential transcription + diarization pipeline
        result = engine.transcribe_with_diarization(
            conversation.audio_path,
            known_speakers,
            threshold=threshold,
            db_session=db
        )

        # Delete old segments
        db.query(ConversationSegment).filter(
            ConversationSegment.conversation_id == conversation_id
        ).delete(synchronize_session=False)

        # Create new segments
        conv_start = conversation.start_time
        for seg in result["segments"]:
            create_segment_from_result(
                seg, conversation_id, conv_start, db, threshold
            )

        # Update conversation stats
        conversation.status = "completed"
        conversation.num_segments = len(result["segments"])
        conversation.num_speakers = result["num_speakers"]
        conversation.updated_at = utc_now()
        db.commit()

        # Clear GPU cache
        engine.clear_gpu_cache()
        logger.info(f"✓ Background reprocess completed for conversation {conversation_id}")

        # Auto-summarize and export markdown
        from .services import auto_summarize_and_export
        import asyncio
        asyncio.run(auto_summarize_and_export(conversation_id, db))

    except Exception as e:
        logger.error(f"❌ Background reprocess failed for conversation {conversation_id}: {e}")
        try:
            conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
            if conversation:
                conversation.status = "failed"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


@router.post("/rematch-speakers-global")
async def rematch_speakers_globally(
    db: Session = Depends(get_db)
):
    """
    Rematch unknown speakers across ALL conversations with known/trained voice profiles.
    Does NOT rerun Whisper or Pyannote, uses stored embeddings.
    """
    import numpy as np
    from sklearn.metrics.pairwise import cosine_similarity

    # Get known speakers (names not starting with "Unknown_")
    known_speakers = db.query(Speaker).filter(~Speaker.name.like("Unknown_%")).all()
    if not known_speakers:
        return {"message": "No trained/known speaker profiles available to match against", "updated_segments": 0}

    # Get threshold
    config = get_config()
    settings = config.get_settings()
    threshold = settings.speaker_threshold

    # Get all segments belonging to Unknown speakers
    segments = db.query(ConversationSegment).filter(
        ConversationSegment.speaker_name.like("Unknown_%")
    ).all()

    updated_count = 0
    updated_conv_ids = set()
    for seg in segments:
        seg_emb = seg.get_speaker_embedding()
        if seg_emb is not None and not np.isnan(seg_emb).any():
            best_match = None
            best_similarity = threshold
            
            for speaker in known_speakers:
                sp_emb = speaker.get_embedding()
                if sp_emb is not None and not np.isnan(sp_emb).any():
                    similarity = cosine_similarity(
                        seg_emb.reshape(1, -1),
                        sp_emb.reshape(1, -1)
                    )[0][0]
                    
                    if similarity > best_similarity:
                        best_similarity = similarity
                        best_match = speaker
            
            if best_match:
                seg.speaker_id = best_match.id
                seg.speaker_name = best_match.name
                seg.confidence = float(best_similarity)
                updated_count += 1
                updated_conv_ids.add(seg.conversation_id)

    if updated_count > 0:
        db.commit()
        cleanup_orphaned_unknowns(db)
        db.commit()
        from .services import export_conversation_to_directory
        for cid in updated_conv_ids:
            export_conversation_to_directory(cid, db)

    return {
        "message": f"Successfully rematched {updated_count} segments globally with trained profiles",
        "updated_segments": updated_count
    }


@router.post("/{conversation_id}/rematch-speakers")
async def rematch_speakers_in_conversation(
    conversation_id: int,
    db: Session = Depends(get_db)
):
    """
    Rematch unknown speakers in a specific conversation with known/trained voice profiles.
    Does NOT rerun Whisper or Pyannote, uses stored embeddings.
    """
    import numpy as np
    from sklearn.metrics.pairwise import cosine_similarity

    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Get known speakers (names not starting with "Unknown_")
    known_speakers = db.query(Speaker).filter(~Speaker.name.like("Unknown_%")).all()
    if not known_speakers:
        return {"message": "No trained/known speaker profiles available to match against", "updated_segments": 0}

    # Get threshold
    config = get_config()
    settings = config.get_settings()
    threshold = settings.speaker_threshold

    # Get segments
    segments = db.query(ConversationSegment).filter(
        ConversationSegment.conversation_id == conversation_id
    ).all()

    updated_count = 0
    for seg in segments:
        # Only rematch segments that are currently Unknown
        if seg.speaker_name and seg.speaker_name.startswith("Unknown_"):
            seg_emb = seg.get_speaker_embedding()
            if seg_emb is not None and not np.isnan(seg_emb).any():
                best_match = None
                best_similarity = threshold
                
                for speaker in known_speakers:
                    sp_emb = speaker.get_embedding()
                    if sp_emb is not None and not np.isnan(sp_emb).any():
                        similarity = cosine_similarity(
                            seg_emb.reshape(1, -1),
                            sp_emb.reshape(1, -1)
                        )[0][0]
                        
                        if similarity > best_similarity:
                            best_similarity = similarity
                            best_match = speaker
                
                if best_match:
                    seg.speaker_id = best_match.id
                    seg.speaker_name = best_match.name
                    seg.confidence = float(best_similarity)
                    updated_count += 1

    if updated_count > 0:
        db.commit()
        cleanup_orphaned_unknowns(db)
        db.commit()
        from .services import export_conversation_to_directory
        export_conversation_to_directory(conversation_id, db)

    return {
        "message": f"Successfully rematched {updated_count} segments with trained profiles",
        "updated_segments": updated_count
    }


@router.post("/{conversation_id}/reprocess")
async def reprocess_conversation(
    conversation_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Re-process conversation with current speaker profiles in the background"""
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if not conversation.audio_path or not os.path.exists(conversation.audio_path):
        raise HTTPException(status_code=404, detail="Audio file not found")

    # Set status to processing immediately to show in the list/dashboard
    conversation.status = "processing"
    db.commit()

    config = get_config()
    settings = config.get_settings()
    threshold = settings.speaker_threshold

    # Queue background task
    background_tasks.add_task(_background_reprocess, conversation_id, threshold)

    return {"message": "Reprocessing started in background", "status": "processing"}


@router.post("/{conversation_id}/recalculate-emotions")
async def recalculate_emotions(
    conversation_id: int,
    db: Session = Depends(get_db),
    engine: SpeakerRecognitionEngine = Depends(get_engine)
):
    """
    Recalculate emotions for all segments using current emotion profiles
    WITHOUT re-running diarization or transcription (preserves manual work)
    """
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if not conversation.audio_path or not os.path.exists(conversation.audio_path):
        raise HTTPException(status_code=404, detail="Audio file not found")

    # Get all segments for this conversation
    segments = db.query(ConversationSegment).filter(
        ConversationSegment.conversation_id == conversation_id
    ).all()

    # Preload speakers referenced by these segments (avoids a per-segment query)
    speaker_ids = {s.speaker_id for s in segments if s.speaker_id}
    speakers_by_id = (
        {sp.id: sp for sp in db.query(Speaker).filter(Speaker.id.in_(speaker_ids)).all()}
        if speaker_ids else {}
    )

    updated_count = 0
    skipped_count = 0
    audio_file = conversation.audio_path

    for segment in segments:
        # Skip if no speaker or manually corrected (respect user corrections)
        if not segment.speaker_id or segment.emotion_corrected:
            skipped_count += 1
            continue

        try:
            # Re-extract emotion with personalized matching (off the event loop)
            emotion_data = await asyncio.to_thread(
                engine.extract_emotion,
                audio_file,
                segment.start_offset,
                segment.end_offset,
                extract_embedding=True,
            )

            if not emotion_data:
                skipped_count += 1
                continue

            speaker = speakers_by_id.get(segment.speaker_id)

            if speaker and speaker.emotion_profiles:
                # Use dual-detector matching if profiles exist
                voice_emb = segment.get_speaker_embedding()
                emotion_emb = emotion_data.get('embedding')

                if voice_emb is not None and emotion_emb is not None:
                
                    global_threshold = get_config().get_settings().emotion_threshold

                    dual_result = engine.match_emotion_dual_detector(
                        emotion_embedding=emotion_emb,
                        voice_embedding=voice_emb,
                        speaker_emotion_profiles=speaker.emotion_profiles,
                        global_threshold=global_threshold,
                        speaker_threshold=speaker.emotion_threshold,
                        generic_emotion=emotion_data['emotion_category'],
                        generic_confidence=emotion_data['emotion_confidence']
                    )

                    # Update segment with final decision
                    final = dual_result['final_decision']
                    segment.emotion_category = final['emotion']
                    segment.emotion_confidence = final['confidence']
                    segment.detector_breakdown = json.dumps(dual_result)  # Store breakdown for clients
                    updated_count += 1
                else:
                    # Fall back to generic emotion2vec result
                    segment.emotion_category = emotion_data['emotion_category']
                    segment.emotion_confidence = emotion_data['emotion_confidence']
                    segment.detector_breakdown = None  # No dual-detector used
                    updated_count += 1
            else:
                # No profiles, use generic emotion2vec result
                segment.emotion_category = emotion_data['emotion_category']
                segment.emotion_confidence = emotion_data['emotion_confidence']
                segment.detector_breakdown = None  # No dual-detector used
                updated_count += 1

        except Exception as e:
            logger.warning(f"Failed to recalculate emotion for segment {segment.id}: {e}")
            skipped_count += 1

    db.commit()

    # Clear GPU cache
    engine.clear_gpu_cache()

    return {
        "message": "Emotions recalculated",
        "updated": updated_count,
        "skipped": skipped_count,
        "total": len(segments)
    }


@router.post("/{conversation_id}/summarize")
async def summarize_conversation(
    conversation_id: int,
    db: Session = Depends(get_db)
):
    """Generate AI summary using local Ollama LLM"""
    from .summarization import SummarizationEngine, DEFAULT_PROMPTS
    import json as json_module
    
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    segments = db.query(ConversationSegment).filter(
        ConversationSegment.conversation_id == conversation_id
    ).order_by(ConversationSegment.start_offset).all()
    
    if not segments:
        raise HTTPException(status_code=400, detail="No segments to summarize")
    
    config = get_config()
    settings = config.get_settings()
    ollama_url = getattr(settings, 'ollama_url', 'http://localhost:11434')
    ollama_model = getattr(settings, 'ollama_model', 'llama3')
    
    engine = SummarizationEngine(ollama_url=ollama_url, model=ollama_model)
    
    # Check availability
    available = await engine.is_available()
    if not available:
        raise HTTPException(status_code=503, detail="Ollama is not running or not accessible. Make sure it is started on your server/local machine.")
    
    # Build transcript text
    transcript = engine.build_transcript_text(segments)
    
    # Determine prompt
    custom_prompts = None
    cfg_custom = getattr(settings, 'custom_prompts', None)
    if cfg_custom:
        if isinstance(cfg_custom, str):
            try:
                custom_prompts = json_module.loads(cfg_custom)
            except Exception:
                pass
        elif isinstance(cfg_custom, dict):
            custom_prompts = cfg_custom

    chosen_prompt = None
    if custom_prompts:
        # Check tags
        if conversation.tags:
            try:
                tags_list = json_module.loads(conversation.tags) if isinstance(conversation.tags, str) else conversation.tags
                for tag in tags_list:
                    if tag in custom_prompts:
                        chosen_prompt = custom_prompts[tag]
                        break
            except Exception:
                pass
        
        # Check category
        if not chosen_prompt and conversation.category and conversation.category in custom_prompts:
            chosen_prompt = custom_prompts[conversation.category]
            
        # Check default fallback in custom
        if not chosen_prompt and "default" in custom_prompts:
            chosen_prompt = custom_prompts["default"]

    # Run the summarization
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
        conversation.updated_at = utc_now()
        db.commit()
        return {
            "message": "Summary generated successfully",
            "summary": result['summary_markdown'],
            "action_items": result.get('action_items', []),
            "model": result.get('model')
        }
    else:
        raise HTTPException(status_code=500, detail=result.get('error', 'Unknown error'))


@router.get("/prompts/all")
async def get_prompts():
    """Get default and custom prompts"""
    from .summarization import DEFAULT_PROMPTS
    import json as json_module
    config = get_config()
    settings = config.get_settings()
    custom_prompts = None
    cfg_custom = getattr(settings, 'custom_prompts', None)
    if cfg_custom:
        if isinstance(cfg_custom, str):
            try:
                custom_prompts = json_module.loads(cfg_custom)
            except Exception:
                pass
        elif isinstance(cfg_custom, dict):
            custom_prompts = cfg_custom
            
    return {
        "default_prompts": DEFAULT_PROMPTS,
        "custom_prompts": custom_prompts or {}
    }


@router.post("/{conversation_id}/segments/{segment_id}/identify")
async def identify_speaker_in_segment(
    conversation_id: int,
    segment_id: int,
    request: IdentifySpeakerRequest,
    db: Session = Depends(get_db),
    engine: SpeakerRecognitionEngine = Depends(get_engine)
):
    """
    Identify speaker in segment and optionally enroll them

    Args:
        request: Request body with speaker_id, speaker_name, and enroll flag
    """
    speaker_id = request.speaker_id
    speaker_name = request.speaker_name
    enroll = request.enroll
    segment = db.query(ConversationSegment).filter(
        ConversationSegment.id == segment_id,
        ConversationSegment.conversation_id == conversation_id
    ).first()

    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")

    conversation = segment.conversation

    # Determine which audio file to use for embedding extraction
    # CRITICAL: Database offsets (start_offset/end_offset) are ALWAYS conversation-relative!
    # They represent seconds from the conversation start, NOT from individual segment files.
    # Therefore, we MUST use the full conversation audio file where these offsets are valid.
    start_time = segment.start_offset
    end_time = segment.end_offset

    audio_file = resolve_audio_path(conversation, segment)
    if not audio_file:
        raise HTTPException(status_code=404, detail="Audio file not found (neither conversation audio nor segment audio exists)")
    if audio_file == segment.segment_audio_path:
        logger.info(f"⚠️ WARNING: Using segment audio with conversation-relative offsets - may extract wrong audio!")

    # Store the old speaker name and ID for propagation and embedding recalculation
    old_speaker_name = segment.speaker_name
    old_speaker_id = segment.speaker_id

    # Extract embedding FIRST if enrolling (needed for new speakers, off the event loop)
    embedding = None
    if enroll:
        try:
            embedding = await asyncio.to_thread(
                engine.extract_segment_embedding,
                audio_file,
                start_time,
                end_time,
            )
        except Exception:
            raise HTTPException(
                status_code=500,
                detail="Failed to extract speaker embedding"
            )

    # Get or create speaker
    speaker = None
    merge_msg = ""

    if speaker_id:
        # Existing speaker by ID - load from DB
        speaker = db.query(Speaker).filter(Speaker.id == speaker_id).first()
        if not speaker:
            raise HTTPException(status_code=404, detail="Speaker not found")
    elif speaker_name:
        # Try to find existing speaker by name
        speaker = db.query(Speaker).filter(Speaker.name == speaker_name).first()

    # At this point, speaker is either:
    # - Existing speaker (found by ID or name)
    # - None (need to create new)

    if speaker:
        # Existing speaker - we'll recalculate embedding after updating segments
        merge_msg = ""
    else:
        # New speaker - must have name and embedding
        if not speaker_name:
            raise HTTPException(status_code=400, detail="speaker_name required for new speaker")

        if not enroll or embedding is None:
            raise HTTPException(status_code=400, detail="Must enroll new speaker (enroll=True)")

        # Create new speaker with embedding
        speaker = Speaker(name=speaker_name)
        speaker.set_embedding(embedding)
        db.add(speaker)
        db.flush()  # Get ID without committing
        merge_msg = " (initial enrollment)"

    # Update THIS segment
    segment.speaker_id = speaker.id
    segment.speaker_name = speaker.name
    segment.confidence = 1.0  # Manually identified

    # UPDATE ALL OTHER SEGMENTS with the same old speaker name (retroactive identification!)
    # SAFETY: Only do retroactive updates for Unknown speakers!
    # If old speaker is already identified (Tommy, Diamond, etc.), only update THIS segment
    updated_count = 0
    if old_speaker_name and old_speaker_name != speaker.name and old_speaker_name.startswith("Unknown_"):
        updated_count = db.query(ConversationSegment).filter(
            ConversationSegment.speaker_name == old_speaker_name,
            ConversationSegment.id != segment_id  # Don't update the one we just did
        ).update({
            "speaker_id": speaker.id,
            "speaker_name": speaker.name
        })

    # CRITICAL: Flush segment updates so emotion recalculation queries see the new speaker_id
    db.flush()

    # Everything below touches GPU (emotion extraction) and runs O(speaker_segments)
    # SQL. Wrap it in a single worker hop so the event loop is only blocked by the
    # initial embedding extraction above. The handler awaits here, so no other
    # coroutine is racing the `db` Session.
    def _retroactive_updates() -> tuple[str, int]:
        merge_suffix = ""
        emb_count = recalculate_speaker_embedding(speaker, db, engine)
        if emb_count:
            logger.info(f"✓ Recalculated embedding for '{speaker.name}' (added segment {segment_id}, now {emb_count} total segments)")
            merge_suffix = f" (recalculated from {emb_count} non-misidentified segments)"

        # Recalculate OLD speaker's embedding to exclude this segment, unless they'll be deleted anyway
        if (old_speaker_id and old_speaker_id != speaker.id
                and not (old_speaker_name and old_speaker_name.startswith("Unknown_"))):
            old_speaker = db.query(Speaker).filter(Speaker.id == old_speaker_id).first()
            if old_speaker:
                old_emb_count = recalculate_speaker_embedding(old_speaker, db, engine)
                if old_emb_count:
                    logger.info(f"✓ Recalculated embedding for '{old_speaker.name}' (removed segment {segment_id})")
                else:
                    logger.info(f"⚠️ No valid segments remaining for '{old_speaker.name}' after removing segment {segment_id}")

        if segment.emotion_corrected and not segment.emotion_misidentified and segment.emotion_category:
            emotion_category = segment.emotion_category
            logger.info(f"🎭 Recalculating emotion profiles for '{emotion_category}' (segment moved from {old_speaker_name} to {speaker.name})")

            new_result = recalculate_emotion_profile(speaker.id, emotion_category, db, engine)
            if new_result:
                logger.info(f"  ✓ {new_result.capitalize()} '{speaker.name}' emotion profile '{emotion_category}' (segment {segment_id})")

            if (old_speaker_id and old_speaker_id != speaker.id
                    and not (old_speaker_name and old_speaker_name.startswith("Unknown_"))):
                old_result = recalculate_emotion_profile(old_speaker_id, emotion_category, db, engine)
                if old_result:
                    logger.info(f"  ✓ {old_result.capitalize()} old speaker emotion profile '{emotion_category}' (removed segment {segment_id})")

        db.flush()

        logger.info(f"🔍 Starting cleanup check for orphaned Unknown speakers...")
        deleted_unknowns = cleanup_orphaned_unknowns(db, engine=engine)
        for name in deleted_unknowns:
            logger.info(f"🗑️ Auto-deleted orphaned speaker: {name}")

        if deleted_unknowns:
            if len(deleted_unknowns) == 1:
                merge_suffix += f" (auto-deleted orphaned {deleted_unknowns[0]})"
            else:
                merge_suffix += f" (auto-deleted {len(deleted_unknowns)} orphaned Unknown speakers)"

        db.commit()
        db.refresh(segment)

        # Re-detect emotions using personalized profiles (Unknown→Known transition)
        emotions_updated = 0
        if speaker.emotion_profiles:
            profiles = [
                (prof.emotion_category, prof.get_embedding(), prof.confidence_threshold)
                for prof in speaker.emotion_profiles
            ]
            global_threshold = get_config().get_settings().emotion_threshold
            identified_segments = db.query(ConversationSegment).filter(
                ConversationSegment.speaker_id == speaker.id,
                ConversationSegment.conversation_id == conversation_id,
            ).all()

            for seg in identified_segments:
                if not seg.emotion_category or seg.emotion_corrected:
                    continue
                original_emotion = seg.emotion_category
                emotion_embedding = seg.get_emotion_embedding()
                if emotion_embedding is None or np.isnan(emotion_embedding).any():
                    seg_audio = resolve_audio_path(seg.conversation, seg)
                    if seg_audio:
                        try:
                            emotion_data = engine.extract_emotion(
                                seg_audio, seg.start_offset, seg.end_offset, extract_embedding=True
                            )
                            if emotion_data and 'embedding' in emotion_data:
                                emotion_embedding = emotion_data.get('embedding')
                        except Exception as e:
                            logger.info(f"  ⚠️ Could not extract emotion for segment {seg.id}: {e}")
                            continue

                if emotion_embedding is not None and not np.isnan(emotion_embedding).any():
                    match = engine.match_emotion_to_profile(
                        emotion_embedding, profiles, global_threshold,
                        speaker_threshold=speaker.emotion_threshold,
                    )
                    if match:
                        matched_emotion, confidence = match
                        if matched_emotion != original_emotion:
                            logger.info(f"  ✓ Segment {seg.id}: {original_emotion} → {matched_emotion} ({confidence:.2%} personalized match)")
                            seg.emotion_category = matched_emotion
                            seg.emotion_confidence = confidence
                            emotions_updated += 1

            if emotions_updated > 0:
                logger.info(f"✅ Updated {emotions_updated} emotion(s) using personalized profiles")
        else:
            logger.info(f"  ℹ️ No emotion profiles found for {speaker.name} - keeping generic detections")

        db.commit()
        db.refresh(segment)
        engine.clear_gpu_cache()
        return merge_suffix, emotions_updated

    merge_suffix, _ = await asyncio.to_thread(_retroactive_updates)
    merge_msg += merge_suffix

    from .services import export_conversation_to_directory
    export_conversation_to_directory(conversation_id, db)

    return {
        "message": f"Speaker identified as {speaker.name}{merge_msg}. Updated {updated_count + 1} segment(s) total.",
        "speaker_id": speaker.id,
        "enrolled": enroll,
        "segments_updated": updated_count + 1
    }


@router.patch("/{conversation_id}/segments/{segment_id}/text")
async def update_segment_text(
    conversation_id: int,
    segment_id: int,
    request: SegmentTextUpdate,
    db: Session = Depends(get_db)
):
    """Update the text of a conversation segment"""
    segment = db.query(ConversationSegment).filter(
        ConversationSegment.id == segment_id,
        ConversationSegment.conversation_id == conversation_id
    ).first()

    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")

    segment.text = request.text
    db.commit()
    db.refresh(segment)

    # Auto-export updated markdown
    from .services import export_conversation_to_directory
    export_conversation_to_directory(conversation_id, db)

    return {"message": "Segment text updated successfully", "text": segment.text}


@router.patch("/{conversation_id}/segments/{segment_id}/misidentified")
async def toggle_segment_misidentified(
    conversation_id: int,
    segment_id: int,
    request: ToggleMisidentifiedRequest,
    db: Session = Depends(get_db),
    engine: SpeakerRecognitionEngine = Depends(get_engine)
):
    """
    Toggle misidentification status for a segment and recalculate speaker embedding

    When a segment is marked as misidentified, it's excluded from the speaker's
    embedding calculation, improving recognition accuracy.
    """
    segment = db.query(ConversationSegment).filter(
        ConversationSegment.id == segment_id,
        ConversationSegment.conversation_id == conversation_id
    ).first()

    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")

    segment.is_misidentified = request.is_misidentified

    # Flush to ensure the change is visible to subsequent queries
    db.flush()

    # If segment has a speaker, recalculate their embedding
    if segment.speaker_id:
        speaker = db.query(Speaker).filter(Speaker.id == segment.speaker_id).first()

        if speaker:
            emb_count = recalculate_speaker_embedding(speaker, db, engine)
            if emb_count:
                logger.info(f"✓ Recalculated embedding for '{speaker.name}' from {emb_count} non-misidentified segments")
            else:
                logger.info(f"⚠️ No valid segments remaining for '{speaker.name}' after marking segment {segment_id} as misidentified")

    db.commit()
    db.refresh(segment)

    # Clear GPU cache after embedding extractions
    engine.clear_gpu_cache()

    status_text = "marked as misidentified" if request.is_misidentified else "unmarked as misidentified"
    return {
        "message": f"Segment {segment_id} {status_text}",
        "is_misidentified": segment.is_misidentified,
        "embedding_recalculated": segment.speaker_id is not None
    }


@router.patch("/{conversation_id}/segments/{segment_id}/emotion-misidentified")
async def toggle_emotion_misidentified(
    conversation_id: int,
    segment_id: int,
    request: ToggleMisidentifiedRequest,
    db: Session = Depends(get_db),
    engine: SpeakerRecognitionEngine = Depends(get_engine)
):
    """
    Toggle emotion misidentification status for a segment and recalculate emotion profile

    When a segment's emotion correction is marked as misidentified, it's excluded from the
    speaker's emotion profile calculation, allowing you to fix mistakes in emotion learning.
    """
    segment = db.query(ConversationSegment).filter(
        ConversationSegment.id == segment_id,
        ConversationSegment.conversation_id == conversation_id
    ).first()

    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")

    # Only process if segment has an emotion correction
    if not segment.emotion_corrected:
        raise HTTPException(
            status_code=400,
            detail="Segment has no emotion correction to mark as misidentified"
        )

    segment.emotion_misidentified = request.is_misidentified

    # Flush so subsequent same-session queries see the new value
    db.flush()

    # If segment has a speaker and emotion, recalculate emotion profile
    if segment.speaker_id and segment.emotion_category:
        speaker = db.query(Speaker).filter(Speaker.id == segment.speaker_id).first()

        if speaker:
            emotion_category = segment.emotion_category
            result = recalculate_emotion_profile(speaker.id, emotion_category, db, engine)
            if result == "updated":
                logger.info(f"✓ Recalculated emotion profile '{emotion_category}' for '{speaker.name}'")
            elif result == "created":
                logger.info(f"✓ Created emotion profile '{emotion_category}' for '{speaker.name}'")
            elif result == "deleted":
                logger.info(f"⚠️ Deleted emotion profile '{emotion_category}' for '{speaker.name}' - no valid corrections remaining")

    db.commit()
    db.refresh(segment)

    # Clear GPU cache after embedding extractions
    engine.clear_gpu_cache()

    status_text = "marked as misidentified" if request.is_misidentified else "unmarked as misidentified"
    return {
        "message": f"Emotion correction for segment {segment_id} {status_text}",
        "emotion_misidentified": segment.emotion_misidentified,
        "emotion_profile_recalculated": segment.speaker_id is not None and segment.emotion_category is not None
    }


@router.get("/segments/{segment_id}/audio")
async def get_segment_audio(
    segment_id: int,
    db: Session = Depends(get_db)
):
    """
    Extract and serve audio for a specific conversation segment.

    Uses ffmpeg to extract the segment's time range from the full conversation audio.
    Returns WAV audio file.
    """
    logger.info(f"🎵 Audio request for segment {segment_id}")

    segment = db.query(ConversationSegment).filter(ConversationSegment.id == segment_id).first()
    if not segment:
        logger.info(f"❌ Segment {segment_id} not found in database")
        raise HTTPException(status_code=404, detail="Segment not found")

    conversation = segment.conversation

    # Determine source audio file and check if we need extraction
    # CRITICAL: Streaming segment files (seg_XXXX.wav) contain the RAW VAD-triggered audio chunk.
    # After diarization, ONE segment file may contain MULTIPLE speaker segments.
    # We MUST extract the specific time range, not serve the whole file!

    # First check: Can we use full conversation audio? (Best option)
    use_conversation_audio = conversation.audio_path and os.path.exists(conversation.audio_path)

    # Second check: Use segment file if conversation audio doesn't exist yet (during streaming)
    use_segment_audio = segment.segment_audio_path and os.path.exists(segment.segment_audio_path)

    if not use_conversation_audio and not use_segment_audio:
        logger.info(f"❌ No audio file found for segment {segment_id}")
        logger.info(f"  segment_audio_path: {segment.segment_audio_path}")
        logger.info(f"  conversation.audio_path: {conversation.audio_path}")
        raise HTTPException(status_code=404, detail="Audio file not found")

    # Prefer full conversation audio (offsets are conversation-relative)
    if use_conversation_audio:
        source_audio = conversation.audio_path
        start_time = segment.start_offset
        end_time = segment.end_offset
        logger.info(f"  Using conversation audio: {source_audio}")
        logger.info(f"  Offsets: {start_time:.2f}s - {end_time:.2f}s (conversation-relative)")
    else:
        # Fallback: Use segment file with file-relative offsets
        # Need to calculate the segment's position within its segment file
        source_audio = segment.segment_audio_path
        # TODO: Calculate file-relative offsets from segment file metadata
        # For now, serve entire segment file (may contain extra audio)
        logger.info(f"  ⚠️ Using segment audio (may contain multiple segments): {source_audio}")
        start_time = 0  # Start of segment file
        # Get duration from file
        from pydub import AudioSegment as AS
        audio = AS.from_file(source_audio)
        end_time = len(audio) / 1000.0  # Convert ms to seconds
        logger.info(f"  Serving entire segment file: 0s - {end_time:.2f}s")

    # Create temporary directory for extracted segments
    temp_dir = os.path.join(data_path(), "temp")
    os.makedirs(temp_dir, exist_ok=True)
    temp_path = os.path.join(temp_dir, f"segment_{segment_id}_{int(datetime.now().timestamp())}.wav")

    try:
        # Use ffmpeg to extract the specific time range with small padding at end
        duration = end_time - start_time
        duration_with_padding = duration + 0.25  # Add 250ms to avoid cutting off last word
        logger.info(f"  Extracting {duration_with_padding:.2f}s from offset {start_time:.2f}s")
        logger.info(f"  Output: {temp_path}")

        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y",
            "-ss", str(start_time),
            "-t", str(duration_with_padding),
            "-i", source_audio,
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            temp_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr_bytes = await proc.communicate()
        if proc.returncode != 0:
            logger.error(f"FFmpeg error:{stderr_bytes.decode(errors='replace')}")
            raise HTTPException(status_code=500, detail="Audio extraction failed")

        if not os.path.exists(temp_path):
            logger.info(f"❌ Extraction failed - temp file not created")
            raise HTTPException(status_code=500, detail="Audio extraction failed")

        file_size = os.path.getsize(temp_path)
        logger.info(f"✅ Extracted successfully ({file_size} bytes)")

        # Return the extracted audio file with cache control headers
        from starlette.background import BackgroundTask

        # Clean up temp file after sending
        def cleanup():
            try:
                if os.path.exists(temp_path):
                    os.unlink(temp_path)
                    logger.info(f"🗑️  Cleaned up {temp_path}")
            except Exception as e:
                logger.info(f"Failed to cleanup temp file {temp_path}: {e}")

        return FileResponse(
            path=temp_path,
            media_type="audio/wav",
            filename=f"segment_{segment_id}.wav",
            background=BackgroundTask(cleanup),
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.info(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Audio extraction failed")


# ============================================================================
# EMOTION ENDPOINTS (Personalized Emotion Detection)
# ============================================================================

@router.post("/{conversation_id}/segments/{segment_id}/correct-emotion")
async def correct_emotion_in_segment(
    conversation_id: int,
    segment_id: int,
    corrected_emotion: str = Query(..., description="Correct emotion category"),
    learn: bool = Query(True, description="Learn from this correction"),
    db: Session = Depends(get_db),
    engine: SpeakerRecognitionEngine = Depends(get_engine)
):
    """
    Correct emotion in a segment and optionally learn from the correction.

    This enables personalized emotion detection by building speaker-specific emotion profiles.

    Args:
        corrected_emotion: The correct emotion category (angry, happy, sad, neutral, fearful, surprised, disgusted, other)
        learn: If True, extract embedding and update speaker's emotion profile (default: True)

    Returns:
        Success message with details about learning
    """
    # Validate segment exists
    segment = db.query(ConversationSegment).filter(
        ConversationSegment.id == segment_id,
        ConversationSegment.conversation_id == conversation_id
    ).first()

    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")

    # Must have a known speaker to create emotion profile
    if not segment.speaker_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot create emotion profile for unknown speaker. Identify speaker first."
        )

    old_emotion = segment.emotion_category
    old_emotion_corrected = segment.emotion_corrected
    conversation = segment.conversation

    # Get audio file for embedding extraction
    audio_file = resolve_audio_path(conversation, segment)
    if not audio_file:
        raise HTTPException(status_code=404, detail="Audio file not found for this segment")

    # Extract emotion embedding if learning
    emotion_embedding = None
    if learn:
        # Try stored embedding first (FAST - no audio extraction needed!)
        emotion_embedding = segment.get_emotion_embedding()

        if emotion_embedding is None or np.isnan(emotion_embedding).any():
            # Extract from audio if not cached (SLOW - fallback only, off the event loop)
            try:
                logger.info(f"  ℹ️ Extracting emotion embedding from audio for segment {segment_id} (not cached)")
                emotion_data = await asyncio.to_thread(
                    engine.extract_emotion,
                    audio_file,
                    segment.start_offset,
                    segment.end_offset,
                    True,
                )

                if emotion_data:
                    emotion_embedding = emotion_data.get('embedding')

                if emotion_embedding is None:
                    raise HTTPException(
                        status_code=500,
                        detail="Failed to extract emotion embedding for learning"
                    )
            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail="Failed to extract emotion embedding"
                )
        else:
            logger.info(f"  ✓ Using cached emotion embedding for segment {segment_id}")

    # Update segment FIRST so recalculation of OLD profile correctly excludes this segment
    segment.emotion_category = corrected_emotion
    segment.emotion_confidence = 1.0  # Manual correction = 100% confidence
    segment.emotion_corrected = True
    segment.emotion_corrected_at = utc_now()
    db.flush()

    # CRITICAL: If changing from one emotion to another, recalculate OLD emotion profile
    # to exclude this segment (like speaker identification does)
    # Do this whenever old_emotion exists, regardless of old_emotion_corrected status,
    # because reprocessing with personalized matching can set emotions without corrected=True
    if learn and old_emotion and old_emotion != corrected_emotion:
        old_result = await asyncio.to_thread(
            recalculate_emotion_profile, segment.speaker_id, old_emotion, db, engine
        )
        if old_result == "updated":
            logger.info(f"✓ Recalculated '{old_emotion}' profile (removed segment {segment_id})")
        elif old_result == "deleted":
            logger.info(f"⚠️ Deleted emotion profile '{old_emotion}' - no valid corrections remaining after removing segment {segment_id}")

    # Learn from correction if requested
    merge_msg = ""
    sample_count = 0
    voice_samples = 0
    if learn and emotion_embedding is not None:
        # Get or create emotion profile
        profile = db.query(SpeakerEmotionProfile).filter(
            SpeakerEmotionProfile.speaker_id == segment.speaker_id,
            SpeakerEmotionProfile.emotion_category == corrected_emotion
        ).first()

        if profile:
            # MERGE EMOTION embeddings (weighted average)
            existing_emb = profile.get_embedding()

            # Weighted average: existing embedding has more weight based on sample count
            weight = profile.sample_count / (profile.sample_count + 1)
            merged_emb = (existing_emb * weight) + (emotion_embedding * (1 - weight))

            profile.set_embedding(merged_emb)
            profile.sample_count += 1
            profile.updated_at = utc_now()

            sample_count = profile.sample_count
            logger.info(f"✓ Merged segment {segment_id} into '{corrected_emotion}' profile (now {sample_count} emotion samples)")
        else:
            # Create new profile
            profile = SpeakerEmotionProfile(
                speaker_id=segment.speaker_id,
                emotion_category=corrected_emotion,
                sample_count=1,
                voice_sample_count=0
            )
            profile.set_embedding(emotion_embedding)
            db.add(profile)

            sample_count = 1
            logger.info(f"✓ Created new '{corrected_emotion}' profile with segment {segment_id}")
        
        # NEW: Also merge VOICE embedding for this emotion (Detector 2 data)
        voice_emb = segment.get_speaker_embedding()
        if voice_emb is not None and not np.isnan(voice_emb).any():
            existing_voice_emb = profile.get_voice_embedding()

            if existing_voice_emb is not None and not np.isnan(existing_voice_emb).any():
                # Merge with existing voice profile for this emotion
                voice_weight = profile.voice_sample_count / (profile.voice_sample_count + 1)
                merged_voice = (existing_voice_emb * voice_weight) + (voice_emb * (1 - voice_weight))
                profile.set_voice_embedding(merged_voice)
                profile.voice_sample_count += 1
                logger.info(f"  → Also merged voice embedding (now {profile.voice_sample_count} voice samples)")
            else:
                # First voice sample for this emotion
                profile.set_voice_embedding(voice_emb)
                profile.voice_sample_count = 1
                logger.info(f"  → Added first voice sample for '{corrected_emotion}' profile")

            voice_samples = profile.voice_sample_count
            
            # Also update generic speaker profile (keeps it current)
            speaker = db.query(Speaker).filter(Speaker.id == segment.speaker_id).first()
            if speaker:
                existing_speaker_emb = speaker.get_embedding()
                # Get all non-misidentified segments for this speaker
                all_segments = db.query(ConversationSegment).filter(
                    ConversationSegment.speaker_id == speaker.id,
                    ConversationSegment.is_misidentified == False
                ).count()
                
                if all_segments > 0:
                    speaker_weight = (all_segments - 1) / all_segments
                    merged_speaker = (existing_speaker_emb * speaker_weight) + (voice_emb * (1 - speaker_weight))
                    speaker.set_embedding(merged_speaker)
        
        merge_msg = f" (emotion: {sample_count} samples, voice: {voice_samples} samples)"

    db.commit()
    db.refresh(segment)

    # Clear GPU cache
    engine.clear_gpu_cache()

    speaker = db.query(Speaker).filter(Speaker.id == segment.speaker_id).first()

    # Determine if this was a correction or confirmation
    is_confirmation = old_emotion == corrected_emotion
    action_msg = "confirmed" if is_confirmation else f"corrected from '{old_emotion}' to '{corrected_emotion}'"
    
    return {
        "message": f"Emotion {action_msg}{merge_msg}",
        "old_emotion": old_emotion,
        "new_emotion": corrected_emotion,
        "learned": learn,
        "sample_count": sample_count,
        "speaker_name": speaker.name if speaker else None
    }


@router.delete("/speakers/{speaker_id}/emotion-profiles")
async def reset_speaker_emotion_profiles(
    speaker_id: int,
    emotion_category: Optional[str] = Query(None, description="Specific emotion to reset (or all if not specified)"),
    db: Session = Depends(get_db)
):
    """
    Reset emotion profiles for a speaker.

    Args:
        emotion_category: If specified, only reset this emotion. If None, reset all emotions.

    Returns:
        Number of profiles deleted
    """
    speaker = db.query(Speaker).filter(Speaker.id == speaker_id).first()
    if not speaker:
        raise HTTPException(status_code=404, detail="Speaker not found")

    query = db.query(SpeakerEmotionProfile).filter(
        SpeakerEmotionProfile.speaker_id == speaker_id
    )

    if emotion_category:
        query = query.filter(SpeakerEmotionProfile.emotion_category == emotion_category)
        deleted = query.delete()
        db.commit()
        return {
            "message": f"Reset emotion profile '{emotion_category}' for speaker '{speaker.name}'",
            "speaker_name": speaker.name,
            "emotion_category": emotion_category,
            "deleted": deleted
        }
    else:
        deleted = query.delete()
        db.commit()
        return {
            "message": f"Reset all emotion profiles for speaker '{speaker.name}'",
            "speaker_name": speaker.name,
            "deleted": deleted
        }


@router.get("/speakers/{speaker_id}/emotion-threshold")
async def get_speaker_emotion_threshold(
    speaker_id: int,
    db: Session = Depends(get_db)
):
    """Get speaker's custom emotion threshold (or global default)"""
    speaker = db.query(Speaker).filter(Speaker.id == speaker_id).first()
    if not speaker:
        raise HTTPException(status_code=404, detail="Speaker not found")


    global_threshold = get_config().get_settings().emotion_threshold

    return {
        "speaker_id": speaker_id,
        "speaker_name": speaker.name,
        "custom_threshold": speaker.emotion_threshold,
        "effective_threshold": speaker.emotion_threshold or global_threshold,
        "using_global": speaker.emotion_threshold is None
    }


@router.patch("/speakers/{speaker_id}/emotion-threshold")
async def set_speaker_emotion_threshold(
    speaker_id: int,
    threshold: Optional[float] = Query(None, ge=0.3, le=1.0, description="Custom threshold (0.3-1.0) or null for global"),
    db: Session = Depends(get_db)
):
    """
    Set speaker's custom emotion threshold.

    Args:
        threshold: Custom threshold (0.3-1.0) or None to use global default
                  Higher = stricter matching (1.0 = perfect match required)

    Returns:
        Updated threshold settings
    """
    speaker = db.query(Speaker).filter(Speaker.id == speaker_id).first()
    if not speaker:
        raise HTTPException(status_code=404, detail="Speaker not found")

    speaker.emotion_threshold = threshold
    db.commit()


    global_threshold = get_config().get_settings().emotion_threshold

    return {
        "message": f"Updated emotion threshold for '{speaker.name}'",
        "speaker_name": speaker.name,
        "custom_threshold": threshold,
        "effective_threshold": threshold or global_threshold,
        "using_global": threshold is None
    }


@router.get("/speakers/{speaker_id}/emotion-profiles")
async def get_speaker_emotion_profiles(
    speaker_id: int,
    db: Session = Depends(get_db)
):
    """Get all emotion profiles for a speaker"""
    speaker = db.query(Speaker).filter(Speaker.id == speaker_id).first()
    if not speaker:
        raise HTTPException(status_code=404, detail="Speaker not found")

    profiles = db.query(SpeakerEmotionProfile).filter(
        SpeakerEmotionProfile.speaker_id == speaker_id
    ).all()

    return {
        "speaker_id": speaker_id,
        "speaker_name": speaker.name,
        "emotion_threshold": speaker.emotion_threshold,
        "profiles": [
            {
                "emotion_category": prof.emotion_category,
                "sample_count": prof.sample_count,
                "voice_sample_count": prof.voice_sample_count,
                "confidence_threshold": prof.confidence_threshold,
                "voice_threshold": prof.voice_threshold,
                "created_at": prof.created_at,
                "updated_at": prof.updated_at
            }
            for prof in profiles
        ]
    }




def _get_speaker_emotion_profile(speaker_id: int, emotion_category: str, db: Session) -> tuple:
    """Shared lookup for the two threshold endpoints."""
    speaker = db.query(Speaker).filter(Speaker.id == speaker_id).first()
    if not speaker:
        raise HTTPException(status_code=404, detail="Speaker not found")
    profile = db.query(SpeakerEmotionProfile).filter(
        SpeakerEmotionProfile.speaker_id == speaker_id,
        SpeakerEmotionProfile.emotion_category == emotion_category,
    ).first()
    if not profile:
        raise HTTPException(
            status_code=404,
            detail=f"Emotion profile '{emotion_category}' not found for speaker '{speaker.name}'. Create it by correcting an emotion first.",
        )
    return speaker, profile


@router.patch("/speakers/{speaker_id}/emotion-profiles/{emotion_category}/threshold")
async def set_emotion_profile_threshold(
    speaker_id: int,
    emotion_category: str,
    threshold: Optional[float] = Query(
        None, ge=0.3, le=1.0,
        description="Emotion-match threshold (0.3-1.0) or null to fall back to speaker/global"
    ),
    db: Session = Depends(get_db),
):
    """Set the per-emotion confidence threshold applied to emotion2vec matches."""
    speaker, profile = _get_speaker_emotion_profile(speaker_id, emotion_category, db)
    profile.confidence_threshold = threshold
    db.commit()
    return {
        "message": f"Updated {emotion_category} emotion threshold for '{speaker.name}'",
        "speaker_name": speaker.name,
        "emotion_category": emotion_category,
        "threshold": threshold,
    }


@router.patch("/speakers/{speaker_id}/emotion-profiles/{emotion_category}/voice-threshold")
async def set_emotion_profile_voice_threshold(
    speaker_id: int,
    emotion_category: str,
    threshold: Optional[float] = Query(
        None, ge=0.0, le=1.0,
        description="Voice-profile match threshold (0.0-1.0) or null to fall back to speaker/global"
    ),
    db: Session = Depends(get_db),
):
    """Set the per-emotion voice-profile threshold (Detector 2, 512-D pyannote embeddings)."""
    speaker, profile = _get_speaker_emotion_profile(speaker_id, emotion_category, db)
    profile.voice_threshold = threshold
    db.commit()
    return {
        "message": f"Updated {emotion_category} voice threshold for '{speaker.name}'",
        "speaker_name": speaker.name,
        "emotion_category": emotion_category,
        "voice_threshold": threshold,
    }


def format_seconds_to_timestamp(seconds: float) -> str:
    """Format float seconds to HH:MM:SS"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def format_seconds_to_srt_timestamp(seconds: float) -> str:
    """Format float seconds to SRT time format: HH:MM:SS,mmm"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds % 1) * 1000))
    if ms == 1000:
        s += 1
        ms = 0
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def format_seconds_to_vtt_timestamp(seconds: float) -> str:
    """Format float seconds to VTT time format: HH:MM:SS.mmm"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds % 1) * 1000))
    if ms == 1000:
        s += 1
        ms = 0
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


@router.get("/{conversation_id}/export")
async def export_conversation_transcript(
    conversation_id: int,
    format: str = Query("txt", enum=["txt", "srt", "vtt", "json", "markdown"]),
    db: Session = Depends(get_db)
):
    """Export conversation transcript in TXT, SRT, VTT, JSON, or Markdown format"""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    import re
    # Convert title to a safe filename
    safe_title = re.sub(r'[^\w\s-]', '', conversation.title or f"transcript_{conversation_id}")
    safe_title = safe_title.strip().replace(' ', '_')
    if not safe_title:
        safe_title = f"transcript_{conversation_id}"

    segments = db.query(ConversationSegment).filter(
        ConversationSegment.conversation_id == conversation_id
    ).order_by(ConversationSegment.start_offset.asc()).all()

    if format == "json":
        data = []
        for s in segments:
            data.append({
                "speaker": s.speaker_name or "Unknown",
                "start": s.start_offset,
                "end": s.end_offset,
                "text": s.text or ""
            })
        from fastapi.responses import JSONResponse
        return JSONResponse(
            content=data,
            headers={"Content-Disposition": f"attachment; filename={safe_title}.json"}
        )

    elif format == "txt":
        lines = []
        for s in segments:
            start_str = format_seconds_to_timestamp(s.start_offset)
            speaker = s.speaker_name or "Unknown"
            text = s.text or ""
            lines.append(f"[{start_str}] {speaker}: {text}")
        content = "\n".join(lines)
        from fastapi.responses import Response
        return Response(
            content=content,
            media_type="text/plain",
            headers={"Content-Disposition": f"attachment; filename={safe_title}.txt"}
        )

    elif format == "srt":
        lines = []
        for i, s in enumerate(segments, 1):
            start_srt = format_seconds_to_srt_timestamp(s.start_offset)
            end_srt = format_seconds_to_srt_timestamp(s.end_offset)
            speaker = s.speaker_name or "Unknown"
            text = s.text or ""
            lines.append(f"{i}\n{start_srt} --> {end_srt}\n[{speaker}] {text}\n")
        content = "\n".join(lines)
        from fastapi.responses import Response
        return Response(
            content=content,
            media_type="text/srt",
            headers={"Content-Disposition": f"attachment; filename={safe_title}.srt"}
        )

    elif format == "vtt":
        lines = ["WEBVTT\n"]
        for s in segments:
            start_vtt = format_seconds_to_vtt_timestamp(s.start_offset)
            end_vtt = format_seconds_to_vtt_timestamp(s.end_offset)
            speaker = s.speaker_name or "Unknown"
            text = s.text or ""
            lines.append(f"{start_vtt} --> {end_vtt}\n<{speaker}> {text}\n")
        content = "\n".join(lines)
        from fastapi.responses import Response
        return Response(
            content=content,
            media_type="text/vtt",
            headers={"Content-Disposition": f"attachment; filename={safe_title}.vtt"}
        )

    elif format == "markdown":
        import json as json_module
        participants = list(set(s.speaker_name for s in segments if s.speaker_name))
        tags_list = json_module.loads(conversation.tags) if conversation.tags else []
        
        md = '---\n'
        md += f'title: "{conversation.title or "transcript_" + str(conversation_id)}"\n'
        md += f'date: {conversation.start_time.strftime("%Y-%m-%d") if conversation.start_time else "unknown"}\n'
        md += f'category: {conversation.category or "outro"}\n'
        if participants:
            md += f'participants: {json_module.dumps(participants, ensure_ascii=False)}\n'
        if tags_list:
            md += f'tags: {json_module.dumps(tags_list, ensure_ascii=False)}\n'
        if conversation.duration:
            mins = int(conversation.duration // 60)
            md += f'duration: "{mins} min"\n'
        md += '---\n\n'
        
        # Add summary markdown directly (which contains Resumo, Ações, Notas, etc.)
        if conversation.summary:
            md += conversation.summary.strip() + "\n\n"
        
        # Add transcript grouped by speaker
        md += '## Transcrição\n\n'
        current_speaker = None
        for s in segments:
            speaker = s.speaker_name or 'Unknown'
            time_str = format_seconds_to_timestamp(s.start_offset)
            if speaker != current_speaker:
                md += f'\n**{speaker}** ({time_str})\n'
                current_speaker = speaker
            md += f'> {s.text or ""}\n'
            
        from fastapi.responses import Response
        return Response(
            content=md,
            media_type="text/markdown",
            headers={"Content-Disposition": f"attachment; filename={safe_title}.md"}
        )

