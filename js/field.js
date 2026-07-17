/**
 * field.js — steel/hit logging (F4), wind-call grader (F5), and
 * personal effective range (F6).
 *
 * F4 — Question: "Am I getting better?" · Budget B, hard 3-tap law:
 *   distance (defaults to last) → hits → shots — position, target size
 *   sticky, conditions auto-attach, everything is chips; typing only
 *   for a custom target size.
 *   Verdict: the running session total ("23 of 30 today").
 *   Empty state: "No field shots yet — log a string in three taps."
 *
 * F5 — optional pre-shot wind call (speed + value chips) and post-shot
 *   actual in the rifle's turret unit (stored canonically in mils).
 *   Verdict: "You under-call full-value left winds by ~0.2 mil."
 *
 * F6 — computed card: "90% on a 10″ vitals target: prone 540 · seated
 *   320" — hit rates normalized to vitals size via a Rayleigh model.
 *   Empty state: "Log field shots and this card fills itself."
 *
 * FieldCore is pure and Node-tested.
 */

// ── Pure core ─────────────────────────────────────────────────

var FieldCore = {

    /** Reference vitals-size target (in) that all hit rates normalize to. */
    VITALS_IN: 10,

    /** 1 milliradian in minutes of angle. */
    MIL_TO_MOA: 3.43775,

    /**
     * Normalize an observed hit rate on a targetIn-diameter plate to the
     * rate the same dispersion would produce on a vitals-size target.
     * Model: radially symmetric normal dispersion centered on the target
     * (Rayleigh miss radius), which gives the closed form
     *   p_vitals = 1 - (1 - p) ^ ((vitals / target)^2)
     * Rows with no recorded target size pass through unchanged.
     */
    normalizeHitRate: function (rate, targetIn, vitalsIn) {
        var v = vitalsIn || FieldCore.VITALS_IN;
        if (typeof targetIn !== 'number' || !(targetIn > 0) || targetIn === v) return rate;
        if (rate <= 0) return 0;
        if (rate >= 1) return 1;
        var k = (v / targetIn) * (v / targetIn);
        return 1 - Math.pow(1 - rate, k);
    },

    /**
     * Personal effective range per position.
     * Walk 100-yd bins from near to far; the effective range is the
     * far edge of the last bin (with ≥minShots) whose hit rate stays
     * at or above the threshold. A far bin below threshold ends the
     * walk — beyond-your-range is beyond your range.
     * Hit rates are normalized per string to a vitals-size target
     * (opts.vitalsIn, default 10") so an 8" plate and a 12" plate
     * grade on the same scale.
     *
     * @param {Array} shots - field_shots rows {distanceYards, hits, shots, position, targetSizeIn}
     * @param {Object} [opts] - {threshold: 0.9, minShots: 5, binYards: 100, vitalsIn: 10}
     * @returns {Object} {position: {yards, rate, shots}} — only positions with data
     */
    computeEffectiveRange: function (shots, opts) {
        var threshold = (opts && opts.threshold) || 0.9;
        var minShots = (opts && opts.minShots) || 5;
        var bin = (opts && opts.binYards) || 100;
        var vitals = (opts && opts.vitalsIn) || FieldCore.VITALS_IN;
        var byPos = {};
        (shots || []).forEach(function (s) {
            if (!s.position || !s.shots || typeof s.distanceYards !== 'number') return;
            var b = Math.ceil(s.distanceYards / bin) * bin;
            byPos[s.position] = byPos[s.position] || {};
            var cell = byPos[s.position][b] = byPos[s.position][b] || { normHits: 0, shots: 0 };
            var rawRate = (s.hits || 0) / s.shots;
            cell.normHits += s.shots * FieldCore.normalizeHitRate(rawRate, s.targetSizeIn, vitals);
            cell.shots += s.shots;
        });

        var out = {};
        for (var pos in byPos) {
            if (!byPos.hasOwnProperty(pos)) continue;
            var bins = Object.keys(byPos[pos]).map(Number).sort(function (a, b2) { return a - b2; });
            var eff = null;
            for (var i = 0; i < bins.length; i++) {
                var cell2 = byPos[pos][bins[i]];
                if (cell2.shots < minShots) continue; // not enough data to judge this bin
                var rate = cell2.normHits / cell2.shots;
                if (rate >= threshold) {
                    eff = { yards: bins[i], rate: rate, shots: cell2.shots };
                } else {
                    break; // first failing bin ends the walk
                }
            }
            if (eff) out[pos] = eff;
        }
        return out;
    },

    /**
     * Wind-call grading. wind_actual.errorMil sign convention:
     * positive = the call was UNDER (the shot needed more wind hold).
     * Returns per-value-class averages for classes with ≥minCalls.
     *
     * @returns {Array<{value, avgErrorMil, n}>}
     */
    analyzeWindCalls: function (shots, minCalls) {
        var min = minCalls || 5;
        var byValue = {};
        (shots || []).forEach(function (s) {
            if (!s.windCall || !s.windActual || typeof s.windActual.errorMil !== 'number') return;
            var v = s.windCall.value || 'none';
            byValue[v] = byValue[v] || { sum: 0, n: 0 };
            byValue[v].sum += s.windActual.errorMil;
            byValue[v].n += 1;
        });
        var out = [];
        for (var v2 in byValue) {
            if (!byValue.hasOwnProperty(v2)) continue;
            if (byValue[v2].n < min) continue;
            out.push({
                value: v2,
                avgErrorMil: Math.round(byValue[v2].sum / byValue[v2].n * 100) / 100,
                n: byValue[v2].n
            });
        }
        return out;
    },

    /**
     * Plain-English sentence for the strongest wind bias, or null.
     * Errors are stored canonically in mils; `unit` ('MOA'|'MIL') controls
     * how the magnitude is DISPLAYED so it always matches the rifle's
     * scope turrets. Defaults to mils.
     */
    windInsight: function (analysis, unit) {
        var best = null;
        (analysis || []).forEach(function (a) {
            if (Math.abs(a.avgErrorMil) >= 0.1 && (!best || Math.abs(a.avgErrorMil) > Math.abs(best.avgErrorMil))) {
                best = a;
            }
        });
        if (!best) return null;
        var dirText = best.value.replace('-', ' ');
        var mag = Math.abs(best.avgErrorMil);
        var magText = (unit || '').toUpperCase() === 'MOA'
            ? (mag * FieldCore.MIL_TO_MOA).toFixed(1) + ' MOA'
            : mag.toFixed(1) + ' mil';
        return 'You ' + (best.avgErrorMil > 0 ? 'under-call' : 'over-call') + ' ' + dirText +
            ' winds by ~' + magText + ' (' + best.n + ' graded calls).';
    }
};

// ── Logger UI (Budget B overlay) ──────────────────────────────

var FieldLog = (function () {

    var POSITIONS = ['prone', 'seated', 'standing', 'barricade'];
    var DISTANCES = [100, 200, 300, 400, 500, 600, 800, 1000];
    var TARGET_SIZES = [8, 10, 12];
    var WIND_VALUES = [
        { v: 'full-left', side: 'left', label: 'full' },
        { v: 'half-left', side: 'left', label: 'half' },
        { v: 'none', side: null, label: 'calm' },
        { v: 'half-right', side: 'right', label: 'half' },
        { v: 'full-right', side: 'right', label: 'full' }
    ];
    // Post-shot correction chips in the rifle's own turret unit.
    // Values are in that unit; converted to canonical mils at save time.
    var WIND_ACTUAL_CHIPS = {
        MIL: [
            { v: '-0.5', label: '0.5 mil less' }, { v: '-0.2', label: '0.2 mil less' },
            { v: '0', label: 'my call' },
            { v: '0.2', label: '0.2 mil more' }, { v: '0.5', label: '0.5 mil more' }
        ],
        MOA: [
            { v: '-1.5', label: '1.5 MOA less' }, { v: '-0.5', label: '0.5 MOA less' },
            { v: '0', label: 'my call' },
            { v: '0.5', label: '0.5 MOA more' }, { v: '1.5', label: '1.5 MOA more' }
        ]
    };

    /* Browser-only label builders (Icon is a window global). */
    function windValueLabel(v) {
        if (v.side === 'left') return Icon('arrow-left', 14) + ' ' + v.label;
        if (v.side === 'right') return v.label + ' ' + Icon('arrow-right', 14);
        return v.label;
    }
    function windActualLabel(v) {
        return v.v === '0' ? v.label + ' ' + Icon('check', 14) : v.label;
    }

    /** The selected rifle's turret unit — 'MIL' or 'MOA' (default). */
    function unitFor(rifles, rifleId) {
        var r = rifles.filter(function (x) { return x.id === rifleId; })[0];
        return r && String(r.angleUnit || '').toUpperCase() === 'MIL' ? 'MIL' : 'MOA';
    }

    function last() {
        try {
            var raw = localStorage.getItem('yort_field_last');
            return raw ? JSON.parse(raw) : {};
        } catch (e) { return {}; }
    }

    function chipRow(id, values, selected, labelFn) {
        var html = '<div class="chip-row u-mt-10" id="' + id + '">';
        values.forEach(function (v) {
            var val = typeof v === 'object' ? v.v : v;
            var label = labelFn ? labelFn(v) : String(val);
            html += '<button class="chip-opt' + (String(val) === String(selected) ? ' is-selected' : '') +
                '" data-value="' + val + '">' + label + '</button>';
        });
        html += '</div>';
        return html;
    }

    function open(db) {
        db.getAllRifles().then(function (rifles) {
            if (!rifles.length) {
                if (window.AppNav) window.AppNav.go('profiles');
                return;
            }
            render(db, rifles);
        });
    }

    function render(db, rifles) {
        var prev = last();
        var recent = typeof Recents !== 'undefined' ? Recents.get() : null;
        var state = {
            rifleId: prev.rifleId || (recent && recent.rifleId) || rifles[0].id,
            distance: prev.distance || 300,
            shots: prev.shots || 10,
            hits: null,
            position: prev.position || 'prone',
            targetSize: prev.targetSize || 10,
            targetCustom: false,
            windCall: null,
            windActual: null
        };
        if (!rifles.some(function (r) { return r.id === state.rifleId; })) state.rifleId = rifles[0].id;
        if (TARGET_SIZES.indexOf(state.targetSize) === -1) state.targetCustom = true;

        var overlay = document.createElement('div');
        overlay.className = 'overlay';

        function draw() {
            var html = '<div class="overlay-card">';
            html += '<button class="overlay-close" aria-label="Close">' + Icon('x', 20) + '</button>';
            html += '<h3 class="overlay-title">Log field shots</h3>';
            html += '<p class="overlay-text">Log your hits on steel or targets — yorT computes your real effective range.</p>';

            html += '<div class="field"><select id="field-rifle" class="field-input">';
            rifles.forEach(function (r) {
                html += '<option value="' + r.id + '"' + (r.id === state.rifleId ? ' selected' : '') + '>' +
                    escapeHtml(r.name) + '</option>';
            });
            html += '</select></div>';

            html += '<div class="u-label">Distance (yd)</div>';
            html += chipRow('field-distance', DISTANCES, state.distance);
            html += '<div class="u-label u-mt-14">Shots</div>';
            html += chipRow('field-shots', [5, 10, 15, 20], state.shots);
            html += '<div class="u-label u-mt-14">Hits</div>';
            var hitVals = [];
            for (var h = 0; h <= state.shots; h += (state.shots > 10 ? 2 : 1)) hitVals.push(h);
            if (hitVals[hitVals.length - 1] !== state.shots) hitVals.push(state.shots);
            html += chipRow('field-hits', hitVals, state.hits);
            html += '<div class="u-label u-mt-14">Target size</div>';
            var targetChips = TARGET_SIZES.map(function (t) { return { v: String(t), label: t + '&Prime;' }; });
            targetChips.push({ v: 'custom', label: Icon('pencil', 14) + ' inches' });
            html += chipRow('field-target', targetChips,
                state.targetCustom ? 'custom' : String(state.targetSize),
                function (v) { return v.label; });
            html += '<div class="field u-mt-10' + (state.targetCustom ? '' : ' hidden') + '">' +
                '<input type="number" id="field-target-custom" min="1" max="60" step="0.5" inputmode="decimal" placeholder="Target size (in)" value="' +
                (state.targetCustom && state.targetSize ? state.targetSize : '') + '"></div>';
            html += '<div class="u-label u-mt-14">Position</div>';
            html += chipRow('field-position', POSITIONS, state.position);

            // Optional wind call (F5) — a gift, not homework
            var unit = unitFor(rifles, state.rifleId);
            html += '<details class="fold u-mt-14"' + (state.windCall ? ' open' : '') + '><summary>Wind call (optional)</summary>';
            html += '<div class="fold-body">';
            html += '<div class="u-label">My call</div>';
            html += chipRow('field-wind-mph', [5, 10, 15, 20], state.windCall && state.windCall.mph);
            html += chipRow('field-wind-value', WIND_VALUES, state.windCall && state.windCall.value, windValueLabel);
            html += '<div class="u-label u-mt-14">What actually worked (' + (unit === 'MIL' ? 'mil' : 'MOA') + ')</div>';
            html += chipRow('field-wind-actual', WIND_ACTUAL_CHIPS[unit], state.windActual, windActualLabel);
            html += '</div></details>';

            html += '<p class="field-error" id="field-error"></p>';
            html += '<button class="action-primary u-mt-10" id="field-save">Save</button>';
            html += '</div>';
            overlay.innerHTML = html;
            bind();
        }

        function bindChips(id, apply) {
            var row = overlay.querySelector('#' + id);
            if (!row) return;
            var chips = row.querySelectorAll('.chip-opt');
            for (var i = 0; i < chips.length; i++) {
                chips[i].addEventListener('click', function () {
                    apply(this.getAttribute('data-value'));
                    draw();
                });
            }
        }

        function bind() {
            overlay.querySelector('.overlay-close').addEventListener('click', function () {
                document.body.removeChild(overlay);
            });
            overlay.querySelector('#field-rifle').addEventListener('change', function () {
                var prevUnit = unitFor(rifles, state.rifleId);
                state.rifleId = this.value;
                if (unitFor(rifles, state.rifleId) !== prevUnit) {
                    state.windActual = null; // chips are in the turret unit — a stale pick would lie
                    draw();
                }
            });
            bindChips('field-distance', function (v) { state.distance = parseInt(v, 10); });
            bindChips('field-shots', function (v) {
                state.shots = parseInt(v, 10);
                if (state.hits !== null && state.hits > state.shots) state.hits = null;
            });
            bindChips('field-hits', function (v) { state.hits = parseInt(v, 10); });
            bindChips('field-target', function (v) {
                if (v === 'custom') {
                    state.targetCustom = true;
                } else {
                    state.targetCustom = false;
                    state.targetSize = parseFloat(v);
                }
            });
            var customTarget = overlay.querySelector('#field-target-custom');
            if (customTarget) {
                customTarget.addEventListener('input', function () {
                    state.targetSize = parseFloat(this.value) || null; // no draw() — keep focus
                });
            }
            bindChips('field-position', function (v) { state.position = v; });
            bindChips('field-wind-mph', function (v) {
                state.windCall = state.windCall || {};
                state.windCall.mph = parseInt(v, 10);
            });
            bindChips('field-wind-value', function (v) {
                state.windCall = state.windCall || {};
                state.windCall.value = v;
            });
            bindChips('field-wind-actual', function (v) { state.windActual = v; });

            overlay.querySelector('#field-save').addEventListener('click', function () {
                if (state.hits === null) {
                    overlay.querySelector('#field-error').textContent = 'Tap your hit count.';
                    return;
                }
                if (state.targetCustom && !(state.targetSize > 0)) {
                    overlay.querySelector('#field-error').textContent = 'Enter your target size in inches.';
                    return;
                }
                save(db, rifles, state, overlay);
            });
        }

        document.body.appendChild(overlay);
        draw();
    }

    function save(db, rifles, state, overlay) {
        var rifle = rifles.filter(function (r) { return r.id === state.rifleId; })[0];
        var unit = unitFor(rifles, state.rifleId);
        var windActual = null;
        if (state.windActual !== null) {
            var entered = parseFloat(state.windActual);
            windActual = {
                // canonical mils — the grader's pure core aggregates errorMil
                errorMil: Math.round((unit === 'MOA' ? entered / FieldCore.MIL_TO_MOA : entered) * 1000) / 1000,
                unit: unit,
                value: entered
            };
        }
        var record = {
            rifleId: state.rifleId,
            distanceYards: state.distance,
            hits: state.hits,
            shots: state.shots,
            position: state.position,
            targetSizeIn: state.targetSize > 0 ? state.targetSize : null,
            config: rifle && rifle.hasConfigs ? (rifle.activeConfig || 'bare') : null,
            windCall: state.windCall && state.windCall.value ? state.windCall : null,
            windActual: windActual
        };

        try {
            localStorage.setItem('yort_field_last', JSON.stringify({
                rifleId: state.rifleId, distance: state.distance,
                shots: state.shots, position: state.position,
                targetSize: state.targetSize
            }));
        } catch (e) { /* stickiness is best-effort */ }

        // Conditions attach silently, best-effort — never blocks the save
        var condPromise = typeof NetService !== 'undefined'
            ? NetService.getConditions().catch(function () { return null; })
            : Promise.resolve(null);

        condPromise.then(function (cond) {
            record.weather = cond || null;
            return db.addFieldShot(record);
        }).then(function () {
            document.body.removeChild(overlay);
        }).catch(function (err) {
            var errEl = overlay.querySelector('#field-error');
            if (errEl) errEl.textContent = 'Save failed: ' + err.message;
        });
    }

    return { open: open };
})();

if (typeof window !== 'undefined') {
    window.ToolActions = window.ToolActions || {};
    window.ToolActions.fieldLog = function (db) {
        FieldLog.open(db);
    };
}

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FieldCore: FieldCore };
}
