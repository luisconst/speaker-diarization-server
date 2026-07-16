import api from '../api.js';

export default {
    conversationId: null,
    conversation: null,
    speakers: [],
    audioPlayer: null,
    playingSegmentId: null,
    playProgressInterval: null,
    readingMode: true,
    readingAudioPlayer: null,
    readingTimeUpdateHandler: null,
    readingParagraphs: [],

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
                                <input type="text" id="conversation-title-input" class="form-control" style="font-family: var(--font-heading); font-size: 1.25rem; font-weight: 600; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.15); border-radius: 6px; padding: 4px 12px; width: 100%; transition: all 0.2s ease;" title="Click to edit title" onfocus="this.style.background='var(--card-bg)'; this.style.borderStyle='solid'; this.style.borderColor='var(--primary)';" onblur="this.style.background='rgba(255,255,255,0.02)'; this.style.borderStyle='dashed'; this.style.borderColor='rgba(255,255,255,0.15)';" onmouseover="this.style.borderColor='rgba(255,255,255,0.35)'" onmouseout="if(document.activeElement!==this)this.style.borderColor='rgba(255,255,255,0.15)'" />
                            </div>
                            <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                                <select id="conversation-category" class="form-control" style="width: 140px; height: 38px; font-size: 0.85rem; background-color: #16182c !important; color: #ffffff !important; border: 1px solid rgba(255, 255, 255, 0.15) !important;" title="Select category">
                                    <option value="">No Category</option>
                                    <option value="reuniao">Reunião</option>
                                    <option value="aula">Aula</option>
                                    <option value="encontro">Encontro</option>
                                    <option value="entrevista">Entrevista</option>
                                    <option value="podcast">Podcast</option>
                                    <option value="video">Vídeo</option>
                                    <option value="outro">Outro</option>
                                </select>
                                <button class="btn btn-secondary" id="btn-recalc-emotions" title="Re-evaluate emotions with personalized profiles">
                                    <i data-lucide="smile"></i> Recalculate Emotions
                                </button>
                                <button class="btn btn-secondary" id="btn-rematch-speakers" title="Instantly match all Unknown voices in this conversation against your trained voice profiles (Fast, no audio re-processing)">
                                    <i data-lucide="user-check"></i> Rematch Speakers
                                </button>
                                <button class="btn btn-secondary" id="btn-summarize" title="Generate AI summary of the meeting/lesson using local Ollama">
                                    <i data-lucide="sparkles"></i> Generate Summary
                                </button>
                                <button class="btn btn-secondary" id="btn-reprocess" title="Run full diarization & whisper pipeline again">
                                    <i data-lucide="refresh-cw"></i> Reprocess Audio
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- AI Summary Card -->
                    <div class="content-card summary-card" id="detail-summary-card" style="display: none; margin-top: 16px; padding: 20px;">
                        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08);">
                            <h2 style="margin: 0; display: flex; align-items: center; gap: 8px; font-family: var(--font-heading); font-size: 1.1rem; color: var(--primary);">
                                <i data-lucide="sparkles"></i> AI-Generated Summary & Action Items
                            </h2>
                            <button class="btn btn-secondary btn-icon-only" id="btn-toggle-summary" title="Collapse/Expand Summary" style="padding: 2px; width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center;">
                                <i data-lucide="chevron-up" style="width: 14px; height: 14px;"></i>
                            </button>
                        </div>
                        <div class="summary-content" id="detail-summary-content" style="max-height: 400px; overflow-y: auto; padding-right: 8px; font-size: 0.9rem; line-height: 1.6; white-space: pre-wrap;"></div>
                    </div>

                    <!-- Transcript Card -->
                    <div class="content-card" style="flex: 1; display: flex; flex-direction: column; overflow: hidden; margin-top: 16px; margin-bottom: 0; padding-bottom: 12px;">
                        <div class="card-header" style="margin-bottom: 12px;">
                            <h2>Transcript & Segments</h2>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <div class="view-mode-toggle">
                                    <button class="view-mode-btn active" id="btn-reading-mode" title="Continuous reading with audio follow-along">
                                        <i data-lucide="book-open" style="width: 14px; height: 14px;"></i> Leitura
                                    </button>
                                    <button class="view-mode-btn" id="btn-segment-mode" title="Individual segments with editing controls">
                                        <i data-lucide="list" style="width: 14px; height: 14px;"></i> Segmentos
                                    </button>
                                </div>
                                <span class="badge badge-info" id="detail-num-speakers">0 Speakers</span>
                            </div>
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

                    <!-- Export & Download Card -->
                    <div class="content-card">
                        <div class="card-header" style="margin-bottom: 16px;">
                            <h2>Export & Download</h2>
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
                            <button class="btn btn-secondary" id="btn-export-md" style="grid-column: span 2; padding: 6px 10px; font-size: 0.8rem; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                                <i data-lucide="file-text" style="width: 14px; height: 14px; color: var(--accent);"></i> Export Markdown
                            </button>
                            <button class="btn btn-primary" id="btn-download-audio" style="grid-column: span 2; padding: 6px 10px; font-size: 0.8rem; font-weight: 600; margin-top: 4px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                                <i data-lucide="download" style="width: 14px; height: 14px; color: #fff;"></i> Download Audio
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

        // Cleanup previous reading audio player
        if (this.readingAudioPlayer) {
            this.readingAudioPlayer.pause();
            this.readingAudioPlayer.removeEventListener('timeupdate', this.readingTimeUpdateHandler);
            this.readingAudioPlayer = null;
        }

        if (this.pollTimeout) {
            clearTimeout(this.pollTimeout);
            this.pollTimeout = null;
        }

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

            // Handle polling if processing in the background
            if (this.conversation.status === 'processing') {
                const btnReprocess = document.getElementById('btn-reprocess');
                const btnRecalc = document.getElementById('btn-recalc-emotions');
                if (btnReprocess) {
                    btnReprocess.disabled = true;
                    btnReprocess.innerHTML = '<i data-lucide="loader-2" class="spinner-icon animate-spin" style="width: 14px; height: 14px; margin-right: 6px; display: inline-block; vertical-align: middle;"></i> Reprocessing...';
                    lucide.createIcons();
                }
                if (btnRecalc) {
                    btnRecalc.disabled = true;
                }

                if (this.pollTimeout) clearTimeout(this.pollTimeout);
                this.pollTimeout = setTimeout(async () => {
                    if (window.location.hash === `#/conversations/${this.conversationId}`) {
                        await this.loadData();
                    }
                }, 3000);
            }

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

        // Category select
        const categorySelect = document.getElementById('conversation-category');
        if (categorySelect) {
            categorySelect.value = this.conversation.category || '';
        }

        // Summary card
        const summaryCard = document.getElementById('detail-summary-card');
        const summaryContent = document.getElementById('detail-summary-content');
        if (summaryCard && summaryContent) {
            if (this.conversation.summary) {
                summaryCard.style.display = 'block';
                summaryContent.innerHTML = this.renderMarkdown(this.conversation.summary);
            } else {
                summaryCard.style.display = 'none';
            }
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

    renderMarkdown(text) {
        if (!text) return '';
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
            
        // Headers
        html = html.replace(/^### (.*$)/gim, '<h4 style="color: var(--primary); margin-top: 12px; margin-bottom: 6px; font-family: var(--font-heading);">$1</h4>');
        html = html.replace(/^## (.*$)/gim, '<h3 style="color: var(--primary); margin-top: 16px; margin-bottom: 8px; font-family: var(--font-heading);">$1</h3>');
        html = html.replace(/^# (.*$)/gim, '<h2 style="color: var(--primary); margin-top: 20px; margin-bottom: 10px; font-family: var(--font-heading);">$1</h2>');
        
        // Bold
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Checklist/Task list
        html = html.replace(/^- \[ \] (.*$)/gim, '<li style="list-style: none; margin-left: 0; padding-left: 0;"><label class="checkbox-control" style="display: inline-flex; pointer-events: none; margin-bottom: 4px;"><input type="checkbox" /> <span style="margin-left: 8px;">$1</span></label></li>');
        html = html.replace(/^- \[x\] (.*$)/gim, '<li style="list-style: none; margin-left: 0; padding-left: 0;"><label class="checkbox-control" style="display: inline-flex; pointer-events: none; margin-bottom: 4px;"><input type="checkbox" checked /> <span style="margin-left: 8px;">$1</span></label></li>');
        
        // Bullet lists
        html = html.replace(/^- (.*$)/gim, '<li style="margin-left: 20px; margin-bottom: 4px;">$1</li>');
        
        return html;
    },

    renderSegments() {
        if (this.readingMode) {
            this.renderReadingMode();
        } else {
            this.renderSegmentMode();
        }
    },

    // Helper to hash speaker name to a deterministic color
    _hashCode(str) {
        let hash = 0;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) {
            const char = s.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return hash;
    },

    _speakerColors: ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'],

    _getSpeakerColor(speakerStr) {
        return this._speakerColors[Math.abs(this._hashCode(speakerStr)) % this._speakerColors.length];
    },

    /**
     * Merge texts from consecutive segments, removing duplicate words at boundaries.
     */
    _mergeSegmentTexts(segments) {
        if (!segments.length) return '';
        
        let merged = (segments[0].text || '').trim();
        
        for (let i = 1; i < segments.length; i++) {
            const nextText = (segments[i].text || '').trim();
            if (!nextText) continue;
            if (!merged) { merged = nextText; continue; }
            
            // Get last N words of current and first N words of next (check up to 3 words overlap)
            const currentWords = merged.split(/\s+/);
            const nextWords = nextText.split(/\s+/);
            
            let overlapLen = 0;
            // Check for overlapping boundary words (1 to 3 words)
            for (let n = Math.min(3, currentWords.length, nextWords.length); n >= 1; n--) {
                const tail = currentWords.slice(-n).map(w => w.toLowerCase().replace(/[.,!?;:]+$/g, ''));
                const head = nextWords.slice(0, n).map(w => w.toLowerCase().replace(/[.,!?;:]+$/g, ''));
                
                if (tail.join(' ') === head.join(' ')) {
                    overlapLen = n;
                    break;
                }
            }
            
            if (overlapLen > 0) {
                // Remove the overlapping words from the next segment's start
                merged += ' ' + nextWords.slice(overlapLen).join(' ');
            } else {
                merged += ' ' + nextText;
            }
        }
        
        return merged.trim();
    },

    // ===== READING MODE =====
    renderReadingMode() {
        const list = document.getElementById('detail-segments-list');
        if (!list || !this.conversation) return;

        if (this.conversation.status === 'processing') {
            list.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 60px 40px; display: flex; flex-direction: column; align-items: center; gap: 16px;">
                    <div class="spinner" style="width: 32px; height: 32px; border-width: 3px; border-top-color: var(--primary);"></div>
                    <div style="font-weight: 500; font-size: 1.1rem; color: var(--text);">Reprocessing Audio...</div>
                    <p style="max-width: 400px; font-size: 0.85rem; line-height: 1.5; color: var(--text-muted);">
                        The Whisper model is transcribing and the Pyannote diarization model is grouping speakers. You can leave this page; processing will continue in the background.
                    </p>
                </div>
            `;
            return;
        }

        const segments = this.conversation.transcript_segments || [];

        if (segments.length === 0) {
            list.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 40px;">
                    No transcript segments generated yet.
                </div>
            `;
            return;
        }

        // Sort segments chronologically
        segments.sort((a, b) => a.start_offset - b.start_offset);

        // Group consecutive segments by speaker into paragraphs
        const paragraphs = [];
        let currentPara = null;

        for (const seg of segments) {
            const speakerKey = String(seg.speaker_name || 'Unknown');
            if (!currentPara || currentPara.speaker !== speakerKey) {
                currentPara = {
                    speaker: speakerKey,
                    segments: [],
                    startOffset: seg.start_offset,
                    endOffset: seg.end_offset
                };
                paragraphs.push(currentPara);
            }
            currentPara.segments.push(seg);
            currentPara.endOffset = seg.end_offset;
        }

        // Store for karaoke tracking
        this.readingParagraphs = paragraphs;

        // Build the continuous audio player
        const playerHtml = `
            <div class="reading-player" id="reading-player">
                <button class="reading-player-btn" id="reading-play-btn" title="Play / Pause">
                    <i data-lucide="play" style="width: 18px; height: 18px;" id="reading-play-icon"></i>
                </button>
                <div class="reading-player-timeline">
                    <div class="reading-player-seekbar" id="reading-seekbar">
                        <div class="reading-player-seekbar-fill" id="reading-seekbar-fill"></div>
                    </div>
                    <div class="reading-player-times">
                        <span id="reading-current-time">0:00</span>
                        <span id="reading-total-time">${this.conversation.duration ? this.formatDuration(this.conversation.duration) : '0:00'}</span>
                    </div>
                </div>
                <button class="reading-player-speed" id="reading-speed-btn" title="Playback speed">1x</button>
            </div>
        `;

        // Build paragraph blocks
        const paragraphsHtml = paragraphs.map((para, idx) => {
            const speakerStr = String(para.speaker || 'Unknown');
            const speakerColor = this._getSpeakerColor(speakerStr);
            const mergedText = this._mergeSegmentTexts(para.segments);
            const timeLabel = `${this.formatDuration(para.startOffset)} – ${this.formatDuration(para.endOffset)}`;

            return `
                <div class="reading-paragraph" id="reading-para-${idx}" data-index="${idx}" data-start="${para.startOffset}" data-end="${para.endOffset}">
                    <div class="reading-speaker-row">
                        <span class="reading-speaker-label" style="color: ${speakerColor};">${speakerStr}</span>
                        <span class="reading-time-label">${timeLabel}</span>
                    </div>
                    <div class="reading-text">${mergedText}</div>
                </div>
            `;
        }).join('');

        list.classList.add('reading-view');
        list.innerHTML = playerHtml + `<div class="reading-transcript" id="reading-transcript">${paragraphsHtml}</div>`;

        lucide.createIcons();
        this.setupReadingModeInteractions();
    },

    setupReadingModeInteractions() {
        // Initialize or reuse the audio player for full conversation audio
        if (!this.readingAudioPlayer) {
            this.readingAudioPlayer = new Audio();
            this.readingAudioPlayer.preload = 'auto';
        }
        const audio = this.readingAudioPlayer;
        audio.src = api.getConversationAudioStreamUrl(this.conversationId);

        const playBtn = document.getElementById('reading-play-btn');
        const seekbar = document.getElementById('reading-seekbar');
        const seekbarFill = document.getElementById('reading-seekbar-fill');
        const currentTimeEl = document.getElementById('reading-current-time');
        const totalTimeEl = document.getElementById('reading-total-time');
        const speedBtn = document.getElementById('reading-speed-btn');
        const transcript = document.getElementById('reading-transcript');
        const list = document.getElementById('detail-segments-list');

        // Play / Pause toggle
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                if (audio.paused) {
                    audio.play().catch(e => {
                        console.error('Audio playback failed:', e);
                        window.showToast('Failed to play audio.', 'danger');
                    });
                } else {
                    audio.pause();
                }
            });
        }

        // Update play/pause icon
        audio.addEventListener('play', () => {
            const icon = document.getElementById('reading-play-icon');
            if (icon) {
                icon.setAttribute('data-lucide', 'pause');
                lucide.createIcons();
            }
        });

        audio.addEventListener('pause', () => {
            const icon = document.getElementById('reading-play-icon');
            if (icon) {
                icon.setAttribute('data-lucide', 'play');
                lucide.createIcons();
            }
        });

        // Update total time when metadata loads
        audio.addEventListener('loadedmetadata', () => {
            if (totalTimeEl) totalTimeEl.textContent = this.formatDuration(audio.duration);
        });

        // Seekbar click
        if (seekbar) {
            seekbar.addEventListener('click', (e) => {
                if (!audio.duration) return;
                const rect = seekbar.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                audio.currentTime = pct * audio.duration;
            });
        }

        // Speed control
        const speeds = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];
        let speedIndex = 0;
        if (speedBtn) {
            speedBtn.addEventListener('click', () => {
                speedIndex = (speedIndex + 1) % speeds.length;
                audio.playbackRate = speeds[speedIndex];
                speedBtn.textContent = `${speeds[speedIndex]}x`;
            });
        }

        // Timeupdate — karaoke highlight + auto-scroll
        if (this.readingTimeUpdateHandler) {
            audio.removeEventListener('timeupdate', this.readingTimeUpdateHandler);
        }

        let lastActiveIdx = -1;

        this.readingTimeUpdateHandler = () => {
            const currentTime = audio.currentTime;
            
            // Update seekbar
            if (seekbarFill && audio.duration) {
                seekbarFill.style.width = `${(currentTime / audio.duration) * 100}%`;
            }
            if (currentTimeEl) {
                currentTimeEl.textContent = this.formatDuration(currentTime);
            }

            // Find active paragraph
            let activeIdx = -1;
            for (let i = 0; i < this.readingParagraphs.length; i++) {
                const para = this.readingParagraphs[i];
                if (currentTime >= para.startOffset && currentTime < para.endOffset) {
                    activeIdx = i;
                    break;
                }
            }
            // If between paragraphs, highlight the next one approaching
            if (activeIdx === -1) {
                for (let i = 0; i < this.readingParagraphs.length; i++) {
                    if (currentTime < this.readingParagraphs[i].startOffset) {
                        // We're in a gap before this paragraph
                        // Keep the previous as active if close enough
                        if (i > 0 && currentTime - this.readingParagraphs[i-1].endOffset < 2) {
                            activeIdx = i - 1;
                        }
                        break;
                    }
                }
                // If past all paragraphs
                if (activeIdx === -1 && this.readingParagraphs.length > 0) {
                    const last = this.readingParagraphs[this.readingParagraphs.length - 1];
                    if (currentTime >= last.startOffset) {
                        activeIdx = this.readingParagraphs.length - 1;
                    }
                }
            }

            if (activeIdx !== lastActiveIdx) {
                // Update CSS classes on all paragraphs
                document.querySelectorAll('.reading-paragraph').forEach((el, i) => {
                    el.classList.remove('active', 'past');
                    if (i === activeIdx) {
                        el.classList.add('active');
                    } else if (i < activeIdx) {
                        el.classList.add('past');
                    }
                });

                // Auto-scroll the active paragraph into view
                if (activeIdx >= 0) {
                    const activeEl = document.getElementById(`reading-para-${activeIdx}`);
                    if (activeEl && list) {
                        const containerRect = list.getBoundingClientRect();
                        const elRect = activeEl.getBoundingClientRect();
                        
                        // Only scroll if element is not visible or near edges
                        const isVisible = elRect.top >= containerRect.top && elRect.bottom <= containerRect.bottom;
                        if (!isVisible) {
                            activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }
                }

                lastActiveIdx = activeIdx;
            }
        };

        audio.addEventListener('timeupdate', this.readingTimeUpdateHandler);

        // Click-to-seek on paragraphs
        if (transcript) {
            transcript.addEventListener('click', (e) => {
                const paraEl = e.target.closest('.reading-paragraph');
                if (!paraEl) return;
                const startTime = parseFloat(paraEl.dataset.start);
                if (!isNaN(startTime)) {
                    audio.currentTime = startTime;
                    if (audio.paused) {
                        audio.play().catch(() => {});
                    }
                }
            });
        }
    },

    // ===== SEGMENT MODE (original) =====
    renderSegmentMode() {
        const list = document.getElementById('detail-segments-list');
        if (!list || !this.conversation) return;

        // Remove reading-view class
        list.classList.remove('reading-view');

        // Pause reading audio if playing
        if (this.readingAudioPlayer && !this.readingAudioPlayer.paused) {
            this.readingAudioPlayer.pause();
        }

        if (this.conversation.status === 'processing') {
            list.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 60px 40px; display: flex; flex-direction: column; align-items: center; gap: 16px;">
                    <div class="spinner" style="width: 32px; height: 32px; border-width: 3px; border-top-color: var(--primary);"></div>
                    <div style="font-weight: 500; font-size: 1.1rem; color: var(--text);">Reprocessing Audio...</div>
                    <p style="max-width: 400px; font-size: 0.85rem; line-height: 1.5; color: var(--text-muted);">
                        The Whisper model is transcribing and the Pyannote diarization model is grouping speakers. You can leave this page; processing will continue in the background.
                    </p>
                </div>
            `;
            return;
        }

        const segments = this.conversation.transcript_segments || [];

        if (segments.length === 0) {
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
        const speakersList = Array.isArray(this.speakers) ? this.speakers : [];
        const datalistHtml = `<datalist id="speakers-datalist">${speakersList.map(sp => `<option value="${sp.name || ''}"></option>`).join('')}</datalist>`;

        // Group consecutive segments by speaker
        const groups = [];
        let currentGroup = null;

        for (const seg of segments) {
            const speakerKey = String(seg.speaker_name || 'Unknown');
            if (!currentGroup || currentGroup.speaker !== speakerKey) {
                currentGroup = {
                    speaker: speakerKey,
                    speaker_id: seg.speaker_id,
                    segments: [],
                    first_segment_id: seg.id
                };
                groups.push(currentGroup);
            }
            currentGroup.segments.push(seg);
        }

        let groupsHtml = groups.map(group => {
            const speakerStr = String(group.speaker || 'Unknown');
            const speakerColor = this._getSpeakerColor(speakerStr);
            const isUnknown = speakerStr.startsWith('Unknown_') || speakerStr === 'Unknown';
            const bgStyle = isUnknown 
                ? 'background-color: rgba(255, 255, 255, 0.04); color: var(--text-muted); border-color: rgba(255, 255, 255, 0.1);' 
                : `background-color: rgba(99, 102, 241, 0.05); color: ${speakerColor}; border: 1px solid ${speakerColor}40;`;

            const segmentsHtml = group.segments.map(seg => {
                const emotionClass = seg.emotion_category === 'neutral' ? 'neutral' : 
                                     (seg.emotion_category === 'angry' ? 'angry' : 
                                      (seg.emotion_category === 'sad' ? 'sad' : ''));
                const correctedClass = seg.emotion_corrected ? 'corrected' : '';

                const emotions = ['neutral', 'angry', 'happy', 'sad', 'surprised', 'disgusted', 'fearful', 'other', 'unknown'];
                const emotionOptionsHtml = emotions.map(emo => `
                    <option value="${emo}" ${seg.emotion_category === emo ? 'selected' : ''}>${emo.toUpperCase()}</option>
                `).join('');

                return `
                    <div class="segment-card ${seg.is_misidentified ? 'misidentified' : ''}" id="seg-card-${seg.id}" data-id="${seg.id}" style="border-left: 3px solid ${speakerColor} !important; margin-bottom: 2px;">
                        <div class="segment-header">
                            <div class="segment-meta" style="flex-wrap: wrap; gap: 10px;">
                                <span class="segment-time">${this.formatDuration(seg.start_offset)} - ${this.formatDuration(seg.end_offset)}</span>
                                
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
                        <div class="segment-text editable-transcript-text" id="seg-text-${seg.id}" contenteditable="true" title="Click to edit transcript text" style="outline: none; border-radius: 4px; padding: 4px 8px; margin: 4px -8px; transition: all 0.2s; min-height: 24px;" data-id="${seg.id}">${seg.text || ''}</div>

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

            return `
                <div class="speaker-group" data-speaker="${speakerStr}" style="margin-bottom: 12px; background: rgba(255,255,255,0.01); border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.03);">
                    <div class="speaker-group-header" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.03);">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="speaker-group-name" style="border-left: 3px solid ${speakerColor}; padding-left: 8px; font-weight: 600; font-size: 0.9rem; color: ${isUnknown ? 'var(--text-muted)' : speakerColor};">${speakerStr}</span>
                            
                            <!-- Speaker Inline Input with Autocomplete Datalist -->
                            <div style="display: inline-flex; align-items: center; gap: 4px; margin-left: 12px;">
                                <input type="text" class="form-control speaker-inline-input" data-id="${group.first_segment_id}" data-current-name="${speakerStr}" list="speakers-datalist" value="${isUnknown ? '' : speakerStr}" style="width: 140px; height: 26px; padding: 2px 8px; font-size: 0.8rem; font-weight: 600; border-radius: 6px; ${bgStyle}" placeholder="Rename speaker..." />
                                <button class="btn btn-secondary btn-icon-only btn-rename-inline" data-id="${group.first_segment_id}" title="Save speaker identity" style="padding: 2px; width: 26px; height: 26px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;">
                                    <i data-lucide="check" style="width: 12px; height: 12px; color: var(--accent);"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="speaker-group-segments">
                        ${segmentsHtml}
                    </div>
                </div>
            `;
        }).join('');

        list.innerHTML = datalistHtml + groupsHtml;

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
                    const originalHtml = btnReprocess.innerHTML;
                    try {
                        btnReprocess.disabled = true;
                        btnReprocess.innerHTML = '<i data-lucide="loader-2" class="spinner-icon animate-spin" style="width: 14px; height: 14px; margin-right: 6px; display: inline-block; vertical-align: middle;"></i> Reprocessing...';
                        lucide.createIcons();
                        window.showToast('Reprocessing started. This will take a moment...', 'warning');
                        await api.reprocessConversation(this.conversationId);
                        window.showToast('Diarization reprocess completed.', 'success');
                        await this.loadData();
                    } catch (e) {
                        window.showToast(`Reprocess failed: ${e.message}`, 'danger');
                    } finally {
                        btnReprocess.disabled = false;
                        btnReprocess.innerHTML = originalHtml;
                        lucide.createIcons();
                    }
                }
            });
        }

        // Rematch Speakers
        const btnRematch = document.getElementById('btn-rematch-speakers');
        if (btnRematch) {
            btnRematch.addEventListener('click', async () => {
                if (confirm('Are you sure you want to search and match all Unknown speakers in this transcript with your trained voice profiles? This is fast and will not change manually corrected names.')) {
                    try {
                        btnRematch.disabled = true;
                        window.showToast('Rematching speakers against trained profiles...', 'warning');
                        const res = await api.rematchSpeakers(this.conversationId);
                        window.showToast(res.message, 'success');
                        await this.loadData();
                    } catch (e) {
                        window.showToast(`Rematch failed: ${e.message}`, 'danger');
                    } finally {
                        btnRematch.disabled = false;
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

        // Category select change
        const categorySelect = document.getElementById('conversation-category');
        if (categorySelect) {
            categorySelect.addEventListener('change', async (e) => {
                const category = e.target.value;
                try {
                    await api.updateConversationCategory(this.conversationId, category);
                    window.showToast('Category updated successfully.', 'success');
                    this.conversation.category = category;
                } catch (err) {
                    window.showToast(`Failed to update category: ${err.message}`, 'danger');
                }
            });
        }

        // Generate Summary
        const btnSummarize = document.getElementById('btn-summarize');
        if (btnSummarize) {
            btnSummarize.addEventListener('click', async () => {
                try {
                    btnSummarize.disabled = true;
                    btnSummarize.innerHTML = '<i data-lucide="loader-2" class="spinner-icon animate-spin" style="width: 14px; height: 14px; margin-right: 6px; display: inline-block; vertical-align: middle;"></i> Summarizing...';
                    lucide.createIcons();
                    window.showToast('Generating AI summary via Ollama. This may take a minute...', 'warning');
                    
                    const res = await api.summarizeConversation(this.conversationId);
                    window.showToast(res.message, 'success');
                    await this.loadData();
                } catch (err) {
                    window.showToast(`Summarization failed: ${err.message}`, 'danger');
                } finally {
                    btnSummarize.disabled = false;
                    btnSummarize.innerHTML = '<i data-lucide="sparkles"></i> Generate Summary';
                    lucide.createIcons();
                }
            });
        }

        // Export Markdown
        const btnExportMd = document.getElementById('btn-export-md');
        if (btnExportMd) {
            btnExportMd.addEventListener('click', () => {
                const url = api.getExportTranscriptUrl(this.conversationId, 'markdown');
                window.open(url, '_blank');
            });
        }

        // Download original audio file
        const btnDownloadAudio = document.getElementById('btn-download-audio');
        if (btnDownloadAudio) {
            btnDownloadAudio.addEventListener('click', () => {
                const url = `/api/v1/conversations/${this.conversationId}/audio`;
                window.open(url, '_blank');
            });
        }

        // Toggle Summary Card collapse
        const btnToggleSummary = document.getElementById('btn-toggle-summary');
        const summaryContent = document.getElementById('detail-summary-content');
        if (btnToggleSummary && summaryContent) {
            btnToggleSummary.addEventListener('click', () => {
                const isCollapsed = summaryContent.style.display === 'none';
                if (isCollapsed) {
                    summaryContent.style.display = 'block';
                    btnToggleSummary.innerHTML = '<i data-lucide="chevron-up" style="width: 14px; height: 14px;"></i>';
                } else {
                    summaryContent.style.display = 'none';
                    btnToggleSummary.innerHTML = '<i data-lucide="chevron-down" style="width: 14px; height: 14px;"></i>';
                }
                lucide.createIcons();
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

        // View Mode Toggle
        const btnReadingMode = document.getElementById('btn-reading-mode');
        const btnSegmentMode = document.getElementById('btn-segment-mode');

        if (btnReadingMode) {
            btnReadingMode.addEventListener('click', () => {
                if (this.readingMode) return;
                this.readingMode = true;
                btnReadingMode.classList.add('active');
                btnSegmentMode.classList.remove('active');
                this.renderSegments();
            });
        }

        if (btnSegmentMode) {
            btnSegmentMode.addEventListener('click', () => {
                if (!this.readingMode) return;
                this.readingMode = false;
                btnSegmentMode.classList.add('active');
                btnReadingMode.classList.remove('active');
                this.renderSegments();
            });
        }
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
                const speakersList = Array.isArray(this.speakers) ? this.speakers : [];
                const existingSpeaker = speakersList.find(sp => sp && sp.name && String(sp.name).toLowerCase() === newName.toLowerCase());

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

        // Inline transcript text editing
        list.querySelectorAll('.editable-transcript-text').forEach(el => {
            el.addEventListener('blur', async () => {
                const segmentId = el.getAttribute('data-id');
                const originalText = this.conversation.transcript_segments.find(s => s.id == segmentId)?.text || '';
                const newText = el.textContent.trim();
                
                if (newText !== originalText) {
                    try {
                        await api.updateSegmentText(this.conversationId, segmentId, newText);
                        window.showToast('Transcript updated.', 'success');
                        // Update local cache
                        const seg = this.conversation.transcript_segments.find(s => s.id == segmentId);
                        if (seg) seg.text = newText;
                    } catch (err) {
                        window.showToast(`Failed to update transcript: ${err.message}`, 'danger');
                        el.textContent = originalText;
                    }
                }
            });
            
            // Also handle Enter to save / blur (unless Shift+Enter is pressed for newline)
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    el.blur();
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
