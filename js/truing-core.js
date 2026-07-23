/**
 * truing-core.js — PURE two-stage, transonic-aware truing engine
 * (§2.5c, the v2.3 doctrine core) + device compensation (§2.12).
 * No DOM, no storage. Node-tested: tests/test-truing-core.js.
 *
 * Truing is TWO corrections at TWO distance bands, not one generic
 * adjustment:
 *   MV truing   — error observed while comfortably supersonic resolves
 *                 on the velocity path.
 *   BC/drag     — error observed at/through the transonic band (Mach
 *                 1.2 → 0.9) resolves on the drag path.
 * The engine computes where THIS rifle/load crosses Mach 1.2 / 1.0 /
 * 0.9 in today's air, prescribes ideal truing distances, routes
 * corrections by where the data actually lives, normalizes each shot
 * (per-shot MV deviation, logged wind, vertical Coriolis at ≥800 with
 * direction of fire), trues only on the mean of GROUP CENTERS, and
 * carries a full normalization ledger for the "Why?" expander.
 *
 * Reuses the proven solver (js/ballistic-solver.js): computeTrajectory
 * rows already carry machNumber + velocityFps. Corrections are secant
 * root-finds (bisection-bracketed) — ~6 trajectory runs instead of the
 * legacy 61-step grid.
 *
 * All angular math internal to this module is MOA. Callers convert
 * MIL (× MIL_TO_MOA) and inches at distance before handing data in.
 */

/* Solver resolution guard: browser globals or Node require. The
 * solver's pure half references calculations.js globals (round4,
 * inchesToMOA) — provide them before loading it under Node. */
if (typeof computeTrajectory === 'undefined' && typeof require === 'function') {
    var __calc = require('./calculations.js');
    if (typeof global !== 'undefined') {
        if (typeof global.round4 === 'undefined') global.round4 = __calc.round4;
        if (typeof global.inchesToMOA === 'undefined') global.inchesToMOA = __calc.inchesToMOA;
        if (typeof global.moaToInches === 'undefined') global.moaToInches = __calc.moaToInches;
    }
    var __bs = require('./ballistic-solver.js');
    var computeTrajectory = __bs.computeTrajectory;
    var calculateSpeedOfSound = __bs.calculateSpeedOfSound;
}

var TRUING = {
    MIL_TO_MOA: 3.43775,
    MV_PRESCRIBE_FACTOR: 0.85,     // true MV as far as possible, ~15% short of Mach 1.2
    MV_BAND_EDGE: 0.9,             // below 0.9 × mach12 distance = MV territory
    ZERO_BAND_FACTOR: 1.5,         // within 1.5 × zero range: too close to true anything
    CORIOLIS_MIN_YD: 800,
    OMEGA: 7.2921e-5,              // Earth's angular velocity (rad/s)
    SOLVE_TOL_MOA: 0.02,
    SOLVE_MAX_ITER: 25,
    MV_BRACKET: [0.85, 1.15],
    BC_BRACKET: [0.70, 1.30],
    STD_ENV: { tempF: 59, pressureInHg: 29.92, humidity: 50 }
};

/* ── trajectory plumbing (memoized) ───────────────────────── */

var _truingTrajCache = {};

function _truingTraj(profile, env, maxRange, rangeStep) {
    env = env || TRUING.STD_ENV;
    var params = {
        muzzleVelocity: profile.muzzleVelocity,
        bc: profile.bc,
        dragModel: profile.dragModel || 'G7',
        zeroRange: profile.zeroRange || 100,
        scopeHeight: profile.scopeHeight || 1.5,
        bulletWeight: profile.bulletWeight || 140,
        maxRange: maxRange,
        rangeStep: rangeStep,
        windSpeedMph: 0,
        windClockPos: 12,
        // KNOWN SOLVER QUIRK (flagged in REORG-REPORT): computeTrajectory
        // defaults falsy inputs (`params.tempF || 59`), so an honest 0°F
        // would silently become standard air. 0.001°F is physically
        // indistinguishable and survives the falsy check.
        tempF: typeof env.tempF === 'number'
            ? (env.tempF === 0 ? 0.001 : env.tempF) : TRUING.STD_ENV.tempF,
        pressureInHg: typeof env.pressureInHg === 'number' ? env.pressureInHg : TRUING.STD_ENV.pressureInHg,
        humidity: typeof env.humidity === 'number' ? env.humidity : TRUING.STD_ENV.humidity
    };
    var key = JSON.stringify(params);
    if (_truingTrajCache[key]) return _truingTrajCache[key];
    var out = computeTrajectory(params);
    // bounded cache — truing sessions touch a handful of profiles
    var keys = Object.keys(_truingTrajCache);
    if (keys.length > 60) delete _truingTrajCache[keys[0]];
    _truingTrajCache[key] = out;
    return out;
}

/** Linear interpolation of any numeric column at an exact range. */
function _interpAt(table, rangeYds, field) {
    if (!table || !table.length) return null;
    if (rangeYds <= table[0].rangeYards) return table[0][field];
    for (var i = 1; i < table.length; i++) {
        if (table[i].rangeYards >= rangeYds) {
            var a = table[i - 1], b = table[i];
            var f = (rangeYds - a.rangeYards) / (b.rangeYards - a.rangeYards || 1);
            return a[field] + (b[field] - a[field]) * f;
        }
    }
    return table[table.length - 1][field];
}

/** First range where machNumber crosses DOWN through `mach`. */
function _machCrossing(table, mach) {
    for (var i = 1; i < table.length; i++) {
        var a = table[i - 1], b = table[i];
        if (a.machNumber >= mach && b.machNumber < mach) {
            var f = (a.machNumber - mach) / (a.machNumber - b.machNumber || 1);
            return Math.round(a.rangeYards + (b.rangeYards - a.rangeYards) * f);
        }
    }
    return null;
}

/* ── 1. Mach distances ────────────────────────────────────── */

/**
 * Where does this bullet pass Mach 1.2 / 1.0 / 0.9 in this air?
 * → {mach12Yd, supersonicYd (Mach 1.0), mach09Yd} — null for any
 * threshold not reached within 3000 yd (very-high-BC magnums).
 */
function machDistances(profile, env) {
    var table = _truingTraj(profile, env, 2200, 10).table;
    if (table.length && table[table.length - 1].machNumber >= 0.9) {
        table = _truingTraj(profile, env, 3000, 10).table;
    }
    return {
        mach12Yd: _machCrossing(table, 1.2),
        supersonicYd: _machCrossing(table, 1.0),
        mach09Yd: _machCrossing(table, 0.9)
    };
}

/* ── 2. Prescribed truing distances ───────────────────────── */

function _roundTo25(x) { return Math.round(x / 25) * 25; }

/**
 * The ideal truing distances for this rifle today (§2.5c):
 *   MV: as far as possible while ~15% short of Mach 1.2.
 *   Drag: bracket Mach 1.2 → 0.9.
 */
function prescribeTruingDistances(profile, env) {
    var m = machDistances(profile, env);
    var mvYd = null;
    if (m.mach12Yd) {
        mvYd = _roundTo25(TRUING.MV_PRESCRIBE_FACTOR * m.mach12Yd);
        var floor = Math.max(300, 3 * (profile.zeroRange || 100));
        if (mvYd < floor) mvYd = _roundTo25(floor);
    }
    return {
        mvTrueYd: mvYd,
        dragBracket: (m.mach12Yd && m.mach09Yd)
            ? [_roundTo25(m.mach12Yd), _roundTo25(m.mach09Yd)] : null,
        machDist: m
    };
}

/* ── 3. Band routing ──────────────────────────────────────── */

/**
 * Where (in Mach terms) does this observation live?
 * → {band: 'zero'|'mv'|'drag'|'beyond', supersonicPct}
 */
function classifyDistance(rangeYds, machDist, zeroRange) {
    var pct = machDist.supersonicYd ? rangeYds / machDist.supersonicYd : null;
    var band;
    if (rangeYds <= TRUING.ZERO_BAND_FACTOR * (zeroRange || 100)) band = 'zero';
    else if (!machDist.mach12Yd || rangeYds < TRUING.MV_BAND_EDGE * machDist.mach12Yd) band = 'mv';
    // +30 yd tolerance: prescribed distances round to 25s, and Mach 0.88
    // is still honestly transonic territory
    else if (!machDist.mach09Yd || rangeYds <= machDist.mach09Yd + 30) band = 'drag';
    else band = 'beyond';
    return { band: band, supersonicPct: pct };
}

/* ── 4. Normalization ─────────────────────────────────────── */

/**
 * d(comeUpMOA)/d(MV) at a range, by central difference (±10 fps).
 * Negative: faster bullets need less come-up.
 */
function _mvSensitivity(profile, env, rangeYds, maxRange) {
    var up = {}; var dn = {};
    for (var k in profile) { if (profile.hasOwnProperty(k)) { up[k] = profile[k]; dn[k] = profile[k]; } }
    up.muzzleVelocity = profile.muzzleVelocity + 10;
    dn.muzzleVelocity = profile.muzzleVelocity - 10;
    var cUp = _interpAt(_truingTraj(up, env, maxRange, 25).table, rangeYds, 'comeUpMOA');
    var cDn = _interpAt(_truingTraj(dn, env, maxRange, 25).table, rangeYds, 'comeUpMOA');
    return (cUp - cDn) / 20; // MOA per fps
}

/** Vertical Coriolis (Eötvös) in MOA at range — the wind-call.js
 *  formula with time of flight taken from the real trajectory. */
function _coriolisVerticalMOA(profile, env, rangeYds, latDeg, azimuthDeg, maxRange) {
    if (typeof latDeg !== 'number' || typeof azimuthDeg !== 'number') return 0;
    var tof = _interpAt(_truingTraj(profile, env, maxRange, 25).table, rangeYds, 'timeOfFlightSec');
    if (!tof) return 0;
    var avgVel = rangeYds * 3 / tof; // ft/s
    var vertFt = 2 * TRUING.OMEGA * Math.cos(latDeg * Math.PI / 180) *
        Math.sin(azimuthDeg * Math.PI / 180) * avgVel * tof * tof / 2;
    var vertIn = vertFt * 12; // + = rises (east), − = drops (west)
    return vertIn / (rangeYds / 100 * 1.047);
}

/**
 * Normalize observations and reduce to GROUP CENTERS (§2.5 — never
 * true on single shots).
 *
 * obs: [{rangeYds, observedComeUpMOA, shotMV?, groupId?, flagged?}]
 *   observedComeUpMOA = dialed + held − impactElevOffset, all in MOA:
 *   "the correction that would have centered this shot".
 * ctx: {profile, env, latitudeDeg?, azimuthDeg?, machDist}
 *
 * → { groups: [{rangeYds, groupId, n, meanObservedMOA,
 *      meanNormalizedMOA, band, supersonicPct, flagged}],
 *     ledger: [...per-shot entries...], avgMV }
 */
function normalizeGroups(obs, ctx) {
    obs = (obs || []).filter(function (o) {
        return o && typeof o.rangeYds === 'number' && typeof o.observedComeUpMOA === 'number';
    });
    var profile = ctx.profile;
    var env = ctx.env;
    var maxRange = 0;
    obs.forEach(function (o) { if (o.rangeYds > maxRange) maxRange = o.rangeYds; });
    maxRange += 100;

    // string-average MV (shots without MV normalize against this too)
    var mvs = obs.filter(function (o) { return typeof o.shotMV === 'number'; })
        .map(function (o) { return o.shotMV; });
    var avgMV = mvs.length
        ? mvs.reduce(function (a, b) { return a + b; }, 0) / mvs.length
        : profile.muzzleVelocity;

    var sensCache = {};
    var ledger = [];
    var byGroup = {};

    obs.forEach(function (o) {
        var mvAdj = 0;
        if (typeof o.shotMV === 'number' && Math.abs(o.shotMV - avgMV) > 0.01) {
            var sKey = Math.round(o.rangeYds / 25) * 25;
            if (!(sKey in sensCache)) sensCache[sKey] = _mvSensitivity(profile, env, o.rangeYds, maxRange);
            // remove the come-up explained by this shot's own velocity
            mvAdj = -sensCache[sKey] * (o.shotMV - avgMV);
        }
        var corAdj = 0;
        if (o.rangeYds >= TRUING.CORIOLIS_MIN_YD) {
            // + Coriolis rise means the shot printed higher than ballistics
            // alone — the required TRUE come-up is larger by that amount
            corAdj = _coriolisVerticalMOA(profile, env, o.rangeYds,
                ctx.latitudeDeg, ctx.azimuthDeg, maxRange);
        }
        var normalized = o.observedComeUpMOA + mvAdj + corAdj;
        var gid = o.groupId !== undefined && o.groupId !== null ? o.groupId : String(o.rangeYds);
        (byGroup[gid] = byGroup[gid] || {
            groupId: gid, rangeYds: o.rangeYds, shots: [], flagged: false
        });
        byGroup[gid].shots.push(normalized);
        if (o.flagged) byGroup[gid].flagged = true;
        ledger.push({
            rangeYds: o.rangeYds,
            groupId: gid,
            observedMOA: Math.round(o.observedComeUpMOA * 1000) / 1000,
            mvAdjMOA: Math.round(mvAdj * 1000) / 1000,
            coriolisAdjMOA: Math.round(corAdj * 1000) / 1000,
            aeroJump: 'not modeled',
            normalizedMOA: Math.round(normalized * 1000) / 1000,
            shotMV: typeof o.shotMV === 'number' ? o.shotMV : null
        });
    });

    var groups = Object.keys(byGroup).map(function (gid) {
        var g = byGroup[gid];
        var mean = g.shots.reduce(function (a, b) { return a + b; }, 0) / g.shots.length;
        var cls = classifyDistance(g.rangeYds, ctx.machDist, profile.zeroRange);
        return {
            groupId: g.groupId,
            rangeYds: g.rangeYds,
            n: g.shots.length,
            meanNormalizedMOA: Math.round(mean * 1000) / 1000,
            band: cls.band,
            supersonicPct: cls.supersonicPct,
            flagged: g.flagged
        };
    }).sort(function (a, b) { return a.rangeYds - b.rangeYds; });

    return { groups: groups, ledger: ledger, avgMV: Math.round(avgMV * 10) / 10 };
}

/* ── 5. The solvers (secant, bisection-bracketed) ─────────── */

/** Mean signed error (predicted − observed, MOA) over groups for a
 *  candidate profile. Wind-flagged groups are down-weighted ×0.3. */
function _meanResidual(groups, profile, env, maxRange) {
    var table = _truingTraj(profile, env, maxRange, 25).table;
    var sum = 0, wsum = 0;
    groups.forEach(function (g) {
        var w = g.flagged ? 0.3 : 1;
        var pred = _interpAt(table, g.rangeYds, 'comeUpMOA');
        sum += w * (pred - g.meanNormalizedMOA);
        wsum += w;
    });
    return wsum ? sum / wsum : 0;
}

function _solve1D(groups, profile, env, field, bracketFactors) {
    var usable = groups.filter(function (g) { return g.band !== 'zero' && g.band !== 'beyond'; });
    if (!usable.length) usable = groups.slice();
    if (!usable.length) return null;
    var maxRange = usable.reduce(function (a, g) { return Math.max(a, g.rangeYds); }, 0) + 100;

    var x0 = profile[field];
    var lo = x0 * bracketFactors[0], hi = x0 * bracketFactors[1];

    function evalAt(x) {
        var p = {};
        for (var k in profile) { if (profile.hasOwnProperty(k)) p[k] = profile[k]; }
        p[field] = x;
        return _meanResidual(usable, p, env, maxRange);
    }

    var f0 = evalAt(x0);
    var x1 = x0 * 1.02;
    var f1 = evalAt(x1);
    var iterations = 0;
    var capped = false;

    for (var i = 0; i < TRUING.SOLVE_MAX_ITER; i++) {
        iterations++;
        if (Math.abs(f1) < TRUING.SOLVE_TOL_MOA) break;
        var denom = (f1 - f0);
        var x2 = Math.abs(denom) > 1e-12 ? x1 - f1 * (x1 - x0) / denom : null;
        if (x2 === null || x2 < lo || x2 > hi || !isFinite(x2)) {
            // bisection fallback on the bracket
            var flo = evalAt(lo), fhi = evalAt(hi);
            if (flo * fhi > 0) {
                // no root inside the bracket — clamp to the nearer wall
                x1 = Math.abs(flo) < Math.abs(fhi) ? lo : hi;
                f1 = Math.abs(flo) < Math.abs(fhi) ? flo : fhi;
                capped = true;
                break;
            }
            var a = lo, b = hi;
            for (var j = 0; j < 40; j++) {
                iterations++;
                var mid = (a + b) / 2;
                var fm = evalAt(mid);
                if (Math.abs(fm) < TRUING.SOLVE_TOL_MOA) { x1 = mid; f1 = fm; break; }
                if (flo * fm <= 0) { b = mid; fhi = fm; } else { a = mid; flo = fm; }
                x1 = mid; f1 = fm;
            }
            break;
        }
        x0 = x1; f0 = f1;
        x1 = x2; f1 = evalAt(x2);
    }

    return {
        value: field === 'muzzleVelocity' ? Math.round(x1) : Math.round(x1 * 1000) / 1000,
        old: profile[field],
        residualBeforeMOA: Math.round(evalAt(profile[field]) * 1000) / 1000,
        residualAfterMOA: Math.round(f1 * 1000) / 1000,
        iterations: iterations,
        capped: capped
    };
}

function solveMvCorrection(groups, profile, env) {
    return _solve1D(groups, profile, env, 'muzzleVelocity', TRUING.MV_BRACKET);
}

function solveBcCorrection(groups, profile, env) {
    return _solve1D(groups, profile, env, 'bc', TRUING.BC_BRACKET);
}

/* ── 6. The full solve + MV↔BC fork (doctrine-guided) ─────── */

/**
 * One call from the UI: normalize, route, compute BOTH corrections
 * (the user picks one — §2.5's explicit fork), and say which the
 * doctrine recommends and why.
 *
 * opts: {mvMeasured: bool} — is the profile MV chronographed?
 */
function solveTruing(obs, ctx, opts) {
    opts = opts || {};
    var norm = normalizeGroups(obs, ctx);
    if (!norm.groups.length) return null;

    var far = norm.groups[norm.groups.length - 1];
    var mvOpt = solveMvCorrection(norm.groups, ctx.profile, ctx.env);
    var bcOpt = solveBcCorrection(norm.groups, ctx.profile, ctx.env);

    // Routing doctrine (§2.5c): WHERE the tied-in data lives decides.
    var recommended, guidance;
    if (far.band === 'drag') {
        recommended = 'bc';
        guidance = 'Your ' + far.rangeYds + '-yd data reaches the transonic band — this is drag territory. ' +
            (opts.mvMeasured ? 'MV is measured, so the honest fix is BC.' : 'Correct BC here; chronograph the rifle to lock MV down too.');
    } else if (opts.mvMeasured) {
        recommended = 'bc';
        guidance = 'MV is measured — the honest fix is BC. But your ' + far.rangeYds + '-yd data is at ' +
            (far.supersonicPct !== null ? Math.round(far.supersonicPct * 100) + '% of this rifle\'s supersonic range' : 'short range') +
            ' — that\'s MV/zero territory, so a BC trued here is extrapolated. True farther for drag you can bet on.';
    } else {
        recommended = 'mv';
        guidance = 'MV is the likely culprit at ' + far.rangeYds + ' yd — or better, chronograph it. ' +
            'Drag stays at its published value unless you true at/through the transonic band' +
            (ctx.machDist.mach12Yd ? ' (' + ctx.machDist.mach12Yd + '–' + (ctx.machDist.mach09Yd || '?') + ' yd for this rifle)' : '') + '.';
    }

    return {
        groups: norm.groups,
        ledger: norm.ledger,
        avgMV: norm.avgMV,
        machDist: ctx.machDist,
        farRangeYds: far.rangeYds,
        farBand: far.band,
        supersonicPct: far.supersonicPct,
        mvOption: mvOpt,
        bcOption: bcOpt,
        recommended: recommended,
        guidance: guidance
    };
}

/* ── 7. Confidence (5 segments + caps, §2.5) ──────────────── */

var TRUING_CONF_WORDS = ['Thin', 'Thin', 'Moderate', 'Good', 'High'];

/**
 * inputs: {shotCount, groupCount, mvMeasuredPct (0..1), windLoggedPct,
 *   groupSpreadMOA, envSource ('measured'|'manual'|'lookup'|'default'),
 *   zeroConfirmed, trackingVerified, supersonicPct, correctionType,
 *   mode ('quick'|'full')}
 * → {segments 1..5, word, capNotes: [..]}
 */
function truingConfidence(inputs) {
    var base;
    if (inputs.shotCount >= 20 && inputs.groupCount >= 3) base = 5;
    else if (inputs.shotCount >= 10 && inputs.groupCount >= 2) base = 4;
    else if (inputs.shotCount >= 5) base = 3;
    else if (inputs.shotCount >= 3) base = 2;
    else base = 1;

    var caps = [];
    function cap(n, note) {
        if (base > n) { base = n; caps.push(note); }
    }

    if (inputs.mode === 'quick') {
        cap(3, 'Quick true assumes no wind and your saved MV — good for a rough correction.');
    }
    if (inputs.correctionType === 'bc' &&
        typeof inputs.supersonicPct === 'number' && inputs.supersonicPct < 0.85) {
        cap(3, 'Trued at ' + Math.round(inputs.supersonicPct * 100) +
            '% of supersonic — a drag correction from here is extrapolated.');
    }
    if (inputs.envSource === 'default') cap(3, 'Environment was assumed, not entered — enter today\'s conditions to raise this.');
    else if (inputs.envSource === 'lookup') cap(4, 'Environment came from the nearest station, not measured on site.');
    if (typeof inputs.groupSpreadMOA === 'number') {
        if (inputs.groupSpreadMOA > 1.0) cap(2, 'Your groups disagree by over 1 MOA — shooter or condition noise dominates.');
        else if (inputs.groupSpreadMOA > 0.5) cap(3, 'Group centers disagree by over 0.5 MOA — more shots would settle it.');
    }
    if (inputs.zeroConfirmed === false) cap(2, 'Zero isn\'t confirmed — confirm it before trusting any truing.');
    if (inputs.trackingVerified === false) cap(3, 'Tracking never verified — a turret error pollutes this truing. Verify it to raise confidence to High.');
    if (inputs.correctionType === 'mv' && inputs.mvMeasuredPct === 0) {
        cap(3, 'No chronograph data — MV here is inferred from drop alone.');
    }
    if (typeof inputs.windLoggedPct === 'number' && inputs.windLoggedPct < 0.5 && inputs.mode !== 'quick') {
        caps.push('Wind was logged on under half these shots — deflection may hide in the vertical.');
    }

    var segments = Math.max(1, Math.min(5, base));
    return { segments: segments, word: TRUING_CONF_WORDS[segments - 1], capNotes: caps };
}

/* ── 8. Device compensation (§2.12) ───────────────────────── */

/**
 * Devices dial THROUGH the scope; the scope's clicks are `scopeFactor`
 * true (actual/indicated). Compute the BC+MV pair that makes the
 * device output comeUp/scopeFactor — so what gets dialed lands true.
 *
 * → {bcOut, mvOut, sweetSpot: {fromYd, toYd, maxErrMOA}, errorCurve,
 *    identity: bool (factor ≈ 1 → numbers unchanged)}
 */
function deviceCompensation(profile, env, scopeFactor, workingRange) {
    workingRange = workingRange || { fromYd: Math.max(200, (profile.zeroRange || 100) * 2), toYd: 1000 };
    if (!scopeFactor || Math.abs(scopeFactor - 1) < 0.0005) {
        return {
            bcOut: profile.bc, mvOut: Math.round(profile.muzzleVelocity),
            sweetSpot: { fromYd: workingRange.fromYd, toYd: workingRange.toYd, maxErrMOA: 0 },
            errorCurve: [], identity: true
        };
    }
    var maxRange = workingRange.toYd + 100;
    var trueTable = _truingTraj(profile, env, maxRange, 25).table;

    // target curve: what the device must OUTPUT at each sample range
    var samples = [];
    for (var r = workingRange.fromYd; r <= workingRange.toYd; r += 50) {
        var c = _interpAt(trueTable, r, 'comeUpMOA');
        if (typeof c === 'number') {
            samples.push({
                groupId: 'dev' + r, rangeYds: r, n: 1,
                meanNormalizedMOA: c / scopeFactor, band: 'mv',
                supersonicPct: null, flagged: false
            });
        }
    }
    if (!samples.length) return null;

    function fitMvForBc(bc) {
        var p = {};
        for (var k in profile) { if (profile.hasOwnProperty(k)) p[k] = profile[k]; }
        p.bc = bc;
        var res = _solve1D(samples, p, env, 'muzzleVelocity', TRUING.MV_BRACKET);
        return res ? res.value : p.muzzleVelocity;
    }
    function sse(bc, mv) {
        var p = {};
        for (var k in profile) { if (profile.hasOwnProperty(k)) p[k] = profile[k]; }
        p.bc = bc; p.muzzleVelocity = mv;
        var table = _truingTraj(p, env, maxRange, 25).table;
        var s = 0;
        samples.forEach(function (g) {
            var d = _interpAt(table, g.rangeYds, 'comeUpMOA') - g.meanNormalizedMOA;
            s += d * d;
        });
        return s;
    }

    // golden-section on BC (outer), MV fit (inner)
    var phi = (Math.sqrt(5) - 1) / 2;
    var a = profile.bc * 0.75, b = profile.bc * 1.25;
    var x1 = b - phi * (b - a), x2 = a + phi * (b - a);
    var f1 = sse(x1, fitMvForBc(x1));
    var f2 = sse(x2, fitMvForBc(x2));
    for (var i = 0; i < 14; i++) {
        if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = b - phi * (b - a); f1 = sse(x1, fitMvForBc(x1)); }
        else { a = x1; x1 = x2; f1 = f2; x2 = a + phi * (b - a); f2 = sse(x2, fitMvForBc(x2)); }
    }
    var bcOut = Math.round(((a + b) / 2) * 1000) / 1000;
    var mvOut = fitMvForBc(bcOut);

    // error curve: dial fit(R) through the faulty scope vs true comeUp
    var pFit = {};
    for (var k2 in profile) { if (profile.hasOwnProperty(k2)) pFit[k2] = profile[k2]; }
    pFit.bc = bcOut; pFit.muzzleVelocity = mvOut;
    var fitTable = _truingTraj(pFit, env, maxRange, 25).table;
    var errorCurve = samples.map(function (g) {
        var errMOA = _interpAt(fitTable, g.rangeYds, 'comeUpMOA') * scopeFactor -
            _interpAt(trueTable, g.rangeYds, 'comeUpMOA');
        return { rangeYds: g.rangeYds, errMOA: Math.round(errMOA * 1000) / 1000 };
    });

    // sweet spot: longest contiguous run where the error stays inside
    // max(0.35" at that range, 0.1 MOA)
    var best = null, run = null;
    errorCurve.forEach(function (p) {
        var limitMOA = Math.max(0.1, 0.35 / (p.rangeYds / 100 * 1.047));
        var ok = Math.abs(p.errMOA) <= limitMOA;
        if (ok) {
            if (!run) run = { fromYd: p.rangeYds, toYd: p.rangeYds, maxErrMOA: Math.abs(p.errMOA) };
            else { run.toYd = p.rangeYds; run.maxErrMOA = Math.max(run.maxErrMOA, Math.abs(p.errMOA)); }
            if (!best || (run.toYd - run.fromYd) > (best.toYd - best.fromYd)) best = run;
        } else {
            run = null;
        }
    });

    return {
        bcOut: bcOut,
        mvOut: Math.round(mvOut),
        sweetSpot: best,
        errorCurve: errorCurve,
        identity: false
    };
}

// Export for Node unit tests + browser use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TRUING: TRUING,
        machDistances: machDistances,
        prescribeTruingDistances: prescribeTruingDistances,
        classifyDistance: classifyDistance,
        normalizeGroups: normalizeGroups,
        solveMvCorrection: solveMvCorrection,
        solveBcCorrection: solveBcCorrection,
        solveTruing: solveTruing,
        truingConfidence: truingConfidence,
        deviceCompensation: deviceCompensation
    };
}
