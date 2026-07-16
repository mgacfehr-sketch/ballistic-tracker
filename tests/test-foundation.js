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

console.log('\n' + '═'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
