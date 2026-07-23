/**
 * steel-core.js — PURE logic for the Steel/Field Session (§2.2).
 * No DOM, no storage. Node-tested: tests/test-steel-core.js.
 *
 * Owns: the locked stepper increments, offset formatting and
 * center-hit detection, wind-clock text, direction-of-fire chips,
 * the string summary that feeds truing, and CHRONO RECONCILIATION —
 * pairing imported velocities to logged impacts IN ORDER (fill what
 * the shooter skipped, flag what disagrees, never guess silently).
 */

/** Locked by contract §2.2: stepper increment per unit per tap. */
var STEEL_INCREMENTS = { MOA: 0.25, IN: 0.5, MIL: 0.1 };

/** Velocity agreement tolerance (fps) before a pairing row is flagged. */
var STEEL_MV_TOLERANCE_FPS = 5;

/** Snap-step an offset value by one increment. dir = +1 | -1. */
function steelStep(value, dir, unit) {
    var inc = STEEL_INCREMENTS[unit] || STEEL_INCREMENTS.MOA;
    var steps = Math.round((value || 0) / inc) + (dir > 0 ? 1 : -1);
    // avoid FP artifacts: work in integer steps
    return Math.round(steps * inc * 1000) / 1000;
}

/** A center hit is within half an increment of 0/0 (logs as ~0/0). */
function steelIsCenter(elevOff, windOff, unit) {
    var inc = STEEL_INCREMENTS[unit] || STEEL_INCREMENTS.MOA;
    return Math.abs(elevOff || 0) <= inc / 2 + 1e-9 &&
        Math.abs(windOff || 0) <= inc / 2 + 1e-9;
}

/** "0.6 high · 0.4 R" (unit-less; the list header states the unit).
 *  Center hits read "center". + elev = HIGH, + wind = RIGHT. */
function steelDescribeShot(elevOff, windOff, unit) {
    if (steelIsCenter(elevOff, windOff, unit)) return 'center';
    var bits = [];
    if (Math.abs(elevOff) > 1e-9) {
        bits.push(Math.abs(elevOff).toFixed(unit === 'MIL' ? 1 : 2).replace(/\.?0+$/, '') +
            (elevOff > 0 ? ' high' : ' low'));
    }
    if (Math.abs(windOff) > 1e-9) {
        bits.push(Math.abs(windOff).toFixed(unit === 'MIL' ? 1 : 2).replace(/\.?0+$/, '') +
            (windOff > 0 ? ' R' : ' L'));
    }
    return bits.join(' · ') || 'center';
}

/** "8 mph from 2 o'clock" — direction ALWAYS stated in text (§2.2). */
function steelWindText(clock, mph) {
    if (!mph) return 'no wind';
    return mph + ' mph from ' + clock + " o'clock";
}

var STEEL_DOF_CHIPS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Compass heading (deg true) → nearest facing chip. */
function steelDofFromHeading(deg) {
    if (typeof deg !== 'number' || !isFinite(deg)) return null;
    var norm = ((deg % 360) + 360) % 360;
    var idx = Math.round(norm / 45) % 8;
    return STEEL_DOF_CHIPS[idx];
}

/** Facing chip → degrees (chip center). */
function steelDofToDegrees(chip) {
    var idx = STEEL_DOF_CHIPS.indexOf(chip);
    return idx === -1 ? null : idx * 45;
}

/**
 * CHRONO RECONCILIATION (§2.2): pair imported velocities to logged
 * impacts IN ORDER (shot 1 ↔ shot 1 …). Never applied silently — the
 * result renders on a confirm screen.
 *
 * loggedShots: [{seq, mvFps|null, ...}] (seq ascending)
 * chronoFps:   [number] in fire order
 * → {
 *   rows: [{seq, logged, chrono, use, action}]
 *     action: 'fill'    — shooter skipped it, chrono fills
 *             'match'   — both present, agree within tolerance
 *             'conflict'— both present, disagree (chrono preferred, flagged)
 *             'keep'    — no chrono value for this shot
 *             'extra'   — chrono shot beyond the logged string
 *   filled, conflicts,
 *   countMismatch: 0 | +n (chrono has n extra) | -n (n logged shots uncovered)
 * }
 */
function steelPairVelocities(loggedShots, chronoFps) {
    loggedShots = (loggedShots || []).slice().sort(function (a, b) { return a.seq - b.seq; });
    chronoFps = chronoFps || [];
    var rows = [];
    var filled = 0, conflicts = 0;
    var n = Math.max(loggedShots.length, chronoFps.length);
    for (var i = 0; i < n; i++) {
        var shot = loggedShots[i] || null;
        var fps = i < chronoFps.length ? chronoFps[i] : null;
        if (!shot) {
            rows.push({ seq: i + 1, logged: null, chrono: fps, use: null, action: 'extra' });
            continue;
        }
        if (fps === null) {
            rows.push({ seq: shot.seq, logged: shot.mvFps || null, chrono: null,
                use: shot.mvFps || null, action: 'keep' });
            continue;
        }
        if (shot.mvFps === null || shot.mvFps === undefined) {
            filled++;
            rows.push({ seq: shot.seq, logged: null, chrono: fps, use: fps, action: 'fill' });
        } else if (Math.abs(shot.mvFps - fps) <= STEEL_MV_TOLERANCE_FPS) {
            rows.push({ seq: shot.seq, logged: shot.mvFps, chrono: fps, use: fps, action: 'match' });
        } else {
            conflicts++;
            rows.push({ seq: shot.seq, logged: shot.mvFps, chrono: fps, use: fps, action: 'conflict' });
        }
    }
    return {
        rows: rows,
        filled: filled,
        conflicts: conflicts,
        countMismatch: chronoFps.length - loggedShots.length
    };
}

/** Apply a confirmed pairing: new shots array, mv filled + source set. */
function steelApplyPairing(loggedShots, pairing, source) {
    var bySeq = {};
    pairing.rows.forEach(function (r) {
        if (r.action === 'fill' || r.action === 'conflict' || r.action === 'match') {
            bySeq[r.seq] = r.use;
        }
    });
    return (loggedShots || []).map(function (s) {
        if (bySeq[s.seq] === undefined) return s;
        var out = {};
        for (var k in s) { if (s.hasOwnProperty(k)) out[k] = s[k]; }
        out.mvFps = bySeq[s.seq];
        out.mvSource = source || 'import';
        return out;
    });
}

/**
 * String summary — what "Send to Truing" carries and the list footer
 * shows. Mean impact offsets (the group center truing wants — never
 * single shots), MV coverage, center hits.
 */
function steelStringSummary(shots, unit) {
    shots = shots || [];
    var n = shots.length;
    var sumE = 0, sumW = 0, centers = 0;
    var mvs = [];
    shots.forEach(function (s) {
        sumE += s.elevOff || 0;
        sumW += s.windOff || 0;
        if (steelIsCenter(s.elevOff, s.windOff, unit)) centers++;
        if (typeof s.mvFps === 'number') mvs.push(s.mvFps);
    });
    var avgMv = null, sdMv = null;
    if (mvs.length) {
        var sum = 0;
        mvs.forEach(function (v) { sum += v; });
        avgMv = sum / mvs.length;
        var ss = 0;
        mvs.forEach(function (v) { ss += (v - avgMv) * (v - avgMv); });
        sdMv = Math.sqrt(ss / mvs.length); // population SD (house convention)
    }
    return {
        n: n,
        meanElevOff: n ? Math.round(sumE / n * 1000) / 1000 : 0,
        meanWindOff: n ? Math.round(sumW / n * 1000) / 1000 : 0,
        centerHits: centers,
        mvCount: mvs.length,
        avgMv: avgMv !== null ? Math.round(avgMv * 10) / 10 : null,
        sdMv: sdMv !== null ? Math.round(sdMv * 10) / 10 : null
    };
}

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        STEEL_INCREMENTS: STEEL_INCREMENTS,
        STEEL_MV_TOLERANCE_FPS: STEEL_MV_TOLERANCE_FPS,
        STEEL_DOF_CHIPS: STEEL_DOF_CHIPS,
        steelStep: steelStep,
        steelIsCenter: steelIsCenter,
        steelDescribeShot: steelDescribeShot,
        steelWindText: steelWindText,
        steelDofFromHeading: steelDofFromHeading,
        steelDofToDegrees: steelDofToDegrees,
        steelPairVelocities: steelPairVelocities,
        steelApplyPairing: steelApplyPairing,
        steelStringSummary: steelStringSummary
    };
}
