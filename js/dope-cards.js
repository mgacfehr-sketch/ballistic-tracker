/**
 * dope-cards.js — printable DOPE / range cards.
 *
 * Question: "What do I dial?" · Budget C (2-minute wizard at home).
 * Verdict: the card IS the verdict — laminated paper on the stock.
 * Empty state (in the wizard): "This load needs BC and muzzle velocity
 * — add them in Profiles." · Taps: 5 wizard taps → PDF.
 *
 * Uses the SAME trued inputs as the solver: computeTrajectory(), the
 * rifle's scope-tracking correction (come-ups pre-corrected on paper),
 * and the suppressed velocity delta when the rifle runs a can. Wind
 * columns at 5/10/15 mph full-value (linear scaling of the 10 mph
 * solution — drift is linear in crosswind speed for a fixed trajectory).
 *
 * Formats sized to the holders people actually own: buttstock strip
 * (1.6"×4.6"), wrist-coach card (3"×5"), full page. "Travel pack"
 * prints three cards for three density altitudes on one page.
 */

var DopeCards = (function () {

    // ── Pure: table → card rows ───────────────────────────────

    /**
     * @param {Array} table - computeTrajectory().table
     * @param {Object} opts - { mode: 'hunt'|'comp', scopeFactor }
     *   hunt: every 25 yd from 100; comp: one row per whole corrected
     *   come-up MOA (even-drop-value rows).
     * @returns {Array<{rangeYards, comeUpMOA, wind5, wind10, wind15}>}
     */
    function dopeRows(table, opts) {
        var mode = (opts && opts.mode) || 'hunt';
        var factor = opts && opts.scopeFactor;
        var rows = [];
        var lastWhole = 0;

        for (var i = 0; i < table.length; i++) {
            var r = table[i];
            if (r.rangeYards < 100) continue;
            var comeUp = applyScopeCorrection(r.comeUpMOA, factor);
            var take = false;
            if (mode === 'hunt') {
                take = r.rangeYards % 25 === 0;
            } else {
                var whole = Math.floor(comeUp);
                if (whole > lastWhole) {
                    lastWhole = whole;
                    take = true;
                }
            }
            if (take) {
                rows.push({
                    rangeYards: r.rangeYards,
                    comeUpMOA: Math.round(comeUp * 4) / 4,      // nearest click
                    wind5: Math.round(r.windDriftMOA / 2 * 4) / 4,
                    wind10: Math.round(r.windDriftMOA * 4) / 4,
                    wind15: Math.round(r.windDriftMOA * 1.5 * 4) / 4
                });
            }
        }
        return rows;
    }

    // ── Card rendering (canvas → PDF) ─────────────────────────

    var FORMATS = {
        strip: { label: 'Buttstock strip', desc: 'Tape upside-down on the stock — wrist-flip read', wIn: 1.6, hIn: 4.6, maxRows: 14 },
        wrist: { label: 'Wrist coach', desc: '3×5 card for the QB wrist coach or stock pack', wIn: 3.0, hIn: 5.0, maxRows: 16 },
        page: { label: 'Full page', desc: 'Letter sheet for the range bag', wIn: 7.5, hIn: 10.0, maxRows: 40 }
    };
    var DPI = 200;

    function renderCardCanvas(rows, meta, fmt) {
        var W = Math.round(fmt.wIn * DPI);
        var H = Math.round(fmt.hIn * DPI);
        var canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#999';
        ctx.strokeRect(1, 1, W - 2, H - 2);

        var pad = Math.round(0.06 * DPI);
        var y = pad + Math.round(0.11 * DPI);
        ctx.fillStyle = '#111';
        ctx.textAlign = 'left';

        // Header: load · DA · date — so future-you knows what card this is
        var headerSize = Math.max(11, Math.round(W * 0.045));
        ctx.font = '700 ' + headerSize + 'px Arial';
        ctx.fillText(meta.loadName.slice(0, 26), pad, y);
        y += headerSize + 3;
        ctx.font = '400 ' + Math.round(headerSize * 0.8) + 'px Arial';
        ctx.fillText('DA ' + meta.da + ' ft · ' + meta.date + ' · zero ' + meta.zeroRange + 'yd', pad, y);
        y += Math.round(headerSize * 0.9);

        // Column heads
        var rowsFit = rows.slice(0, fmt.maxRows);
        var cols = ['YD', 'UP', 'W5', 'W10', 'W15'];
        var colW = (W - pad * 2) / cols.length;
        var cellSize = Math.max(10, Math.round((H - y - pad) / (rowsFit.length + 1) * 0.62));
        ctx.font = '700 ' + cellSize + 'px Arial';
        for (var c = 0; c < cols.length; c++) {
            ctx.fillText(cols[c], pad + c * colW, y + cellSize);
        }
        y += cellSize + 4;
        ctx.strokeStyle = '#bbb';
        ctx.beginPath();
        ctx.moveTo(pad, y);
        ctx.lineTo(W - pad, y);
        ctx.stroke();

        // Rows
        var rowH = (H - y - pad) / rowsFit.length;
        ctx.font = '400 ' + cellSize + 'px Arial';
        for (var i = 0; i < rowsFit.length; i++) {
            var ry = y + rowH * (i + 1) - rowH * 0.25;
            var vals = [
                String(rowsFit[i].rangeYards),
                formatNum(rowsFit[i].comeUpMOA, 2),
                formatNum(rowsFit[i].wind5, 2),
                formatNum(rowsFit[i].wind10, 2),
                formatNum(rowsFit[i].wind15, 2)
            ];
            for (var v = 0; v < vals.length; v++) {
                ctx.fillText(vals[v], pad + v * colW, ry);
            }
        }
        return canvas;
    }

    // ── Wizard ────────────────────────────────────────────────

    function buildDef(rifles, loadsByRifle) {
        return {
            id: 'dope-cards',
            version: 1,
            steps: [
                {
                    id: 'rifle', prompt: 'Which rifle?', type: 'choice',
                    choices: rifles.map(function (r) {
                        return { value: r.id, label: r.name, desc: r.caliber || '' };
                    })
                },
                {
                    id: 'load', prompt: 'Which load?', type: 'custom',
                    mount: function (el, state, api) {
                        var loads = loadsByRifle[state.answers.rifle] || [];
                        var ready = loads.filter(function (l) { return l.bulletBC && l.muzzleVelocity; });
                        if (!ready.length) {
                            el.innerHTML = '<p class="empty-state-sub" style="padding:0;">This rifle has no load with BC and muzzle velocity — add them in Profiles.</p>';
                            return;
                        }
                        var html = '';
                        for (var i = 0; i < ready.length; i++) {
                            html += '<button class="wizard-choice" data-value="' + ready[i].id + '">' +
                                '<span class="wizard-choice-label">' + escapeHtml(ready[i].name) + '</span>' +
                                '<span class="wizard-choice-desc">BC ' + ready[i].bulletBC + ' · ' + ready[i].muzzleVelocity + ' fps</span></button>';
                        }
                        el.innerHTML = html;
                        var btns = el.querySelectorAll('.wizard-choice');
                        for (var b = 0; b < btns.length; b++) {
                            btns[b].addEventListener('click', function () {
                                api.submit(this.getAttribute('data-value'));
                            });
                        }
                    },
                    validate: function (v) { return v ? null : 'Pick a load.'; }
                },
                {
                    id: 'format', prompt: 'Card format', type: 'choice',
                    choices: Object.keys(FORMATS).map(function (k) {
                        return { value: k, label: FORMATS[k].label, desc: FORMATS[k].desc };
                    })
                },
                {
                    id: 'use', prompt: 'Built for…', type: 'choice',
                    choices: [
                        { value: 'hunt', label: 'Hunting', desc: 'Every 25 yards from 100' },
                        { value: 'comp', label: 'Competition', desc: 'One row per whole MOA of come-up' }
                    ]
                },
                {
                    id: 'pack', prompt: 'How many cards?', type: 'choice',
                    choices: [
                        { value: 'single', label: 'One card', desc: 'Current conditions' },
                        { value: 'travel', label: 'Travel pack', desc: 'Three cards: sea level, 4,000 ft, 8,000 ft' }
                    ]
                }
            ]
        };
    }

    function start(db) {
        db.getAllRifles().then(function (rifles) {
            if (!rifles.length) {
                if (window.AppNav) window.AppNav.go('profiles');
                return;
            }
            Promise.all(rifles.map(function (r) { return db.getLoadsByRifle(r.id); }))
                .then(function (loadLists) {
                    var loadsByRifle = {};
                    rifles.forEach(function (r, i) { loadsByRifle[r.id] = loadLists[i]; });
                    new WizardShell(db, buildDef(rifles, loadsByRifle), {
                        modal: true,
                        onCancel: function () {},
                        onComplete: function (answers) {
                            generate(db, rifles, loadsByRifle, answers);
                        }
                    }).start();
                });
        });
    }

    function generate(db, rifles, loadsByRifle, answers) {
        var rifle = rifles.filter(function (r) { return r.id === answers.rifle; })[0];
        var load = (loadsByRifle[answers.rifle] || []).filter(function (l) { return l.id === answers.load; })[0];
        if (!rifle || !load) return;

        var mv = parseFloat(load.muzzleVelocity);
        if (rifle.hasConfigs && rifle.activeConfig === 'suppressed' &&
            typeof rifle.configVelocityDelta === 'number') {
            mv += rifle.configVelocityDelta;
        }

        var altitudes = answers.pack === 'travel' ? [0, 4000, 8000] : [null]; // null = current conditions
        var fmt = FORMATS[answers.format] || FORMATS.page;

        // Current conditions (best-effort; standard atmosphere fallback)
        var condPromise = (typeof NetService !== 'undefined' && answers.pack !== 'travel')
            ? NetService.getConditions().catch(function () { return null; })
            : Promise.resolve(null);

        condPromise.then(function (cond) {
            var canvases = altitudes.map(function (alt) {
                var pressure = alt === null
                    ? (cond && cond.pressure !== null ? cond.pressure : 29.92)
                    : estimatePressureAtAltitude(alt);
                var tempF = alt === null
                    ? (cond && cond.temperature !== null ? cond.temperature : 59)
                    : 59;
                var da = alt === null ? (cond && cond.altitude !== null ? cond.altitude : 0) : alt;

                var result = computeTrajectory({
                    muzzleVelocity: mv,
                    bc: parseFloat(load.bulletBC),
                    dragModel: load.dragModel || 'G1',
                    zeroRange: rifle.zeroRange ? parseFloat(rifle.zeroRange) : 100,
                    scopeHeight: rifle.scopeHeight ? parseFloat(rifle.scopeHeight) : 1.5,
                    bulletWeight: load.bulletWeight ? parseFloat(load.bulletWeight) : 168,
                    maxRange: answers.use === 'hunt' ? 600 : 1200,
                    rangeStep: 25,
                    windSpeedMph: 10,
                    windClockPos: 3,
                    tempF: tempF,
                    pressureInHg: pressure,
                    humidity: cond && cond.humidity !== null ? cond.humidity : 0
                });
                var rows = dopeRows(result.table, {
                    mode: answers.use,
                    scopeFactor: rifle.scopeCorrectionFactor
                });
                return renderCardCanvas(rows, {
                    loadName: load.name,
                    da: Math.round(da),
                    date: new Date().toLocaleDateString(),
                    zeroRange: rifle.zeroRange || 100
                }, fmt);
            });
            exportPdf(canvases, fmt, rifle);
        });
    }

    function exportPdf(canvases, fmt, rifle) {
        if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
            alert('PDF library failed to load — check your connection and retry.');
            return;
        }
        var doc = new window.jspdf.jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait' });
        var x = 0.5, y = 0.5;
        for (var i = 0; i < canvases.length; i++) {
            if (y + fmt.hIn > 10.5) { doc.addPage(); y = 0.5; }
            doc.addImage(canvases[i].toDataURL('image/png'), 'PNG', x, y, fmt.wIn, fmt.hIn);
            // Cut marks
            doc.setDrawColor(150);
            doc.rect(x, y, fmt.wIn, fmt.hIn);
            y += fmt.hIn + 0.3;
        }
        var blob = doc.output('blob');
        var name = 'dope-' + (rifle.name || 'rifle').replace(/[^a-z0-9-]+/gi, '-').toLowerCase() + '.pdf';

        var isMobile = navigator.maxTouchPoints > 0 && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        var file = null;
        try { file = new File([blob], name, { type: 'application/pdf' }); } catch (e) { /* older WebView */ }
        if (isMobile && file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
            navigator.share({ files: [file], title: 'DOPE card' }).catch(function () {});
            return;
        }
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    }

    return { start: start, dopeRows: dopeRows };
})();

if (typeof window !== 'undefined') {
    window.ToolActions = window.ToolActions || {};
    window.ToolActions.dopeCards = function (db) {
        DopeCards.start(db);
    };
}

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { dopeRows: DopeCards.dopeRows };
}
