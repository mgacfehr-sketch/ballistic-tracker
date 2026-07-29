/**
 * test-export-parity.js — overnight run #2, item 3. "Export everything"
 * (js/data-export.js) must include fact_events, attachment_vault
 * metadata, and validation statuses alongside the pre-existing types,
 * and the round trip (export -> CSV text -> parse -> reconcile counts)
 * must reproduce the live projection exactly — no silent row loss
 * through the CSV encode/decode boundary.
 *
 * Run: node tests/test-export-parity.js
 */

var passed = 0;
var failed = 0;
function check(label, actual, expected) {
    var ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

var DataExport = require('../js/data-export.js');
var csvEncode = require('../js/records-core.js').csvEncode;

/** Minimal RFC-4180 decoder -- test-only, mirrors csvEncode's own
 *  quoting rules (quoted fields, doubled "" escapes, \r\n line breaks).
 *  Not shipped in app code: the app never needs to parse its own export
 *  back, only this test does, to prove fidelity. */
function csvDecode(text) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var i = 0;
    function endField() { row.push(field); field = ''; }
    function endRow() { endField(); rows.push(row); row = []; }
    while (i < text.length) {
        var c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
                inQuotes = false; i++; continue;
            }
            field += c; i++; continue;
        }
        if (c === '"') { inQuotes = true; i++; continue; }
        if (c === ',') { endField(); i++; continue; }
        if (c === '\r' && text[i + 1] === '\n') { endRow(); i += 2; continue; }
        if (c === '\n') { endRow(); i++; continue; }
        field += c; i++;
    }
    if (field.length || row.length) endRow();
    var header = rows.shift() || [];
    return rows.map(function (r) {
        var obj = {};
        header.forEach(function (h, idx) { obj[h] = r[idx]; });
        return obj;
    });
}

/** A fake db exercising every account-wide getter data-export.js's
 *  TYPES array calls, each returning a fixed, known row count -- the
 *  "live projection" this test reconciles against. */
function fakeDb() {
    var rifles = [{ id: 'r1', name: 'Rifle One' }, { id: 'r2', name: 'Rifle Two' }];
    var byRifle = {
        r1: { checks: [{ id: 'c1', rifleId: 'r1', step: 'zero', result: 'ok', createdAt: '2026-01-01T00:00:00Z' }],
              epochs: [{ id: 'e1', rifleId: 'r1', kind: 'lot', value: 'LOT-A', startedAt: '2026-01-01T00:00:00Z' }] },
        r2: { checks: [], epochs: [] }
    };
    return {
        getAllRifles: function () { return Promise.resolve(rifles); },
        getAllFactEvents: function () { return Promise.resolve([
            { id: 'f1', eventType: 'zero', eligibility: 'eligible', eligibilityReason: null },
            { id: 'f2', eventType: 'velocity', eligibility: 'excluded', eligibilityReason: 'outlier' },
            { id: 'f3', eventType: 'distance_impact', eligibility: 'eligible', eligibilityReason: null }
        ]); },
        getAllAttachmentVault: function () { return Promise.resolve([
            { id: 'a1', kind: 'session_image', status: 'associated' },
            { id: 'a2', kind: 'garmin_csv', status: 'unresolved' }
        ]); },
        getTroubleshootingChecksByRifle: function (id) { return Promise.resolve(byRifle[id].checks); },
        getConfigEpochsByRifle: function (id) { return Promise.resolve(byRifle[id].epochs); }
    };
}

console.log('\n--- TYPES array includes the three new export types ---');
function step1() {
    var keys = DataExport.TYPES.map(function (t) { return t.key; });
    check('fact-events is a registered export type', keys.indexOf('fact-events') !== -1, true);
    check('attachment-vault is a registered export type', keys.indexOf('attachment-vault') !== -1, true);
    check('validation-statuses is a registered export type', keys.indexOf('validation-statuses') !== -1, true);
    return Promise.resolve();
}

console.log('\n--- fetch-or-empty-array degrade when the db lacks the new getters (unmigrated database) ---');
function step2() {
    var barebones = { getAllRifles: function () { return Promise.resolve([]); } };
    var factType = DataExport.TYPES.filter(function (t) { return t.key === 'fact-events'; })[0];
    var vaultType = DataExport.TYPES.filter(function (t) { return t.key === 'attachment-vault'; })[0];
    var vsType = DataExport.TYPES.filter(function (t) { return t.key === 'validation-statuses'; })[0];
    return Promise.all([factType.fetch(barebones), vaultType.fetch(barebones), vsType.fetch(barebones)])
        .then(function (results) {
            check('fact-events degrades to [] without getAllFactEvents', results[0], []);
            check('attachment-vault degrades to [] without getAllAttachmentVault', results[1], []);
            check('validation-statuses degrades to [] with no rifles', results[2], []);
        });
}

console.log('\n--- round trip: export -> CSV text -> parse -> reconcile counts against the live db ---');
function step3() {
    var db = fakeDb();

    function roundTrip(key, expectedCount, idCol) {
        var type = DataExport.TYPES.filter(function (t) { return t.key === key; })[0];
        return type.fetch(db).then(function (data) {
            check(key + ': live projection has the expected row count', (data || []).length, expectedCount);
            var csv = csvEncode(data || []);
            var parsed = csvDecode(csv);
            check(key + ': CSV round trip preserves row count exactly', parsed.length, (data || []).length);
            if (data.length) {
                check(key + ': CSV round trip preserves the identifying column on every row',
                    parsed.every(function (r, i) { return r[idCol] === String(data[i][idCol]); }), true);
            }
        });
    }

    return roundTrip('fact-events', 3, 'id')
        .then(function () { return roundTrip('attachment-vault', 2, 'id'); })
        .then(function () { return roundTrip('validation-statuses', 2, 'rifleId'); });
}

console.log('\n--- validation-statuses reconciles a troubleshooting hold and a config epoch by hand ---');
function step4() {
    var db = fakeDb();
    var vsType = DataExport.TYPES.filter(function (t) { return t.key === 'validation-statuses'; })[0];
    return vsType.fetch(db).then(function (rows) {
        var r1 = rows.filter(function (r) { return r.rifleId === 'r1'; })[0];
        var r2 = rows.filter(function (r) { return r.rifleId === 'r2'; })[0];
        check('rifle with an "ok" zero check (no alarm) is NOT in a hold', r1.troubleshootingHold, false);
        check('rifle with an "ok" zero check carries its check count', r1.troubleshootingCheckCount, 1);
        check('rifle with a lot epoch carries the epoch kind/value', r1.lastConfigEpochKind === 'lot' && r1.lastConfigEpochValue === 'LOT-A', true);
        check('rifle with no history at all reports zero counts, not nulls-as-errors', r2.troubleshootingCheckCount === 0 && r2.configEpochCount === 0, true);
    });
}

step1().then(step2).then(step3).then(step4).then(function () {
    console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
    process.exit(failed ? 1 : 0);
}).catch(function (e) {
    console.log('\nFATAL: ' + e.stack);
    process.exit(1);
});
