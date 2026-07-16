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

// ── Time-gap splitting ────────────────────────────────────────

/**
 * Parse a ShotView time-of-day string ("3:09:32 PM") to seconds since
 * midnight, or null if unparseable. 12 AM → 0h, 12 PM → 12h.
 */
function parseTimeOfDay(text) {
    if (typeof text !== 'string') return null;
    var m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(text.trim());
    if (!m) return null;
    var h = parseInt(m[1], 10);
    var min = parseInt(m[2], 10);
    var sec = m[3] ? parseInt(m[3], 10) : 0;
    if (h > 23 || min > 59 || sec > 59) return null;
    if (m[4]) {
        if (h < 1 || h > 12) return null;
        if (h === 12) h = 0;
        if (m[4].toUpperCase() === 'PM') h += 12;
    }
    return h * 3600 + min * 60 + sec;
}

/**
 * Split one ordered shot list into candidate strings wherever the gap
 * between consecutive shots exceeds gapMinutes (default 30).
 *
 * Never guesses: if ANY shot's time is missing/unparseable, returns the
 * whole list as a single string (a wrong split is worse than no split).
 *
 * @param {Array<{fps, time}>} shots
 * @param {number} [gapMinutes=30]
 * @returns {Array<Array>} one or more shot arrays, original order kept
 */
function splitByTimeGap(shots, gapMinutes) {
    if (!shots || shots.length < 2) return shots && shots.length ? [shots] : [];
    var gapSeconds = (gapMinutes || 30) * 60;

    var times = [];
    for (var i = 0; i < shots.length; i++) {
        var t = parseTimeOfDay(shots[i] && shots[i].time);
        if (t === null) return [shots];
        times.push(t);
    }

    var groups = [[shots[0]]];
    for (var j = 1; j < shots.length; j++) {
        var delta = times[j] - times[j - 1];
        if (delta < 0) delta += 24 * 3600; // crossed midnight
        if (delta > gapSeconds) groups.push([]);
        groups[groups.length - 1].push(shots[j]);
    }
    return groups;
}

// ── Velocity-band clustering (load auto-split) ────────────────

/**
 * Shot count of a string record ({shots:[...]} or {n}).
 */
function _stringN(s) {
    if (s && typeof s.n === 'number') return s.n;
    if (s && s.shots && s.shots.length) return s.shots.length;
    return 1;
}

/**
 * Pooled population SD of two strings (weighted by shot count).
 * Falls back to DEFAULT_STRING_SD for strings without an SD (n=1 etc.).
 */
var DEFAULT_STRING_SD = 15;

function _pooledSD(a, b) {
    var sdA = typeof a.sdFps === 'number' ? a.sdFps : DEFAULT_STRING_SD;
    var sdB = typeof b.sdFps === 'number' ? b.sdFps : DEFAULT_STRING_SD;
    var nA = _stringN(a);
    var nB = _stringN(b);
    return Math.sqrt((nA * sdA * sdA + nB * sdB * sdB) / (nA + nB));
}

/**
 * How far apart two string means may sit and still be "same ammo":
 * max(3 × pooled SD, 25 fps). The 25 fps floor keeps tiny-SD strings
 * from splitting on normal string-to-string drift.
 */
function _sameAmmoThreshold(a, b) {
    return Math.max(3 * _pooledSD(a, b), 25);
}

/**
 * Cluster velocity strings into probable ammo groups by average velocity.
 *
 * Conservative by design (this feeds the customer-facing certificate):
 *   - a string joins a cluster only if it is within the same-ammo
 *     threshold of EVERY existing member (no chain-drift merging)
 *   - a string that also sits within threshold of a DIFFERENT cluster's
 *     mean is flagged ambiguous — the UI must ask the human, never guess
 *
 * @param {Array} strings - records with avgFps (required), sdFps, shots/n
 * @returns {{clusters: Array<{members: Array, meanFps: number, shotCount: number}>,
 *            ambiguous: Array<{string: Object, nearClusterIndices: Array<number>}>}}
 *   Strings without a numeric avgFps are excluded from clustering.
 */
function clusterStringsByVelocity(strings) {
    var usable = (strings || []).filter(function (s) {
        return s && typeof s.avgFps === 'number' && isFinite(s.avgFps);
    });
    if (!usable.length) return { clusters: [], ambiguous: [] };

    var sorted = usable.slice().sort(function (a, b) { return a.avgFps - b.avgFps; });

    // Greedy build, join only if compatible with every member
    var clusters = [];
    for (var i = 0; i < sorted.length; i++) {
        var s = sorted[i];
        var joined = false;
        for (var c = 0; c < clusters.length && !joined; c++) {
            var compatible = clusters[c].members.every(function (m) {
                return Math.abs(s.avgFps - m.avgFps) <= _sameAmmoThreshold(s, m);
            });
            if (compatible) {
                clusters[c].members.push(s);
                joined = true;
            }
        }
        if (!joined) clusters.push({ members: [s] });
    }

    // Weighted cluster means + shot counts
    for (var k = 0; k < clusters.length; k++) {
        var sum = 0, n = 0;
        for (var m2 = 0; m2 < clusters[k].members.length; m2++) {
            var mem = clusters[k].members[m2];
            var memN = _stringN(mem);
            sum += mem.avgFps * memN;
            n += memN;
        }
        clusters[k].meanFps = sum / n;
        clusters[k].shotCount = n;
    }

    // Ambiguity pass: near a foreign cluster's mean → human must decide
    var ambiguous = [];
    for (var c2 = 0; c2 < clusters.length; c2++) {
        for (var m3 = 0; m3 < clusters[c2].members.length; m3++) {
            var str = clusters[c2].members[m3];
            var near = [];
            for (var f = 0; f < clusters.length; f++) {
                if (f === c2) continue;
                var rep = clusters[f].members[0];
                var dist = Math.abs(str.avgFps - clusters[f].meanFps);
                if (dist <= _sameAmmoThreshold(str, rep)) near.push(f);
            }
            if (near.length) {
                ambiguous.push({ string: str, nearClusterIndices: near });
            }
        }
    }

    return { clusters: clusters, ambiguous: ambiguous };
}

// Export for use in other modules and testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        velocityStats,
        parseTimeOfDay,
        splitByTimeGap,
        clusterStringsByVelocity,
        DEFAULT_STRING_SD
    };
}
