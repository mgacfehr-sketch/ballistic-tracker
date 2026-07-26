/**
 * test-screen-nav.js — every screen must have a way back to Home.
 *
 * With the bottom tab bar gone (v3.0 step 1), each secondary screen
 * owns its OWN exit — there's no shared fallback anymore. This is a
 * structural/source-text check, not a real DOM walk (the project ships
 * zero build tools or npm packages — see CLAUDE.md — so no Playwright
 * or jsdom dependency belongs in `tests/`), but it directly encodes a
 * real audit: it would have caught the admin/solver/chrono/session-
 * flow-step-1 orphans found and fixed in this same pass.
 *
 * For each known reachable screen-rendering function, extract its
 * source (from the anchor to the next top-level `};`) and assert it
 * contains at least one recognized "way out" marker: a `.backline`/
 * `.toolbar-back`/`.btn-step-back` button, a direct `AppNav.go(`/
 * `AppNav.openRifle(` call, or an exit-via-parent call like
 * `app.show(`/`self.show(`/`this._toolbarHtml(`.
 *
 * Run: node tests/test-screen-nav.js
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');

var passed = 0;
var failed = 0;

function check(label, fn) {
    try {
        fn();
        passed++; console.log('  ✓ ' + label);
    } catch (e) {
        failed++; console.log('  ✗ ' + label + ' — ' + e.message);
    }
}

var EXIT_PATTERNS = [
    'backline', 'toolbar-back', 'btn-step-back',
    'AppNav.go(', 'AppNav.openRifle(', 'AppNav.openSession(', 'AppNav.openReport(',
    'app.show(', 'self.show(', 'this._toolbarHtml(', 'switchView('
];

function hasExit(source) {
    return EXIT_PATTERNS.some(function (p) { return source.indexOf(p) !== -1; });
}

var fileCache = {};
function readFile(rel) {
    if (!fileCache[rel]) fileCache[rel] = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    return fileCache[rel];
}

/** Source from `anchor` to the next top-level `};` (a fallback window
 *  if that marker isn't found within a reasonable distance). */
function extractRegion(source, anchor, maxLen) {
    var start = source.indexOf(anchor);
    if (start === -1) throw new Error('anchor not found: ' + anchor);
    var endMarker = source.indexOf('\n};', start);
    var end = (endMarker !== -1 && endMarker - start < (maxLen || 6000))
        ? endMarker + 3
        : start + (maxLen || 6000);
    return source.slice(start, Math.min(end, source.length));
}

/** Screens reached entirely through a single-function anchor. */
var SCREENS = [
    { file: 'js/rifle-why.js', anchor: 'function show(app, rifle) {', label: 'RifleWhy (view 5)' },
    { file: 'js/rifle-chart.js', anchor: 'function show(app, rifle) {', label: 'RifleChart (view 6)' },
    { file: 'js/rifle-record.js', anchor: 'function show(app, rifle, id, type) {', label: 'RifleRecord (view 7)' },
    { file: 'js/rifle-add.js', anchor: 'function show(app, rifle) {', label: 'RifleAdd chooser (view 2)' },
    { file: 'js/rifle-add.js', anchor: 'function _renderSteel(app, rifle, S, units, step, ctx) {', label: 'RifleAdd steel (view 3b)' },
    { file: 'js/rifle-add.js', anchor: 'function _chronoScreen(app, rifle) {', label: 'RifleAdd chrono (view 3c)' },
    { file: 'js/rifle-add.js', anchor: 'function _noNumbersYet(app, rifle) {', label: 'RifleAdd "one thing first"' },
    { file: 'js/rifle-payoff.js', anchor: 'function _couldNotUse(', label: 'RiflePayoff refusal screen' },
    { file: 'js/rifle-payoff.js', anchor: 'function _renderPayoff(', label: 'RiflePayoff Keep/Undo screen' },

    { file: 'js/profiles.js', anchor: 'ProfileManager.prototype._renderRifleList = function', label: 'Rifles list' },
    { file: 'js/profiles.js', anchor: 'ProfileManager.prototype._renderRifleForm = function', label: 'Rifle form' },
    { file: 'js/profiles.js', anchor: 'ProfileManager.prototype._renderRifleDetail = function', label: 'Rifle detail (Paperwork, view 8)' },
    { file: 'js/profiles.js', anchor: 'ProfileManager.prototype.showBarrelForm = function', label: 'Barrel form' },
    { file: 'js/profiles.js', anchor: 'ProfileManager.prototype._renderLoadForm = function', label: 'Load form' },
    { file: 'js/profiles.js', anchor: 'ProfileManager.prototype._renderLoadDetail = function', label: 'Load detail' },

    { file: 'js/history.js', anchor: 'HistoryManager.prototype._renderSessionList = function', label: 'History: session list' },
    { file: 'js/history.js', anchor: 'HistoryManager.prototype._renderSessionDetail = function', label: 'History: session detail' },
    { file: 'js/history.js', anchor: 'HistoryManager.prototype._renderCleaningLog = function', label: 'History: cleaning log' },
    { file: 'js/history.js', anchor: 'HistoryManager.prototype._renderCleaningForm = function', label: 'History: cleaning form' },
    { file: 'js/history.js', anchor: 'HistoryManager.prototype._renderScopeAdjustments = function', label: 'History: scope adjustments' },
    { file: 'js/history.js', anchor: 'HistoryManager.prototype._renderScopeAdjustmentForm = function', label: 'History: scope adjustment form' },
    { file: 'js/history.js', anchor: 'HistoryManager.prototype._renderMiscSessionList = function', label: 'History: misc session list' },
    { file: 'js/history.js', anchor: 'HistoryManager.prototype._renderMiscSessionDetail = function', label: 'History: misc session detail' },

    { file: 'js/categories.js', anchor: 'function renderScreen(def, ctx) {', label: 'Categories: tool screen' },
    { file: 'js/categories.js', anchor: 'function renderNoRifles(def) {', label: 'Categories: no-rifles state' },

    { file: 'js/admin.js', anchor: 'AdminManager.prototype.show = function', label: 'Admin dashboard' },
    { file: 'js/ballistic-solver.js', anchor: 'BallisticSolverManager.prototype._render = function', label: 'Ballistic Solver' },
    // Chrono's assignment-review screen (_renderAssignmentReview) reuses
    // the #chrono-toolbar-review element show() already builds and wires
    // — not independently anchorable/orphanable, so show() covers both.
    { file: 'js/chrono.js', anchor: 'ChronoManager.prototype.show = function', label: 'Chrono import + assignment review' },
    { file: 'js/wind-call.js', anchor: 'WindCallManager.prototype._renderUI = function', label: 'Wind Call (beta, currently dark)' },

    { file: 'js/device-export.js', anchor: 'function open(db, rifleId) {', label: 'Device export' },
    { file: 'js/rifle-report.js', anchor: 'RifleReportManager.prototype._render = function', label: 'Rifle performance report' },
    { file: 'js/certificate.js', anchor: 'CertificateManager.prototype._renderPreflight = function', label: 'Certificate preflight' }
];

console.log('\nScreen navigation — every reachable screen has a way back:');

SCREENS.forEach(function (s) {
    check(s.label + ' (' + s.file + ')', function () {
        var source = readFile(s.file);
        var region = extractRegion(source, s.anchor, 8000);
        if (!hasExit(region)) {
            throw new Error('no backline/toolbar-back/AppNav.go/app.show found in this screen’s render function');
        }
    });
});

// Whole-file checks for the two large multi-screen advanced loggers —
// step 5 (earlier in the v3.0 build) already swept these individually;
// this is a coarser regression guard, not a re-audit.
['js/steel-session.js', 'js/truing.js', 'js/scope-check.js', 'js/ladder.js', 'js/field.js'].forEach(function (f) {
    check('has at least one AppNav.go/home exit somewhere (' + f + ')', function () {
        var source = readFile(f);
        if (source.indexOf('AppNav.go(') === -1 && source.indexOf('AppNav.openRifle(') === -1) {
            throw new Error('no AppNav.go/openRifle call found in the whole file');
        }
    });
});

// session-flow.js step 1 (the flow's own entry point) — the back
// button lives as static markup in index.html, wired generically by
// session-flow.js's .btn-step-back binder; check both halves.
check('Session flow step 1 has a .btn-step-back in index.html', function () {
    var html = readFile('index.html');
    var start = html.indexOf('id="step-profile"');
    if (start === -1) throw new Error('step-profile section not found');
    var end = html.indexOf('<!-- Step 2:', start);
    var region = html.slice(start, end === -1 ? start + 3000 : end);
    if (region.indexOf('btn-step-back') === -1) {
        throw new Error('step 1 markup has no .btn-step-back button');
    }
});
check('session-flow.js redirects step-1 "back" to Home instead of no-op', function () {
    var source = readFile('js/session-flow.js');
    var region = extractRegion(source, 'SessionFlow.prototype._prevStep = function', 800);
    if (region.indexOf('currentStep <= 0') === -1 || region.indexOf('AppNav.go(') === -1) {
        throw new Error('_prevStep() no longer guards step 0 with an AppNav.go(\'home\') redirect');
    }
});

// app.js: the "Ask yorT" placeholder (currently unreachable — Ask yorT
// is deferred — but it's one AppNav.go('ai') call away from being live,
// so it gets the same guard as everything else).
check('Ask yorT placeholder (js/app.js) has a way back', function () {
    var source = readFile('js/app.js');
    var region = extractRegion(source, "if (viewName === 'ai') {", 1200);
    if (!hasExit(region)) throw new Error('no backline/switchView found in the ai placeholder block');
});

// The Rifles-list "Add rifle"/"Scan certificate" fab-zone must clear
// the iOS home indicator — this is the root cause of the reported
// "cannot add a new rifle" bug, not a nav-orphan, but belongs in the
// same regression net.
check('.fab-zone CSS accounts for env(safe-area-inset-bottom)', function () {
    var css = readFile('css/ui.css');
    var start = css.indexOf('.fab-zone {');
    if (start === -1) throw new Error('.fab-zone rule not found');
    var end = css.indexOf('}', start);
    var region = css.slice(start, end);
    if (region.indexOf('safe-area-inset-bottom') === -1) {
        throw new Error('.fab-zone has no safe-area-inset-bottom padding — its buttons can sit under the home indicator');
    }
});

// The rifle-switcher overlay is the other "where a user actually looks
// for it" entry point for adding a rifle (device bug report) — and it
// must be reachable even with exactly one rifle on file.
check('Rifle switcher (rifle-app.js) always renders the dots/switcher entry, not just for 2+ rifles', function () {
    var source = readFile('js/rifle-app.js');
    var region = extractRegion(source, 'RifleApp.prototype._renderRifle = function', 3000);
    if (/if\s*\(\s*many\s*\)\s*\{[^}]*v3-dots/.test(region)) {
        throw new Error('the dots/switcher button is still gated behind a >1-rifle check');
    }
    if (region.indexOf('id="rf-dots"') === -1) {
        throw new Error('no #rf-dots switcher button rendered at all');
    }
});
check('Rifle switcher overlay offers "Add a rifle" and "Scan certificate"', function () {
    var source = readFile('js/rifle-app.js');
    var region = extractRegion(source, 'RifleApp.prototype._openRifleList = function', 3000);
    if (region.indexOf('data-pick-add') === -1) throw new Error('no "+ Add a rifle" row in the switcher list');
    if (region.indexOf('data-pick-scan') === -1) throw new Error('no "Scan certificate" row in the switcher list');
});

console.log('\n' + '═'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
