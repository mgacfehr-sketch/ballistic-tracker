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
        if (db) {
            profileManager = new ProfileManager(db);
            profileManager.init();
            historyManager = new HistoryManager(db, profileManager);
            profileManager.historyManager = historyManager;
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
            profiles: document.getElementById('view-profiles')
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

            // Resize canvas when switching back to session
            if (viewName === 'session') {
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
            // Allow scrolling inside the step panel and profiles view
            if (e.target.closest('#step-panel') || e.target.closest('#view-profiles')) return;
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
