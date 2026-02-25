/**
 * offline-cache.js — Offline Mode support.
 *
 * Caches rifle profiles, loads, and solver data to localStorage
 * so the app works without cell service. Queues session data
 * for sync when connectivity returns.
 * Admin-only beta feature.
 */

var OfflineCache = {
    CACHE_KEY: 'yort_offline_cache',
    QUEUE_KEY: 'yort_offline_queue',

    /**
     * Cache all rifle profiles and loads for offline access.
     */
    cacheProfiles: function (db) {
        if (!db) return Promise.resolve();

        return db.getAllRifles().then(function (rifles) {
            var promises = rifles.map(function (r) {
                return Promise.all([
                    db.getLoadsByRifle(r.id),
                    db.getBarrelsByRifle(r.id)
                ]).then(function (results) {
                    return { rifle: r, loads: results[0] || [], barrels: results[1] || [] };
                });
            });
            return Promise.all(promises);
        }).then(function (profiles) {
            try {
                var cache = OfflineCache._getCache();
                cache.profiles = profiles;
                cache.cachedAt = new Date().toISOString();
                localStorage.setItem(OfflineCache.CACHE_KEY, JSON.stringify(cache));
                console.log('[Offline] Cached', profiles.length, 'rifle profiles');
            } catch (e) {
                console.warn('[Offline] Failed to cache profiles:', e);
            }
        });
    },

    /**
     * Get cached profiles (for offline use).
     */
    getCachedProfiles: function () {
        var cache = OfflineCache._getCache();
        return cache.profiles || [];
    },

    /**
     * Check if we have cached data available.
     */
    hasCachedData: function () {
        var cache = OfflineCache._getCache();
        return !!(cache.profiles && cache.profiles.length > 0);
    },

    /**
     * Get the timestamp of the last cache.
     */
    getCacheAge: function () {
        var cache = OfflineCache._getCache();
        return cache.cachedAt || null;
    },

    /**
     * Queue a session for later sync.
     */
    queueSession: function (sessionData) {
        try {
            var queue = OfflineCache._getQueue();
            sessionData._queuedAt = new Date().toISOString();
            queue.push(sessionData);
            localStorage.setItem(OfflineCache.QUEUE_KEY, JSON.stringify(queue));
            console.log('[Offline] Queued session for sync');
            return true;
        } catch (e) {
            console.warn('[Offline] Failed to queue session:', e);
            return false;
        }
    },

    /**
     * Get all queued sessions.
     */
    getQueuedSessions: function () {
        return OfflineCache._getQueue();
    },

    /**
     * Sync all queued sessions to the database.
     * Returns a promise that resolves with the count of synced sessions.
     */
    syncQueue: function (db) {
        if (!db) return Promise.resolve(0);
        var queue = OfflineCache._getQueue();
        if (queue.length === 0) return Promise.resolve(0);

        var synced = 0;
        var remaining = [];

        var chain = Promise.resolve();
        for (var i = 0; i < queue.length; i++) {
            (function (session) {
                chain = chain.then(function () {
                    // Remove queue metadata
                    delete session._queuedAt;
                    return db.addSession(session).then(function () {
                        synced++;
                    }).catch(function () {
                        remaining.push(session);
                    });
                });
            })(queue[i]);
        }

        return chain.then(function () {
            localStorage.setItem(OfflineCache.QUEUE_KEY, JSON.stringify(remaining));
            if (synced > 0) {
                console.log('[Offline] Synced', synced, 'sessions,', remaining.length, 'remaining');
            }
            return synced;
        });
    },

    /**
     * Check if the app is online.
     */
    isOnline: function () {
        return navigator.onLine !== false;
    },

    /**
     * Initialize offline mode: cache profiles and set up sync listeners.
     */
    init: function (db) {
        if (!db) return;

        // Cache profiles on init
        OfflineCache.cacheProfiles(db);

        // Try to sync queued sessions when coming back online
        window.addEventListener('online', function () {
            console.log('[Offline] Back online — syncing queue');
            OfflineCache.syncQueue(db).then(function (count) {
                if (count > 0) {
                    console.log('[Offline] Synced', count, 'queued sessions');
                }
            });
        });

        // Re-cache when profiles might have changed
        // (conservative: cache on each app focus)
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden && OfflineCache.isOnline()) {
                OfflineCache.cacheProfiles(db);
            }
        });
    },

    _getCache: function () {
        try {
            var raw = localStorage.getItem(OfflineCache.CACHE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    },

    _getQueue: function () {
        try {
            var raw = localStorage.getItem(OfflineCache.QUEUE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }
};
