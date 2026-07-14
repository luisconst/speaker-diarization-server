import api from '../api.js';

export default {
    profiles: [],
    selectedProfileName: null,
    checkpoints: [],

    async render() {
        return `
            <div class="dashboard-grid" style="grid-template-columns: 1fr 1fr; align-items: start;">
                <!-- Profile List Column -->
                <div class="content-card">
                    <div class="card-header" style="flex-wrap: wrap; gap: 12px;">
                        <h2>Voice Profile Snapshots</h2>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-secondary" id="btn-import-profile" title="Upload a profile JSON file">
                                <i data-lucide="upload"></i> Import
                            </button>
                            <button class="btn btn-primary" id="btn-create-profile">
                                <i data-lucide="plus"></i> New Snapshot
                            </button>
                        </div>
                    </div>

                    <!-- Hidden File Picker for Import -->
                    <input type="file" id="import-file-picker" accept=".json" style="display: none;" />

                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Snapshot Name</th>
                                    <th style="text-align: right;">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="profiles-list-body">
                                <tr>
                                    <td colspan="2" style="text-align: center; color: var(--text-muted);">
                                        <div class="loading-spinner-container" style="height: 100px;">
                                            <div class="spinner"></div>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <!-- Download All Widget -->
                    <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--card-border); display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.85rem; color: var(--text-muted);">Export your entire voice database at once:</span>
                        <a href="/api/v1/profiles/download-all" class="btn btn-secondary" id="btn-download-all" target="_blank" download>
                            <i data-lucide="download"></i> Download All (ZIP)
                        </a>
                    </div>
                </div>

                <!-- Checkpoints / Restore Column -->
                <div class="content-card" id="checkpoint-section" style="opacity: 0.5; pointer-events: none;">
                    <div class="card-header">
                        <h2>Checkpoints for: <span id="selected-profile-label">None</span></h2>
                        <button class="btn btn-primary" id="btn-create-checkpoint" disabled>
                            <i data-lucide="plus-square"></i> New Checkpoint
                        </button>
                    </div>

                    <div class="table-container" style="max-height: 300px; overflow-y: auto;">
                        <table>
                            <thead>
                                <tr>
                                    <th>Timestamp</th>
                                    <th>Note</th>
                                    <th style="text-align: right;">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="checkpoints-list-body">
                                <tr>
                                    <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 20px;">
                                        Select a snapshot on the left to manage its checkpoints.
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    async init() {
        this.setupActionListeners();
        await this.loadProfiles();
    },

    setupActionListeners() {
        const btnCreateProf = document.getElementById('btn-create-profile');
        const btnImportProf = document.getElementById('btn-import-profile');
        const filePicker = document.getElementById('import-file-picker');
        
        const btnCreateCheck = document.getElementById('btn-create-checkpoint');

        // CREATE NEW PROFILE SNAPSHOT
        if (btnCreateProf) {
            btnCreateProf.addEventListener('click', async () => {
                const name = prompt('Enter a name for the new profile snapshot (e.g. initial_setup):');
                if (name && name.trim()) {
                    try {
                        btnCreateProf.disabled = true;
                        window.showToast('Creating database snapshot...', 'warning');
                        await api.createProfile(name.trim());
                        window.showToast(`Snapshot "${name.trim()}" created successfully.`, 'success');
                        await this.loadProfiles();
                    } catch (e) {
                        window.showToast(`Failed to create snapshot: ${e.message}`, 'danger');
                    } finally {
                        btnCreateProf.disabled = false;
                    }
                }
            });
        }

        // IMPORT PROFILE JSON
        if (btnImportProf && filePicker) {
            btnImportProf.addEventListener('click', () => filePicker.click());
            
            filePicker.addEventListener('change', async () => {
                if (filePicker.files.length === 0) return;
                const file = filePicker.files[0];
                
                try {
                    btnImportProf.disabled = true;
                    window.showToast(`Importing profile "${file.name}"...`, 'warning');
                    
                    const formData = new FormData();
                    formData.append('file', file);
                    
                    // Call the POST /api/v1/profiles/import endpoint
                    // Let's implement import request manually using api._request since we need form-data.
                    await api._request('/api/v1/profiles/import', {
                        method: 'POST',
                        body: formData
                    });

                    window.showToast(`Imported profile snapshot successfully.`, 'success');
                    filePicker.value = '';
                    await this.loadProfiles();
                } catch (e) {
                    window.showToast(`Import failed: ${e.message}`, 'danger');
                } finally {
                    btnImportProf.disabled = false;
                }
            });
        }

        // CREATE NEW CHECKPOINT FOR SELECTED PROFILE
        if (btnCreateCheck) {
            btnCreateCheck.addEventListener('click', async () => {
                if (!this.selectedProfileName) return;
                const note = prompt('Enter a brief note describing this checkpoint (optional):');
                try {
                    btnCreateCheck.disabled = true;
                    window.showToast('Creating profile checkpoint...', 'warning');
                    await api.createCheckpoint(this.selectedProfileName, note || '');
                    window.showToast('Checkpoint created successfully.', 'success');
                    await this.loadCheckpoints();
                } catch (e) {
                    window.showToast(`Failed to create checkpoint: ${e.message}`, 'danger');
                } finally {
                    btnCreateCheck.disabled = false;
                }
            });
        }
    },

    async loadProfiles() {
        const body = document.getElementById('profiles-list-body');
        if (!body) return;

        try {
            // GET /api/v1/profiles returns a list of profile names or object dictionaries
            // Let's assume list of profile strings or objects. According to backup_api:
            // @router.get("") returns list of profiles: List[str] or similar
            const rawProfiles = await api.getProfiles();
            
            // Format profiles list
            // If rawProfiles is a list of strings: ["p1", "p2"], map it
            this.profiles = Array.isArray(rawProfiles) ? rawProfiles : [];

            if (this.profiles.length === 0) {
                body.innerHTML = `
                    <tr>
                        <td colspan="2" style="text-align: center; color: var(--text-muted); padding: 30px;">
                            No snapshots saved. Click "New Snapshot" to capture current database state.
                        </td>
                    </tr>
                `;
                this.disableCheckpointSection();
                return;
            }

            body.innerHTML = this.profiles.map(profName => {
                const isSelected = this.selectedProfileName === profName;
                return `
                    <tr class="interactive-row profile-row ${isSelected ? 'active-row' : ''}" data-name="${profName}">
                        <td style="font-weight: 550; vertical-align: middle;">
                            <i data-lucide="archive" style="width: 14px; height: 14px; margin-right: 6px; vertical-align: middle; color: var(--primary);"></i>
                            ${profName}
                        </td>
                        <td style="text-align: right;" class="action-cell">
                            <a href="/api/v1/profiles/download/${encodeURIComponent(profName)}" class="btn btn-icon-only btn-download-prof" target="_blank" download title="Download Profile JSON" style="padding: 6px;">
                                <i data-lucide="download" style="width: 14px; height: 14px; color: var(--accent);"></i>
                            </a>
                            <button class="btn btn-icon-only btn-delete-prof" data-name="${profName}" title="Delete Snapshot" style="padding: 6px; margin-left: 4px;">
                                <i data-lucide="trash-2" style="width: 14px; height: 14px; color: var(--danger);"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

            lucide.createIcons();
            this.setupProfileInteractions();

        } catch (e) {
            console.error('Failed to load profiles snapshots:', e);
            window.showToast('Failed to load profiles snapshots.', 'danger');
        }
    },

    setupProfileInteractions() {
        const body = document.getElementById('profiles-list-body');
        if (!body) return;

        // Click row to select
        body.querySelectorAll('.profile-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.action-cell') || e.target.closest('button') || e.target.closest('a')) {
                    return;
                }
                
                // Highlight row
                body.querySelectorAll('.profile-row').forEach(r => r.style.backgroundColor = '');
                row.style.backgroundColor = 'rgba(99, 102, 241, 0.08)';

                const name = row.getAttribute('data-name');
                this.selectProfile(name);
            });
        });

        // Delete Profile Snapshot
        body.querySelectorAll('.btn-delete-prof').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const name = btn.getAttribute('data-name');
                if (confirm(`Are you sure you want to delete profile snapshot "${name}"? All checkpoints under it will be lost.`)) {
                    try {
                        btn.disabled = true;
                        await api.deleteProfile(name);
                        window.showToast(`Snapshot "${name}" deleted.`, 'success');
                        
                        if (this.selectedProfileName === name) {
                            this.selectedProfileName = null;
                            this.disableCheckpointSection();
                        }
                        await this.loadProfiles();
                    } catch (err) {
                        window.showToast(`Delete failed: ${err.message}`, 'danger');
                        btn.disabled = false;
                    }
                }
            });
        });
    },

    selectProfile(name) {
        this.selectedProfileName = name;
        
        const section = document.getElementById('checkpoint-section');
        const label = document.getElementById('selected-profile-label');
        const btnCreateCheck = document.getElementById('btn-create-checkpoint');

        if (section && label && btnCreateCheck) {
            section.style.opacity = '1';
            section.style.pointerEvents = 'auto';
            label.textContent = name;
            btnCreateCheck.disabled = false;
            
            this.loadCheckpoints();
        }
    },

    disableCheckpointSection() {
        const section = document.getElementById('checkpoint-section');
        const label = document.getElementById('selected-profile-label');
        const btnCreateCheck = document.getElementById('btn-create-checkpoint');
        const body = document.getElementById('checkpoints-list-body');

        if (section && label && btnCreateCheck && body) {
            section.style.opacity = '0.5';
            section.style.pointerEvents = 'none';
            label.textContent = 'None';
            btnCreateCheck.disabled = true;
            body.innerHTML = `
                <tr>
                    <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 20px;">
                        Select a snapshot on the left to manage its checkpoints.
                    </td>
                </tr>
            `;
        }
    },

    async loadCheckpoints() {
        const body = document.getElementById('checkpoints-list-body');
        if (!body || !this.selectedProfileName) return;

        body.innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center; color: var(--text-muted);">
                    <div class="loading-spinner-container" style="height: 100px;">
                        <div class="spinner"></div>
                    </div>
                </td>
            </tr>
        `;

        try {
            const data = await api.getCheckpoints(this.selectedProfileName);
            // backup_api returns a list of dictionaries with notes, timestamp fields
            // @router.get("/{profile_name}/checkpoints") returns List[CheckpointResponse]
            this.checkpoints = Array.isArray(data) ? data : [];

            if (this.checkpoints.length === 0) {
                body.innerHTML = `
                    <tr>
                        <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 25px;">
                            No checkpoints saved for this snapshot. Click "New Checkpoint" to capture database checkpoint state.
                        </td>
                    </tr>
                `;
                return;
            }

            // Sort checkpoints: newest first
            this.checkpoints.sort((a, b) => b.timestamp - a.timestamp);

            body.innerHTML = this.checkpoints.map(check => {
                const dateStr = window.formatDate(new Date(check.timestamp * 1000));
                return `
                    <tr>
                        <td style="font-family: monospace; font-size: 0.85rem;">${dateStr}</td>
                        <td style="color: var(--text-muted); font-size: 0.85rem;">${check.note || '<i>No description</i>'}</td>
                        <td style="text-align: right;" class="action-cell">
                            <button class="btn btn-accent btn-restore-check" data-timestamp="${check.timestamp}" title="Restore Database to this checkpoint state" style="padding: 5px 10px; font-size: 0.8rem;">
                                <i data-lucide="rotate-ccw" style="width: 12px; height: 12px;"></i> Restore
                            </button>
                            <button class="btn btn-icon-only btn-delete-check" data-timestamp="${check.timestamp}" title="Delete Checkpoint" style="padding: 5px; margin-left: 4px;">
                                <i data-lucide="trash-2" style="width: 12px; height: 12px; color: var(--danger)"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

            lucide.createIcons();
            this.setupCheckpointInteractions();

        } catch (e) {
            console.error('Failed to load checkpoints:', e);
            window.showToast('Failed to load checkpoints list.', 'danger');
            body.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--danger);">Failed to load checkpoints.</td></tr>`;
        }
    },

    setupCheckpointInteractions() {
        const body = document.getElementById('checkpoints-list-body');
        if (!body || !this.selectedProfileName) return;

        // RESTORE CHECKPOINT
        body.querySelectorAll('.btn-restore-check').forEach(btn => {
            btn.addEventListener('click', async () => {
                const timestamp = btn.getAttribute('data-timestamp');
                const dateStr = window.formatDate(new Date(timestamp * 1000));
                
                if (confirm(`WARNING: Restore system database to checkpoint state from ${dateStr}? This will overwrite your current database. The server will restart models.`)) {
                    try {
                        btn.disabled = true;
                        window.showToast('Restoring checkpoint state (models may reload)...', 'warning');
                        
                        await api.restoreCheckpoint(this.selectedProfileName, parseInt(timestamp));
                        window.showToast('Database restored successfully!', 'success');
                        
                        // Force refresh console after success
                        setTimeout(() => {
                            window.location.hash = '#/dashboard';
                            window.location.reload();
                        }, 1500);

                    } catch (e) {
                        window.showToast(`Restore failed: ${e.message}`, 'danger');
                        btn.disabled = false;
                    }
                }
            });
        });

        // DELETE CHECKPOINT
        body.querySelectorAll('.btn-delete-check').forEach(btn => {
            btn.addEventListener('click', async () => {
                const timestamp = btn.getAttribute('data-timestamp');
                if (confirm('Delete this checkpoint snapshot?')) {
                    try {
                        btn.disabled = true;
                        // DELETE /api/v1/profiles/{profile_name}/checkpoints/{timestamp}
                        await api._request(`/api/v1/profiles/${encodeURIComponent(this.selectedProfileName)}/checkpoints/${timestamp}`, {
                            method: 'DELETE'
                        });
                        window.showToast('Checkpoint deleted.', 'success');
                        await this.loadCheckpoints();
                    } catch (err) {
                        window.showToast(`Delete failed: ${err.message}`, 'danger');
                        btn.disabled = false;
                    }
                }
            });
        });
    }
};
