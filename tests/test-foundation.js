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

// ── ToolsCore ─────────────────────────────────────────────────
var T = require('../js/tools.js');
var ToolsCore = T.ToolsCore;
var TOOLS = T.TOOLS;

console.log('\nToolsCore:');

var featureOn = function () { return true; };
var featureOff = function () { return false; };

check('core tool active with empty map', ToolsCore.isActive(TOOLS.checkTarget, {}), true);
check('non-core inactive with empty map', ToolsCore.isActive(TOOLS.chrono, {}), false);

var m1 = ToolsCore.setActive(TOOLS.chrono, {}, true, '2026-07-16T00:00:00Z');
check('activate marks active', ToolsCore.isActive(TOOLS.chrono, m1), true);
check('activation is immutable (source map untouched)', ToolsCore.isActive(TOOLS.chrono, {}), false);

var m2 = ToolsCore.setActive(TOOLS.chrono, m1, false);
check('deactivate works', ToolsCore.isActive(TOOLS.chrono, m2), false);
check('deactivate preserves the entry (data-preserved semantics)', !!m2.chrono, true);

var m3 = ToolsCore.setActive(TOOLS.checkTarget, m1, false);
check('core tools cannot deactivate', ToolsCore.isActive(TOOLS.checkTarget, m3), true);

check('visible = active AND feature on', ToolsCore.visible(TOOLS.chrono, m1, featureOn), true);
check('feature gate blocks even when active', ToolsCore.visible(TOOLS.chrono, m1, featureOff), false);
check('core tool with no feature visible regardless', ToolsCore.visible(TOOLS.solver, {}, featureOff), true);
check('inactive tool invisible despite feature', ToolsCore.visible(TOOLS.chrono, {}, featureOn), false);

var mIdem = ToolsCore.setActive(TOOLS.chrono, m1, true, '2026-07-17T00:00:00Z');
check('re-activate idempotent (still active)', ToolsCore.isActive(TOOLS.chrono, mIdem), true);

var mPreset = ToolsCore.applyPreset(TOOLS, {}, T.ToolPresets.handload);
check('handload preset activates chrono', ToolsCore.isActive(TOOLS.chrono, mPreset), true);
var mHunt = ToolsCore.applyPreset(TOOLS, {}, T.ToolPresets.hunt);
check('hunt preset activates nothing extra', ToolsCore.isActive(TOOLS.chrono, mHunt), false);
check('unknown preset keys ignored', ToolsCore.isActive(TOOLS.chrono, ToolsCore.applyPreset(TOOLS, {}, ['bogus'])), false);

var round = ToolsCore.hydrate(ToolsCore.serialize(m1));
check('serialize→hydrate round-trip', ToolsCore.isActive(TOOLS.chrono, round), true);
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
check('scope factor inflates come-ups (dial MORE)', corrected[10].comeUpMOA > hunt[10].comeUpMOA, true);

var w = hunt[hunt.length - 1];
check('wind columns scale linearly (w5 = w10/2)', Math.abs(w.wind5 - Math.round(w.wind10 / 2 * 4) / 4) < 0.26, true);
check('come-ups snap to quarter-MOA clicks', (hunt[5].comeUpMOA * 4) % 1, 0);

console.log('\n' + '═'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
