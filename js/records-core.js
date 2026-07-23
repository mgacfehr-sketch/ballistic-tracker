/**
 * records-core.js — PURE computed surfaces for Data & Records (§2.7).
 * Node-tested: tests/test-records-core.js.
 *
 * Suppressor shift and lot drift are NOT standalone features — they
 * are computed surfaces here. v2.3 analytics group by
 * (rifle, SUPPRESSOR) combination: "with Nomad: 0.4 L, −24 fps ·
 * with Ultra 9: 0.6 L, −38 fps". Bare = suppressor_id null.
 */

/**
 * Per-can POI + velocity shift vs bare, from tagged records.
 *
 * sessions: [{suppressorId, results:{atzElevationMOA, atzWindageMOA}}]
 * strings:  [{suppressorId, avgFps, shots:[..]}]  (velocity strings)
 * suppressors: [{id, name}]
 *
 * → [{suppressorId, name, nSessions, nStrings,
 *     poi: {elevMOA, windMOA} | null,     // can minus bare (mean ATZ delta)
 *     velocityDelta: fps | null }]        // can minus bare (weighted avg)
 * Cans with no tagged data are omitted. Returns [] when there is no
 * bare baseline (nothing honest to compare against).
 */
function suppressorShiftByCan(sessions, strings, suppressors) {
    sessions = sessions || [];
    strings = strings || [];
    suppressors = suppressors || [];

    function poiStats(list) {
        var n = 0, e = 0, w = 0;
        list.forEach(function (s) {
            if (s && s.results && typeof s.results.atzElevationMOA === 'number') {
                n++;
                e += s.results.atzElevationMOA;
                w += s.results.atzWindageMOA || 0;
            }
        });
        return n ? { n: n, elev: e / n, wind: w / n } : null;
    }
    function velStats(list) {
        var shots = 0, sum = 0;
        list.forEach(function (s) {
            if (s && typeof s.avgFps === 'number') {
                var w = s.shots && s.shots.length ? s.shots.length : 1;
                shots += w;
                sum += s.avgFps * w;
            }
        });
        return shots ? { n: shots, avg: sum / shots } : null;
    }

    var barePoi = poiStats(sessions.filter(function (s) { return !s.suppressorId; }));
    var bareVel = velStats(strings.filter(function (s) { return !s.suppressorId; }));
    if (!barePoi && !bareVel) return [];

    var out = [];
    suppressors.forEach(function (can) {
        var canSessions = sessions.filter(function (s) { return s.suppressorId === can.id; });
        var canStrings = strings.filter(function (s) { return s.suppressorId === can.id; });
        var canPoi = poiStats(canSessions);
        var canVel = velStats(canStrings);
        if (!canPoi && !canVel) return;
        out.push({
            suppressorId: can.id,
            name: can.name,
            nSessions: canPoi ? canPoi.n : 0,
            nStrings: canStrings.length,
            poi: (canPoi && barePoi) ? {
                elevMOA: Math.round((canPoi.elev - barePoi.elev) * 100) / 100,
                windMOA: Math.round((canPoi.wind - barePoi.wind) * 100) / 100
            } : null,
            velocityDelta: (canVel && bareVel)
                ? Math.round(canVel.avg - bareVel.avg) : null
        });
    });
    return out;
}

/** One-line shift text: "with Nomad 30: 0.6 low · 0.4 L · −24 fps". */
function suppressorShiftLine(shift) {
    var bits = [];
    if (shift.poi) {
        if (Math.abs(shift.poi.elevMOA) >= 0.1) {
            bits.push(Math.abs(shift.poi.elevMOA) + ' ' + (shift.poi.elevMOA > 0 ? 'high' : 'low'));
        }
        if (Math.abs(shift.poi.windMOA) >= 0.1) {
            bits.push(Math.abs(shift.poi.windMOA) + ' ' + (shift.poi.windMOA > 0 ? 'R' : 'L'));
        }
    }
    if (shift.velocityDelta !== null && Math.abs(shift.velocityDelta) >= 5) {
        bits.push((shift.velocityDelta > 0 ? '+' : '−') + Math.abs(shift.velocityDelta) + ' fps');
    }
    return 'with ' + shift.name + ': ' + (bits.length ? bits.join(' · ') : 'no meaningful shift');
}

/** CSV encoding (RFC-4180 quoting). rows = array of objects. */
function csvEncode(rows, columns) {
    columns = columns || (rows.length ? Object.keys(rows[0]) : []);
    function cell(v) {
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') v = JSON.stringify(v);
        v = String(v);
        return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }
    var lines = [columns.map(cell).join(',')];
    rows.forEach(function (r) {
        lines.push(columns.map(function (c) { return cell(r[c]); }).join(','));
    });
    return lines.join('\r\n');
}

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        suppressorShiftByCan: suppressorShiftByCan,
        suppressorShiftLine: suppressorShiftLine,
        csvEncode: csvEncode
    };
}
