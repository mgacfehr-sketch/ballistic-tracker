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

            // Initialize beta feature flags
            if (typeof initBetaFeatures === 'function') {
                initBetaFeatures(user.id);
            }

            // Admin and beta Wind Call live as header utility buttons, not
            // nav tabs — no feature ever adds a tab. They keep the
            // .nav-tab class so the shared view-switch binding drives them.
            var utility = document.querySelector('#app-header .header-utility');

            if (user.id === ADMIN_USER_ID && utility &&
                !utility.querySelector('[data-view="admin"]')) {
                var adminBtn = document.createElement('button');
                adminBtn.className = 'nav-tab util-btn';
                adminBtn.setAttribute('data-view', 'admin');
                adminBtn.setAttribute('title', 'Admin');
                adminBtn.setAttribute('aria-label', 'Admin');
                adminBtn.innerHTML = Icon('sliders');
                utility.insertBefore(adminBtn, utility.firstChild);
            }

            if (typeof isBetaEnabled === 'function' && isBetaEnabled('windCall') &&
                utility && !utility.querySelector('[data-view="wind"]')) {
                var windBtn = document.createElement('button');
                windBtn.className = 'nav-tab util-btn';
                windBtn.setAttribute('data-view', 'wind');
                windBtn.setAttribute('title', 'Wind Call');
                windBtn.setAttribute('aria-label', 'Wind Call');
                windBtn.innerHTML = Icon('wind');
                utility.insertBefore(windBtn, utility.firstChild);
            }

            var db = new BallisticDB(client, user.id);
            db.open().then(function () {
                initApp(db, user);
            }).catch(function (err) {
                console.error('Failed to initialize:', err);
                initApp(null, user);
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

        // ── Forgot password ───────────────────────────────────
        var btnForgot = document.getElementById('btn-forgot');
        if (btnForgot) {
            btnForgot.addEventListener('click', function () {
                var email = emailInput.value.trim();
                if (!email) {
                    showAuthError('Enter your email above, then tap "Forgot password?" again.');
                    return;
                }
                btnForgot.disabled = true;
                client.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin + window.location.pathname
                }).then(function (result) {
                    btnForgot.disabled = false;
                    if (result.error) {
                        showAuthError(result.error.message);
                    } else {
                        showAuthError('Password reset link sent — check your email.');
                    }
                });
            });
        }

        // ── Password recovery (user arrives via the reset email) ──
        var resetPanel = document.getElementById('auth-reset');
        var resetInput = document.getElementById('auth-new-password');
        var btnSetPassword = document.getElementById('btn-set-password');
        client.auth.onAuthStateChange(function (event) {
            if (event === 'PASSWORD_RECOVERY' && resetPanel) {
                showAuth();
                resetPanel.classList.remove('hidden');
                showAuthError('Set a new password to finish the reset.');
            }
        });
        if (btnSetPassword) {
            btnSetPassword.addEventListener('click', function () {
                var pw = resetInput.value;
                if (pw.length < 6) {
                    showAuthError('Password must be at least 6 characters.');
                    return;
                }
                btnSetPassword.disabled = true;
                client.auth.updateUser({ password: pw }).then(function (result) {
                    btnSetPassword.disabled = false;
                    if (result.error) {
                        showAuthError(result.error.message);
                    } else {
                        resetPanel.classList.add('hidden');
                        startApp(result.data.user);
                    }
                });
            });
        }

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
    function initApp(db, user) {
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
        var adminManager = null;
        var windCallManager = null;
        var chronoManager = null;
        var homeManager = null;
        if (db) {
            profileManager = new ProfileManager(db);
            profileManager.init();
            historyManager = new HistoryManager(db, profileManager);
            profileManager.historyManager = historyManager;
            aiAssistant = new AIAssistantManager(db);
            aiAssistant.init();
            solverManager = new BallisticSolverManager(db);
            solverManager.init();
            chronoManager = new ChronoManager(db);
            chronoManager.init();
            profileManager.reportManager = new RifleReportManager(db, profileManager);
            profileManager.certificateManager = new CertificateManager(db, profileManager);

            // Foundation: tool activations + action-first Home
            homeManager = new HomeManager(db);
            homeManager.init();
            homeManager.show(); // Home is the default view — render core actions immediately
            if (typeof ToolRegistry !== 'undefined') {
                ToolRegistry.init(db).then(function () {
                    // Re-render if the user is already looking at Home
                    var homeView = document.getElementById('view-home');
                    if (homeView && homeView.classList.contains('active')) {
                        homeManager.show();
                    }
                    // First-run onboarding (after activations are known;
                    // deep links win inside maybeRunFirstRun)
                    if (typeof Onboarding !== 'undefined' && Onboarding.maybeRunFirstRun) {
                        Onboarding.maybeRunFirstRun(db);
                    }
                });
            }

            // ── AppNav facade ──────────────────────────────────
            // The single string-addressable way to open closure-scoped
            // views from anywhere (Home actions, cards, deep links).
            // switchView is hoisted from below.
            window.AppNav = {
                go: function (viewName) {
                    switchView(viewName);
                },
                openRifle: function (rifleId) {
                    switchView('profiles');
                    profileManager.showRifleDetail(rifleId);
                },
                openChronoReview: function (rifleId) {
                    switchView('chrono');
                    chronoManager.showAssignmentReview(rifleId);
                },
                openReport: function (rifleId) {
                    switchView('profiles');
                    profileManager.reportManager.show(rifleId);
                }
            };
            // Back-compat delegates (existing call sites keep working)
            window.ChronoNav = { openReview: window.AppNav.openChronoReview };
            window.ReportNav = { open: window.AppNav.openReport };

            if (user && user.id === ADMIN_USER_ID) {
                adminManager = new AdminManager(db);
                adminManager.init();
            }

            // Beta: Wind Call Helper
            if (typeof isBetaEnabled === 'function' && isBetaEnabled('windCall') && typeof WindCallManager !== 'undefined') {
                windCallManager = new WindCallManager(db);
                windCallManager.init();
            }

            // Offline Mode
            if (typeof OfflineCache !== 'undefined') {
                OfflineCache.init(db);
            }

            // Certificate-QR deep link (?rifle=<id>) — after auth only
            if (typeof Onboarding !== 'undefined') {
                Onboarding.handleDeepLink(db, function (rifleId) {
                    switchView('profiles');
                    profileManager.showRifleDetail(rifleId);
                });
            }
        } else {
            var profilesContainer = document.getElementById('view-profiles');
            if (profilesContainer) {
                profilesContainer.innerHTML =
                    '<div class="empty-teach">' +
                    '<h3 class="t-head u-mb-12">Database unavailable</h3>' +
                    '<p>Close other tabs using this app and reload.</p>' +
                    '</div>';
            }
        }

        // ── Navigation ─────────────────────────────────────
        var navTabs = document.querySelectorAll('.nav-tab');
        var views = {
            home: document.getElementById('view-home'),
            session: document.getElementById('view-session'),
            profiles: document.getElementById('view-profiles'),
            ai: document.getElementById('view-ai'),
            solver: document.getElementById('view-solver'),
            wind: document.getElementById('view-wind'),
            chrono: document.getElementById('view-chrono'),
            admin: document.getElementById('view-admin')
        };
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

            // Show wind call when switching to wind tab
            if (viewName === 'wind' && windCallManager) {
                windCallManager.show();
            }

            // Cleanup wind call when leaving wind tab
            if (viewName !== 'wind' && windCallManager) {
                windCallManager.cleanup();
            }

            // Show chrono import when switching to chrono tab
            if (viewName === 'chrono' && chronoManager) {
                chronoManager.show();
            }

            // Show Home when switching to the home tab
            if (viewName === 'home' && homeManager) {
                homeManager.show();
            }

            // Show admin when switching to admin tab
            if (viewName === 'admin' && adminManager) {
                adminManager.show();
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
            // Allow scrolling inside the step panel, profiles, AI, solver, wind, and chrono views
            if (e.target.closest('#step-panel') || e.target.closest('#view-profiles') ||
                e.target.closest('#view-ai') || e.target.closest('#view-solver') ||
                e.target.closest('#view-wind') || e.target.closest('#view-admin') ||
                e.target.closest('#view-chrono') ||
                e.target.closest('#view-home')) return;
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

        // Beta: Sunlight / High Contrast mode toggle
        var sunlightBtn = document.getElementById('btn-sunlight-mode');
        if (sunlightBtn) {
            sunlightBtn.addEventListener('click', function () {
                document.body.classList.toggle('high-contrast');
                // Persist preference
                try {
                    var isOn = document.body.classList.contains('high-contrast');
                    localStorage.setItem('yort_high_contrast', isOn ? '1' : '0');
                } catch (e) { /* ignore */ }
            });
            // Restore saved preference
            try {
                if (localStorage.getItem('yort_high_contrast') === '1') {
                    document.body.classList.add('high-contrast');
                }
            } catch (e) { /* ignore */ }
        }
    }
})();
