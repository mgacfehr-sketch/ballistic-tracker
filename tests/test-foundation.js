/**
 * test-foundation.js — foundation-layer pure logic.
 * Run: node tests/test-foundation.js
 * Suites: ToolsCore · (WizardCore, HomeCore, RifleCards orderCards added
 * in their steps).
 */

var passed = 0;
var failed = 0;

function check(label, actual, expected) {
    var ok = actual === expected;
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

// ── ToolsCore (v2.3 job registry) ─────────────────────────────
var T = require('../js/tools.js');
var ToolsCore = T.ToolsCore;
var TOOLS = T.TOOLS;

console.log('\nToolsCore:');

var featureOn = function () { return true; };
var featureOff = function () { return false; };

check('core job (records) active with empty map', ToolsCore.isActive(TOOLS.records, {}), true);
check('non-core job inactive with empty map', ToolsCore.isActive(TOOLS.steelSession, {}), false);

var m1 = ToolsCore.setActive(TOOLS.steelSession, {}, true, '2026-07-16T00:00:00Z');
check('activate marks active', ToolsCore.isActive(TOOLS.steelSession, m1), true);
check('activation is immutable (source map untouched)', ToolsCore.isActive(TOOLS.steelSession, {}), false);

var m2 = ToolsCore.setActive(TOOLS.steelSession, m1, false);
check('deactivate works', ToolsCore.isActive(TOOLS.steelSession, m2), false);
check('deactivate preserves the entry (hiding keeps all data)', !!m2.steelSession, true);

var m3 = ToolsCore.setActive(TOOLS.records, m1, false);
check('core jobs cannot deactivate', ToolsCore.isActive(TOOLS.records, m3), true);

check('visible = active AND feature on', ToolsCore.visible(TOOLS.steelSession, m1, featureOn), true);
check('tier gate hides loadDev even when active',
    ToolsCore.visible(TOOLS.loadDev, ToolsCore.setActive(TOOLS.loadDev, {}, true), featureOff), false);
check('core job with no feature visible regardless', ToolsCore.visible(TOOLS.records, {}, featureOff), true);
check('inactive job invisible despite feature', ToolsCore.visible(TOOLS.steelSession, {}, featureOn), false);

var mIdem = ToolsCore.setActive(TOOLS.steelSession, m1, true, '2026-07-17T00:00:00Z');
check('re-activate idempotent (still active)', ToolsCore.isActive(TOOLS.steelSession, mIdem), true);

// Checklist activation (the onboarding primitive)
var mList = ToolsCore.applyPreset(TOOLS, {}, ['rangeSession', 'truing']);
check('checklist activates listed jobs (rangeSession)', ToolsCore.isActive(TOOLS.rangeSession, mList), true);
check('checklist activates listed jobs (truing)', ToolsCore.isActive(TOOLS.truing, mList), true);
check('checklist leaves unlisted jobs off', ToolsCore.isActive(TOOLS.steelSession, mList), false);
check('unknown checklist keys ignored', ToolsCore.isActive(TOOLS.steelSession, ToolsCore.applyPreset(TOOLS, {}, ['bogus'])), false);

// Legacy key resolution
check('legacy key resolves (bench → loadDev)', ToolsCore.resolveKey('bench'), 'loadDev');
check('legacy key resolves (scopeTruth → scopeTracking)', ToolsCore.resolveKey('scopeTruth'), 'scopeTracking');
check('job keys resolve to themselves', ToolsCore.resolveKey('truing'), 'truing');
check('checklist accepts legacy keys', ToolsCore.isActive(TOOLS.steelSession, ToolsCore.applyPreset(TOOLS, {}, ['field'])), true);

// v2 round-trip + v1 migration
var round = ToolsCore.hydrate(ToolsCore.serialize(m1));
check('serialize→hydrate round-trip (v2)', ToolsCore.isActive(TOOLS.steelSession, round), true);
check('serialize marks v2', ToolsCore.serialize({}).v, 2);

var v1saved = { v: 1, tools: {
    field: { active: true, at: '2026-07-01T00:00:00Z' },
    scopeTruth: { active: true, at: '2026-07-01T00:00:00Z' },
    dopeCards: { active: false, at: '2026-07-01T00:00:00Z' }
} };
var migrated = ToolsCore.hydrate(v1saved);
check('v1 field migrates to steelSession', ToolsCore.isActive(TOOLS.steelSession, migrated), true);
check('v1 scopeTruth migrates to scopeTracking', ToolsCore.isActive(TOOLS.scopeTracking, migrated), true);
check('v1 inactive entries stay off (truing untouched)', ToolsCore.isActive(TOOLS.truing, migrated), false);
check('v1 users always get rangeSession (was core)', ToolsCore.isActive(TOOLS.rangeSession, migrated), true);
check('v1 users always get ballistics (was core)', ToolsCore.isActive(TOOLS.ballistics, migrated), true);
check('v1 migration preserves original timestamp', migrated.steelSession.at, '2026-07-01T00:00:00Z');

check('hydrate of garbage → empty map', Object.keys(ToolsCore.hydrate({ v: 99 })).length, 0);
check('hydrate of null → empty map', Object.keys(ToolsCore.hydrate(null)).length, 0);

// ── WizardCore ────────────────────────────────────────────────
var W = require('../js/wizard-core.js');

console.log('\nWizardCore:');

var DEF = {
    id: 'test', version: 2,
    steps: [
        { id: 'use', prompt: 'Main use?', type: 'choice', choices: [{ value: 'hunt', label: 'Hunt' }, { value: 'reload', label: 'Handload' }] },
        { id: 'powder', prompt: 'Favorite powder?', type: 'text', skip: function (a) { return a.use !== 'reload'; } },
        { id: 'range', prompt: 'Typical range?', type: 'number', optional: true,
          validate: function (v) { return v > 0 && v <= 3000 ? null : 'Enter 1–3000 yards.'; } }
    ]
};

var s0 = W.create(DEF);
check('create starts at step 0', s0.index, 0);
check('required step blocks empty Next', W.canNext(DEF, s0, '').ok, false);
check('required step allows a value', W.canNext(DEF, s0, 'hunt').ok, true);

var sHunt = W.next(DEF, s0, 'hunt');
check('hunt path skips powder (index 2)', sHunt.index, 2);
check('answer recorded', sHunt.answers.use, 'hunt');
check('failed next returns same state', W.next(DEF, s0, ''), s0);

var sReload = W.next(DEF, s0, 'reload');
check('reload path lands on powder (index 1)', sReload.index, 1);

check('optional step allows empty', W.canNext(DEF, sHunt, '').ok, true);
check('validate rejects bad value', W.canNext(DEF, sHunt, 9999).ok, false);
check('validate error text surfaces', W.canNext(DEF, sHunt, 9999).error, 'Enter 1–3000 yards.');
check('validate accepts good value', W.canNext(DEF, sHunt, 600).ok, true);

var sDone = W.next(DEF, sHunt, 600);
check('completes past the last step', W.isComplete(DEF, sDone), true);
check('progress complete = total', W.progress(DEF, sDone).current, W.progress(DEF, sDone).total);
check('hunt path total excludes skipped step', W.progress(DEF, sHunt).total, 2);
check('reload path total includes powder', W.progress(DEF, sReload).total, 3);

var sBack = W.back(DEF, sHunt);
check('back from range skips powder on hunt path', sBack.index, 0);
check('back at first step is a no-op', W.back(DEF, s0).index, 0);
check('immutability: back does not mutate forward state', sHunt.index, 2);

// Answer overwrite on re-visit
var sRevisit = W.next(DEF, sBack, 'reload');
check('re-answer overwrites', sRevisit.answers.use, 'reload');
check('re-answer reroutes (powder now visible)', sRevisit.index, 1);

// serialize → hydrate identity
var saved = W.serialize(sHunt);
var restored = W.hydrate(DEF, saved);
check('hydrate restores index', restored.index, sHunt.index);
check('hydrate restores answers', restored.answers.use, 'hunt');

// version + unknown-answer resets
check('defVersion mismatch → fresh', W.hydrate(DEF, { v: 1, defVersion: 1, index: 2, answers: {} }).index, 0);
check('unknown answer id → fresh', W.hydrate(DEF, { v: 1, defVersion: 2, index: 1, answers: { ghost: 1 } }).index, 0);
check('garbage → fresh', W.hydrate(DEF, null).index, 0);

// ── HomeCore ──────────────────────────────────────────────────
var H = require('../js/home.js');
var HomeCore = H.HomeCore;

console.log('\nHomeCore:');

function fakeAction(id) { return { homeAction: { id: id } }; }
var ACTIONS = [fakeAction('a'), fakeAction('b'), fakeAction('c')];

var ordered = HomeCore.orderActions(ACTIONS, { b: 5, c: 2 });
check('descending by count', ordered.map(function (x) { return x.homeAction.id; }).join(','), 'b,c,a');
check('missing counts treated as 0 (a last)', ordered[2].homeAction.id, 'a');
check('ties keep registry order', HomeCore.orderActions(ACTIONS, {}).map(function (x) { return x.homeAction.id; }).join(','), 'a,b,c');
check('partial tie stable', HomeCore.orderActions(ACTIONS, { c: 1 }).map(function (x) { return x.homeAction.id; }).join(','), 'c,a,b');
check('input array not mutated', ACTIONS[0].homeAction.id, 'a');

var c0 = {};
var c1 = HomeCore.bumpCount(c0, 'x');
check('bump creates entry', c1.x, 1);
check('bump immutable', c0.x, undefined);
check('bump increments', HomeCore.bumpCount(c1, 'x').x, 2);
check('bump caps at 999', HomeCore.bumpCount({ x: 999 }, 'x').x, 999);

// ── RifleCards.orderCards ─────────────────────────────────────
// (rifle-cards.js needs DOM globals only at render; orderCards is pure)
global.document = { createElement: function () { return {}; }, getElementById: function () { return null; } };
var RC = require('../js/rifle-cards.js').RifleCards;

console.log('\nRifleCards.orderCards:');

function fakeCard(id, slot) { return { id: id, slot: slot, isVisible: function () { return true; }, render: function () {} }; }

var orderedCards = RC.orderCards([
    fakeCard('prove1', 'prove'), fakeCard('ready1', 'ready'),
    fakeCard('prog1', 'progress'), fakeCard('ammo1', 'ammo'), fakeCard('prog2', 'progress')
]);
check('seven-question slot order', orderedCards.map(function (c) { return c.id; }).join(','), 'ready1,ammo1,prog1,prog2,prove1');
check('registration order within slot', orderedCards[2].id, 'prog1');

var threw = false;
try { RC.register({ id: 'bad', slot: 'nonsense', isVisible: function () {}, render: function () {} }); }
catch (e) { threw = true; }
check('unknown slot rejected by register', threw, true);

// ── DopeCards.dopeRows ────────────────────────────────────────
var calcMod = require('../js/calculations.js');
global.applyScopeCorrection = calcMod.applyScopeCorrection;
var dopeRows = require('../js/dope-cards.js').dopeRows;

console.log('\nDopeCards.dopeRows:');

// Synthetic trajectory table: comeUp grows ~1 MOA / 100 yd past zero
var synthTable = [];
for (var ri = 0; ri <= 1000; ri += 25) {
    synthTable.push({
        rangeYards: ri,
        comeUpMOA: ri <= 100 ? 0 : (ri - 100) / 100,
        windDriftMOA: ri / 500
    });
}

var hunt = dopeRows(synthTable, { mode: 'hunt' });
check('hunt rows start at 100', hunt[0].rangeYards, 100);
check('hunt rows every 25 yd', hunt[1].rangeYards - hunt[0].rangeYards, 25);
check('hunt row count (100..1000 by 25)', hunt.length, 37);

var comp = dopeRows(synthTable, { mode: 'comp' });
check('comp emits one row per whole come-up MOA', comp.length >= 8, true);
check('comp first row is the 1-MOA crossing', comp[0].comeUpMOA >= 1, true);

var corrected = dopeRows(synthTable, { mode: 'hunt', scopeFactor: 0.96 });
// At short range the 4% correction collapses inside quarter-MOA click
// snapping (correct print behavior) — assert where it exceeds a click:
// 600 yd, 5.0 MOA raw → 5.21 corrected → snaps to 5.25
check('scope factor inflates come-ups once it exceeds a click', corrected[20].comeUpMOA > hunt[20].comeUpMOA, true);
check('…and short-range rows legitimately snap to the same click', corrected[2].comeUpMOA, hunt[2].comeUpMOA);

var w = hunt[hunt.length - 1];
check('default wind columns are 5/10/15 (three)', w.winds.length, 3);
check('wind columns scale linearly (w5 = w10/2)', Math.abs(w.winds[0] - Math.round(w.winds[1] / 2 * 4) / 4) < 0.26, true);
check('come-ups snap to quarter-MOA clicks', (hunt[5].comeUpMOA * 4) % 1, 0);

var custom = dopeRows(synthTable, { mode: 'hunt', windSpeeds: [10, 20] });
check('custom wind speeds produce matching columns', custom[custom.length - 1].winds.length, 2);
check('20 mph column doubles the 10 mph drift', custom[custom.length - 1].winds[1],
    Math.round(custom[custom.length - 1].winds[0] * 2 * 4) / 4);

// ── FieldCore ─────────────────────────────────────────────────
var FieldCore = require('../js/field.js').FieldCore;

console.log('\nFieldCore.computeEffectiveRange:');

function fs(dist, hits, shots, pos) {
    return { distanceYards: dist, hits: hits, shots: shots, position: pos || 'prone' };
}

var effShots = [
    fs(200, 10, 10), fs(300, 9, 10), fs(400, 9, 10), fs(500, 9, 10),
    fs(600, 6, 10),                       // 60% at 600 — the wall
    fs(700, 9, 10),                       // good beyond the wall — must NOT extend range
    fs(300, 3, 10, 'seated'), fs(200, 9, 10, 'seated')
];
var eff = FieldCore.computeEffectiveRange(effShots);
check('prone effective range stops before the failing bin', eff.prone.yards, 500);
check('failing far bin does not resurrect the range', eff.prone.yards < 700, true);
check('seated capped by its own wall', eff.seated.yards, 200);
check('bins with <5 shots are skipped', FieldCore.computeEffectiveRange([fs(300, 2, 2)]).prone, undefined);
check('empty input → empty object', Object.keys(FieldCore.computeEffectiveRange([])).length, 0);
check('threshold configurable', FieldCore.computeEffectiveRange(effShots, { threshold: 0.55 }).prone.yards, 700);

console.log('\nFieldCore.normalizeHitRate (target-size normalization):');

check('vitals-size target passes through', FieldCore.normalizeHitRate(0.9, 10), 0.9);
check('missing target size passes through', FieldCore.normalizeHitRate(0.7, undefined), 0.7);
check('null target size passes through', FieldCore.normalizeHitRate(0.7, null), 0.7);
check('smaller target → higher normalized rate', FieldCore.normalizeHitRate(0.8, 8) > 0.8, true);
check('larger target → lower normalized rate', FieldCore.normalizeHitRate(0.8, 12) < 0.8, true);
check('perfect rate stays perfect', FieldCore.normalizeHitRate(1, 12), 1);
check('zero rate stays zero', FieldCore.normalizeHitRate(0, 8), 0);
// closed form: p_vitals = 1 - (1-p)^((v/t)^2); p=0.5 on 5" → 1-(0.5)^4 = 0.9375
check('closed-form value (0.5 on 5" → 0.9375 on 10")',
    Math.abs(FieldCore.normalizeHitRate(0.5, 5) - 0.9375) < 1e-9, true);

// Effective range respects target size: 8/10 (80%) on a 12" plate at 300
// normalizes below 90% on vitals and ends the walk; the same raw rate on
// a 6" plate normalizes above 90% and keeps it.
function fsT(dist, hits, shots, targetIn) {
    return { distanceYards: dist, hits: hits, shots: shots, position: 'prone', targetSizeIn: targetIn };
}
check('big-plate hits do not inflate effective range',
    FieldCore.computeEffectiveRange([fsT(300, 8, 10, 12)]).prone, undefined);
check('small-plate hits normalize upward and qualify',
    FieldCore.computeEffectiveRange([fsT(300, 8, 10, 6)]).prone.yards, 300);
check('vitals-size plate unchanged by normalization (85% fails)',
    FieldCore.computeEffectiveRange([fsT(300, 17, 20, 10)]).prone, undefined);

console.log('\nFieldCore.analyzeWindCalls / windInsight:');

function windShot(value, errorMil) {
    return { windCall: { mph: 10, value: value }, windActual: { errorMil: errorMil } };
}
var windShots = [];
for (var wi = 0; wi < 6; wi++) windShots.push(windShot('full-left', 0.2));
for (var wj = 0; wj < 6; wj++) windShots.push(windShot('full-right', -0.05));
windShots.push({ windCall: null, windActual: null }); // ungraded rows ignored

var wa = FieldCore.analyzeWindCalls(windShots);
check('two graded classes', wa.length, 2);
var fullLeft = wa.filter(function (a) { return a.value === 'full-left'; })[0];
check('full-left average error +0.2', fullLeft.avgErrorMil, 0.2);
check('classes below minCalls excluded', FieldCore.analyzeWindCalls(windShots.slice(0, 3)).length, 0);

var insight = FieldCore.windInsight(wa);
check('insight names the biggest bias', insight.indexOf('under-call full left') !== -1, true);
check('insight defaults to mils', insight.indexOf('0.2 mil') !== -1, true);
check('no meaningful bias → null', FieldCore.windInsight([{ value: 'none', avgErrorMil: 0.02, n: 9 }]), null);

var insightMOA = FieldCore.windInsight(wa, 'MOA');
check('MOA unit converts the magnitude (0.2 mil → 0.7 MOA)', insightMOA.indexOf('0.7 MOA') !== -1, true);
check('MOA insight never says mil', insightMOA.indexOf('mil') === -1, true);
var insightMil = FieldCore.windInsight(wa, 'MIL');
check('explicit MIL stays in mils', insightMil.indexOf('0.2 mil') !== -1, true);

// ── LadderCore ────────────────────────────────────────────────
var calcAll = require('../js/calculations.js');
global.moaToInches = calcAll.moaToInches;
global.inchesToMOA = calcAll.inchesToMOA;
global.calculateCentroid = calcAll.calculateCentroid;
global.calculateGroupSize = calcAll.calculateGroupSize;
global.round4 = calcAll.round4;
var LadderCore = require('../js/ladder.js').LadderCore;

console.log('\nLadderCore:');

// 100 px/in at 100 yd. Groups at POI-Y (px): 0, 500, 510, 515, 900
// → 5"/0.05"/0.05"/3.85" shifts; threshold 0.35 MOA ≈ 0.366" @ 100.
function grp(cy) {
    return [{ x: 0, y: cy }, { x: 20, y: cy + 10 }, { x: -15, y: cy - 10 }];
}
var series = [
    { label: '41.4', impacts: grp(0) },
    { label: '41.6', impacts: grp(500) },
    { label: '41.8', impacts: grp(510) },
    { label: '42.0', impacts: grp(515) },
    { label: '42.2', impacts: grp(900) }
];
var la = LadderCore.ladderAnalysis(series, 100, 100);
check('five groups analyzed', la.groups.length, 5);
check('window found', !!la.window, true);
check('window = the stable middle run (41.6–42.0)', la.window.startIdx + '-' + la.window.endIdx, '1-3');
check('sentence names the labels', la.sentence, '41.6–42.0 is your window.');
check('group size computed in MOA', la.groups[0].sizeMOA > 0, true);

var noWin = LadderCore.ladderAnalysis([
    { label: 'a', impacts: grp(0) },
    { label: 'b', impacts: grp(500) },
    { label: 'c', impacts: grp(1000) }
], 100, 100);
check('all-moving series → no window', noWin.window, null);
check('no-window sentence honest', noWin.sentence.indexOf('No stable window') === 0, true);

var split = LadderCore.splitByTapOrder([1, 2, 3, 4, 5, 6, 7].map(function (n) { return { x: n, y: n }; }), 3, ['A', 'B', 'C']);
check('tap-order split: 3 groups from 7 impacts', split.length, 3);
check('short last group kept', split[2].impacts.length, 1);
check('labels applied in order', split[1].label, 'B');

console.log('\n' + '═'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
