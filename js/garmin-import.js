/**
 * garmin-import.js — Garmin Xero ShotView export parser (PURE functions).
 *
 * Parses ShotView exports into normalized session objects:
 *   { source, name, date, shots: [{shot, fps, time}], reported: {avg, sd, es}, warnings }
 *
 * Handles the known format quirks of real ShotView files:
 *   - title row above the header (header is found by CONTENT, never row position)
 *   - all cells stored as text, including velocities (parseFloat required)
 *   - narrow no-break space U+202F (and friends) inside Time and DATE values
 *   - summary/junk rows (AVERAGE SPEED, STD DEV, SPREAD, SESSION NOTE, DATE)
 *     — only rows with a numeric shot number are kept as shots
 *   - sheet names carry the session date-time: "Rifle sessio_2026-06-26_15-07_1"
 *
 * If a file does not look like a ShotView export, parsing throws a descriptive
 * Error — it never guesses. Garmin's own summary stats (average/SD/spread) are
 * captured in `reported` so callers can cross-check recomputed values.
 *
 * No DOM, no storage, no library dependencies: the XLSX path takes row arrays
 * (produced by SheetJS in the browser). Node-testable like calculations.js.
 */

/**
 * Replace exotic Unicode spaces with plain spaces, collapse runs, and trim.
 * The character class below contains LITERAL invisible characters:
 * U+00A0, U+2000-200B, U+202F (ShotView's Time separator), U+205F, U+3000, U+FEFF.
 */
function cleanCellText(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/[  -​  　﻿]/g, ' ')
        .replace(/ {2,}/g, ' ')
        .trim();
}

/**
 * True if the cell holds a whole number (a shot number). "3" → true,
 * "AVERAGE SPEED" / "" / "2743.4" → false.
 */
function isShotNumberCell(value) {
    return /^\d+$/.test(cleanCellText(value));
}

/**
 * Find the header row by content: a row containing both a "#" (or "shot")
 * column and a "speed" column. Returns {rowIndex, cols} or null.
 * cols maps {shot, speed, time, cleanBore, coldBore, notes} → column index.
 */
function findHeaderRow(rows) {
    for (var r = 0; r < rows.length; r++) {
        var row = rows[r] || [];
        var cols = { shot: -1, speed: -1, time: -1, cleanBore: -1, coldBore: -1, notes: -1 };
        for (var c = 0; c < row.length; c++) {
            var cell = cleanCellText(row[c]).toLowerCase();
            if (!cell) continue;
            if (cols.shot === -1 && (cell === '#' || cell === 'shot' || cell === 'shot #')) cols.shot = c;
            else if (cols.speed === -1 && cell.indexOf('speed') === 0) cols.speed = c;
            else if (cols.time === -1 && cell === 'time') cols.time = c;
            else if (cols.cleanBore === -1 && cell === 'clean bore') cols.cleanBore = c;
            else if (cols.coldBore === -1 && cell === 'cold bore') cols.coldBore = c;
            else if (cols.notes === -1 && cell.indexOf('note') !== -1) cols.notes = c;
        }
        if (cols.shot !== -1 && cols.speed !== -1) {
            return { rowIndex: r, cols: cols };
        }
    }
    return null;
}

/**
 * Parse "Rifle sessio_2026-06-26_15-07_1" → "2026-06-26T15:07" (or null).
 */
function parseSheetNameDate(name) {
    var m = /(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})/.exec(cleanCellText(name));
    if (!m) return null;
    return m[1] + 'T' + m[2] + ':' + m[3];
}

/**
 * Parse a ShotView DATE summary value like "June 26, 2026 at 3:07 PM"
 * → ISO string, or null if unparseable.
 */
function parseSummaryDate(text) {
    var cleaned = cleanCellText(text).replace(/\bat\b/i, '');
    var d = new Date(cleaned);
    if (isNaN(d.getTime())) return null;
    // Local wall-clock ISO (no timezone shift) — range sessions are local events
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/**
 * Core parser: one session from one grid of rows (one sheet, or one CSV file).
 *
 * @param {Array<Array>} rows - row arrays; cells may be strings/numbers/null
 * @param {Object} [meta] - { name, source } for labeling and date fallback
 * @returns {Object} session { source, name, date, shots, reported, warnings }
 * @throws {Error} descriptive error if this is not a ShotView shot table
 */
function parseSheetRows(rows, meta) {
    meta = meta || {};
    if (!rows || !rows.length) {
        throw new Error('The file is empty — expected a Garmin ShotView export.');
    }

    var header = findHeaderRow(rows);
    if (!header) {
        throw new Error(
            'Could not find a ShotView header row (a row with "#" and "Speed" columns). ' +
            'This does not look like a Garmin ShotView export.'
        );
    }

    var shots = [];
    var warnings = [];
    var reported = { avg: null, sd: null, es: null };
    var summaryDate = null;

    for (var r = header.rowIndex + 1; r < rows.length; r++) {
        var row = rows[r] || [];
        var first = cleanCellText(row[header.cols.shot]);

        if (isShotNumberCell(first)) {
            var rawSpeed = cleanCellText(row[header.cols.speed]);
            var fps = parseFloat(rawSpeed);
            if (!isFinite(fps) || fps <= 0) {
                warnings.push('Shot ' + first + ' skipped: speed "' + rawSpeed + '" is not a number.');
                continue;
            }
            shots.push({
                shot: parseInt(first, 10),
                fps: fps,
                time: header.cols.time !== -1 ? cleanCellText(row[header.cols.time]) || null : null
            });
            continue;
        }

        // Summary / junk rows: capture Garmin's own stats, ignore the rest
        var label = first.toUpperCase();
        var next = parseFloat(cleanCellText(row[header.cols.shot + 1]));
        if (label === 'AVERAGE SPEED' && isFinite(next)) reported.avg = next;
        else if (label === 'STD DEV' && isFinite(next)) reported.sd = next;
        else if (label === 'SPREAD' && isFinite(next)) reported.es = next;
        else if (label === 'DATE') summaryDate = parseSummaryDate(row[header.cols.shot + 1]);
    }

    if (!shots.length) {
        throw new Error(
            'Found a ShotView header but no shot rows (rows whose "#" column is a number). ' +
            'The export may be empty or in an unexpected format.'
        );
    }

    return {
        source: meta.source || 'shotview',
        name: cleanCellText(meta.name) || null,
        date: summaryDate || parseSheetNameDate(meta.name || '') || null,
        shots: shots,
        reported: reported,
        warnings: warnings
    };
}

/**
 * Split one CSV line into cells (handles quoted cells with commas and "" escapes).
 */
function splitCsvLine(line) {
    var cells = [];
    var cur = '';
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
            else if (ch === '"') { inQuotes = false; }
            else { cur += ch; }
        } else {
            if (ch === '"') { inQuotes = true; }
            else if (ch === ',') { cells.push(cur); cur = ''; }
            else { cur += ch; }
        }
    }
    cells.push(cur);
    return cells;
}

/**
 * Parse a single-session ShotView CSV export.
 *
 * @param {string} text - raw file text
 * @param {string} [filename] - used for labeling/date fallback
 * @returns {Object} one session (see parseSheetRows)
 * @throws {Error} if the text is not a ShotView export
 */
function parseShotViewCSV(text, filename) {
    if (typeof text !== 'string' || !text.trim()) {
        throw new Error('The CSV file is empty — expected a Garmin ShotView export.');
    }
    var rows = text.split(/\r\n|\n|\r/).map(splitCsvLine);
    return parseSheetRows(rows, { name: filename || null, source: 'garmin_csv' });
}

/**
 * Parse a multi-session ShotView XLSX from pre-extracted sheets.
 *
 * @param {Array<{name: string, rows: Array<Array>}>} sheets
 * @returns {Array<Object>} one session per parseable sheet
 * @throws {Error} if NO sheet parses (per-sheet failures become warnings)
 */
function parseShotViewSheets(sheets) {
    if (!sheets || !sheets.length) {
        throw new Error('The workbook has no sheets — expected a Garmin ShotView export.');
    }
    var sessions = [];
    var failures = [];
    for (var i = 0; i < sheets.length; i++) {
        try {
            var session = parseSheetRows(sheets[i].rows, {
                name: sheets[i].name,
                source: 'garmin_xlsx'
            });
            sessions.push(session);
        } catch (e) {
            failures.push('Sheet "' + sheets[i].name + '": ' + e.message);
        }
    }
    if (!sessions.length) {
        throw new Error('No sheet in this workbook looks like a ShotView session.\n' + failures.join('\n'));
    }
    for (var f = 0; f < failures.length; f++) {
        sessions[0].warnings.push(failures[f]);
    }
    return sessions;
}

/**
 * Browser-only convenience: SheetJS workbook → sessions.
 * Requires the global XLSX (loaded from the pinned CDN in index.html).
 */
function parseShotViewWorkbook(workbook) {
    if (typeof XLSX === 'undefined') {
        throw new Error('The spreadsheet library (SheetJS) failed to load. Check your connection and reload.');
    }
    var sheets = workbook.SheetNames.map(function (name) {
        return {
            name: name,
            rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
                header: 1, defval: null, blankrows: true, raw: false
            })
        };
    });
    return parseShotViewSheets(sheets);
}

// Export for Node unit tests (same pattern as calculations.js)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        cleanCellText,
        isShotNumberCell,
        findHeaderRow,
        parseSheetNameDate,
        parseSummaryDate,
        parseSheetRows,
        splitCsvLine,
        parseShotViewCSV,
        parseShotViewSheets
    };
}
