/**
 * labradar-import.js — PURE LabRadar CSV parser (§2.2).
 * Same discipline as garmin-import.js: find structure by CONTENT,
 * never by position; bad rows become warnings, unrecognizable input
 * throws a descriptive Error; NEVER guess. Node-tested with real-
 * format fixtures: tests/test-labradar-import.js.
 *
 * LabRadar SD-card series reports ("… Report.csv") are semicolon-
 * delimited (comma in some locales), with a metadata block
 * ("Device ID", "Series No", "Units velocity", "Stats - …") followed
 * by a shot table whose header contains "Shot ID" and "V0". V0 is the
 * muzzle velocity. Emits the SAME session shape as the ShotView
 * parser — {source, name, date, shots:[{shot, fps, time}], reported,
 * warnings} — so velocity-stats, chrono assignment, dedup, and steel
 * reconciliation all plug in unchanged.
 */

var LABRADAR_MPS_TO_FPS = 3.280839895;

/** Delimiter detection: LabRadar uses ';' (most locales) or ','. */
function labradarDelimiter(text) {
    var head = String(text).slice(0, 2000);
    var semis = (head.match(/;/g) || []).length;
    var commas = (head.match(/,/g) || []).length;
    return semis >= commas ? ';' : ',';
}

function _labClean(cell) {
    return String(cell == null ? '' : cell)
        .replace(/[   ﻿]/g, ' ')
        .trim();
}

/** Parse a LabRadar numeric cell (handles decimal comma). */
function labradarNumber(cell) {
    var s = _labClean(cell);
    if (!s) return null;
    if (s.indexOf(',') !== -1 && s.indexOf('.') === -1) s = s.replace(',', '.');
    var v = parseFloat(s);
    return isFinite(v) ? v : null;
}

/** "25.07.2026" or "07/25/2026" → ISO date (best effort, null if not). */
function labradarDate(cell) {
    var s = _labClean(cell);
    var m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/); // dd.mm.yyyy
    if (m) return m[3] + '-' + m[2] + '-' + m[1];
    m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);     // mm/dd/yyyy
    if (m) return m[3] + '-' + m[1] + '-' + m[2];
    return null;
}

/**
 * Parse one LabRadar series report.
 * @param {string} text - raw CSV text
 * @param {string} [filename] - for the session name fallback
 * @returns {{source, name, date, shots, reported, warnings}}
 */
function parseLabRadarCSV(text, filename) {
    if (!text || !String(text).trim()) {
        throw new Error('The file is empty.');
    }
    var delim = labradarDelimiter(text);
    var lines = String(text).split(/\r\n|\n|\r/);
    var rows = lines.map(function (line) {
        return line.split(delim).map(_labClean);
    });

    var meta = {};
    var headerIdx = -1;
    var shotCol = -1, v0Col = -1, timeCol = -1, dateCol = -1;

    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        // metadata block: "Key;Value"
        if (row.length >= 2 && row[0] && row[1] && headerIdx === -1) {
            meta[row[0].toLowerCase()] = row[1];
        }
        // the shot-table header, found by content
        var lower = row.map(function (c) { return c.toLowerCase(); });
        var si = -1, vi = -1;
        for (var c = 0; c < lower.length; c++) {
            if (si === -1 && /^shot( id)?$/.test(lower[c])) si = c;
            if (vi === -1 && (lower[c] === 'v0' || /muzzle vel/.test(lower[c]))) vi = c;
            if (/^time/.test(lower[c])) timeCol = c;
            if (/^date/.test(lower[c])) dateCol = c;
        }
        if (si !== -1 && vi !== -1) {
            headerIdx = i;
            shotCol = si;
            v0Col = vi;
            break;
        }
    }

    if (headerIdx === -1) {
        throw new Error('Not a LabRadar report — no shot table found (expected a header with "Shot ID" and "V0").');
    }

    // Units: fps as-is; m/s converts (documented, not a guess)
    var unitsRaw = (meta['units velocity'] || 'fps').toLowerCase();
    var isMps = /m\/s|mps|meter/.test(unitsRaw);
    var warnings = [];
    if (isMps) warnings.push('Velocities were recorded in m/s — converted to fps.');

    var shots = [];
    var date = null;
    for (var r = headerIdx + 1; r < rows.length; r++) {
        var line = rows[r];
        if (!line[shotCol]) continue;
        var shotNo = labradarNumber(line[shotCol]);
        if (shotNo === null || shotNo % 1 !== 0) continue; // stats/blank rows
        var fps = labradarNumber(line[v0Col]);
        if (fps === null || fps <= 0) {
            warnings.push('Shot ' + shotNo + ' had no readable velocity — skipped.');
            continue;
        }
        if (isMps) fps = Math.round(fps * LABRADAR_MPS_TO_FPS * 100) / 100;
        if (!date && dateCol !== -1 && line[dateCol]) date = labradarDate(line[dateCol]);
        shots.push({
            shot: shotNo,
            fps: fps,
            time: timeCol !== -1 ? (line[timeCol] || null) : null
        });
    }

    if (!shots.length) {
        throw new Error('The LabRadar report has a shot table but no readable shots.');
    }

    // LabRadar's own stats (for the reported-vs-recomputed cross-check)
    var reported = {};
    function statNum(key) {
        for (var k in meta) {
            if (meta.hasOwnProperty(k) && k.indexOf(key) !== -1) {
                var v = labradarNumber(meta[k]);
                if (v !== null) return isMps ? Math.round(v * LABRADAR_MPS_TO_FPS * 100) / 100 : v;
            }
        }
        return null;
    }
    reported.avg = statNum('average');
    reported.sd = statNum('std. dev');
    reported.es = statNum('ext. spread');

    var series = meta['series no'] ? 'Series ' + meta['series no'] : null;
    return {
        source: 'labradar_csv',
        name: series || (filename ? String(filename).replace(/\.csv$/i, '') : 'LabRadar series'),
        date: date,
        shots: shots,
        reported: reported,
        warnings: warnings
    };
}

/** Cheap sniff: does this text look like a LabRadar report at all? */
function looksLikeLabRadar(text) {
    var head = String(text || '').slice(0, 1500).toLowerCase();
    return head.indexOf('lbr') !== -1 || head.indexOf('labradar') !== -1 ||
        (head.indexOf('series no') !== -1 && head.indexOf('shot id') !== -1) ||
        head.indexOf('shot id') !== -1;
}

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        parseLabRadarCSV: parseLabRadarCSV,
        looksLikeLabRadar: looksLikeLabRadar,
        labradarDelimiter: labradarDelimiter,
        labradarNumber: labradarNumber,
        labradarDate: labradarDate
    };
}
