import api from '../api.js';

export default {
    skip: 0,
    limit: 10,
    total: 0,
    statusFilter: '',
    speakerFilter: '',
    startDateFilter: '',
    endDateFilter: '',
    userFilter: '',
    sortBy: 'start_time',
    sortOrder: 'desc',



    
    async render() {
        return `
            <div class="content-card" style="margin-bottom: 32px;">
                <div class="card-header">
                    <h2>Process New Audio File</h2>
                </div>
                <div class="upload-zone" id="drop-zone">
                    <i data-lucide="upload-cloud" class="upload-icon"></i>
                    <h3>Drag & drop audio files here</h3>
                    <p>Supports MP3, WAV, M4A, FLAC, etc. up to 100MB</p>
                    <div style="margin-top: 15px;">
                        <span class="btn btn-primary">Select Audio File</span>
                    </div>
                    <input type="file" id="file-input" accept="audio/*" style="display: none;" />
                </div>
                <!-- Uploading Status -->
                <div id="upload-status" style="display: none; margin-top: 20px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span id="upload-progress-text" style="font-weight: 500;">Uploading file...</span>
                        <span id="upload-pct" style="color: var(--text-muted);">0%</span>
                    </div>
                    <div class="vram-progress-bar" style="height: 6px;">
                        <div class="vram-fill" id="upload-fill" style="width: 0%; background: linear-gradient(90deg, var(--accent) 0%, #34d399 100%)"></div>
                    </div>
                </div>
            </div>

            <div class="content-card">
                <div class="card-header" style="flex-wrap: wrap; gap: 16px; align-items: center;">
                    <h2>Diarized Conversations</h2>
                    <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
                        <!-- Date Filters -->
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 0.8rem; color: var(--text-muted);">From:</span>
                            <input type="date" id="filter-start-date" class="form-control" style="width: 135px; height: 34px; padding: 4px 8px; font-size: 0.85rem;" />
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 0.8rem; color: var(--text-muted);">To:</span>
                            <input type="date" id="filter-end-date" class="form-control" style="width: 135px; height: 34px; padding: 4px 8px; font-size: 0.85rem;" />
                        </div>
                        
                        <!-- Speaker Filter -->
                        <select class="form-control" id="speaker-filter" style="width: 140px; height: 34px; padding: 4px 8px; font-size: 0.85rem;">
                            <option value="">All Speakers</option>
                        </select>

                        <!-- User Filter -->
                        <input type="text" id="user-filter" class="form-control" style="width: 120px; height: 34px; padding: 4px 8px; font-size: 0.85rem;" placeholder="Filter by user..." value="${this.userFilter || ''}" />

                        <!-- Status Filter -->
                        <select class="form-control" id="status-filter" style="width: 130px; height: 34px; padding: 4px 8px; font-size: 0.85rem;">
                            <option value="">All Statuses</option>
                            <option value="completed">Completed</option>
                            <option value="processing">Processing</option>
                            <option value="recording">Recording</option>
                            <option value="failed">Failed</option>
                        </select>
                    </div>
                </div>

                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th id="th-title" data-label="Recording Title" style="cursor: pointer; user-select: none;">Recording Title <span style="opacity: 0.3; font-size: 0.8rem;">↕</span></th>
                                <th id="th-date" data-label="Processed Date" style="cursor: pointer; user-select: none;">Processed Date <span style="opacity: 0.3; font-size: 0.8rem;">↕</span></th>
                                <th id="th-duration" data-label="Duration" style="cursor: pointer; user-select: none;">Duration <span style="opacity: 0.3; font-size: 0.8rem;">↕</span></th>
                                <th>Speakers</th>
                                <th id="th-user" data-label="Uploaded By" style="cursor: pointer; user-select: none;">Uploaded By <span style="opacity: 0.3; font-size: 0.8rem;">↕</span></th>
                                <th>Status</th>
                                <th style="text-align: right; width: 180px;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="conversations-list">
                            <tr>
                                <td colspan="7" style="text-align: center; color: var(--text-muted);">
                                    <div class="loading-spinner-container" style="height: 100px;">
                                        <div class="spinner"></div>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Pagination footer -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--card-border);">
                    <div style="color: var(--text-muted); font-size: 0.9rem;">
                        Showing <span id="pag-start">0</span> to <span id="pag-end">0</span> of <span id="pag-total">0</span> conversations
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary" id="btn-prev" disabled>Previous</button>
                        <button class="btn btn-secondary" id="btn-next" disabled>Next</button>
                    </div>
                </div>
            </div>
        `;
    },

    async init() {
        this.setupUploadHandlers();
        this.setupFiltersAndPagination();
        await this.loadSpeakersList();
        await this.loadConversations();
    },

    async loadSpeakersList() {
        try {
            const speakers = await api.getSpeakers();
            const speakerSelect = document.getElementById('speaker-filter');
            if (speakerSelect) {
                speakerSelect.innerHTML = '<option value="">All Speakers</option>' + 
                    speakers.map(sp => `<option value="${sp.id}">${sp.name}</option>`).join('');
            }
        } catch (e) {
            console.error('Failed to load speakers for filter:', e);
        }
    },


    setupUploadHandlers() {
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        const uploadStatus = document.getElementById('upload-status');
        const uploadProgressText = document.getElementById('upload-progress-text');
        const uploadPct = document.getElementById('upload-pct');
        const uploadFill = document.getElementById('upload-fill');

        if (!dropZone || !fileInput) return;

        // Trigger file input dialog
        dropZone.addEventListener('click', () => fileInput.click());

        // Dragover/Dragleave highlighting
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        // Drop file
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                this.handleFileUpload(e.dataTransfer.files[0]);
            }
        });

        // File selection change
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                this.handleFileUpload(fileInput.files[0]);
            }
        });
    },

    async handleFileUpload(file) {
        const uploadStatus = document.getElementById('upload-status');
        const uploadProgressText = document.getElementById('upload-progress-text');
        const uploadPct = document.getElementById('upload-pct');
        const uploadFill = document.getElementById('upload-fill');
        const dropZone = document.getElementById('drop-zone');

        if (!file) return;

        try {
            // Update UI state
            dropZone.style.pointerEvents = 'none';
            dropZone.style.opacity = '0.5';
            uploadStatus.style.display = 'block';
            uploadProgressText.textContent = `Uploading "${file.name}"...`;
            uploadPct.textContent = '0%';
            uploadFill.style.width = '0%';

            // Custom XMLHTTPRequest to track progress
            const xhr = new XMLHttpRequest();
            const formData = new FormData();
            formData.append('audio_file', file);

            const activeUser = localStorage.getItem('active_user');
            if (activeUser) {
                formData.append('uploaded_by', activeUser);
            }


            // Upload progress listener
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    uploadPct.textContent = `${percent}%`;
                    uploadFill.style.width = `${percent}%`;
                    if (percent === 100) {
                        uploadProgressText.textContent = `Processing "${file.name}" on GPU... This can take 1-3 minutes.`;
                    }
                }
            });

            // Promisify the XHR response
            const responsePromise = new Promise((resolve, reject) => {
                xhr.onreadystatechange = () => {
                    if (xhr.readyState === XMLHttpRequest.DONE) {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            try {
                                resolve(JSON.parse(xhr.responseText));
                            } catch (e) {
                                resolve(xhr.responseText);
                            }
                        } else {
                            let errorMsg = `Server error: ${xhr.status}`;
                            try {
                                const errJson = JSON.parse(xhr.responseText);
                                if (errJson && errJson.detail) {
                                    errorMsg = errJson.detail;
                                }
                            } catch (e) {}
                            reject(new Error(errorMsg));
                        }
                    }
                };
            });

            xhr.open('POST', '/api/v1/process');
            xhr.send(formData);

            const result = await responsePromise;
            
            window.showToast(`Successfully processed "${file.name}"!`, 'success');
            
            // Redirect to conversation detail view
            window.location.hash = `#/conversations/${result.id}`;

        } catch (error) {
            console.error('File processing failed:', error);
            window.showToast(`Processing failed: ${error.message}`, 'danger');
            
            // Reset upload UI
            dropZone.style.pointerEvents = 'auto';
            dropZone.style.opacity = '1';
            uploadStatus.style.display = 'none';
            await this.loadConversations();
        }
    },

    setupFiltersAndPagination() {
        const filter = document.getElementById('status-filter');
        const speakerFilter = document.getElementById('speaker-filter');
        const startDateFilter = document.getElementById('filter-start-date');
        const endDateFilter = document.getElementById('filter-end-date');
        const btnPrev = document.getElementById('btn-prev');
        const btnNext = document.getElementById('btn-next');

        if (filter) {
            filter.addEventListener('change', async (e) => {
                this.statusFilter = e.target.value;
                this.skip = 0;
                await this.loadConversations();
            });
        }

        if (speakerFilter) {
            speakerFilter.addEventListener('change', async (e) => {
                this.speakerFilter = e.target.value;
                this.skip = 0;
                await this.loadConversations();
            });
        }

        if (startDateFilter) {
            startDateFilter.addEventListener('change', async (e) => {
                this.startDateFilter = e.target.value;
                this.skip = 0;
                await this.loadConversations();
            });
        }

        if (endDateFilter) {
            endDateFilter.addEventListener('change', async (e) => {
                this.endDateFilter = e.target.value;
                this.skip = 0;
                await this.loadConversations();
            });
        }

        const userFilterInput = document.getElementById('user-filter');
        if (userFilterInput) {
            userFilterInput.addEventListener('input', async (e) => {
                this.userFilter = e.target.value.trim();
                this.skip = 0;
                await this.loadConversations();
            });
        }

        const sortHeaders = [
            { id: 'th-title', column: 'title' },
            { id: 'th-date', column: 'start_time' },
            { id: 'th-duration', column: 'duration' },
            { id: 'th-user', column: 'uploaded_by' }
        ];

        sortHeaders.forEach(({ id, column }) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('click', async () => {
                    if (this.sortBy === column) {
                        this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
                    } else {
                        this.sortBy = column;
                        this.sortOrder = 'desc';
                    }
                    this.skip = 0;
                    await this.loadConversations();
                });
            }
        });

        if (btnPrev) {
            btnPrev.addEventListener('click', async () => {
                this.skip = Math.max(0, this.skip - this.limit);
                await this.loadConversations();
            });
        }

        if (btnNext) {
            btnNext.addEventListener('click', async () => {
                this.skip += this.limit;
                await this.loadConversations();
            });
        }
    },

    async loadConversations() {
        const list = document.getElementById('conversations-list');
        const pagStart = document.getElementById('pag-start');
        const pagEnd = document.getElementById('pag-end');
        const pagTotal = document.getElementById('pag-total');
        const btnPrev = document.getElementById('btn-prev');
        const btnNext = document.getElementById('btn-next');

        if (!list) return;

        try {
            this.updateHeaderSortIndicators();
            const data = await api.getConversations(
                this.skip, 
                this.limit, 
                this.statusFilter,
                this.speakerFilter || null,
                this.startDateFilter || null,
                this.endDateFilter || null,
                this.userFilter || null,
                this.sortBy,
                this.sortOrder
            );

            this.total = data.total;

            if (data.conversations.length === 0) {
                list.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px;">
                            No conversations found.
                        </td>
                    </tr>
                `;
                if (pagStart) pagStart.textContent = 0;
                if (pagEnd) pagEnd.textContent = 0;
                if (pagTotal) pagTotal.textContent = 0;
                if (btnPrev) btnPrev.disabled = true;
                if (btnNext) btnNext.disabled = true;
                return;
            }

            list.innerHTML = data.conversations.map(conv => {
                const statusClass = conv.status === 'completed' ? 'badge-success' : 
                                   (conv.status === 'processing' || conv.status === 'recording' ? 'badge-warning' : 'badge-danger');
                const durationStr = conv.duration ? this.formatDuration(conv.duration) : '--:--';
                const dateStr = window.formatDate(conv.start_time);
                const title = conv.title || `Conversation #${conv.id}`;

                return `
                    <tr class="interactive-row" data-id="${conv.id}">
                        <td style="font-weight: 550; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${title}
                        </td>
                        <td style="color: var(--text-muted);">${dateStr}</td>
                        <td>${durationStr}</td>
                        <td><span class="badge badge-info">${conv.num_speakers}</span></td>
                        <td style="color: var(--text-muted); font-size: 0.85rem;">
                            <span class="badge" style="background: rgba(255,255,255,0.03); color: var(--text-muted); border: 1px solid rgba(255,255,255,0.06); font-family: monospace; padding: 2px 6px;">${conv.uploaded_by || 'system'}</span>
                        </td>
                        <td><span class="badge ${statusClass}">${conv.status}</span></td>
                        <td style="text-align: right;" class="action-cell">
                            <select class="form-control download-format-select" data-id="${conv.id}" style="width: 100px; height: 28px; padding: 2px 4px; font-size: 0.75rem; display: inline-block; margin-right: 8px; vertical-align: middle;">
                                <option value="">Download...</option>
                                <option value="txt">TXT (Text)</option>
                                <option value="srt">SRT (Subs)</option>
                                <option value="vtt">VTT (Webvtt)</option>
                                <option value="json">JSON</option>
                            </select>
                            <button class="btn btn-icon-only btn-delete-conv" data-id="${conv.id}" title="Delete Conversation" style="padding: 6px; vertical-align: middle;">
                                <i data-lucide="trash-2" style="width: 14px; height: 14px; color: var(--danger)"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

            lucide.createIcons();

            // Set pagination display values
            const startVal = this.skip + 1;
            const endVal = Math.min(this.skip + this.limit, this.total);
            
            if (pagStart) pagStart.textContent = startVal;
            if (pagEnd) pagEnd.textContent = endVal;
            if (pagTotal) pagTotal.textContent = this.total;
            if (btnPrev) btnPrev.disabled = this.skip === 0;
            if (btnNext) btnNext.disabled = endVal >= this.total;

            // Make rows clickable, except the action cell element
            list.querySelectorAll('tr').forEach(row => {
                row.addEventListener('click', (e) => {
                    // Check if clicked element was part of action cell or is a select/button
                    if (e.target.closest('.action-cell') || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') {
                        return;
                    }
                    const id = row.getAttribute('data-id');
                    window.location.hash = `#/conversations/${id}`;
                });
            });

            // Set up download format dropdowns
            list.querySelectorAll('.download-format-select').forEach(select => {
                select.addEventListener('change', (e) => {
                    const id = select.getAttribute('data-id');
                    const format = e.target.value;
                    if (format) {
                        const url = api.getExportTranscriptUrl(id, format);
                        window.open(url, '_blank');
                        select.value = ''; // Reset select to "Download..."
                    }
                });
            });

            // Set up delete buttons
            list.querySelectorAll('.btn-delete-conv').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const id = btn.getAttribute('data-id');
                    if (confirm('Are you sure you want to delete this conversation and its files? This action cannot be undone.')) {
                        try {
                            btn.disabled = true;
                            await api.deleteConversation(id);
                            window.showToast('Conversation deleted.', 'success');
                            await this.loadConversations();
                        } catch (err) {
                            window.showToast(`Delete failed: ${err.message}`, 'danger');
                            btn.disabled = false;
                        }
                    }
                });
            });


        } catch (error) {
            console.error('Failed to load conversations:', error);
            window.showToast('Failed to load conversations.', 'danger');
        }
    },

    updateHeaderSortIndicators() {
        const headers = {
            'title': document.getElementById('th-title'),
            'start_time': document.getElementById('th-date'),
            'duration': document.getElementById('th-duration'),
            'uploaded_by': document.getElementById('th-user')
        };
        
        for (const [col, th] of Object.entries(headers)) {
            if (!th) continue;
            const label = th.getAttribute('data-label');
            if (this.sortBy === col) {
                th.innerHTML = `${label} ${this.sortOrder === 'asc' ? '▲' : '▼'}`;
                th.style.color = 'var(--primary)';
            } else {
                th.innerHTML = `${label} <span style="opacity: 0.3; font-size: 0.8rem;">↕</span>`;
                th.style.color = '';
            }
        }
    },

    formatDuration(secs) {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }
};
