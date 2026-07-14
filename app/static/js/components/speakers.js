import api from '../api.js';

export default {
    speakers: [],
    searchQuery: '',

    async render() {
        return `
            <!-- Top Action Header -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
                <div style="display: flex; gap: 12px; flex: 1; max-width: 400px;">
                    <input type="text" id="speaker-search" class="form-control" placeholder="Search speakers by name..." />
                </div>
                <div style="display: flex; gap: 12px;">
                    <button class="btn btn-danger" id="btn-purge-unknowns" title="Delete all auto-enrolled Unknown_NN profiles">
                        <i data-lucide="trash-2"></i> Delete All Unknowns
                    </button>
                    <button class="btn btn-primary" id="btn-show-enroll-drawer">
                        <i data-lucide="user-plus"></i> Enroll Speaker
                    </button>
                </div>
            </div>

            <!-- Speaker Enrollment Form (Collapsible card) -->
            <div class="content-card" id="enroll-speaker-card" style="display: none; margin-bottom: 24px;">
                <div class="card-header">
                    <h2>Enroll New Voice Profile</h2>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="enroll-name">Speaker Name</label>
                        <input type="text" id="enroll-name" class="form-control" placeholder="e.g. Alice" />
                    </div>
                    <div class="form-group">
                        <label for="enroll-audio-file">Voice Sample Audio File (10-30 seconds WAV/MP3 recommended)</label>
                        <input type="file" id="enroll-audio-file" class="form-control" accept="audio/*" />
                    </div>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 10px;">
                    <button class="btn btn-secondary" id="btn-cancel-enroll-drawer">Cancel</button>
                    <button class="btn btn-primary" id="btn-submit-enroll">Save Voice Profile</button>
                </div>
            </div>

            <!-- Speakers Grid -->
            <div class="speakers-grid" id="speakers-grid">
                <div class="loading-spinner-container" style="grid-column: 1 / -1;">
                    <div class="spinner"></div>
                    <p>Loading speakers...</p>
                </div>
            </div>

            <!-- Speaker Threshold Adjust Modal -->
            <div class="modal-overlay" id="threshold-modal">
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3>Configure Emotion Profiles: <span id="thresh-modal-title">Speaker</span></h3>
                        <button class="btn btn-icon-only" id="btn-close-thresh-modal" style="padding: 4px;">
                            <i data-lucide="x" style="width: 16px; height: 16px;"></i>
                        </button>
                    </div>
                    <div class="modal-body" style="max-height: 400px; overflow-y: auto; padding-right: 8px;">
                        <!-- General Threshold -->
                        <div class="form-group" style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px; border: 1px solid var(--card-border);">
                            <label style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <strong style="color: var(--text-main);">Speaker General Emotion Threshold</strong>
                                <span id="lbl-general-thresh" style="color: var(--primary); font-weight: 600;">0.60</span>
                            </label>
                            <input type="range" id="input-general-thresh" class="form-control" min="0.1" max="1.0" step="0.05" style="padding:0; height:auto;" />
                            <span style="font-size: 0.75rem; color: var(--text-muted);">Lower is more sensitive, custom emotion matching overrides global parameters.</span>
                        </div>

                        <h4 style="margin: 20px 0 10px 0; font-family: var(--font-heading); font-size: 1rem; border-bottom: 1px solid var(--card-border); padding-bottom: 6px;">
                            Per-Emotion Thresholds
                        </h4>
                        
                        <div style="display: flex; flex-direction: column; gap: 14px;" id="per-emotion-profiles-list">
                            <!-- Injected dynamically -->
                            <p style="color: var(--text-muted); font-size: 0.85rem; text-align: center;">No custom emotion corrections saved yet for this speaker.</p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-danger" id="btn-delete-emotion-profiles" style="margin-right: auto;">Clear Profiles</button>
                        <button class="btn btn-primary" id="btn-save-thresholds">Save Thresholds</button>
                    </div>
                </div>
            </div>
        `;
    },

    async init() {
        this.setupActionListeners();
        await this.loadSpeakers();
    },

    setupActionListeners() {
        const searchInput = document.getElementById('speaker-search');
        const btnPurge = document.getElementById('btn-purge-unknowns');
        
        const btnShowEnroll = document.getElementById('btn-show-enroll-drawer');
        const btnCancelEnroll = document.getElementById('btn-cancel-enroll-drawer');
        const enrollCard = document.getElementById('enroll-speaker-card');
        const btnSubmitEnroll = document.getElementById('btn-submit-enroll');

        // Search filter
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase().trim();
                this.renderGrid();
            });
        }

        // PURGE UNKNOWNS
        if (btnPurge) {
            btnPurge.addEventListener('click', async () => {
                if (confirm('Are you sure you want to delete all auto-enrolled Unknown_NN speaker profiles? This will un-label their segments in past conversations.')) {
                    try {
                        btnPurge.disabled = true;
                        const res = await api.deleteAllUnknownSpeakers();
                        window.showToast(res.message, 'success');
                        await this.loadSpeakers();
                    } catch (e) {
                        window.showToast(`Purge failed: ${e.message}`, 'danger');
                    } finally {
                        btnPurge.disabled = false;
                    }
                }
            });
        }

        // Toggle Enroll Drawer
        if (btnShowEnroll && enrollCard) {
            btnShowEnroll.addEventListener('click', () => {
                enrollCard.style.display = 'block';
                document.getElementById('enroll-name').focus();
            });
        }

        if (btnCancelEnroll && enrollCard) {
            btnCancelEnroll.addEventListener('click', () => {
                enrollCard.style.display = 'none';
            });
        }

        // SUBMIT ENROLL
        if (btnSubmitEnroll) {
            btnSubmitEnroll.addEventListener('click', async () => {
                const nameInput = document.getElementById('enroll-name');
                const fileInput = document.getElementById('enroll-audio-file');
                
                const name = nameInput.value.trim();
                const file = fileInput.files[0];

                if (!name) {
                    window.showToast('Please specify a speaker name.', 'warning');
                    return;
                }
                if (!file) {
                    window.showToast('Please select a voice sample audio file.', 'warning');
                    return;
                }

                try {
                    btnSubmitEnroll.disabled = true;
                    window.showToast(`Extracting embedding and enrolling "${name}"...`, 'warning');
                    
                    await api.enrollSpeaker(name, file);
                    window.showToast(`Speaker "${name}" enrolled successfully.`, 'success');
                    
                    // Reset
                    nameInput.value = '';
                    fileInput.value = '';
                    if (enrollCard) enrollCard.style.display = 'none';
                    
                    await this.loadSpeakers();
                } catch (e) {
                    window.showToast(`Enrollment failed: ${e.message}`, 'danger');
                } finally {
                    btnSubmitEnroll.disabled = false;
                }
            });
        }

        // Setup thresholds modal slider events
        const genSlider = document.getElementById('input-general-thresh');
        const genLabel = document.getElementById('lbl-general-thresh');
        if (genSlider && genLabel) {
            genSlider.addEventListener('input', (e) => {
                genLabel.textContent = parseFloat(e.target.value).toFixed(2);
            });
        }

        // Close threshold modal
        const modal = document.getElementById('threshold-modal');
        const btnCloseThresh = document.getElementById('btn-close-thresh-modal');
        if (btnCloseThresh && modal) {
            btnCloseThresh.addEventListener('click', () => modal.classList.remove('active'));
        }
    },

    async loadSpeakers() {
        try {
            this.speakers = await api.getSpeakers();
            this.renderGrid();
        } catch (error) {
            console.error('Failed to load speakers list:', error);
            window.showToast('Failed to load speakers list.', 'danger');
        }
    },

    renderGrid() {
        const grid = document.getElementById('speakers-grid');
        if (!grid) return;

        const filtered = this.speakers.filter(sp => 
            sp.name.toLowerCase().includes(this.searchQuery)
        );

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 40px;" class="content-card">
                    No speakers profiles enrolled.
                </div>
            `;
            return;
        }

        // Sort: known speakers first, then alphabetical
        filtered.sort((a, b) => {
            const aUnknown = a.name.startsWith('Unknown_');
            const bUnknown = b.name.startsWith('Unknown_');
            if (aUnknown && !bUnknown) return 1;
            if (!aUnknown && bUnknown) return -1;
            return a.name.localeCompare(b.name);
        });

        grid.innerHTML = filtered.map(sp => {
            const isUnknown = sp.name.startsWith('Unknown_');
            const created = new Date(sp.created_at).toLocaleDateString();

            return `
                <div class="speaker-card" id="speaker-card-${sp.id}">
                    <div class="speaker-card-header">
                        <div class="speaker-card-title">
                            <h3 id="sp-name-display-${sp.id}">${sp.name}</h3>
                            <span>Enrolled: ${created}</span>
                        </div>
                        <span class="badge ${isUnknown ? 'badge-danger' : 'badge-success'}">${isUnknown ? 'Auto' : 'Known'}</span>
                    </div>

                    <div class="speaker-stats">
                        <div class="speaker-stat-item">
                            <span class="speaker-stat-label">Segments</span>
                            <span class="speaker-stat-val">${sp.segment_count || 0}</span>
                        </div>
                        <div class="speaker-stat-item">
                            <span class="speaker-stat-label">Database ID</span>
                            <span class="speaker-stat-val" style="font-family: monospace;">#${sp.id}</span>
                        </div>
                    </div>

                    <div class="speaker-card-actions">
                        <button class="btn btn-secondary btn-icon-only btn-configure-thresh" data-id="${sp.id}" data-name="${sp.name}" title="Configure Thresholds & Emotion Profiles">
                            <i data-lucide="sliders-horizontal" style="width: 14px; height: 14px;"></i>
                        </button>
                        <button class="btn btn-secondary btn-icon-only btn-rename-speaker" data-id="${sp.id}" data-name="${sp.name}" title="Rename Speaker">
                            <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i>
                        </button>
                        <button class="btn btn-secondary btn-icon-only btn-delete-speaker" data-id="${sp.id}" data-name="${sp.name}" title="Delete Speaker">
                            <i data-lucide="trash" style="width: 14px; height: 14px; color: var(--danger);"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        lucide.createIcons();
        this.setupGridInteractions();
    },

    setupGridInteractions() {
        const grid = document.getElementById('speakers-grid');
        if (!grid) return;

        // Delete Speaker
        grid.querySelectorAll('.btn-delete-speaker').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-name');
                if (confirm(`Are you sure you want to delete speaker "${name}"? This leaves segments as unassigned.`)) {
                    try {
                        btn.disabled = true;
                        await api.deleteSpeaker(id);
                        window.showToast(`Deleted speaker "${name}".`, 'success');
                        await this.loadSpeakers();
                    } catch (e) {
                        window.showToast(`Delete failed: ${e.message}`, 'danger');
                        btn.disabled = false;
                    }
                }
            });
        });

        // Rename Speaker
        grid.querySelectorAll('.btn-rename-speaker').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const oldName = btn.getAttribute('data-name');
                const newName = prompt(`Enter a new name for speaker "${oldName}":`, oldName);
                if (newName && newName.trim() && newName.trim() !== oldName) {
                    try {
                        btn.disabled = true;
                        await api.renameSpeaker(id, newName.trim());
                        window.showToast(`Renamed speaker "${oldName}" to "${newName.trim()}". Past segments updated retroactively.`, 'success');
                        await this.loadSpeakers();
                    } catch (e) {
                        window.showToast(`Rename failed: ${e.message}`, 'danger');
                        btn.disabled = false;
                    }
                }
            });
        });

        // Configure thresholds & profiles
        grid.querySelectorAll('.btn-configure-thresh').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-name');
                this.openThresholdModal(id, name);
            });
        });
    },

    async openThresholdModal(speakerId, speakerName) {
        const modal = document.getElementById('threshold-modal');
        const modalTitle = document.getElementById('thresh-modal-title');
        
        const slider = document.getElementById('input-general-thresh');
        const label = document.getElementById('lbl-general-thresh');
        
        const listContainer = document.getElementById('per-emotion-profiles-list');
        const btnSave = document.getElementById('btn-save-thresholds');
        const btnClear = document.getElementById('btn-delete-emotion-profiles');

        if (!modal || !modalTitle || !slider || !label || !listContainer || !btnSave || !btnClear) return;

        modalTitle.textContent = speakerName;
        listContainer.innerHTML = `<div class="spinner" style="margin: 20px auto; width: 24px; height: 24px;"></div>`;
        modal.classList.add('active');

        try {
            // Fetch speaker emotion thresholds
            // The GET /api/v1/conversations/speakers/{id}/emotion-threshold endpoint returns float threshold, or 0.6 fallback
            // In API schemas.py or api.py: Wait, let's see how the endpoint is modeled:
            // @router.get("/speakers/{speaker_id}/emotion-threshold") returns {"speaker_id": int, "emotion_threshold": float}
            const threshResponse = await api.getSpeakerEmotionThreshold(speakerId);
            const currentThreshold = threshResponse.emotion_threshold || 0.6;
            
            slider.value = currentThreshold;
            label.textContent = currentThreshold.toFixed(2);

            // Fetch per-emotion profiles
            // The GET /api/v1/conversations/speakers/{id}/emotion-profiles endpoint returns list of profiles
            // In conversation_api.py:
            // @router.get("/speakers/{speaker_id}/emotion-profiles") returns List[SpeakerEmotionProfileResponse]
            const profiles = await api.getSpeakerEmotionProfiles(speakerId);
            
            if (profiles.length === 0) {
                listContainer.innerHTML = `
                    <p style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 15px 0;">
                        No custom emotion profiles created. Correct emotions on segments to build personalized voice profiles.
                    </p>
                `;
            } else {
                listContainer.innerHTML = profiles.map(prof => `
                    <div style="background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.04); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <strong style="text-transform: uppercase; font-size: 0.85rem; color: var(--accent);">${prof.emotion_category}</strong>
                            <span style="font-size: 0.75rem; color: var(--text-muted);">Samples: ${prof.sample_count}</span>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <!-- Generic / Global threshold override -->
                            <div>
                                <label style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 2px;">
                                    <span>Base Threshold</span>
                                    <span id="lbl-thresh-${prof.emotion_category}" style="font-weight:600;">${prof.confidence_threshold.toFixed(2)}</span>
                                </label>
                                <input type="range" class="form-control emo-thresh-slider" data-category="${prof.emotion_category}" min="0.1" max="1.0" step="0.05" value="${prof.confidence_threshold}" style="padding:0; height:auto;" />
                            </div>
                            <!-- Voice Profile threshold override -->
                            <div>
                                <label style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 2px;">
                                    <span>Voice Threshold</span>
                                    <span id="lbl-voice-${prof.emotion_category}" style="font-weight:600;">${prof.voice_threshold.toFixed(2)}</span>
                                </label>
                                <input type="range" class="form-control emo-voice-slider" data-category="${prof.emotion_category}" min="0.1" max="1.0" step="0.05" value="${prof.voice_threshold}" style="padding:0; height:auto;" />
                            </div>
                        </div>
                    </div>
                `).join('');

                // Hook up per-slider events
                listContainer.querySelectorAll('.emo-thresh-slider').forEach(slider => {
                    const category = slider.getAttribute('data-category');
                    const lbl = document.getElementById(`lbl-thresh-${category}`);
                    slider.addEventListener('input', (e) => {
                        lbl.textContent = parseFloat(e.target.value).toFixed(2);
                    });
                });

                listContainer.querySelectorAll('.emo-voice-slider').forEach(slider => {
                    const category = slider.getAttribute('data-category');
                    const lbl = document.getElementById(`lbl-voice-${category}`);
                    slider.addEventListener('input', (e) => {
                        lbl.textContent = parseFloat(e.target.value).toFixed(2);
                    });
                });
            }

            // Clone buttons to clean up previous event handlers
            const newBtnSave = btnSave.cloneNode(true);
            btnSave.parentNode.replaceChild(newBtnSave, btnSave);

            const newBtnClear = btnClear.cloneNode(true);
            btnClear.parentNode.replaceChild(newBtnClear, btnClear);

            // SAVE ACTIONS
            newBtnSave.addEventListener('click', async () => {
                try {
                    newBtnSave.disabled = true;
                    window.showToast('Saving speaker configurations...', 'warning');

                    // 1. Update general threshold
                    const finalGen = parseFloat(slider.value);
                    await api.updateSpeakerEmotionThreshold(speakerId, finalGen);

                    // 2. Update individual emotion profiles thresholds
                    const promises = [];
                    listContainer.querySelectorAll('.emo-thresh-slider').forEach(sl => {
                        const cat = sl.getAttribute('data-category');
                        const val = parseFloat(sl.value);
                        promises.push(api.updateSpeakerEmotionProfileThreshold(speakerId, cat, val));
                    });

                    listContainer.querySelectorAll('.emo-voice-slider').forEach(sl => {
                        const cat = sl.getAttribute('data-category');
                        const val = parseFloat(sl.value);
                        promises.push(api.updateSpeakerEmotionProfileVoiceThreshold(speakerId, cat, val));
                    });

                    await Promise.all(promises);

                    window.showToast('Speaker emotion settings saved successfully.', 'success');
                    modal.classList.remove('active');
                } catch (e) {
                    window.showToast(`Failed to save thresholds: ${e.message}`, 'danger');
                } finally {
                    newBtnSave.disabled = false;
                }
            });

            // CLEAR PROFILES
            newBtnClear.addEventListener('click', async () => {
                if (confirm(`Clear all personalized voice emotion profiles for "${speakerName}"? This resets their learned emotion preferences.`)) {
                    try {
                        newBtnClear.disabled = true;
                        await api.deleteSpeakerEmotionProfiles(speakerId);
                        window.showToast(`Personalized emotion profiles cleared.`, 'success');
                        modal.classList.remove('active');
                    } catch (e) {
                        window.showToast(`Failed to clear profiles: ${e.message}`, 'danger');
                        newBtnClear.disabled = false;
                    }
                }
            });

        } catch (error) {
            console.error('Failed to load threshold settings:', error);
            window.showToast('Failed to load threshold settings.', 'danger');
            modal.classList.remove('active');
        }
    }
};
