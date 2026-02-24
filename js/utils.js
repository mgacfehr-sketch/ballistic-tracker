/**
 * utils.js — Helper functions.
 * No DOM access, no side effects beyond what's documented.
 */

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
 * Load an image from a File object and return a promise that resolves to an HTMLImageElement.
 * Handles EXIF orientation by drawing to a temporary canvas if needed.
 * Modern browsers (2024+) auto-apply EXIF orientation via createImageBitmap, so we use that.
 * @param {File} file
 * @returns {Promise<HTMLImageElement>}
 */
function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
        if (!file || !file.type.startsWith('image/')) {
            reject(new Error('Invalid image file'));
            return;
        }

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
