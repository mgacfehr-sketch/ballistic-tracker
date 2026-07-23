/**
 * target-pdf.js — printable target generators (§2.1, §2.6).
 *
 * THE PAPER TARGET: one standardized printable target whose
 * auto-calibration marks satisfy both owner constraints — INBOARD of
 * the paper corners (the staple-tear zone) and OUTBOARD of the center
 * (the shot zone) — plus a printed 1.00" scale bar and human-readable
 * reference text so manual 2-tap calibration works when detection
 * can't.
 *
 * GEOMETRY IS LAW: the ArUco layout matches js/aruco-calibration.js
 * EXACTLY (6.0" grid, 0.6" markers, outer corners 0.8" outside the
 * grid — marker centers 7.0" apart). Change nothing here without
 * changing it there; the homography warp assumes this geometry.
 * Markers are drawn from the live js-aruco2 ARUCO_MIP_36h12
 * dictionary (same bit layout as AR.Dictionary.generateSVG), so
 * detection sees exactly what it expects.
 *
 * Letter + A4 variants. jsPDF (pinned CDN) renders vector rects —
 * crisp at any print DPI. drawToCanvas() exists so tests can run the
 * REAL detector against the generated artwork (detected-scale math
 * verified against printed dimensions).
 */

var TargetPDF = (function () {
    'use strict';

    // Must mirror js/aruco-calibration.js
    var GRID_INCHES = 6.0;
    var MARKER_SIZE = 0.6;
    var MARKER_OFFSET = 0.8;
    var MARKER_IDS = [0, 1, 2, 3]; // TL, TR, BL, BR — detection is position-based
    var SCALE_BAR_IN = 1.0;        // manual fallback taps two points 1.00" apart

    var PAGES = {
        letter: { w: 8.5, h: 11 },
        a4: { w: 8.2677, h: 11.6929 }
    };

    /** 8x8 cell matrix (true = black) for one dictionary id — the exact
     *  layout AR.Dictionary.generateSVG draws (1-cell black border,
     *  6x6 data, '1' bits are white). */
    function markerCells(id) {
        if (typeof AR === 'undefined') return null;
        var dict = new AR.Dictionary('ARUCO_MIP_36h12');
        var code = dict.codeList[id];
        if (!code) return null;
        var size = dict.markSize - 2; // 6
        var cells = [];
        for (var y = 0; y < size + 2; y++) {
            var row = [];
            for (var x = 0; x < size + 2; x++) {
                if (x === 0 || y === 0 || x === size + 1 || y === size + 1) {
                    row.push(true); // border ring: black
                } else {
                    row.push(code[(y - 1) * size + (x - 1)] !== '1'); // '1' = white
                }
            }
            cells.push(row);
        }
        return cells;
    }

    /**
     * Draw the full target through an adapter:
     *   d.rect(x, y, w, h, fill)   fill: 'black' | 'white'
     *   d.line(x1, y1, x2, y2, widthIn)
     *   d.text(str, x, y, sizePt, opts {align, bold, gold})
     * All coordinates in INCHES from the page's top-left.
     * Returns the geometry (for tests + captions).
     */
    function drawTarget(d, page) {
        var cx = page.w / 2;
        // Grid center sits a touch above page middle: footer space below
        var cy = page.h / 2 - 0.35;
        var g0x = cx - GRID_INCHES / 2, g0y = cy - GRID_INCHES / 2; // grid top-left
        var cell = MARKER_SIZE / 8;

        // ── the four markers ──────────────────────────────
        // Outer corners 0.8" outside the grid corners (aruco-calibration law)
        var markerOrigins = [
            { x: g0x - MARKER_OFFSET, y: g0y - MARKER_OFFSET, id: MARKER_IDS[0] },                                // TL
            { x: g0x + GRID_INCHES + MARKER_OFFSET - MARKER_SIZE, y: g0y - MARKER_OFFSET, id: MARKER_IDS[1] },     // TR
            { x: g0x - MARKER_OFFSET, y: g0y + GRID_INCHES + MARKER_OFFSET - MARKER_SIZE, id: MARKER_IDS[2] },     // BL
            { x: g0x + GRID_INCHES + MARKER_OFFSET - MARKER_SIZE, y: g0y + GRID_INCHES + MARKER_OFFSET - MARKER_SIZE, id: MARKER_IDS[3] } // BR
        ];
        markerOrigins.forEach(function (m) {
            var cells = markerCells(m.id);
            if (!cells) return;
            for (var y = 0; y < 8; y++) {
                for (var x = 0; x < 8; x++) {
                    if (cells[y][x]) d.rect(m.x + x * cell, m.y + y * cell, cell, cell, 'black');
                }
            }
        });

        // ── the measurement grid (light 1" lines, shot zone) ──
        for (var i = 0; i <= GRID_INCHES; i++) {
            var w = (i === 0 || i === GRID_INCHES) ? 0.02 : 0.008;
            d.line(g0x + i, g0y, g0x + i, g0y + GRID_INCHES, w);
            d.line(g0x, g0y + i, g0x + GRID_INCHES, g0y + i, w);
        }

        // Center aim diamond + fine cross
        var half = 0.5;
        d.line(cx - half, cy, cx, cy - half, 0.028);
        d.line(cx, cy - half, cx + half, cy, 0.028);
        d.line(cx + half, cy, cx, cy + half, 0.028);
        d.line(cx, cy + half, cx - half, cy, 0.028);
        d.line(cx - 0.15, cy, cx + 0.15, cy, 0.012);
        d.line(cx, cy - 0.15, cx, cy + 0.15, 0.012);

        // ── header / footer ───────────────────────────────
        d.text('PROVEN.', cx, 0.72, 22, { align: 'center', bold: true });
        d.text('PRECISION TARGET — AUTO-CALIBRATING', cx, 1.0, 9, { align: 'center' });

        var footY = g0y + GRID_INCHES + MARKER_OFFSET + MARKER_SIZE + 0.32;
        // Scale bar: 1.00" with tap dots (the manual-calibration points)
        var sbX = cx - SCALE_BAR_IN / 2;
        d.line(sbX, footY, sbX + SCALE_BAR_IN, footY, 0.02);
        d.line(sbX, footY - 0.08, sbX, footY + 0.08, 0.02);
        d.line(sbX + SCALE_BAR_IN, footY - 0.08, sbX + SCALE_BAR_IN, footY + 0.08, 0.02);
        d.rect(sbX - 0.02, footY - 0.02, 0.04, 0.04, 'black');
        d.rect(sbX + SCALE_BAR_IN - 0.02, footY - 0.02, 0.04, 0.04, 'black');
        d.text('SCALE BAR = 1.00 IN — manual calibration: tap each end mark',
            cx, footY + 0.24, 8, { align: 'center' });
        d.text('reference: marker centers ' + (GRID_INCHES + 2 * (MARKER_OFFSET - MARKER_SIZE / 2)).toFixed(2) +
            ' in apart · grid squares 1.00 in',
            cx, footY + 0.42, 8, { align: 'center' });
        d.text('Aim at the diamond. Staple at the paper corners — keep staples outside the markers.',
            cx, footY + 0.60, 8, { align: 'center' });
        d.text('PROVEN BY WORKHORSE', cx, page.h - 0.35, 8, { align: 'center', gold: true });

        return { gridTopLeft: { x: g0x, y: g0y }, center: { x: cx, y: cy }, markerOrigins: markerOrigins };
    }

    /* ── jsPDF adapter ────────────────────────────────────── */

    function makePdf(format) {
        var page = PAGES[format] || PAGES.letter;
        var jsPDFCtor = (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) || null;
        if (!jsPDFCtor) return null;
        var doc = new jsPDFCtor({ unit: 'in', format: [page.w, page.h] });
        var adapter = {
            rect: function (x, y, w, h, fill) {
                doc.setFillColor(fill === 'white' ? 255 : 0);
                doc.rect(x, y, w, h, 'F');
            },
            line: function (x1, y1, x2, y2, widthIn) {
                doc.setDrawColor(0);
                doc.setLineWidth(widthIn);
                doc.line(x1, y1, x2, y2);
            },
            text: function (str, x, y, sizePt, opts) {
                opts = opts || {};
                doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
                doc.setFontSize(sizePt);
                if (opts.gold) doc.setTextColor(176, 141, 47);
                else doc.setTextColor(22, 24, 27);
                doc.text(str, x, y, { align: opts.align || 'left' });
            }
        };
        drawTarget(adapter, page);
        return doc;
    }

    /** Canvas rendering (tests + on-screen preview). ppi = pixels/inch. */
    function drawToCanvas(canvas, ppi, format) {
        var page = PAGES[format] || PAGES.letter;
        canvas.width = Math.round(page.w * ppi);
        canvas.height = Math.round(page.h * ppi);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        var adapter = {
            rect: function (x, y, w, h, fill) {
                ctx.fillStyle = fill === 'white' ? '#ffffff' : '#000000';
                ctx.fillRect(Math.round(x * ppi), Math.round(y * ppi),
                    Math.ceil(w * ppi), Math.ceil(h * ppi));
            },
            line: function (x1, y1, x2, y2, widthIn) {
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = Math.max(1, widthIn * ppi);
                ctx.beginPath();
                ctx.moveTo(x1 * ppi, y1 * ppi);
                ctx.lineTo(x2 * ppi, y2 * ppi);
                ctx.stroke();
            },
            text: function (str, x, y, sizePt, opts) {
                opts = opts || {};
                ctx.fillStyle = opts.gold ? '#B08D2F' : '#16181B';
                ctx.font = (opts.bold ? '700 ' : '400 ') + Math.round(sizePt * ppi / 72) + 'px Arial';
                ctx.textAlign = opts.align || 'left';
                ctx.fillText(str, x * ppi, y * ppi);
            }
        };
        return drawTarget(adapter, page);
    }

    /**
     * THE TALL TARGET (§2.6): plumb line, 1.00" ruler ticks, two bold
     * scale marks exactly 6.00" apart (the wizard's two photo taps),
     * bottom aim dot. Dial UP, shoot again, photograph — the app
     * measures true travel. Geometry matches js/scope-check.js
     * (dist(tapA, tapB) / 6.0 sets the scale).
     */
    function drawTallTarget(d, page) {
        var cx = page.w / 2;
        var top = 1.35, bottom = page.h - 0.95;
        var lineLen = bottom - top;

        d.text('PROVEN.', cx, 0.72, 22, { align: 'center', bold: true });
        d.text('TALL TARGET — SCOPE TRACKING', cx, 1.0, 9, { align: 'center' });

        // the plumb line
        d.line(cx, top, cx, bottom, 0.02);

        // 1.00" ruler ticks, numbered from the bottom aim point up
        var aimY = bottom - 0.55;
        for (var i = 0; aimY - i >= top; i++) {
            var y = aimY - i;
            var half = (i % 1 === 0) ? 0.28 : 0.15;
            d.line(cx - half, y, cx + half, y, 0.014);
            if (i > 0) d.text(String(i) + '"', cx + half + 0.12, y + 0.05, 8, {});
        }

        // two SCALE marks exactly 6.00" apart (bold squares on the line)
        var scaleA = aimY - 1.0, scaleB = aimY - 7.0;
        d.rect(cx - 0.09, scaleA - 0.09, 0.18, 0.18, 'black');
        d.rect(cx - 0.09, scaleB - 0.09, 0.18, 0.18, 'black');
        d.text('SCALE A', cx - 0.9, scaleA + 0.04, 8, {});
        d.text('SCALE B', cx - 0.9, scaleB + 0.04, 8, {});
        d.text('A to B = 6.00 IN — the app\'s two scale taps', cx, bottom + 0.28, 8, { align: 'center' });

        // bottom aim dot
        d.rect(cx - 0.03, aimY - 0.03, 0.06, 0.06, 'black');
        for (var a = 0; a < 4; a++) {
            var dx = [1, -1, 0, 0][a] * 0.22, dy = [0, 0, 1, -1][a] * 0.22;
            d.line(cx + dx * 0.5, aimY + dy * 0.5, cx + dx, aimY + dy, 0.02);
        }
        d.text('AIM HERE — every shot', cx + 0.45, aimY + 0.05, 8, {});

        // instructions (coach voice, one ritual)
        d.text('Hang PLUMB (use a weight on a string) at exactly 100 yards.',
            cx, bottom + 0.46, 8, { align: 'center' });
        d.text('Shoot the dot · dial UP 20-30 clicks · shoot again · photograph the whole target.',
            cx, bottom + 0.62, 8, { align: 'center' });
        d.text('PROVEN BY WORKHORSE', cx, page.h - 0.15, 8, { align: 'center', gold: true });
    }

    /** Generate + share/save the tall target. */
    function tallTarget(format) {
        var page = PAGES[format] || PAGES.letter;
        var jsPDFCtor = (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) || null;
        if (!jsPDFCtor) {
            alert('PDF library not loaded — check your connection and try again.');
            return;
        }
        var doc = new jsPDFCtor({ unit: 'in', format: [page.w, page.h] });
        var adapter = {
            rect: function (x, y, w, h, fill) {
                doc.setFillColor(fill === 'white' ? 255 : 0);
                doc.rect(x, y, w, h, 'F');
            },
            line: function (x1, y1, x2, y2, widthIn) {
                doc.setDrawColor(0);
                doc.setLineWidth(widthIn);
                doc.line(x1, y1, x2, y2);
            },
            text: function (str, x, y, sizePt, opts) {
                opts = opts || {};
                doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
                doc.setFontSize(sizePt);
                if (opts.gold) doc.setTextColor(176, 141, 47);
                else doc.setTextColor(22, 24, 27);
                doc.text(str, x, y, { align: opts.align || 'left' });
            }
        };
        drawTallTarget(adapter, page);
        _sharePdf(doc, 'proven-tall-target-' + (format === 'a4' ? 'a4' : 'letter') + '.pdf');
    }

    /** Generate + share/save the paper target. */
    function paperTarget(format) {
        var doc = makePdf(format || 'letter');
        if (!doc) {
            alert('PDF library not loaded — check your connection and try again.');
            return;
        }
        var name = 'proven-target-' + (format === 'a4' ? 'a4' : 'letter') + '.pdf';
        _sharePdf(doc, name);
    }

    function _sharePdf(doc, name) {
        var blob = doc.output('blob');
        if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
            var file = new File([blob], name, { type: 'application/pdf' });
            if (navigator.canShare({ files: [file] })) {
                navigator.share({ files: [file], title: name }).catch(function () {
                    doc.save(name);
                });
                return;
            }
        }
        doc.save(name);
    }

    return {
        GRID_INCHES: GRID_INCHES,
        MARKER_SIZE: MARKER_SIZE,
        MARKER_OFFSET: MARKER_OFFSET,
        paperTarget: paperTarget,
        tallTarget: tallTarget,
        drawToCanvas: drawToCanvas,
        markerCells: markerCells
    };
})();
