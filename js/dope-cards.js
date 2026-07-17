/**
 * dope-cards.js — printable DOPE / range cards.
 *
 * Question: "What do I dial?" · Budget C (2-minute wizard at home).
 * Verdict: the card IS the verdict — laminated paper on the stock.
 * Empty state (in the wizard): "This load needs BC and muzzle velocity
 * — add them in Profiles." · Taps: 5 wizard taps → preview → PDF.
 *
 * Uses the SAME trued inputs as the solver: computeTrajectory(), the
 * rifle's scope-tracking correction (come-ups pre-corrected on paper),
 * and the suppressed velocity delta when the rifle runs a can. Wind
 * columns at user-chosen full-value speeds (linear scaling of the
 * 10 mph solution — drift is linear in crosswind speed for a fixed
 * trajectory).
 *
 * Formats sized to the holders people actually own: buttstock strip
 * (1.6"×4.6"), wrist-coach card (3"×5"), full page. Altitudes are
 * user-chosen (defaulting to the shooter's CURRENT GPS altitude, with
 * presets and custom entry); one card prints per selected altitude.
 */

var DopeCards = (function () {

    // ── Pure: table → card rows ───────────────────────────────

    /**
     * @param {Array} table - computeTrajectory().table (10 mph wind basis)
     * @param {Object} opts - { mode: 'hunt'|'comp', scopeFactor, windSpeeds }
     *   hunt: every 25 yd from 100; comp: one row per whole corrected
     *   come-up MOA (even-drop-value rows). windSpeeds: mph values that
     *   get columns (default [5,10,15]); drift scales linearly off the
     *   10 mph solution.
     * @returns {Array<{rangeYards, comeUpMOA, winds: number[]}>}
     */
    function dopeRows(table, opts) {
        var mode = (opts && opts.mode) || 'hunt';
        var factor = opts && opts.scopeFactor;
        var windSpeeds = (opts && opts.windSpeeds && opts.windSpeeds.length)
            ? opts.windSpeeds : [5, 10, 15];
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
                    winds: windSpeeds.map(function (mph) {
                        return Math.round(r.windDriftMOA * (mph / 10) * 4) / 4;
                    })
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
        var cols = ['YD', 'UP'].concat((meta.windSpeeds || [5, 10, 15]).map(function (w) { return 'W' + w; }));
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
                formatNum(rowsFit[i].comeUpMOA, 2)
            ].concat(rowsFit[i].winds.map(function (wv) { return formatNum(wv, 2); }));
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
            version: 2,
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
                            el.innerHTML = '<div class="empty-teach">' +
                                '<p>This rifle has no load with BC and muzzle velocity — add them on the rifle page.</p>' +
                                '<button class="action" id="dope-no-load">Open rifles</button></div>';
                            el.querySelector('#dope-no-load').addEventListener('click', function () {
                                var close = document.getElementById('wizard-close');
                                if (close) close.click(); // wizard persists — resumable
                                if (window.AppNav) window.AppNav.go('profiles');
                            });
                            return;
                        }
                        var html = '<div class="choice-stack">';
                        for (var i = 0; i < ready.length; i++) {
                            html += '<button class="choice-plate" data-value="' + ready[i].id + '">' +
                                '<span>' + escapeHtml(ready[i].name) +
                                '<span class="choice-desc">BC ' + ready[i].bulletBC + ' &middot; ' + ready[i].muzzleVelocity + ' fps</span></span>' +
                                Icon('chevron-right', 18) + '</button>';
                        }
                        html += '</div>';
                        el.innerHTML = html;
                        var btns = el.querySelectorAll('.choice-plate');
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
                    id: 'cards', prompt: 'Altitudes & wind columns', type: 'custom',
                    mount: function (el, state, api) {
                        var ALTS = [0, 2000, 4000, 6000, 8000, 10000];
                        var WINDS = [5, 10, 15, 20];
                        var sel = { alts: { current: true }, winds: { 5: true, 10: true, 15: true } };

                        function altLabel(ft) {
                            return ft === 0 ? 'Sea level' : ft.toLocaleString() + ' ft';
                        }

                        var html = '<p class="t-body u-quiet u-mb-12">One card prints per altitude.</p>';
                        html += '<div class="u-label">Altitudes</div>';
                        html += '<div class="chip-row u-mt-10" id="dope-alts">';
                        html += '<button class="chip-opt is-selected" data-alt="current">' + Icon('map-pin', 14) + ' Current altitude</button>';
                        ALTS.forEach(function (ft) {
                            html += '<button class="chip-opt" data-alt="' + ft + '">' + altLabel(ft) + '</button>';
                        });
                        html += '<button class="chip-opt" id="dope-alt-toggle">' + Icon('pencil', 14) + ' custom</button>';
                        html += '</div>';
                        html += '<div class="field u-mt-10 hidden" id="dope-alt-wrap">' +
                            '<input type="number" id="dope-alt-custom" min="-1000" max="15000" step="100" inputmode="numeric" placeholder="Custom altitude (ft)">' +
                            '<p class="field-hint">Enter an altitude — it joins the list, selected.</p></div>';
                        html += '<div class="u-label u-mt-14">Wind columns (mph, full value)</div>';
                        html += '<div class="chip-row u-mt-10" id="dope-winds">';
                        WINDS.forEach(function (mph) {
                            html += '<button class="chip-opt' + (sel.winds[mph] ? ' is-selected' : '') + '" data-wind="' + mph + '">' + mph + '</button>';
                        });
                        html += '</div>';
                        html += '<p class="field-error" id="dope-cards-error"></p>';
                        html += '<button class="action-primary u-mt-14" id="dope-cards-go" type="button">Create cards</button>';
                        el.innerHTML = html;

                        // Label the current-altitude chip with the GPS number (best-effort)
                        if (typeof NetService !== 'undefined') {
                            NetService.getConditions().then(function (cond) {
                                var chip = el.querySelector('[data-alt="current"]');
                                if (chip && cond && cond.altitude !== null) {
                                    chip.innerHTML = Icon('map-pin', 14) + ' Current (' + cond.altitude.toLocaleString() + ' ft)';
                                }
                            }).catch(function () { /* GPS off — standard atmosphere fallback at print */ });
                        }

                        function bindToggles(rootId, attr, map) {
                            var chips = el.querySelector('#' + rootId).querySelectorAll('.chip-opt[' + attr + ']');
                            for (var i = 0; i < chips.length; i++) {
                                chips[i].addEventListener('click', function () {
                                    var key = this.getAttribute(attr);
                                    map[key] = !map[key];
                                    this.classList.toggle('is-selected', !!map[key]);
                                });
                            }
                        }
                        bindToggles('dope-alts', 'data-alt', sel.alts);
                        bindToggles('dope-winds', 'data-wind', sel.winds);

                        // The custom chip reveals a number field; a committed
                        // value becomes a selected altitude chip.
                        el.querySelector('#dope-alt-toggle').addEventListener('click', function () {
                            var wrap = el.querySelector('#dope-alt-wrap');
                            wrap.classList.toggle('hidden');
                            this.classList.toggle('is-selected', !wrap.classList.contains('hidden'));
                            if (!wrap.classList.contains('hidden')) {
                                el.querySelector('#dope-alt-custom').focus();
                            }
                        });
                        el.querySelector('#dope-alt-custom').addEventListener('change', function () {
                            var input = this;
                            if (input.value === '') return; // cleared — nothing to add
                            var ft = Math.round(parseFloat(input.value));
                            if (isNaN(ft) || ft < -1000 || ft > 15000) {
                                el.querySelector('#dope-cards-error').textContent = 'Altitude must be between -1,000 and 15,000 ft.';
                                return;
                            }
                            el.querySelector('#dope-cards-error').textContent = '';
                            if (!el.querySelector('[data-alt="' + ft + '"]')) {
                                var chip = document.createElement('button');
                                chip.className = 'chip-opt is-selected';
                                chip.setAttribute('data-alt', String(ft));
                                chip.textContent = altLabel(ft);
                                chip.addEventListener('click', function () {
                                    sel.alts[ft] = !sel.alts[ft];
                                    this.classList.toggle('is-selected', !!sel.alts[ft]);
                                });
                                el.querySelector('#dope-alts').insertBefore(chip, el.querySelector('#dope-alt-toggle'));
                            }
                            sel.alts[ft] = true;
                            var existing = el.querySelector('[data-alt="' + ft + '"]');
                            if (existing) existing.classList.add('is-selected');
                            input.value = '';
                        });

                        el.querySelector('#dope-cards-go').addEventListener('click', function () {
                            var altitudes = [];
                            var windSpeeds = [];
                            for (var a in sel.alts) {
                                if (sel.alts.hasOwnProperty(a) && sel.alts[a]) {
                                    altitudes.push(a === 'current' ? 'current' : parseInt(a, 10));
                                }
                            }
                            for (var w in sel.winds) {
                                if (sel.winds.hasOwnProperty(w) && sel.winds[w]) windSpeeds.push(parseInt(w, 10));
                            }
                            if (!altitudes.length) {
                                el.querySelector('#dope-cards-error').textContent = 'Pick at least one altitude.';
                                return;
                            }
                            if (!windSpeeds.length) {
                                el.querySelector('#dope-cards-error').textContent = 'Pick at least one wind speed.';
                                return;
                            }
                            // Current first, then ascending altitudes
                            altitudes.sort(function (x, y) {
                                if (x === 'current') return -1;
                                if (y === 'current') return 1;
                                return x - y;
                            });
                            windSpeeds.sort(function (x, y) { return x - y; });
                            api.submit({ altitudes: altitudes, windSpeeds: windSpeeds });
                        });
                    },
                    validate: function (v) {
                        return v && v.altitudes && v.altitudes.length && v.windSpeeds && v.windSpeeds.length
                            ? null : 'Pick at least one altitude and wind speed.';
                    }
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

        var picks = answers.cards || {};
        // 'current' → null sentinel = live GPS conditions at print time
        var altitudes = (picks.altitudes && picks.altitudes.length ? picks.altitudes : ['current'])
            .map(function (a) { return a === 'current' ? null : a; });
        var windSpeeds = picks.windSpeeds && picks.windSpeeds.length ? picks.windSpeeds : [5, 10, 15];
        var fmt = FORMATS[answers.format] || FORMATS.page;

        // Current conditions (best-effort; standard atmosphere fallback) —
        // only fetched when a "current altitude" card was requested
        var condPromise = (typeof NetService !== 'undefined' && altitudes.indexOf(null) !== -1)
            ? NetService.getConditions().catch(function () { return null; })
            : Promise.resolve(null);

        // Preview overlay: progress text now, first card + export once built
        var overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.innerHTML = '<div class="overlay-card">' +
            '<button class="overlay-close" aria-label="Close">' + Icon('x', 20) + '</button>' +
            '<h3 class="overlay-title">Your cards</h3>' +
            '<div id="dope-preview"><p class="t-body u-quiet">Building your cards…</p></div></div>';
        document.body.appendChild(overlay);
        overlay.querySelector('.overlay-close').addEventListener('click', function () {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        });

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
                    scopeFactor: rifle.scopeCorrectionFactor,
                    windSpeeds: windSpeeds
                });
                return renderCardCanvas(rows, {
                    loadName: load.name,
                    da: Math.round(da),
                    date: new Date().toLocaleDateString(),
                    zeroRange: rifle.zeroRange || 100,
                    windSpeeds: windSpeeds
                }, fmt);
            });
            var box = overlay.querySelector('#dope-preview');
            box.innerHTML = '<p class="t-body u-mb-12">' + canvases.length + ' card' +
                (canvases.length === 1 ? '' : 's') + ' ready — ' + fmt.label +
                (canvases.length > 1 ? ', one per altitude.' : '.') + '</p>' +
                '<img class="plate-img" alt="DOPE card preview" src="' + canvases[0].toDataURL('image/png') + '">' +
                '<p class="t-micro u-mt-10">Print at 100% scale and cut on the gray marks.</p>' +
                '<button class="action-primary u-mt-14" id="dope-export">Export PDF</button>';
            box.querySelector('#dope-export').addEventListener('click', function () {
                exportPdf(canvases, fmt, rifle);
            });
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
