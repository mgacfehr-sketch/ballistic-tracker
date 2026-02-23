/**
 * app.js — Application initialization and navigation.
 *
 * Creates the CanvasManager, SessionFlow, BallisticDB, and ProfileManager.
 * Handles view switching between Session and Profiles tabs.
 */

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        // ── Initialize DB ──────────────────────────────────
        var db = new BallisticDB();

        db.open().then(function () {
            initApp(db);
        }).catch(function (err) {
            console.error('Failed to open database:', err);
            alert('Database error: ' + err.message);
            // Fall back to running without DB
            initApp(null);
        });
    });

    function initApp(db) {
        // ── Canvas & Session ───────────────────────────────
        var canvasEl = document.getElementById('main-canvas');
        var hintEl = document.getElementById('canvas-hint');
        var zoomEl = document.getElementById('zoom-indicator');

        var canvasManager = new CanvasManager(canvasEl, hintEl, zoomEl);
        var sessionFlow = new SessionFlow(canvasManager, db);
        sessionFlow.init();

        // ── Profiles & History ─────────────────────────────
        var profileManager = null;
        var historyManager = null;
        var aiAssistant = null;
        var solverManager = null;
        if (db) {
            profileManager = new ProfileManager(db);
            profileManager.init();
            historyManager = new HistoryManager(db, profileManager);
            profileManager.historyManager = historyManager;
            aiAssistant = new AIAssistantManager(db);
            aiAssistant.init();
            solverManager = new BallisticSolverManager(db);
            solverManager.init();
        } else {
            var profilesContainer = document.getElementById('view-profiles');
            if (profilesContainer) {
                profilesContainer.innerHTML =
                    '<div style="padding:2rem;text-align:center;color:#ff6b6b;">' +
                    '<h3>Database Unavailable</h3>' +
                    '<p>Close other tabs using this app and reload.</p>' +
                    '</div>';
            }
        }

        // ── Navigation ─────────────────────────────────────
        var navTabs = document.querySelectorAll('.nav-tab');
        var views = {
            session: document.getElementById('view-session'),
            profiles: document.getElementById('view-profiles'),
            ai: document.getElementById('view-ai'),
            solver: document.getElementById('view-solver'),
            settings: document.getElementById('view-settings')
        };
        var btnNewSession = document.getElementById('btn-new-session');

        function switchView(viewName) {
            // Update tabs
            for (var i = 0; i < navTabs.length; i++) {
                if (navTabs[i].getAttribute('data-view') === viewName) {
                    navTabs[i].classList.add('active');
                } else {
                    navTabs[i].classList.remove('active');
                }
            }

            // Update views
            for (var key in views) {
                if (key === viewName) {
                    views[key].classList.add('active');
                } else {
                    views[key].classList.remove('active');
                }
            }

            // Show/hide new session button (only in session view)
            if (btnNewSession) {
                btnNewSession.style.display = viewName === 'session' ? '' : 'none';
            }

            // Load profiles content when switching to profiles tab
            if (viewName === 'profiles' && profileManager) {
                profileManager.showRifleList();
            }

            // Show AI assistant when switching to AI tab
            if (viewName === 'ai' && aiAssistant) {
                aiAssistant.show();
            }

            // Show solver when switching to solver tab
            if (viewName === 'solver' && solverManager) {
                solverManager.show();
            }

            // Render settings when switching to settings tab
            if (viewName === 'settings') {
                renderSettings();
            }

            // Refresh profile picker and resize canvas when switching back to session
            if (viewName === 'session') {
                if (sessionFlow && sessionFlow.currentStep === 0) {
                    sessionFlow._loadProfilePicker();
                }
                window.dispatchEvent(new Event('resize'));
            }
        }

        for (var i = 0; i < navTabs.length; i++) {
            navTabs[i].addEventListener('click', function () {
                switchView(this.getAttribute('data-view'));
            });
        }

        // ── Settings Rendering ────────────────────────────
        function renderSettings() {
            var container = views.settings;
            if (!container) return;

            // Build HTML only once; reload key from DB every time
            if (!container.querySelector('.profile-screen')) {
                var html = '<div class="profile-screen">';
                html += '<div class="profile-toolbar"><div class="toolbar-spacer"></div>';
                html += '<span class="profile-title">Settings</span>';
                html += '<div class="toolbar-spacer"></div></div>';

                html += '<div class="profile-form">';
                html += '<div class="form-group">';
                html += '<label for="settings-api-key">Anthropic API Key</label>';
                html += '<input type="password" id="settings-api-key" placeholder="sk-ant-..." autocomplete="off">';
                html += '<span class="form-hint">Your key is stored locally and only sent to api.anthropic.com</span>';
                html += '</div>';

                html += '<div class="btn-row">';
                html += '<button class="btn btn-primary" id="settings-save-key">Save Key</button>';
                html += '</div>';
                html += '<div id="settings-status"></div>';
                html += '</div></div>';

                container.innerHTML = html;

                // Save handler (bound once)
                document.getElementById('settings-save-key').addEventListener('click', function () {
                    var input = document.getElementById('settings-api-key');
                    var statusEl = document.getElementById('settings-status');
                    if (!input || !db) return;

                    var value = input.value.trim();
                    if (!value) {
                        db.deleteSetting('anthropic-api-key').then(function () {
                            if (aiAssistant) aiAssistant.apiKey = null;
                            statusEl.className = 'settings-status settings-status-success';
                            statusEl.textContent = 'API key removed.';
                        });
                        return;
                    }

                    db.setSetting('anthropic-api-key', value).then(function () {
                        if (aiAssistant) aiAssistant.apiKey = value;
                        statusEl.className = 'settings-status settings-status-success';
                        statusEl.textContent = 'API key saved.';
                    }).catch(function (err) {
                        statusEl.className = 'settings-status settings-status-error';
                        statusEl.textContent = 'Error saving key: ' + err.message;
                    });
                });
            }

            // Always reload key from DB when settings tab is shown
            if (db) {
                db.getSetting('anthropic-api-key').then(function (key) {
                    var input = document.getElementById('settings-api-key');
                    if (input) {
                        input.value = key || '';
                    }
                });
            }
        }

        // ── Touch Prevention ───────────────────────────────
        document.getElementById('app').addEventListener('touchmove', function (e) {
            // Allow scrolling inside the step panel, profiles, AI, and settings views
            if (e.target.closest('#step-panel') || e.target.closest('#view-profiles') ||
                e.target.closest('#view-ai') || e.target.closest('#view-solver') ||
                e.target.closest('#view-settings')) return;
            e.preventDefault();
        }, { passive: false });

        // Prevent double-tap zoom on iOS
        var lastTouchEnd = 0;
        document.addEventListener('touchend', function (e) {
            var now = Date.now();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
    }
})();
