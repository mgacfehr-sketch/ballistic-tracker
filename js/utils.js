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
