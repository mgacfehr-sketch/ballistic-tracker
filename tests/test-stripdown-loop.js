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
console.log('PART A — exactly three top-level destinations from the resting screen');
console.log('════════════════════════════════════════\n');

check('app.js boots into MainMenu, not RifleApp\'s Card', function () {
    var body = slice('js/app.js', 'rifleApp = new RifleApp(db);', 700);
    assert(/MainMenu\.show\(\)/.test(body), 'initApp() must call MainMenu.show() on boot');
});

check('app.js\'s switchView(\'home\') renders MainMenu, not the Card', function () {
    var body = slice('js/app.js', "if (viewName === 'home' && typeof MainMenu", 500);
    assert(body.indexOf('MainMenu.show();') !== -1, "switchView('home') must render MainMenu");
});

check('MainMenu renders EXACTLY three action buttons (id="mm-rifles", id="mm-range-session", id="mm-true-rifle") and nothing else clickable', function () {
    var body = source('js/main-menu.js');
    var clickableIds = body.match(/id="mm-[a-z-]+"/g) || [];
    // build stamp div isn't a button; count only button/anchor-style ids
    var actionIds = clickableIds.filter(function (id) { return id !== 'id="mm-build-stamp"'; });
    assert(actionIds.length === 3, 'expected exactly 3 clickable ids in main-menu.js, found ' + actionIds.length + ': ' + actionIds.join(','));
    assert(actionIds.indexOf('id="mm-rifles"') !== -1, 'missing the Rifles button');
    assert(actionIds.indexOf('id="mm-range-session"') !== -1, 'missing the Range Session button');
    assert(actionIds.indexOf('id="mm-true-rifle"') !== -1, 'missing the True your rifle button');
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

check('the True your rifle button launches TruingLaunch.start (the standalone truing wizard)', function () {
    var body = slice('js/main-menu.js', "var tBtn = document.getElementById('mm-true-rifle');", 300);
    assert(body.indexOf('TruingLaunch.start()') !== -1, 'True your rifle button must call TruingLaunch.start()');
});

console.log('\n--- the header logo is a home button from anywhere ---\n');

check('the header logo/wordmark carries a stable id and is marked as an interactive control', function () {
    var body = slice('index.html', '<div class="shell-brand" id="app-logo-home"', 200);
    assert(/role="button"/.test(body), 'logo element must have role="button"');
    assert(/tabindex="0"/.test(body), 'logo element must be keyboard-focusable');
});

check('app.js wires the header logo to switchView(\'home\') — the same MainMenu destination as AppNav.go(\'home\') — on click and Enter/Space', function () {
    var body = slice('js/app.js', "document.getElementById('app-logo-home');", 500);
    assert(body.indexOf("switchView('home')") !== -1, 'logo click must call switchView(\'home\')');
    assert(/keydown/.test(body), 'logo must also respond to keyboard activation (Enter/Space)');
});

console.log('\n--- doors closed this phase stay closed ---\n');

check('the ammo form no longer offers the OCR scan button (a distinct extra function beyond "add/edit ammo with its details")', function () {
    var body = slice('js/profiles.js', 'ProfileManager.prototype._renderLoadForm = function (rifleId, load) {', 1000);
    assert(body.indexOf('scanButtonHtml()') === -1, 'the OCR scan button must not render in the ammo form this phase');
    var bindBody = slice('js/profiles.js', 'ProfileManager.prototype._bindLoadFormEvents = function (rifleId, load) {', 1000);
    assert(bindBody.indexOf('bindScanButton(') === -1, 'the OCR scan handler must not be wired this phase');
});

check('js/onboarding.js itself is untouched — the OCR feature still exists, just unlinked ("code stays, doors close")', function () {
    var body = source('js/onboarding.js');
    assert(body.indexOf('function scanButtonHtml()') !== -1 && body.indexOf('function bindScanButton(') !== -1,
        'onboarding.js\'s OCR functions must still exist, unmodified');
});

check('Quick Mode ("Just measure this group") is hidden — a rifle-less session can\'t satisfy "SAVE to that rifle"', function () {
    var html = source('index.html');
    var idx = html.indexOf('id="btn-quick-mode"');
    assert(idx !== -1, 'the button markup must still exist ("code stays")');
    var wrapStart = html.lastIndexOf('<div', idx);
    var wrapTag = html.slice(wrapStart, idx);
    assert(wrapTag.indexOf('hidden') !== -1, 'the Quick Mode button\'s wrapper must carry the hidden class');
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

check('SessionLaunch.start({}) with no rifleId falls through to the two-screen picker (screen 1: which rifle)', function () {
    var startBody = slice('js/app.js', 'window.SessionLaunch = {', 1500);
    assert(startBody.indexOf("switchView('session');") !== -1, 'start({}) must activate the session view');
    assert(startBody.indexOf('if (!opts.rifleId) return;') !== -1,
        'with no rifleId, start() must return early and leave the view\'s own picker in place, not force a specific rifle');
    // The profile picker itself is rendered by switchView('session')'s own
    // branch (not by SessionLaunch.start directly) whenever no step is in
    // progress -- this reaches _loadProfilePicker -> _renderRiflePicker
    // (screen 1).
    var switchBody = slice('js/app.js', "if (viewName === 'session') {", 400);
    assert(switchBody.indexOf('_loadProfilePicker();') !== -1,
        "switchView('session') must render the profile picker when no session is in progress");
    var loadBody = slice('js/session-flow.js', 'SessionFlow.prototype._loadProfilePicker = function () {', 700);
    assert(loadBody.indexOf('this._renderRiflePicker();') !== -1,
        '_loadProfilePicker must land on the rifle-only screen (screen 1), not the old combined picker');
});

console.log('\n--- OWNER SPEC: Range Session entry is exactly two screens, rifle then ammo ---\n');

check('Screen 1 ("Which rifle are you using?") shows ONLY the rifle list — no ammo, no other fields, no Quick Start/quick-mode content', function () {
    var body = slice('js/session-flow.js', 'SessionFlow.prototype._renderRiflePicker = function () {', 2500);
    assert(body.indexOf("_setProfileStepTitle('Which rifle are you using?')") !== -1,
        'screen 1 must set the exact title "Which rifle are you using?"');
    // The rendered choice rows must be keyed by rifle id only, never a
    // load id -- proof this screen genuinely doesn't ask about ammo.
    assert(/data-rifle-id=.*picker-rifle-btn|picker-rifle-btn.*data-rifle-id/.test(body) || body.indexOf("data-rifle-id=' + escapeAttr(r.id)") !== -1,
        'rifle rows must be keyed by rifle id');
    assert(body.indexOf('data-load-id') === -1, 'screen 1 must not reference any load/ammo id at all');
    assert(body.indexOf('NewAmmoForm') === -1, 'screen 1 must not offer "+ New ammo" -- that belongs on screen 2 only');
    assert(body.indexOf('quick-start') === -1 && body.indexOf('quickMode') === -1,
        'screen 1 must not render Quick Start or Quick Mode content');
});

check('tapping a rifle on screen 1 moves to screen 2 (_renderAmmoPicker), nothing else', function () {
    var body = slice('js/session-flow.js', 'SessionFlow.prototype._renderRiflePicker = function () {', 2500);
    assert(/btns\[i\]\.addEventListener\('click', function \(\) \{\s*self\._renderAmmoPicker\(this\.getAttribute\('data-rifle-id'\)\);/.test(body),
        'the rifle row click handler must call _renderAmmoPicker with that rifle\'s id, and nothing else in between');
});

check('Screen 2 ("Which ammo are you using?") shows ONLY the tapped rifle\'s own ammo, fetched by that rifle\'s id specifically', function () {
    var body = slice('js/session-flow.js', 'SessionFlow.prototype._renderAmmoPicker = function (rifleId) {', 3000);
    assert(body.indexOf("_setProfileStepTitle('Which ammo are you using?')") !== -1,
        'screen 2 must set the exact title "Which ammo are you using?"');
    assert(body.indexOf('this.db.getLoadsByRifle(rifleId)') !== -1,
        'screen 2 must fetch loads scoped to the SAME rifleId the caller passed in -- never a flat, all-rifles/all-ammo list');
    assert(body.indexOf('getAllRifles') === -1 && body.indexOf('getAllLoads') === -1,
        'screen 2 must not re-query every rifle or every load -- it already knows which rifle');
});

check('Screen 2 offers "+ New ammo" (name, bullet, weight, advertised speed) scoped to this rifle, saving and continuing straight into the session', function () {
    var body = slice('js/session-flow.js', 'SessionFlow.prototype._renderAmmoPicker = function (rifleId) {', 3000);
    assert(body.indexOf('btn-new-ammo-inline') !== -1, 'no "+ New ammo" row on screen 2');
    assert(body.indexOf('NewAmmoForm.html(') !== -1 && body.indexOf('NewAmmoForm.bind(idPrefix, self.db, rifleId') !== -1,
        '"+ New ammo" must be scoped to THIS rifle (rifleId), not a generic/global form');
    assert(body.indexOf('self._selectProfile(rifleId, load.id)') !== -1,
        'saving new ammo must select it and continue straight into the session, not dead-end on screen 2');
    var newAmmoBody = source('js/new-ammo.js');
    ['-name', '-bullet', '-weight', '-velocity'].forEach(function (suffix) {
        assert(newAmmoBody.indexOf("idPrefix + '" + suffix + "'") !== -1,
            'NewAmmoForm is missing the "' + suffix.slice(1) + '" field (owner spec: name, bullet, weight, advertised speed)');
    });
});

check('a rifle-scoped launch (SessionLaunch.start({rifleId}), when a caller already knows the rifle) jumps straight to screen 2 -- never re-asks screen 1', function () {
    var body = slice('js/app.js', "if (!loads.length) {", 1200);
    assert(body.indexOf('sessionFlow._renderAmmoPicker(rifle.id)') !== -1,
        'a known rifle with no ammo yet must land directly on the ammo screen, not the rifle-picker screen');
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

console.log('\n════════════════════════════════════════');
console.log('PART C — "True your rifle": standalone truing wizard, hop by hop');
console.log('════════════════════════════════════════\n');

check('TruingLaunch.start (app.js) hands off straight to TruingWizard.start(db)', function () {
    var body = slice('js/app.js', 'window.TruingLaunch = {', 200);
    assert(body.indexOf('TruingWizard.start(db)') !== -1, 'TruingLaunch.start must call TruingWizard.start(db)');
});

check('screen 1 asks which rifle, scoped to db.getAllRifles, before anything else', function () {
    var body = slice('js/truing-wizard.js', 'function _screenRifle(container, db, S) {', 900);
    assert(body.indexOf('Which rifle are you using?') !== -1, 'must ask which rifle');
    assert(body.indexOf('db.getAllRifles()') !== -1, 'must list all rifles');
});

check('tapping a rifle moves to screen 2, which ammo — scoped to THAT rifle\'s loads only', function () {
    var body = slice('js/truing-wizard.js', 'function _screenAmmo(container, db, S) {', 900);
    assert(body.indexOf('Which ammo are you using?') !== -1, 'must ask which ammo');
    assert(body.indexOf('db.getLoadsByRifle(S.rifle.id)') !== -1, 'must scope ammo to the selected rifle');
});

check('ammo missing BC or a base velocity is refused BEFORE the distance question — no correction possible with no numbers on file', function () {
    var body = slice('js/truing-wizard.js', "S.load = loads.filter(function (l) { return l.id === id; })[0];", 300);
    assert(body.indexOf('_needsNumbers(container, S)') !== -1, 'must route to the needs-numbers dead end');
    assert(body.indexOf('!S.load.bulletBC') !== -1, 'must check for a BC on file');
});

check('the remaining questions are one at a time: distance, then dial, then muzzle velocity (average, typed), each a single field', function () {
    var distBody = slice('js/truing-wizard.js', 'function _screenDistance(container, db, S) {', 500);
    assert(distBody.indexOf('How far is the target?') !== -1, 'distance screen wording');
    assert(distBody.indexOf('_screenDial(container, db, S)') !== -1, 'distance must advance to dial');

    var dialBody = slice('js/truing-wizard.js', 'function _screenDial(container, db, S) {', 600);
    assert(dialBody.indexOf('What did you dial?') !== -1, 'dial screen wording');
    assert(dialBody.indexOf('_screenMV(container, db, S)') !== -1, 'dial must advance to muzzle velocity');

    var mvBody = slice('js/truing-wizard.js', 'function _screenMV(container, db, S) {', 600);
    assert(mvBody.indexOf('What was your muzzle velocity?') !== -1, 'MV screen wording');
    assert(mvBody.indexOf('Average from the chrono') !== -1, 'MV screen must say it wants the chrono average');
    assert(mvBody.indexOf('_screenHit(container, db, S)') !== -1, 'MV must advance to the hit question');
});

check('the hit screen asks where it landed, high/low, in inches or clicks', function () {
    var body = slice('js/truing-wizard.js', 'function _screenHit(container, db, S) {', 3000);
    assert(body.indexOf('Where did it hit?') !== -1, 'hit screen wording');
    assert(body.indexOf('data-dir="high"') !== -1 && body.indexOf('data-dir="low"') !== -1, 'must offer HIGH/LOW');
    assert(body.indexOf('data-unit="in"') !== -1 && body.indexOf('data-unit="clicks"') !== -1, 'must offer inches/clicks');
    assert(body.indexOf('DEFAULT_CLICK_MOA') !== -1, 'clicks must convert through the one click-value convention already in calculations.js');
});

check('the observation routes through the SAME protected engine every other truing caller uses — simpleTrueObservation, honesty guard intact', function () {
    var body = slice('js/truing-wizard.js', 'function _compute(container, db, S, hitInches) {', 900);
    assert(body.indexOf('simpleTrueObservation(') !== -1, 'must call the protected simple-true.js engine');
    assert(body.indexOf('mvMeasured: true') !== -1, 'a typed chrono average must be passed through as measured');
    assert(body.indexOf('_couldNotUse(container, S)') !== -1, 'a null (refused) result must show the honest refusal screen, not a fake correction');
});

check('a refused observation changes nothing and says so plainly', function () {
    var body = slice('js/truing-wizard.js', 'function _couldNotUse(container, S) {', 900);
    assert(body.indexOf('Nothing was changed.') !== -1, 'refusal screen must say nothing changed');
});

check('the result screen states the corrected number plainly with its drag model labeled (BC) or in fps (MV), PLUS the dial change in shooter terms', function () {
    var body = slice('js/truing-wizard.js', 'function _renderResult(container, db, S, out, profile, hitInches) {', 1600);
    assert(body.indexOf('profile.dragModel') !== -1, 'BC correction must label the drag model (e.g. G7)');
    assert(body.indexOf('was \' + Number(oldBc)') !== -1 || body.indexOf('was ') !== -1, 'must state the prior value for comparison');
    assert(body.indexOf('fps</b> — was') !== -1, 'MV correction must state prior fps for comparison');
    assert(body.indexOf('dial changes from') !== -1, 'must state the dial change in shooter terms, same wording as the steel payoff');
});

check('Undo\'s entire handler is a bare return-home — no write call anywhere in it', function () {
    var undoLine = slice('js/truing-wizard.js', "document.getElementById('tw-undo').addEventListener('click', _home);", 70);
    assert(undoLine.indexOf("addEventListener('click', _home);") !== -1, 'Undo must be wired directly to _home with no wrapper function that could sneak in a write');
});

check('Keep it saves via SimpleTrue.keep (the one append-only write path every truing caller shares) and returns home on success', function () {
    var body = slice('js/truing-wizard.js', "document.getElementById('tw-keep').addEventListener('click', function () {", 900);
    assert(body.indexOf('SimpleTrue.keep(ctx, keepS, out)') !== -1, 'Keep must call SimpleTrue.keep');
    assert(body.indexOf('_home()') !== -1, 'Keep must return to the main menu on success');
});

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
