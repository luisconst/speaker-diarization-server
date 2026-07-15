import api from './api.js';
import DashboardView from './components/dashboard.js';
import ConversationsView from './components/conversations.js';
import DetailView from './components/detail.js';
import SpeakersView from './components/speakers.js';
import StreamingView from './components/streaming.js';
import SettingsView from './components/settings.js';
import BackupView from './components/backup.js';

// Global date formatter in dd/mm/yyyy hh:mm format
export function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${d}/${m}/${y} ${h}:${min}`;
}
window.formatDate = formatDate;

// Global application state
const AppState = {
    currentPath: '',
    statusPollingInterval: null,
    gpuInfo: null,
    activeAudioPlayer: null
};

// Route definitions (hash-based)
const routes = [
    { pattern: /^#\/dashboard$/, handler: DashboardView, title: 'Dashboard' },
    { pattern: /^#\/conversations$/, handler: ConversationsView, title: 'Conversations' },
    { pattern: /^#\/conversations\/(\d+)$/, handler: DetailView, title: 'Conversation Details' },
    { pattern: /^#\/streaming$/, handler: StreamingView, title: 'Live Streaming Recording' },
    { pattern: /^#\/speakers$/, handler: SpeakersView, title: 'Voice Profiles' },
    { pattern: /^#\/settings$/, handler: SettingsView, title: 'System Settings' },
    { pattern: /^#\/backup$/, handler: BackupView, title: 'Backup & Restore' }
];

/**
 * Show a floating toast notification.
 */
export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    if (type === 'danger') iconName = 'alert-triangle';
    if (type === 'warning') iconName = 'alert-circle';

    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <div class="toast-message">${message}</div>
    `;

    container.appendChild(toast);
    lucide.createIcons();

    // Auto remove
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse forwards';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Expose toast to window so other components can access it easily if needed
window.showToast = showToast;

/**
 * Poll system status (VRAM, GPU, connectivity)
 */
async function pollSystemStatus() {
    try {
        const status = await api.getStatus();
        
        // Update status indicator in sidebar
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.getElementById('system-status-text');
        
        if (statusDot && statusText) {
            statusDot.className = 'status-dot online';
            statusText.textContent = 'Server Online';
        }

        // Update GPU/VRAM widget
        const gpuName = document.getElementById('gpu-name');
        const vramUsed = document.getElementById('vram-used');
        const vramTotal = document.getElementById('vram-total');
        const vramFill = document.getElementById('vram-fill');

        if (status.gpu_available) {
            AppState.gpuInfo = status;
            
            // Note: status response fields depend on api structure. Let's parse device
            if (gpuName) gpuName.textContent = status.device || 'CUDA GPU';
            
            // Assume database or additional endpoint provides VRAM info. 
            // In the backend status response: StatusResponse(status="online", message="Server is running", gpu_available=..., device=...)
            // Wait, does the API return VRAM? Let's check api.py or assume if not, we display device name.
            // Let's inspect get_status in api.py. Let's see. 
            // If it doesn't return VRAM, we'll default VRAM to "Active" or read it if available.
            // We can fetch VRAM from status if we add it or read standard. Let's make it look elegant!
            
            if (status.gpu_vram_allocated_gb !== undefined && status.gpu_vram_allocated_gb !== null &&
                status.gpu_vram_total_gb !== undefined && status.gpu_vram_total_gb !== null) {
                const used = status.gpu_vram_allocated_gb.toFixed(1);
                const total = status.gpu_vram_total_gb.toFixed(1);
                const pct = (status.gpu_vram_allocated_gb / status.gpu_vram_total_gb * 100).toFixed(0);
                if (vramUsed) vramUsed.textContent = used;
                if (vramTotal) vramTotal.textContent = total;
                if (vramFill) vramFill.style.width = `${pct}%`;
            } else {
                // Mock VRAM indicator using typical GPU values (e.g. 24GB RTX 3090/5090) if not provided by backend
                // or just display a static active state
                if (vramUsed) vramUsed.textContent = 'Active';
                if (vramTotal) vramTotal.textContent = 'CUDA';
                if (vramFill) vramFill.style.width = '25%';
            }
        } else {
            if (gpuName) gpuName.textContent = 'CPU Mode';
            if (vramUsed) vramUsed.textContent = '-';
            if (vramTotal) vramTotal.textContent = '-';
            if (vramFill) vramFill.style.width = '0%';
        }

    } catch (error) {
        console.error('Failed to connect to backend status API:', error);
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.getElementById('system-status-text');
        
        if (statusDot && statusText) {
            statusDot.className = 'status-dot offline';
            statusText.textContent = 'Server Offline';
        }
    }
}

/**
 * Handle routing and view swapping
 */
async function routerCoordinator() {
    // Terminate any active audio player before switching pages
    if (AppState.activeAudioPlayer) {
        AppState.activeAudioPlayer.pause();
        AppState.activeAudioPlayer = null;
    }

    const hash = window.location.hash || '#/dashboard';
    AppState.currentPath = hash;

    // Find matching route
    let matchedRoute = null;
    let matchArgs = [];

    for (const route of routes) {
        const match = hash.match(route.pattern);
        if (match) {
            matchedRoute = route;
            matchArgs = match.slice(1); // Extract capture groups
            break;
        }
    }

    // Default to dashboard if route not found
    if (!matchedRoute) {
        window.location.hash = '#/dashboard';
        return;
    }

    // Update view title
    const viewTitle = document.getElementById('view-title');
    if (viewTitle) viewTitle.textContent = matchedRoute.title;

    // Highlight sidebar navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        // Strip out active class
        item.classList.remove('active');
        
        // Find matching nav based on page data-page attribute
        const targetPage = item.getAttribute('data-page');
        if (hash.startsWith(`#/${targetPage}`)) {
            item.classList.add('active');
        }
    });

    // Render container
    const viewContainer = document.getElementById('view-container');
    if (viewContainer) {
        // Render spinner
        viewContainer.innerHTML = `
            <div class="loading-spinner-container">
                <div class="spinner"></div>
                <p>Loading view...</p>
            </div>
        `;

        try {
            // Render the component view
            const viewHtml = await matchedRoute.handler.render(...matchArgs);
            viewContainer.innerHTML = viewHtml;
            
            // Run component initializer logic (like adding event listeners)
            if (matchedRoute.handler.init) {
                await matchedRoute.handler.init(...matchArgs);
            }
            
            // Re-render Lucide icons
            lucide.createIcons();
        } catch (error) {
            console.error('Error rendering view:', error);
            viewContainer.innerHTML = `
                <div class="content-card text-center" style="padding: 40px; margin-top: 40px; border-color: var(--danger-glow)">
                    <i data-lucide="alert-triangle" style="width:48px; height:48px; color:var(--danger); margin-bottom:16px;"></i>
                    <h3 style="color:var(--danger); font-family:var(--font-heading); margin-bottom:8px;">Failed to Load View</h3>
                    <p style="color:var(--text-muted); font-size:0.95rem;">${error.message || 'An unexpected error occurred.'}</p>
                    <button class="btn btn-secondary" onclick="window.location.reload()" style="margin-top:20px;">Reload Console</button>
                </div>
            `;
            lucide.createIcons();
        }
    }
}

// Initial setup
window.addEventListener('hashchange', routerCoordinator);
window.addEventListener('load', () => {
    // Initialize operator input from localStorage
    const operatorInput = document.getElementById('active-operator-input');
    if (operatorInput) {
        operatorInput.value = localStorage.getItem('active_user') || '';
        operatorInput.addEventListener('input', (e) => {
            localStorage.setItem('active_user', e.target.value.trim());
        });
    }

    // Initialize user filter from localStorage
    window.currentUser = localStorage.getItem('filter_user') || '';
    const userSelect = document.getElementById('user-filter-select');
    if (userSelect) {
        userSelect.value = window.currentUser;
        userSelect.addEventListener('change', (e) => {
            window.currentUser = e.target.value;
            localStorage.setItem('filter_user', window.currentUser);
            routerCoordinator(); // Reload current view to apply filter
        });
    }

    // Populate user filter list
    async function loadUserFilterList() {
        try {
            const res = await api.getUsers();
            if (res && res.users && userSelect) {
                // Keep selected user
                const selected = userSelect.value;
                userSelect.innerHTML = '<option value="">All Users</option>';
                res.users.forEach(user => {
                    const opt = document.createElement('option');
                    opt.value = user;
                    opt.textContent = user;
                    userSelect.appendChild(opt);
                });
                userSelect.value = selected;
            }
        } catch (err) {
            console.error('Failed to load users for filter:', err);
        }
    }

    loadUserFilterList();

    // Trigger initial route
    routerCoordinator();
    
    // Poll system status immediately and every 5 seconds
    pollSystemStatus();
    AppState.statusPollingInterval = setInterval(pollSystemStatus, 5000);
});

// Forward client exceptions to uvicorn log
window.addEventListener('error', (e) => {
    fetch('/api/v1/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: e.message,
            filename: e.filename,
            lineno: e.lineno,
            colno: e.colno,
            stack: e.error ? e.error.stack : null
        })
    }).catch(err => console.error('Failed to log error to backend:', err));
});
