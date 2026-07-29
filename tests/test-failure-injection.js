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
    var body = slice('js/sync-queue.js', 'function flush() {', 140);
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
    var body = slice('js/sync-queue.js', 'function flush() {', 140);
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
    var body = slice('js/sync-queue.js', 'function flush() {', 140);
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
    var body = slice('js/sync-queue.js', 'function flush() {', 140);
    var pendingIdx = body.indexOf('_pendingImage(op.row.id)');
    var stepAgainIdx = body.indexOf('return step(i + 1);', pendingIdx);
    assert(pendingIdx !== -1 && stepAgainIdx !== -1,
        'the image branch must be followed by an unconditional step(i + 1) — nothing in the image path may reject upward and stop the row loop');
});

check('flush(): a queued image is deleted from the local store ONLY after its upload actually resolves (interrupted/failed uploads keep the only copy)', function () {
    var body = slice('js/sync-queue.js', 'function flush() {', 140);
    var uploadIdx = body.indexOf('var up = img.kind');
    var thenIdx = body.indexOf('.then(function () {', uploadIdx);
    var deleteIdx = body.indexOf("store.delete(op.row.id)", uploadIdx);
    var catchIdx = body.indexOf('.catch(function (e) {', uploadIdx);
    assert(uploadIdx !== -1 && thenIdx !== -1 && deleteIdx !== -1 && catchIdx !== -1,
        'expected upload -> then(delete) -> catch(verify) shape not found');
    assert(thenIdx < deleteIdx && deleteIdx < catchIdx,
        'the success-path delete must sit inside the success .then(), before the failure .catch() — a failed upload must never delete the only local copy on the strength of the .then() branch alone');
});

console.log('\n════════════════════════════════════════');
console.log('Scenario 6b — the missing-UPDATE-policy race (owner-review');
console.log('RLS audit, 2026-07-28): a retry can fail on THIS attempt\'s');
console.log('response while the upload actually succeeded on a PRIOR one');
console.log('════════════════════════════════════════\n');

check('flush(): a failed image retry is VERIFIED (does the file actually exist?) before being treated as a real failure — not just logged and silently left to retry forever', function () {
    var body = slice('js/sync-queue.js', 'function flush() {', 140);
    var catchIdx = body.indexOf('.catch(function (e) {', body.indexOf('var up = img.kind'));
    var catchBody = body.slice(catchIdx, catchIdx + 3800);
    assert(/img\.kind === 'steel'\s*\?\s*_db\.steelPhotoExists\(op\.row\.id\)\s*:\s*_db\.sessionImageExists\(op\.row\.id\)/.test(catchBody),
        'the catch must call db.js\'s sessionImageExists/steelPhotoExists — the one place that can tell "already there" from "still missing"');
});

check('flush(): if verification finds the file already exists, the queued copy is deleted (resolved as success) — not left to retry a permission wall forever', function () {
    var body = slice('js/sync-queue.js', 'function flush() {', 140);
    var catchIdx = body.indexOf('.catch(function (e) {', body.indexOf('var up = img.kind'));
    var catchBody = body.slice(catchIdx, catchIdx + 3800);
    var verifyThenIdx = catchBody.indexOf('.then(function (exists) {');
    var ifExistsIdx = catchBody.indexOf('if (exists) {', verifyThenIdx);
    var deleteIdx = catchBody.indexOf('store.delete(op.row.id)', ifExistsIdx);
    assert(verifyThenIdx !== -1 && ifExistsIdx !== -1 && deleteIdx !== -1,
        'expected an if(exists) branch that deletes the queued row');
    assert(ifExistsIdx < deleteIdx && deleteIdx < catchBody.indexOf('var updated = {}'),
        'the exists-branch delete must come before the genuinely-still-missing branch below it');
});

check('flush(): if verification confirms the file is genuinely still missing, the attempt is counted and the image parks as status \'error\' after MAX_ATTEMPTS — mirroring ops\' own rule, never silently dropped', function () {
    var body = slice('js/sync-queue.js', 'function flush() {', 140);
    var catchIdx = body.indexOf('.catch(function (e) {', body.indexOf('var up = img.kind'));
    var catchBody = body.slice(catchIdx, catchIdx + 3800);
    assert(/updated\.attempts = \(img\.attempts \|\| 0\) \+ 1;/.test(catchBody), 'a genuinely failed retry must increment attempts');
    assert(/updated\.status = updated\.attempts >= MAX_ATTEMPTS \? 'error' : 'pending';/.test(catchBody),
        'the image must park as status \'error\' at the same MAX_ATTEMPTS threshold ops already use');
    assert(/store\.put\(updated\)/.test(catchBody), 'the updated attempt/status must be persisted back to IndexedDB, not just held in memory');
});

check('flush(): the verify() step itself never crashes the flush loop — its own failure resolves false ("not confirmed"), it does not throw', function () {
    var body = slice('js/sync-queue.js', 'function flush() {', 140);
    var catchIdx = body.indexOf('.catch(function (e) {', body.indexOf('var up = img.kind'));
    var catchBody = body.slice(catchIdx, catchIdx + 1600);
    assert(/verify\.catch\(function \(\) \{ return false; \}\)/.test(catchBody),
        'the verify() promise must have its own .catch that resolves false, so a failed existence check degrades to "treat as still missing" rather than an unhandled rejection');
});

check('db.js: sessionImageExists/steelPhotoExists use list()+search (needs only the SELECT storage policy — already confirmed live), so verification works even before the missing UPDATE policy is fixed', function () {
    var body = slice('js/db.js', 'BallisticDB.prototype._storageObjectExists = function (bucket, path) {', 15);
    assert(/\.list\(folder, \{ search: filename, limit: 1 \}\)/.test(body),
        'existence check must use list()+search, not an operation that itself needs UPDATE/write permission');
});

check('summary(): queued images are no longer invisible to the pending/errored counts the status banner and logout warning already surface', function () {
    var body = slice('js/sync-queue.js', 'function summary() {', 15);
    assert(body.indexOf('_getAllImages()') !== -1, 'summary() must read the images store, not just ops');
    assert(/SyncQueueCore\.opsSummary\(results\[1\]\)/.test(body),
        'summary() must fold image pending/errored counts into the same aggregate the rest of the app already reads');
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

console.log('\n════════════════════════════════════════');
console.log('FAILURE-INJECTION ROUND 2 (overnight run #2, item 6)');
console.log('════════════════════════════════════════\n');

console.log('\n--- Storage quota exhaustion mid-photo ---\n');

check('session-flow.js: the annotated-image write (SyncQueue.writeImage / saveSessionImage) is isolated in its OWN promise chain, separate from the session row save — a quota failure here can only ever reach a console.error, never a user-facing "save failed"', function () {
    var body = slice('js/session-flow.js', 'Promise.all([\n            canvasToJpegBlob(storedCanvas, 0.80),', 30);
    assert(/\.catch\(function \(err\) \{\s*console\.error\('\[Session\] Failed to store annotated image:'/.test(body),
        'the image-write chain must terminate in its own console.error catch, never propagate to a save-failed alert');
});

check('steel-session.js: the casual-lane photo write is isolated with its own .catch BEFORE the outer save-failed catch runs — a quota failure on the photo can never make an already-saved string report "Save failed" (this session\'s fix; previously it was NOT isolated)', function () {
    var body = slice('js/steel-session.js', "document.getElementById('st-casual-save').addEventListener", 45);
    assert(/Promise\.resolve\(imageWrite\)\.catch\(function \(imgErr\) \{\s*console\.warn/.test(body),
        'the photo write must be wrapped in its own Promise.resolve(...).catch(...) before the outer chain continues');
    var imageWriteIdx = body.indexOf('Promise.resolve(imageWrite)');
    var savedScreenIdx = body.indexOf('_savedScreen(stringId)');
    var outerCatchIdx = body.lastIndexOf("alert('Save failed:");
    assert(imageWriteIdx !== -1 && savedScreenIdx !== -1 && outerCatchIdx !== -1, 'expected all three anchors present');
    assert(imageWriteIdx < savedScreenIdx && savedScreenIdx < outerCatchIdx,
        'the isolated image catch must run, then _savedScreen, with the outer alert only reachable from the STRING save failing');
});

check('isQuotaError would correctly classify the exact error IndexedDB throws when a queued photo blob exceeds local storage', function () {
    var e = new Error('The quota has been exceeded.');
    e.name = 'QuotaExceededError';
    assert(S.isQuotaError(e) === true, 'a real browser QuotaExceededError on a large blob put() must classify as quota, not a generic failure');
});

console.log('\n--- Service-worker update mid-capture ---\n');

check('DOCUMENTS CURRENT BEHAVIOR (not fixed this round — would require new UI, out of scope for "no UI feature work"): index.html reloads UNCONDITIONALLY the instant SW_UPDATED arrives, with no check for an in-progress capture', function () {
    var html = source('index.html');
    var idx = html.indexOf("if (e.data && e.data.type === 'SW_UPDATED')");
    assert(idx !== -1, 'the SW_UPDATED listener must exist');
    var body = html.slice(idx, idx + 200);
    assert(/window\.location\.reload\(\);/.test(body), 'reload must fire directly off the message, no gate');
    // Confirm there is NO conditional between the message arriving and the
    // reload call (e.g. checking a "capture in progress" flag) -- if a
    // future change adds one, this assertion should be updated alongside
    // it, not silently left describing stale behavior.
    assert(!/if\s*\(.*captur/i.test(body), 'no capture-in-progress gate currently exists around the reload');
});

check('mitigation that DOES exist: the three fact cards (zero/steel/chrono) autosave via fact-draft.js on every change, so a forced reload mid-entry on THOSE screens is recoverable', function () {
    var body = source('js/fact-draft.js');
    ['zero', 'steel', 'chrono'].forEach(function (kind) {
        assert(body.indexOf("kind: '" + kind + "'") !== -1, 'fact-draft.js must register the ' + kind + ' card kind');
    });
});

check('KNOWN GAP, documented not fixed: the legacy canvas capture flow (session-flow.js tap-to-place markers) has no fact-draft.js autosave equivalent — a forced reload mid-marker-placement there would lose unsaved taps. Real-device/manual verification needed; see OVERNIGHT2-REPORT.md.', function () {
    var body = source('js/session-flow.js');
    assert(body.indexOf('FactDraft') === -1, 'confirms session-flow.js does not currently integrate with fact-draft.js\'s autosave — if this ever changes, this test should be updated to check the new coverage instead of asserting its absence');
});

console.log('\n--- IndexedDB upgrade interruption ---\n');

check('sync-queue.js\'s _open() no longer hangs forever if blocked by another tab\'s open connection — onblocked is handled with a bounded timeout that eventually rejects observably', function () {
    var body = slice('js/sync-queue.js', 'function _open() {', 40);
    assert(body.indexOf('req.onblocked = function () {') !== -1, '_open() must register onblocked');
    assert(/setTimeout\(function \(\) \{\s*if \(!settled\) \{ settled = true; reject\(new Error\('indexeddb_blocked'\)\); \}\s*\}, 4000\)/.test(body),
        'onblocked must arm a bounded timeout that rejects observably, not hang forever');
});

check('sync-queue.js\'s _open() guards onsuccess/onerror against firing after the blocked-timeout already settled the promise (no double-resolve crash, no silently overwriting a rejection with a late success)', function () {
    var body = slice('js/sync-queue.js', 'function _open() {', 45);
    assert(/req\.onsuccess = function \(\) \{\s*if \(settled\) return;/.test(body), 'onsuccess must check settled first');
    assert(/req\.onerror = function \(\) \{\s*if \(settled\) return;/.test(body), 'onerror must check settled first');
});

check('offline-cache.js\'s _openDB() has the SAME onblocked protection as sync-queue.js\'s _open() — both IndexedDB opens in this codebase, not just one', function () {
    var body = slice('js/offline-cache.js', '_openDB: function () {', 40);
    assert(body.indexOf('req.onblocked = function () {') !== -1, '_openDB() must register onblocked');
    assert(/indexeddb_blocked/.test(body), '_openDB() must reject with the same observable error on a sustained block');
});

check('offline-cache.js\'s _openDB() also guards onsuccess/onerror with the settled flag', function () {
    var body = slice('js/offline-cache.js', '_openDB: function () {', 60);
    assert(/if \(settled\) return;.*\s*settled = true;\s*if \(blockedTimer\) clearTimeout\(blockedTimer\);\s*OfflineCache\._db = e\.target\.result;/.test(body),
        'onsuccess must guard against a prior blocked-timeout rejection before assigning OfflineCache._db');
});

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
