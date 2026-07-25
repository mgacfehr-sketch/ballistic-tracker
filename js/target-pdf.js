/**
 * target-pdf.js — printable target generators (v2.4 Part 3).
 *
 * THE PROVEN DATA TARGET (owner-directed v2 design):
 *   · ALL writing at the TOP: W-dial + "PROVEN. DATA TARGET", the
 *     tagline, two instruction lines, and the 1.00" tap-dot scale
 *     bar. No bottom ruler; one small footer line only.
 *   · Quarter-inch grid across the ENTIRE sheet (0.25" minors, 1.00"
 *     majors, edge to edge) with a bolder outline on the central
 *     6" aim field.
 *   · Five diamonds — outlines and center dots ORANGE (spot color,
 *     prints as honest mid-gray in grayscale). Center large, four
 *     satellites smaller.
 *   · Four ArUco plates in the SIDE MARGINS (v2.4 relocation), each
 *     on a solid-white quiet-zone panel (non-negotiable for
 *     detection), dressed with gold machined-plate brackets and
 *     CAL·A–D labels OUTSIDE the quiet zone.
 *
 * GEOMETRY IS LAW: marker positions come from js/target-geometry.js —
 * the SAME object js/aruco-calibration.js derives its homography
 * from, so print and detection can never drift. Markers are drawn
 * from the live js-aruco2 ARUCO_MIP_36h12 dictionary. Marker pixel
 * patterns and printed size are unchanged from v2.3; only positions
 * moved.
 *
 * Letter + A4. jsPDF renders vector shapes — crisp at any print DPI.
 * drawToCanvas() exists so tests can run the REAL detector against
 * the generated artwork (the Part 3 verification gate).
 */

var TargetPDF = (function () {
    'use strict';

    var G = (typeof TARGET_GEOMETRY !== 'undefined') ? TARGET_GEOMETRY : null;
    if (!G) throw new Error('target-geometry.js must load before target-pdf.js');

    var GRID_INCHES = G.GRID_INCHES;
    var MARKER_SIZE = G.MARKER_SIZE;
    var QUIET = G.QUIET_ZONE;
    var MARKER_IDS = [0, 1, 2, 3]; // TL, TR, BL, BR — detection is position-based
    var SCALE_BAR_IN = 1.0;        // manual fallback taps two points 1.00" apart

    var PAGES = {
        letter: { w: 8.5, h: 11 },
        a4: { w: 8.2677, h: 11.6929 }
    };

    // Spot colors (RGB) — orange reads as mid-gray in grayscale print
    var COLORS = {
        ink: [22, 24, 27],
        gold: [176, 141, 47],
        orange: [232, 90, 26],
        gridMinor: [210, 207, 200],
        gridMajor: [172, 169, 162],
        gray: [110, 110, 110],
        white: [255, 255, 255],
        black: [0, 0, 0]
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

    /* ── the branded top block (shared by both targets) ────────
     * d.circle + d.line + d.text. Returns the y where content ends. */
    function drawTopBrand(d, page, subtitle) {
        var cx = page.w / 2;
        // W-dial mark (gold): ring, four ticks, mountain W
        var my = 0.48, mr = 0.17;
        d.circle(cx, my, mr, { color: 'gold', width: 0.022 });
        [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (t) {
            d.line(cx + t[0] * (mr + 0.02), my + t[1] * (mr + 0.02),
                cx + t[0] * (mr + 0.07), my + t[1] * (mr + 0.07), 0.016, 'gold');
        });
        d.text('W', cx, my + 0.045, 9, { align: 'center', bold: true, color: 'gold' });

        d.text('PROVEN.  ' + subtitle, cx, 0.98, 19, { align: 'center', bold: true });
        d.text('Get all shooting to math · by Workhorse', cx, 1.21, 9,
            { align: 'center', color: 'gold' });
        return 1.21;
    }

    /**
     * Draw the full target through an adapter:
     *   d.rect(x, y, w, h, fill)            fill: color name
     *   d.line(x1, y1, x2, y2, widthIn, color?)
     *   d.circle(x, y, r, opts {color, width, fill?})
     *   d.text(str, x, y, sizePt, opts {align, bold, color})
     * All coordinates in INCHES from the page's top-left.
     * Returns the geometry (for tests + captions).
     */
    function drawTarget(d, page) {
        var cx = page.w / 2;
        var g0x = cx - GRID_INCHES / 2;   // aim-field top-left
        var g0y = 2.7;
        var cy = g0y + GRID_INCHES / 2;
        var cell = MARKER_SIZE / 8;

        /* ── 1. quarter-inch grid, edge to edge, anchored to the
         *      aim field so its borders land on major lines ── */
        var k, x, y;
        for (k = Math.ceil((0 - g0x) / 0.25); g0x + k * 0.25 <= page.w + 0.001; k++) {
            x = g0x + k * 0.25;
            var majorV = (k % 4 === 0);
            d.line(x, 0, x, page.h, majorV ? 0.012 : 0.005, majorV ? 'gridMajor' : 'gridMinor');
        }
        for (k = Math.ceil((0 - g0y) / 0.25); g0y + k * 0.25 <= page.h + 0.001; k++) {
            y = g0y + k * 0.25;
            var majorH = (k % 4 === 0);
            d.line(0, y, page.w, y, majorH ? 0.012 : 0.005, majorH ? 'gridMajor' : 'gridMinor');
        }

        /* ── 2. white panels over the grid: header band, footer
         *      line, and the four quiet zones (solid white) ── */
        d.rect(0, 0, page.w, 2.42, 'white');
        d.rect(cx - 3.2, page.h - 0.52, 6.4, 0.34, 'white');

        var markerOrigins = ['TL', 'TR', 'BL', 'BR'].map(function (key, i) {
            var c = G.MARKER_CENTERS[key];
            return {
                key: key,
                x: g0x + c.x - MARKER_SIZE / 2,
                y: g0y + c.y - MARKER_SIZE / 2,
                id: MARKER_IDS[i]
            };
        });
        markerOrigins.forEach(function (m) {
            d.rect(m.x - QUIET, m.y - QUIET, MARKER_SIZE + 2 * QUIET, MARKER_SIZE + 2 * QUIET, 'white');
        });

        /* ── 3. bold aim-field outline ── */
        d.line(g0x, g0y, g0x + GRID_INCHES, g0y, 0.028);
        d.line(g0x, g0y + GRID_INCHES, g0x + GRID_INCHES, g0y + GRID_INCHES, 0.028);
        d.line(g0x, g0y, g0x, g0y + GRID_INCHES, 0.028);
        d.line(g0x + GRID_INCHES, g0y, g0x + GRID_INCHES, g0y + GRID_INCHES, 0.028);

        /* ── 4. five diamonds — ALL orange, dots orange ── */
        function diamond(dcx, dcy, half, width, dotR) {
            d.line(dcx - half, dcy, dcx, dcy - half, width, 'orange');
            d.line(dcx, dcy - half, dcx + half, dcy, width, 'orange');
            d.line(dcx + half, dcy, dcx, dcy + half, width, 'orange');
            d.line(dcx, dcy + half, dcx - half, dcy, width, 'orange');
            d.circle(dcx, dcy, dotR, { color: 'orange', fill: true });
        }
        diamond(cx, cy, 0.75, 0.03, 0.05);          // center — large
        diamond(cx - 2.0, cy - 2.0, 0.45, 0.024, 0.04);
        diamond(cx + 2.0, cy - 2.0, 0.45, 0.024, 0.04);
        diamond(cx - 2.0, cy + 2.0, 0.45, 0.024, 0.04);
        diamond(cx + 2.0, cy + 2.0, 0.45, 0.024, 0.04);

        /* ── 5. the four plates: marker + gold brackets + label ── */
        var LABELS = { TL: 'CAL·A', TR: 'CAL·B', BL: 'CAL·C', BR: 'CAL·D' };
        markerOrigins.forEach(function (m) {
            var cells = markerCells(m.id);
            if (cells) {
                for (var yy = 0; yy < 8; yy++) {
                    for (var xx = 0; xx < 8; xx++) {
                        if (cells[yy][xx]) d.rect(m.x + xx * cell, m.y + yy * cell, cell, cell, 'black');
                    }
                }
            }
            // machined-plate brackets — gold, thin, pushed OUT so any
            // phantom quad they suggest is CONCENTRIC with the marker
            // (an offset quad is what false-positives the detector)
            var p0x = m.x - QUIET - 0.1, p0y = m.y - QUIET - 0.1;
            var p1x = m.x + MARKER_SIZE + QUIET + 0.1, p1y = m.y + MARKER_SIZE + QUIET + 0.1;
            var arm = 0.12, bw = 0.014;
            [[p0x, p0y, 1, 1], [p1x, p0y, -1, 1], [p0x, p1y, 1, -1], [p1x, p1y, -1, -1]]
                .forEach(function (c) {
                    d.line(c[0], c[1], c[0] + c[2] * arm, c[1], bw, 'gold');
                    d.line(c[0], c[1], c[0], c[1] + c[3] * arm, bw, 'gold');
                });
            var isTop = (m.key === 'TL' || m.key === 'TR');
            d.text(LABELS[m.key], m.x + MARKER_SIZE / 2,
                isTop ? p0y - 0.11 : p1y + 0.19, 6.5,
                { align: 'center', color: 'gold' });
        });

        /* ── 6. the writing — ALL at the top ── */
        drawTopBrand(d, page, 'DATA TARGET');
        d.text('Photograph with the Proven app — the four CAL plates set the scale automatically.',
            cx, 1.52, 8.5, { align: 'center' });
        d.text('Print at 100% — never "fit to page." Staple at the paper corners, clear of the plates.',
            cx, 1.70, 8.5, { align: 'center' });

        // 1.00" tap-dot scale bar (manual-calibration fallback)
        var sbY = 2.02;
        var sbX = cx - SCALE_BAR_IN / 2;
        d.line(sbX, sbY, sbX + SCALE_BAR_IN, sbY, 0.02);
        d.line(sbX, sbY - 0.08, sbX, sbY + 0.08, 0.02);
        d.line(sbX + SCALE_BAR_IN, sbY - 0.08, sbX + SCALE_BAR_IN, sbY + 0.08, 0.02);
        d.rect(sbX - 0.025, sbY - 0.025, 0.05, 0.05, 'black');
        d.rect(sbX + SCALE_BAR_IN - 0.025, sbY - 0.025, 0.05, 0.05, 'black');
        d.text('SCALE 1.00 IN — manual calibration: tap each end dot', cx, sbY + 0.25, 8, { align: 'center' });

        /* ── 7. the one small footer line ── */
        d.text('PROVEN. DATA TARGET · plate centers ' + G.SPAN_X.toFixed(2) + ' × ' +
            G.SPAN_Y.toFixed(2) + ' in · squares 0.25 in · by Workhorse',
            cx, page.h - 0.30, 7, { align: 'center', color: 'gray' });

        return {
            gridTopLeft: { x: g0x, y: g0y },
            center: { x: cx, y: cy },
            markerOrigins: markerOrigins,
            markerCentersPage: markerOrigins.map(function (m) {
                return { key: m.key, x: m.x + MARKER_SIZE / 2, y: m.y + MARKER_SIZE / 2 };
            })
        };
    }

    /* ── adapters ─────────────────────────────────────────── */

    function _pdfAdapter(doc) {
        function rgb(name) { return COLORS[name] || COLORS.ink; }
        return {
            rect: function (x, y, w, h, fill) {
                var c = rgb(fill);
                doc.setFillColor(c[0], c[1], c[2]);
                doc.rect(x, y, w, h, 'F');
            },
            line: function (x1, y1, x2, y2, widthIn, color) {
                var c = rgb(color || 'ink');
                doc.setDrawColor(c[0], c[1], c[2]);
                doc.setLineWidth(widthIn);
                doc.line(x1, y1, x2, y2);
            },
            circle: function (x, y, r, opts) {
                opts = opts || {};
                var c = rgb(opts.color || 'ink');
                if (opts.fill) {
                    doc.setFillColor(c[0], c[1], c[2]);
                    doc.circle(x, y, r, 'F');
                } else {
                    doc.setDrawColor(c[0], c[1], c[2]);
                    doc.setLineWidth(opts.width || 0.02);
                    doc.circle(x, y, r, 'S');
                }
            },
            text: function (str, x, y, sizePt, opts) {
                opts = opts || {};
                var c = rgb(opts.color || 'ink');
                doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
                doc.setFontSize(sizePt);
                doc.setTextColor(c[0], c[1], c[2]);
                doc.text(str, x, y, { align: opts.align || 'left' });
            }
        };
    }

    function _canvasAdapter(ctx, ppi) {
        function css(name) {
            var c = COLORS[name] || COLORS.ink;
            return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
        }
        return {
            rect: function (x, y, w, h, fill) {
                ctx.fillStyle = css(fill);
                ctx.fillRect(Math.round(x * ppi), Math.round(y * ppi),
                    Math.ceil(w * ppi), Math.ceil(h * ppi));
            },
            line: function (x1, y1, x2, y2, widthIn, color) {
                ctx.strokeStyle = css(color || 'ink');
                ctx.lineWidth = Math.max(1, widthIn * ppi);
                ctx.beginPath();
                ctx.moveTo(x1 * ppi, y1 * ppi);
                ctx.lineTo(x2 * ppi, y2 * ppi);
                ctx.stroke();
            },
            circle: function (x, y, r, opts) {
                opts = opts || {};
                ctx.beginPath();
                ctx.arc(x * ppi, y * ppi, r * ppi, 0, Math.PI * 2);
                if (opts.fill) {
                    ctx.fillStyle = css(opts.color || 'ink');
                    ctx.fill();
                } else {
                    ctx.strokeStyle = css(opts.color || 'ink');
                    ctx.lineWidth = Math.max(1, (opts.width || 0.02) * ppi);
                    ctx.stroke();
                }
            },
            text: function (str, x, y, sizePt, opts) {
                opts = opts || {};
                ctx.fillStyle = css(opts.color || 'ink');
                ctx.font = (opts.bold ? '700 ' : '400 ') + Math.round(sizePt * ppi / 72) + 'px Arial';
                ctx.textAlign = opts.align || 'left';
                ctx.fillText(str, x * ppi, y * ppi);
            }
        };
    }

    function makePdf(format) {
        var page = PAGES[format] || PAGES.letter;
        var jsPDFCtor = (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) || null;
        if (!jsPDFCtor) return null;
        var doc = new jsPDFCtor({ unit: 'in', format: [page.w, page.h] });
        drawTarget(_pdfAdapter(doc), page);
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
        return drawTarget(_canvasAdapter(ctx, ppi), page);
    }

    /** Tall-target canvas rendering (visual QA). */
    function drawTallToCanvas(canvas, ppi, format) {
        var page = PAGES[format] || PAGES.letter;
        canvas.width = Math.round(page.w * ppi);
        canvas.height = Math.round(page.h * ppi);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return drawTallTarget(_canvasAdapter(ctx, ppi), page);
    }

    /**
     * THE TALL TARGET (§2.6 v2.3, v2.4 top-branding dress): plumb
     * line, 1.00" ruler ticks, two bold scale marks exactly 6.00"
     * apart (the wizard's two photo taps), bottom aim dot. GEOMETRY
     * UNTOUCHED — only the dress moved to the top.
     */
    function drawTallTarget(d, page) {
        var cx = page.w / 2;

        drawTopBrand(d, page, 'TALL TARGET');
        d.text('Hang PLUMB (a weight on a string) at exactly 100 yards.',
            cx, 1.52, 8.5, { align: 'center' });
        d.text('Shoot the dot · dial UP 20-30 clicks · shoot again · photograph the whole target.',
            cx, 1.70, 8.5, { align: 'center' });

        var top = 1.95, bottom = page.h - 0.95;

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

        d.text('PROVEN. TALL TARGET · A to B 6.00 in · by Workhorse',
            cx, page.h - 0.15, 7, { align: 'center', color: 'gray' });
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
        drawTallTarget(_pdfAdapter(doc), page);
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
        GEOMETRY: G,
        paperTarget: paperTarget,
        tallTarget: tallTarget,
        drawToCanvas: drawToCanvas,
        drawTallToCanvas: drawTallToCanvas,
        markerCells: markerCells
    };
})();
