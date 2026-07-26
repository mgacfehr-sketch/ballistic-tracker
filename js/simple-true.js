/**
 * simple-true.js — "WHERE DID IT HIT?" (Contract v2.5 §2.3, the crown
 * jewel). One observed hit at distance → the existing truing engine in
 * one-observation mode → an immediate payoff in Roy's words:
 *
 *   "Got it. Your 600-yard dial changes from 4.0 to 3.8.
 *    Everything past ~400 just got more accurate."  [Keep it] [Undo]
 *
 * NO fork is shown — the doctrine routes silently (truing-core's
 * `recommended`). The append-only truing event is written on KEEP
 * with honest one-shot confidence (engine word 'Thin' — shown as
 * "rough" in the simple lane). Multiple observations accumulate
 * exactly as the engine already supports; confidence rises honestly.
 * The detailed truing flow is untouched.
 *
 * Split module (calibration-status pattern):
 *   TOP    — pure math, Node-tested (tests/test-simple-true.js)
 *   BOTTOM — SimpleTrue, the DOM flow (ask → payoff → keep/undo)
 */

/* Engine resolution guard: browser globals or Node require. */
if (typeof solveTruing === 'undefined' && typeof require === 'function') {
    var __tc = require('./truing-core.js');
    var solveTruing = __tc.solveTruing;
    var machDistances = __tc.machDistances;
    var truingConfidence = __tc.truingConfidence;
    var TRUING = __tc.TRUING;
    // truing-core's guard already provided calculations + solver globals
    if (typeof inchesToMOA === 'undefined') {
        var __calc2 = require('./calculations.js');
        var inchesToMOA = __calc2.inchesToMOA;
        var moaToInches = __calc2.moaToInches;
    }
    if (typeof computeTrajectory === 'undefined') {
        var computeTrajectory = require('./ballistic-solver.js').computeTrajectory;
    }
}

/** Angular value in the rifle's units → MOA. */
function simpleToMOA(value, units, rangeYds) {
    if (units === 'MIL') return value * TRUING.MIL_TO_MOA;
    if (units === 'IN') return inchesToMOA(value, rangeYds);
    return value;
}

/** MOA → the rifle's units (display). */
function simpleFromMOA(valueMOA, units, rangeYds) {
    if (units === 'MIL') return valueMOA / TRUING.MIL_TO_MOA;
    if (units === 'IN') return moaToInches(valueMOA, rangeYds);
    return valueMOA;
}

/** Come-up (MOA) at a range for a profile in this air. */
function simpleComeUpAt(profile, env, rangeYds) {
    env = env || { tempF: 59, pressureInHg: 29.92, humidity: 50 };
    var out = computeTrajectory({
        muzzleVelocity: profile.muzzleVelocity,
        bc: profile.bc,
        dragModel: profile.dragModel || 'G7',
        zeroRange: profile.zeroRange || 100,
        scopeHeight: profile.scopeHeight || 1.5,
        bulletWeight: profile.bulletWeight || 140,
        maxRange: rangeYds + 50,
        rangeStep: 10,
        windSpeedMph: 0,
        windClockPos: 12,
        tempF: typeof env.tempF === 'number' ? (env.tempF === 0 ? 0.001 : env.tempF) : 59,
        pressureInHg: typeof env.pressureInHg === 'number' ? env.pressureInHg : 29.92,
        humidity: typeof env.humidity === 'number' ? env.humidity : 50
    });
    var table = out.table || out;
    var prev = null;
    for (var i = 0; i < table.length; i++) {
        var row = table[i];
        if (row.rangeYards >= rangeYds) {
            if (!prev || row.rangeYards === rangeYds) return row.comeUpMOA;
            var f = (rangeYds - prev.rangeYards) / (row.rangeYards - prev.rangeYards || 1);
            return prev.comeUpMOA + (row.comeUpMOA - prev.comeUpMOA) * f;
        }
        prev = row;
    }
    return table.length ? table[table.length - 1].comeUpMOA : null;
}

/**
 * ONE observed hit → the silently-routed correction + the payoff.
 *
 * input = {
 *   profile, env,
 *   rangeYds,
 *   dialed          — elevation dialed, in `units`
 *   hitInches       — vertical miss in inches, + = HIGH, − = LOW
 *   units           — the rifle's units for the payoff display
 *   shotMV?         — one typed velocity (optional)
 *   mvMeasured      — is the profile MV chronographed?
 *   zeroConfirmed, trackingVerified — confidence inputs
 * }
 * → null (engine could not solve) |
 *   { picked ('mv'|'bc'), option, result, confidence,
 *     payoff: { rangeYds, oldDial, newDial, units, pastYd, moved } }
 */
function simpleTrueObservation(input) {
    var profile = input.profile;
    var env = input.env || { tempF: 59, pressureInHg: 29.92, humidity: 50, source: 'default' };

    var dialedMOA = simpleToMOA(input.dialed || 0, input.units, input.rangeYds);
    var hitMOA = inchesToMOA(input.hitInches || 0, input.rangeYds);
    // hit HIGH → it took LESS than you dialed
    var observedComeUpMOA = dialedMOA - hitMOA;

    var obs = [{
        rangeYds: input.rangeYds,
        observedComeUpMOA: observedComeUpMOA,
        shotMV: typeof input.shotMV === 'number' ? input.shotMV : undefined,
        groupId: 'simple'
    }];
    var ctx = {
        profile: profile,
        env: env,
        machDist: machDistances(profile, env)
    };
    var result = solveTruing(obs, ctx, { mvMeasured: !!input.mvMeasured });
    if (!result || !result.mvOption || !result.bcOption) return null;

    var picked = result.recommended;
    var option = picked === 'bc' ? result.bcOption : result.mvOption;

    // Simple-lane honesty guards: a hit inside the zero band teaches
    // nothing, and a correction pinned at the solver's bracket edge is
    // a miss too big to be a speed/drag problem. The detailed flow may
    // show these with coaching; Roy gets an honest "can't use that".
    if (result.farBand === 'zero' || option.capped) return null;

    var confidence = truingConfidence({
        shotCount: 1,
        groupCount: 1,
        mvMeasuredPct: typeof input.shotMV === 'number' || input.mvMeasured ? 1 : 0,
        windLoggedPct: 0,
        groupSpreadMOA: 0,
        envSource: env.source || 'default',
        zeroConfirmed: !!input.zeroConfirmed,
        trackingVerified: !!input.trackingVerified,
        supersonicPct: result.supersonicPct,
        correctionType: picked,
        mode: 'quick'
    });

    // The payoff: the dial at THIS range, before vs after
    var corrected = {};
    for (var k in profile) { if (profile.hasOwnProperty(k)) corrected[k] = profile[k]; }
    if (picked === 'bc') corrected.bc = option.value;
    else corrected.muzzleVelocity = option.value;

    var oldMOA = simpleComeUpAt(profile, env, input.rangeYds);
    var newMOA = simpleComeUpAt(corrected, env, input.rangeYds);
    var oldDial = simpleFromMOA(oldMOA, input.units, input.rangeYds);
    var newDial = simpleFromMOA(newMOA, input.units, input.rangeYds);

    return {
        picked: picked,
        option: option,
        result: result,
        confidence: confidence,
        corrected: corrected,
        observedComeUpMOA: observedComeUpMOA,
        payoff: {
            rangeYds: input.rangeYds,
            oldDial: Math.round(oldDial * 10) / 10,
            newDial: Math.round(newDial * 10) / 10,
            units: input.units,
            pastYd: Math.max(100, Math.round(input.rangeYds * 2 / 3 / 50) * 50),
            moved: Math.abs(oldDial - newDial) >= 0.05
        }
    };
}

/** The payoff sentence, Roy's words, honest when nothing moved. */
function simpleTruePayoffCopy(p) {
    if (!p.moved) {
        return 'Got it. Your ' + p.rangeYds + '-yard dial barely moves — your numbers were already close.';
    }
    return 'Got it. Your ' + p.rangeYds + '-yard dial changes from ' +
        p.oldDial.toFixed(1) + ' to ' + p.newDial.toFixed(1) +
        '. Everything past ~' + p.pastYd + ' just got more accurate.';
}

// Export the pure core for Node tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        simpleToMOA: simpleToMOA,
        simpleFromMOA: simpleFromMOA,
        simpleComeUpAt: simpleComeUpAt,
        simpleTrueObservation: simpleTrueObservation,
        simpleTruePayoffCopy: simpleTruePayoffCopy
    };
}

/* ══════════════════════════════════════════════════════════════
 * Browser-only below: SimpleTrue — ask "where did it hit?", show
 * the payoff, Keep/Undo. Big, glove-friendly, one primary.
 * ══════════════════════════════════════════════════════════════ */

var SimpleTrue = (typeof document !== 'undefined') ? (function () {
    'use strict';

    /**
     * ctx = { db, rifle, load, rangeYds, dialed (rifle units),
     *         units, mvMeasured, zeroConfirmed, trackingVerified,
     *         env?, onDone(kept:bool) }
     * Renders into #view-home.
     */
    function askHit(ctx) {
        var container = document.getElementById('view-home');
        if (!container) return;
        var S = {
            hitIn: 0,     // + high / − low, inches
            windIn: 0,    // optional left/right
            mv: null
        };

        container.setAttribute('data-screen', 'simple-hit');
        var html = '<div class="screen">';
        html += '<div class="pagehead">' +
            '<div class="pagetitle">Where did it hit?</div>' +
            '<div class="pagesub mono">' + UI.esc(ctx.rifle.name || '') + ' · ' +
            Number(ctx.rangeYds).toLocaleString() + ' yd</div></div>';

        html += '<div class="card card-pad edge-none">' +
            _bigStepper('sh-elev', 'High / Low', S.hitIn, 'HIGH', 'LOW') +
            '</div>';

        html += '<details class="fold edge u-mt-10"><summary>Left / right too</summary>' +
            '<div class="fold-body">' + _bigStepper('sh-wind', 'Left / Right', S.windIn, 'RIGHT', 'LEFT') +
            '<p class="t-micro u-mt-10">Wind moves shots sideways — only the up/down feeds your numbers.</p></div></details>';

        html += '<details class="fold edge u-mt-10"><summary>Add bullet speed</summary>' +
            '<div class="fold-body"><div class="field"><label for="sh-mv">One reading, fps</label>' +
            '<input type="number" inputmode="numeric" id="sh-mv" placeholder="2950"></div></div></details>';

        html += '<button class="btn-primary btn-edge u-mt-14" id="sh-go">That\'s where it hit</button>';
        html += '<button class="btn btn-edge u-mt-10" id="sh-skip">Skip</button>';
        html += '<div style="height:16px"></div></div>';
        container.innerHTML = html;

        _bindStepper('sh-elev', S, 'hitIn');
        _bindStepper('sh-wind', S, 'windIn');

        document.getElementById('sh-skip').addEventListener('click', function () {
            if (ctx.onDone) ctx.onDone(false);
        });
        document.getElementById('sh-go').addEventListener('click', function () {
            var btn = this;
            var mvEl = document.getElementById('sh-mv');
            var mv = mvEl ? parseFloat(mvEl.value) : NaN;
            S.mv = isFinite(mv) && mv >= 500 && mv <= 5000 ? mv : null;
            // §3.4: the caller's save always happens FIRST (steel string
            // + shot land regardless of Keep/Undo on the correction)
            var before = ctx.beforeCompute ? ctx.beforeCompute(S) : Promise.resolve();
            btn.disabled = true;
            before.then(function () {
                _computeAndShow(ctx, S);
            }).catch(function (err) {
                btn.disabled = false;
                alert('Save failed: ' + err.message + '\n\nStill on screen — try again.');
            });
        });
    }

    /** Big glove-friendly stepper: [−] value in [＋], 1-inch steps. */
    function _bigStepper(id, label, value, posWord, negWord) {
        return '<div class="u-mt-10"><div class="t-label" style="margin-bottom:6px">' + label +
            ' <span class="t-micro">(inches)</span></div>' +
            '<div style="display:flex;align-items:center;gap:10px">' +
            '<button class="btn" style="flex:0 0 64px;min-height:64px;font-size:28px" data-step="' + id + ':-1">&minus;</button>' +
            '<div style="flex:1;text-align:center"><b class="mono" id="' + id + '-val" style="font-size:34px">' +
            _fmtHit(value, posWord, negWord) + '</b></div>' +
            '<button class="btn" style="flex:0 0 64px;min-height:64px;font-size:28px" data-step="' + id + ':1">＋</button>' +
            '</div></div>';
    }

    function _fmtHit(v, posWord, negWord) {
        if (!v) return 'ON';
        return Math.abs(v) + '&Prime; ' + (v > 0 ? posWord : negWord);
    }

    function _bindStepper(id, S, field) {
        var btns = document.querySelectorAll('[data-step^="' + id + ':"]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', function () {
                var dir = parseInt(this.getAttribute('data-step').split(':')[1], 10);
                S[field] = (S[field] || 0) + dir;
                var el = document.getElementById(id + '-val');
                if (el) el.innerHTML = _fmtHit(S[field],
                    id === 'sh-elev' ? 'HIGH' : 'RIGHT',
                    id === 'sh-elev' ? 'LOW' : 'LEFT');
            });
        }
    }

    function _computeAndShow(ctx, S) {
        var container = document.getElementById('view-home');
        var profile = {
            muzzleVelocity: ctx.load.truedMv || ctx.load.muzzleVelocity,
            bc: ctx.load.truedBc || ctx.load.bulletBC,
            dragModel: ctx.load.dragModel || 'G7',
            bulletWeight: ctx.load.bulletWeight || 140,
            zeroRange: ctx.rifle.zeroRange || 100,
            scopeHeight: ctx.rifle.scopeHeight || 1.5
        };
        var out = null;
        try {
            out = simpleTrueObservation({
                profile: profile,
                env: ctx.env || { tempF: null, pressureInHg: null, humidity: null, source: 'default' },
                rangeYds: ctx.rangeYds,
                dialed: ctx.dialed || 0,
                hitInches: S.hitIn,
                units: ctx.units || 'MOA',
                shotMV: S.mv !== null ? S.mv : undefined,
                mvMeasured: !!ctx.mvMeasured,
                zeroConfirmed: !!ctx.zeroConfirmed,
                trackingVerified: !!ctx.trackingVerified
            });
        } catch (e) {
            console.warn('[SimpleTrue] solve failed:', e);
        }
        if (!out) {
            // honest fallback — never a dead end
            var nearLimit = Math.round((ctx.rifle.zeroRange || 100) * 1.5);
            var why = ctx.rangeYds <= nearLimit
                ? 'That hit is too close to your zero to teach us anything — shots past ~' +
                  nearLimit + ' yards are where your numbers improve.'
                : 'That miss is bigger than a speed or drag problem can explain — ' +
                  'check your zero and what you dialed, then try again.';
            container.innerHTML = '<div class="screen"><div class="pagehead">' +
                '<div class="pagetitle">Couldn\'t use that one</div></div>' +
                '<p class="t-body edge">' + why + '</p>' +
                '<button class="btn-primary btn-edge u-mt-14" id="sh-out">OK</button></div>';
            document.getElementById('sh-out').addEventListener('click', function () {
                if (ctx.onDone) ctx.onDone(false);
            });
            return;
        }
        _payoffScreen(ctx, S, out);
    }

    /** THE PAYOFF — immediately, no navigation. [Keep it] [Undo]. */
    function _payoffScreen(ctx, S, out) {
        var container = document.getElementById('view-home');
        container.setAttribute('data-screen', 'simple-payoff');
        var sentence = simpleTruePayoffCopy(out.payoff);
        var confWord = out.confidence.segments <= 2 ? 'rough' : out.confidence.word.toLowerCase();

        var html = '<div class="screen">';
        html += '<div class="pagehead"><div class="pagetitle">Got it.</div></div>';
        html += UI.banner('ready',
            UI.esc(sentence.replace(/^Got it\. /, '')) , true);
        html += '<p class="t-micro edge u-mt-10">One hit = a ' + UI.esc(confWord) +
            ' number. One more shot at ' + Number(out.payoff.rangeYds).toLocaleString() +
            ' firms it up.</p>';
        html += '<button class="btn-primary btn-edge u-mt-14" id="sp-keep">Keep it</button>';
        html += '<button class="btn btn-edge u-mt-10" id="sp-undo">Undo</button>';
        html += '<div style="height:16px"></div></div>';
        container.innerHTML = html;

        document.getElementById('sp-undo').addEventListener('click', function () {
            if (ctx.onDone) ctx.onDone(false);
        });
        document.getElementById('sp-keep').addEventListener('click', function () {
            var btn = document.getElementById('sp-keep');
            btn.disabled = true;
            btn.textContent = 'Keeping…';
            _keep(ctx, S, out).then(function () {
                if (ctx.onDone) ctx.onDone(true);
            }).catch(function (err) {
                btn.disabled = false;
                btn.textContent = 'Keep it';
                alert('Could not save: ' + err.message);
            });
        });
    }

    /** KEEP: the append-only truing event + trued values (same shape
     *  as the detailed flow's Apply — one engine, one ledger). */
    function _keep(ctx, S, out) {
        var isBc = out.picked === 'bc';
        var r = out.result;
        var profile = out.corrected; // corrected copy; originals below
        var event = {
            rifleId: ctx.rifle.id,
            loadId: ctx.load.id,
            mode: 'simple',
            stage: isBc ? 'drag' : 'mv',
            close: { rangeYds: ctx.rifle.zeroRange || 100, assumed: true },
            far: { rangeYds: r.farRangeYds, band: r.farBand, groups: r.groups },
            inputs: {
                env: ctx.env || { source: 'default' },
                quality: { shotCount: 1, groupCount: 1,
                    mvMeasuredPct: S.mv !== null || ctx.mvMeasured ? 1 : 0, windLoggedPct: 0 },
                machDist: r.machDist,
                mvOption: r.mvOption,
                bcOption: r.bcOption,
                guidance: r.guidance,
                confidence: out.confidence,
                hitInches: S.hitIn,
                dialed: ctx.dialed || 0,
                shotMV: S.mv,
                // v3.0: the feed (view 1) renders "dial corrected X → Y"
                // straight from this — no trajectory recompute needed.
                payoff: out.payoff
            },
            ledger: r.ledger,
            supersonicPct: r.supersonicPct,
            correctionType: out.picked,
            oldValue: isBc ? (ctx.load.truedBc || ctx.load.bulletBC)
                : Math.round(ctx.load.truedMv || ctx.load.muzzleVelocity),
            newValue: out.option.value,
            confidence: out.confidence.word,
            appliedAt: new Date().toISOString()
        };
        var write = (typeof SyncQueue !== 'undefined' && SyncQueue)
            ? function (fn, data) { return SyncQueue.write(fn, data); }
            : function (fn, data) { return ctx.db[fn](data); };
        return write('addTruingEvent', event).then(function (saved) {
            if (isBc) ctx.load.truedBc = out.option.value;
            else ctx.load.truedMv = out.option.value;
            ctx.load.truedEventId = saved.id;
            ctx.load.truedAt = event.appliedAt;
            return ctx.db.updateLoad(ctx.load).catch(function (e) {
                console.warn('[SimpleTrue] cached values update failed (event saved):', e);
            });
        }).then(function () {
            if (typeof Readiness !== 'undefined') Readiness.invalidate(ctx.rifle.id);
        });
    }

    // v3.0: exposed so RiflePayoff (view 4) shares this exact write path
    // instead of duplicating the append-only truing-event logic.
    return { askHit: askHit, keep: _keep };
})() : null;
