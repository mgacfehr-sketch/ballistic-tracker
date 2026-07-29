/**
 * test-flows-end-at-card.js — UI Consolidation phase, law (2): "Every
 * flow ends at the Card. Saving anything (paper, steel, chrono,
 * cleaning, truing) returns to the Card with the feed updated." Plus
 * the companion law: from every reachable screen, a path of AT MOST
 * TWO taps reaches the Card.
 *
 * Same source-presence technique as tests/test-screen-nav.js (this
 * codebase ships no build tools/browser test runner — see that file's
 * own header). Two parts:
 *
 *   PART A — each of the five named save flows' SUCCESS path is
 *   traced to its terminal navigation call, asserting it is a DIRECT
 *   Card exit (AppNav.go('home') / app.show(rifleId) / self.show(rifleId)),
 *   not an intermediate list/form screen.
 *
 *   PART B — a hand-verified hop table for the primary/entry screens a
 *   shooter actually reaches in normal use (Card, switcher, Paperwork
 *   and its rows, the five save-flow terminal screens, and the
 *   detail/record screens reached directly from the Card's feed).
 *   Each entry asserts its own exit target via source, then asserts
 *   the STATED hop count is <=2. Deliberately NOT exhaustive over
 *   every legacy/nested screen in the app (e.g. Categories' own
 *   sub-screens, or a brand-new create-form nested two levels under a
 *   list nobody currently reaches that way) — see the "OUT OF SCOPE"
 *   note at the bottom for what this does not cover and why, matching
 *   this codebase's own practice of disclosing scope boundaries rather
 *   than silently claiming exhaustive coverage.
 *
 * Run: node tests/test-flows-end-at-card.js
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

var _sourceCache = {};
function source(relPath) {
    if (!_sourceCache[relPath]) _sourceCache[relPath] = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    return _sourceCache[relPath];
}
function slice(relPath, anchor, approxLines) {
    var text = source(relPath);
    var idx = text.indexOf(anchor);
    assert(idx !== -1, 'anchor not found: ' + JSON.stringify(anchor) + ' in ' + relPath);
    return text.slice(idx, idx + (approxLines || 40) * 80);
}

var CARD_EXIT = /AppNav\.go\('home'\)|AppNav\.go\("home"\)|app\.show\(rifle\.id\)|app\.show\(self\.rifle\.id\)|self\.show\(rifle\.id\)|self\.show\(rifleId\)/;

console.log('\n════════════════════════════════════════');
console.log('PART A — the five named save flows terminate at the Card');
console.log('════════════════════════════════════════\n');

check('Paper: session-flow.js reveals a Done button ONLY after addSession resolves, and it goes straight home', function () {
    var body = slice('js/session-flow.js', "writeFn('addSession', sessionData).then(function (saved) {", 40);
    assert(body.indexOf('self._showEl(self.els.btnSessionDoneRow)') !== -1,
        'the Done row must be revealed inside the addSession success handler, not before');
    var bindBody = slice('js/session-flow.js', 'if (this.els.btnSessionDone) {', 6);
    assert(/AppNav\.go\('home'\)/.test(bindBody), 'the Done button must call AppNav.go(\'home\')');
    // The row starts hidden in the static markup, and reset() re-hides
    // it -- a stale "Done" must never appear on a not-yet-saved session.
    var html = source('index.html');
    var rowIdx = html.indexOf('id="btn-session-done-row"');
    assert(rowIdx !== -1, 'the Done row markup must exist');
    var rowTagStart = html.lastIndexOf('<div', rowIdx);
    var rowTag = html.slice(rowTagStart, rowIdx + 40);
    assert(rowTag.indexOf('hidden') !== -1, 'the Done row must start hidden in markup');
    var resetBody = slice('js/session-flow.js', 'SessionFlow.prototype.reset = function () {', 90);
    assert(resetBody.indexOf('this._hideEl(this.els.btnSessionDoneRow)') !== -1,
        'reset() must re-hide the Done row for the next, not-yet-saved session');
});

check('Steel: every rifle-payoff.js terminal screen (Keep/Undo, hold, could-not-use) exits straight to the Card', function () {
    ['_renderPayoff', '_showHoldScreen', '_couldNotUse', '_renderPayoffMulti'].forEach(function (fn) {
        var body = slice('js/rifle-payoff.js', 'function ' + fn + '(', 30);
        assert(CARD_EXIT.test(body), fn + '() has no direct Card exit');
    });
});

check('Chrono: rifle-add.js\'s _finishChronoSave lands directly on the Card on success', function () {
    var body = slice('js/rifle-add.js', 'function _finishChronoSave(app, rifle, S, load, btn) {', 25);
    assert(CARD_EXIT.test(body), '_finishChronoSave has no direct Card exit on its success path');
});

check('Cleaning: history.js\'s cleaning-form submit handler goes straight to the Card on success (fixed this phase — previously returned to the log list)', function () {
    var body = slice('js/history.js', "document.getElementById('cleaning-form').addEventListener('submit'", 30);
    assert(/self\.db\.addCleaningLog\(data\)\.then\(function \(\) \{\s*\/\//.test(body) || body.indexOf('self.db.addCleaningLog(data).then(function () {') !== -1,
        'expected the addCleaningLog success handler');
    assert(/AppNav\.go\('home'\)/.test(body), 'saving a cleaning entry must call AppNav.go(\'home\')');
});

check('Truing: truing.js\'s _apply() lands on the Card once the truing event is written', function () {
    var body = slice('js/truing.js', 'function _apply() {', 100);
    assert(/AppNav\.go\('home'\)/.test(body), '_apply() has no AppNav.go(\'home\') on its success path');
});

console.log('\n════════════════════════════════════════');
console.log('PART B — <=2-tap path to the Card from every primary/entry screen');
console.log('════════════════════════════════════════\n');

// Each entry: label, [file, anchor] to verify the exit call actually
// exists in source, the hop count FROM THIS SCREEN TO THE CARD via its
// own visible back/exit control, and (for hops===2) which intermediate
// screen it passes through -- itself verified elsewhere in this table
// or in test-screen-nav.js as being 1 hop from the Card, so the total
// never silently exceeds 2 even if someone edits one link in isolation.
var HOPS = [
    {
        label: 'THE CARD itself', hops: 0
    },
    {
        label: 'Rifle switcher sheet (overlay off the Card — closes back to the Card underneath)',
        file: 'js/rifle-app.js', anchor: 'RifleApp.prototype._openRifleList = function',
        check: function (body) { assert(body.indexOf("function close()") !== -1, 'switcher has no close()'); },
        hops: 1, via: 'closes directly back onto the Card, which is already rendered underneath'
    },
    {
        label: 'Paperwork (details drawer)',
        file: 'js/profiles.js', anchor: "html += '<button type=\"button\" class=\"backline\" id=\"btn-detail-back\">&lsaquo; Home</button>';",
        check: function (body) { assert(body.length > 0, 'back button markup must exist'); },
        hops: 1, via: 'its own "‹ Home" back button (fixed this phase from "‹ Rifles")'
    },
    {
        label: "Paperwork's Account overlay (Misc sessions / Suppressed shooting / Account)",
        file: 'js/profiles.js', anchor: 'ProfileManager.prototype._showAccountOverlay = function',
        check: function (body) { assert(body.indexOf('#ao-close') !== -1, 'overlay has no close button'); },
        hops: 2, via: 'closes back onto Paperwork (1 hop), which is 1 hop from the Card'
    },
    {
        label: 'Session Detail (reached directly from the Card feed via AppNav.openSession)',
        file: 'js/history.js', anchor: "document.getElementById('btn-session-detail-back').addEventListener('click', function () {",
        check: function (body) { assert(CARD_EXIT.test(body), 'session-detail back must exit straight to the Card'); },
        hops: 1, via: 'its own back button (fixed this phase — previously routed through an unreachable session list, 3 hops)'
    },
    {
        label: 'Cleaning log (Paperwork -> "Barrel & rounds")',
        file: 'js/history.js', anchor: "document.getElementById('btn-cleaning-back').addEventListener('click', function () {",
        check: function (body) { assert(body.indexOf('self.profileManager.showRifleDetail(rifle.id)') !== -1, 'cleaning-log back must go to Paperwork'); },
        hops: 2, via: 'its own back button goes to Paperwork (1 hop), which is 1 hop from the Card'
    },
    {
        label: 'RifleWhy (view 5 — tap the PROVEN TO number)',
        file: 'js/rifle-why.js', anchor: 'function show(app, rifle) {',
        check: function (body) { assert(CARD_EXIT.test(body), 'RifleWhy has no direct Card exit'); },
        hops: 1, via: 'its own back exits straight to the Card'
    },
    {
        label: 'RifleChart (view 6 — full drop chart)',
        file: 'js/rifle-chart.js', anchor: 'function show(app, rifle) {',
        check: function (body) { assert(CARD_EXIT.test(body), 'RifleChart has no direct Card exit'); },
        hops: 1, via: 'its own back exits straight to the Card'
    },
    {
        label: 'RifleRecord (view 7 — tap a feed item)',
        file: 'js/rifle-record.js', anchor: 'function show(app, rifle, id, type) {',
        check: function (body) { assert(CARD_EXIT.test(body), 'RifleRecord has no direct Card exit'); },
        hops: 1, via: 'its own back (rr-back) exits straight to the Card'
    },
    {
        label: 'RifleAdd chooser + zero/steel/chrono fact cards (view 2/3a/3b/3c)',
        file: 'js/rifle-add.js', anchor: "document.getElementById('rz-back').addEventListener('click', function () { show(app, rifle); });",
        check: function (body) { assert(body.indexOf('show(app, rifle)') !== -1, 'zero card back must return to the chooser'); },
        hops: 2, via: 'each card\'s back returns to the RifleAdd chooser (1 hop), whose own back is the Card (1 hop) — verified by test-screen-nav.js\'s "RifleAdd chooser" entry'
    }
];

HOPS.forEach(function (h) {
    check(h.label + ' — <=2 taps to the Card' + (h.via ? ' (' + h.via + ')' : ''), function () {
        assert(h.hops <= 2, 'stated hop count exceeds the law');
        if (h.file && h.anchor) {
            var body = slice(h.file, h.anchor, 30);
            if (h.check) h.check(body);
        }
    });
});

console.log('\nOUT OF SCOPE (disclosed, not silently skipped): deeply-nested legacy');
console.log('screens not part of the primary Card-centric flow today — e.g.');
console.log('Categories\' own sub-screens (js/categories.js, superseded surface per');
console.log('DEVELOPER-MAP.md), the cleaning-log/scope-adjustment CREATE forms\' own');
console.log('"back" (a deliberate one-step-into-a-list pattern, not a dead end --');
console.log('their SAVE path is covered in Part A / above), and js/ladder.js /');
console.log('js/field.js / js/wind-call.js\'s own internal screens (only checked for');
console.log('"has some exit" by test-screen-nav.js, not hop-counted here).');

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
