from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional, List
import os
import shutil
import asyncio
import logging
from datetime import datetime, timedelta

from .database import get_db, utc_now
from .models import Conversation, ConversationSegment
from .services import data_path, load_known_speakers, create_segment_from_result, auto_summarize_and_export

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent", tags=["Agent API"])


def _convert_audio(src_path: str, dest_path: str):
    """Convert audio to mono WAV using ffmpeg"""
    import subprocess
    cmd = [
        "ffmpeg", "-y", "-i", src_path,
        "-ac", "1", "-ar", "16000", "-vn", dest_path
    ]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except Exception as e:
        logger.error(f"FFmpeg conversion error: {e}")
        raise e


def _background_agent_process(conversation_id: int):
    from .database import SessionLocal
    from .api import get_engine
    
    db = SessionLocal()
    try:
        conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conversation:
            return
            
        logger.info(f"🔄 Starting background agent processing for conversation {conversation_id}...")
        engine = get_engine()
        known_speakers = load_known_speakers(db)
        
        from .config import get_config
        config = get_config()
        settings = config.get_settings()
        threshold = settings.speaker_threshold
        
        result = engine.transcribe_with_diarization(
            conversation.audio_path,
            known_speakers,
            threshold=threshold,
            db_session=db
        )
        
        for seg in result["segments"]:
            create_segment_from_result(
                seg=seg,
                conversation_id=conversation.id,
                conv_start=conversation.start_time,
                db=db,
                threshold=threshold
            )
            
        conversation.status = "completed"
        conversation.num_segments = len(result["segments"])
        conversation.num_speakers = result["num_speakers"]
        if result["segments"]:
            conversation.duration = max(s["end"] for s in result["segments"])
            conversation.end_time = conversation.start_time + timedelta(seconds=conversation.duration)
            
        db.commit()
        
        # Clear GPU cache
        engine.clear_gpu_cache()
        logger.info(f"✓ Background agent processing completed for conversation {conversation_id}")
        
        # Auto-summarize and export markdown
        import asyncio
        asyncio.run(auto_summarize_and_export(conversation.id, db))
        
    except Exception as e:
        logger.error(f"❌ Background agent process failed for conversation {conversation_id}: {e}")
        db.rollback()
        failed = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if failed:
            failed.status = "failed"
            db.commit()
    finally:
        db.close()


@router.post("/upload")
async def agent_upload_audio(
    background_tasks: BackgroundTasks,
    audio_file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    category: Optional[str] = Form("outro"),
    tags: Optional[str] = Form(None),  # JSON string of tags list
    uploaded_by: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Agent endpoint to upload audio with metadata for processing.
    """
    user_identity = uploaded_by or "agent"
    
    # Save audio file
    recordings_dir = os.path.join(data_path(), "recordings")
    os.makedirs(recordings_dir, exist_ok=True)
    timestamp = utc_now().strftime("%Y%m%d_%H%M%S")
    
    base_filename = os.path.basename(audio_file.filename or "upload")
    temp_filename = f"agent_{timestamp}_{base_filename}"
    temp_path = os.path.join(recordings_dir, temp_filename)
    
    def _stream_upload():
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(audio_file.file, buffer)
    await asyncio.to_thread(_stream_upload)
    
    # Convert to WAV if needed
    if not temp_path.lower().endswith('.wav'):
        wav_filename = temp_filename.rsplit('.', 1)[0] + '.wav'
        file_path = os.path.join(recordings_dir, wav_filename)
        try:
            await asyncio.to_thread(_convert_audio, temp_path, file_path)
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception as e:
            logger.warning(f"Failed to convert agent upload to WAV: {e}")
            file_path = temp_path
    else:
        file_path = temp_path

    # Create conversation entry
    start_time = utc_now()
    conversation = Conversation(
        title=title or f"Agent: {audio_file.filename}",
        audio_path=file_path,
        start_time=start_time,
        status="processing",
        uploaded_by=user_identity,
        category=category,
        tags=tags
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    # Queue background task
    background_tasks.add_task(_background_agent_process, conversation.id)
    
    return {
        "message": "Audio upload successful, processing started in background",
        "conversation_id": conversation.id,
        "status": "processing"
    }


@router.get("/conversation/{conversation_id}/markdown")
async def get_agent_markdown(conversation_id: int, db: Session = Depends(get_db)):
    """Retrieve markdown representation of a conversation"""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    import json as json_module
    from fastapi.responses import Response
    from .conversation_api import format_seconds_to_timestamp
    
    segments = db.query(ConversationSegment).filter(
        ConversationSegment.conversation_id == conversation_id
    ).order_by(ConversationSegment.start_offset.asc()).all()
    
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
    
    if conversation.summary:
        md += conversation.summary.strip() + "\n\n"
        
    md += '## Transcrição\n\n'
    current_speaker = None
    for s in segments:
        speaker = s.speaker_name or 'Unknown'
        time_str = format_seconds_to_timestamp(s.start_offset)
        if speaker != current_speaker:
            md += f'\n**{speaker}** ({time_str})\n'
            current_speaker = speaker
        md += f'> {s.text or ""}\n'
        
    return Response(content=md, media_type="text/markdown")


@router.get("/conversation/{conversation_id}/status")
async def get_agent_conversation_status(conversation_id: int, db: Session = Depends(get_db)):
    """Get the current processing status of a conversation"""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {
        "conversation_id": conversation.id,
        "status": conversation.status,
        "has_summary": conversation.summary is not None,
        "num_segments": conversation.num_segments
    }
