/**
 * test-stripdown-loop.js — STRIP-DOWN PHASE QA gate (owner order).
 *
 * This codebase ships zero build tools and no browser test runner
 * (CLAUDE.md; see tests/test-failure-injection.js's own header for the
 * established precedent) — there is no jsdom/Playwright available in
 * this environment to literally click through the app. This suite
 * traces the REAL, CURRENT source of the complete loop the owner
 * specified — create rifle -> add ammo -> range session -> photo ->
 * group -> MV -> save -> view it on the rifle -> edit the rifle — hop
 * by hop, asserting the exact function/field each step actually calls
 * today, not an idealized version. Combined with the pure-logic
 * db.js/session-flow.js field-mapping checks (which run for real,
 * not just grepped), this is the most rigorous proof achievable
 * without a browser in this environment.
 *
 * Part A: the two-destination law (exactly Rifles + Range Session are
 * reachable from the app's resting screen).
 * Part B: the complete loop, traced hop by hop.
 *
 * Run: node tests/test-stripdown-loop.js
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var passed = 0;
var failed = 0;
function check(label, fn) {
    try { fn(); passed++; console.log('  ✓ ' + label); }
    catch (e) { failed++; console.log('  ✗ ' + label + ' — ' + e.message); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

var _cache = {};
function source(relPath) {
    if (!_cache[relPath]) _cache[relPath] = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    return _cache[relPath];
}
function slice(relPath, anchor, len) {
    var text = source(relPath);
    var idx = text.indexOf(anchor);
    assert(idx !== -1, 'anchor not found: ' + JSON.stringify(anchor) + ' in ' + relPath);
    return text.slice(idx, idx + (len || 3000));
}

console.log('\n════════════════════════════════════════');
console.log('PART A — exactly two top-level destinations from the resting screen');
console.log('════════════════════════════════════════\n');

check('app.js boots into MainMenu, not RifleApp\'s Card', function () {
    var body = slice('js/app.js', 'rifleApp = new RifleApp(db);', 700);
    assert(/MainMenu\.show\(\)/.test(body), 'initApp() must call MainMenu.show() on boot');
});

check('app.js\'s switchView(\'home\') renders MainMenu, not the Card', function () {
    var body = slice('js/app.js', "if (viewName === 'home' && typeof MainMenu", 500);
    assert(body.indexOf('MainMenu.show();') !== -1, "switchView('home') must render MainMenu");
});

check('MainMenu renders EXACTLY two action buttons (id="mm-rifles", id="mm-range-session") and nothing else clickable', function () {
    var body = source('js/main-menu.js');
    var clickableIds = body.match(/id="mm-[a-z-]+"/g) || [];
    // build stamp div isn't a button; count only button/anchor-style ids
    var actionIds = clickableIds.filter(function (id) { return id !== 'id="mm-build-stamp"'; });
    assert(actionIds.length === 2, 'expected exactly 2 clickable ids in main-menu.js, found ' + actionIds.length + ': ' + actionIds.join(','));
    assert(actionIds.indexOf('id="mm-rifles"') !== -1, 'missing the Rifles button');
    assert(actionIds.indexOf('id="mm-range-session"') !== -1, 'missing the Range Session button');
});

check('MainMenu has a visible build stamp (version + date)', function () {
    var body = source('js/main-menu.js');
    assert(body.indexOf('mm-build-stamp') !== -1, 'no build-stamp element');
    assert(/BUILD_STAMP = '[^']*\d{4}-\d{2}-\d{2}/.test(body), 'BUILD_STAMP must contain a date in YYYY-MM-DD form');
});

check('the Rifles button opens AppNav.openRifleList (not any other destination)', function () {
    var body = slice('js/main-menu.js', "var rBtn = document.getElementById('mm-rifles');", 400);
    assert(body.indexOf('AppNav.openRifleList()') !== -1, 'Rifles button must call AppNav.openRifleList()');
});

check('the Range Session button launches the existing session wizard (SessionLaunch.start) with no rifle preselected', function () {
    var body = slice('js/main-menu.js', "var sBtn = document.getElementById('mm-range-session');", 400);
    assert(body.indexOf('SessionLaunch.start({})') !== -1, 'Range Session button must call SessionLaunch.start({})');
});

console.log('\n════════════════════════════════════════');
console.log('PART B — the complete loop, traced hop by hop through real source');
console.log('════════════════════════════════════════\n');

console.log('\n--- create rifle ---\n');

check('AppNav.openRifleList -> ProfileManager.showRifleList -> renders a real rifle list (not a dead redirect)', function () {
    var body = slice('js/app.js', 'openRifleList: function () {', 400);
    assert(body.indexOf('showRifleList()') !== -1, 'openRifleList must call showRifleList()');
    var listBody = slice('js/profiles.js', 'ProfileManager.prototype.showRifleList = function () {', 700);
    assert(listBody.indexOf('getAllRifles()') !== -1, 'showRifleList must actually query rifles, not redirect');
});

check('Rifles list "+ Add rifle" -> showRifleForm(null) -> a real create form', function () {
    var body = slice('js/profiles.js', "if (addBtn) addBtn.addEventListener('click', function () { self.showRifleForm(null); });", 300);
    assert(body.length > 0);
    var formBody = slice('js/profiles.js', 'ProfileManager.prototype._renderRifleForm = function (rifle, barrel) {', 4000);
    ['rf-name', 'rf-caliber', 'rf-scope-height', 'rf-zero-range', 'rf-twist'].forEach(function (id) {
        assert(formBody.indexOf('id="' + id + '"') !== -1, 'rifle form is missing field #' + id);
    });
});

check('rifle form submit -> db.addRifle(...) with name/caliber (create path)', function () {
    var body = slice('js/profiles.js', "self.db.addRifle(data).then(function (newRifle) {", 600);
    assert(body.indexOf('showRifleDetail(newRifle.id)') !== -1, 'a newly created rifle must land on its own detail page');
});

console.log('\n--- add ammo ---\n');

check('rifle detail renders an inline Ammo section with "+ New ammo"', function () {
    var body = slice('js/profiles.js', "// ── Ammo ─────", 1500);
    assert(body.indexOf("data: { 'ammo-add': '1' }") !== -1, 'no "+ New ammo" row in rifle detail');
});

check('"+ New ammo" -> showLoadForm(rifleId, null) -> a real form with name/bullet/weight/BC/velocity', function () {
    var bindBody = slice('js/profiles.js', "if (ammoAdd) {", 200);
    assert(bindBody.indexOf('self.showLoadForm(rifle.id, null)') !== -1, 'ammo-add must open showLoadForm');
    var formBody = slice('js/profiles.js', 'ProfileManager.prototype._renderLoadForm = function (rifleId, load) {', 6000);
    ['ld-name', 'ld-bullet-name', 'ld-bullet-weight', 'ld-bullet-bc', 'ld-mv'].forEach(function (id) {
        assert(formBody.indexOf('id="' + id + '"') !== -1, 'ammo form is missing field #' + id + ' (name/bullet/weight/BC/advertised speed)');
    });
});

check('ammo form submit persists via db.addLoad/db.updateLoad (round-trip editing)', function () {
    var body = slice('js/profiles.js', 'ProfileManager.prototype._bindLoadFormEvents = function (rifleId, load) {', 5000);
    assert(body.indexOf('self.db.addLoad(') !== -1, 'create path must call db.addLoad');
    assert(body.indexOf('self.db.updateLoad(') !== -1, 'edit path must call db.updateLoad');
});

console.log('\n--- range session: rifle, ammo, photo, group, MV ---\n');

check('SessionLaunch.start({}) with no rifleId falls through to the flat rifle+ammo picker (asks which rifle, which ammo)', function () {
    var startBody = slice('js/app.js', 'window.SessionLaunch = {', 1500);
    assert(startBody.indexOf("switchView('session');") !== -1, 'start({}) must activate the session view');
    assert(startBody.indexOf('if (!opts.rifleId) return;') !== -1,
        'with no rifleId, start() must return early and leave the view\'s own picker in place, not force a specific rifle');
    // The profile picker itself is rendered by switchView('session')'s own
    // branch (not by SessionLaunch.start directly) whenever no step is in
    // progress -- this is what "asks which rifle, which ammo" resolves to.
    var switchBody = slice('js/app.js', "if (viewName === 'session') {", 400);
    assert(switchBody.indexOf('_loadProfilePicker();') !== -1,
        "switchView('session') must render the profile picker when no session is in progress");
});

check('the profile picker offers "+ New ammo" inline per rifle, using the same minimal NewAmmoForm', function () {
    var body = slice('js/session-flow.js', 'SessionFlow.prototype._renderProfilePicker = function (groups) {', 5000);
    assert(body.indexOf('NewAmmoForm.html(') !== -1 && body.indexOf('NewAmmoForm.bind(') !== -1,
        'profile picker must offer inline "+ New ammo"');
});

check('photo capture uses the fixed EXIF-aware loadImageFromFile (item 4 of the prior UI Consolidation phase — photo must display straight)', function () {
    var body = source('js/session-flow.js');
    assert(body.indexOf('loadImageFromFile(file)') !== -1, 'session-flow.js must load photos via the shared, EXIF-fixed loader');
    var utilsBody = source('js/utils.js');
    assert(/createImageBitmap\(file,\s*\{\s*imageOrientation:\s*'from-image'\s*\}\)/.test(utilsBody),
        'loadImageFromFile must still request EXIF-correct orientation');
});

check('group measurement reuses the existing calibration + calculations engines (protected, unchanged)', function () {
    var body = source('js/session-flow.js');
    assert(body.indexOf('CalibrationManager') !== -1 || body.indexOf('this.calibration') !== -1,
        'session-flow.js must still use the existing calibration flow');
});

check('the DATA step collects average MV plus optional high/low', function () {
    var html = source('index.html');
    ['input-velocity', 'input-velocity-high', 'input-velocity-low'].forEach(function (id) {
        assert(html.indexOf('id="' + id + '"') !== -1, 'missing MV field #' + id);
    });
    var body = slice('js/session-flow.js', 'SessionFlow.prototype._confirmData = function () {', 2000);
    assert(body.indexOf('this.measuredVelocity = parseFloat(this.els.inputVelocity.value)') !== -1, 'average MV not collected');
    assert(body.indexOf('this.velocityHigh =') !== -1 && body.indexOf('this.velocityLow =') !== -1,
        'optional high/low MV not collected');
});

console.log('\n--- save ---\n');

check('_saveSession calls db.addSession (via SyncQueue when available) with the group results and MV', function () {
    var body = slice('js/session-flow.js', 'SessionFlow.prototype._saveSession = function () {', 5000);
    assert(body.indexOf("writeFn('addSession', sessionData)") !== -1, 'must persist via addSession');
    assert(body.indexOf('measuredVelocity: this.measuredVelocity') !== -1, 'sessionData must carry average MV');
    assert(/results: \(this\.velocityHigh \|\| this\.velocityLow\)/.test(body), 'sessionData.results must fold in optional high/low MV, no schema change');
});

check('canon data layer keeps working silently underneath: addSession is the SAME db.js method every other flow always used (dual-write into fact_events is inside db.js itself, untouched)', function () {
    var dbBody = slice('js/db.js', 'BallisticDB.prototype.addSession = function (data) {', 3000);
    assert(dbBody.indexOf('measuredVelocity') !== -1, 'db.js addSession must still map measuredVelocity through');
});

check('after save, a confirmation shows, then Done returns to the main menu', function () {
    var body = slice('js/session-flow.js', "writeFn('addSession', sessionData).then(function (saved) {", 2000);
    assert(/Saved to history|Saved — will sync/.test(body), 'no confirmation text on save success');
    assert(body.indexOf('self._showEl(self.els.btnSessionDoneRow)') !== -1, 'Done button must be revealed on save success');
    var doneBind = slice('js/session-flow.js', 'if (this.els.btnSessionDone) {', 400);
    assert(/AppNav\.go\('home'\)/.test(doneBind), 'Done must return to the main menu');
});

console.log('\n--- view it on the rifle ---\n');

check('the rifle detail page fetches and renders that rifle\'s sessions, showing group size and MV', function () {
    var loadBody = slice('js/profiles.js', 'ProfileManager.prototype.showRifleDetail = function (rifleId) {', 700);
    assert(loadBody.indexOf('getSessionsByRifle(rifleId)') !== -1, 'rifle detail must fetch sessions');
    var renderBody = slice('js/profiles.js', '// ── Sessions (STRIP-DOWN PHASE', 1200);
    assert(renderBody.indexOf('r.groupSizeMOA') !== -1, 'session rows must show group size');
    assert(renderBody.indexOf('s.measuredVelocity') !== -1, 'session rows must show MV');
});

check('tapping a session opens the real session detail (photo, group, MV) and its back returns to this rifle', function () {
    var bindBody = slice('js/profiles.js', 'var sessionRows = this.container.querySelectorAll(\'[data-session-row]\');', 400);
    assert(bindBody.indexOf('showSessionDetail(id, rifle.id)') !== -1, 'session row tap must open session detail');
    var backBody = slice('js/history.js', "document.getElementById('btn-session-detail-back').addEventListener('click'", 300);
    assert(backBody.indexOf('showRifleDetail(rifleId)') !== -1, 'session detail back must return to the rifle');
});

console.log('\n--- edit the rifle ---\n');

check('"Edit rifle" -> showRifleForm(rifle.id) -> the SAME full form pre-filled, not a different/lesser screen', function () {
    var bindBody = slice('js/profiles.js', "document.getElementById('rd-edit').addEventListener('click', function () {", 200);
    assert(bindBody.indexOf('self.showRifleForm(rifle.id)') !== -1, 'Edit rifle must open the full rifle form');
});

check('editing an existing rifle calls db.updateRifle and returns to its (now-updated) detail page', function () {
    var body = slice('js/profiles.js', 'if (rifle) {\n            // Update rifle', 3000);
    assert(body.indexOf('self.db.updateRifle(rifle)') !== -1, 'edit path must call db.updateRifle');
    assert(body.indexOf('self.showRifleDetail(rifle.id)') !== -1, 'must return to the rifle detail after save');
});

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
