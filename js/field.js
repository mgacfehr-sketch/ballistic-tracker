/**
 * field.js — steel/hit logging (F4), wind-call grader (F5), and
 * personal effective range (F6).
 *
 * F4 — Question: "Am I getting better?" · Budget B, hard 3-tap law:
 *   distance (defaults to last) → hits → shots — position is sticky,
 *   conditions auto-attach, everything is chips, zero typing.
 *   Verdict: the running session total ("23 of 30 today").
 *   Empty state: "No field shots yet — log a string in three taps."
 *
 * F5 — optional pre-shot wind call (speed + value chips) and post-shot
 *   actual; any logged call is a gift, not homework.
 *   Verdict: "You under-call full-value left winds by ~0.2 mil."
 *
 * F6 — computed card: "90% hit rate: prone 540 yd · seated 320."
 *   Empty state: "Log field shots and this card fills itself."
 *
 * FieldCore is pure and Node-tested.
 */

// ── Pure core ─────────────────────────────────────────────────

var FieldCore = {

    /**
     * Personal effective range per position.
     * Walk 100-yd bins from near to far; the effective range is the
     * far edge of the last bin (with ≥minShots) whose hit rate stays
     * at or above the threshold. A far bin below threshold ends the
     * walk — beyond-your-range is beyond your range.
     *
     * @param {Array} shots - field_shots rows {distanceYards, hits, shots, position}
     * @param {Object} [opts] - {threshold: 0.9, minShots: 5, binYards: 100}
     * @returns {Object} {position: {yards, rate, shots}} — only positions with data
     */
    computeEffectiveRange: function (shots, opts) {
        var threshold = (opts && opts.threshold) || 0.9;
        var minShots = (opts && opts.minShots) || 5;
        var bin = (opts && opts.binYards) || 100;
        var byPos = {};
        (shots || []).forEach(function (s) {
            if (!s.position || !s.shots || typeof s.distanceYards !== 'number') return;
            var b = Math.ceil(s.distanceYards / bin) * bin;
            byPos[s.position] = byPos[s.position] || {};
            var cell = byPos[s.position][b] = byPos[s.position][b] || { hits: 0, shots: 0 };
            cell.hits += s.hits || 0;
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
                var rate = cell2.hits / cell2.shots;
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

    /** Plain-English sentence for the strongest wind bias, or null. */
    windInsight: function (analysis) {
        var best = null;
        (analysis || []).forEach(function (a) {
            if (Math.abs(a.avgErrorMil) >= 0.1 && (!best || Math.abs(a.avgErrorMil) > Math.abs(best.avgErrorMil))) {
                best = a;
            }
        });
        if (!best) return null;
        var dirText = best.value.replace('-', ' ');
        return 'You ' + (best.avgErrorMil > 0 ? 'under-call' : 'over-call') + ' ' + dirText +
            ' winds by ~' + Math.abs(best.avgErrorMil).toFixed(1) + ' mil (' + best.n + ' graded calls).';
    }
};

// ── Logger UI (Budget B overlay) ──────────────────────────────

var FieldLog = (function () {

    var POSITIONS = ['prone', 'seated', 'standing', 'barricade'];
    var DISTANCES = [100, 200, 300, 400, 500, 600, 800, 1000];
    var WIND_VALUES = [
        { v: 'full-left', label: '← full' },
        { v: 'half-left', label: '← half' },
        { v: 'none', label: 'calm' },
        { v: 'half-right', label: 'half →' },
        { v: 'full-right', label: 'full →' }
    ];

    function last() {
        try {
            var raw = localStorage.getItem('yort_field_last');
            return raw ? JSON.parse(raw) : {};
        } catch (e) { return {}; }
    }

    function chipRow(id, values, selected, labelFn) {
        var html = '<div class="field-chips" id="' + id + '">';
        values.forEach(function (v) {
            var val = typeof v === 'object' ? v.v : v;
            var label = labelFn ? labelFn(v) : String(val);
            html += '<button class="field-chip' + (String(val) === String(selected) ? ' field-chip-on' : '') +
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
            windCall: null,
            windActual: null
        };
        if (!rifles.some(function (r) { return r.id === state.rifleId; })) state.rifleId = rifles[0].id;

        var overlay = document.createElement('div');
        overlay.className = 'wizard-overlay';

        function draw() {
            var html = '<div class="wizard-card field-card">';
            html += '<button class="wizard-close" aria-label="Close">×</button>';
            html += '<h3 class="wizard-prompt">Log field shots</h3>';

            html += '<select id="field-rifle" class="wizard-input" style="margin-bottom:10px;">';
            rifles.forEach(function (r) {
                html += '<option value="' + r.id + '"' + (r.id === state.rifleId ? ' selected' : '') + '>' +
                    escapeHtml(r.name) + '</option>';
            });
            html += '</select>';

            html += '<div class="field-label">Distance (yd)</div>';
            html += chipRow('field-distance', DISTANCES, state.distance);
            html += '<div class="field-label">Shots</div>';
            html += chipRow('field-shots', [5, 10, 15, 20], state.shots);
            html += '<div class="field-label">Hits</div>';
            var hitVals = [];
            for (var h = 0; h <= state.shots; h += (state.shots > 10 ? 2 : 1)) hitVals.push(h);
            if (hitVals[hitVals.length - 1] !== state.shots) hitVals.push(state.shots);
            html += chipRow('field-hits', hitVals, state.hits);
            html += '<div class="field-label">Position</div>';
            html += chipRow('field-position', POSITIONS, state.position);

            // Optional wind call (F5) — a gift, not homework
            html += '<details class="home-drawer" style="margin-top:6px;"' + (state.windCall ? ' open' : '') + '><summary>Wind call (optional)</summary>';
            html += '<div class="field-label">My call</div>';
            html += chipRow('field-wind-mph', [5, 10, 15, 20], state.windCall && state.windCall.mph);
            html += chipRow('field-wind-value', WIND_VALUES, state.windCall && state.windCall.value, function (v) { return v.label; });
            html += '<div class="field-label">What actually worked</div>';
            html += chipRow('field-wind-actual', [
                { v: '-0.5', label: '0.5 less' }, { v: '-0.2', label: '0.2 less' },
                { v: '0', label: 'my call ✓' },
                { v: '0.2', label: '0.2 more' }, { v: '0.5', label: '0.5 more' }
            ], state.windActual, function (v) { return v.label; });
            html += '</details>';

            html += '<p class="wizard-error" id="field-error"></p>';
            html += '<div class="wizard-nav"><button class="btn btn-primary wizard-next" id="field-save">Save</button></div>';
            html += '</div>';
            overlay.innerHTML = html;
            bind();
        }

        function bindChips(id, apply) {
            var row = overlay.querySelector('#' + id);
            if (!row) return;
            var chips = row.querySelectorAll('.field-chip');
            for (var i = 0; i < chips.length; i++) {
                chips[i].addEventListener('click', function () {
                    apply(this.getAttribute('data-value'));
                    draw();
                });
            }
        }

        function bind() {
            overlay.querySelector('.wizard-close').addEventListener('click', function () {
                document.body.removeChild(overlay);
            });
            overlay.querySelector('#field-rifle').addEventListener('change', function () {
                state.rifleId = this.value;
            });
            bindChips('field-distance', function (v) { state.distance = parseInt(v, 10); });
            bindChips('field-shots', function (v) {
                state.shots = parseInt(v, 10);
                if (state.hits !== null && state.hits > state.shots) state.hits = null;
            });
            bindChips('field-hits', function (v) { state.hits = parseInt(v, 10); });
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
                save(db, rifles, state, overlay);
            });
        }

        document.body.appendChild(overlay);
        draw();
    }

    function save(db, rifles, state, overlay) {
        var rifle = rifles.filter(function (r) { return r.id === state.rifleId; })[0];
        var record = {
            rifleId: state.rifleId,
            distanceYards: state.distance,
            hits: state.hits,
            shots: state.shots,
            position: state.position,
            config: rifle && rifle.hasConfigs ? (rifle.activeConfig || 'bare') : null,
            windCall: state.windCall && state.windCall.value ? state.windCall : null,
            windActual: state.windActual !== null
                ? { errorMil: parseFloat(state.windActual) } : null
        };

        try {
            localStorage.setItem('yort_field_last', JSON.stringify({
                rifleId: state.rifleId, distance: state.distance,
                shots: state.shots, position: state.position
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
