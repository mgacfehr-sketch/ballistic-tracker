/**
 * sync-queue.js — the offline write queue (Part 0.6 #1).
 *
 * The app must fully function with zero signal: log a session, mark
 * shots, save — then sync when connectivity returns. This module makes
 * that true WITHOUT a sync framework:
 *
 *   SyncQueue.write('addSession', payload)
 *     online  → db.addSession(payload)  (byte-for-byte today's behavior)
 *     offline / network failure → queue in IndexedDB `yort_sync`,
 *       return a synthetic row {id: clientUUID, ..., _pending: true}
 *
 *   Flush: FIFO, sequential (parent rows land before children), on
 *   'online' / visibilitychange / app start / after any online write.
 *   Upsert by client UUID — THE DEVICE IS THE SOURCE OF TRUTH: server
 *   data never overwrites unsynced local work. Photos queue as blobs
 *   and upload after their session row lands.
 *
 *   Read merge: init() decorates a whitelist of read methods on the db
 *   INSTANCE (db.js the file is untouched) so queued rows appear in
 *   history immediately, flagged _pending.
 *
 * Error classification: a NETWORK failure queues; a server rejection
 * (RLS, constraint, validation) rethrows to the caller — that is a
 * bug, not connectivity, and queueing it would fail forever. Rows
 * that fail server-side during flush retry up to 5 times, then park
 * as status 'error' — surfaced, never dropped.
 *
 * Out of scope by design (single user, one active device): offline
 * deletes, multi-device merge, Background Sync API, rifle/load
 * creation offline (profile setup is a home-Wi-Fi activity).
 *
 * SyncQueueCore (pure) is Node-tested: tests/test-sync-queue.js.
 */

/* ── Pure core ─────────────────────────────────────────────── */

var SyncQueueCore = {
    /** Queueable write methods → their table. Deletes and profile
     *  CRUD are deliberately absent (online-only, as today). */
    FN_TABLE: {
        addSession: 'sessions',
        addFieldShot: 'field_shots',
        // v2.4 §4.3: addDopeEntry removed — no dope_entries table exists
        // in the live DB; a queued write would jam the FIFO flush forever.
        addScopeAdjustment: 'scope_adjustments',
        addColdBoreShot: 'cold_bore_shots',
        addCleaningLog: 'cleaning_logs',
        addVelocityString: 'velocity_strings',
        addZeroEvent: 'zero_events',
        addMvMeasurement: 'mv_measurements',
        addTrackingVerification: 'tracking_verifications',
        addTruingEvent: 'truing_events',
        addSteelString: 'steel_strings',
        addSteelShot: 'steel_shots'
    },

    /** Read methods to decorate → their table (merge scope: rifleId
     *  arg when the method takes one). */
    READ_TABLE: {
        getSessionsByRifle: { table: 'sessions', filter: 'rifleId' },
        getAllSessions: { table: 'sessions', filter: null },
        getFieldShotsByRifle: { table: 'field_shots', filter: 'rifleId' },
        getScopeAdjustmentsByRifle: { table: 'scope_adjustments', filter: 'rifleId' },
        getColdBoreShots: { table: 'cold_bore_shots', filter: 'rifleId' },
        getVelocityStringsByRifle: { table: 'velocity_strings', filter: 'rifleId' },
        getZeroEventsByRifle: { table: 'zero_events', filter: 'rifleId' },
        getMvMeasurementsByRifle: { table: 'mv_measurements', filter: 'rifleId' },
        getTrackingVerificationsByRifle: { table: 'tracking_verifications', filter: 'rifleId' },
        getTruingEventsByRifle: { table: 'truing_events', filter: 'rifleId' },
        getSteelStringsByRifle: { table: 'steel_strings', filter: 'rifleId' },
        getSteelShotsByString: { table: 'steel_shots', filter: 'stringId' }
    },

    /**
     * Is this error a connectivity failure (→ queue) rather than a
     * server rejection (→ rethrow)? `onLine` short-circuits: when the
     * browser says offline, everything network-shaped queues.
     */
    isNetworkError: function (err, onLine) {
        if (onLine === false) return true;
        if (!err) return false;
        if (typeof TypeError !== 'undefined' && err instanceof TypeError) return true;
        var msg = String(err.message || err).toLowerCase();
        return /failed to fetch|network|load failed|fetch failed|timeout|abort|connection/.test(msg);
    },

    /**
     * Merge server rows with queued-local rows for one table.
     * Queued rows WIN on id collision (client is source of truth) and
     * are flagged _pending. Pending rows sort to the front (newest
     * work first, matching date-desc list screens).
     */
    mergePending: function (serverRows, pendingRows) {
        serverRows = serverRows || [];
        pendingRows = pendingRows || [];
        if (!pendingRows.length) return serverRows;
        var pendingIds = {};
        var out = [];
        pendingRows.forEach(function (p) {
            var row = {};
            for (var k in p) { if (p.hasOwnProperty(k)) row[k] = p[k]; }
            row._pending = true;
            pendingIds[row.id] = true;
            out.push(row);
        });
        serverRows.forEach(function (s) {
            if (!s || pendingIds[s.id]) return; // queued copy wins
            out.push(s);
        });
        return out;
    },

    /** Filter queued rows to a read call's scope. */
    filterPending: function (rows, filterField, filterValue) {
        if (!filterField || filterValue === undefined) return rows || [];
        return (rows || []).filter(function (r) { return r && r[filterField] === filterValue; });
    }
};

// Export the pure core for Node tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SyncQueueCore: SyncQueueCore };
}

/* ── Browser module ────────────────────────────────────────── */

var SyncQueue = (typeof indexedDB !== 'undefined') ? (function () {
    'use strict';

    var DB_NAME = 'yort_sync';
    var DB_VERSION = 1;
    var MAX_ATTEMPTS = 5;

    var _db = null;        // BallisticDB instance
    var _idb = null;
    var _flushing = false;
    var _listeners = [];

    function _open() {
        return new Promise(function (resolve, reject) {
            var req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function (e) {
                var idb = e.target.result;
                if (!idb.objectStoreNames.contains('ops')) {
                    var ops = idb.createObjectStore('ops', { keyPath: 'seq', autoIncrement: true });
                    ops.createIndex('table', 'table', { unique: false });
                    ops.createIndex('status', 'status', { unique: false });
                }
                if (!idb.objectStoreNames.contains('images')) {
                    idb.createObjectStore('images', { keyPath: 'sessionId' });
                }
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }

    function _tx(store, mode, fn) {
        if (!_idb) return Promise.reject(new Error('SyncQueue not initialized'));
        return new Promise(function (resolve, reject) {
            var tx = _idb.transaction(store, mode);
            var result = fn(tx.objectStore(store));
            tx.oncomplete = function () { resolve(result && result._value !== undefined ? result._value : undefined); };
            tx.onerror = function () { reject(tx.error); };
        });
    }

    function _getAllOps() {
        if (!_idb) return Promise.resolve([]);
        return new Promise(function (resolve, reject) {
            var tx = _idb.transaction('ops', 'readonly');
            var req = tx.objectStore('ops').getAll();
            req.onsuccess = function () { resolve(req.result || []); };
            req.onerror = function () { reject(req.error); };
        });
    }

    function _notify() {
        _getAllOps().then(function (ops) {
            var pending = ops.filter(function (o) { return o.status === 'pending'; }).length;
            var errored = ops.filter(function (o) { return o.status === 'error'; }).length;
            _listeners.forEach(function (fn) {
                try { fn({ pending: pending, errored: errored }); } catch (e) { /* listener */ }
            });
        }).catch(function () { /* quiet */ });
    }

    function _online() {
        return typeof navigator === 'undefined' || navigator.onLine !== false;
    }

    function _enqueue(fnName, table, row) {
        return _tx('ops', 'readwrite', function (store) {
            store.add({
                clientId: row.id,
                table: table,
                fnName: fnName,
                op: 'upsert',
                row: row,
                queuedAt: new Date().toISOString(),
                attempts: 0,
                lastError: null,
                status: 'pending'
            });
        }).then(function () {
            _notify();
            var out = {};
            for (var k in row) { if (row.hasOwnProperty(k)) out[k] = row[k]; }
            out._pending = true;
            return out;
        });
    }

    /** Queued rows for a table (pending only), row payloads. */
    function getPending(table) {
        return _getAllOps().then(function (ops) {
            return ops
                .filter(function (o) { return o.table === table && o.status !== 'done'; })
                .map(function (o) { return o.row; });
        }).catch(function () { return []; });
    }

    /* ── the write path ───────────────────────────────────── */

    function write(fnName, payload) {
        var table = SyncQueueCore.FN_TABLE[fnName];
        if (!table || !_db || !_idb) {
            return _db[fnName](payload); // not queueable — today's behavior
        }
        var row = {};
        for (var k in payload) { if (payload.hasOwnProperty(k)) row[k] = payload[k]; }
        row.id = row.id || generateUUID();
        row.date = row.date || new Date().toISOString();

        if (!_online()) {
            return _enqueue(fnName, table, row);
        }
        return _db[fnName](payload).then(function (saved) {
            // Opportunistic drain after any successful online write
            flush();
            return saved;
        }).catch(function (err) {
            if (SyncQueueCore.isNetworkError(err, _online())) {
                return _enqueue(fnName, table, row);
            }
            throw err; // real server rejection — the caller must see it
        });
    }

    /** Photo blobs: upload now when possible; queue otherwise. The
     *  existing rule holds — image failure never blocks a save.
     *  kind: 'session' (default) | 'steel' — picks the upload path. */
    function writeImage(sessionId, fullBlob, thumbnailBlob, kind) {
        kind = kind || 'session';
        function upload() {
            return kind === 'steel'
                ? _db.saveSteelPhoto(sessionId, fullBlob)
                : _db.saveSessionImage(sessionId, fullBlob, thumbnailBlob);
        }
        function queueIt() {
            return _tx('images', 'readwrite', function (store) {
                store.put({
                    sessionId: sessionId,
                    kind: kind,
                    fullBlob: fullBlob,
                    thumbnailBlob: thumbnailBlob,
                    queuedAt: new Date().toISOString(),
                    attempts: 0
                });
            }).then(function () { _notify(); return { queued: true }; });
        }
        if (!_db || !_idb) return upload();

        var parentTable = kind === 'steel' ? 'steel_strings' : 'sessions';
        return getPending(parentTable).then(function (pendingRows) {
            var parentQueued = pendingRows.some(function (r) { return r.id === sessionId; });
            if (!_online() || parentQueued) return queueIt();
            return upload().catch(function (err) {
                if (SyncQueueCore.isNetworkError(err, _online())) return queueIt();
                throw err;
            });
        });
    }

    function _pendingImage(sessionId) {
        if (!_idb) return Promise.resolve(null);
        return new Promise(function (resolve) {
            var tx = _idb.transaction('images', 'readonly');
            var req = tx.objectStore('images').get(sessionId);
            req.onsuccess = function () { resolve(req.result || null); };
            req.onerror = function () { resolve(null); };
        });
    }

    /* ── the flush ────────────────────────────────────────── */

    function flush() {
        if (_flushing || !_db || !_idb || !_online()) {
            return Promise.resolve({ flushed: 0 });
        }
        _flushing = true;
        var flushed = 0;

        function done(result) {
            _flushing = false;
            _notify();
            return result;
        }

        return _getAllOps().then(function (ops) {
            var queue = ops
                .filter(function (o) { return o.status === 'pending'; })
                .sort(function (a, b) { return a.seq - b.seq; });

            function step(i) {
                if (i >= queue.length) return Promise.resolve();
                var op = queue[i];
                return _db.flushQueuedRow(op.table, op.row).then(function () {
                    flushed++;
                    return _tx('ops', 'readwrite', function (store) { store.delete(op.seq); })
                        .then(function () {
                            if (op.table !== 'sessions' && op.table !== 'steel_strings') return null;
                            // A landed session/string may have a queued photo
                            return _pendingImage(op.row.id).then(function (img) {
                                if (!img) return null;
                                var up = img.kind === 'steel'
                                    ? _db.saveSteelPhoto(op.row.id, img.fullBlob)
                                    : _db.saveSessionImage(op.row.id, img.fullBlob, img.thumbnailBlob);
                                return up.then(function () {
                                    return _tx('images', 'readwrite', function (store) {
                                        store.delete(op.row.id);
                                    });
                                }).catch(function (e) {
                                    // image failure never blocks the flush
                                    console.warn('[Sync] queued image upload failed:', e);
                                });
                            });
                        })
                        .then(function () { return step(i + 1); });
                }).catch(function (err) {
                    if (SyncQueueCore.isNetworkError(err, _online())) {
                        // connectivity dropped mid-flush — stop, keep FIFO order
                        return null;
                    }
                    // server rejection: count it, park after MAX_ATTEMPTS
                    op.attempts = (op.attempts || 0) + 1;
                    op.lastError = String(err && err.message || err);
                    if (op.attempts >= MAX_ATTEMPTS) op.status = 'error';
                    return _tx('ops', 'readwrite', function (store) { store.put(op); })
                        .then(function () { return step(i + 1); }); // one bad row never blocks the rest
                });
            }

            return step(0);
        }).then(function () {
            return done({ flushed: flushed });
        }).catch(function (e) {
            console.warn('[Sync] flush failed:', e);
            return done({ flushed: flushed, error: e });
        });
    }

    /* ── read decoration (db.js file untouched) ───────────── */

    function _wrapReads(db) {
        Object.keys(SyncQueueCore.READ_TABLE).forEach(function (method) {
            if (typeof db[method] !== 'function') return;
            var spec = SyncQueueCore.READ_TABLE[method];
            var orig = db[method].bind(db);
            db[method] = function (arg) {
                var args = arguments;
                return getPending(spec.table).then(function (pendingAll) {
                    var pending = SyncQueueCore.filterPending(
                        pendingAll, spec.filter, spec.filter ? arg : undefined);
                    return orig.apply(null, args).then(function (serverRows) {
                        return SyncQueueCore.mergePending(serverRows, pending);
                    }).catch(function (err) {
                        // offline / failed read: queued rows are still real
                        if (pending.length) return SyncQueueCore.mergePending([], pending);
                        throw err;
                    });
                });
            };
        });
    }

    /* ── lifecycle ────────────────────────────────────────── */

    function init(db) {
        _db = db;
        return _open().then(function (idb) {
            _idb = idb;
            _wrapReads(db);
            if (typeof window !== 'undefined') {
                window.addEventListener('online', function () { flush(); });
                document.addEventListener('visibilitychange', function () {
                    if (document.visibilityState === 'visible' && _online()) flush();
                });
            }
            flush(); // app-start drain
            _notify();
        }).catch(function (e) {
            console.warn('[Sync] init failed — writes fall back to online-only:', e);
            _idb = null;
        });
    }

    function pendingCount() {
        return _getAllOps().then(function (ops) {
            return ops.filter(function (o) { return o.status === 'pending'; }).length;
        });
    }

    function onChange(fn) { _listeners.push(fn); }

    return {
        init: init,
        write: write,
        writeImage: writeImage,
        flush: flush,
        getPending: getPending,
        pendingCount: pendingCount,
        onChange: onChange
    };
})() : null;
