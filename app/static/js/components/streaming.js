import api from '../api.js';

export default {
    mediaStream: null,
    audioContext: null,
    audioProcessor: null,
    webSocket: null,
    isRecording: false,
    conversationId: null,
    
    // Waveform rendering properties
    canvas: null,
    canvasCtx: null,
    animationId: null,
    currentVolume: 0,
    vadActive: false,

    async render() {
        return `
            <div class="content-card" style="margin-bottom: 24px;">
                <div class="recorder-container">
                    <div class="recorder-btn-outer" id="recorder-trigger">
                        <div class="recorder-btn">
                            <i data-lucide="mic" id="record-icon"></i>
                        </div>
                    </div>
                    
                    <div style="text-align: center;">
                        <h3 id="record-status-title" style="font-family: var(--font-heading); font-size: 1.25rem; font-weight: 600; margin-bottom: 4px;">Click to Start Live Recording</h3>
                        <p id="record-status-subtitle" style="color: var(--text-muted); font-size: 0.9rem;">The system will transcribe and diarize your voice in real time.</p>
                    </div>

                    <!-- Audio visualizer waveform -->
                    <div class="visualizer-card" id="viz-card" style="display: none; width: 100%; max-width: 500px;">
                        <canvas class="visualizer-canvas" id="canvas-visualizer"></canvas>
                        <div style="position: absolute; top: 10px; right: 12px; display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: var(--text-muted);">
                            <div class="status-dot" id="vad-indicator"></div>
                            <span id="vad-label">Silence</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Live Segments Card -->
            <div class="content-card" id="live-transcript-card" style="display: none;">
                <div class="card-header">
                    <h2>Real-Time Transcript</h2>
                    <span class="badge badge-warning" id="live-conv-id">Recording</span>
                </div>
                <div class="segments-list" id="live-segments-list" style="max-height: 400px;">
                    <!-- Segments appended here -->
                    <p style="color: var(--text-muted); font-size: 0.9rem; text-align: center; padding: 20px;">Waiting for speech...</p>
                </div>
                <div style="display: flex; justify-content: flex-end; margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--card-border);">
                    <button class="btn btn-primary" id="btn-view-recording" style="display: none;">
                        <i data-lucide="external-link"></i> View Full Recording
                    </button>
                </div>
            </div>
        `;
    },

    async init() {
        const trigger = document.getElementById('recorder-trigger');
        const viewBtn = document.getElementById('btn-view-recording');
        
        if (trigger) {
            trigger.addEventListener('click', () => {
                if (this.isRecording) {
                    this.stopRecording();
                } else {
                    this.startRecording();
                }
            });
        }

        if (viewBtn) {
            viewBtn.addEventListener('click', () => {
                if (this.conversationId) {
                    window.location.hash = `#/conversations/${this.conversationId}`;
                }
            });
        }
    },

    async startRecording() {
        const title = document.getElementById('record-status-title');
        const subtitle = document.getElementById('record-status-subtitle');
        const recordIcon = document.getElementById('record-icon');
        const trigger = document.getElementById('recorder-trigger');
        const vizCard = document.getElementById('viz-card');
        const transcriptCard = document.getElementById('live-transcript-card');
        const segmentsList = document.getElementById('live-segments-list');
        const viewBtn = document.getElementById('btn-view-recording');

        try {
            // 1. Request microphone permissions
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1,
                    sampleRate: 48000
                }
            });

            // 2. Establish WebSocket connection
            const wsUrl = api.getStreamingWebSocketUrl();
            this.webSocket = new WebSocket(wsUrl);

            this.webSocket.onopen = () => {
                // Send initial start configuration
                const startMsg = {
                    type: 'start'
                };
                this.webSocket.send(JSON.stringify(startMsg));
                console.log('🔌 WebSocket connection opened. Sent start message.');
            };

            this.webSocket.onerror = (error) => {
                console.error('WebSocket Error:', error);
                window.showToast('WebSocket connection error.', 'danger');
                this.stopRecording();
            };

            this.webSocket.onclose = () => {
                console.log('🔌 WebSocket connection closed.');
                if (this.isRecording) {
                    this.stopRecording();
                }
            };

            // Listen for diarized segment and status messages
            let startedStreaming = false;
            
            this.webSocket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    
                    if (message.type === 'started') {
                        // Handshake complete, backend is ready!
                        this.conversationId = message.data.conversation_id;
                        startedStreaming = true;
                        
                        const liveConvId = document.getElementById('live-conv-id');
                        if (liveConvId) liveConvId.textContent = `REC #${this.conversationId}`;
                        if (viewBtn) viewBtn.style.display = 'inline-flex';

                        console.log(`🚀 Diarization started for conversation #${this.conversationId}`);
                        window.showToast('Live recording started and linked to server.', 'success');
                    }
                    
                    else if (message.type === 'status') {
                        // Audio VAD status update
                        this.vadActive = message.data.vad_active;
                        this.currentVolume = message.data.audio_level || 0;
                        
                        const vadDot = document.getElementById('vad-indicator');
                        const vadLabel = document.getElementById('vad-label');
                        
                        if (vadDot && vadLabel) {
                            if (this.vadActive) {
                                vadDot.className = 'status-dot busy';
                                vadLabel.textContent = 'Speaking...';
                                vadLabel.style.color = 'var(--warning)';
                            } else {
                                vadDot.className = 'status-dot online';
                                vadLabel.textContent = 'Listening';
                                vadLabel.style.color = 'var(--accent)';
                            }
                        }
                    }
                    
                    else if (message.type === 'segment') {
                        // Append or update segment on screen
                        this.appendLiveSegment(message.data);
                    }
                    
                    else if (message.type === 'completed') {
                        console.log('Recording finalized on server.');
                        window.showToast('Recording processed and saved!', 'success');
                    }
                    
                    else if (message.type === 'error') {
                        window.showToast(`Server error: ${message.data.message}`, 'danger');
                        this.stopRecording();
                    }

                } catch (e) {
                    console.error('Failed to parse WebSocket JSON:', e);
                }
            };

            // 3. Setup audio processing context
            // Resample to 48kHz for the backend
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 48000
            });

            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            // Create script processor (4096 buffer size)
            this.audioProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
            
            this.audioProcessor.onaudioprocess = (e) => {
                if (!startedStreaming) return;

                const inputBuffer = e.inputBuffer;
                const channelData = inputBuffer.getChannelData(0); // Mono channel

                // Send float32 binary array
                if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
                    // Create copy of float32 buffer to prevent memory release issues in async socket
                    const bufferCopy = new Float32Array(channelData).buffer;
                    this.webSocket.send(bufferCopy);
                }
            };

            // Connect audio graph
            source.connect(this.audioProcessor);
            this.audioProcessor.connect(this.audioContext.destination);

            // 4. Update UI to recording state
            this.isRecording = true;
            if (trigger) trigger.classList.add('recording');
            if (title) title.textContent = 'Recording Live...';
            if (subtitle) subtitle.textContent = 'Speak clearly. The audio is streamed directly to the GPU.';
            if (recordIcon) recordIcon.setAttribute('data-lucide', 'square');
            if (vizCard) vizCard.style.display = 'block';
            if (transcriptCard) {
                transcriptCard.style.display = 'block';
                if (segmentsList) segmentsList.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem; text-align: center; padding: 20px;">Waiting for speech detection...</p>`;
            }
            if (viewBtn) viewBtn.style.display = 'none';

            lucide.createIcons();

            // 5. Initialize Canvas waveform
            this.canvas = document.getElementById('canvas-visualizer');
            if (this.canvas) {
                this.canvasCtx = this.canvas.getContext('2d');
                this.resizeCanvas();
                this.drawWaveform();
            }

        } catch (error) {
            console.error('Failed to start recording:', error);
            window.showToast(`Microphone access failed: ${error.message}`, 'danger');
            this.stopRecording();
        }
    },

    stopRecording() {
        const title = document.getElementById('record-status-title');
        const subtitle = document.getElementById('record-status-subtitle');
        const recordIcon = document.getElementById('record-icon');
        const trigger = document.getElementById('recorder-trigger');
        const vizCard = document.getElementById('viz-card');

        // Stop microphone stream
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        // Stop audio context
        if (this.audioProcessor) {
            this.audioProcessor.disconnect();
            this.audioProcessor = null;
        }
        if (this.audioContext) {
            if (this.audioContext.state !== 'closed') {
                this.audioContext.close();
            }
            this.audioContext = null;
        }

        // Stop WebSocket
        if (this.webSocket) {
            if (this.webSocket.readyState === WebSocket.OPEN) {
                // Send stop message
                this.webSocket.send(JSON.stringify({ type: 'stop' }));
            }
            this.webSocket = null;
        }

        // Cancel canvas animation
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        // Reset state
        this.isRecording = false;
        if (trigger) trigger.classList.remove('recording');
        if (title) title.textContent = 'Recording Ended';
        if (subtitle) subtitle.textContent = 'Diarization session completed. You can view the full recording now.';
        if (recordIcon) recordIcon.setAttribute('data-lucide', 'mic');
        if (vizCard) vizCard.style.display = 'none';

        lucide.createIcons();
    },

    appendLiveSegment(segData) {
        const segmentsList = document.getElementById('live-segments-list');
        if (!segmentsList) return;

        // Remove placeholder text on first segment
        if (segmentsList.querySelector('p')) {
            segmentsList.innerHTML = '';
        }

        // Check if segment already exists on page (avoid duplicates)
        let segCard = document.getElementById(`live-seg-${segData.segment_id}`);
        const isUnknown = !segData.speaker_name || segData.speaker_name.startsWith('Unknown_');

        const emotionClass = segData.emotion_category === 'neutral' ? 'neutral' : 
                             (segData.emotion_category === 'angry' ? 'angry' : 
                              (segData.emotion_category === 'sad' ? 'sad' : ''));

        const cardContent = `
            <div class="segment-meta">
                <span class="segment-time" style="background-color: rgba(255,255,255,0.06);">${this.formatDuration(segData.start_offset)} - ${this.formatDuration(segData.end_offset)}</span>
                <span class="badge ${isUnknown ? 'badge-info' : 'badge-success'}" style="font-weight: 700;">${segData.speaker_name}</span>
                ${segData.emotion_category ? `
                    <span class="badge badge-info ${emotionClass}" style="font-size:0.7rem;">${segData.emotion_category.toUpperCase()}</span>
                ` : ''}
            </div>
            <div class="segment-text" style="font-size: 0.9rem; margin-top: 8px;">${segData.text || ''}</div>
        `;

        if (segCard) {
            // Update existing card
            segCard.innerHTML = cardContent;
        } else {
            // Append new card
            segCard = document.createElement('div');
            segCard.className = 'segment-card';
            segCard.id = `live-seg-${segData.segment_id}`;
            segCard.style.padding = '12px';
            segCard.style.gap = '6px';
            segCard.innerHTML = cardContent;
            segmentsList.appendChild(segCard);
        }

        // Auto-scroll to bottom of list
        segmentsList.scrollTop = segmentsList.scrollHeight;
    },

    resizeCanvas() {
        if (!this.canvas) return;
        this.canvas.width = this.canvas.offsetWidth * window.devicePixelRatio;
        this.canvas.height = this.canvas.offsetHeight * window.devicePixelRatio;
        this.canvasCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
    },

    drawWaveform() {
        if (!this.isRecording || !this.canvas) return;

        const w = this.canvas.width / window.devicePixelRatio;
        const h = this.canvas.height / window.devicePixelRatio;
        
        this.animationId = requestAnimationFrame(() => this.drawWaveform());

        // Clear canvas
        this.canvasCtx.fillStyle = '#0a0c16';
        this.canvasCtx.fillRect(0, 0, w, h);

        // Draw animated sound waves
        const barWidth = 4;
        const barGap = 3;
        const numBars = Math.floor(w / (barWidth + barGap));
        const midY = h / 2;

        this.canvasCtx.fillStyle = this.vadActive ? 'rgba(245, 158, 11, 0.6)' : 'rgba(99, 102, 241, 0.4)';
        
        // Generate pseudo FFT based on input volume
        for (let i = 0; i < numBars; i++) {
            // Sine waves calculation for visualizer animation
            const volumeMult = this.currentVolume * 400; // Boost amplitude
            const noise = Math.sin(i * 0.1 + Date.now() * 0.015) * Math.cos(i * 0.05 - Date.now() * 0.005);
            let barHeight = (volumeMult * Math.abs(noise)) + 2;
            
            // Cap height
            if (barHeight > h - 10) barHeight = h - 10;

            const x = i * (barWidth + barGap);
            const y = midY - (barHeight / 2);

            // Draw rounded bars
            this.canvasCtx.beginPath();
            this.canvasCtx.roundRect(x, y, barWidth, barHeight, 2);
            this.canvasCtx.fill();
        }
    },

    formatDuration(secs) {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }
};
