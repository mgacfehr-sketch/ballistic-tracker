/**
 * rifle-payoff.js — THE PAYOFF (Contract v3.0 Part 1, view 4).
 *
 * Runs the existing one-observation truing engine (js/simple-true.js —
 * doctrine-routed silently, no fork shown) on the hit RifleAdd's steel
 * screen already saved, and shows the immediate payoff:
 *
 *   "Got it. Your 600-yard dial changes from 4.0 → 3.8.
 *    Everything past ~400 just got more accurate.
 *    One more shot at 600 makes it solid."      [Keep it]  Undo
 *
 * The steel string + shot are ALREADY SAVED by the time this runs
 * (RifleAdd's Done handler saves first, per Part 2 §3.4 — Save always
 * happens). Keep it only decides whether the CORRECTION is applied;
 * Undo leaves the logged string exactly as it is. Unusable
 * observations (zero-band, out-of-bracket — the v2.5 honesty guards
 * already built into simpleTrueObservation) say "Couldn't use that
 * one" with the plain reason — the string still stands either way.
 */

var RiflePayoff = (function () {
    'use strict';

    /**
     * obs = { rangeYds, dialed, hitInches, units, shotMV, mvMeasured,
     *         zeroConfirmed, trackingVerified }
     */
    function run(app, rifle, load, obs) {
        var container = app.container;
        var profile = {
            muzzleVelocity: load.truedMv || load.muzzleVelocity,
            bc: load.truedBc || load.bulletBC,
            dragModel: load.dragModel || 'G7',
            bulletWeight: load.bulletWeight || 140,
            zeroRange: rifle.zeroRange || 100,
            scopeHeight: rifle.scopeHeight || 1.5
        };

        var env = { tempF: null, pressureInHg: null, humidity: null, source: 'default' };
        var out = null;
        try {
            out = simpleTrueObservation({
                profile: profile,
                env: env,
                rangeYds: obs.rangeYds,
                dialed: obs.dialed || 0,
                hitInches: obs.hitInches || 0,
                units: obs.units || 'MOA',
                shotMV: typeof obs.shotMV === 'number' ? obs.shotMV : undefined,
                mvMeasured: !!obs.mvMeasured,
                zeroConfirmed: !!obs.zeroConfirmed,
                trackingVerified: !!obs.trackingVerified
            });
        } catch (e) {
            console.warn('[RiflePayoff] solve failed:', e);
        }

        if (!out) {
            _couldNotUse(app, rifle, obs);
            return;
        }
        _renderPayoff(app, rifle, load, obs, out, env);
    }

    /** Honest refusal — the zero-band/bracket-capped guards. String stands. */
    function _couldNotUse(app, rifle, obs) {
        var container = app.container;
        container.setAttribute('data-screen', 'v3-payoff-none');
        var nearLimit = Math.round((rifle.zeroRange || 100) * 1.5);
        var why = obs.rangeYds <= nearLimit
            ? 'That hit is too close to your zero to teach us anything — shots past ~' +
              nearLimit + ' yards are where your numbers improve.'
            : 'That miss is bigger than a speed or drag problem can explain — check your zero and what you dialed, then try again.';
        container.innerHTML = '<div class="screen">' +
            '<div class="v3-payoff">' +
            '<div class="say" style="margin-top:60px">' + UI.esc(why) + '</div>' +
            '<div class="sub">Your string is still logged — this just couldn\'t tighten up the numbers.</div>' +
            '</div>' +
            '<button class="v3-gold" id="rp-none-ok">OK</button>' +
            '<div style="height:16px"></div></div>';
        document.getElementById('rp-none-ok').addEventListener('click', function () { app.show(rifle.id); });
    }

    function _renderPayoff(app, rifle, load, obs, out, env) {
        var container = app.container;
        container.setAttribute('data-screen', 'v3-payoff');
        var p = out.payoff;

        var sayHtml;
        if (p.moved) {
            sayHtml = 'Got it. Your <b>' + p.rangeYds + '-yard</b> dial changes from ' +
                '<b class="old">' + p.oldDial.toFixed(1) + '</b> to <b class="new">' + p.newDial.toFixed(1) + '</b>.';
        } else {
            sayHtml = 'Got it. Your <b>' + p.rangeYds + '-yard</b> dial barely moves — your numbers were already close.';
        }
        var sub = p.moved
            ? 'Everything past ~' + p.pastYd + ' just got more accurate.<br>One more shot at ' +
              p.rangeYds + ' makes it solid.'
            : 'Nothing to change — this confirms what you had.';

        var html = '<div class="screen">' +
            '<div class="v3-payoff">' +
            '<div class="mark">&check;</div>' +
            '<div class="say">' + sayHtml + '</div>' +
            '<div class="sub">' + sub + '</div>' +
            '</div>' +
            '<div class="v3-spacer" style="height:10px"></div>' +
            '<button class="v3-gold" id="rp-keep">Keep it</button>' +
            '<div class="v3-linkrow"><button class="v3-link" id="rp-undo">Undo</button></div>' +
            '<div style="height:16px"></div></div>';
        container.innerHTML = html;

        document.getElementById('rp-undo').addEventListener('click', function () { app.show(rifle.id); });
        document.getElementById('rp-keep').addEventListener('click', function () {
            var btn = document.getElementById('rp-keep');
            btn.disabled = true;
            btn.textContent = 'Keeping…';
            var ctx = {
                db: app.db, rifle: rifle, load: load, env: env,
                dialed: obs.dialed || 0, mvMeasured: !!obs.mvMeasured
            };
            var S = { hitIn: obs.hitInches || 0, windIn: 0, mv: typeof obs.shotMV === 'number' ? obs.shotMV : null };
            SimpleTrue.keep(ctx, S, out).then(function () {
                app.show(rifle.id);
            }).catch(function (err) {
                btn.disabled = false;
                btn.textContent = 'Keep it';
                alert('Could not save: ' + err.message);
            });
        });
    }

    /**
     * Contract v4.0 3b: "add more shots" appends rows to the SAME
     * card — this IS detailed truing now, no separate door. Mirrors
     * simple-true.js's simpleTrueObservation() math for N shots that
     * share one distance/dial (one truing GROUP, not N separate
     * events) instead of one. simple-true.js itself is untouched
     * (Contract v4.0 "UNTOUCHED engines") — this calls the same
     * pure solveTruing/machDistances/truingConfidence primitives it
     * does, just built for an array of hits.
     *
     * obs = { rangeYds, dialed, units, hits:[inches...], shotMV,
     *         mvMeasured, zeroConfirmed, trackingVerified, groupId }
     */
    function _solveMulti(profile, env, obs) {
        var dialedMOA = simpleToMOA(obs.dialed || 0, obs.units, obs.rangeYds);
        var groupId = obs.groupId || 'string';
        var solveObs = (obs.hits || []).map(function (hitInches) {
            return {
                rangeYds: obs.rangeYds,
                observedComeUpMOA: dialedMOA - inchesToMOA(hitInches || 0, obs.rangeYds),
                shotMV: typeof obs.shotMV === 'number' ? obs.shotMV : undefined,
                groupId: groupId
            };
        });
        if (!solveObs.length) return null;

        var ctx = { profile: profile, env: env, machDist: machDistances(profile, env) };
        var result = solveTruing(solveObs, ctx, { mvMeasured: !!obs.mvMeasured });
        if (!result || !result.mvOption || !result.bcOption) return null;

        var picked = result.recommended;
        var option = picked === 'bc' ? result.bcOption : result.mvOption;
        if (result.farBand === 'zero' || option.capped) return null;

        var confidence = truingConfidence({
            shotCount: solveObs.length, groupCount: 1,
            mvMeasuredPct: typeof obs.shotMV === 'number' || obs.mvMeasured ? 1 : 0,
            windLoggedPct: 0, groupSpreadMOA: 0,
            envSource: env.source || 'default',
            zeroConfirmed: !!obs.zeroConfirmed, trackingVerified: !!obs.trackingVerified,
            supersonicPct: result.supersonicPct, correctionType: picked, mode: 'quick'
        });

        var corrected = {};
        for (var k in profile) { if (profile.hasOwnProperty(k)) corrected[k] = profile[k]; }
        if (picked === 'bc') corrected.bc = option.value; else corrected.muzzleVelocity = option.value;

        var oldMOA = simpleComeUpAt(profile, env, obs.rangeYds);
        var newMOA = simpleComeUpAt(corrected, env, obs.rangeYds);
        var oldDial = simpleFromMOA(oldMOA, obs.units, obs.rangeYds);
        var newDial = simpleFromMOA(newMOA, obs.units, obs.rangeYds);

        return {
            picked: picked, option: option, result: result, confidence: confidence, corrected: corrected,
            payoff: {
                rangeYds: obs.rangeYds,
                oldDial: Math.round(oldDial * 10) / 10, newDial: Math.round(newDial * 10) / 10,
                units: obs.units,
                pastYd: Math.max(100, Math.round(obs.rangeYds * 2 / 3 / 50) * 50),
                moved: Math.abs(oldDial - newDial) >= 0.05
            }
        };
    }

    function runMulti(app, rifle, load, obs) {
        var profile = {
            muzzleVelocity: load.truedMv || load.muzzleVelocity, bc: load.truedBc || load.bulletBC,
            dragModel: load.dragModel || 'G7', bulletWeight: load.bulletWeight || 140,
            zeroRange: rifle.zeroRange || 100, scopeHeight: rifle.scopeHeight || 1.5
        };
        var env = { tempF: null, pressureInHg: null, humidity: null, source: 'default' };
        var out = null;
        try { out = _solveMulti(profile, env, obs); }
        catch (e) { console.warn('[RiflePayoff] multi-shot solve failed:', e); }

        if (!out) { _couldNotUse(app, rifle, { rangeYds: obs.rangeYds }); return; }
        _renderPayoffMulti(app, rifle, load, obs, out, env);
    }

    /** Same look as _renderPayoff — the Keep write path differs (accurate
     *  shotCount, not SimpleTrue.keep's single-shot-shaped write). */
    function _renderPayoffMulti(app, rifle, load, obs, out, env) {
        var container = app.container;
        container.setAttribute('data-screen', 'v3-payoff');
        var p = out.payoff;

        var sayHtml = p.moved
            ? 'Got it. Your <b>' + p.rangeYds + '-yard</b> dial changes from ' +
              '<b class="old">' + p.oldDial.toFixed(1) + '</b> to <b class="new">' + p.newDial.toFixed(1) + '</b>.'
            : 'Got it. Your <b>' + p.rangeYds + '-yard</b> dial barely moves — your numbers were already close.';
        var sub = p.moved
            ? 'Everything past ~' + p.pastYd + ' just got more accurate.<br>' +
              obs.hits.length + ' shots at ' + p.rangeYds + ' — that\'s a solid string.'
            : 'Nothing to change — this confirms what you had.';

        var html = '<div class="screen">' +
            '<div class="v3-payoff">' +
            '<div class="mark">&check;</div>' +
            '<div class="say">' + sayHtml + '</div>' +
            '<div class="sub">' + sub + '</div>' +
            '</div>' +
            '<div class="v3-spacer" style="height:10px"></div>' +
            '<button class="v3-gold" id="rp-keep">Keep it</button>' +
            '<div class="v3-linkrow"><button class="v3-link" id="rp-undo">Undo</button></div>' +
            '<div style="height:16px"></div></div>';
        container.innerHTML = html;

        document.getElementById('rp-undo').addEventListener('click', function () { app.show(rifle.id); });
        document.getElementById('rp-keep').addEventListener('click', function () {
            var btn = document.getElementById('rp-keep');
            btn.disabled = true;
            btn.textContent = 'Keeping…';
            _keepMulti(app, rifle, load, obs, out, env).then(function () {
                app.show(rifle.id);
            }).catch(function (err) {
                btn.disabled = false;
                btn.textContent = 'Keep it';
                alert('Could not save: ' + err.message);
            });
        });
    }

    /** Mirrors SimpleTrue.keep's addTruingEvent shape (simple-true.js is
     *  untouched — it hardcodes shotCount:1 for its own one-shot caller,
     *  so a multi-shot Keep needs its own write with the real count). */
    function _keepMulti(app, rifle, load, obs, out, env) {
        var isBc = out.picked === 'bc';
        var r = out.result;
        var event = {
            rifleId: rifle.id, loadId: load.id, mode: 'simple', stage: isBc ? 'drag' : 'mv',
            close: { rangeYds: rifle.zeroRange || 100, assumed: true },
            far: { rangeYds: r.farRangeYds, band: r.farBand, groups: r.groups },
            inputs: {
                env: env || { source: 'default' },
                quality: {
                    shotCount: obs.hits.length, groupCount: 1,
                    mvMeasuredPct: (typeof obs.shotMV === 'number' || obs.mvMeasured) ? 1 : 0, windLoggedPct: 0
                },
                machDist: r.machDist, mvOption: r.mvOption, bcOption: r.bcOption, guidance: r.guidance,
                confidence: out.confidence,
                hitInches: obs.hits[obs.hits.length - 1],
                dialed: obs.dialed || 0, shotMV: typeof obs.shotMV === 'number' ? obs.shotMV : null,
                payoff: out.payoff
            },
            ledger: r.ledger, supersonicPct: r.supersonicPct, correctionType: out.picked,
            oldValue: isBc ? (load.truedBc || load.bulletBC) : Math.round(load.truedMv || load.muzzleVelocity),
            newValue: out.option.value, confidence: out.confidence.word, appliedAt: new Date().toISOString()
        };
        var write = (typeof SyncQueue !== 'undefined' && SyncQueue)
            ? function (fn, data) { return SyncQueue.write(fn, data); }
            : function (fn, data) { return app.db[fn](data); };
        return write('addTruingEvent', event).then(function (saved) {
            if (isBc) load.truedBc = out.option.value; else load.truedMv = out.option.value;
            load.truedEventId = saved.id;
            load.truedAt = event.appliedAt;
            return app.db.updateLoad(load).catch(function (e) {
                console.warn('[RiflePayoff] cached values update failed (event saved):', e);
            });
        }).then(function () {
            if (typeof Readiness !== 'undefined') Readiness.invalidate(rifle.id);
        });
    }

    return { run: run, runMulti: runMulti };
})();

// Launcher (registration seam)
if (typeof window !== 'undefined') {
    window.RiflePayoff = RiflePayoff;
}
