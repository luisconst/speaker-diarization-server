import api from '../api.js';

export default {
    async render() {
        return `
            <div class="content-card" style="max-width: 800px;">
                <div class="card-header">
                    <h2>Voice & Emotion Recognition Tuning</h2>
                </div>
                <div class="form-group" style="margin-bottom: 25px;">
                    <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 8px; padding: 16px;">
                        <h3 style="font-family: var(--font-heading); font-size: 1.1rem; margin-bottom: 6px;">Runtime Parameters</h3>
                        <p style="color: var(--text-muted); font-size: 0.85rem; line-height: 1.4;">
                            These values are applied immediately to all new uploads and WebSocket audio sessions. Existing processed segments are not altered unless you trigger a Reprocess.
                        </p>
                    </div>
                </div>

                <div class="form-row">
                    <!-- Speaker Threshold -->
                    <div class="form-group">
                        <label style="display: flex; justify-content: space-between;">
                            <span>Speaker Similarity Threshold (SPEAKER_THRESHOLD)</span>
                            <span id="val-speaker-threshold" style="color: var(--primary); font-weight: 600;">0.30</span>
                        </label>
                        <input type="range" id="speaker_threshold" class="form-control" min="0.1" max="0.9" step="0.05" style="padding: 0; height: auto;" />
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Lower = stricter matching. 0.30 is standard. 0.20 is stricter (movie audio).</span>
                    </div>

                    <!-- Emotion Threshold -->
                    <div class="form-group">
                        <label style="display: flex; justify-content: space-between;">
                            <span>Global Emotion Confidence Threshold (EMOTION_THRESHOLD)</span>
                            <span id="val-emotion-threshold" style="color: var(--primary); font-weight: 600;">0.60</span>
                        </label>
                        <input type="range" id="emotion_threshold" class="form-control" min="0.1" max="1.0" step="0.05" style="padding: 0; height: auto;" />
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Minimum confidence before assigning custom speaker emotions. Standard is 0.60.</span>
                    </div>
                </div>

                <div class="form-row">
                    <!-- Context Padding -->
                    <div class="form-group">
                        <label for="context_padding">Context Padding (Seconds)</label>
                        <input type="number" id="context_padding" class="form-control" step="0.05" min="0.0" max="1.0" />
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Audio window padding around segment boundaries for embedding models. Default is 0.15.</span>
                    </div>

                    <!-- Silence Duration -->
                    <div class="form-group">
                        <label for="silence_duration">VAD Silence Duration (Seconds)</label>
                        <input type="number" id="silence_duration" class="form-control" step="0.1" min="0.2" max="3.0" />
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Live Streaming: seconds of continuous silence before pushing a segment. Default is 0.5.</span>
                    </div>
                </div>

                <div class="form-row">
                    <!-- Whisper Model -->
                    <div class="form-group">
                        <label for="whisper_model">Whisper Model Size</label>
                        <select id="whisper_model" class="form-control">
                            <option value="tiny.en">Tiny English Only (~400MB VRAM)</option>
                            <option value="tiny">Tiny Multilingual (~400MB VRAM)</option>
                            <option value="base.en">Base English Only (~500MB VRAM)</option>
                            <option value="base">Base Multilingual (~500MB VRAM)</option>
                            <option value="small.en">Small English Only (~1GB VRAM)</option>
                            <option value="small">Small Multilingual (~1GB VRAM)</option>
                            <option value="medium.en">Medium English Only (~2GB VRAM)</option>
                            <option value="medium">Medium Multilingual (~2GB VRAM)</option>
                            <option value="large-v3-turbo">Large V3 Turbo (Recommended, ~1.5GB VRAM)</option>
                            <option value="large-v3">Large V3 (Most accurate, ~3GB VRAM)</option>
                        </select>
                    </div>

                    <!-- Whisper Language -->
                    <div class="form-group">
                        <label for="whisper_language">Transcription Language</label>
                        <select id="whisper_language" class="form-control">
                            <option value="auto">Auto-Detect Language</option>
                            <option value="en">English (en)</option>
                            <option value="pt">Portuguese (pt)</option>
                            <option value="es">Spanish (es)</option>
                            <option value="fr">French (fr)</option>
                            <option value="de">German (de)</option>
                            <option value="it">Italian (it)</option>
                            <option value="zh">Chinese (zh)</option>
                        </select>
                    </div>
                </div>

                <div class="form-row">
                    <!-- Emotion Model -->
                    <div class="form-group">
                        <label for="emotion_model">Emotion Recognition Model</label>
                        <input type="text" id="emotion_model" class="form-control" readonly style="opacity: 0.65; cursor: not-allowed;" />
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Preloaded FunASR/emotion2vec variant. Pinned in server startup configuration.</span>
                    </div>

                    <!-- VRAM Threshold -->
                    <div class="form-group">
                        <label for="cleanup_vram_threshold_gb">GPU Memory Clean Threshold (GB)</label>
                        <input type="number" id="cleanup_vram_threshold_gb" class="form-control" min="2" max="64" />
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Aggressive VRAM garbage collection starts if PyTorch allocations exceed this. Default: 12.</span>
                    </div>
                </div>

                <div class="form-group" style="margin-top: 10px;">
                    <label class="checkbox-control">
                        <input type="checkbox" id="filter_hallucinations" />
                        <span>Filter Whisper Hallucinations (removes typical filler sentences like "Thank you.", etc.)</span>
                    </label>
                </div>

                <div class="form-group">
                    <label class="checkbox-control">
                        <input type="checkbox" id="enable_personalized_emotions" />
                        <span>Enable Personalized Emotion Classifier (uses per-speaker profiles after &ge; 3 corrections)</span>
                    </label>
                </div>

                <div class="form-group">
                    <label class="checkbox-control">
                        <input type="checkbox" id="offline_mode" />
                        <span>Offline Mode (never access HuggingFace hub; force cache-only model loads)</span>
                    </label>
                </div>

                <div style="display: flex; justify-content: space-between; margin-top: 30px; padding-top: 15px; border-top: 1px solid var(--card-border);">
                    <button class="btn btn-secondary" id="btn-reset-settings">Reset to Default</button>
                    <button class="btn btn-primary" id="btn-save-settings">Save Configurations</button>
                </div>
            </div>

            <div class="content-card" style="max-width: 800px; margin-top: 24px;">
                <div class="card-header">
                    <h2>Bulk Rematch Speakers</h2>
                </div>
                <div style="padding: 20px;">
                    <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 20px; line-height: 1.5;">
                        This utility scans all conversations in the database and compares all segments currently assigned to <strong>Unknown_*</strong> speakers against your trained/named speaker profiles. If a segment's voice embedding matches a trained speaker, it is automatically re-assigned. 
                        <br><strong style="color: var(--accent);">This is computed mathematically using stored embeddings and takes only a few seconds. No audio files are reprocessed.</strong>
                    </p>
                    <button class="btn btn-primary" id="btn-global-rematch">
                        <i data-lucide="user-check" style="width: 16px; height: 16px; margin-right: 6px; display: inline-block; vertical-align: middle;"></i> Rematch All Conversations
                    </button>
                </div>
            </div>
        `;
    },

    async init() {
        this.setupSliders();
        this.setupRematchListener();
        await this.loadSettings();
    },

    setupSliders() {
        const speakSlider = document.getElementById('speaker_threshold');
        const speakLabel = document.getElementById('val-speaker-threshold');
        const emoSlider = document.getElementById('emotion_threshold');
        const emoLabel = document.getElementById('val-emotion-threshold');

        if (speakSlider && speakLabel) {
            speakSlider.addEventListener('input', (e) => {
                speakLabel.textContent = parseFloat(e.target.value).toFixed(2);
            });
        }

        if (emoSlider && emoLabel) {
            emoSlider.addEventListener('input', (e) => {
                emoLabel.textContent = parseFloat(e.target.value).toFixed(2);
            });
        }

        // Save and reset listeners
        const btnSave = document.getElementById('btn-save-settings');
        const btnReset = document.getElementById('btn-reset-settings');

        if (btnSave) btnSave.addEventListener('click', () => this.saveSettings());
        if (btnReset) {
            btnReset.addEventListener('click', async () => {
                if (confirm('Are you sure you want to reset all configurations to their default server presets?')) {
                    try {
                        btnReset.disabled = true;
                        window.showToast('Resetting settings...', 'warning');
                        const defaultSettings = await api.resetSettings();
                        this.populateForm(defaultSettings);
                        window.showToast('Configurations reset to server defaults.', 'success');
                    } catch (e) {
                        window.showToast(`Reset failed: ${e.message}`, 'danger');
                    } finally {
                        btnReset.disabled = false;
                    }
                }
            });
        }
    },

    async loadSettings() {
        try {
            const settings = await api.getSettings();
            this.populateForm(settings);
        } catch (e) {
            console.error('Failed to load system settings:', e);
            window.showToast('Failed to load system settings.', 'danger');
        }
    },

    populateForm(settings) {
        const fields = [
            'speaker_threshold', 'emotion_threshold', 'context_padding',
            'silence_duration', 'whisper_model', 'whisper_language',
            'emotion_model', 'cleanup_vram_threshold_gb'
        ];

        // Populate text inputs/dropdowns
        fields.forEach(field => {
            const el = document.getElementById(field);
            if (el && settings[field] !== undefined && settings[field] !== null) {
                el.value = settings[field];
            }
        });

        // Set slider indicator values
        const speakLabel = document.getElementById('val-speaker-threshold');
        if (speakLabel && settings.speaker_threshold) {
            speakLabel.textContent = parseFloat(settings.speaker_threshold).toFixed(2);
        }
        const emoLabel = document.getElementById('val-emotion-threshold');
        if (emoLabel && settings.emotion_threshold) {
            emoLabel.textContent = parseFloat(settings.emotion_threshold).toFixed(2);
        }

        // Populate checkboxes
        const checkboxes = ['filter_hallucinations', 'enable_personalized_emotions', 'offline_mode'];
        checkboxes.forEach(field => {
            const el = document.getElementById(field);
            if (el && settings[field] !== undefined) {
                el.checked = settings[field];
            }
        });
    },

    async saveSettings() {
        const fields = [
            'speaker_threshold', 'emotion_threshold', 'context_padding',
            'silence_duration', 'whisper_model', 'whisper_language',
            'cleanup_vram_threshold_gb'
        ];

        const checkboxes = ['filter_hallucinations', 'enable_personalized_emotions', 'offline_mode'];

        const payload = {};
        
        // Grab values
        fields.forEach(field => {
            const el = document.getElementById(field);
            if (el) {
                // Parse float/ints if numerical
                if (field === 'speaker_threshold' || field === 'emotion_threshold' || field === 'context_padding' || field === 'silence_duration') {
                    payload[field] = parseFloat(el.value);
                } else if (field === 'cleanup_vram_threshold_gb') {
                    payload[field] = parseInt(el.value);
                } else {
                    payload[field] = el.value;
                }
            }
        });

        checkboxes.forEach(field => {
            const el = document.getElementById(field);
            if (el) {
                payload[field] = el.checked;
            }
        });

    setupRematchListener() {
        const btnGlobalRematch = document.getElementById('btn-global-rematch');
        if (btnGlobalRematch) {
            btnGlobalRematch.addEventListener('click', async () => {
                if (confirm('Are you sure you want to run a global rematch across all conversations? This will link all Unknown voices to your trained profiles where possible.')) {
                    try {
                        btnGlobalRematch.disabled = true;
                        const originalHtml = btnGlobalRematch.innerHTML;
                        btnGlobalRematch.innerHTML = '<i data-lucide="loader-2" class="spinner-icon animate-spin" style="width: 14px; height: 14px; margin-right: 6px; display: inline-block; vertical-align: middle;"></i> Rematching...';
                        lucide.createIcons();
                        
                        window.showToast('Global speaker rematch started...', 'warning');
                        const res = await api.rematchSpeakersGlobally();
                        window.showToast(res.message, 'success');
                        
                        btnGlobalRematch.innerHTML = originalHtml;
                        lucide.createIcons();
                    } catch (e) {
                        window.showToast(`Global rematch failed: ${e.message}`, 'danger');
                    } finally {
                        btnGlobalRematch.disabled = false;
                    }
                }
            });
        }
    },

    async saveSettings() {
        const fields = [
            'speaker_threshold', 'emotion_threshold', 'context_padding',
            'silence_duration', 'whisper_model', 'whisper_language',
            'cleanup_vram_threshold_gb'
        ];

        const checkboxes = ['filter_hallucinations', 'enable_personalized_emotions', 'offline_mode'];

        const payload = {};
        
        // Grab values
        fields.forEach(field => {
            const el = document.getElementById(field);
            if (el) {
                // Parse float/ints if numerical
                if (field === 'speaker_threshold' || field === 'emotion_threshold' || field === 'context_padding' || field === 'silence_duration') {
                    payload[field] = parseFloat(el.value);
                } else if (field === 'cleanup_vram_threshold_gb') {
                    payload[field] = parseInt(el.value);
                } else {
                    payload[field] = el.value;
                }
            }
        });

        checkboxes.forEach(field => {
            const el = document.getElementById(field);
            if (el) {
                payload[field] = el.checked;
            }
        });

        try {
            const btnSave = document.getElementById('btn-save-settings');
            if (btnSave) btnSave.disabled = true;
            window.showToast('Saving settings...', 'warning');
            
            const updated = await api.saveSettings(payload);
            this.populateForm(updated);
            window.showToast('System settings saved and applied successfully.', 'success');
        } catch (e) {
            window.showToast(`Failed to save settings: ${e.message}`, 'danger');
        } finally {
            const btnSave = document.getElementById('btn-save-settings');
            if (btnSave) btnSave.disabled = false;
        }
    }
};
