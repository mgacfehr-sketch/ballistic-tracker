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
    { file: 'js/rifle-add.js', anchor: 'function _needsAmmo(app, rifle, S, units, ctx) {', label: 'RifleAdd steel "needs ammo" inline form' },
    { file: 'js/rifle-add.js', anchor: 'function _loggedNeedsNumbers(app, rifle, load) {', label: 'RifleAdd steel "logged, needs numbers"' },
    { file: 'js/rifle-add.js', anchor: 'function _chronoNeedsAmmo(app, rifle, S) {', label: 'RifleAdd chrono "needs ammo" inline form' },
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
check('Rifle name (rifle-app.js) always renders and opens the switcher list, regardless of rifle count', function () {
    var source = readFile('js/rifle-app.js');
    var region = extractRegion(source, 'RifleApp.prototype._renderRifle = function', 3000);
    if (region.indexOf('id="rf-rname"') === -1) {
        throw new Error('no #rf-rname button rendered at all');
    }
    if (region.indexOf('id="rf-details-link"') === -1) {
        throw new Error('no separate "Rifle details" link rendered — Paperwork needs its own plainly-labeled entry, not a shared tap target with the switcher');
    }
    var bindRegion = extractRegion(source, "var rnameBtn = document.getElementById('rf-rname');", 400);
    if (bindRegion.indexOf('_openRifleList()') === -1) {
        throw new Error('the rifle name no longer opens the switcher list (_openRifleList) — device feedback was explicit that the name, not the dots, is the primary switcher');
    }
});
check('Rifle switcher overlay offers "Add a rifle" and "Scan certificate"', function () {
    var source = readFile('js/rifle-app.js');
    var region = extractRegion(source, 'RifleApp.prototype._openRifleList = function', 3000);
    if (region.indexOf('data-pick-add') === -1) throw new Error('no "+ Add a rifle" row in the switcher list');
    if (region.indexOf('data-pick-scan') === -1) throw new Error('no "Scan certificate" row in the switcher list');
});
check('Rifle switcher search box is always visible, not gated by rifle count (Contract v4.0 §3)', function () {
    var source = readFile('js/rifle-app.js');
    var region = extractRegion(source, 'RifleApp.prototype._openRifleList = function', 3500);
    // Contract v4.0 §3: "search box always visible (not gated at 8)" —
    // a 50-rifle fleet is real and shouldn't have to grow into search.
    if (/_rifles\.length > \d+\s*\?/.test(region)) {
        throw new Error('search input is still gated behind a rifle-count threshold');
    }
    if (region.indexOf('id="rf-switcher-search"') === -1) {
        throw new Error('no search <input> in the switcher overlay');
    }
    if (region.indexOf("addEventListener('input'") === -1) {
        throw new Error('the search input has no filter handler wired up');
    }
});

console.log('\nLoad pickers must never dead-end on a rifle with no ammo:');

check('js/new-ammo.js exports NewAmmoForm.html/bind', function () {
    var source = readFile('js/new-ammo.js');
    if (source.indexOf('html: html, bind: bind') === -1 && (source.indexOf('html:') === -1 || source.indexOf('bind:') === -1)) {
        throw new Error('NewAmmoForm does not export both html() and bind()');
    }
});
check('Paper session picker (session-flow.js) offers "+ New ammo" per rifle', function () {
    var source = readFile('js/session-flow.js');
    var region = extractRegion(source, 'SessionFlow.prototype._renderProfilePicker = function', 6000);
    if (region.indexOf('data-new-ammo-rifle') === -1) throw new Error('no "+ New ammo" row in the profile picker');
    if (region.indexOf('NewAmmoForm') === -1) throw new Error('picker does not use NewAmmoForm');
    if (region.indexOf('_selectProfile(') === -1) throw new Error('saving new ammo does not continue into the session (_selectProfile)');
});
check('Steel entry (rifle-add.js) never blocks the save on missing ammo/numbers', function () {
    var source = readFile('js/rifle-add.js');
    var region = extractRegion(source, "document.getElementById('rs-done').addEventListener", 1200);
    if (region.indexOf('_needsAmmo(') === -1) {
        throw new Error('no-load case no longer routes to the inline "+ New ammo" form');
    }
    if (region.indexOf('_finishSteelSave(') === -1) {
        throw new Error('rs-done no longer calls a shared save path — check the load-present case still saves');
    }
    var saveRegion = extractRegion(source, 'function _finishSteelSave(', 2000);
    if (saveRegion.indexOf('addSteelString') === -1 || saveRegion.indexOf('addSteelShot') === -1) {
        throw new Error('_finishSteelSave no longer saves the string/shot unconditionally');
    }
});
check('Chrono "just a guess" (rifle-add.js) never alert-and-bails on missing ammo', function () {
    var source = readFile('js/rifle-add.js');
    var region = extractRegion(source, "document.getElementById('rc-save').addEventListener", 900);
    if (/alert\(['"]Add a rifle load first/.test(region)) {
        throw new Error('the guess path still alert()s and bails instead of offering "+ New ammo" inline');
    }
    if (region.indexOf('_chronoNeedsAmmo(') === -1) {
        throw new Error('no-load guess case no longer routes to the inline "+ New ammo" form');
    }
});
check('View 1 drop chart (rifle-app.js) never hangs on "loading" with no ammo on file', function () {
    var source = readFile('js/rifle-app.js');
    var region = extractRegion(source, 'RifleApp.prototype._fillChart = function', 2200);
    // Every early-exit branch in this function must route through the
    // coaching fallback (AUDIT-FINDINGS.md F1), not a bare `return;`
    // that leaves the card on its initial loading placeholder forever.
    var bareReturns = region.match(/\{\s*return;\s*\}|\)\s*return;/g) || [];
    bareReturns.forEach(function (snippet) {
        if (snippet.indexOf('_noChartYet') === -1) {
            throw new Error('found an early return with no _noChartYet() fallback: ' + snippet.trim());
        }
    });
    if (region.indexOf('_noChartYet()') === -1) {
        throw new Error('_fillChart no longer calls _noChartYet() at all');
    }
});
check('The chart card taps straight to ammo creation when there are no numbers yet', function () {
    var source = readFile('js/rifle-app.js');
    var region = extractRegion(source, "var chartBox = document.getElementById('rf-chart');", 500);
    if (region.indexOf('_openAmmoForm') === -1) {
        throw new Error('the chart card\'s click handler no longer routes to _openAmmoForm for the no-numbers case');
    }
});
check('History\'s "Check a target" empty state (js/history.js) keeps its rifle context', function () {
    var source = readFile('js/history.js');
    var region = extractRegion(source, 'HistoryManager.prototype._renderSessionList = function', 2200);
    if (region.indexOf("SessionLaunch.start({ rifleId: rifle.id })") === -1) {
        // AUDIT-FINDINGS.md F2: this button is unambiguously rifle-scoped
        // (rifle.id is already used elsewhere in this same function) —
        // a blind AppNav.go('session') dropped that and landed the user
        // on the all-rifles picker instead of starting a session for
        // the rifle they were already looking at.
        throw new Error('the "Check a target" empty-state button no longer starts SessionLaunch with this rifle\'s id');
    }
});

console.log('\nSessionLaunch never falls through to the flat, unscoped all-rifles picker:');

check('SessionLaunch.start (js/app.js) flags a pending scoped launch before switchView', function () {
    var source = readFile('js/app.js');
    var region = extractRegion(source, 'window.SessionLaunch = {', 4300);
    if (region.indexOf('_scopedLaunchPending = true') === -1) {
        // AUDIT-FINDINGS.md F3: switchView('session') synchronously
        // triggers _loadProfilePicker()'s flat, all-rifles render. When
        // SessionLaunch.start already knows the rifle, it must flag that
        // BEFORE switchView fires so the flat picker skips itself
        // instead of racing (and possibly winning) against the
        // rifle-scoped picker rendered once the lookup resolves.
        throw new Error('SessionLaunch.start no longer sets _scopedLaunchPending before switchView(\'session\')');
    }
    if (region.indexOf('_renderProfilePicker([{ rifle: rifle, loads: [] }])') === -1) {
        throw new Error('the no-load case no longer scopes the picker to just the origin rifle');
    }
    // The flag must be cleared at least 3 times: the two early-return
    // guards, plus once after the scoped Promise chain settles (success
    // or failure) — otherwise a later, genuinely blind picker call
    // could be wrongly suppressed forever.
    var clears = region.split('_scopedLaunchPending = false').length - 1;
    if (clears < 3) {
        throw new Error('_scopedLaunchPending is not cleared on every exit path (found ' + clears + ', need >= 3) — it could wrongly suppress a later flat picker');
    }
});
check('_loadProfilePicker (js/session-flow.js) yields to a pending scoped launch', function () {
    var source = readFile('js/session-flow.js');
    var region = extractRegion(source, 'SessionFlow.prototype._loadProfilePicker = function', 400);
    if (region.indexOf('_scopedLaunchPending') === -1) {
        throw new Error('_loadProfilePicker no longer checks _scopedLaunchPending — the race with SessionLaunch.start\'s scoped picker is back');
    }
});
check('Chrono import (js/chrono.js) saves through SyncQueue, not a direct db call (F6)', function () {
    var source = readFile('js/chrono.js');
    if (source.indexOf('self.db.addVelocityString(record)') !== -1 &&
        source.indexOf("SyncQueue.write('addVelocityString', record)") === -1) {
        // AUDIT-FINDINGS.md F6: addVelocityString is already listed in
        // SyncQueueCore.FN_TABLE — every other add-flow in the app
        // writes through SyncQueue.write for exactly this reason. A
        // direct db.addVelocityString call here means an offline import
        // is lost instead of queued, despite the architecture already
        // supporting it.
        throw new Error('chrono import calls db.addVelocityString directly instead of through SyncQueue.write');
    }
    if (source.indexOf("SyncQueue.write('addVelocityString', record)") === -1) {
        throw new Error('chrono import no longer routes the save through SyncQueue.write at all');
    }
});

console.log('\n' + '═'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
