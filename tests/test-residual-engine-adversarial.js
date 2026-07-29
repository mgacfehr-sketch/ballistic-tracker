/**
 * test-residual-engine-adversarial.js — Amendment 1 A11 adversarial
 * hardening (overnight run #2, item 1). Every case here proves the
 * residual engine REFUSES association rather than guessing: each
 * ineligible case asserts both `eligible: false` AND that
 * computeResidualEngine returns no aggregate (explainedMOA and
 * unresolvedResidualMOA both null). The one non-rule case (missing
 * chrono mid-string) proves the engine's honest fallback fires instead
 * of silent full-confidence guessing. Run: node tests/test-residual-engine-adversarial.js
 */

var passed = 0;
var failed = 0;

function check(label, actual, expected) {
    var ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

var RE = require('../js/residual-engine.js');

var profile = { muzzleVelocity: 2650, bc: 0.505, dragModel: 'G1', bulletWeight: 175, zeroRange: 100, scopeHeight: 1.5 };
var env = { tempF: 59, pressureInHg: 29.92, humidity: 50, source: 'measured' };

function shot(seq, over) {
    var s = { seq: seq, rangeYds: 700, dialedMOA: 5, shotMV: 2650 + seq, hitInches: 0.1 * seq };
    for (var k in over) { if (over.hasOwnProperty(k)) s[k] = over[k]; }
    return s;
}

function assertRefusal(label, shots) {
    var elig = RE.checkEligibility(shots);
    check(label + ' — checkEligibility refuses', elig.eligible, false);
    var full = RE.computeResidualEngine({ profile: profile, env: env, shots: shots });
    check(label + ' — computeResidualEngine refuses (eligible:false)', full.eligible, false);
    check(label + ' — no explainedMOA leaks out', full.explainedMOA, null);
    check(label + ' — no unresolvedResidualMOA leaks out', full.unresolvedResidualMOA, null);
    check(label + ' — no unresolvedResidualUncertaintyMOA leaks out', full.unresolvedResidualUncertaintyMOA, null);
    check(label + ' — reason is a non-empty string', typeof elig.reason === 'string' && elig.reason.length > 0, true);
    return elig;
}

console.log('\n--- Missing chrono detections mid-string (NOT an eligibility rule, per spec v1.1.0) ---');
(function () {
    // One shot in the middle has no shotMV at all -- a dropped/missed
    // chronograph detection. Per spec, this does not make the sequence
    // ineligible; it must instead fall through to the honest fallback
    // (raw residual only for that shot) and the sufficientSample/capNote
    // machinery, never a silently confident aggregate.
    var shots = [shot(1), shot(2), shot(3, { shotMV: undefined }), shot(4), shot(5)];
    var elig = RE.checkEligibility(shots);
    check('sequence with one missing mid-string chrono reading stays eligible', elig.eligible, true);
    var full = RE.computeResidualEngine({ profile: profile, env: env, shots: shots });
    check('still computes (this is not a refusal case)', full.eligible, true);
    check('flags the gap via capNotes rather than staying silent',
        full.confidence.capNotes.indexOf('not every shot has a measured velocity') !== -1, true);
    check('the missing-MV shot itself carries no fabricated shotMV in its record',
        typeof shots[2].shotMV, 'undefined');

    // If MISSING detections push MV-matched count below MIN_SAMPLE, the
    // engine must refuse to report an aggregate (sufficientSample gate),
    // even though the sequence itself remains "eligible" in the
    // structural sense -- this is the honest degrade, not a hard refusal.
    var thin = [shot(1), shot(2, { shotMV: undefined }), shot(3, { shotMV: undefined }), shot(4, { shotMV: undefined }), shot(5, { shotMV: undefined })];
    var thinResult = RE.computeResidualEngine({ profile: profile, env: env, shots: thin });
    check('too few MV-matched shots -> eligible structurally but no aggregate', thinResult.eligible, true);
    check('too few MV-matched shots -> sufficientSample false', thinResult.sufficientSample, false);
    check('too few MV-matched shots -> explainedMOA withheld', thinResult.explainedMOA, null);
    check('too few MV-matched shots -> unresolvedResidualMOA withheld', thinResult.unresolvedResidualMOA, null);
})();

console.log('\n--- Duplicate imports (competing mvSourceId) ---');
(function () {
    var shots = [
        shot(1, { mvSourceId: 'garmin-import-7:0' }),
        shot(2, { mvSourceId: 'garmin-import-7:1' }),
        shot(3, { mvSourceId: 'garmin-import-7:2' }),
        shot(4, { mvSourceId: 'garmin-import-7:0' }) // re-imported the same row, claimed twice
    ];
    assertRefusal('duplicate mvSourceId across two shots', shots);

    // Sanity: the same import re-run with genuinely distinct rows is fine.
    var clean = [
        shot(1, { mvSourceId: 'garmin-import-8:0' }),
        shot(2, { mvSourceId: 'garmin-import-8:1' }),
        shot(3, { mvSourceId: 'garmin-import-8:2' }),
        shot(4, { mvSourceId: 'garmin-import-8:3' })
    ];
    check('distinct mvSourceId values across a full re-import stay eligible', RE.checkEligibility(clean).eligible, true);
})();

console.log('\n--- Re-dials within a string ---');
(function () {
    // A string that starts at one dial and is re-dialed partway through
    // -- two physically different aim points blended together would
    // corrupt the residual; must refuse.
    var shots = [shot(1), shot(2), shot(3, { dialedMOA: 5.25 }), shot(4, { dialedMOA: 5.25 })];
    assertRefusal('dial changed on shot 3 mid-string', shots);

    // A re-dial that happens on the very first shot of what the caller
    // claims is one sequence is really "two different dial settings from
    // the start" -- same rule, different position.
    var shots2 = [shot(1, { dialedMOA: 5.25 }), shot(2), shot(3), shot(4)];
    assertRefusal('dial changed on shot 1 vs the rest', shots2);

    // Sanity: a clean string entirely at the NEW dial (i.e. re-dial
    // already resolved into its own separate sequence by the caller) is
    // fully eligible -- re-dialing itself is not the problem, blending is.
    var resolved = [shot(1, { dialedMOA: 5.25 }), shot(2, { dialedMOA: 5.25 }), shot(3, { dialedMOA: 5.25 }), shot(4, { dialedMOA: 5.25 })];
    check('a clean string entirely at the new dial is eligible', RE.checkEligibility(resolved).eligible, true);
})();

console.log('\n--- Clock skew between chrono and impact logs ---');
(function () {
    var base = 1700000000000; // arbitrary fixed epoch ms, deterministic
    var shots = [
        shot(1, { chronoTimestampMs: base, impactTimestampMs: base + 1000 }),
        shot(2, { chronoTimestampMs: base + 2000, impactTimestampMs: base + 3000 }),
        shot(3, { chronoTimestampMs: base + 4000, impactTimestampMs: base + 4 * 60 * 60 * 1000 }), // 4 hours later -- different session
        shot(4, { chronoTimestampMs: base + 6000, impactTimestampMs: base + 7000 })
    ];
    assertRefusal('one shot has a 4-hour chrono/impact clock skew', shots);

    // Right at the boundary: exactly the tolerance is fine, one ms over refuses.
    var atLimit = [
        shot(1, { chronoTimestampMs: base, impactTimestampMs: base + RE.RESIDUAL_ENGINE.MAX_CLOCK_SKEW_MS }),
        shot(2), shot(3), shot(4)
    ];
    check('skew exactly at MAX_CLOCK_SKEW_MS is still eligible', RE.checkEligibility(atLimit).eligible, true);
    var overLimit = [
        shot(1, { chronoTimestampMs: base, impactTimestampMs: base + RE.RESIDUAL_ENGINE.MAX_CLOCK_SKEW_MS + 1 }),
        shot(2), shot(3), shot(4)
    ];
    check('skew one ms over MAX_CLOCK_SKEW_MS is ineligible', RE.checkEligibility(overLimit).eligible, false);

    // Sanity: a sequence with no timestamps at all (the ordinary case
    // today -- no capture screen sends these fields yet) is unaffected.
    var noTimestamps = [shot(1), shot(2), shot(3), shot(4)];
    check('no timestamps supplied at all -> clock-skew check never engages', RE.checkEligibility(noTimestamps).eligible, true);

    // A shot with only ONE of the two timestamps also skips the check.
    var oneSided = [shot(1, { chronoTimestampMs: base }), shot(2), shot(3), shot(4)];
    check('only chronoTimestampMs supplied, no impactTimestampMs -> check skipped', RE.checkEligibility(oneSided).eligible, true);
})();

console.log('\n--- Multi-shot single impact (shared impactGroupId) ---');
(function () {
    // Two shots landed in one indistinguishable hole -- cannot say which
    // measured velocity produced which vertical miss.
    var shots = [
        shot(1),
        shot(2, { impactGroupId: 'hole-3' }),
        shot(3, { impactGroupId: 'hole-3' }),
        shot(4)
    ];
    assertRefusal('shots 2 and 3 share one impactGroupId (same hole)', shots);

    // Three-way overlap is caught the same way (second claimant trips it).
    var threeWay = [
        shot(1, { impactGroupId: 'hole-9' }),
        shot(2, { impactGroupId: 'hole-9' }),
        shot(3, { impactGroupId: 'hole-9' }),
        shot(4)
    ];
    assertRefusal('three shots claiming the same impactGroupId', threeWay);

    // Sanity: distinct impactGroupIds (every hole individually legible,
    // just labeled) are fine, and no impactGroupId at all is the
    // ordinary case and is fine.
    var distinct = [
        shot(1, { impactGroupId: 'hole-1' }),
        shot(2, { impactGroupId: 'hole-2' }),
        shot(3, { impactGroupId: 'hole-3' }),
        shot(4, { impactGroupId: 'hole-4' })
    ];
    check('distinct impactGroupId per shot stays eligible', RE.checkEligibility(distinct).eligible, true);
    var none = [shot(1), shot(2), shot(3), shot(4)];
    check('no impactGroupId at all stays eligible (ordinary case)', RE.checkEligibility(none).eligible, true);
})();

console.log('\n--- Compound adversarial: multiple integrity problems at once ---');
(function () {
    // Duplicate mvSourceId AND a dial change -- must still refuse
    // (first failing check wins; either is sufficient grounds).
    var shots = [
        shot(1, { mvSourceId: 'x' }),
        shot(2, { mvSourceId: 'x' }),
        shot(3, { dialedMOA: 6 }),
        shot(4, { dialedMOA: 6 })
    ];
    var elig = RE.checkEligibility(shots);
    check('compound integrity failure (duplicate source + dial change) refuses', elig.eligible, false);
    var full = RE.computeResidualEngine({ profile: profile, env: env, shots: shots });
    check('compound integrity failure -> no aggregate leaks out', full.explainedMOA === null && full.unresolvedResidualMOA === null, true);
})();

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
