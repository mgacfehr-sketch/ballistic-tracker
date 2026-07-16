/**
 * velocity-stats.js — PURE velocity statistics (no DOM, no storage).
 *
 * Statistics convention: POPULATION standard deviation (divide by n),
 * NOT sample SD (n−1). Garmin ShotView reports population SD, and our
 * numbers must match what customers see on their chronograph — verified
 * against real exports in tests/test-garmin-import.js.
 *
 * Note when comparing to ShotView's displayed summary: exported per-shot
 * velocities are rounded to 0.1 fps but Garmin computes its summary from
 * unrounded values, so recomputed stats may differ by up to ~0.1 fps.
 *
 * Node-testable: node tests/test-velocity-stats.js
 */

/**
 * Normalize input to an array of finite fps numbers.
 * Accepts [{fps: 2800.1, ...}] (parser shot objects) or plain numbers.
 */
function _toFpsArray(shots) {
    if (!shots || !shots.length) return [];
    var out = [];
    for (var i = 0; i < shots.length; i++) {
        var v = typeof shots[i] === 'number' ? shots[i] : (shots[i] && shots[i].fps);
        if (typeof v === 'number' && isFinite(v)) out.push(v);
    }
    return out;
}

/**
 * Compute velocity statistics for one string of shots.
 *
 * @param {Array} shots - shot objects with .fps, or plain numbers
 * @returns {{n: number, avg: number|null, sd: number|null, es: number|null}}
 *   n=0 → all nulls; n=1 → avg set, sd/es = 0
 */
function velocityStats(shots) {
    var fps = _toFpsArray(shots);
    var n = fps.length;
    if (n === 0) {
        return { n: 0, avg: null, sd: null, es: null };
    }

    var sum = 0, min = fps[0], max = fps[0];
    for (var i = 0; i < n; i++) {
        sum += fps[i];
        if (fps[i] < min) min = fps[i];
        if (fps[i] > max) max = fps[i];
    }
    var avg = sum / n;

    var sqSum = 0;
    for (var j = 0; j < n; j++) {
        var d = fps[j] - avg;
        sqSum += d * d;
    }
    var sd = Math.sqrt(sqSum / n); // population SD — see file header

    return { n: n, avg: avg, sd: sd, es: max - min };
}

// Export for use in other modules and testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        velocityStats
    };
}
