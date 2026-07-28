/**
 * test-failure-injection.js — Phase A durability floor (Amendment 1
 * A16): "PROVEN never voluntarily discards acknowledged data... detects
 * quota/write failure BEFORE acknowledging a save... [auth-expiry]
 * offline capture continues bound to the signed-in account, quarantined
 * until safe upload."
 *
 * A "right-sized failure-injection suite" per Amendment 1 Part B. This
 * codebase ships zero build tools and no browser test runner (CLAUDE.md;
 * see tests/test-screen-nav.js for the established precedent), so real
 * IndexedDB/crash/reload simulation isn't available here. This suite
 * combines:
 *   (a) PURE-LOGIC proofs against SyncQueueCore's real, exported
 *       decision functions (not reimplemented/mocked) for the parts of
 *       each scenario that are pure decisions — network vs. server
 *       error classification, account-quarantine, merge/resume
 *       semantics; and
 *   (b) SOURCE-PRESENCE proofs (the same technique test-screen-nav.js
 *       and test-friendly-error-usage.js already use) confirming the
 *       actual browser module (js/sync-queue.js, js/app.js) wires those
 *       decisions into the write/flush/logout paths that matter — so a
 *       future edit that quietly removes the wiring, while leaving the
 *       pure helper intact, still fails this suite.
 *
 * Six scenarios, per Amendment 1 Part B: crash, refresh, device lock,
 * signal loss, expired auth, interrupted upload — each must prove no
 * ACKNOWLEDGED data is lost. "Acknowledged" is the operative word: a
 * save that never durably committed must never have claimed success in
 * the first place (see Section 0).
 *
 * Run: node tests/test-failure-injection.js
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var S = require('../js/sync-queue.js').SyncQueueCore;

var passed = 0;
var failed = 0;

function check(label, fn) {
    try {
        fn();
        passed++; console.log('  ✓ ' + label);
    } catch (e) {
        failed++; console.log('  ✗ ' + label + ' — ' + e.message);
    }
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

var _sourceCache = {};
function source(relPath) {
    if (!_sourceCache[relPath]) {
        _sourceCache[relPath] = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    }
    return _sourceCache[relPath];
}

/** Extract one named function's body from a file (anchor to the next
 *  top-level `function name(`/`};` boundary is overkill here — these
 *  are small, single-purpose functions bounded by the next blank-line-
 *  separated declaration, so a bounded slice from the anchor is enough
 *  to prove wiring without a real parser). */
function slice(relPath, anchor, approxLines) {
    var text = source(relPath);
    var idx = text.indexOf(anchor);
    assert(idx !== -1, 'anchor not found: ' + JSON.stringify(anchor) + ' in ' + relPath);
    return text.slice(idx, idx + (approxLines || 40) * 80);
}

console.log('\n════════════════════════════════════════');
console.log('Section 0 — the bounded promise itself:');
console.log('a save is never acknowledged before it durably commits');
console.log('════════════════════════════════════════\n');

check('write(): the offline branch RETURNS the enqueue promise (no synchronous "optimistic" resolve before the IndexedDB transaction completes)', function () {
    var body = slice('js/sync-queue.js', 'function write(fnName, payload) {', 30);
    assert(/if \(!_online\(\)\) \{\s*return _enqueue\(fnName, table, row\);/.test(body),
        'offline path must `return _enqueue(...)`, not fire-and-forget it');
});

check('write(): the online branch only resolves after _db[fnName] resolves (no promise unwrapped/discarded)', function () {
    var body = slice('js/sync-queue.js', 'function write(fnName, payload) {', 30);
    assert(/return _db\[fnName\]\(payload\)\.then\(/.test(body),
        'the online write must be awaited, not treated as fire-and-forget');
});

check('_enqueue(): the queued row is written inside a single IndexedDB transaction (atomic — no partial-row state)', function () {
    var body = slice('js/sync-queue.js', 'function _enqueue(fnName, table, row) {', 25);
    assert(/_tx\('ops', 'readwrite', function \(store\) \{\s*store\.add\(/.test(body),
        'enqueue must be one atomic store.add inside a readwrite transaction');
});

console.log('\n════════════════════════════════════════');
console.log('Scenario 1/2/3 — crash, refresh, device lock');
console.log('(interrupted process; IndexedDB survives, unacknowledged work does not exist yet)');
console.log('════════════════════════════════════════\n');

check('init() unconditionally drains the queue on every app start/reload (recovery after crash/refresh/lock)', function () {
    var body = slice('js/sync-queue.js', 'function init(db) {', 25);
    assert(/flush\(\); \/\/ app-start drain/.test(body),
        'init() must flush on startup so anything durably queued before the interruption still lands');
});

check('init() also listens for online/visibility/pageshow/focus — a lock/sleep that drops connectivity mid-session still recovers without a manual reload', function () {
    var body = slice('js/sync-queue.js', 'function init(db) {', 25);
    ['online', 'pageshow', 'focus'].forEach(function (evt) {
        assert(body.indexOf("addEventListener('" + evt + "'") !== -1, 'missing ' + evt + ' listener');
    });
    assert(body.indexOf('visibilitychange') !== -1, 'missing visibilitychange listener');
});

check('a queued op is a plain durable record (no in-memory-only state the process losing focus could drop)', function () {
    var body = slice('js/sync-queue.js', 'function _enqueue(fnName, table, row) {', 25);
    ['clientId:', 'table:', 'fnName:', 'row:', 'status:'].forEach(function (field) {
        assert(body.indexOf(field) !== -1, 'queued op missing field ' + field);
    });
});

console.log('\n════════════════════════════════════════');
console.log('Scenario 4 — signal loss');
console.log('════════════════════════════════════════\n');

check('isNetworkError classifies real browser connectivity failures for queueing, not discarding', function () {
    assert(S.isNetworkError(new Error('Failed to fetch'), true) === true, 'fetch rejection');
    assert(S.isNetworkError(new TypeError('NetworkError'), true) === true, 'TypeError');
    assert(S.isNetworkError(new Error('anything'), false) === true, 'browser reports offline');
    assert(S.isNetworkError(new Error('Load failed'), true) === true, 'Safari network wording');
});

check('isNetworkError does NOT reclassify a real server rejection as connectivity (queueing that would fail forever, silently)', function () {
    assert(S.isNetworkError(new Error('new row violates row-level security policy'), true) === false);
    assert(S.isNetworkError(new Error('duplicate key value violates unique constraint'), true) === false);
});

check('write(): a network failure mid-write falls through to the SAME _enqueue path as the offline branch (no data path unique to "went offline while writing")', function () {
    var body = slice('js/sync-queue.js', 'function write(fnName, payload) {', 30);
    assert(/isNetworkError\(err, _online\(\)\) \|\| SyncQueueCore\.isAuthError\(err\)\) \{\s*return _enqueue\(fnName, table, row\);/.test(body),
        'network/auth failure on the online path must enqueue the same row, not drop it');
});

check('flush(): signal loss mid-flush stops cleanly without corrupting queue order (FIFO preserved, remaining ops stay pending)', function () {
    var body = slice('js/sync-queue.js', 'function flush() {', 55);
    assert(/isNetworkError\(err, _online\(\)\) \|\| SyncQueueCore\.isAuthError\(err\)\) \{[\s\S]{0,400}return null;/.test(body),
        'a network/auth error mid-flush must stop (return null) rather than mark the row errored or skip ahead');
});

check('resetErrors/opsSummary round-trip: a row parked as error after repeated signal loss is still visible and retryable, never silently dropped', function () {
    var ops = [{ seq: 1, table: 'sessions', status: 'error', attempts: 5, row: { id: 'x' } }];
    assert(S.opsSummary(ops).errored === 1, 'errored op must be visible in the summary');
    var reset = S.resetErrors(ops);
    assert(reset[0].status === 'pending' && reset[0].attempts === 0, 'retry must restart the attempt budget');
    assert(ops[0].status === 'error', 'resetErrors must not mutate the original (so a failed retry attempt cannot corrupt history)');
});

console.log('\n════════════════════════════════════════');
console.log('Scenario 5 — expired auth');
console.log('════════════════════════════════════════\n');

check('isAuthError recognizes Supabase auth-expiry shapes (401/403 status, JWT/token/session wording)', function () {
    assert(S.isAuthError({ status: 401, message: 'Unauthorized' }) === true);
    assert(S.isAuthError({ status: 403 }) === true);
    assert(S.isAuthError(new Error('JWT expired')) === true);
    assert(S.isAuthError(new Error('invalid refresh_token')) === true);
    assert(S.isAuthError(new Error('duplicate key value violates unique constraint')) === false);
    assert(S.isAuthError(null) === false);
});

check('write(): an expired-session error while nominally online queues the row instead of surfacing a hard failure mid-capture', function () {
    var body = slice('js/sync-queue.js', 'function write(fnName, payload) {', 30);
    assert(/SyncQueueCore\.isAuthError\(err\)/.test(body), 'write()\'s catch must check isAuthError');
});

check('flush(): a run of 401s during flush never counts toward MAX_ATTEMPTS (the fix is re-auth, not giving up on the row)', function () {
    var body = slice('js/sync-queue.js', 'function flush() {', 55);
    var authBranch = body.slice(body.indexOf('isAuthError'), body.indexOf('isAuthError') + 500);
    assert(authBranch.indexOf('return null') !== -1,
        'the auth-error branch must return null (stop, do not increment attempts) like the network branch');
});

check('_enqueue stamps the CAPTURING account onto every queued op (A16: bound to the signed-in account)', function () {
    var body = slice('js/sync-queue.js', 'function _enqueue(fnName, table, row) {', 25);
    assert(/capturedUserId: \(_db && _db\.userId\) \|\| null/.test(body),
        'every enqueued op must record who was signed in at capture time');
});

check('isQuarantined: an op captured under account A never matches a currently-signed-in account B', function () {
    assert(S.isQuarantined({ capturedUserId: 'A' }, 'B') === true);
    assert(S.isQuarantined({ capturedUserId: 'A' }, 'A') === false);
    assert(S.isQuarantined({ capturedUserId: null }, 'B') === false, 'never-online-yet ops (no captured id) are not falsely quarantined');
});

check('queueSummary separates quarantined ops from ordinary pending ones — they must never look like "about to sync normally"', function () {
    var ops = [
        { status: 'pending', capturedUserId: 'A' },
        { status: 'pending', capturedUserId: 'B' },
        { status: 'error', capturedUserId: 'A' }
    ];
    var s = S.queueSummary(ops, 'A');
    assert(s.pending === 1, 'only the A-captured pending op counts as pending');
    assert(s.quarantined === 1, 'the B-captured op must be reported as quarantined, not pending');
    assert(s.errored === 1);
});

check('flush(): a quarantined op is skipped BEFORE any flushQueuedRow call — it can never be attributed to the wrong account', function () {
    var body = slice('js/sync-queue.js', 'function flush() {', 55);
    var stepStart = body.indexOf('function step(i)');
    var stepBody = body.slice(stepStart, stepStart + 900);
    var quarantineIdx = stepBody.indexOf('isQuarantined');
    var flushCallIdx = stepBody.indexOf('_db.flushQueuedRow');
    assert(quarantineIdx !== -1, 'step() must check isQuarantined');
    assert(flushCallIdx !== -1, 'step() must call flushQueuedRow');
    assert(quarantineIdx < flushCallIdx, 'the quarantine check must run BEFORE the row is ever sent to the server');
});

console.log('\n════════════════════════════════════════');
console.log('Logout with unsynced work (A16 / Constitution §53: warn, never silently discard)');
console.log('════════════════════════════════════════\n');

check('the logout handler checks SyncQueue.summary() before signing out', function () {
    var body = slice('js/app.js', 'function _confirmLogout() {', 20);
    assert(body.indexOf('SyncQueue.summary()') !== -1, '_confirmLogout must consult the queue summary');
});

check('the logout handler counts pending, errored, AND quarantined toward the warning (any unsynced state must warn)', function () {
    var body = slice('js/app.js', 'function _confirmLogout() {', 20);
    ['s.pending', 's.errored', 's.quarantined'].forEach(function (field) {
        assert(body.indexOf(field) !== -1, 'missing ' + field + ' in the logout warning calculation');
    });
});

check('signOut() only runs after the confirmation resolves truthy — a cancelled warning must actually cancel logout', function () {
    var body = slice('js/app.js', 'btnLogout.addEventListener', 10);
    assert(/if \(!ok\) return;/.test(body), 'declining the warning must stop before client.auth.signOut()');
});

console.log('\n════════════════════════════════════════');
console.log('Scenario 6 — interrupted upload (target photo attachment)');
console.log('════════════════════════════════════════\n');

check('writeImage(): the blob is durably queued in IndexedDB, not just held in memory pending a network retry', function () {
    var body = slice('js/sync-queue.js', 'function writeImage(sessionId, fullBlob, thumbnailBlob, kind) {', 35);
    assert(/store\.put\(\{\s*sessionId: sessionId/.test(body), 'the original blob must be put() into the images object store');
});

check('writeImage(): if the parent row is itself still queued (offline), the image queues too rather than attempting an upload with no row to attach to', function () {
    var body = slice('js/sync-queue.js', 'function writeImage(sessionId, fullBlob, thumbnailBlob, kind) {', 35);
    assert(/if \(!_online\(\) \|\| parentQueued\) return queueIt\(\);/.test(body),
        'an orphaned upload (parent not yet on the server) must be avoided by queueing');
});

check('flush(): a queued image upload failure never blocks or fails the row flush it rides on (image failure is isolated)', function () {
    var body = slice('js/sync-queue.js', 'function flush() {', 55);
    assert(/image failure never blocks the flush/.test(body),
        'the flush loop must isolate image-upload failures from row-flush success');
});

check('flush(): a queued image is deleted from the local store ONLY after its upload actually resolves (interrupted/failed uploads keep the only copy)', function () {
    var body = slice('js/sync-queue.js', 'function flush() {', 55);
    var uploadIdx = body.indexOf('var up = img.kind');
    var thenIdx = body.indexOf('.then(function () {', uploadIdx);
    var deleteIdx = body.indexOf("store.delete(op.row.id)", uploadIdx);
    var catchIdx = body.indexOf('.catch(function (e) {', uploadIdx);
    assert(uploadIdx !== -1 && thenIdx !== -1 && deleteIdx !== -1 && catchIdx !== -1,
        'expected upload -> then(delete) -> catch(log, keep) shape not found');
    assert(thenIdx < deleteIdx && deleteIdx < catchIdx,
        'the delete must sit inside the success .then(), before the failure .catch() — a failed upload must never delete the only local copy');
});

console.log('\n════════════════════════════════════════');
console.log('Quota / persistent storage (Phase A durability floor)');
console.log('════════════════════════════════════════\n');

check('isQuotaError distinguishes storage-full failures from ordinary errors', function () {
    var e = new Error('quota exceeded');
    e.name = 'QuotaExceededError';
    assert(S.isQuotaError(e) === true);
    assert(S.isQuotaError(new Error('duplicate key value violates unique constraint')) === false);
    assert(S.isQuotaError(null) === false);
});

check('a quota error is NOT swallowed by the network/auth queue-and-retry path (retrying into a full disk would just fail again identically)', function () {
    var e = new Error('quota exceeded'); e.name = 'QuotaExceededError';
    assert(S.isNetworkError(e, true) === false, 'a quota error must not be misclassified as connectivity');
    assert(S.isAuthError(e) === false, 'a quota error must not be misclassified as auth');
});

check('init() requests persistent storage (reduces silent eviction risk under disk pressure) without blocking startup on the result', function () {
    var body = slice('js/sync-queue.js', 'function init(db) {', 6);
    assert(body.indexOf('_requestPersistentStorage();') !== -1, 'init() must call _requestPersistentStorage()');
    var reqBody = slice('js/sync-queue.js', 'function _requestPersistentStorage() {', 12);
    assert(/navigator\.storage\.persist\(\)\.catch\(/.test(reqBody), 'persist() must be requested best-effort (never throw/block on denial)');
});

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
