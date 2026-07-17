"""
Configuration management for voice settings.
Supports runtime updates and persistence.
"""
import os
import json
import logging
from typing import Dict, Any, Callable, Tuple, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


def _as_bool(value: str) -> bool:
    return value.lower() == "true"


# (setting_name, env_var, parser). Declarative so adding a new tunable
# requires one line instead of a copy-paste if-block.
_ENV_OVERRIDES: Tuple[Tuple[str, str, Callable[[str], Any]], ...] = (
    ("speaker_threshold", "SPEAKER_THRESHOLD", float),
    ("context_padding", "CONTEXT_PADDING", float),
    ("silence_duration", "SILENCE_DURATION", float),
    ("filter_hallucinations", "FILTER_HALLUCINATIONS", _as_bool),
    ("emotion_threshold", "EMOTION_THRESHOLD", float),
    ("whisper_model", "WHISPER_MODEL", str),
    ("whisper_language", "WHISPER_LANGUAGE", str),
    ("enable_personalized_emotions", "ENABLE_PERSONALIZED_EMOTIONS", _as_bool),
    ("offline_mode", "OFFLINE_MODE", _as_bool),
    ("cleanup_vram_threshold_gb", "CLEANUP_VRAM_THRESHOLD_GB", int),
    ("ollama_url", "OLLAMA_URL", str),
    ("ollama_model", "OLLAMA_MODEL", str),
    ("watch_directory", "WATCH_DIRECTORY", str),
    ("export_directory", "EXPORT_DIRECTORY", str),
    ("auto_summarize", "AUTO_SUMMARIZE", _as_bool),
)


class VoiceSettings(BaseModel):
    """Voice processing settings"""
    speaker_threshold: float = Field(default=0.70, ge=0.1, le=0.9, description="Speaker similarity threshold (0.1-0.9)")
    context_padding: float = Field(default=0.15, ge=0.05, le=2.0, description="Context padding for embeddings (seconds)")
    silence_duration: float = Field(default=0.5, ge=0.1, le=5.0, description="Silence duration for streaming (seconds)")
    filter_hallucinations: bool = Field(default=True, description="Filter common Whisper hallucinations")
    emotion_threshold: float = Field(default=0.6, ge=0.3, le=1.0, description="Global emotion matching threshold (0.3-1.0)")
    whisper_model: str = Field(default="large-v3-turbo", description="Whisper model name")
    whisper_language: str = Field(default="en", description="Whisper transcription language")
    enable_personalized_emotions: bool = Field(default=True, description="Enable personalized emotion matching")
    offline_mode: bool = Field(default=False, description="Run in offline mode using cache only")
    cleanup_vram_threshold_gb: int = Field(default=12, ge=2, le=64, description="VRAM threshold for cleanup (GB)")
    # LLM / Summarization
    ollama_url: str = Field(default="http://localhost:11434", description="Ollama API URL")
    ollama_model: str = Field(default="llama3", description="Ollama model name for summarization")
    custom_prompts: Optional[str] = Field(default=None, description="JSON string of custom prompts per category")
    # Directory watcher
    watch_directory: str = Field(default="", description="Directory to watch for new audio files")
    export_directory: str = Field(default="", description="Directory to export markdown files")
    auto_summarize: bool = Field(default=False, description="Automatically summarize new conversations")
    # Markdown export format (Obsidian-compatible)
    md_exclude_unknowns: bool = Field(default=True, description="Exclude Unknown_* speakers from participants list")
    md_participant_template: str = Field(default="{name}", description="Template for participant entries. Use {name} for speaker name. E.g. [[08 People/{name}]]")
    md_frontmatter_map: Optional[str] = Field(default=None, description="JSON string mapping default property names to custom names. E.g. {\"title\":\"titulo\",\"participants\":\"participantes\"}")
    md_transcript_header: str = Field(default="Transcrição", description="Section header for the transcript block")
    md_speaker_format: str = Field(default="**{name}** ({time})", description="Template for speaker headers. Use {name} and {time}")
    md_custom_properties: Optional[str] = Field(default=None, description="JSON string of extra frontmatter key-value pairs. E.g. {\"type\":\"meeting-note\",\"project\":\"[[Projects/MyProject]]\"}")



class ConfigManager:
    """
    Manages application configuration with runtime updates.
    Settings are loaded from:
    1. Config file (if exists)
    2. Environment variables (override file values)
    3. VoiceSettings defaults (fallback)
    """

    def __init__(self, config_file: str = "data/config.json"):
        self.config_file = config_file
        self._settings: VoiceSettings = self._load_settings()

    def _load_settings(self) -> VoiceSettings:
        """Load settings from file, apply env overrides, fall back to defaults."""
        settings_dict: Dict[str, Any] = {}

        if os.path.exists(self.config_file):
            try:
                with open(self.config_file, 'r') as f:
                    settings_dict = json.load(f)
            except Exception as e:
                logger.warning(f"Could not load config file: {e}")

        for name, env_var, parser in _ENV_OVERRIDES:
            raw = os.getenv(env_var)
            if raw:
                settings_dict[name] = parser(raw)

        return VoiceSettings(**settings_dict)

    def get_settings(self) -> VoiceSettings:
        """Get current settings"""
        return self._settings

    def reload_settings(self) -> VoiceSettings:
        """Reload settings from config file (call after external updates)"""
        self._settings = self._load_settings()
        return self._settings

    def update_settings(self, updates: Dict[str, Any]) -> VoiceSettings:
        """
        Update settings at runtime and persist to file.
        Returns updated settings.
        """
        # Update settings object
        current = self._settings.model_dump()
        current.update(updates)
        self._settings = VoiceSettings(**current)

        # Persist to file
        self._save_settings()

        return self._settings

    def _save_settings(self):
        """Save settings to config file atomically (tempfile + os.replace)."""
        target_dir = os.path.dirname(self.config_file) or "."
        os.makedirs(target_dir, exist_ok=True)
        tmp_path = f"{self.config_file}.tmp"
        with open(tmp_path, 'w') as f:
            json.dump(self._settings.model_dump(), f, indent=2)
        os.replace(tmp_path, self.config_file)


# Global config manager instance
config_manager = ConfigManager()


def get_config() -> ConfigManager:
    """Get the global config manager instance"""
    return config_manager
