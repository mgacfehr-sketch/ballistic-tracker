/**
 * app.js — Application initialization.
 *
 * Creates the CanvasManager and SessionFlow, wires everything up.
 */

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        var canvasEl = document.getElementById('main-canvas');
        var hintEl = document.getElementById('canvas-hint');
        var zoomEl = document.getElementById('zoom-indicator');

        var canvasManager = new CanvasManager(canvasEl, hintEl, zoomEl);
        var sessionFlow = new SessionFlow(canvasManager);
        sessionFlow.init();

        // Prevent default touch behaviors on the app container
        document.getElementById('app').addEventListener('touchmove', function (e) {
            // Allow scrolling inside the step panel
            if (e.target.closest('#step-panel')) return;
            e.preventDefault();
        }, { passive: false });

        // Prevent double-tap zoom on iOS
        var lastTouchEnd = 0;
        document.addEventListener('touchend', function (e) {
            var now = Date.now();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
    });
})();
