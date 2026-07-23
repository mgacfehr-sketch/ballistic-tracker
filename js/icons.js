/**
 * icons.js — the single icon family for the entire app.
 *
 * Thin-stroke monochrome SVG set (Lucide-style geometry): 24x24 viewBox,
 * stroke = currentColor, stroke-width 1.75, round caps/joins, no fills
 * except deliberate status dots. Every icon in the product comes from
 * here via Icon(name, size). NO emoji anywhere, ever (REDESIGN-SPEC II.5).
 *
 * Usage:  html += Icon('camera');           // 22px default
 *         html += Icon('check', 18);        // inline size
 *         html += Icon('target', 28, 'u-quiet');
 */

(function () {
    'use strict';

    /* Inner SVG content per icon (24x24 coordinate space). */
    var PATHS = {
        /* ── navigation / shell ─────────────────────────── */
        'home': '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>',
        /* the five job categories (traced from the Proven mockups) */
        'cat-check': '<circle cx="12" cy="12" r="8"/><line x1="12" y1="2" x2="12" y2="8"/><line x1="12" y1="16" x2="12" y2="22"/><line x1="2" y1="12" x2="8" y2="12"/><line x1="16" y1="12" x2="22" y2="12"/>',
        'cat-shoot': '<path d="M12 3a9 9 0 0 1 9 9"/><path d="M12 7a5 5 0 0 1 5 5"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M3 12a9 9 0 0 0 9 9"/>',
        'cat-ammo': '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/>',
        'cat-verify': '<path d="M3 21L21 3"/><path d="M7 17l-1 1M11 13l-1 1M15 9l-1 1M19 5l-1 1"/>',
        'cat-records': '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><circle cx="12" cy="13" r="3"/>',
        /* the v2.3 jobs (traced from the rangeday-reorg / steel-session mockups) */
        'job-range': '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.4"/>',
        'job-steel': '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r=".8" fill="currentColor" stroke="none"/>',
        'job-loaddev': '<path d="M6 20V8M12 20V4M18 20v-8"/>',
        'job-ballistics': '<path d="M12 3a9 9 0 0 1 9 9"/><path d="M12 7a5 5 0 0 1 5 5"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M3 12a9 9 0 0 0 9 9"/>',
        'job-truing': '<path d="M3 17c5-9 13-9 18 0"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
        'job-scopetrack': '<path d="M3 21L21 3"/><path d="M7 17l-1 1M11 13l-1 1M15 9l-1 1M19 5l-1 1"/>',
        'job-records': '<path d="M4 6h16M4 12h16M4 18h10"/>',
        'send': '<path d="M21 12a8 8 0 1 1-4-6.9"/><path d="M21 5l-9 9-2-4"/>',
        'crosshair': '<circle cx="12" cy="12" r="7.5"/><line x1="12" y1="1.5" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22.5"/><line x1="1.5" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22.5" y2="12"/>',
        'target': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
        'message': '<path d="M21 12a9 9 0 1 0-3.9 7.4L21 21l-1.1-3.6A8.96 8.96 0 0 0 21 12Z"/>',
        'sun': '<circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4.5"/><line x1="12" y1="19.5" x2="12" y2="22"/><line x1="2" y1="12" x2="4.5" y2="12"/><line x1="19.5" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="6.7" y2="6.7"/><line x1="17.3" y1="17.3" x2="19.1" y2="19.1"/><line x1="4.9" y1="19.1" x2="6.7" y2="17.3"/><line x1="17.3" y1="6.7" x2="19.1" y2="4.9"/>',
        'power': '<path d="M18.4 6.6a9 9 0 1 1-12.8 0"/><line x1="12" y1="2" x2="12" y2="11"/>',
        'sliders': '<line x1="5" y1="4" x2="5" y2="10"/><line x1="5" y1="14" x2="5" y2="20"/><circle cx="5" cy="12" r="2"/><line x1="12" y1="4" x2="12" y2="6"/><line x1="12" y1="10" x2="12" y2="20"/><circle cx="12" cy="8" r="2"/><line x1="19" y1="4" x2="19" y2="13"/><line x1="19" y1="17" x2="19" y2="20"/><circle cx="19" cy="15" r="2"/>',

        /* ── chevrons / arrows ───────────────────────────── */
        'chevron-left': '<polyline points="14.5 6 8.5 12 14.5 18"/>',
        'chevron-right': '<polyline points="9.5 6 15.5 12 9.5 18"/>',
        'chevron-down': '<polyline points="6 9.5 12 15.5 18 9.5"/>',
        'chevron-up': '<polyline points="6 14.5 12 8.5 18 14.5"/>',
        'arrow-up': '<line x1="12" y1="20" x2="12" y2="4"/><polyline points="6 10 12 4 18 10"/>',
        'arrow-down': '<line x1="12" y1="4" x2="12" y2="20"/><polyline points="6 14 12 20 18 14"/>',
        'arrow-left': '<line x1="20" y1="12" x2="4" y2="12"/><polyline points="10 6 4 12 10 18"/>',
        'arrow-right': '<line x1="4" y1="12" x2="20" y2="12"/><polyline points="14 6 20 12 14 18"/>',
        'undo': '<path d="M8 5 4 9l4 4"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',

        /* ── marks / state ───────────────────────────────── */
        'check': '<polyline points="4.5 12.5 9.5 17.5 19.5 7"/>',
        'x': '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
        'plus': '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
        'minus': '<line x1="5" y1="12" x2="19" y2="12"/>',
        'alert': '<path d="M12 3 1.8 20.2a1 1 0 0 0 .9 1.5h18.6a1 1 0 0 0 .9-1.5L12 3Z"/><line x1="12" y1="9.5" x2="12" y2="14.5"/><circle cx="12" cy="17.8" r="0.4" fill="currentColor" stroke="none"/>',
        'info': '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16.5"/><circle cx="12" cy="7.8" r="0.4" fill="currentColor" stroke="none"/>',
        'help': '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.3a2.7 2.7 0 1 1 3.9 2.4c-.8.4-1.2 1-1.2 1.8v.3"/><circle cx="12" cy="17" r="0.4" fill="currentColor" stroke="none"/>',
        'verified': '<circle cx="12" cy="12" r="8.5"/><polyline points="8 12.2 11 15.2 16.5 9.2"/>',
        'lock': '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',

        /* ── capture / media ─────────────────────────────── */
        'camera': '<path d="M4 7h3l1.5-2.5h7L17 7h3a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18V8.5A1.5 1.5 0 0 1 4 7Z"/><circle cx="12" cy="13" r="3.5"/>',
        'image': '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 15.5-4.5-4.5L7 20.5"/>',
        'crop': '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
        'import': '<path d="M12 3v11"/><polyline points="7 9.5 12 14.5 17 9.5"/><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/>',
        'export': '<path d="M12 14V3"/><polyline points="7 7.5 12 2.5 17 7.5"/><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/>',
        'share': '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="5.5" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><line x1="8.3" y1="10.9" x2="15.7" y2="6.6"/><line x1="8.3" y1="13.1" x2="15.7" y2="17.4"/>',
        'printer': '<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="8" rx="1.5"/><rect x="7" y="14" width="10" height="7"/>',
        'file': '<path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5L14 2.5Z"/><polyline points="14 2.5 14 7.5 19 7.5"/><line x1="8.5" y1="12" x2="15.5" y2="12"/><line x1="8.5" y1="16" x2="13.5" y2="16"/>',
        'search': '<circle cx="10.5" cy="10.5" r="6.5"/><line x1="15.3" y1="15.3" x2="21" y2="21"/>',

        /* ── instruments / data ──────────────────────────── */
        'gauge': '<path d="M3.3 19a10 10 0 1 1 17.4 0"/><path d="m12 14 3.5-3.5"/><circle cx="12" cy="14" r="1" fill="currentColor" stroke="none"/>',
        'activity': '<polyline points="2.5 12 7 12 10 4 14 20 17 12 21.5 12"/>',
        'trending-up': '<polyline points="3 17.5 9.5 11 13.5 15 21 7.5"/><polyline points="15.5 7.5 21 7.5 21 13"/>',
        'wind': '<path d="M17.8 7.7A2.4 2.4 0 1 1 19.6 12H2.5"/><path d="M9.7 4.6A2 2 0 1 1 11.1 8H2.5"/><path d="M12.7 19.4a2 2 0 1 0 1.4-3.4H2.5"/>',
        'thermometer': '<path d="M13.5 4a2 2 0 0 0-4 0v9.2a4.5 4.5 0 1 0 4 0Z"/><circle cx="11.5" cy="17" r="1" fill="currentColor" stroke="none"/>',
        'droplet': '<path d="M12 3.5s6 6.2 6 10.5a6 6 0 0 1-12 0C6 9.7 12 3.5 12 3.5Z"/>',
        'mountain': '<path d="m8 4 4.5 7L15 8l6.5 12h-19L8 4Z"/>',
        'map-pin': '<path d="M12 21.5S5 14.8 5 9.5a7 7 0 0 1 14 0c0 5.3-7 12-7 12Z"/><circle cx="12" cy="9.5" r="2.5"/>',
        'compass': '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
        'ruler': '<path d="M2.7 16.2 16.2 2.7l5.1 5.1L7.8 21.3l-5.1-5.1Z"/><line x1="6.9" y1="12" x2="8.7" y2="13.8"/><line x1="9.9" y1="9" x2="11.7" y2="10.8"/><line x1="12.9" y1="6" x2="14.7" y2="7.8"/>',
        'table': '<rect x="3" y="4" width="18" height="16" rx="1.5"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><line x1="3" y1="14.8" x2="21" y2="14.8"/><line x1="9.5" y1="9.5" x2="9.5" y2="20"/>',
        'clock': '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>',
        'calendar': '<rect x="3.5" y="5" width="17" height="16" rx="1.5"/><line x1="3.5" y1="9.8" x2="20.5" y2="9.8"/><line x1="8" y1="2.8" x2="8" y2="6.5"/><line x1="16" y1="2.8" x2="16" y2="6.5"/>',
        'flask': '<path d="M10 2.8v6.4L4.3 19a1.8 1.8 0 0 0 1.6 2.6h12.2a1.8 1.8 0 0 0 1.6-2.6L14 9.2V2.8"/><line x1="8.3" y1="2.8" x2="15.7" y2="2.8"/><line x1="6.8" y1="15.5" x2="17.2" y2="15.5"/>',
        'layers': '<path d="m12 3 9.5 5L12 13 2.5 8 12 3Z"/><path d="m4 12.5 8 4.2 8-4.2"/><path d="m4 16.5 8 4.2 8-4.2"/>',
        'box': '<path d="M12 2.8 21 7.4v9.2l-9 4.6-9-4.6V7.4l9-4.6Z"/><polyline points="3 7.4 12 12 21 7.4"/><line x1="12" y1="12" x2="12" y2="21.2"/>',
        'book': '<path d="M4.5 19.2V5A2.5 2.5 0 0 1 7 2.5h12.5v14H7a2.5 2.5 0 0 0 0 5h12.5v-5"/>',
        'award': '<circle cx="12" cy="9" r="6"/><path d="m8.8 14.2-1.8 7 5-3 5 3-1.8-7"/>',
        'list': '<line x1="9" y1="6" x2="20.5" y2="6"/><line x1="9" y1="12" x2="20.5" y2="12"/><line x1="9" y1="18" x2="20.5" y2="18"/><circle cx="4.5" cy="6" r="0.5" fill="currentColor"/><circle cx="4.5" cy="12" r="0.5" fill="currentColor"/><circle cx="4.5" cy="18" r="0.5" fill="currentColor"/>',
        'eye': '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
        'users': '<circle cx="9" cy="8" r="3.5"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0"/><path d="M16.2 5.2a3.5 3.5 0 0 1 0 5.9"/><path d="M17.6 14.4a6.2 6.2 0 0 1 3.6 5.6"/>',

        /* ── actions / edit ──────────────────────────────── */
        'pencil': '<path d="M16.8 3.2a2.2 2.2 0 0 1 3.1 3.1L7.4 18.8 3 20l1.2-4.4L16.8 3.2Z"/>',
        'trash': '<path d="M4.5 6.5h15"/><path d="M9 6.5V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8v1.7"/><path d="M6 6.5 6.8 20a1.5 1.5 0 0 0 1.5 1.4h7.4A1.5 1.5 0 0 0 17.2 20l.8-13.5"/><line x1="10" y1="10.5" x2="10" y2="17"/><line x1="14" y1="10.5" x2="14" y2="17"/>',
        'refresh': '<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><polyline points="18.5 2.5 18.5 6.5 14.5 6.5"/>',
        'save': '<path d="M5 3.5h11l3.5 3.5v12A1.5 1.5 0 0 1 18 20.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5Z"/><path d="M7.5 3.5V8h7V3.5"/><rect x="7" y="12.5" width="10" height="8"/>',

        /* ── connectivity / status ───────────────────────── */
        'offline': '<path d="M5 12.5a10.5 10.5 0 0 1 3.4-2.3"/><path d="M12.5 8.6a10.5 10.5 0 0 1 6.5 3.9"/><path d="M8.5 15.8a5.5 5.5 0 0 1 4.5-1.5"/><circle cx="12" cy="19.5" r="0.6" fill="currentColor"/><line x1="3.5" y1="3.5" x2="20.5" y2="20.5"/>',
        'cloud': '<path d="M7 18.5A4.5 4.5 0 0 1 6.6 9.5a5.5 5.5 0 0 1 10.8 1.2A4 4 0 0 1 17 18.5H7Z"/>',
        'sound': '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18 6.5a8 8 0 0 1 0 11"/>',
        'sound-off': '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z"/><line x1="15.5" y1="9.5" x2="20.5" y2="14.5"/><line x1="20.5" y1="9.5" x2="15.5" y2="14.5"/>',
        'star': '<path d="m12 3.2 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.6l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8L12 3.2Z"/>',
        'download': '<path d="M12 3v11"/><polyline points="7 9.5 12 14.5 17 9.5"/><line x1="5" y1="20" x2="19" y2="20"/>'
    };

    /**
     * Render an icon as an inline SVG string.
     * @param {string} name  key in the set (falls back to 'help')
     * @param {number} [size=22]  rendered px size
     * @param {string} [cls]  extra class names
     */
    function Icon(name, size, cls) {
        var inner = PATHS[name] || PATHS['help'];
        var px = size || 22;
        return '<svg class="icon' + (cls ? ' ' + cls : '') + '" width="' + px + '" height="' + px +
            '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"' +
            ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
            inner + '</svg>';
    }

    Icon.has = function (name) { return !!PATHS[name]; };
    Icon.names = function () { return Object.keys(PATHS); };

    window.Icon = Icon;
})();
