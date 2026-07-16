/**
 * tests/test-crowd-data.js — Unit tests for the Crowd Data Warehouse
 * pure helpers (CSV building, filtering, sorting, formatting).
 * Run with: node tests/test-crowd-data.js
 */

const crowd = require('../js/crowd-data.js');

let passed = 0;
let failed = 0;

function assert(condition, testName, details) {
    if (condition) {
        console.log(`  ✓ ${testName}`);
        passed++;
    } else {
        console.log(`  ✗ ${testName}`);
        if (details) console.log(`    ${details}`);
        failed++;
    }
}

// ─── CSV escaping ───────────────────────────────────────────────

console.log('\nCSV escaping:');

assert(crowd.crowdCsvEscape('plain') === 'plain', 'plain value passes through');
assert(crowd.crowdCsvEscape(null) === '', 'null becomes empty string');
assert(crowd.crowdCsvEscape(undefined) === '', 'undefined becomes empty string');
assert(crowd.crowdCsvEscape(0) === '0', 'numeric zero is preserved');
assert(crowd.crowdCsvEscape('a,b') === '"a,b"', 'comma is quoted');
assert(crowd.crowdCsvEscape('say "hi"') === '"say ""hi"""', 'quotes are doubled and wrapped');
assert(crowd.crowdCsvEscape('line1\nline2') === '"line1\nline2"', 'newline is quoted');
assert(crowd.crowdCsvEscape('2800;2810;2795') === '2800;2810;2795', 'semicolon shot list needs no quoting');

// ─── CSV building ───────────────────────────────────────────────

console.log('\nCSV building:');

const cols = [
    { key: 'caliber', label: 'Caliber', type: 'text' },
    { key: 'avg_fps', label: 'Avg', type: 'num' }
];
const csv = crowd.crowdBuildCsv(cols, [
    { caliber: '6.5 CM', avg_fps: 2801.5 },
    { caliber: '.308, Match', avg_fps: null }
]);
const lines = csv.split('\r\n');

assert(lines[0] === 'caliber,avg_fps', 'header row uses column keys');
assert(lines[1] === '6.5 CM,2801.5', 'data row renders values');
assert(lines[2] === '".308, Match",', 'comma value quoted, null empty');
assert(csv.endsWith('\r\n'), 'CSV ends with CRLF');

// ─── Filtering ──────────────────────────────────────────────────

console.log('\nFiltering:');

const rows = [
    { shooter_key: 'shooter_aaa', caliber: '6.5 CM', twist_rate: '1:8', load_name: 'Hornady 140 ELD-M' },
    { shooter_key: 'shooter_bbb', caliber: '.308', twist_rate: '1:10', load_name: 'FGMM 175' },
    { shooter_key: 'shooter_aaa', caliber: '6.5 CM', twist_rate: null, load_name: null }
];

assert(crowd.crowdApplyFilters(rows, {}, '').length === 3, 'no filters returns all rows');
assert(crowd.crowdApplyFilters(rows, { caliber: '6.5 CM' }, '').length === 2, 'caliber filter matches exact value');
assert(crowd.crowdApplyFilters(rows, { caliber: '6.5 CM', twist_rate: '1:8' }, '').length === 1, 'filters combine with AND');
assert(crowd.crowdApplyFilters(rows, { twist_rate: crowd.CROWD_BLANK }, '').length === 1, 'blank token matches null cells');
assert(crowd.crowdApplyFilters(rows, {}, 'fgmm').length === 1, 'search is case-insensitive substring');
assert(crowd.crowdApplyFilters(rows, { caliber: '.308' }, 'hornady').length === 0, 'search combines with filters');
assert(crowd.crowdApplyFilters(rows, { caliber: '' }, '').length === 3, 'empty filter value means All');

// ─── Sorting ────────────────────────────────────────────────────

console.log('\nSorting:');

const numRows = [
    { es_fps: 30 }, { es_fps: null }, { es_fps: 12 }, { es_fps: 45.5 }
];
const ascSorted = crowd.crowdSortRows(numRows, 'es_fps', 'asc', 'num');
assert(ascSorted[0].es_fps === 12 && ascSorted[2].es_fps === 45.5, 'numeric ascending sort');
assert(ascSorted[3].es_fps === null, 'blanks sort last (asc)');

const descSorted = crowd.crowdSortRows(numRows, 'es_fps', 'desc', 'num');
assert(descSorted[0].es_fps === 45.5, 'numeric descending sort');
assert(descSorted[3].es_fps === null, 'blanks sort last (desc)');

const dateRows = [
    { string_date: '2026-07-01T10:00:00Z' },
    { string_date: '2026-06-15T09:00:00Z' },
    { string_date: null }
];
const dateSorted = crowd.crowdSortRows(dateRows, 'string_date', 'desc', 'date');
assert(dateSorted[0].string_date.indexOf('2026-07-01') === 0, 'ISO date descending sort');
assert(dateSorted[2].string_date === null, 'null dates sort last');

assert(numRows[0].es_fps === 30, 'sort does not mutate the input array');

// ─── Cell formatting ────────────────────────────────────────────

console.log('\nCell formatting:');

assert(crowd.crowdFormatCell('2026-07-01T10:00:00Z', { type: 'date' }) === '2026-07-01', 'date shows YYYY-MM-DD');
assert(crowd.crowdFormatCell(null, { type: 'num' }) === '', 'null shows empty');
assert(crowd.crowdFormatCell('2800;2810;2795;2802;2799', { type: 'text', truncate: 10 }) === '2800;2810;…', 'long values truncate with ellipsis');
assert(crowd.crowdFormatCell('short', { type: 'text', truncate: 10 }) === 'short', 'short values untouched');

// ─── Distinct values ────────────────────────────────────────────

console.log('\nDistinct values:');

const distinct = crowd.crowdDistinctValues(rows, 'caliber');
assert(distinct.values.length === 2, 'two distinct calibers');
assert(distinct.values[0] === '.308', 'values sorted');
assert(distinct.hasBlank === false, 'no blank calibers');
assert(crowd.crowdDistinctValues(rows, 'twist_rate').hasBlank === true, 'blank twist detected');

// ─── Column registry sanity ─────────────────────────────────────

console.log('\nColumn registry:');

const keys = {};
let dupes = false;
for (const col of crowd.CROWD_COLUMNS) {
    if (keys[col.key]) dupes = true;
    keys[col.key] = true;
}
assert(!dupes, 'no duplicate column keys');
assert(keys['shooter_key'] && keys['caliber'] && keys['twist_rate'] &&
    keys['muzzle_device'] && keys['barrel_spec'] && keys['load_name'] &&
    keys['avg_fps'] && keys['sd_fps'] && keys['es_fps'] && keys['shot_velocities'] &&
    keys['group_size_moa'] && keys['group_size_inches'] && keys['distance_yards'],
    'required export fields present');
assert(!keys['user_id'] && !keys['email'] && !keys['notes'] && !keys['sheet_name'],
    'no identifying fields in the export');

// ─── Summary ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
