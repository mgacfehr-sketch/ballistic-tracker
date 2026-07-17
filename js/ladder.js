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
        overlay.className = 'overlay';
        var state = { k: 3 };

        function draw() {
            var groups = Math.ceil(impacts.length / state.k);
            var html = '<div class="overlay-card">';
            html += '<button class="overlay-close" aria-label="Close">' + Icon('x', 20) + '</button>';
            html += '<h3 class="overlay-title">Split into ladder groups</h3>';
            html += '<p class="overlay-text">' + impacts.length + ' impacts, in the order you tapped them.</p>';
            html += '<div class="u-label">Shots per charge</div>';
            html += '<div class="chip-row u-mt-10" id="ladder-k">';
            [2, 3, 4, 5].forEach(function (k) {
                html += '<button class="chip-opt' + (k === state.k ? ' is-selected' : '') + '" data-k="' + k + '">' + k + '</button>';
            });
            html += '</div>';
            html += '<div class="field u-mt-14"><label class="field-label">Charge labels</label>' +
                '<input type="text" id="ladder-labels" placeholder="41.4, 41.6, 41.8, 42.0">' +
                '<p class="field-hint">' + groups + ' groups, comma-separated (e.g. 41.4, 41.6, 41.8)</p></div>';
            if (impacts.length % state.k !== 0) {
                html += '<div class="alert-strip u-mb-12">' + Icon('alert', 18) + '<span>' + impacts.length + ' impacts don\'t divide evenly by ' + state.k + ' — the last group will be short.</span></div>';
            }
            html += '<p class="field-error" id="ladder-error"></p>';
            html += '<button class="action-primary u-mt-10" id="ladder-analyze">Analyze</button>';
            html += '<div id="ladder-result"></div>';
            html += '</div>';
            overlay.innerHTML = html;
            bind();
        }

        function bind() {
            overlay.querySelector('.overlay-close').addEventListener('click', function () {
                document.body.removeChild(overlay);
            });
            var chips = overlay.querySelectorAll('#ladder-k .chip-opt');
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
            // Results shown — the verdict leads, and Attach becomes the
            // screen's one primary (Analyze demotes to a quiet action).
            var analyzeBtn = overlay.querySelector('#ladder-analyze');
            if (analyzeBtn) analyzeBtn.className = 'action u-full u-mt-10';

            var el = overlay.querySelector('#ladder-result');
            var html = '<p class="t-head u-mt-14">' + escapeHtml(analysis.sentence) + '</p>';
            html += '<canvas id="ladder-chart" class="u-mt-10" width="600" height="260"></canvas>';
            html += '<div class="datatable-wrap u-mt-14"><table class="datatable"><thead><tr><th>Charge</th><th>Shots</th><th>POI (in)</th><th>Group (MOA)</th></tr></thead><tbody>';
            analysis.groups.forEach(function (g, i) {
                var inWin = analysis.window && i >= analysis.window.startIdx && i <= analysis.window.endIdx;
                html += '<tr' + (inWin ? ' class="is-marked"' : '') + '><td>' +
                    (inWin ? Icon('star', 12) + ' ' : '') + escapeHtml(g.label) +
                    '</td><td>' + g.shots + '</td><td>' +
                    formatNum(g.centroidYIn, 2) + '</td><td>' + formatNum(g.sizeMOA, 2) + '</td></tr>';
            });
            html += '</tbody></table></div>';
            html += '<button class="action-primary u-mt-14" id="ladder-attach">Attach to session</button>';
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
                    var note = document.createElement('span');
                    note.className = 'alert-strip is-go u-mt-10';
                    note.innerHTML = Icon('check', 14) + ' ' +
                        escapeHtml('Ladder attached — Save Session stores it. ' + analysis.sentence);
                    status.parentNode.insertBefore(note, status);
                }
            });
        }

        function drawChart(canvas, analysis) {
            if (!canvas) return;
            // Size the drawing buffer to the card's content width (canvas-
            // computed geometry — attributes, not CSS).
            if (canvas.parentNode && canvas.parentNode.clientWidth) {
                canvas.width = canvas.parentNode.clientWidth;
            }
            var ctx2 = canvas.getContext('2d');
            var W = canvas.width, H = canvas.height, pad = 34;
            ctx2.fillStyle = '#1B1F23';
            ctx2.fillRect(0, 0, W, H);
            ctx2.strokeStyle = '#2A3036';
            ctx2.strokeRect(0.5, 0.5, W - 1, H - 1);
            var ys = analysis.groups.map(function (g) { return g.centroidYIn; });
            var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
            var span = Math.max(maxY - minY, 0.5);
            function px(i) { return pad + i * (W - 2 * pad) / Math.max(analysis.groups.length - 1, 1); }
            function py(v) { return pad + (v - minY) / span * (H - 2 * pad); }

            // Stable-window band (brass)
            if (analysis.window) {
                ctx2.fillStyle = 'rgba(217, 161, 59, 0.14)';
                ctx2.fillRect(px(analysis.window.startIdx) - 10, 0,
                    px(analysis.window.endIdx) - px(analysis.window.startIdx) + 20, H);
            }
            // POI line
            ctx2.strokeStyle = '#46B268';
            ctx2.lineWidth = 2;
            ctx2.beginPath();
            ys.forEach(function (v, i) {
                if (i === 0) ctx2.moveTo(px(i), py(v));
                else ctx2.lineTo(px(i), py(v));
            });
            ctx2.stroke();
            // Points + labels
            ctx2.fillStyle = '#9BA6AE';
            ctx2.font = '11px Arial';
            ctx2.textAlign = 'center';
            analysis.groups.forEach(function (g, i) {
                ctx2.beginPath();
                ctx2.arc(px(i), py(g.centroidYIn), 4, 0, Math.PI * 2);
                ctx2.fillStyle = '#46B268';
                ctx2.fill();
                ctx2.fillStyle = '#9BA6AE';
                ctx2.fillText(g.label, px(i), H - 8);
            });
        }

        document.body.appendChild(overlay);
        draw();
    }

    /** Home action: explain, then route into a normal session. */
    function info() {
        var overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.innerHTML = '<div class="overlay-card">' +
            '<h3 class="overlay-title">Run a ladder test</h3>' +
            '<p class="t-body u-quiet u-mb-12">Shoot it like a normal target session: one photo of the multi-bull target, then tap every hole <strong>in fire order</strong>. On the results step, tap "Split into ladder groups" — yorT charts the POI and finds your stable window.</p>' +
            '<button class="action-primary u-mt-10" id="ladder-go">Start a session</button></div>';
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
