import api from '../api.js';

export default {
    conversationId: null,
    conversation: null,
    speakers: [],
    audioPlayer: null,
    playingSegmentId: null,
    playProgressInterval: null,

    async render(id) {
        this.conversationId = id;
        return `
            <div class="detail-layout">
                <!-- Main Transcript Area -->
                <div class="detail-main">
                    <div class="content-card" style="padding: 18px 24px; margin-bottom: 0;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
                            <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 250px;">
                                <i data-lucide="message-square" style="color: var(--primary);"></i>
                                <input type="text" id="conversation-title-input" class="form-control" style="font-family: var(--font-heading); font-size: 1.25rem; font-weight: 600; background: transparent; border-color: transparent; padding: 4px 8px; width: 100%;" title="Click to edit title" />
                            </div>
                            <div style="display: flex; gap: 10px;">
                                <button class="btn btn-secondary" id="btn-recalc-emotions" title="Re-evaluate emotions with personalized profiles">
                                    <i data-lucide="smile"></i> Recalculate Emotions
                                </button>
                                <button class="btn btn-secondary" id="btn-reprocess" title="Run full diarization & whisper pipeline again">
                                    <i data-lucide="refresh-cw"></i> Reprocess Audio
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Transcript Card -->
                    <div class="content-card" style="flex: 1; display: flex; flex-direction: column; overflow: hidden; margin-bottom: 0; padding-bottom: 12px;">
                        <div class="card-header" style="margin-bottom: 12px;">
                            <h2>Transcript & Segments</h2>
                            <span class="badge badge-info" id="detail-num-speakers">0 Speakers</span>
                        </div>
                        <div class="segments-list" id="detail-segments-list">
                            <div class="loading-spinner-container">
                                <div class="spinner"></div>
                                <p>Loading conversation transcript...</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Detail Metadata Sidebar -->
                <div class="detail-sidebar">
                    <div class="content-card">
                        <div class="card-header" style="margin-bottom: 16px;">
                            <h2>Recording Info</h2>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 12px; font-size: 0.9rem;">
                            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.04); padding-bottom: 8px;">
                                <span style="color: var(--text-muted);">Status:</span>
                                <span id="info-status" class="badge">completed</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.04); padding-bottom: 8px;">
                                <span style="color: var(--text-muted);">Duration:</span>
                                <span id="info-duration" style="font-weight: 600;">0:00</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.04); padding-bottom: 8px;">
                                <span style="color: var(--text-muted);">Date:</span>
                                <span id="info-date" style="color: var(--text-muted);">--</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding-bottom: 8px;">
                                <span style="color: var(--text-muted);">Format:</span>
                                <span id="info-format" style="text-transform: uppercase;">--</span>
                            </div>
                        </div>
                    </div>

                    <!-- Export Transcripts Card -->
                    <div class="content-card">
                        <div class="card-header" style="margin-bottom: 16px;">
                            <h2>Export Transcript</h2>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <button class="btn btn-secondary btn-export" data-format="txt" style="padding: 6px 10px; font-size: 0.8rem; font-weight: 600;">
                                <i data-lucide="file-text" style="width: 14px; height: 14px; color: var(--accent);"></i> TXT
                            </button>
                            <button class="btn btn-secondary btn-export" data-format="srt" style="padding: 6px 10px; font-size: 0.8rem; font-weight: 600;">
                                <i data-lucide="film" style="width: 14px; height: 14px; color: var(--accent);"></i> SRT
                            </button>
                            <button class="btn btn-secondary btn-export" data-format="vtt" style="padding: 6px 10px; font-size: 0.8rem; font-weight: 600;">
                                <i data-lucide="file-video" style="width: 14px; height: 14px; color: var(--accent);"></i> VTT
                            </button>
                            <button class="btn btn-secondary btn-export" data-format="json" style="padding: 6px 10px; font-size: 0.8rem; font-weight: 600;">
                                <i data-lucide="braces" style="width: 14px; height: 14px; color: var(--accent);"></i> JSON
                            </button>
                        </div>
                    </div>

                    <div class="content-card">

                        <div class="card-header" style="margin-bottom: 16px;">
                            <h2>Human-in-the-Loop Tips</h2>
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.5; display: flex; flex-direction: column; gap: 12px;">
                            <p>
                                <strong style="color: var(--text-main);">Retroactive Identifications:</strong> Renaming or identifying an <em>Unknown_NN</em> speaker will automatically update <strong>all other segments</strong> from that unknown speaker retroactively.
                            </p>
                            <p>
                                <strong style="color: var(--text-main);">Personalized Emotions:</strong> Correcting a segment's emotion will save the voice + emotion embedding. Once a speaker has <strong>&ge; 3 corrections</strong> for an emotion, a custom classifier learns their vocal characteristics and applies it in the future.
                            </p>
                            <p>
                                <strong style="color: var(--text-main);">Misidentifications:</strong> Flagging a speaker or emotion correction as misidentified excludes that segment from the speaker's model profile.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Custom Enroll Speaker Modal -->
            <div class="modal-overlay" id="enroll-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Enroll New Speaker</h3>
                        <button class="btn btn-icon-only" id="btn-close-enroll-modal" style="padding: 4px;">
                            <i data-lucide="x" style="width: 16px; height: 16px;"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="new-speaker-name">Speaker Name</label>
                            <input type="text" id="new-speaker-name" class="form-control" placeholder="e.g. Alice" />
                        </div>
                        <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4;">
                            This will extract a voice embedding from this segment and save a new profile. All other segments belonging to the previous Unknown speaker will be merged retroactively.
                        </p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="btn-cancel-enroll">Cancel</button>
                        <button class="btn btn-primary" id="btn-confirm-enroll">Enroll Speaker</button>
                    </div>
                </div>
            </div>
        `;
    },

    async init(id) {
        this.conversationId = id;
        this.audioPlayer = new Audio();
        
        // Setup audio events
        this.audioPlayer.addEventListener('ended', () => this.handleAudioEnded());
        this.audioPlayer.addEventListener('pause', () => this.handleAudioEnded());

        await this.loadData();
        this.setupActionListeners();
    },

    async loadData() {
        try {
            // Load conversation details and speakers lists
            const [conv, speakers] = await Promise.all([
                api.getConversation(this.conversationId),
                api.getSpeakers()
            ]);

            this.conversation = conv;
            this.speakers = speakers;

            // Render details
            this.renderHeaderAndSidebar();
            this.renderSegments();

        } catch (error) {
            console.error('Failed to load conversation details:', error);
            window.showToast('Failed to load conversation details.', 'danger');
        }
    },

    renderHeaderAndSidebar() {
        if (!this.conversation) return;

        // Title input
        const titleInput = document.getElementById('conversation-title-input');
        if (titleInput) {
            titleInput.value = this.conversation.title || `Recording #${this.conversation.id}`;
        }

        // Speaker count tag
        const speakersBadge = document.getElementById('detail-num-speakers');
        if (speakersBadge) {
            speakersBadge.textContent = `${this.conversation.num_speakers} Speaker${this.conversation.num_speakers === 1 ? '' : 's'}`;
        }

        // Sidebar stats
        const statusBadge = document.getElementById('info-status');
        const duration = document.getElementById('info-duration');
        const date = document.getElementById('info-date');
        const format = document.getElementById('info-format');

        if (statusBadge) {
            statusBadge.textContent = this.conversation.status;
            statusBadge.className = 'badge ' + (this.conversation.status === 'completed' ? 'badge-success' : 
                                                (this.conversation.status === 'processing' || this.conversation.status === 'recording' ? 'badge-warning' : 'badge-danger'));
        }

        if (duration) {
            duration.textContent = this.conversation.duration ? this.formatDuration(this.conversation.duration) : '0:00';
        }

        if (date) {
            date.textContent = window.formatDate(this.conversation.start_time);
        }


        if (format) {
            format.textContent = this.conversation.audio_format || 'wav';
        }
    },

    renderSegments() {
        const list = document.getElementById('detail-segments-list');
        if (!list || !this.conversation) return;

        const segments = this.conversation.transcript_segments;

        if (!segments || segments.length === 0) {
            list.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 40px;">
                    No transcript segments generated yet.
                </div>
            `;
            return;
        }

        // Sort segments chronologically
        segments.sort((a, b) => a.start_offset - b.start_offset);

        // Inject the datalist for speaker autocompletion
        const datalistHtml = `<datalist id="speakers-datalist">${this.speakers.map(sp => `<option value="${sp.name}"></option>`).join('')}</datalist>`;

        list.innerHTML = datalistHtml + segments.map(seg => {
            const isUnknown = !seg.speaker_id || (seg.speaker_name && seg.speaker_name.startsWith('Unknown_'));
            
            // Emotion classes
            const emotionClass = seg.emotion_category === 'neutral' ? 'neutral' : 
                                 (seg.emotion_category === 'angry' ? 'angry' : 
                                  (seg.emotion_category === 'sad' ? 'sad' : ''));
            const correctedClass = seg.emotion_corrected ? 'corrected' : '';

            // Emotion select options
            const emotions = ['neutral', 'angry', 'happy', 'sad', 'surprised', 'disgusted', 'fearful', 'other', 'unknown'];
            const emotionOptionsHtml = emotions.map(emo => `
                <option value="${emo}" ${seg.emotion_category === emo ? 'selected' : ''}>${emo.toUpperCase()}</option>
            `).join('');

            const bgStyle = isUnknown 
                ? 'background-color: rgba(255, 255, 255, 0.04); color: var(--text-muted); border-color: rgba(255, 255, 255, 0.1);' 
                : 'background-color: rgba(99, 102, 241, 0.05); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.25);';

            return `
                <div class="segment-card ${seg.is_misidentified ? 'misidentified' : ''}" id="seg-card-${seg.id}" data-id="${seg.id}">
                    <div class="segment-header">
                        <div class="segment-meta" style="flex-wrap: wrap; gap: 10px;">
                            <span class="segment-time">${this.formatDuration(seg.start_offset)} - ${this.formatDuration(seg.end_offset)}</span>
                            
                            <!-- Speaker Inline Input with Autocomplete Datalist -->
                            <div style="display: inline-flex; align-items: center; gap: 4px;">
                                <input type="text" class="form-control speaker-inline-input" data-id="${seg.id}" data-current-name="${seg.speaker_name || ''}" list="speakers-datalist" value="${seg.speaker_name || ''}" style="width: 140px; height: 26px; padding: 2px 8px; font-size: 0.8rem; font-weight: 600; border-radius: 6px; ${bgStyle}" placeholder="Type name..." />
                                <button class="btn btn-secondary btn-icon-only btn-rename-inline" data-id="${seg.id}" title="Save speaker identity" style="padding: 2px; width: 26px; height: 26px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;">
                                    <i data-lucide="check" style="width: 12px; height: 12px; color: var(--accent);"></i>
                                </button>
                            </div>


                            <!-- Emotion Selection Dropdown -->
                            <div>
                                <select class="emotion-badge-select ${emotionClass} ${correctedClass}" data-id="${seg.id}" title="Correct segment emotion">
                                    ${emotionOptionsHtml}
                                </select>
                            </div>
                        </div>

                        <!-- Segment Actions -->
                        <div class="segment-actions">
                            <button class="btn btn-icon-only btn-play-segment" data-id="${seg.id}" title="Play audio clip">
                                <i data-lucide="play" style="width: 14px; height: 14px;"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Transcript Content -->
                    <div class="segment-text" id="seg-text-${seg.id}">${seg.text || '<i>[No speech detected]</i>'}</div>

                    <!-- Custom timeline progress (only visible while playing) -->
                    <div class="mini-player" id="mini-player-${seg.id}" style="display: none; margin-top: 8px;">
                        <button class="mini-player-btn btn-pause-segment" data-id="${seg.id}">
                            <i data-lucide="pause" style="width: 12px; height: 12px;"></i>
                        </button>
                        <div class="mini-player-timeline" data-id="${seg.id}">
                            <div class="mini-player-progress" id="progress-bar-${seg.id}"></div>
                        </div>
                        <span class="mini-player-time" id="progress-time-${seg.id}">0:00</span>
                    </div>

                    <!-- Toggles & Flag Indicators (collapsible settings row) -->
                    <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 8px; font-size: 0.8rem; color: var(--text-muted);">
                        <label class="checkbox-control">
                            <input type="checkbox" class="cb-misidentified" data-id="${seg.id}" ${seg.is_misidentified ? 'checked' : ''} />
                            <span>Wrong Speaker Profile</span>
                        </label>
                        ${seg.emotion_corrected ? `
                            <label class="checkbox-control">
                                <input type="checkbox" class="cb-emotion-misidentified" data-id="${seg.id}" ${seg.emotion_misidentified ? 'checked' : ''} />
                                <span>Wrong Emotion Learn</span>
                            </label>
                        ` : ''}
                        
                        <!-- Confidence Level -->
                        ${seg.confidence ? `
                            <span style="margin-left: auto;">Voice Conf: ${(seg.confidence * 100).toFixed(0)}%</span>
                        ` : ''}
                        
                        ${seg.emotion_confidence ? `
                            <span style="${seg.confidence ? '' : 'margin-left: auto;'}">Emotion Conf: ${(seg.emotion_confidence * 100).toFixed(0)}%</span>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        lucide.createIcons();
        this.setupSegmentInteractions();
    },

    setupActionListeners() {
        const titleInput = document.getElementById('conversation-title-input');
        const btnReprocess = document.getElementById('btn-reprocess');
        const btnRecalc = document.getElementById('btn-recalc-emotions');

        // Rename title on blur or enter key
        if (titleInput) {
            const handleRename = async () => {
                const newTitle = titleInput.value.trim();
                if (newTitle && newTitle !== this.conversation.title) {
                    try {
                        await api.updateConversationTitle(this.conversationId, newTitle);
                        window.showToast('Title updated successfully.', 'success');
                        this.conversation.title = newTitle;
                    } catch (e) {
                        window.showToast(`Failed to rename: ${e.message}`, 'danger');
                        titleInput.value = this.conversation.title;
                    }
                }
            };

            titleInput.addEventListener('blur', handleRename);
            titleInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    titleInput.blur();
                }
            });
        }

        // Reprocess Audio
        if (btnReprocess) {
            btnReprocess.addEventListener('click', async () => {
                if (confirm('Are you sure you want to re-run the diarization and transcription? This will overwrite your manual corrections.')) {
                    try {
                        btnReprocess.disabled = true;
                        window.showToast('Reprocessing started. This will take a moment...', 'warning');
                        await api.reprocessConversation(this.conversationId);
                        window.showToast('Diarization reprocess completed.', 'success');
                        await this.loadData();
                    } catch (e) {
                        window.showToast(`Reprocess failed: ${e.message}`, 'danger');
                    } finally {
                        btnReprocess.disabled = false;
                    }
                }
            });
        }

        // Recalculate Emotions
        if (btnRecalc) {
            btnRecalc.addEventListener('click', async () => {
                try {
                    btnRecalc.disabled = true;
                    window.showToast('Recalculating emotions with custom voice profiles...', 'warning');
                    const res = await api.recalculateEmotions(this.conversationId);
                    window.showToast(`Recalculation complete. Updated ${res.updated} segments.`, 'success');
                    await this.loadData();
                } catch (e) {
                    window.showToast(`Recalculation failed: ${e.message}`, 'danger');
                } finally {
                    btnRecalc.disabled = false;
                }
            });
        }

        // Modal close button
        const btnCloseModal = document.getElementById('btn-close-enroll-modal');
        const btnCancelEnroll = document.getElementById('btn-cancel-enroll');
        const enrollModal = document.getElementById('enroll-modal');

        const closeModal = () => enrollModal.classList.remove('active');
        
        // Export Transcript buttons
        document.querySelectorAll('.btn-export').forEach(btn => {
            btn.addEventListener('click', () => {
                const format = btn.getAttribute('data-format');
                const url = api.getExportTranscriptUrl(this.conversationId, format);
                window.open(url, '_blank');
            });
        });
    },


    setupSegmentInteractions() {
        const list = document.getElementById('detail-segments-list');
        if (!list) return;

        // Inline speaker renaming / identification
        list.querySelectorAll('.btn-rename-inline').forEach(btn => {
            btn.addEventListener('click', async () => {
                const segmentId = btn.getAttribute('data-id');
                const input = list.querySelector(`.speaker-inline-input[data-id="${segmentId}"]`);
                if (!input) return;

                const newName = input.value.trim();
                const oldName = input.getAttribute('data-current-name');

                if (!newName) {
                    window.showToast('Speaker name cannot be empty.', 'warning');
                    return;
                }

                if (newName === oldName) {
                    window.showToast('Speaker name has not changed.', 'info');
                    return;
                }

                // Check if the name exists in the enrolled speakers
                const existingSpeaker = this.speakers.find(sp => sp.name.toLowerCase() === newName.toLowerCase());

                if (existingSpeaker) {
                    // Identify as existing speaker
                    try {
                        btn.disabled = true;
                        input.disabled = true;
                        window.showToast(`Assigning segment to speaker "${existingSpeaker.name}"...`, 'warning');
                        await api.identifySpeakerInSegment(this.conversationId, segmentId, {
                            speakerId: existingSpeaker.id,
                            enroll: false
                        });
                        window.showToast(`Segment assigned to speaker "${existingSpeaker.name}".`, 'success');
                        await this.loadData();
                    } catch (err) {
                        window.showToast(`Failed to assign speaker: ${err.message}`, 'danger');
                        input.value = oldName;
                        btn.disabled = false;
                        input.disabled = false;
                    }
                } else {
                    // Create new speaker (enroll)
                    if (confirm(`Do you want to enroll "${newName}" as a new speaker profile using this segment's voice print? This will also retroactively link other segments of the previous unknown speaker.`)) {
                        try {
                            btn.disabled = true;
                            input.disabled = true;
                            window.showToast(`Enrolling new speaker "${newName}"...`, 'warning');
                            await api.identifySpeakerInSegment(this.conversationId, segmentId, {
                                speakerName: newName,
                                enroll: true
                            });
                            window.showToast(`Speaker "${newName}" enrolled successfully. Past segments updated.`, 'success');
                            await this.loadData();
                        } catch (err) {
                            window.showToast(`Failed to enroll speaker: ${err.message}`, 'danger');
                            input.value = oldName;
                            btn.disabled = false;
                            input.disabled = false;
                        }
                    } else {
                        input.value = oldName;
                    }
                }
            });
        });

        // Handle Enter inside input field
        list.querySelectorAll('.speaker-inline-input').forEach(input => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const segmentId = input.getAttribute('data-id');
                    const btn = list.querySelector(`.btn-rename-inline[data-id="${segmentId}"]`);
                    if (btn) btn.click();
                }
            });
        });


        // Emotion correction dropdown
        list.querySelectorAll('.emotion-badge-select').forEach(select => {
            let previousValue = select.value;

            select.addEventListener('change', async (e) => {
                const segmentId = select.getAttribute('data-id');
                const emotion = e.target.value;

                try {
                    select.disabled = true;
                    window.showToast('Saving emotion correction...', 'warning');
                    await api.correctEmotionInSegment(this.conversationId, segmentId, emotion, true);
                    window.showToast('Emotion updated and added to voice profile learning.', 'success');
                    
                    // Reload to update confidence percentages and misidentified options
                    await this.loadData();
                } catch (err) {
                    window.showToast(`Failed to correct emotion: ${err.message}`, 'danger');
                    select.value = previousValue;
                    select.disabled = false;
                }
            });
        });

        // Speaker Misidentified toggle
        list.querySelectorAll('.cb-misidentified').forEach(cb => {
            cb.addEventListener('change', async (e) => {
                const segmentId = cb.getAttribute('data-id');
                const card = document.getElementById(`seg-card-${segmentId}`);
                
                try {
                    cb.disabled = true;
                    const res = await api.toggleSegmentMisidentified(this.conversationId, segmentId, e.target.checked);
                    window.showToast(res.message, 'success');
                    
                    if (e.target.checked) {
                        card.classList.add('misidentified');
                    } else {
                        card.classList.remove('misidentified');
                    }
                } catch (err) {
                    window.showToast(`Update failed: ${err.message}`, 'danger');
                    cb.checked = !cb.checked;
                } finally {
                    cb.disabled = false;
                }
            });
        });

        // Emotion Learn Misidentified toggle
        list.querySelectorAll('.cb-emotion-misidentified').forEach(cb => {
            cb.addEventListener('change', async (e) => {
                const segmentId = cb.getAttribute('data-id');
                
                try {
                    cb.disabled = true;
                    const res = await api.toggleEmotionMisidentified(this.conversationId, segmentId, e.target.checked);
                    window.showToast(res.message, 'success');
                } catch (err) {
                    window.showToast(`Update failed: ${err.message}`, 'danger');
                    cb.checked = !cb.checked;
                } finally {
                    cb.disabled = false;
                }
            });
        });

        // Segment play buttons
        list.querySelectorAll('.btn-play-segment').forEach(btn => {
            btn.addEventListener('click', () => {
                const segmentId = btn.getAttribute('data-id');
                this.playSegment(segmentId);
            });
        });

        // Segment pause buttons
        list.querySelectorAll('.btn-pause-segment').forEach(btn => {
            btn.addEventListener('click', () => {
                this.audioPlayer.pause();
            });
        });

        // Seek timeline progress click
        list.querySelectorAll('.mini-player-timeline').forEach(timeline => {
            timeline.addEventListener('click', (e) => {
                const segmentId = timeline.getAttribute('data-id');
                if (this.playingSegmentId === segmentId) {
                    const rect = timeline.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const width = rect.width;
                    const pct = clickX / width;
                    this.audioPlayer.currentTime = pct * this.audioPlayer.duration;
                }
            });
        });
    },

    openEnrollModal(segmentId, selectElement, previousValue) {
        const modal = document.getElementById('enroll-modal');
        const input = document.getElementById('new-speaker-name');
        const btnConfirm = document.getElementById('btn-confirm-enroll');

        if (!modal || !input || !btnConfirm) return;

        input.value = '';
        modal.classList.add('active');
        input.focus();

        // Clear previous listeners to avoid double submits
        const newBtnConfirm = btnConfirm.cloneNode(true);
        btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);

        newBtnConfirm.addEventListener('click', async () => {
            const name = input.value.trim();
            if (!name) {
                window.showToast('Please specify a speaker name.', 'warning');
                return;
            }

            try {
                modal.classList.remove('active');
                selectElement.disabled = true;
                window.showToast(`Enrolling speaker "${name}" and processing segments...`, 'warning');
                
                await api.identifySpeakerInSegment(this.conversationId, segmentId, {
                    speakerName: name,
                    enroll: true
                });
                
                window.showToast(`Speaker "${name}" enrolled successfully. Past segments merged.`, 'success');
                await this.loadData();
            } catch (err) {
                window.showToast(`Enrollment failed: ${err.message}`, 'danger');
                selectElement.value = previousValue;
                selectElement.disabled = false;
            }
        });
    },

    playSegment(segmentId) {
        // Stop current playing
        if (this.playingSegmentId) {
            this.stopTimelineTracking();
            const oldPlayer = document.getElementById(`mini-player-${this.playingSegmentId}`);
            const oldPlayBtn = document.querySelector(`.btn-play-segment[data-id="${this.playingSegmentId}"]`);
            if (oldPlayer) oldPlayer.style.display = 'none';
            if (oldPlayBtn) oldPlayBtn.style.display = 'inline-flex';
        }

        this.playingSegmentId = segmentId;
        
        // Update play control indicators
        const playBtn = document.querySelector(`.btn-play-segment[data-id="${segmentId}"]`);
        const playerWidget = document.getElementById(`mini-player-${segmentId}`);
        if (playBtn) playBtn.style.display = 'none';
        if (playerWidget) playerWidget.style.display = 'flex';

        // Load and play
        this.audioPlayer.src = api.getSegmentAudioUrl(segmentId);
        this.audioPlayer.play().catch(e => {
            console.error('Audio playback failed:', e);
            window.showToast('Failed to play segment audio clip.', 'danger');
            this.handleAudioEnded();
        });

        // Track timeline progress
        this.startTimelineTracking(segmentId);
    },

    handleAudioEnded() {
        if (this.playingSegmentId) {
            this.stopTimelineTracking();
            const playerWidget = document.getElementById(`mini-player-${this.playingSegmentId}`);
            const playBtn = document.querySelector(`.btn-play-segment[data-id="${this.playingSegmentId}"]`);
            if (playerWidget) playerWidget.style.display = 'none';
            if (playBtn) playBtn.style.display = 'inline-flex';
            this.playingSegmentId = null;
        }
    },

    startTimelineTracking(segmentId) {
        const progressBar = document.getElementById(`progress-bar-${segmentId}`);
        const progressTime = document.getElementById(`progress-time-${segmentId}`);

        this.playProgressInterval = setInterval(() => {
            if (this.audioPlayer.duration) {
                const cur = this.audioPlayer.currentTime;
                const dur = this.audioPlayer.duration;
                const pct = (cur / dur) * 100;
                
                if (progressBar) progressBar.style.width = `${pct}%`;
                if (progressTime) progressTime.textContent = this.formatDuration(cur);
            }
        }, 100);
    },

    stopTimelineTracking() {
        if (this.playProgressInterval) {
            clearInterval(this.playProgressInterval);
            this.playProgressInterval = null;
        }
    },

    formatDuration(secs) {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }
};
