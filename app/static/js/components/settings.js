import api from '../api.js';

export default {
    async render() {
        return `
            <div class="settings-tabs-container" style="display: flex; gap: 10px; margin-bottom: 24px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 12px; max-width: 800px;">
                <button class="btn tab-btn btn-primary" data-tab="tab-voice" style="padding: 8px 16px; font-size: 0.9rem; font-weight: 600; border-radius: 8px; cursor: pointer; transition: all 0.2s;">Voice & Emotion Tuning</button>
                <button class="btn tab-btn btn-secondary" data-tab="tab-ai" style="padding: 8px 16px; font-size: 0.9rem; font-weight: 600; border-radius: 8px; cursor: pointer; transition: all 0.2s;">Markdown & AI Prompts</button>
            </div>

            <!-- Tab 1: Voice & Emotion Tuning -->
            <div id="tab-voice" class="settings-tab-content" style="max-width: 800px; display: block;">
                <div class="content-card">
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

                <div class="content-card" style="margin-top: 24px;">
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
            </div>

            <!-- Tab 2: Markdown & AI Prompts -->
            <div id="tab-ai" class="settings-tab-content" style="max-width: 800px; display: none;">
                <div class="content-card">
                    <div class="card-header">
                        <h2>Directory Monitoring & LLM Integration</h2>
                    </div>
                    <div class="form-group" style="margin-bottom: 25px;">
                        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 8px; padding: 16px;">
                            <h3 style="font-family: var(--font-heading); font-size: 1.1rem; margin-bottom: 6px;">Folder Sync & Automation</h3>
                            <p style="color: var(--text-muted); font-size: 0.85rem; line-height: 1.4;">
                                Configure the local directories for audio file watching and Obsidian vault synchronization. These directories must be fully qualified path names on the server host machine.
                            </p>
                        </div>
                    </div>

                    <div class="form-row">
                        <!-- Watch Directory -->
                        <div class="form-group">
                            <label for="watch_directory">Monitored Audio Folder (watch_directory)</label>
                            <input type="text" id="watch_directory" class="form-control" placeholder="e.g. C:/audio/input or /var/audio/input" />
                            <span style="font-size: 0.75rem; color: var(--text-muted);">Folder scanned periodically for new recordings. Scans happen 8 times a day (~every 3 hours).</span>
                        </div>

                        <!-- Export Directory -->
                        <div class="form-group">
                            <label for="export_directory">Obsidian Vault Sync Folder (export_directory)</label>
                            <input type="text" id="export_directory" class="form-control" placeholder="e.g. C:/Obsidian/Vault/Meetings or /home/user/vault" />
                            <span style="font-size: 0.75rem; color: var(--text-muted);">Directory where markdown summaries/transcripts are saved and automatically updated upon corrections.</span>
                        </div>
                    </div>

                    <div class="form-group" style="margin-top: 10px; margin-bottom: 30px;">
                        <label class="checkbox-control">
                            <input type="checkbox" id="auto_summarize" />
                            <span>Auto-Summarize new audio files (runs local AI summarization immediately after processing)</span>
                        </label>
                    </div>

                    <!-- Obsidian & Markdown Export Config -->
                    <div class="form-group" style="margin-bottom: 25px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 25px;">
                        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 8px; padding: 16px;">
                            <h3 style="font-family: var(--font-heading); font-size: 1.1rem; margin-bottom: 6px;">Obsidian & Markdown Export Formatting</h3>
                            <p style="color: var(--text-muted); font-size: 0.85rem; line-height: 1.4;">
                                Configure how markdown transcripts are formatted for your Obsidian Vault.
                            </p>
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom: 20px;">
                        <label class="checkbox-control">
                            <input type="checkbox" id="md_exclude_unknowns" />
                            <span>Exclude Unknown speakers (e.g. Unknown_1) from participants frontmatter</span>
                        </label>
                    </div>

                    <div class="form-row">
                        <!-- Participant Template -->
                        <div class="form-group">
                            <label for="md_participant_template">Participant Entry Template</label>
                            <input type="text" id="md_participant_template" class="form-control" placeholder="e.g. [[08 People/{name}]]" />
                            <span style="font-size: 0.75rem; color: var(--text-muted);">Use <code>{name}</code> to inject the speaker's name. Example: <code>[[08 People/{name}]]</code></span>
                        </div>

                        <!-- Transcript Header -->
                        <div class="form-group">
                            <label for="md_transcript_header">Transcript Section Header</label>
                            <input type="text" id="md_transcript_header" class="form-control" placeholder="Transcrição" />
                            <span style="font-size: 0.75rem; color: var(--text-muted);">The header of the transcript block. Default: <code>Transcrição</code></span>
                        </div>
                    </div>

                    <div class="form-row">
                        <!-- Speaker Format -->
                        <div class="form-group">
                            <label for="md_speaker_format">Speaker Header Format (Body)</label>
                            <input type="text" id="md_speaker_format" class="form-control" placeholder="**{name}** ({time})" />
                            <span style="font-size: 0.75rem; color: var(--text-muted);">How speaker headings are formatted in the transcript body. Use <code>{name}</code> and <code>{time}</code>.</span>
                        </div>
                    </div>

                    <div class="form-row">
                        <!-- Frontmatter Property Map -->
                        <div class="form-group">
                            <label for="md_frontmatter_map">Frontmatter Key Remapping (JSON)</label>
                            <textarea id="md_frontmatter_map" class="form-control" style="height: 100px; font-family: monospace; font-size: 0.82rem; resize: vertical;" placeholder='{&#10;  "title": "titulo",&#10;  "date": "data",&#10;  "participants": "participantes"&#10;}'></textarea>
                            <span style="font-size: 0.75rem; color: var(--text-muted);">Remap default YAML properties (title, date, category, participants, tags, duration). Leave blank for default keys.</span>
                        </div>

                        <!-- Custom Properties -->
                        <div class="form-group">
                            <label for="md_custom_properties">Custom Frontmatter Properties (JSON)</label>
                            <textarea id="md_custom_properties" class="form-control" style="height: 100px; font-family: monospace; font-size: 0.82rem; resize: vertical;" placeholder='{&#10;  "type": "meeting-note",&#10;  "project": "[[Projects/MyProject]]"&#10;}'></textarea>
                            <span style="font-size: 0.75rem; color: var(--text-muted);">Add custom YAML fields to the frontmatter (can be static values or wikilinks).</span>
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom: 25px;">
                        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 8px; padding: 16px;">
                            <h3 style="font-family: var(--font-heading); font-size: 1.1rem; margin-bottom: 6px;">Local Ollama LLM Connection</h3>
                            <p style="color: var(--text-muted); font-size: 0.85rem; line-height: 1.4;">
                                Connects to your local Ollama instance to generate summaries. Make sure Ollama is running on your machine.
                            </p>
                        </div>
                    </div>

                    <div class="form-row">
                        <!-- Ollama URL -->
                        <div class="form-group">
                            <label for="ollama_url">Ollama API URL</label>
                            <input type="text" id="ollama_url" class="form-control" placeholder="http://localhost:11434" />
                        </div>

                        <!-- Ollama Model -->
                        <div class="form-group">
                            <label for="ollama_model">Ollama Model</label>
                            <input type="text" id="ollama_model" class="form-control" placeholder="llama3" />
                        </div>
                    </div>

                    <div class="form-group" style="margin-top: 25px; margin-bottom: 25px;">
                        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 8px; padding: 16px;">
                            <h3 style="font-family: var(--font-heading); font-size: 1.1rem; margin-bottom: 6px;">AI Summary Prompts per Category</h3>
                            <p style="color: var(--text-muted); font-size: 0.85rem; line-height: 1.4;">
                                Edit the system prompts used by the local LLM to format the markdown output. You can use Markdown formatting. Use <code>{transcript}</code> where the dialog transcription should be injected.
                            </p>
                        </div>
                    </div>

                    <!-- Category Prompts -->
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label for="prompt_reuniao" style="font-weight: 600; color: var(--primary);">Reunião Prompt Template</label>
                        <textarea id="prompt_reuniao" class="form-control" style="height: 140px; font-family: monospace; font-size: 0.85rem; line-height: 1.4; resize: vertical;"></textarea>
                    </div>

                    <div class="form-group" style="margin-bottom: 20px;">
                        <label for="prompt_aula" style="font-weight: 600; color: var(--primary);">Aula Prompt Template</label>
                        <textarea id="prompt_aula" class="form-control" style="height: 140px; font-family: monospace; font-size: 0.85rem; line-height: 1.4; resize: vertical;"></textarea>
                    </div>

                    <div class="form-group" style="margin-bottom: 20px;">
                        <label for="prompt_entrevista" style="font-weight: 600; color: var(--primary);">Entrevista Prompt Template</label>
                        <textarea id="prompt_entrevista" class="form-control" style="height: 140px; font-family: monospace; font-size: 0.85rem; line-height: 1.4; resize: vertical;"></textarea>
                    </div>

                    <div class="form-group" style="margin-bottom: 30px;">
                        <label for="prompt_default" style="font-weight: 600; color: var(--primary);">Outro / Default Prompt Template</label>
                        <textarea id="prompt_default" class="form-control" style="height: 140px; font-family: monospace; font-size: 0.85rem; line-height: 1.4; resize: vertical;"></textarea>
                    </div>

                    <div style="display: flex; justify-content: flex-end; margin-top: 30px; padding-top: 15px; border-top: 1px solid var(--card-border);">
                        <button class="btn btn-primary" id="btn-save-ai-settings">Save AI & Folder Presets</button>
                    </div>
                </div>
            </div>
        `;
    },

    async init() {
        this.setupTabs();
        this.setupSliders();
        this.setupRematchListener();
        await this.loadSettings();
    },

    setupTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.settings-tab-content');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');
                
                // Toggle active button
                tabBtns.forEach(b => {
                    b.classList.remove('btn-primary');
                    b.classList.add('btn-secondary');
                });
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-primary');

                // Toggle active tab content
                tabContents.forEach(content => {
                    if (content.id === targetTab) {
                        content.style.display = 'block';
                    } else {
                        content.style.display = 'none';
                    }
                });
            });
        });
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
        const btnSaveAi = document.getElementById('btn-save-ai-settings');
        const btnReset = document.getElementById('btn-reset-settings');

        if (btnSave) btnSave.addEventListener('click', () => this.saveSettings());
        if (btnSaveAi) btnSaveAi.addEventListener('click', () => this.saveSettings());

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
            const [settings, promptsData] = await Promise.all([
                api.getSettings(),
                api.getPrompts()
            ]);
            
            this.populateForm(settings);
            this.populatePrompts(promptsData);
        } catch (e) {
            console.error('Failed to load system settings:', e);
            window.showToast('Failed to load system settings.', 'danger');
        }
    },

    populateForm(settings) {
        const fields = [
            'speaker_threshold', 'emotion_threshold', 'context_padding',
            'silence_duration', 'whisper_model', 'whisper_language',
            'emotion_model', 'cleanup_vram_threshold_gb',
            'watch_directory', 'export_directory', 'ollama_url', 'ollama_model'
        ];

        // Populate text inputs/dropdowns
        fields.forEach(field => {
            const el = document.getElementById(field);
            if (el && settings[field] !== undefined && settings[field] !== null) {
                el.value = settings[field];
            }
        });

        // Populate new markdown text fields
        const mdFields = ['md_participant_template', 'md_transcript_header', 'md_speaker_format'];
        mdFields.forEach(field => {
            const el = document.getElementById(field);
            if (el && settings[field] !== undefined && settings[field] !== null) {
                el.value = settings[field];
            }
        });

        // Format and populate JSON textareas
        const jsonFields = ['md_frontmatter_map', 'md_custom_properties'];
        jsonFields.forEach(field => {
            const el = document.getElementById(field);
            if (el) {
                const val = settings[field];
                if (val) {
                    try {
                        const parsed = typeof val === 'string' ? JSON.parse(val) : val;
                        el.value = JSON.stringify(parsed, null, 2);
                    } catch (e) {
                        el.value = val;
                    }
                } else {
                    el.value = '';
                }
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
        const checkboxes = [
            'filter_hallucinations', 'enable_personalized_emotions',
            'offline_mode', 'auto_summarize', 'md_exclude_unknowns'
        ];
        checkboxes.forEach(field => {
            const el = document.getElementById(field);
            if (el && settings[field] !== undefined) {
                el.checked = settings[field];
            }
        });
    },

    populatePrompts(data) {
        if (!data) return;
        const defaults = data.default_prompts || {};
        const customs = data.custom_prompts || {};

        const categories = ['reuniao', 'aula', 'entrevista', 'default'];
        categories.forEach(cat => {
            const el = document.getElementById(`prompt_${cat}`);
            if (el) {
                // Prioritize custom prompt, fallback to default prompt
                el.value = customs[cat] || defaults[cat] || '';
            }
        });
    },

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
            'cleanup_vram_threshold_gb', 'watch_directory', 'export_directory',
            'ollama_url', 'ollama_model',
            'md_participant_template', 'md_transcript_header', 'md_speaker_format'
        ];

        const checkboxes = [
            'filter_hallucinations', 'enable_personalized_emotions',
            'offline_mode', 'auto_summarize', 'md_exclude_unknowns'
        ];

        const payload = {};
        
        // Grab values
        fields.forEach(field => {
            const el = document.getElementById(field);
            if (el) {
                if (field === 'speaker_threshold' || field === 'emotion_threshold' || field === 'context_padding' || field === 'silence_duration') {
                    payload[field] = parseFloat(el.value);
                } else if (field === 'cleanup_vram_threshold_gb') {
                    payload[field] = parseInt(el.value);
                } else {
                    payload[field] = el.value.trim();
                }
            }
        });

        checkboxes.forEach(field => {
            const el = document.getElementById(field);
            if (el) {
                payload[field] = el.checked;
            }
        });

        // Validate and grab JSON fields
        const jsonFields = ['md_frontmatter_map', 'md_custom_properties'];
        for (const field of jsonFields) {
            const el = document.getElementById(field);
            if (el) {
                const val = el.value.trim();
                if (val) {
                    try {
                        const parsed = JSON.parse(val);
                        payload[field] = JSON.stringify(parsed);
                    } catch (e) {
                        window.showToast(`Invalid JSON in field: ${field}. Please correct it before saving.`, 'danger');
                        return;
                    }
                } else {
                    payload[field] = null;
                }
            }
        }

        // Grab custom prompts object and serialize to JSON
        const customPromptsObj = {};
        const categories = ['reuniao', 'aula', 'entrevista', 'default'];
        categories.forEach(cat => {
            const el = document.getElementById(`prompt_${cat}`);
            if (el) {
                customPromptsObj[cat] = el.value;
            }
        });
        payload.custom_prompts = JSON.stringify(customPromptsObj);

        try {
            const btnSaveVoice = document.getElementById('btn-save-settings');
            const btnSaveAi = document.getElementById('btn-save-ai-settings');
            if (btnSaveVoice) btnSaveVoice.disabled = true;
            if (btnSaveAi) btnSaveAi.disabled = true;
            window.showToast('Saving configurations...', 'warning');
            
            const updated = await api.saveSettings(payload);
            
            // Reload prompts to ensure they are synchronized
            const promptsData = await api.getPrompts();
            
            this.populateForm(updated);
            this.populatePrompts(promptsData);
            
            window.showToast('System settings saved and applied successfully.', 'success');
        } catch (e) {
            window.showToast(`Failed to save settings: ${e.message}`, 'danger');
        } finally {
            const btnSaveVoice = document.getElementById('btn-save-settings');
            const btnSaveAi = document.getElementById('btn-save-ai-settings');
            if (btnSaveVoice) btnSaveVoice.disabled = false;
            if (btnSaveAi) btnSaveAi.disabled = false;
        }
    }
};
