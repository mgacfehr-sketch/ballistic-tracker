/**
 * app.js — Application initialization, authentication, and navigation.
 *
 * Creates the Supabase client, handles login/signup/logout,
 * then initializes CanvasManager, SessionFlow, BallisticDB, and ProfileManager.
 */

(function () {
    'use strict';

    // ── Supabase credentials (replace with your project values) ──
    var SUPABASE_URL = 'https://lfqegsspgojhmfiqexlk.supabase.co';
    var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmcWVnc3NwZ29qaG1maXFleGxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODU1NTAsImV4cCI6MjA4NzQ2MTU1MH0.dMdU6eP5SLXs1ecpvjiTkAAg4Dt6OYgapv0KE8e7qEo';

    document.addEventListener('DOMContentLoaded', function () {
        var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

        // ── Auth DOM elements ─────────────────────────────────
        var authScreen = document.getElementById('view-auth');
        var appEl = document.getElementById('app');
        var authError = document.getElementById('auth-error');
        var emailInput = document.getElementById('auth-email');
        var passInput = document.getElementById('auth-password');
        var btnLogin = document.getElementById('btn-login');
        var btnSignup = document.getElementById('btn-signup');
        var btnLogout = document.getElementById('btn-logout');

        function showAuth() {
            authScreen.classList.remove('hidden');
            appEl.classList.add('hidden');
            authError.textContent = '';
        }

        function showAuthError(msg) {
            authError.textContent = msg;
        }

        function startApp(user) {
            authScreen.classList.add('hidden');
            appEl.classList.remove('hidden');

            var db = new BallisticDB(client, user.id);
            db.open().then(function () {
                initApp(db);
            }).catch(function (err) {
                console.error('Failed to initialize:', err);
                initApp(null);
            });
        }

        // ── Check existing session ────────────────────────────
        client.auth.getSession().then(function (result) {
            if (result.data.session) {
                startApp(result.data.session.user);
            } else {
                showAuth();
            }
        });

        // ── Login ─────────────────────────────────────────────
        btnLogin.addEventListener('click', function () {
            var email = emailInput.value.trim();
            var pass = passInput.value;
            if (!email || !pass) {
                showAuthError('Enter email and password.');
                return;
            }
            btnLogin.disabled = true;
            btnSignup.disabled = true;
            authError.textContent = '';
            client.auth.signInWithPassword({ email: email, password: pass })
                .then(function (result) {
                    btnLogin.disabled = false;
                    btnSignup.disabled = false;
                    if (result.error) {
                        showAuthError(result.error.message);
                    } else {
                        startApp(result.data.user);
                    }
                });
        });

        // ── Signup ────────────────────────────────────────────
        btnSignup.addEventListener('click', function () {
            var email = emailInput.value.trim();
            var pass = passInput.value;
            if (!email || !pass) {
                showAuthError('Enter email and password.');
                return;
            }
            if (pass.length < 6) {
                showAuthError('Password must be at least 6 characters.');
                return;
            }
            btnLogin.disabled = true;
            btnSignup.disabled = true;
            authError.textContent = '';
            client.auth.signUp({ email: email, password: pass })
                .then(function (result) {
                    btnLogin.disabled = false;
                    btnSignup.disabled = false;
                    if (result.error) {
                        showAuthError(result.error.message);
                    } else if (result.data.session) {
                        startApp(result.data.user);
                    } else {
                        showAuthError('Check your email to confirm your account.');
                    }
                });
        });

        // ── Allow Enter key to submit ─────────────────────────
        passInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                btnLogin.click();
            }
        });

        // ── Logout ────────────────────────────────────────────
        btnLogout.addEventListener('click', function () {
            client.auth.signOut().then(function () {
                window.location.reload();
            });
        });
    });

    // ── App initialization (unchanged from original) ──────────
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
            solver: document.getElementById('view-solver')
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

        // ── Touch Prevention ───────────────────────────────
        document.getElementById('app').addEventListener('touchmove', function (e) {
            // Allow scrolling inside the step panel, profiles, AI, and solver views
            if (e.target.closest('#step-panel') || e.target.closest('#view-profiles') ||
                e.target.closest('#view-ai') || e.target.closest('#view-solver')) return;
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
