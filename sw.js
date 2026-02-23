/**
 * sw.js — Service worker for offline caching.
 *
 * Caches all app shell files on install. Serves from cache first,
 * falling back to network. Cleans up old caches on activate.
 */

var CACHE_NAME = 'ballistic-v1';

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

// Install — cache app shell
self.addEventListener('install', function (e) {
    e.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.addAll(APP_SHELL);
        }).then(function () {
            return self.skipWaiting();
        })
    );
});

// Activate — clean old caches
self.addEventListener('activate', function (e) {
    e.waitUntil(
        caches.keys().then(function (names) {
            return Promise.all(
                names.filter(function (name) {
                    return name !== CACHE_NAME;
                }).map(function (name) {
                    return caches.delete(name);
                })
            );
        }).then(function () {
            return self.clients.claim();
        })
    );
});

// Fetch — cache first, network fallback
self.addEventListener('fetch', function (e) {
    // Skip non-GET and cross-origin requests
    if (e.request.method !== 'GET') return;
    if (!e.request.url.startsWith(self.location.origin)) return;

    e.respondWith(
        caches.match(e.request).then(function (cached) {
            if (cached) return cached;

            return fetch(e.request).then(function (response) {
                // Cache successful same-origin responses
                if (response && response.status === 200) {
                    var clone = response.clone();
                    caches.open(CACHE_NAME).then(function (cache) {
                        cache.put(e.request, clone);
                    });
                }
                return response;
            });
        }).catch(function () {
            // Offline fallback for navigation requests
            if (e.request.mode === 'navigate') {
                return caches.match('./index.html');
            }
        })
    );
});
