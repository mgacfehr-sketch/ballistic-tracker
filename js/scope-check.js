/**
 * scope-check.js — scope-tracking verification (tall-target test).
 *
 * Question: "Is my equipment telling the truth?" · Budget C (wizard).
 * Verdict-first overlay: TRACKS TRUE, or CORRECTED with "Your clicks
 * are X% small — every solution now corrected automatically."
 * Empty state elsewhere: "This scope's tracking has never been
 * verified." + [Verify scope tracking].
 *
 * Flow (WizardShell): rifle → click value → clicks dialed → one photo
 * with four taps (two scale marks 6" apart on the yorT target grid,
 * then bottom POI, top POI). No typing at the range beyond the click
 * count. The measured correction factor stores on the rifle and is
 * applied silently by the solver, DOPE cards, and Zero Guardian.
 */

var ScopeCheck = (function () {

    var MEASURE_TAPS = [
        'Tap the FIRST grid mark (any two marks exactly 6" apart)',
        'Tap the SECOND grid mark (6" from the first)',
        'Tap the center of your BOTTOM group',
        'Tap the center of your TOP group'
    ];

    /** Custom wizard step: photo + 4 taps → {actualIn, horizIn}. */
    function measureStep() {
        return {
            id: 'measure',
            prompt: 'Photograph the tall target',
            type: 'custom',
            mount: function (el, state, api) {
                el.innerHTML =
                    '<p class="t-body u-quiet u-mb-12">Whole target in frame, square to the paper.</p>' +
                    '<label class="action-primary" for="sc-photo">' + Icon('camera', 18) + 'Take photo</label>' +
                    '<input type="file" id="sc-photo" accept="image/*" capture="environment" class="hidden">' +
                    '<p class="t-body u-mt-10" id="sc-instruction"></p>' +
                    '<canvas id="sc-canvas" class="hidden u-mt-10"></canvas>' +
                    '<button type="button" class="action hidden u-mt-10" id="sc-undo">' + Icon('undo', 18) + 'Undo tap</button>';

                var taps = [];
                var scale = 1; // canvas px per image px
                var canvas = el.querySelector('#sc-canvas');
                var instruction = el.querySelector('#sc-instruction');
                var undoBtn = el.querySelector('#sc-undo');
                var img = null;

                function redraw() {
                    var ctx2 = canvas.getContext('2d');
                    ctx2.drawImage(img, 0, 0, canvas.width, canvas.height);
                    for (var i = 0; i < taps.length; i++) {
                        ctx2.beginPath();
                        ctx2.arc(taps[i].x * scale, taps[i].y * scale, 7, 0, Math.PI * 2);
                        ctx2.strokeStyle = i < 2 ? '#D9A13B' : '#46B268'; /* calibration brass / impact green */
                        ctx2.lineWidth = 3;
                        ctx2.stroke();
                    }
                    instruction.textContent = taps.length < 4
                        ? (taps.length + 1) + '/4 — ' + MEASURE_TAPS[taps.length]
                        : 'Measuring…';
                    undoBtn.classList.toggle('hidden', !taps.length);
                }

                el.querySelector('#sc-photo').addEventListener('change', function () {
                    if (!this.files || !this.files.length) return;
                    loadImageFromFile(this.files[0]).then(function (loaded) {
                        img = loaded;
                        var maxW = Math.min(680, el.clientWidth || 680);
                        scale = Math.min(1, maxW / img.width);
                        canvas.width = Math.round(img.width * scale);
                        canvas.height = Math.round(img.height * scale);
                        canvas.classList.remove('hidden');
                        taps = [];
                        redraw();
                    }).catch(function (err) {
                        api.error('Could not load the photo: ' + err.message);
                    });
                });

                canvas.addEventListener('click', function (e) {
                    if (!img || taps.length >= 4) return;
                    var rect = canvas.getBoundingClientRect();
                    taps.push({
                        x: (e.clientX - rect.left) * (canvas.width / rect.width) / scale,
                        y: (e.clientY - rect.top) * (canvas.height / rect.height) / scale
                    });
                    redraw();
                    if (taps.length === 4) {
                        var ppi = dist(taps[0], taps[1]) / 6.0; // 6" between grid marks
                        if (!isFinite(ppi) || ppi <= 0) {
                            api.error('Scale taps too close — undo and re-tap the grid marks.');
                            taps.pop();
                            redraw();
                            return;
                        }
                        api.submit({
                            actualIn: Math.abs(taps[3].y - taps[2].y) / ppi,
                            horizIn: Math.abs(taps[3].x - taps[2].x) / ppi
                        });
                    }
                });

                undoBtn.addEventListener('click', function () {
                    taps.pop();
                    redraw();
                    api.error('');
                });
            },
            // The custom step submits an object; anything non-empty passes
            validate: function (answer) {
                return answer && typeof answer.actualIn === 'number' ? null : 'Complete the four taps.';
            }
        };
    }

    function buildDef(rifles) {
        return {
            id: 'scope-check',
            version: 1,
            steps: [
                {
                    id: 'rifle',
                    prompt: 'Which rifle?',
                    type: 'choice',
                    choices: rifles.map(function (r) {
                        return { value: r.id, label: r.name, desc: r.caliber || '' };
                    })
                },
                {
                    id: 'setup',
                    prompt: 'Set up the test',
                    type: 'choice',
                    choices: [{
                        value: 'ready',
                        label: "I'm set up",
                        desc: 'Tall target taped PLUMB at a measured 100 yards. Shoot one group at the bottom aim point first.'
                    }]
                },
                {
                    id: 'clicks',
                    prompt: 'Your scope adjusts in…',
                    type: 'choice',
                    choices: [
                        { value: '0.25', label: '1/4 MOA per click' },
                        { value: '0.125', label: '1/8 MOA per click' }
                    ]
                },
                {
                    id: 'dialed',
                    prompt: 'Dial UP a big round number of clicks, shoot a second group, then enter how many clicks you dialed:',
                    type: 'number',
                    validate: function (v) {
                        return v >= 10 && v <= 200 ? null : 'Enter 10–200 clicks (30+ recommended).';
                    }
                },
                measureStep()
            ]
        };
    }

    /**
     * Launch the wizard. Saves the correction onto the rifle and shows
     * the plain-English verdict.
     */
    function start(db, onDone) {
        db.getAllRifles().then(function (rifles) {
            if (!rifles.length) {
                if (window.AppNav) window.AppNav.go('profiles');
                return;
            }
            new WizardShell(db, buildDef(rifles), {
                modal: true,
                onCancel: function () {},
                onComplete: function (answers) {
                    var rifle = null;
                    for (var i = 0; i < rifles.length; i++) {
                        if (rifles[i].id === answers.rifle) { rifle = rifles[i]; break; }
                    }
                    if (!rifle) return;
                    var clickVal = parseFloat(answers.clicks);
                    var dialedMOA = answers.dialed * clickVal;
                    var m = answers.measure;
                    var analysis = scopeTrackingAnalysis(dialedMOA, 100, m.actualIn, m.horizIn);

                    rifle.scopeClickValue = clickVal;
                    rifle.scopeCorrectionFactor = analysis.factor;
                    rifle.scopeTrackingTestedAt = new Date().toISOString();
                    rifle.scopeCantWarn = analysis.cantWarn;

                    // Append-only verification EVENT (§2.6, Part 0.6 #2) —
                    // the rifle columns above stay as the cached "current".
                    // Feeds the Calibration Status card + Device Export.
                    var eventPayload = {
                        rifleId: rifle.id,
                        factor: analysis.factor,
                        clickValue: clickVal,
                        cantWarn: analysis.cantWarn,
                        method: 'tall-target',
                        date: rifle.scopeTrackingTestedAt
                    };
                    var writeEvent = (typeof SyncQueue !== 'undefined' && SyncQueue)
                        ? SyncQueue.write('addTrackingVerification', eventPayload)
                        : db.addTrackingVerification(eventPayload);
                    writeEvent.catch(function (e) {
                        console.warn('[ScopeCheck] verification event failed:', e);
                    });

                    db.updateRifle(rifle).then(function () {
                        if (typeof Readiness !== 'undefined') Readiness.invalidate(rifle.id);
                        showVerdict(analysis, rifle, onDone);
                    }).catch(function (err) {
                        alert('Could not save the correction: ' + err.message);
                    });
                }
            }).start();
        });
    }

    /** Verdict first, numbers under. */
    function showVerdict(analysis, rifle, onDone) {
        var overlay = document.createElement('div');
        overlay.className = 'overlay';
        var pct = Math.abs(analysis.errorPct);
        var html = '<div class="overlay-card">';
        if (pct <= 1) {
            html += '<div class="verdict">' +
                '<span class="verdict-lamp is-go"></span>' +
                '<div><div class="verdict-word is-go">TRACKS TRUE</div>' +
                '<div class="verdict-sub">Within 1% of true &mdash; no correction needed.</div></div>' +
                '</div>';
        } else {
            html += '<div class="verdict">' +
                '<span class="verdict-lamp is-hold"></span>' +
                '<div><div class="verdict-word is-hold">CORRECTED</div>' +
                '<div class="verdict-sub">Your clicks are ' + formatNum(pct, 1) + '% ' +
                (analysis.errorPct < 0 ? 'small' : 'large') +
                ' &mdash; every solution now corrected automatically.</div></div>' +
                '</div>';
        }
        if (analysis.cantWarn) {
            html += '<div class="alert-strip u-mt-14">' + Icon('alert', 18) +
                '<span>Your impacts drifted sideways while dialing up &mdash; check that the scope is mounted plumb (cant).</span></div>';
        }
        html += '<div class="u-mt-14">' +
            '<div class="spec-row"><span class="spec-key">Expected travel</span><span class="spec-val">' +
            formatNum(analysis.expectedInches, 2) + '&Prime;</span></div>' +
            '<div class="spec-row"><span class="spec-key">Measured travel</span><span class="spec-val">' +
            formatNum(analysis.actualInches, 2) + '&Prime;</span></div>' +
            '<div class="spec-row"><span class="spec-key">Correction factor</span><span class="spec-val">' +
            formatNum(analysis.factor, 3) + '</span></div>' +
            '<div class="spec-row"><span class="spec-key">Stored on</span><span class="spec-val">' +
            escapeHtml(rifle.name) + '</span></div>' +
            '</div>';
        html += '<button class="action-primary u-mt-14" id="sc-done">Done</button>';
        html += '</div>';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        overlay.querySelector('#sc-done').addEventListener('click', function () {
            document.body.removeChild(overlay);
            if (onDone) onDone();
        });
    }

    return { start: start };
})();

// Home-action hook (registry actions with `run` resolve here; the
// caller passes the live db handle)
if (typeof window !== 'undefined') {
    window.ToolActions = window.ToolActions || {};
    window.ToolActions.scopeCheck = function (db) {
        ScopeCheck.start(db);
    };
}
