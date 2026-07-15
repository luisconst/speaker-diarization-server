import api from '../api.js';

export default {
    async render() {
        return `
            <div class="dashboard-grid">
                <div class="stat-card">
                    <div class="stat-icon">
                        <i data-lucide="cpu"></i>
                    </div>
                    <div class="stat-details">
                        <h3>Device Runtime</h3>
                        <div class="stat-value" id="dash-device" style="font-size: 1.15rem; word-break: break-all;">Loading...</div>
                    </div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-icon accent">
                        <i data-lucide="users"></i>
                    </div>
                    <div class="stat-details">
                        <h3>Enrolled Speakers</h3>
                        <div class="stat-value" id="dash-speakers">0</div>
                    </div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-icon warning">
                        <i data-lucide="message-square"></i>
                    </div>
                    <div class="stat-details">
                        <h3>Total Recordings</h3>
                        <div class="stat-value" id="dash-conversations">0</div>
                    </div>
                </div>
            </div>

            <div class="content-card">
                <div class="card-header">
                    <h2>Recent Conversations</h2>
                    <a href="#/conversations" class="btn btn-secondary btn-icon-only" title="View All">
                        <i data-lucide="chevron-right"></i>
                    </a>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Recording Title</th>
                                <th>Processed Date</th>
                                <th>Duration</th>
                                <th>Speakers</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody id="recent-conversations-list">
                            <tr>
                                <td colspan="5" style="text-align: center; color: var(--text-muted);">
                                    <div class="loading-spinner-container" style="height: 100px;">
                                        <div class="spinner"></div>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    async init() {
        if (this.pollTimeout) {
            clearTimeout(this.pollTimeout);
            this.pollTimeout = null;
        }
        try {
            // Fetch status, speakers, and recent conversations in parallel
            const [status, speakers, convsResponse] = await Promise.all([
                api.getStatus(),
                api.getSpeakers(),
                api.getConversations(0, 5)
            ]);

            // Update stats
            const dashDevice = document.getElementById('dash-device');
            const dashSpeakers = document.getElementById('dash-speakers');
            const dashConversations = document.getElementById('dash-conversations');

            if (dashDevice) dashDevice.textContent = status.device || (status.gpu_available ? 'CUDA GPU' : 'CPU');
            if (dashSpeakers) dashSpeakers.textContent = speakers.length;
            if (dashConversations) dashConversations.textContent = convsResponse.total;

            // Render recent conversations list
            const recentList = document.getElementById('recent-conversations-list');
            if (recentList) {
                if (convsResponse.conversations.length === 0) {
                    recentList.innerHTML = `
                        <tr>
                            <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 30px;">
                                No recordings processed yet. Go to the Conversations tab to upload one!
                            </td>
                        </tr>
                    `;
                    return;
                }

                recentList.innerHTML = convsResponse.conversations.map(conv => {
                    const statusClass = conv.status === 'completed' ? 'badge-success' : 
                                       (conv.status === 'processing' || conv.status === 'recording' ? 'badge-warning' : 'badge-danger');
                    const durationStr = conv.duration ? this.formatDuration(conv.duration) : '--:--';
                    const dateStr = window.formatDate(conv.start_time);

                    const title = conv.title || `Conversation #${conv.id}`;

                    let statusHtml = `<span class="badge ${statusClass}">${conv.status}</span>`;
                    if (conv.status === 'processing') {
                        statusHtml = `<span class="badge badge-warning" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px;">
                            <i data-lucide="loader-2" class="spinner-icon animate-spin" style="width: 10px; height: 10px; display: inline-block;"></i>
                            processing
                        </span>`;
                    }

                    return `
                        <tr class="interactive-row" data-id="${conv.id}">
                            <td style="font-weight: 500;">${title}</td>
                            <td style="color: var(--text-muted);">${dateStr}</td>
                            <td>${durationStr}</td>
                            <td><span class="badge badge-info">${conv.num_speakers}</span></td>
                            <td>${statusHtml}</td>
                        </tr>
                    `;
                }).join('');

                lucide.createIcons();

                // Make rows clickable
                recentList.querySelectorAll('.interactive-row').forEach(row => {
                    row.addEventListener('click', () => {
                        const id = row.getAttribute('data-id');
                        window.location.hash = `#/conversations/${id}`;
                    });
                });
            }

            // If any conversation is currently processing, poll in the background
            if (convsResponse.conversations.some(c => c.status === 'processing')) {
                if (this.pollTimeout) clearTimeout(this.pollTimeout);
                this.pollTimeout = setTimeout(async () => {
                    const activeHash = window.location.hash;
                    if (activeHash === '#/dashboard' || activeHash === '' || activeHash === '#/') {
                        await this.init();
                    }
                }, 5000);
            }

        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            window.showToast('Failed to load dashboard data.', 'danger');
        }
    },

    formatDuration(secs) {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }
};
