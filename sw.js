/**
 * sw.js — Service worker for offline caching.
 *
 * Update CACHE_VERSION on every deployment. The activate handler
 * deletes all caches that don't match, and notifies open tabs so
 * the app can reload with fresh files.
 *
 * Fetch strategy:
 *   App shell (HTML/JS/CSS) → network-first, cache fallback
 *   Static assets (icons)   → cache-first, network fallback
 */

var CACHE_VERSION = 10;
var CACHE_NAME = 'ballistic-v' + CACHE_VERSION;

var APP_SHELL = [
    './',
    './index.html',
    './css/main.css',
    './js/utils.js',
    './js/db.js',
    './js/calculations.js',
    './js/canvas-manager.js',
    './js/calibration.js',
    './js/session-flow.js',
    './js/profiles.js',
    './js/history.js',
    './js/export.js',
    './js/ballistic-solver.js',
    './js/ai-assistant.js',
    './js/app.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// Files that change with code updates — use network-first
var MUTABLE_EXTENSIONS = ['.html', '.js', '.css', '.json'];

function isMutable(url) {
    for (var i = 0; i < MUTABLE_EXTENSIONS.length; i++) {
        if (url.endsWith(MUTABLE_EXTENSIONS[i])) return true;
    }
    // Root path (index.html)
    if (url.endsWith('/')) return true;
    return false;
}

// ── Install — cache app shell ───────────────────────────────

self.addEventListener('install', function (e) {
    console.log('[SW] Installing — cache version:', CACHE_VERSION);
    e.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.addAll(APP_SHELL);
        }).then(function () {
            console.log('[SW] App shell cached, skipping wait');
            return self.skipWaiting();
        })
    );
});

// ── Activate — purge old caches, claim clients, notify tabs ─

self.addEventListener('activate', function (e) {
    console.log('[SW] Activating — cache version:', CACHE_VERSION);
    e.waitUntil(
        caches.keys().then(function (names) {
            return Promise.all(
                names.filter(function (name) {
                    return name !== CACHE_NAME;
                }).map(function (name) {
                    console.log('[SW] Deleting old cache:', name);
                    return caches.delete(name);
                })
            );
        }).then(function () {
            return self.clients.claim();
        }).then(function () {
            // Notify all open tabs that a new version is active
            return self.clients.matchAll({ type: 'window' });
        }).then(function (clients) {
            clients.forEach(function (client) {
                client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
            });
            console.log('[SW] Activated, notified', clients.length, 'client(s)');
        })
    );
});

// ── Fetch ───────────────────────────────────────────────────

self.addEventListener('fetch', function (e) {
    // Skip non-GET and cross-origin requests
    if (e.request.method !== 'GET') return;
    if (!e.request.url.startsWith(self.location.origin)) return;

    if (isMutable(e.request.url)) {
        // Network-first for app code — always fetch fresh when online
        e.respondWith(
            fetch(e.request).then(function (response) {
                if (response && response.status === 200) {
                    var clone = response.clone();
                    caches.open(CACHE_NAME).then(function (cache) {
                        cache.put(e.request, clone);
                    });
                }
                return response;
            }).catch(function () {
                return caches.match(e.request).then(function (cached) {
                    if (cached) return cached;
                    // Offline navigation fallback
                    if (e.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                });
            })
        );
    } else {
        // Cache-first for static assets (icons, images)
        e.respondWith(
            caches.match(e.request).then(function (cached) {
                if (cached) return cached;
                return fetch(e.request).then(function (response) {
                    if (response && response.status === 200) {
                        var clone = response.clone();
                        caches.open(CACHE_NAME).then(function (cache) {
                            cache.put(e.request, clone);
                        });
                    }
                    return response;
                });
            })
        );
    }
});
