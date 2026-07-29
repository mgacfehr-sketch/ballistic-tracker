/**
 * residual-engine.js — Amendment 1 Phase E, SHADOW STAGE ONLY.
 * Implements E-SHADOW-SPEC.md v1.1.0 exactly. PURE — no DOM, no
 * storage, no Date.now(). Node-tested: tests/test-residual-engine.js,
 * tests/test-residual-engine-adversarial.js,
 * tests/test-golden-residual-engine.js.
 *
 * SHADOW-ONLY (E-SHADOW-SPEC.md §9): this engine computes and its
 * output may be logged (js/db.js's logResidualShadow), but nothing in
 * the live application reads that log back. It is NOT called from
 * truing-core.js, simple-true.js, rifle-payoff.js's correction path, or
 * next-action.js. It influences no accepted solution, no PROVEN TO
 * computation, and no coach-line suggestion. Promotion out of shadow
 * status requires the four-stage gate in E-SHADOW-SPEC.md §10 plus the
 * owner's explicit go-ahead -- neither has happened.
 *
 * Depends only on calculations.js (inchesToMOA) and ballistic-solver.js
 * (computeTrajectory) -- deliberately NOT on simple-true.js/
 * truing-core.js, so this new engine is fully independent and
 * Node-testable on its own (its own top-of-file guard below wires
 * calculations.js/ballistic-solver.js under Node, same pattern as
 * truing-core.js's own guard).
 */

(function () {
    'use strict';
    if (typeof module !== 'undefined' && module.exports && typeof inchesToMOA === 'undefined') {
        var calc = require('./calculations.js');
        global.inchesToMOA = calc.inchesToMOA;
        global.round4 = calc.round4;
    }
    if (typeof module !== 'undefined' && module.exports && typeof computeTrajectory === 'undefined') {
        global.computeTrajectory = require('./ballistic-solver.js').computeTrajectory;
    }
})();

var RESIDUAL_ENGINE = {
    MIN_SAMPLE: 4,
    OUTLIER_SIGMA: 3,
    MAD_FLOOR_MOA: 0.05,
    MAX_CLOCK_SKEW_MS: 5 * 60 * 1000,
    CHRONOGRAPH_CLASS_PCT_DEFAULT: 0.1,
    DISTANCE_SIGMA_YD_DEFAULT: 1,
    IMPACT_OBSERVATION_MOA_DEFAULT: 0.25,
    DIAL_RESOLUTION_MOA_DEFAULT: 0.25,
    ATMO_NARROW: { tempF: 2, pressureInHg: 0.1, humidity: 5 },
    ATMO_WIDE: { tempF: 10, pressureInHg: 0.5, humidity: 15 },
    STD_ENV: { tempF: 59, pressureInHg: 29.92, humidity: 50 },
    CONF_WORDS: ['Thin', 'Thin', 'Moderate', 'Good']
};

/** Predicted come-up (MOA) at rangeYds for a given profile/env -- this
 *  engine's own copy, independent of simple-true.js (see file header). */
function _predictedComeUpMOA(profile, env, rangeYds) {
    var e = env || {};
    var out = computeTrajectory({
        muzzleVelocity: profile.muzzleVelocity, bc: profile.bc, dragModel: profile.dragModel || 'G1',
        bulletWeight: profile.bulletWeight, zeroRange: profile.zeroRange, scopeHeight: profile.scopeHeight,
        maxRange: rangeYds + 50, rangeStep: 10, windSpeedMph: 0, windClockPos: 12,
        tempF: typeof e.tempF === 'number' ? e.tempF : RESIDUAL_ENGINE.STD_ENV.tempF,
        pressureInHg: typeof e.pressureInHg === 'number' ? e.pressureInHg : RESIDUAL_ENGINE.STD_ENV.pressureInHg,
        humidity: typeof e.humidity === 'number' ? e.humidity : RESIDUAL_ENGINE.STD_ENV.humidity
    });
    var table = (out && out.table) || [];
    var prev = null;
    for (var i = 0; i < table.length; i++) {
        if (table[i].rangeYards >= rangeYds) {
            if (!prev || table[i].rangeYards === rangeYds) return table[i].comeUpMOA;
            var f = (rangeYds - prev.rangeYards) / (table[i].rangeYards - prev.rangeYards || 1);
            return prev.comeUpMOA + (table[i].comeUpMOA - prev.comeUpMOA) * f;
        }
        prev = table[i];
    }
    return table.length ? table[table.length - 1].comeUpMOA : 0;
}

/** Half the come-up spread from perturbing ONE numeric field of profile
 *  or env by +/-delta -- the shared finite-difference sensitivity used
 *  for every uncertainty term in E-SHADOW-SPEC.md §3. */
function _sensitivityMOA(profile, env, rangeYds, target, field, delta) {
    var plus = target === 'profile'
        ? _mergeNum(profile, field, delta) : profile;
    var minus = target === 'profile'
        ? _mergeNum(profile, field, -delta) : profile;
    var envPlus = target === 'env' ? _mergeNum(env || {}, field, delta) : env;
    var envMinus = target === 'env' ? _mergeNum(env || {}, field, -delta) : env;
    var yPlus = target === 'range'
        ? _predictedComeUpMOA(profile, env, rangeYds + delta)
        : _predictedComeUpMOA(plus, envPlus, rangeYds);
    var yMinus = target === 'range'
        ? _predictedComeUpMOA(profile, env, rangeYds - delta)
        : _predictedComeUpMOA(minus, envMinus, rangeYds);
    return Math.abs(yPlus - yMinus) / 2;
}

function _median(values) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function _mergeNum(obj, field, delta) {
    var out = {};
    for (var k in obj) { if (obj.hasOwnProperty(k)) out[k] = obj[k]; }
    out[field] = (typeof obj[field] === 'number' ? obj[field] : 0) + delta;
    return out;
}

/**
 * Per-shot combined uncertainty (E-SHADOW-SPEC.md §3.6).
 * shot = { rangeYds, shotMV, impactObservationMOA?, dialResolutionMOA?,
 *          windEstimateAeroJumpMOA? }
 * ctx = { profile, env, avgMV, chronographClassPct }
 */
function computeShotUncertaintyMOA(shot, ctx) {
    var profile = ctx.profile;
    var env = ctx.env || null;
    var rangeYds = shot.rangeYds;
    var classPct = typeof ctx.chronographClassPct === 'number'
        ? ctx.chronographClassPct : RESIDUAL_ENGINE.CHRONOGRAPH_CLASS_PCT_DEFAULT;

    var mvForSigma = typeof shot.shotMV === 'number' ? shot.shotMV : (ctx.avgMV || profile.muzzleVelocity);
    var mvDelta = mvForSigma * (classPct / 100);
    var profileAtMv = _mergeNum(profile, 'muzzleVelocity', 0);
    profileAtMv.muzzleVelocity = mvForSigma;
    var sigmaVelocityMOA = _sensitivityMOA(profileAtMv, env, rangeYds, 'profile', 'muzzleVelocity', mvDelta);

    var sigmaDistanceMOA = _sensitivityMOA(profile, env, rangeYds, 'range', null, RESIDUAL_ENGINE.DISTANCE_SIGMA_YD_DEFAULT);

    var estimated = !env || env.source === 'estimated' || env.source === 'default' || !env.source;
    var atmoBand = estimated ? RESIDUAL_ENGINE.ATMO_WIDE : RESIDUAL_ENGINE.ATMO_NARROW;
    var sT = _sensitivityMOA(profile, env, rangeYds, 'env', 'tempF', atmoBand.tempF);
    var sP = _sensitivityMOA(profile, env, rangeYds, 'env', 'pressureInHg', atmoBand.pressureInHg);
    var sH = _sensitivityMOA(profile, env, rangeYds, 'env', 'humidity', atmoBand.humidity);
    var sigmaAtmosphereMOA = Math.sqrt(sT * sT + sP * sP + sH * sH);

    var impactObservationMOA = typeof shot.impactObservationMOA === 'number'
        ? shot.impactObservationMOA : RESIDUAL_ENGINE.IMPACT_OBSERVATION_MOA_DEFAULT;

    var dialResolutionMOA = typeof shot.dialResolutionMOA === 'number'
        ? shot.dialResolutionMOA : RESIDUAL_ENGINE.DIAL_RESOLUTION_MOA_DEFAULT;
    var dialUncertaintyMOA = dialResolutionMOA / 2;

    var sigmaAeroJumpMOA = typeof shot.windEstimateAeroJumpMOA === 'number'
        ? Math.abs(shot.windEstimateAeroJumpMOA) : 0;

    return Math.sqrt(
        sigmaVelocityMOA * sigmaVelocityMOA +
        sigmaDistanceMOA * sigmaDistanceMOA +
        sigmaAtmosphereMOA * sigmaAtmosphereMOA +
        impactObservationMOA * impactObservationMOA +
        dialUncertaintyMOA * dialUncertaintyMOA +
        sigmaAeroJumpMOA * sigmaAeroJumpMOA
    );
}

/**
 * Association eligibility (E-SHADOW-SPEC.md §5).
 * shots = [{ seq, rangeYds, dialedMOA, shotMV }]
 * → { eligible, reason }
 */
function checkEligibility(shots) {
    if (!shots || shots.length < RESIDUAL_ENGINE.MIN_SAMPLE) {
        return { eligible: false, reason: 'fewer than the minimum sample size' };
    }
    var seen = {};
    var seqs = [];
    for (var i = 0; i < shots.length; i++) {
        var s = shots[i];
        if (seen[s.seq]) return { eligible: false, reason: 'duplicate sequence number ' + s.seq };
        seen[s.seq] = true;
        seqs.push(s.seq);
    }
    seqs.sort(function (a, b) { return a - b; });
    for (var j = 1; j < seqs.length; j++) {
        if (seqs[j] !== seqs[j - 1] + 1) return { eligible: false, reason: 'gap in shot sequence between ' + seqs[j - 1] + ' and ' + seqs[j] };
    }
    var firstRange = shots[0].rangeYds, firstDial = shots[0].dialedMOA;
    for (var k = 1; k < shots.length; k++) {
        if (shots[k].rangeYds !== firstRange) return { eligible: false, reason: 'range changed mid-sequence' };
        if (shots[k].dialedMOA !== firstDial) return { eligible: false, reason: 'dial changed mid-sequence' };
    }
    // "No competing sources" (E-SHADOW-SPEC.md §5) is checked by
    // mvSourceId, NOT by numeric shotMV equality -- two different real
    // shots legitimately reading the identical rounded fps value is
    // ordinary chronograph data, not a data-integrity problem. Only a
    // caller-supplied source identifier (e.g. a velocity-string row id +
    // index) being claimed by more than one shot record is a real
    // duplicate. Shots without an mvSourceId skip this check entirely.
    var sourceSeen = {};
    for (var m = 0; m < shots.length; m++) {
        var sourceId = shots[m].mvSourceId;
        if (!sourceId) continue;
        if (sourceSeen[sourceId]) return { eligible: false, reason: 'competing shotMV source (' + sourceId + ' claimed by more than one shot)' };
        sourceSeen[sourceId] = true;
    }
    // Shared impact (E-SHADOW-SPEC.md v1.1.0 §5) -- two shots that
    // landed in one physically indistinguishable hole have no sound way
    // to say which measured velocity produced which vertical miss.
    // Mirrors the mvSourceId check above on the impact side instead of
    // the velocity side. Shots with no impactGroupId skip this check.
    var groupSeen = {};
    for (var n = 0; n < shots.length; n++) {
        var groupId = shots[n].impactGroupId;
        if (!groupId) continue;
        if (groupSeen[groupId]) return { eligible: false, reason: 'shared impact (impactGroupId ' + groupId + ' claimed by more than one shot) -- cannot attribute per-shot residual to a single hole' };
        groupSeen[groupId] = true;
    }
    // Clock skew (E-SHADOW-SPEC.md v1.1.0 §5) -- corroboration check,
    // only runs when a shot supplies BOTH timestamps. A shot with only
    // one (or neither) skips the check entirely -- this never requires
    // timestamps to be present.
    for (var p = 0; p < shots.length; p++) {
        var cs = shots[p].chronoTimestampMs, is = shots[p].impactTimestampMs;
        if (typeof cs !== 'number' || typeof is !== 'number') continue;
        var skewMs = Math.abs(cs - is);
        if (skewMs > RESIDUAL_ENGINE.MAX_CLOCK_SKEW_MS) {
            return { eligible: false, reason: 'clock skew between chrono and impact logs on shot ' + shots[p].seq + ' exceeds ' + RESIDUAL_ENGINE.MAX_CLOCK_SKEW_MS + 'ms tolerance' };
        }
    }
    return { eligible: true, reason: null };
}

/**
 * The main entry point (E-SHADOW-SPEC.md §4-§8).
 * input = { profile, env, avgMV, chronographClassPct, shots: [...] }
 * → the output shape in §8.
 */
function computeResidualEngine(input) {
    input = input || {};
    var profile = input.profile;
    var env = input.env || null;
    var shots = input.shots || [];

    var elig = checkEligibility(shots);
    if (!elig.eligible) {
        return { eligible: false, reason: elig.reason, sufficientSample: false, shots: [],
            explainedMOA: null, unresolvedResidualMOA: null, unresolvedResidualUncertaintyMOA: null,
            confidence: { word: null, capNotes: [] }, evidenceLevel: 'CALCULATED' };
    }

    var avgMV = typeof input.avgMV === 'number' ? input.avgMV
        : (function () {
            var withMv = shots.filter(function (s) { return typeof s.shotMV === 'number'; });
            if (!withMv.length) return profile.muzzleVelocity;
            return withMv.reduce(function (a, b) { return a + b.shotMV; }, 0) / withMv.length;
        })();

    var ctx = { profile: profile, env: env, avgMV: avgMV, chronographClassPct: input.chronographClassPct };
    var rangeYds = shots[0].rangeYds;
    var dialedMOA = shots[0].dialedMOA;

    var predictedStringMV = _predictedComeUpMOA(_mergeNum(profile, 'muzzleVelocity', avgMV - profile.muzzleVelocity), env, rangeYds);

    var computed = shots.map(function (shot) {
        var observedMOA = dialedMOA - inchesToMOA(shot.hitInches || 0, rangeYds);
        var rawResidualMOA = observedMOA - predictedStringMV;
        var predictedShotMV = typeof shot.shotMV === 'number'
            ? _predictedComeUpMOA(_mergeNum(profile, 'muzzleVelocity', shot.shotMV - profile.muzzleVelocity), env, rangeYds)
            : predictedStringMV;
        var velocityCompensatedResidualMOA = observedMOA - predictedShotMV;
        var sigmaShotMOA = computeShotUncertaintyMOA(shot, ctx);
        return {
            seq: shot.seq, rawResidualMOA: round4(rawResidualMOA),
            velocityCompensatedResidualMOA: round4(velocityCompensatedResidualMOA),
            sigmaShotMOA: round4(sigmaShotMOA), excluded: false, excludeReason: null
        };
    });

    var mvMatchedCount = shots.filter(function (s) { return typeof s.shotMV === 'number'; }).length;
    var sufficientSample = mvMatchedCount >= RESIDUAL_ENGINE.MIN_SAMPLE;

    if (!sufficientSample) {
        return {
            eligible: true, reason: null, sufficientSample: false, shots: computed,
            explainedMOA: null, unresolvedResidualMOA: null, unresolvedResidualUncertaintyMOA: null,
            confidence: { word: RESIDUAL_ENGINE.CONF_WORDS[0], capNotes: ['fewer than ' + RESIDUAL_ENGINE.MIN_SAMPLE + ' velocity-matched shots'] },
            evidenceLevel: 'CALCULATED'
        };
    }

    // Outlier exclusion (E-SHADOW-SPEC.md §6): median/MAD, NOT mean/SD.
    // A single gross outlier in a small sample inflates a mean/SD-based
    // threshold enough to mask itself (the outlier drags the mean
    // toward it AND inflates the SD it's being measured against) --
    // median and median-absolute-deviation are the standard robust
    // alternative precisely because one bad point can't drag the
    // median far and can only move the MAD a little.
    var compVals = computed.map(function (c) { return c.velocityCompensatedResidualMOA; });
    var median = _median(compVals);
    var absDevs = compVals.map(function (v) { return Math.abs(v - median); });
    var mad = _median(absDevs);
    // MAD is exactly 0 whenever a majority of shots share the identical
    // compensated residual (a real possibility with a clean/idealized
    // string, not just synthetic data) -- without a floor, ANY deviation
    // would then read as "infinitely many MADs away" and nothing could
    // ever NOT be an outlier, or the reverse (guarding on mad>0) means
    // NOTHING can ever be excluded. RESIDUAL_ENGINE.MAD_FLOOR_MOA is a
    // deliberately small absolute scatter floor for exactly this
    // degenerate case.
    var scaledMad = Math.max(mad * 1.4826, RESIDUAL_ENGINE.MAD_FLOOR_MOA);
    computed.forEach(function (c) {
        if (Math.abs(c.velocityCompensatedResidualMOA - median) > RESIDUAL_ENGINE.OUTLIER_SIGMA * scaledMad) {
            c.excluded = true;
            c.excludeReason = 'more than ' + RESIDUAL_ENGINE.OUTLIER_SIGMA + ' scaled-MAD from the sequence median';
        }
    });

    var included = computed.filter(function (c) { return !c.excluded; });
    var rawVals = computed.filter(function (c) { return !c.excluded; }).map(function (c) { return c.rawResidualMOA; });
    var rawMean = rawVals.reduce(function (a, b) { return a + b; }, 0) / rawVals.length;
    var rawVariance = rawVals.reduce(function (a, b) { return a + (b - rawMean) * (b - rawMean); }, 0) / rawVals.length;
    var compIncludedVals = included.map(function (c) { return c.velocityCompensatedResidualMOA; });
    var compMean = compIncludedVals.reduce(function (a, b) { return a + b; }, 0) / compIncludedVals.length;
    var compVariance = compIncludedVals.reduce(function (a, b) { return a + (b - compMean) * (b - compMean); }, 0) / compIncludedVals.length;
    var explainedVariance = Math.max(0, rawVariance - compVariance);
    var explainedMOA = Math.sqrt(explainedVariance);

    var weightSum = 0, weightedSum = 0;
    included.forEach(function (c) {
        var w = c.sigmaShotMOA > 0 ? 1 / (c.sigmaShotMOA * c.sigmaShotMOA) : 0;
        weightSum += w;
        weightedSum += w * c.velocityCompensatedResidualMOA;
    });
    var unresolvedResidualMOA = weightSum > 0 ? weightedSum / weightSum : compMean;
    var unresolvedResidualUncertaintyMOA = weightSum > 0 ? 1 / Math.sqrt(weightSum) : null;

    var capNotes = [];
    var confIdx = mvMatchedCount >= 8 ? 3 : (mvMatchedCount >= 6 ? 2 : 1);
    if (computed.some(function (c) { return c.excluded; })) { capNotes.push('one or more shots excluded as outliers'); confIdx = Math.min(confIdx, 2); }
    if (mvMatchedCount < shots.length) capNotes.push('not every shot has a measured velocity');

    return {
        eligible: true, reason: null, sufficientSample: true, shots: computed,
        explainedMOA: round4(explainedMOA),
        unresolvedResidualMOA: round4(unresolvedResidualMOA),
        unresolvedResidualUncertaintyMOA: unresolvedResidualUncertaintyMOA === null ? null : round4(unresolvedResidualUncertaintyMOA),
        confidence: { word: RESIDUAL_ENGINE.CONF_WORDS[confIdx], capNotes: capNotes },
        evidenceLevel: 'CALCULATED'
    };
}

// Export for Node unit tests. predictedComeUpMOA is exported alongside
// the public API purely so golden-fixture generation can construct
// synthetic cases against the SAME prediction function the engine uses
// internally (calibration-status.js exports calDaysBetween for the same
// reason) -- it is not part of the documented output contract in
// E-SHADOW-SPEC.md §8.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        RESIDUAL_ENGINE: RESIDUAL_ENGINE,
        checkEligibility: checkEligibility,
        computeShotUncertaintyMOA: computeShotUncertaintyMOA,
        computeResidualEngine: computeResidualEngine,
        predictedComeUpMOA: _predictedComeUpMOA
    };
}
