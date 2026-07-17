/**
 * ui.js — Proven render helpers: templates A–E as reusable functions.
 *
 * The single place UI structure is stamped out from. Every helper
 * returns an HTML string built on the css/tokens.css system and the
 * component classes in css/ui.css (both transcribed from
 * docs/mockups/proven-templates-v2.html). Modules compose these
 * instead of hand-writing card/row/chip markup.
 *
 *   UI.esc(text)                      escape for innerHTML
 *   UI.mark(px)                       the W-dial brand mark (inline SVG)
 *   UI.brandBar()                     mark + PROVEN wordmark
 *   UI.wordmark(cls)                  PROVEN with the gold period
 *   UI.sectionHead(title)             heading with the gold rule
 *   UI.card(innerHtml, attrs)         row container
 *   UI.rowlink(opts)                  list row: title/sub/right/chev
 *   UI.chip(kind, text)               ready|caution|problem|gold|plain
 *   UI.banner(kind, html)             caution|ready|problem loud block
 *   UI.statStrip(stats)               [{value,label}] mono stat cells
 *   UI.gauge(opts)                    turret-dial gauge SVG
 *   UI.rifleChip(opts)                THE gold-bordered rifle chip
 *   UI.catRow(opts)                   Home category row
 */

(function () {
    'use strict';

    function esc(text) {
        return String(text === null || text === undefined ? '' : text)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /** Build a data-/id attribute string from a plain object. */
    function attrs(map) {
        var out = '';
        for (var k in map) {
            if (map.hasOwnProperty(k) && map[k] !== undefined && map[k] !== null) {
                out += ' ' + k + '="' + esc(map[k]) + '"';
            }
        }
        return out;
    }

    /* ── brand ────────────────────────────────────────────── */

    /** The W-dial mark: gold ring, tick marks, mountain range, W.
     *  Pass px for an inline size; omit to let the container's
     *  .mark class size it. */
    function mark(px) {
        return '<span class="mark"' + (px ? ' style="width:' + px + 'px;height:' + px + 'px"' : '') + '>' +
            '<svg viewBox="0 0 48 48" stroke-width="2.4" aria-hidden="true" focusable="false">' +
            '<circle cx="24" cy="24" r="20"/>' +
            '<line x1="24" y1="4" x2="24" y2="10"/><line x1="24" y1="38" x2="24" y2="44"/>' +
            '<line x1="4" y1="24" x2="10" y2="24"/><line x1="38" y1="24" x2="44" y2="24"/>' +
            '<path d="M14 24l6-9 4 6 2-3 6 8" stroke-width="2.2"/>' +
            '<text x="24" y="34" text-anchor="middle" font-family="Arial Black,Arial" font-size="13" font-weight="900" fill="currentColor" stroke="none">W</text>' +
            '</svg></span>';
    }

    function wordmark(cls) {
        return '<span class="wordmark' + (cls ? ' ' + cls : '') + '">PROVEN<i>.</i></span>';
    }

    function brandBar() {
        return '<div class="brandbar">' + mark() +
            '<div class="name">PROVEN<i>.</i></div>' +
            '</div>';
    }

    /* ── structure ────────────────────────────────────────── */

    function sectionHead(title) {
        return '<div class="section-head">' + esc(title) + '</div>';
    }

    function card(innerHtml, extra) {
        return '<div class="card"' + attrs(extra || {}) + '>' + (innerHtml || '') + '</div>';
    }

    /**
     * List row. opts:
     *   title, sub (text) · subMono (render sub in mono) · subHtml (raw)
     *   chip: {kind,text} · chev: true · right: raw html aside
     *   button: true (tappable) · id, data: {k:v}
     */
    function rowlink(opts) {
        var o = opts || {};
        var tag = o.button ? 'button' : 'div';
        var a = { 'class': 'rowlink' };
        if (o.id) a.id = o.id;
        var html = '<' + tag + attrs(a);
        if (o.data) {
            for (var k in o.data) {
                if (o.data.hasOwnProperty(k)) html += ' data-' + k + '="' + esc(o.data[k]) + '"';
            }
        }
        html += '>';
        html += '<div class="txt"><b>' + (o.titleHtml || esc(o.title || '')) + '</b>';
        if (o.subHtml) {
            html += '<span>' + o.subHtml + '</span>';
        } else if (o.sub) {
            html += '<span' + (o.subMono ? ' class="mono"' : '') + '>' + esc(o.sub) + '</span>';
        }
        html += '</div>';
        if (o.right) html += o.right;
        if (o.chip) html += chip(o.chip.kind, o.chip.text);
        if (o.chev) html += '<span class="chev">&rsaquo;</span>';
        html += '</' + tag + '>';
        return html;
    }

    /* ── status ───────────────────────────────────────────── */

    var CHIP_CLASSES = {
        ready: 'chip chip-ready',
        caution: 'chip chip-caution',
        problem: 'chip chip-problem',
        gold: 'chip chip-gold',
        plain: 'chip'
    };

    function chip(kind, text) {
        return '<span class="' + (CHIP_CLASSES[kind] || CHIP_CLASSES.plain) + '">' + esc(text) + '</span>';
    }

    /** kind: caution|ready|problem. html is trusted (caller escapes text). */
    function banner(kind, html, edge) {
        return '<div class="banner banner-' + (kind || 'caution') + (edge ? ' banner-edge' : '') + '">' + html + '</div>';
    }

    function statStrip(stats) {
        var html = '<div style="display:flex">';
        for (var i = 0; i < (stats || []).length; i++) {
            html += '<div class="stat"><b>' + esc(stats[i].value) + '</b><span>' + esc(stats[i].label) + '</span></div>';
        }
        html += '</div>';
        return html;
    }

    /* ── the turret-dial gauge ────────────────────────────── */

    var GAUGE_STATES = {
        ready: 'var(--status-ready)',
        caution: 'var(--status-caution)',
        problem: 'var(--status-problem)',
        off: 'var(--text-secondary)'
    };

    /**
     * opts: { state: 'ready'|'caution'|'problem'|'off',
     *         fraction: 0..1 (arc sweep; default 0.9),
     *         small: bool }
     * Geometry from the mockup: r=34 circle, circumference 213.6.
     */
    function gauge(opts) {
        var o = opts || {};
        var color = GAUGE_STATES[o.state] || GAUGE_STATES.off;
        var frac = typeof o.fraction === 'number' ? Math.max(0, Math.min(1, o.fraction)) : 0.9;
        var C = 213.6;
        var offset = C * (1 - frac);
        return '<div class="gauge' + (o.small ? ' gauge-sm' : '') + '"><svg viewBox="0 0 110 110" aria-hidden="true" focusable="false">' +
            '<g stroke="var(--border-strong)" stroke-width="1.6">' +
            '<line x1="55" y1="5" x2="55" y2="14"/><line x1="105" y1="55" x2="96" y2="55"/>' +
            '<line x1="55" y1="105" x2="55" y2="96"/><line x1="5" y1="55" x2="14" y2="55"/>' +
            '<line x1="90.4" y1="19.6" x2="84" y2="26"/><line x1="90.4" y1="90.4" x2="84" y2="84"/>' +
            '<line x1="19.6" y1="90.4" x2="26" y2="84"/><line x1="19.6" y1="19.6" x2="26" y2="26"/>' +
            '</g>' +
            '<circle cx="55" cy="55" r="34" fill="none" stroke="var(--dial-track)" stroke-width="6"/>' +
            (o.state === 'off' ? '' :
                '<circle cx="55" cy="55" r="34" fill="none" stroke="' + color + '" stroke-width="6"' +
                ' stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + offset.toFixed(1) + '"' +
                ' transform="rotate(-90 55 55)"/>') +
            '<circle cx="55" cy="55" r="8" fill="' + color + '"/>' +
            '</svg></div>';
    }

    /* ── the rifle chip (category screens) ────────────────── */

    /**
     * opts: { name, sub (cartridge/load line), status (readiness word,
     *         appended to sub in mockup style), id, change: bool }
     */
    function rifleChip(opts) {
        var o = opts || {};
        var subBits = [];
        if (o.sub) subBits.push(esc(o.sub));
        if (o.status) subBits.push('<span style="font-weight:600">' + esc(o.status) + '</span>');
        return '<button class="riflepick"' + (o.id ? ' id="' + esc(o.id) + '"' : '') + '>' +
            '<div class="txt"><b>' + esc(o.name || '') + '</b>' +
            (subBits.length ? '<span>' + subBits.join(' &middot; ') + '</span>' : '') +
            '</div>' +
            (o.change === false ? '' : '<span class="change">Change &rsaquo;</span>') +
            '</button>';
    }

    /* ── Home category row ────────────────────────────────── */

    /** opts: { icon (Icon name), title, desc, data: {k:v} } */
    function catRow(opts) {
        var o = opts || {};
        var html = '<button class="cat"';
        if (o.data) {
            for (var k in o.data) {
                if (o.data.hasOwnProperty(k)) html += ' data-' + k + '="' + esc(o.data[k]) + '"';
            }
        }
        html += '>';
        html += '<div class="ic">' + Icon(o.icon || 'help', 22) + '</div>';
        html += '<div class="txt"><b>' + esc(o.title || '') + '</b><span>' + esc(o.desc || '') + '</span></div>';
        html += '<span class="chev">&rsaquo;</span>';
        html += '</button>';
        return html;
    }

    window.UI = {
        esc: esc,
        mark: mark,
        wordmark: wordmark,
        brandBar: brandBar,
        sectionHead: sectionHead,
        card: card,
        rowlink: rowlink,
        chip: chip,
        banner: banner,
        statStrip: statStrip,
        gauge: gauge,
        rifleChip: rifleChip,
        catRow: catRow
    };
})();
