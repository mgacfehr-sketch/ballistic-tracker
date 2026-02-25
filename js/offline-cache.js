/**
 * offline-cache.js — Offline Mode support.
 *
 * Caches rifle profiles, barrels, and loads to IndexedDB
 * so the app works without cell service (read-only).
 */

var OfflineCache = {
    _db: null,
    DB_NAME: 'yort_offline',
    DB_VERSION: 1,

    /**
     * Open the offline IndexedDB database.
     */
    _openDB: function () {
        if (OfflineCache._db) return Promise.resolve(OfflineCache._db);

        return new Promise(function (resolve, reject) {
            var req = indexedDB.open(OfflineCache.DB_NAME, OfflineCache.DB_VERSION);

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
            };

            req.onsuccess = function (e) {
                OfflineCache._db = e.target.result;
                resolve(OfflineCache._db);
            };

            req.onerror = function (e) {
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
                    db.getLoadsByRifle(r.id)
                ]).then(function (results) {
                    return { rifle: r, barrels: results[0] || [], loads: results[1] || [] };
                });
            });
            return Promise.all(promises);
        }).then(function (profiles) {
            return OfflineCache._openDB().then(function (idb) {
                return new Promise(function (resolve, reject) {
                    var tx = idb.transaction(['rifles', 'barrels', 'loads'], 'readwrite');
                    var rifleStore = tx.objectStore('rifles');
                    var barrelStore = tx.objectStore('barrels');
                    var loadStore = tx.objectStore('loads');

                    // Clear existing data
                    rifleStore.clear();
                    barrelStore.clear();
                    loadStore.clear();

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
