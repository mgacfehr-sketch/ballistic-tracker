/**
 * ladder.js — multi-group ladder test over the existing session engine.
 *
 * Question: "Which ammo?" · Budget C (guided, at the bench/range).
 * Verdict: "41.8–42.2 is your window." · Empty state (Home action):
 * a one-card explainer that routes into a normal session. · Taps:
 * normal session + shots-per-group chip + one labels field + Analyze.
 *
 * Flow: shoot the multi-bull ladder like any session (one photo, tap
 * every hole IN FIRE ORDER), then on the results step "Split into
 * ladder groups": impacts are grouped in tap order (k per charge),
 * each group gets its charge label, and the pure ladderAnalysis finds
 * the stable window — consecutive charges whose POI holds still.
 */

var LadderCore = {

    /**
     * @param {Array} series - [{label, impacts: [{x,y} pixels]}]
     * @param {number} distanceYards
     * @param {number} pixelsPerInch
     * @param {number} [windowMOA=0.35] - max adjacent vertical POI
     *   shift that still counts as "stable"
     * @returns {{groups, window: {startIdx, endIdx}|null, sentence}}
     */
    ladderAnalysis: function (series, distanceYards, pixelsPerInch, windowMOA) {
        var thresholdIn = moaToInches(windowMOA || 0.35, distanceYards);
        var groups = series.map(function (g) {
            var centroid = calculateCentroid(g.impacts);
            var size = g.impacts.length >= 2
                ? calculateGroupSize(g.impacts, pixelsPerInch).inches : 0;
            return {
                label: g.label,
                shots: g.impacts.length,
                centroidYIn: round4(centroid.y / pixelsPerInch),
                sizeInches: round4(size),
                sizeMOA: round4(inchesToMOA(size, distanceYards))
            };
        });

        // Longest run of consecutive groups with adjacent vertical POI
        // shift ≤ threshold (first run wins ties); runs need ≥2 groups
        var best = null;
        var runStart = 0;
        for (var i = 1; i <= groups.length; i++) {
            var stable = i < groups.length &&
                Math.abs(groups[i].centroidYIn - groups[i - 1].centroidYIn) <= thresholdIn;
            if (!stable) {
                var len = i - runStart;
                if (len >= 2 && (!best || len > best.endIdx - best.startIdx + 1)) {
                    best = { startIdx: runStart, endIdx: i - 1 };
                }
                runStart = i;
            }
        }

        var sentence = best
            ? groups[best.startIdx].label + '–' + groups[best.endIdx].label + ' is your window.'
            : 'No stable window in this series — the POI moves at every step.';

        return { groups: groups, window: best, sentence: sentence };
    },

    /**
     * Split impacts into groups of k, in tap order. A short last group
     * is kept (flagged by shots count).
     */
    splitByTapOrder: function (impacts, k, labels) {
        var series = [];
        for (var i = 0; i < impacts.length; i += k) {
            series.push({
                label: labels[series.length] !== undefined ? labels[series.length] : 'Group ' + (series.length + 1),
                impacts: impacts.slice(i, i + k)
            });
        }
        return series;
    }
};

// ── UI ────────────────────────────────────────────────────────

var LadderManager = (function () {

    /** Launched from the session results step. */
    function open(sessionFlow) {
        var impacts = sessionFlow.impacts;
        var overlay = document.createElement('div');
        overlay.className = 'wizard-overlay';
        var state = { k: 3 };

        function draw() {
            var groups = Math.ceil(impacts.length / state.k);
            var html = '<div class="wizard-card field-card">';
            html += '<button class="wizard-close" aria-label="Close">×</button>';
            html += '<h3 class="wizard-prompt">Split into ladder groups</h3>';
            html += '<p class="chrono-hint">' + impacts.length + ' impacts, in the order you tapped them.</p>';
            html += '<div class="field-label">Shots per charge</div>';
            html += '<div class="field-chips">';
            [2, 3, 4, 5].forEach(function (k) {
                html += '<button class="field-chip' + (k === state.k ? ' field-chip-on' : '') + '" data-k="' + k + '">' + k + '</button>';
            });
            html += '</div>';
            html += '<div class="field-label">Charge labels — ' + groups + ' groups, comma-separated (e.g. 41.4, 41.6, 41.8)</div>';
            html += '<input type="text" class="wizard-input" id="ladder-labels" placeholder="41.4, 41.6, 41.8, 42.0">';
            if (impacts.length % state.k !== 0) {
                html += '<p class="chrono-hint" style="color:var(--calibration-color);">⚠ ' + impacts.length + ' impacts don\'t divide evenly by ' + state.k + ' — the last group will be short.</p>';
            }
            html += '<p class="wizard-error" id="ladder-error"></p>';
            html += '<div class="wizard-nav"><button class="btn btn-primary wizard-next" id="ladder-analyze">Analyze</button></div>';
            html += '<div id="ladder-result"></div>';
            html += '</div>';
            overlay.innerHTML = html;
            bind();
        }

        function bind() {
            overlay.querySelector('.wizard-close').addEventListener('click', function () {
                document.body.removeChild(overlay);
            });
            var chips = overlay.querySelectorAll('.field-chip');
            for (var i = 0; i < chips.length; i++) {
                chips[i].addEventListener('click', function () {
                    state.k = parseInt(this.getAttribute('data-k'), 10);
                    draw();
                });
            }
            overlay.querySelector('#ladder-analyze').addEventListener('click', analyze);
        }

        function analyze() {
            var labels = (overlay.querySelector('#ladder-labels').value || '')
                .split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            var groups = Math.ceil(impacts.length / state.k);
            if (labels.length !== groups) {
                overlay.querySelector('#ladder-error').textContent =
                    'Enter ' + groups + ' labels (got ' + labels.length + ').';
                return;
            }
            var series = LadderCore.splitByTapOrder(impacts, state.k, labels);
            var analysis = LadderCore.ladderAnalysis(
                series, sessionFlow.distanceYards, sessionFlow.calibration.pixelsPerInch);
            renderResult(series, analysis);
        }

        function renderResult(series, analysis) {
            var el = overlay.querySelector('#ladder-result');
            var html = '<h3 class="wizard-prompt" style="margin-top:14px;">' + analysis.sentence + '</h3>';
            html += '<canvas id="ladder-chart" class="sc-canvas" width="600" height="260"></canvas>';
            html += '<table class="chrono-table"><thead><tr><th>Charge</th><th>Shots</th><th>POI (in)</th><th>Group (MOA)</th></tr></thead><tbody>';
            analysis.groups.forEach(function (g, i) {
                var inWin = analysis.window && i >= analysis.window.startIdx && i <= analysis.window.endIdx;
                html += '<tr' + (inWin ? ' class="report-rec-row"' : '') + '><td>' + escapeHtml(g.label) +
                    (inWin ? ' ★' : '') + '</td><td>' + g.shots + '</td><td>' +
                    formatNum(g.centroidYIn, 2) + '</td><td>' + formatNum(g.sizeMOA, 2) + '</td></tr>';
            });
            html += '</tbody></table>';
            html += '<div class="wizard-nav"><button class="btn btn-primary wizard-next" id="ladder-attach">Attach to session</button></div>';
            el.innerHTML = html;

            drawChart(el.querySelector('#ladder-chart'), analysis);

            el.querySelector('#ladder-attach').addEventListener('click', function () {
                sessionFlow.ladderResult = {
                    shotsPerGroup: state.k,
                    series: analysis.groups,
                    window: analysis.window
                        ? { startLabel: analysis.groups[analysis.window.startIdx].label,
                            endLabel: analysis.groups[analysis.window.endIdx].label }
                        : null,
                    sentence: analysis.sentence
                };
                document.body.removeChild(overlay);
                var status = document.getElementById('zero-guardian-banner');
                if (status) {
                    var note = document.createElement('p');
                    note.className = 'chrono-hint';
                    note.textContent = 'Ladder attached — Save Session stores it. ' + analysis.sentence;
                    status.parentNode.insertBefore(note, status);
                }
            });
        }

        function drawChart(canvas, analysis) {
            if (!canvas) return;
            var ctx2 = canvas.getContext('2d');
            var W = canvas.width, H = canvas.height, pad = 34;
            ctx2.fillStyle = '#1e1e1e';
            ctx2.fillRect(0, 0, W, H);
            var ys = analysis.groups.map(function (g) { return g.centroidYIn; });
            var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
            var span = Math.max(maxY - minY, 0.5);
            function px(i) { return pad + i * (W - 2 * pad) / Math.max(analysis.groups.length - 1, 1); }
            function py(v) { return pad + (v - minY) / span * (H - 2 * pad); }

            // Stable-window band
            if (analysis.window) {
                ctx2.fillStyle = 'rgba(76,175,80,0.15)';
                ctx2.fillRect(px(analysis.window.startIdx) - 10, 0,
                    px(analysis.window.endIdx) - px(analysis.window.startIdx) + 20, H);
            }
            // POI line
            ctx2.strokeStyle = '#4caf50';
            ctx2.lineWidth = 2;
            ctx2.beginPath();
            ys.forEach(function (v, i) {
                if (i === 0) ctx2.moveTo(px(i), py(v));
                else ctx2.lineTo(px(i), py(v));
            });
            ctx2.stroke();
            // Points + labels
            ctx2.fillStyle = '#e0e0e0';
            ctx2.font = '11px Arial';
            ctx2.textAlign = 'center';
            analysis.groups.forEach(function (g, i) {
                ctx2.beginPath();
                ctx2.arc(px(i), py(g.centroidYIn), 4, 0, Math.PI * 2);
                ctx2.fillStyle = '#4caf50';
                ctx2.fill();
                ctx2.fillStyle = '#888';
                ctx2.fillText(g.label, px(i), H - 8);
            });
        }

        document.body.appendChild(overlay);
        draw();
    }

    /** Home action: explain, then route into a normal session. */
    function info() {
        var overlay = document.createElement('div');
        overlay.className = 'wizard-overlay';
        overlay.innerHTML = '<div class="wizard-card">' +
            '<h3 class="wizard-prompt">Run a ladder test</h3>' +
            '<p class="chrono-hint">Shoot it like a normal target session: one photo of the multi-bull target, then tap every hole <strong>in fire order</strong>. On the results step, tap "Split into ladder groups" — yorT charts the POI and finds your stable window.</p>' +
            '<div class="wizard-nav"><button class="btn btn-primary wizard-next" id="ladder-go">Start a session</button></div></div>';
        document.body.appendChild(overlay);
        overlay.querySelector('#ladder-go').addEventListener('click', function () {
            document.body.removeChild(overlay);
            if (window.AppNav) window.AppNav.go('session');
        });
    }

    return { open: open, info: info };
})();

if (typeof window !== 'undefined') {
    window.ToolActions = window.ToolActions || {};
    window.ToolActions.ladderInfo = function () {
        LadderManager.info();
    };
}

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LadderCore: LadderCore };
}
