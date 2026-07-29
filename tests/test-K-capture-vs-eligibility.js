/**
 * test-K-capture-vs-eligibility.js — overnight run #2, item 2 ("Test-K
 * sweep"). Amendment 1 A2 / Constitution Anti-Pattern #94 ("All-or-
 * Nothing Validation"): capture validity and analytic eligibility are
 * different, and a save must never be withheld because a downstream
 * analysis can't (yet, or ever) use the observation.
 *
 * Covers all three fact cards (js/rifle-add.js's zero/steel/chrono
 * screens) plus detailed truing (js/rifle-payoff.js — "this IS
 * detailed truing now, no separate door," its own comment). Uses the
 * same source-presence technique as tests/test-failure-injection.js
 * (this codebase ships no build tools/browser test runner — see that
 * file's own header for why that technique is the established
 * precedent) plus pure-logic checks against validation-status.js's
 * real exported functions.
 *
 * Run: node tests/test-K-capture-vs-eligibility.js
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

console.log('\n════════════════════════════════════════');
console.log('Fact card 1/3 — Zero (js/rifle-add.js _zeroScreen)');
console.log('════════════════════════════════════════\n');

check('the Done handler calls addZeroEvent unconditionally — no analytic pre-check gates the write', function () {
    var body = slice('js/rifle-add.js', "document.getElementById('rz-done').addEventListener", 25);
    assert(body.indexOf("_write(app.db, 'addZeroEvent'") !== -1, 'addZeroEvent must be called directly off the Done tap');
    // no if/return standing between the tap handler opening and the write
    // beyond the async profile-lookup chain (Promise.all(...).then(...))
    var betweenTapAndWrite = body.slice(0, body.indexOf("_write(app.db, 'addZeroEvent'"));
    assert(!/if\s*\(.*(invalid|reject|ineligible)/i.test(betweenTapAndWrite),
        'no analytic-validity conditional should exist between the tap and the write');
});

check('a failed save re-enables the button and keeps the screen up — it never silently discards the entered group data', function () {
    var body = slice('js/rifle-add.js', "document.getElementById('rz-done').addEventListener", 30);
    assert(/\.catch\(function \(err\) \{\s*btn\.disabled = false;\s*alert\(/.test(body),
        'save failure must re-enable the button and alert, not vanish the data');
});

console.log('\n════════════════════════════════════════');
console.log('Fact card 2/3 — Steel (js/rifle-add.js _steelScreen)');
console.log('════════════════════════════════════════\n');

check('_finishSteelSave is documented as always-save, decoupled from the truing payoff precondition', function () {
    var body = slice('js/rifle-add.js', '/** Save always happens (STANDARDS §6.1', 6);
    assert(/Save always happens/.test(body), 'the always-save doctrine comment must be present verbatim');
});

check('_finishSteelSave calls addSteelString THEN addSteelShot unconditionally, before any BC/velocity eligibility check', function () {
    var body = slice('js/rifle-add.js', 'function _finishSteelSave(app, rifle, S, units, ctx, btn) {', 40);
    var stringIdx = body.indexOf("_write(app.db, 'addSteelString'");
    var shotIdx = body.indexOf("_write(app.db, 'addSteelShot'");
    var eligIdx = body.indexOf('ctx.load.bulletBC && (ctx.load.muzzleVelocity || ctx.load.truedMv)');
    assert(stringIdx !== -1 && shotIdx !== -1 && eligIdx !== -1, 'expected save calls and the eligibility branch to all be present');
    assert(stringIdx < shotIdx && shotIdx < eligIdx,
        'both saves must complete BEFORE the BC/velocity eligibility check that decides whether a correction can be computed');
});

check('when the load lacks BC/velocity, the string is still routed to a "Logged." screen, never a rejection', function () {
    var body = slice('js/rifle-add.js', 'function _finishSteelSave(app, rifle, S, units, ctx, btn) {', 45);
    assert(body.indexOf('_loggedNeedsNumbers(app, rifle, ctx.load)') !== -1,
        'the not-yet-analytically-eligible branch must still show the hit was logged, not an error');
});

check('_loggedNeedsNumbers is documented as "the save already happened... never a block"', function () {
    var body = slice('js/rifle-add.js', 'function _loggedNeedsNumbers(app, rifle, load) {', 6);
    assert(/already happened.*never a block/i.test(body) || /save already happened/i.test(source('js/rifle-add.js')),
        'the never-a-block doctrine must be documented at this exact seam');
});

check('_finishSteelSaveMulti mirrors the same always-save-first ordering for N shots', function () {
    var body = slice('js/rifle-add.js', 'function _finishSteelSaveMulti(app, rifle, S, units, ctx, btn) {', 40);
    var stringIdx = body.indexOf("_write(app.db, 'addSteelString'");
    var shotsIdx = body.indexOf('Promise.all(S.hits.map');
    var eligIdx = body.indexOf('ctx.load.bulletBC && (ctx.load.muzzleVelocity || ctx.load.truedMv)');
    assert(stringIdx !== -1 && shotsIdx !== -1 && eligIdx !== -1, 'expected string save, per-shot saves, and eligibility branch');
    assert(stringIdx < shotsIdx && shotsIdx < eligIdx, 'all N shots must save before the eligibility branch runs');
});

console.log('\n════════════════════════════════════════');
console.log('Fact card 3/3 — Chrono (js/rifle-add.js _chronoScreen)');
console.log('════════════════════════════════════════\n');

check('_finishChronoSave writes addMvMeasurement (or the quick-set path) unconditionally on submit', function () {
    var body = slice('js/rifle-add.js', 'function _finishChronoSave(app, rifle, S, load, btn) {', 25);
    assert(body.indexOf("_write(app.db, 'addMvMeasurement'") !== -1, 'addMvMeasurement must be reachable directly, no eligibility gate first');
});

check('a chrono save failure re-enables the button rather than discarding the typed speed', function () {
    var body = slice('js/rifle-add.js', 'function _finishChronoSave(app, rifle, S, load, btn) {', 25);
    var catches = body.match(/\.catch\(function \(err\) \{\s*(if \(btn\) )?btn\.disabled = false;/g) || [];
    assert(catches.length >= 1, 'at least one save path must re-enable the button on failure, not lose the entry');
});

console.log('\n════════════════════════════════════════');
console.log('Detailed truing — js/rifle-payoff.js ("this IS detailed truing now")');
console.log('════════════════════════════════════════\n');

check('the file header states the observation is ALREADY SAVED before this module ever runs', function () {
    var body = slice('js/rifle-payoff.js', ' * rifle-payoff.js', 20);
    assert(/ALREADY SAVED/.test(body), 'header must document that capture precedes any analytic gate here');
});

check('the caller (rifle-add.js) invokes RiflePayoff.run only AFTER both saves resolve, never interleaved with them', function () {
    var body = slice('js/rifle-add.js', 'function _finishSteelSave(app, rifle, S, units, ctx, btn) {', 45);
    var shotIdx = body.indexOf("_write(app.db, 'addSteelShot'");
    var payoffIdx = body.indexOf('RiflePayoff.run(app, rifle, ctx.load,');
    assert(shotIdx !== -1 && payoffIdx !== -1 && shotIdx < payoffIdx,
        'RiflePayoff must run strictly after the shot save promise chain, never gating it');
});

check('the validation gate (_checkValidationGate) fails OPEN on its own read error — a DB hiccup here must not block the shooter from seeing SOMETHING', function () {
    var body = slice('js/rifle-payoff.js', 'function _checkValidationGate(app, rifle, errMOA) {', 30);
    assert(/\.catch\(function \(err\) \{\s*console\.warn.*\s*return \{ blocked: false \};/.test(body),
        'a gate read failure must resolve blocked:false, never hang or silently drop the payoff');
});

check('the hold screen and the "could not use" screen both explicitly say the string/observation is still logged', function () {
    var holdBody = slice('js/rifle-payoff.js', 'function _showHoldScreen(app, rifle, gate) {', 20);
    var noneBody = slice('js/rifle-payoff.js', 'function _couldNotUse(app, rifle, obs) {', 20);
    assert(/still logged/.test(holdBody), '_showHoldScreen must reassure the string is still logged');
    assert(/still logged/.test(noneBody), '_couldNotUse must reassure the observation is still logged');
});

check('the two block reasons (hold vs alarm) are distinct, named strings — never a boolean-only "rejected"', function () {
    var body = slice('js/rifle-payoff.js', 'function _checkValidationGate(app, rifle, errMOA) {', 30);
    assert(body.indexOf("reason: 'hold'") !== -1, 'the pre-existing-hold path must carry reason:"hold"');
    assert(body.indexOf("reason: 'alarm'") !== -1, 'the this-observation-is-an-alarm path must carry reason:"alarm"');
});

check('an alarm classification is itself PERSISTED (addTroubleshootingCheck), not just shown and forgotten', function () {
    var body = slice('js/rifle-payoff.js', 'function _checkValidationGate(app, rifle, errMOA) {', 30);
    assert(/addTroubleshootingCheck\(\{ rifleId: rifle\.id, step: 'alarm', result: 'alarm' \}\)/.test(body),
        'the alarm reason must be written to the troubleshooting_checks table, not only rendered');
});

check('_couldNotUse\'s honest-refusal branches each carry their own distinct plain-language reason (near-zero vs. out-of-bracket)', function () {
    var body = slice('js/rifle-payoff.js', 'function _couldNotUse(app, rifle, obs) {', 20);
    assert(/nearLimit/.test(body) && /out of bracket|bigger than a speed or drag problem/.test(body),
        'both refusal reasons must be distinguishable, not one generic "invalid" message');
});

console.log('\n════════════════════════════════════════');
console.log('Cross-cutting — validation-status.js classification never throws, always names a reason');
console.log('════════════════════════════════════════\n');

var VS = require('../js/validation-status.js');

check('deriveSpotCheckOutcome never throws on a missing/null baseline (the always-live case per PHASECD-REPORT.md)', function () {
    var out = VS.deriveSpotCheckOutcome({ observedErrorMOA: 5, baseline: null });
    assert(typeof out === 'string' && out.length > 0, 'must return a named outcome string, never throw or return undefined');
});

check('deriveSpotCheckOutcome distinguishes alarm from confirmed/drift by magnitude, not a boolean collapse', function () {
    var small = VS.deriveSpotCheckOutcome({ observedErrorMOA: 0.05, baseline: null });
    var large = VS.deriveSpotCheckOutcome({ observedErrorMOA: 5, baseline: null });
    assert(small !== large, 'a tiny residual and a huge residual must classify differently');
});

check('deriveTroubleshootingHold on a rifle with zero history returns a well-formed non-hold result, never throws', function () {
    var out = VS.deriveTroubleshootingHold({ alarmAt: null, checks: [] });
    assert(out && typeof out.inHold === 'boolean', 'must return a structured result even with no history');
    assert(out.inHold === false, 'no alarm on file -> not in hold');
});

check('deriveTroubleshootingHold walking a full ladder of "ok" results never silently exits early (Phase D\'s own regression-tested bug)', function () {
    var out = VS.deriveTroubleshootingHold({
        alarmAt: '2026-01-01T00:00:00Z',
        checks: [{ step: 'zero', result: 'ok', at: '2026-01-02T00:00:00Z' }]
    });
    assert(out.inHold === true, '"ok" (checked, nothing wrong) must advance the ladder, not clear the hold');
});

console.log('\n════════════════════════════════════════');
console.log('Cross-cutting — residual engine reasons round-trip into the shadow log (js/db.js)');
console.log('════════════════════════════════════════\n');

check('js/db.js\'s logResidualShadow stores the engine\'s WHOLE output object verbatim (output: data.output) — since residual-engine.js\'s own output shape already carries {eligible, reason, ...}, storing it wholesale (never cherry-picking fields) is what preserves the reason through to the row', function () {
    var body = slice('js/db.js', 'BallisticDB.prototype.logResidualShadow = function (data) {', 20);
    assert(/output:\s*data\.output/.test(body), 'the record must store data.output verbatim, not a hand-picked subset of fields');
});

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
