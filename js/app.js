/**
 * ColdChain AI — Main Application Controller
 */
const App = {
    pages: {
        dashboard: { title: 'Kontrol Paneli', renderer: DashboardPage },
        upload: { title: 'Veri Yükleme', renderer: UploadPage },
        analysis: { title: 'Analiz & Karar', renderer: AnalysisPage },
        report: { title: 'Rapor', renderer: ReportPage },
        audit: { title: 'Denetim İzi', renderer: AuditPage }
    },

    init() {
        // Window Controls (Electron)
        try {
            const { ipcRenderer } = require('electron');
            
            const btnMinimize = document.getElementById('btn-minimize');
            if (btnMinimize) {
                btnMinimize.addEventListener('click', () => {
                    ipcRenderer.send('window-minimize');
                });
            }
            
            const btnMaximize = document.getElementById('btn-maximize');
            if (btnMaximize) {
                btnMaximize.addEventListener('click', () => {
                    ipcRenderer.send('window-maximize-toggle');
                });
            }

            const btnClose = document.getElementById('btn-close');
            if (btnClose) {
                btnClose.addEventListener('click', () => {
                    ipcRenderer.send('window-close');
                });
            }

            // Window state change listener (to update icons)
            ipcRenderer.on('window-state-changed', (event, state) => {
                const icon = document.getElementById('maximize-icon');
                if (!icon) return;

                if (state === 'maximized' || state === 'fullscreen') {
                    // Show "Restore" icon (two squares)
                    icon.innerHTML = '<path d="M8 8V4h12v12h-4M4 8h12v12H4z" />';
                } else {
                    // Show "Maximize" icon (one square)
                    icon.innerHTML = '<rect x="4" y="4" width="16" height="16" rx="2" />';
                }
            });
        } catch (e) {
            console.log('Tarayıcı ortamı: Pencere kontrolleri devre dışı');
            // Hide window controls if not in electron
            const controls = document.querySelector('.window-controls');
            if (controls) controls.style.display = 'none';
        }

        // Loading screen
        setTimeout(() => {
            const ls = document.getElementById('loading-screen');
            ls.classList.add('fade-out');
            setTimeout(() => {
                ls.style.display = 'none';
                document.getElementById('app').classList.remove('hidden');
                this.navigate('dashboard');
            }, 500);
        }, 2000);

        // Sidebar navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.querySelector('.nav-link').addEventListener('click', () => {
                this.navigate(item.dataset.page);
            });
        });

        // Sidebar toggle (mobile)
        document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });

        // Close sidebar on content click (mobile)
        document.getElementById('main-content')?.addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('open');
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                document.getElementById('global-search')?.focus();
            }
        });

        // Notification demo
        document.getElementById('notification-btn')?.addEventListener('click', () => {
            Utils.showToast('3 bekleyen bildirim var', 'info');
        });

        console.log('%c🧊 ColdChain AI v1.0', 'color:#06b6d4;font-size:20px;font-weight:bold');
        console.log('%cSoğuk Zincir İade Otomasyon Sistemi', 'color:#8b5cf6;font-size:12px');
    },

    navigate(pageId) {
        if (!this.pages[pageId]) return;
        AppState.currentPage = pageId;

        // NEW: Navigation logic preserved - session is no longer auto-cleared here
        // to allow users to return to upload page without losing current analysis.
        // Clear is now handled explicitly when new files are being prepared.

        // Update nav
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelector(`[data-page="${pageId}"]`)?.classList.add('active');

        // Update page title
        document.getElementById('page-title').textContent = this.pages[pageId].title;

        // Show page
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(`page-${pageId}`).classList.add('active');

        // Render page
        this.pages[pageId].renderer.render();

        // Close mobile sidebar
        document.getElementById('sidebar').classList.remove('open');

        // Scroll to top
        document.getElementById('page-container').scrollTop = 0;
    }
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
