/**
 * test-sync-queue.js — pure core of the offline write queue.
 * Run: node tests/test-sync-queue.js
 */

var passed = 0;
var failed = 0;

function check(label, actual, expected) {
    var ok = actual === expected;
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

var S = require('../js/sync-queue.js').SyncQueueCore;

console.log('\nisNetworkError (queue vs rethrow):');
check('browser says offline → network', S.isNetworkError(new Error('anything'), false), true);
check('TypeError (fetch rejection) → network', S.isNetworkError(new TypeError('Failed to fetch'), true), true);
check('"Failed to fetch" message → network', S.isNetworkError(new Error('Failed to fetch'), true), true);
check('"network error" message → network', S.isNetworkError(new Error('A network error occurred'), true), true);
check('"Load failed" (Safari) → network', S.isNetworkError(new Error('Load failed'), true), true);
check('timeout → network', S.isNetworkError(new Error('Request timeout'), true), true);
check('RLS violation → server rejection', S.isNetworkError(new Error('new row violates row-level security policy'), true), false);
check('constraint violation → server rejection', S.isNetworkError(new Error('duplicate key value violates unique constraint'), true), false);
check('null error, online → not network', S.isNetworkError(null, true), false);

console.log('\nFN_TABLE / READ_TABLE (allowlist shape):');
check('addSession queueable', S.FN_TABLE.addSession, 'sessions');
check('addZeroEvent queueable', S.FN_TABLE.addZeroEvent, 'zero_events');
check('addSteelString queueable', S.FN_TABLE.addSteelString, 'steel_strings');
check('addTruingEvent queueable', S.FN_TABLE.addTruingEvent, 'truing_events');
check('deletes NOT queueable', S.FN_TABLE.deleteSession, undefined);
check('rifle creation NOT queueable (online-only by design)', S.FN_TABLE.addRifle, undefined);
check('every queueable table has a read-merge entry or is write-only',
    Object.keys(S.FN_TABLE).every(function (fn) {
        var table = S.FN_TABLE[fn];
        return Object.keys(S.READ_TABLE).some(function (r) { return S.READ_TABLE[r].table === table; }) ||
            table === 'cleaning_logs'; // cleaning log list reads via barrel, merged in step 10
    }), true);
check('session reads merge by rifleId', S.READ_TABLE.getSessionsByRifle.filter, 'rifleId');
check('steel shots merge by stringId', S.READ_TABLE.getSteelShotsByString.filter, 'stringId');

console.log('\nmergePending (client wins, flagged, front-ordered):');
var server = [{ id: 'a', v: 'server-a' }, { id: 'b', v: 'server-b' }];
var pending = [{ id: 'b', v: 'local-b' }, { id: 'c', v: 'local-c' }];
var merged = S.mergePending(server, pending);
check('pending rows sort first', merged[0].id, 'b');
check('queued copy wins on id collision', merged[0].v, 'local-b');
check('collision leaves one copy', merged.filter(function (r) { return r.id === 'b'; }).length, 1);
check('pending rows flagged', merged[0]._pending, true);
check('new pending row included', merged.some(function (r) { return r.id === 'c' && r._pending; }), true);
check('server-only row kept, unflagged', merged.filter(function (r) { return r.id === 'a'; })[0]._pending, undefined);
check('total count right', merged.length, 3);
check('no pending → server rows untouched (same array)', S.mergePending(server, []), server);
check('null server rows tolerated', S.mergePending(null, pending).length, 2);
check('input pending objects not mutated', pending[0]._pending, undefined);

console.log('\nfilterPending (read-call scoping):');
var rows = [{ id: '1', rifleId: 'r1' }, { id: '2', rifleId: 'r2' }, { id: '3', rifleId: 'r1' }];
check('scopes to the rifle', S.filterPending(rows, 'rifleId', 'r1').length, 2);
check('no filter field → all rows', S.filterPending(rows, null, undefined).length, 3);
check('undefined value with a filter field → all rows (getAll*)', S.filterPending(rows, 'rifleId', undefined).length, 3);
check('no match → empty', S.filterPending(rows, 'rifleId', 'r9').length, 0);

console.log('\n' + '═'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
