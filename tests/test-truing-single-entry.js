/**
 * test-truing-single-entry.js — UI Consolidation phase, follow-up to
 * item (5)'s surface sweep. rifle-payoff.js's inline "add more shots"
 * flow is the canonical, primary detailed-truing UI (no separate door
 * for the Simple lane). js/truing.js's standalone TruingJob survives
 * as ONE deliberately sanctioned exception: the deep escape hatch
 * reached via steel card -> "advanced" -> steel-session.js's full
 * logger -> a truing continuation, for multi-string/multi-distance
 * work the inline flow can't do (owner-confirmed; see
 * UICONSOLIDATION-REPORT.md's "detailed truing" note).
 *
 * This test proves that exception stays singular: exactly one FILE
 * calls ToolActions.truing() with real arguments (steel-session.js),
 * and the three "forced primary door" paths found and removed this
 * pass (Categories' own truing tool/category, HomeManager's dead
 * coach-dispatch case, device-export.js's dead Categories fallbacks)
 * stay gone. A future change that adds a new live call site anywhere
 * else should fail this test and force an explicit decision, not
 * silently reopen a second destination.
 *
 * Run: node tests/test-truing-single-entry.js
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var passed = 0;
var failed = 0;
function check(label, actual, expected) {
    var ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

var JS_DIR = path.join(ROOT, 'js');
var jsFiles = fs.readdirSync(JS_DIR).filter(function (f) { return f.endsWith('.js'); });

// A real call always passes arguments (ToolActions.truing(_db, ...)) —
// require at least one identifier character after the open paren so a
// comment that merely MENTIONS "ToolActions.truing()" (empty parens,
// prose) can never be mistaken for a genuine call site.
var REAL_CALL = /ToolActions\.truing\(\s*[A-Za-z_]/;

var callers = [];
jsFiles.forEach(function (f) {
    if (f === 'truing.js') return; // the definition itself, not a caller
    var body = fs.readFileSync(path.join(JS_DIR, f), 'utf8');
    var count = (body.match(new RegExp(REAL_CALL.source, 'g')) || []).length;
    if (count > 0) callers.push({ file: f, count: count });
});

console.log('\n--- Exactly one file calls ToolActions.truing() with real arguments ---\n');

check('caller file list', callers.map(function (c) { return c.file; }), ['steel-session.js']);
check('steel-session.js calls it exactly twice (both inside its own sanctioned escape hatch, per the file itself)',
    callers.length === 1 ? callers[0].count : -1, 2);

console.log('\n--- The three forced-primary-door paths removed this pass stay removed ---\n');

check('categories.js no longer defines a standalone "truing" job category', function () {
    var body = fs.readFileSync(path.join(JS_DIR, 'categories.js'), 'utf8');
    return /\n\s*truing:\s*\{/.test(body);
}(), false);

check('categories.js\'s "ballistics" category no longer has a "true-rifle" utility tool', function () {
    var body = fs.readFileSync(path.join(JS_DIR, 'categories.js'), 'utf8');
    return body.indexOf("id: 'true-rifle'") !== -1;
}(), false);

check('categories.js\'s KEYS array no longer lists \'truing\' (nothing else references DEFS.truing)', function () {
    var body = fs.readFileSync(path.join(JS_DIR, 'categories.js'), 'utf8');
    var m = body.match(/var KEYS = \[([^\]]*)\];/);
    return m ? m[1].indexOf("'truing'") !== -1 : null;
}(), false);

check('home.js\'s coach-dispatch switch no longer has a \'truing\' case', function () {
    var body = fs.readFileSync(path.join(JS_DIR, 'home.js'), 'utf8');
    return /case 'truing':/.test(body);
}(), false);

check('device-export.js no longer falls back to Categories.show(...) anywhere (in actual code, not just explanatory comments)', function () {
    var lines = fs.readFileSync(path.join(JS_DIR, 'device-export.js'), 'utf8').split('\n');
    return lines.some(function (line) {
        var t = line.trim();
        if (t.indexOf('//') === 0 || t.indexOf('*') === 0) return false; // comment line
        return t.indexOf('Categories.show(') !== -1;
    });
}(), false);

console.log('\n--- What must NOT have been touched (the live, independent history-chip feature) ---\n');

check('categories.js\'s HISTORY_CHIPS still lists \'truing\' — a genuinely live, independent feature (rifle-simple.js -> showHistory), unrelated to the dead navigation door removed above', function () {
    var body = fs.readFileSync(path.join(JS_DIR, 'categories.js'), 'utf8');
    return /HISTORY_CHIPS = \[[\s\S]{0,200}?key: 'truing'/.test(body);
}(), true);

check('categories.js\'s _uhTruing (history rendering for the truing chip) is still defined', function () {
    var body = fs.readFileSync(path.join(JS_DIR, 'categories.js'), 'utf8');
    return body.indexOf('function _uhTruing(') !== -1;
}(), true);

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
