"""Directory watcher service to monitor a folder and process new audios periodically."""
import os
import shutil
import logging
import asyncio
import traceback
from datetime import timedelta

from .database import utc_now
from .models import Conversation, ConversationSegment
from .services import data_path, load_known_speakers, create_segment_from_result, auto_summarize_and_export
from .config import get_config

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {'.wav', '.mp3', '.m4a', '.flac', '.ogg', '.webm'}


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


async def scan_and_process_watched_directory(db, engine):
    """Scan and process files in settings.watch_directory"""
    config = get_config()
    settings = config.get_settings()
    
    watch_dir = getattr(settings, 'watch_directory', '')
    if not watch_dir or not os.path.exists(watch_dir):
        logger.info("Directory Watcher: watch_directory is not set or does not exist. Skipping scan.")
        return

    logger.info(f"📁 Directory Watcher: Scanning '{watch_dir}' for audio files...")

    # Create processed and failed subdirectories
    processed_dir = os.path.join(watch_dir, "processed")
    failed_dir = os.path.join(watch_dir, "failed")
    os.makedirs(processed_dir, exist_ok=True)
    os.makedirs(failed_dir, exist_ok=True)

    # List all files in the watch directory
    files = [
        f for f in os.listdir(watch_dir)
        if os.path.isfile(os.path.join(watch_dir, f))
    ]

    processed_count = 0
    for filename in files:
        file_path = os.path.join(watch_dir, filename)
        _, ext = os.path.splitext(filename.lower())
        
        if ext not in SUPPORTED_EXTENSIONS:
            continue

        logger.info(f"🔍 Directory Watcher: Found new file '{filename}' to process.")
        
        # Get file owner on Linux
        user_identity = "linux_user"
        try:
            import pwd
            st = os.stat(file_path)
            user_identity = pwd.getpwuid(st.st_uid).pw_name
        except Exception:
            pass

        # Prepare recordings path
        recordings_dir = os.path.join(data_path(), "recordings")
        os.makedirs(recordings_dir, exist_ok=True)
        timestamp = utc_now().strftime("%Y%m%d_%H%M%S")
        temp_filename = f"watched_{timestamp}_{filename}"
        temp_path = os.path.join(recordings_dir, temp_filename)

        # Copy file to recordings path
        try:
            shutil.copy(file_path, temp_path)
        except Exception as e:
            logger.error(f"Directory Watcher: Failed to copy file '{filename}': {e}")
            shutil.move(file_path, os.path.join(failed_dir, filename))
            continue

        # Convert to WAV if needed
        if not temp_path.lower().endswith('.wav'):
            wav_filename = temp_filename.rsplit('.', 1)[0] + '.wav'
            file_path_wav = os.path.join(recordings_dir, wav_filename)
            try:
                await asyncio.to_thread(_convert_audio, temp_path, file_path_wav)
                if os.path.exists(temp_path):
                    os.remove(temp_path)
            except Exception as e:
                logger.error(f"Directory Watcher: Failed to convert '{filename}' to WAV: {e}")
                shutil.move(file_path, os.path.join(failed_dir, filename))
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                continue
        else:
            file_path_wav = temp_path

        # Create conversation entry
        start_time = utc_now()
        conversation = Conversation(
            title=f"Auto: {filename}",
            audio_path=file_path_wav,
            start_time=start_time,
            status="processing",
            uploaded_by=user_identity,
            category="outro" # default category
        )
        db.add(conversation)
        db.commit()
        db.refresh(conversation)

        try:
            known_speakers = load_known_speakers(db)
            threshold = settings.speaker_threshold

            # Process audio
            result = await asyncio.to_thread(
                engine.transcribe_with_diarization,
                file_path_wav,
                known_speakers,
                threshold=threshold,
                db_session=db
            )

            for seg in result["segments"]:
                create_segment_from_result(
                    seg=seg,
                    conversation_id=conversation.id,
                    conv_start=start_time,
                    db=db,
                    threshold=threshold,
                )

            # Update conversation metadata
            conversation.status = "completed"
            conversation.num_segments = len(result["segments"])
            conversation.num_speakers = result["num_speakers"]
            if result["segments"]:
                conversation.duration = max(s["end"] for s in result["segments"])
                conversation.end_time = start_time + timedelta(seconds=conversation.duration)

            db.commit()
            db.refresh(conversation)

            # Clear GPU cache
            engine.clear_gpu_cache()

            # Auto summarize and export markdown note
            await auto_summarize_and_export(conversation.id, db)

            # Move source file to processed folder
            shutil.move(file_path, os.path.join(processed_dir, filename))
            logger.info(f"✓ Directory Watcher: Successfully processed '{filename}'")
            processed_count += 1

        except Exception as e:
            logger.error(f"❌ Directory Watcher: Failed to process '{filename}': {e}")
            traceback.print_exc()
            db.rollback()
            
            # Set status to failed
            failed_conv = db.query(Conversation).filter(Conversation.id == conversation.id).first()
            if failed_conv:
                failed_conv.status = "failed"
                db.commit()

            # Move source file to failed folder
            if os.path.exists(file_path):
                shutil.move(file_path, os.path.join(failed_dir, filename))

    logger.info(f"📁 Directory Watcher: Processed {processed_count} new file(s).")


async def start_directory_watcher_task():
    """Background loop running every 3 hours to scan and process directory"""
    logger.info("Starting Directory Watcher background service loop...")
    from .database import SessionLocal
    from .api import get_engine
    
    # Wait a few seconds for startup to settle
    await asyncio.sleep(10)
    
    while True:
        db = SessionLocal()
        try:
            engine = get_engine()
            await scan_and_process_watched_directory(db, engine)
        except Exception as e:
            logger.error(f"Error in directory watcher execution cycle: {e}")
        finally:
            db.close()
            
        # Sleep for 3 hours (3 * 3600 seconds)
        await asyncio.sleep(3 * 3600)
