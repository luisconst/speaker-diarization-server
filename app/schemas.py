from pydantic import BaseModel, field_validator
from typing import List, Optional
from datetime import datetime
import json

class SpeakerBase(BaseModel):
    name: str

class SpeakerResponse(SpeakerBase):
    id: int
    created_at: datetime
    updated_at: datetime
    segment_count: int = 0  # Number of segments this speaker has

    class Config:
        from_attributes = True

class SpeakerRename(BaseModel):
    new_name: str

class StatusResponse(BaseModel):
    status: str
    message: str
    gpu_available: bool
    device: str
    gpu_vram_allocated_gb: Optional[float] = None
    gpu_vram_total_gb: Optional[float] = None



# Conversation Schemas
class Word(BaseModel):
    """Word-level transcription data. Fields are Optional so that legacy rows
    (pre-word-probability schema) still deserialize without raising."""
    word: Optional[str] = None
    start: Optional[float] = None
    end: Optional[float] = None
    probability: Optional[float] = None

class ConversationSegmentResponse(BaseModel):
    id: int
    conversation_id: Optional[int] = None
    speaker_id: Optional[int] = None
    speaker_name: Optional[str] = None
    text: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    start_offset: Optional[float] = None
    end_offset: Optional[float] = None
    confidence: Optional[float] = None
    emotion_category: Optional[str] = None
    emotion_confidence: Optional[float] = None
    emotion_corrected: bool = False
    emotion_corrected_at: Optional[datetime] = None
    emotion_misidentified: bool = False
    detector_breakdown: Optional[dict] = None  # JSON field for detector breakdown
    words: Optional[List[Word]] = None
    avg_logprob: Optional[float] = None
    is_misidentified: bool = False


    @field_validator('detector_breakdown', mode='before')
    @classmethod
    def parse_detector_breakdown(cls, v):
        """Parse JSON string to dict if needed"""
        if v is None:
            return None
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return None
        return v

    @field_validator('words', mode='before')
    @classmethod
    def parse_words(cls, v):
        """Parse JSON string words_data to List[Word] if needed"""
        if v is None:
            return None
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return None
        return v

    class Config:
        from_attributes = True


class ConversationListItem(BaseModel):
    """Lightweight conversation summary for list views (no segments)"""
    id: int
    title: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration: Optional[float] = None
    status: Optional[str] = None
    audio_format: Optional[str] = "wav"
    num_segments: Optional[int] = 0
    num_speakers: Optional[int] = 0
    uploaded_by: Optional[str] = None

    class Config:
        from_attributes = True


class ConversationsListResponse(BaseModel):
    """Response for list conversations endpoint with pagination"""
    conversations: List[ConversationListItem]
    total: int
    skip: int
    limit: int


class ConversationResponse(BaseModel):
    """Full conversation details with all segments"""
    id: int
    title: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration: Optional[float] = None
    status: Optional[str] = None
    audio_format: Optional[str] = "wav"
    num_segments: Optional[int] = 0
    num_speakers: Optional[int] = 0
    uploaded_by: Optional[str] = None
    transcript_segments: List[ConversationSegmentResponse] = []

    class Config:
        from_attributes = True


class ConversationUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None


class IdentifySpeakerRequest(BaseModel):
    speaker_id: Optional[int] = None
    speaker_name: Optional[str] = None
    enroll: bool = True


class ToggleMisidentifiedRequest(BaseModel):
    is_misidentified: bool


class SegmentTextUpdate(BaseModel):
    text: str
