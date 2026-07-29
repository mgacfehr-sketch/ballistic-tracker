/**
 * utils.js — Helper functions.
 * No DOM access, no side effects beyond what's documented.
 */

// Node test shim: SyncQueueCore is a real global in the browser (sync-queue.js
// loads as a plain script); this mirrors truing-core.js's own require-shim
// pattern so friendlyError() below is unit-testable without a DOM.
if (typeof SyncQueueCore === 'undefined' && typeof require === 'function') {
    var SyncQueueCore = require('./sync-queue.js').SyncQueueCore;
}

/**
 * Generate a UUID v4.
 * @returns {string}
 */
function generateUUID() {
    if (crypto && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * SHA-256 of a Blob/File's bytes, as lowercase hex. Web Crypto
 * (available in both the browser and a Capacitor WebView — CLAUDE.md
 * Build Principle #3) — no new dependency. Used by db.js's vault-first
 * import path (Amendment 1 Part B / PHASEB-migrations.sql's
 * attachment_vault) to fingerprint an original file BEFORE association.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function sha256Hex(blob) {
    return blob.arrayBuffer().then(function (buf) {
        return crypto.subtle.digest('SHA-256', buf);
    }).then(function (hashBuf) {
        var bytes = new Uint8Array(hashBuf);
        var hex = '';
        for (var i = 0; i < bytes.length; i++) {
            hex += bytes[i].toString(16).padStart(2, '0');
        }
        return hex;
    });
}

/**
 * Clamp a value between min and max.
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

/**
 * Format a number to a fixed number of decimal places, trimming trailing zeros.
 * @param {number} n
 * @param {number} decimals
 * @returns {string}
 */
function formatNum(n, decimals) {
    if (n == null || isNaN(n)) return '—';
    return parseFloat(n.toFixed(decimals)).toString();
}

/**
 * Format a number to exactly N decimal places (no trimming).
 * @param {number} n
 * @param {number} decimals
 * @returns {string}
 */
function formatFixed(n, decimals) {
    if (n == null || isNaN(n)) return '—';
    return n.toFixed(decimals);
}

/**
 * Load an image from a File object and return a promise that resolves
 * to a CanvasImageSource (an ImageBitmap when the browser supports it,
 * an HTMLImageElement otherwise) — every caller in this codebase only
 * ever reads .width/.height and passes the result straight into
 * ctx.drawImage(), both of which ImageBitmap and HTMLImageElement
 * support identically, so this substitution is transparent to callers.
 *
 * UI Consolidation phase, item (4): this fixes the rotated/twisted
 * target-photo bug. The PRIOR implementation's own comment claimed
 * "modern browsers auto-apply EXIF orientation via createImageBitmap,
 * so we use that" — but the code never actually called
 * createImageBitmap at all; it only ever loaded through a plain
 * `new Image(); img.src = objectURL`. A browser's CSS-level "auto-
 * rotate an <img> for on-screen DISPLAY" behavior (which IS broadly
 * supported) is a DIFFERENT code path from what `ctx.drawImage()`
 * decodes when painting that same <img> onto a canvas — canvas
 * drawing has long been documented (and inconsistent across engines,
 * especially WebView/iOS Safari, which is exactly what a phone
 * camera's portrait photo goes through) to NOT reliably inherit that
 * same correction. Explicitly requesting
 * `{ imageOrientation: 'from-image' }` from createImageBitmap forces
 * EXIF-correct pixel orientation in the decoded bitmap itself,
 * independent of any engine's on-screen-display default — the
 * correct, spec-defined fix for this exact bug class, not a
 * workaround.
 *
 * @param {File} file
 * @returns {Promise<ImageBitmap|HTMLImageElement>}
 */
function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
        if (!file || !file.type.startsWith('image/')) {
            reject(new Error('Invalid image file'));
            return;
        }

        function loadViaImgElement() {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = function () {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load image'));
            };
            img.src = url;
        }

        if (typeof createImageBitmap === 'function') {
            createImageBitmap(file, { imageOrientation: 'from-image' })
                .then(resolve)
                .catch(function () {
                    // Some engines implement createImageBitmap but reject
                    // the imageOrientation option (older WebKit) — fall
                    // back rather than fail the whole capture over it.
                    loadViaImgElement();
                });
        } else {
            loadViaImgElement();
        }
    });
}

/**
 * Distance between two points.
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {number}
 */
function dist(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// ── Help Tooltip System ───────────────────────────────────────

var HELP_TEXTS = {
    calibration: 'Tap two points exactly 1 inch apart on your target to set the scale for accurate measurements.',
    impacts: 'Tap the center of each bullet hole, in the order you fired (shot #1 first — it counts as your cold-bore shot). Use Undo Last or Clear All to fix mis-taps. You need at least 2 impacts to calculate.',
    radialSD: 'Standard deviation of each shot\'s distance from the group center. Lower = more consistent. Less sensitive to a single flyer than extreme spread.',
    clicks: 'Most scopes adjust in 1/4 MOA per click; match this to what\'s printed on your turret. The verdict converts the needed correction into turret clicks for you.',
    bulletDiameter: 'The diameter of your bullet in inches (e.g., .308 for 7.62mm). Used for center-to-center group size.',
    bc: 'Ballistic Coefficient \u2014 how well the bullet resists drag. Higher = less drop/drift. Found on the bullet box.',
    dragModel: 'G1 is traditional for flat-base bullets. G7 is more accurate for modern boat-tail bullets.',
    scopeHeight: 'Distance from center of bore to center of scope, in inches. Typically 1.5" to 2.0".',
    zeroRange: 'The distance at which your rifle is zeroed \u2014 where impact matches point of aim.',
    twistRate: 'Barrel rifling twist, e.g., 1:10 means one rotation per 10 inches. Faster twist stabilizes heavier bullets.',
    moa: 'Minute of Angle \u2014 1 MOA equals ~1.047 inches at 100 yards. Standard unit for scope adjustments.',
    atz: 'Adjust to Zero \u2014 scope correction to move your group center onto your point of aim.',
    poa: 'Point of Aim \u2014 the exact spot where your crosshairs were placed on the target.',
    meanRadius: 'Average distance of all shots from the group center. More reliable than extreme spread.',
    cep: 'Circular Error Probable \u2014 radius of a circle containing 50% of shots. A practical precision measure.'
};

/**
 * Show the help overlay with text for the given key.
 * @param {string} key - Key into HELP_TEXTS
 */
function showHelp(key) {
    var text = HELP_TEXTS[key];
    if (!text) return;
    var overlay = document.getElementById('help-overlay');
    var popup = document.getElementById('help-popup-text');
    if (!overlay || !popup) return;
    popup.textContent = text;
    overlay.classList.remove('hidden');
}

/**
 * Close the help overlay.
 */
function closeHelp() {
    var overlay = document.getElementById('help-overlay');
    if (overlay) overlay.classList.add('hidden');
}

// ── Error messages ────────────────────────────────────────────

/**
 * Every catch handler that shows `err.message` to the user was showing
 * raw browser/JS-runtime text ("Failed to fetch", a bare TypeError) —
 * not something a shooter would ever say, and not honest about WHY a
 * save failed. Route all user-facing error text through this instead.
 * Reuses SyncQueueCore.isNetworkError (already the single source of
 * truth for "was this a dropped connection") rather than re-detecting
 * network failures a second way.
 */
function friendlyError(err) {
    var online = (typeof navigator === 'undefined') || navigator.onLine !== false;
    if (typeof SyncQueueCore !== 'undefined' && SyncQueueCore && SyncQueueCore.isNetworkError(err, online)) {
        return 'No signal right now — try again once you have a connection.';
    }
    return (err && err.message) ? err.message : 'Something went wrong — try again.';
}

/**
 * Draw a rounded rectangle path on a canvas context.
 * Used by canvas-manager (live overlay) and export (saved image overlay).
 */
function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { friendlyError: friendlyError };
}
