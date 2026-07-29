/**
 * offline-cache.js — Offline Mode support.
 *
 * Caches rifle profiles, barrels, and loads to IndexedDB
 * so the app works without cell service (read-only).
 */

var OfflineCache = {
    _db: null,
    DB_NAME: 'yort_offline',
    DB_VERSION: 2, // v2: + velocityStrings store

    /**
     * Open the offline IndexedDB database.
     */
    _openDB: function () {
        if (OfflineCache._db) return Promise.resolve(OfflineCache._db);

        return new Promise(function (resolve, reject) {
            var req = indexedDB.open(OfflineCache.DB_NAME, OfflineCache.DB_VERSION);
            var settled = false;

            // Failure-injection round 2: an upgrade can BLOCK forever
            // (no onupgradeneeded/onsuccess/onerror ever fires) if
            // another tab still holds an older-version connection open
            // -- e.g. the app updated in one tab while a second tab from
            // before the update is still sitting open. Without this,
            // every caller awaiting _openDB() (offline reads included)
            // would hang silently with no observable error. Give the
            // blocking connection a few seconds to clear (the normal
            // case -- the other tab closes or reloads), then fail
            // observably rather than hang forever unexplained.
            var blockedTimer = null;
            req.onblocked = function () {
                console.warn('[Offline] IndexedDB upgrade blocked by another open tab/connection');
                blockedTimer = setTimeout(function () {
                    if (!settled) { settled = true; reject(new Error('indexeddb_blocked')); }
                }, 4000);
            };

            req.onupgradeneeded = function (e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains('rifles')) {
                    db.createObjectStore('rifles', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('barrels')) {
                    var barrelStore = db.createObjectStore('barrels', { keyPath: 'id' });
                    barrelStore.createIndex('rifleId', 'rifleId', { unique: false });
                }
                if (!db.objectStoreNames.contains('loads')) {
                    var loadStore = db.createObjectStore('loads', { keyPath: 'id' });
                    loadStore.createIndex('rifleId', 'rifleId', { unique: false });
                }
                if (!db.objectStoreNames.contains('velocityStrings')) {
                    var vsStore = db.createObjectStore('velocityStrings', { keyPath: 'id' });
                    vsStore.createIndex('rifleId', 'rifleId', { unique: false });
                }
            };

            req.onsuccess = function (e) {
                if (settled) return; // a blocked-timeout already rejected this open
                settled = true;
                if (blockedTimer) clearTimeout(blockedTimer);
                OfflineCache._db = e.target.result;
                resolve(OfflineCache._db);
            };

            req.onerror = function (e) {
                if (settled) return;
                settled = true;
                if (blockedTimer) clearTimeout(blockedTimer);
                console.warn('[Offline] Failed to open IDB:', e.target.error);
                reject(e.target.error);
            };
        });
    },

    /**
     * Cache all rifles, barrels, and loads from Supabase into IndexedDB.
     */
    cacheAll: function (db) {
        if (!db) return Promise.resolve();

        return db.getAllRifles().then(function (rifles) {
            var promises = rifles.map(function (r) {
                return Promise.all([
                    db.getBarrelsByRifle(r.id),
                    db.getLoadsByRifle(r.id),
                    typeof db.getVelocityStringsByRifle === 'function'
                        ? db.getVelocityStringsByRifle(r.id).catch(function () { return []; })
                        : Promise.resolve([])
                ]).then(function (results) {
                    return { rifle: r, barrels: results[0] || [], loads: results[1] || [], strings: results[2] || [] };
                });
            });
            return Promise.all(promises);
        }).then(function (profiles) {
            return OfflineCache._openDB().then(function (idb) {
                return new Promise(function (resolve, reject) {
                    var tx = idb.transaction(['rifles', 'barrels', 'loads', 'velocityStrings'], 'readwrite');
                    var rifleStore = tx.objectStore('rifles');
                    var barrelStore = tx.objectStore('barrels');
                    var loadStore = tx.objectStore('loads');
                    var vsStore = tx.objectStore('velocityStrings');

                    // Clear existing data
                    rifleStore.clear();
                    barrelStore.clear();
                    loadStore.clear();
                    vsStore.clear();

                    // Write fresh data
                    for (var i = 0; i < profiles.length; i++) {
                        var p = profiles[i];
                        rifleStore.put(p.rifle);
                        for (var b = 0; b < p.barrels.length; b++) {
                            var barrel = p.barrels[b];
                            barrel.rifleId = barrel.rifleId || p.rifle.id;
                            barrelStore.put(barrel);
                        }
                        for (var l = 0; l < p.loads.length; l++) {
                            var load = p.loads[l];
                            load.rifleId = load.rifleId || p.rifle.id;
                            loadStore.put(load);
                        }
                        for (var v = 0; v < p.strings.length; v++) {
                            var vs = p.strings[v];
                            vs.rifleId = vs.rifleId || p.rifle.id;
                            vsStore.put(vs);
                        }
                    }

                    tx.oncomplete = function () {
                        console.log('[Offline] Cached', profiles.length, 'rifle profiles to IDB');
                        resolve();
                    };
                    tx.onerror = function (e) {
                        console.warn('[Offline] IDB cache write failed:', e.target.error);
                        reject(e.target.error);
                    };
                });
            });
        }).catch(function (err) {
            console.warn('[Offline] Cache failed:', err);
        });
    },

    /**
     * Get all cached rifles.
     */
    getCachedRifles: function () {
        return OfflineCache._openDB().then(function (idb) {
            return new Promise(function (resolve, reject) {
                var tx = idb.transaction('rifles', 'readonly');
                var req = tx.objectStore('rifles').getAll();
                req.onsuccess = function () { resolve(req.result || []); };
                req.onerror = function () { reject(req.error); };
            });
        }).catch(function () { return []; });
    },

    /**
     * Get a single cached rifle by ID.
     */
    getCachedRifle: function (id) {
        return OfflineCache._openDB().then(function (idb) {
            return new Promise(function (resolve, reject) {
                var tx = idb.transaction('rifles', 'readonly');
                var req = tx.objectStore('rifles').get(id);
                req.onsuccess = function () { resolve(req.result || null); };
                req.onerror = function () { reject(req.error); };
            });
        }).catch(function () { return null; });
    },

    /**
     * Get cached barrels for a rifle (via rifleId index).
     */
    getCachedBarrels: function (rifleId) {
        return OfflineCache._openDB().then(function (idb) {
            return new Promise(function (resolve, reject) {
                var tx = idb.transaction('barrels', 'readonly');
                var idx = tx.objectStore('barrels').index('rifleId');
                var req = idx.getAll(rifleId);
                req.onsuccess = function () { resolve(req.result || []); };
                req.onerror = function () { reject(req.error); };
            });
        }).catch(function () { return []; });
    },

    /**
     * Get a single cached load by ID (primary key — no rifleId needed).
     */
    getCachedLoad: function (id) {
        return OfflineCache._openDB().then(function (idb) {
            return new Promise(function (resolve, reject) {
                var tx = idb.transaction('loads', 'readonly');
                var req = tx.objectStore('loads').get(id);
                req.onsuccess = function () { resolve(req.result || null); };
                req.onerror = function () { reject(req.error); };
            });
        }).catch(function () { return null; });
    },

    /**
     * Get cached loads for a rifle (via rifleId index).
     */
    getCachedLoads: function (rifleId) {
        return OfflineCache._openDB().then(function (idb) {
            return new Promise(function (resolve, reject) {
                var tx = idb.transaction('loads', 'readonly');
                var idx = tx.objectStore('loads').index('rifleId');
                var req = idx.getAll(rifleId);
                req.onsuccess = function () { resolve(req.result || []); };
                req.onerror = function () { reject(req.error); };
            });
        }).catch(function () { return []; });
    },

    /**
     * Get cached velocity strings for a rifle (via rifleId index).
     */
    getCachedVelocityStrings: function (rifleId) {
        return OfflineCache._openDB().then(function (idb) {
            return new Promise(function (resolve, reject) {
                var tx = idb.transaction('velocityStrings', 'readonly');
                var idx = tx.objectStore('velocityStrings').index('rifleId');
                var req = idx.getAll(rifleId);
                req.onsuccess = function () { resolve(req.result || []); };
                req.onerror = function () { reject(req.error); };
            });
        }).catch(function () { return []; });
    },

    /**
     * Check if the app is online.
     */
    isOnline: function () {
        return navigator.onLine !== false;
    },

    /**
     * Update the connection status indicator dot.
     */
    _updateIndicator: function () {
        var dot = document.getElementById('connection-status');
        if (!dot) return;
        var online = OfflineCache.isOnline();
        dot.classList.toggle('online', online);
        dot.classList.toggle('offline', !online);
        dot.title = online ? 'Online' : 'Offline';
        // Offline is worth words, not an 8px dot nobody can read
        dot.textContent = online ? '' : 'offline';
    },

    /**
     * Initialize offline mode: open IDB, cache if online, listen for connectivity changes.
     */
    init: function (db) {
        OfflineCache._openDB().then(function () {
            if (OfflineCache.isOnline() && db) {
                OfflineCache.cacheAll(db);
            }
        }).catch(function (err) {
            console.warn('[Offline] Init failed:', err);
        });

        OfflineCache._updateIndicator();

        window.addEventListener('online', function () {
            console.log('[Offline] Back online');
            OfflineCache._updateIndicator();
            if (db) OfflineCache.cacheAll(db);
        });

        window.addEventListener('offline', function () {
            console.log('[Offline] Went offline');
            OfflineCache._updateIndicator();
        });

        document.addEventListener('visibilitychange', function () {
            if (!document.hidden && OfflineCache.isOnline() && db) {
                OfflineCache.cacheAll(db);
            }
        });
    }
};
