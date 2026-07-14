import api from '../api.js';

export default {
    speakers: [],
    searchQuery: '',
    startDateFilter: '',
    endDateFilter: '',
    typeFilter: '',
    activeAudioPlayer: null,


    async render() {
        return `
            <!-- Top Action Header with Search and Filters -->
            <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
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
                
                <!-- Filters row -->
                <div class="content-card" style="margin-bottom: 0; padding: 16px; display: flex; gap: 16px; flex-wrap: wrap; align-items: center;">
                    <strong style="font-size: 0.9rem; color: var(--text-main);">Filters:</strong>
                    
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 0.8rem; color: var(--text-muted);">From:</span>
                        <input type="date" id="filter-start-date" class="form-control" style="width: 135px; height: 34px; padding: 4px 8px; font-size: 0.85rem;" />
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 0.8rem; color: var(--text-muted);">To:</span>
                        <input type="date" id="filter-end-date" class="form-control" style="width: 135px; height: 34px; padding: 4px 8px; font-size: 0.85rem;" />
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 0.8rem; color: var(--text-muted);">Type:</span>
                        <select class="form-control" id="filter-type" style="width: 160px; height: 34px; padding: 4px 8px; font-size: 0.85rem;">
                            <option value="">All Profiles</option>
                            <option value="known">Known Speakers Only</option>
                            <option value="unknown">Unknown (Auto-enrolled)</option>
                        </select>
                    </div>
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

        const startDateInput = document.getElementById('filter-start-date');
        const endDateInput = document.getElementById('filter-end-date');
        const typeSelect = document.getElementById('filter-type');

        if (startDateInput) {
            startDateInput.addEventListener('change', (e) => {
                this.startDateFilter = e.target.value;
                this.renderGrid();
            });
        }
        if (endDateInput) {
            endDateInput.addEventListener('change', (e) => {
                this.endDateFilter = e.target.value;
                this.renderGrid();
            });
        }
        if (typeSelect) {
            typeSelect.addEventListener('change', (e) => {
                this.typeFilter = e.target.value;
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

        const filtered = this.speakers.filter(sp => {
            // 1. Search Query
            const matchesQuery = sp.name.toLowerCase().includes(this.searchQuery);
            
            // 2. Type Filter
            const isUnknown = sp.name.startsWith('Unknown_');
            let matchesType = true;
            if (this.typeFilter === 'known') matchesType = !isUnknown;
            if (this.typeFilter === 'unknown') matchesType = isUnknown;

            // 3. Date Filters
            let matchesDate = true;
            if (sp.created_at) {
                const spDate = new Date(sp.created_at);
                if (this.startDateFilter) {
                    const start = new Date(this.startDateFilter + 'T00:00:00');
                    if (spDate < start) matchesDate = false;
                }
                if (this.endDateFilter) {
                    const end = new Date(this.endDateFilter + 'T23:59:59');
                    if (spDate > end) matchesDate = false;
                }
            }

            return matchesQuery && matchesType && matchesDate;
        });

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 40px;" class="content-card">
                    No speakers profiles match the active filters.
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
            const created = window.formatDate(sp.created_at);

            return `
                <div class="speaker-card" id="speaker-card-${sp.id}">
                    <div class="speaker-card-header">
                        <div class="speaker-card-title">
                            <h3 id="sp-name-display-${sp.id}">${sp.name}</h3>
                            <span>Enrolled: ${created}</span>
                        </div>
                        <span class="badge ${isUnknown ? 'badge-danger' : 'badge-success'}">${isUnknown ? 'Auto' : 'Known'}</span>
                    </div>

                    <div class="speakers-details-info" style="margin: 12px 0; font-size: 0.85rem; color: var(--text-muted); display: flex; justify-content: space-between;">
                        <span>Segments: <strong style="color: var(--text-main);">${sp.segment_count || 0}</strong></span>
                        <span>DB ID: <strong style="color: var(--text-main); font-family: monospace;">#${sp.id}</strong></span>
                    </div>

                    <div class="speaker-card-actions" style="margin-top: 15px; display: flex; gap: 8px;">
                        <button class="btn btn-secondary btn-icon-only btn-play-sample" data-id="${sp.id}" data-name="${sp.name}" title="Play Voice Sample" style="flex: 1; display: flex; justify-content: center; align-items: center; gap: 6px; padding: 6px 12px; height: 32px; font-size: 0.8rem;">
                            <i data-lucide="play" style="width: 14px; height: 14px; color: var(--accent);"></i> Sample
                        </button>
                        <button class="btn btn-secondary btn-icon-only btn-configure-thresh" data-id="${sp.id}" data-name="${sp.name}" title="Configure Thresholds" style="padding: 6px; width: 32px; height: 32px;">
                            <i data-lucide="sliders-horizontal" style="width: 14px; height: 14px;"></i>
                        </button>
                        <button class="btn btn-secondary btn-icon-only btn-rename-speaker" data-id="${sp.id}" data-name="${sp.name}" title="Rename Speaker" style="padding: 6px; width: 32px; height: 32px;">
                            <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i>
                        </button>
                        <button class="btn btn-secondary btn-icon-only btn-delete-speaker" data-id="${sp.id}" data-name="${sp.name}" title="Delete Speaker" style="padding: 6px; width: 32px; height: 32px;">
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

        // Play voice sample interaction
        grid.querySelectorAll('.btn-play-sample').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-name');
                const icon = btn.querySelector('i');

                // Toggle logic if clicking the already active speaker sample
                if (this.activeAudioPlayer && this.activeAudioPlayer._speakerId === id) {
                    if (this.activeAudioPlayer.paused) {
                        await this.activeAudioPlayer.play();
                    } else {
                        this.activeAudioPlayer.pause();
                    }
                    return;
                }

                // Stop any other currently playing sample
                if (this.activeAudioPlayer) {
                    this.activeAudioPlayer.pause();
                    const activeId = this.activeAudioPlayer._speakerId;
                    const prevBtn = grid.querySelector(`.btn-play-sample[data-id="${activeId}"]`);
                    if (prevBtn) {
                        prevBtn.innerHTML = '<i data-lucide="play" style="width: 14px; height: 14px; color: var(--accent);"></i> Sample';
                    }
                }

                try {
                    window.showToast(`Loading voice sample for "${name}"...`, 'warning');
                    
                    const audioUrl = api.getSpeakerSampleAudioUrl(id);
                    const player = new Audio(audioUrl);
                    player._speakerId = id;
                    
                    player.addEventListener('play', () => {
                        btn.innerHTML = '<i data-lucide="pause" style="width: 14px; height: 14px; color: var(--accent);"></i> Pause';
                        lucide.createIcons();
                    });

                    player.addEventListener('ended', () => {
                        if (this.activeAudioPlayer === player) this.activeAudioPlayer = null;
                        btn.innerHTML = '<i data-lucide="play" style="width: 14px; height: 14px; color: var(--accent);"></i> Sample';
                        lucide.createIcons();
                    });

                    player.addEventListener('pause', () => {
                        btn.innerHTML = '<i data-lucide="play" style="width: 14px; height: 14px; color: var(--accent);"></i> Sample';
                        lucide.createIcons();
                    });

                    player.addEventListener('error', (e) => {
                        console.error('Audio play error:', e);
                        window.showToast('Voice sample not found (speaker has no processed segments).', 'danger');
                        btn.innerHTML = '<i data-lucide="play" style="width: 14px; height: 14px; color: var(--accent);"></i> Sample';
                        lucide.createIcons();
                        if (this.activeAudioPlayer === player) this.activeAudioPlayer = null;
                    });

                    this.activeAudioPlayer = player;
                    await player.play();
                } catch (err) {
                    console.error('Playback failed:', err);
                    window.showToast('Failed to play voice sample.', 'danger');
                }
            });
        });

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
            const threshResponse = await api.getSpeakerEmotionThreshold(speakerId);
            // Read custom_threshold or effective_threshold from response
            const currentThreshold = threshResponse.custom_threshold !== null && threshResponse.custom_threshold !== undefined 
                ? threshResponse.custom_threshold 
                : (threshResponse.effective_threshold || 0.6);
            
            slider.value = currentThreshold;
            label.textContent = currentThreshold.toFixed(2);

            // Fetch per-emotion profiles (returns object with 'profiles' array field)
            const profilesResponse = await api.getSpeakerEmotionProfiles(speakerId);
            const profiles = profilesResponse.profiles || [];
            
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
