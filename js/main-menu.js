/**
 * main-menu.js — STRIP-DOWN PHASE (owner order). The app's only entry
 * screen, and the only place a user can navigate FROM: exactly two
 * functions, RIFLES and RANGE SESSION. Every other surface built in
 * this codebase (steel/zero/chrono fact cards, truing, coach line,
 * PROVEN TO, the Card, Paperwork's other rows, certificates, admin,
 * Categories, etc.) stays fully built and wired underneath — "hidden"
 * means no tap/swipe/URL a user would find reaches it, not that the
 * code was removed. The data layer (dual-write into fact_events, the
 * memory tables) keeps running silently on every save exactly as
 * before, because every save in this stripped-down build still calls
 * the SAME db.js methods everything else always called. See
 * STRIPDOWN-REPORT.md for the full inventory of what's hidden.
 *
 * Renders into #view-home (rifle-app.js's old container — RifleApp is
 * still instantiated in app.js, per "code stays," it's just never
 * .show()n anymore).
 */
var MainMenu = (function () {
    'use strict';

    var _container = null;

    // Bump this string alongside sw.js's CACHE_VERSION so the owner can
    // always tell which build a phone is actually running — a
    // recurring problem per the owner's own instruction. Kept as a
    // plain hardcoded string (not read from sw.js, a separate worker
    // context app.js has no synchronous access to) — simplest, most
    // robust source of truth for a value a human eyeballs.
    var BUILD_STAMP = 'Build 161 · 2026-07-29';

    function init() {
        _container = document.getElementById('view-home');
    }

    function show() {
        if (!_container) _container = document.getElementById('view-home');
        if (!_container) return;
        _container.setAttribute('data-screen', 'main-menu');

        var html = '<div class="screen" style="padding-top:var(--space-xl,64px);display:flex;flex-direction:column;min-height:80vh">';
        html += '<div style="flex:1"></div>';
        html += '<button class="v3-gold" id="mm-rifles" style="margin:0 var(--edge) 16px">Rifles</button>';
        html += '<button class="v3-gold" id="mm-range-session" style="margin:0 var(--edge)">Range Session</button>';
        html += '<div style="flex:2"></div>';
        html += '<div id="mm-build-stamp" style="text-align:center;color:var(--text-secondary,#888);font:var(--type-label,12px sans-serif);padding-bottom:20px">' +
            UI.esc(BUILD_STAMP) + '</div>';
        html += '</div>';
        _container.innerHTML = html;

        var rBtn = document.getElementById('mm-rifles');
        if (rBtn) rBtn.addEventListener('click', function () {
            if (window.AppNav && AppNav.openRifleList) AppNav.openRifleList();
        });
        var sBtn = document.getElementById('mm-range-session');
        if (sBtn) sBtn.addEventListener('click', function () {
            if (window.SessionLaunch) SessionLaunch.start({});
            else if (window.AppNav) AppNav.go('session');
        });
    }

    return { init: init, show: show, BUILD_STAMP: BUILD_STAMP };
})();

if (typeof window !== 'undefined') window.MainMenu = MainMenu;
