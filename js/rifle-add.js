/**
 * rifle-add.js — "WHAT HAPPENED?" (Contract v4.0 Part 2, surfaces
 * 2 / 3a / 3b / 3c). Three Roy sentences, nothing else — no
 * paper/steel/chrono jargon on the sheet itself.
 *
 *   "I zeroed" (3a)          — one card: distance, group size, shots.
 *           A confirmation fact, not a re-zeroing wizard — no photo,
 *           no calibration, no POA taps. "measure it from a photo
 *           instead" falls back to the existing capture pipeline
 *           (SessionLaunch) for anyone who wants it.
 *   "I shot at distance" (3b) — three things, ONE card: HOW FAR ·
 *           I DIALED · IT HIT. "add more shots" appends rows — that
 *           IS the detailed truing flow now, no separate door.
 *           "advanced" inline-opens the full existing logger (step 5:
 *           routes to steel-session.js's mature screen — same tap
 *           depth as an inline reveal, far lower risk than refactoring
 *           that screen's rendering to be literally embeddable).
 *   "I clocked my speed" (3c) — type the average speed; "load a
 *           Garmin file instead" reuses the existing chrono import.
 *
 * Steel's "Done" always saves a real string+shot first (STANDARDS
 * §6.1 offline-first, Part 2 §3.4 "Save always happens"), THEN runs
 * the truing engine and hands off to RifleAdd's payoff (view 4).
 */

var RifleAdd = (function () {
    'use strict';

    var LAST_KEY = 'yort_steel_last'; // shared with the retired log-shooting.js — same device-local key
    var DISTANCES = [400, 500, 600, 800, 925];

    function _last() {
        try { return JSON.parse(localStorage.getItem(LAST_KEY)) || {}; } catch (e) { return {}; }
    }
    function _rememberLast(patch) {
        try {
            var cur = _last();
            for (var k in patch) { if (patch.hasOwnProperty(k)) cur[k] = patch[k]; }
            localStorage.setItem(LAST_KEY, JSON.stringify(cur));
        } catch (e) { /* best effort */ }
    }
    function _write(db, fn, data) {
        return (typeof SyncQueue !== 'undefined' && SyncQueue) ? SyncQueue.write(fn, data) : db[fn](data);
    }

    /* ══ view 2: what did you shoot? ══════════════════════════ */

    function show(app, rifle) {
        var container = app.container;
        container.setAttribute('data-screen', 'v3-add');
        var html = '<div class="screen">';
        html += '<div class="pagehead"><button class="backline" id="ra-back">&lsaquo; ' +
            UI.esc(rifle.name || 'Home') + '</button></div>';
        html += '<h2 style="text-align:center;font:var(--type-title)">What happened?</h2>';
        html += '<div class="v3-bigchoice">';
        html += '<button id="ra-zero">I zeroed<small>confirm your zero at the range</small></button>';
        html += '<button id="ra-steel">I shot at distance<small>how far, what you dialed, where it hit</small></button>';
        html += '<button id="ra-chrono">I clocked my speed<small>type it in, or load a file</small></button>';
        html += '</div></div>';
        container.innerHTML = html;

        document.getElementById('ra-back').addEventListener('click', function () { app.show(rifle.id); });
        document.getElementById('ra-zero').addEventListener('click', function () { _zeroScreen(app, rifle); });
        document.getElementById('ra-steel').addEventListener('click', function () { _steelScreen(app, rifle); });
        document.getElementById('ra-chrono').addEventListener('click', function () { _chronoScreen(app, rifle); });
    }

    /* ══ view 3a: "I zeroed" — a confirmation fact, not a wizard ══ */

    var ZERO_DISTANCES = [25, 50, 100, 200];

    function _zeroScreen(app, rifle) {
        var container = app.container;
        container.setAttribute('data-screen', 'v3-zero');
        var S = { distanceYd: 100, groupIn: 1.0, shots: 5 };

        var html = '<div class="screen">';
        html += '<div class="pagehead"><button class="backline" id="rz-back">&lsaquo; Back</button>' +
            '<div class="pagetitle">I zeroed</div></div>';

        html += '<div class="v3-fieldlbl">HOW FAR</div><div class="v3-chips" id="rz-dist">';
        ZERO_DISTANCES.forEach(function (d) {
            html += '<button class="v3-chip' + (S.distanceYd === d ? ' on' : '') + '" data-dist="' + d + '">' + d + '</button>';
        });
        html += '<button class="v3-chip' + (ZERO_DISTANCES.indexOf(S.distanceYd) === -1 ? ' on' : '') + '" data-dist="custom">&hellip;</button></div>';
        html += '<div class="edge hidden" style="padding:0 var(--edge)" id="rz-dist-custom"><div class="field">' +
            '<input type="number" inputmode="numeric" id="rz-dist-input" placeholder="Distance (yd)" value="' +
            (ZERO_DISTANCES.indexOf(S.distanceYd) === -1 ? S.distanceYd : '') + '"></div></div>';

        html += '<div class="v3-fieldlbl">GROUP SIZE</div>' + _v3Stepper('rz-group', S.groupIn.toFixed(2) + '&Prime;', 'center to center');
        html += '<div class="v3-fieldlbl">SHOTS</div><div class="v3-chips" id="rz-shots">';
        [3, 5, 10].forEach(function (c) {
            html += '<button class="v3-chip' + (S.shots === c ? ' on' : '') + '" data-shots="' + c + '">' + c + '</button>';
        });
        html += '</div>';

        html += '<div class="v3-linkrow" style="margin-top:10px">' +
            '<button class="v3-link" id="rz-photo">measure it from a photo instead</button></div>';

        html += '<div class="v3-spacer" style="height:20px"></div>';
        html += '<button class="v3-gold" id="rz-done">Done</button>';
        html += '<div style="height:16px"></div></div>';
        container.innerHTML = html;

        document.getElementById('rz-back').addEventListener('click', function () { show(app, rifle); });
        document.getElementById('rz-photo').addEventListener('click', function () {
            if (window.SessionLaunch) SessionLaunch.start({ rifleId: rifle.id });
            else if (window.AppNav) AppNav.go('session');
        });

        var distWrap = document.getElementById('rz-dist');
        distWrap.addEventListener('click', function (e) {
            var b = e.target.closest ? e.target.closest('[data-dist]') : null;
            if (!b) return;
            var chips = distWrap.querySelectorAll('[data-dist]');
            for (var i = 0; i < chips.length; i++) chips[i].classList.remove('on');
            b.classList.add('on');
            var v = b.getAttribute('data-dist');
            var custom = document.getElementById('rz-dist-custom');
            if (v === 'custom') { custom.classList.remove('hidden'); document.getElementById('rz-dist-input').focus(); }
            else { custom.classList.add('hidden'); S.distanceYd = parseInt(v, 10); }
        });
        document.getElementById('rz-dist-input').addEventListener('change', function () {
            var v = parseInt(this.value, 10);
            if (isFinite(v) && v >= 10 && v <= 1000) S.distanceYd = v;
        });

        _bindV3Stepper('rz-group', function (dir) {
            S.groupIn = Math.max(0.1, Math.round((S.groupIn + dir * 0.25) * 100) / 100);
            document.querySelector('#rz-group .val').innerHTML = S.groupIn.toFixed(2) + '&Prime;<small>center to center</small>';
        });

        var shotsWrap = document.getElementById('rz-shots');
        shotsWrap.addEventListener('click', function (e) {
            var b = e.target.closest ? e.target.closest('[data-shots]') : null;
            if (!b) return;
            var chips = shotsWrap.querySelectorAll('[data-shots]');
            for (var i = 0; i < chips.length; i++) chips[i].classList.remove('on');
            b.classList.add('on');
            S.shots = parseInt(b.getAttribute('data-shots'), 10);
        });

        document.getElementById('rz-done').addEventListener('click', function () {
            var btn = this;
            btn.disabled = true;
            app.db.getLoadsByRifle(rifle.id).catch(function () { return []; }).then(function (loads) {
                var load = null;
                (loads || []).forEach(function (l) { if (!load && (l.truedMv || l.truedBc)) load = l; });
                if (!load) (loads || []).forEach(function (l) { if (!load && l.bulletBC) load = l; });
                if (!load && loads && loads.length) load = loads[0];

                var groupSizeMOA = inchesToMOA(S.groupIn, S.distanceYd);
                _write(app.db, 'addZeroEvent', {
                    rifleId: rifle.id, loadId: load ? load.id : null, sessionId: null,
                    date: new Date().toISOString(), distanceYards: S.distanceYd, shotCount: S.shots,
                    groupData: { groupSizeIn: S.groupIn, groupSizeMOA: groupSizeMOA },
                    lotNumber: load ? (load.lotNumber || null) : null, source: 'manual'
                }).then(function () {
                    if (typeof Readiness !== 'undefined') Readiness.invalidate(rifle.id);
                    app.show(rifle.id);
                }).catch(function (err) {
                    btn.disabled = false;
                    alert('Save failed: ' + err.message + '\n\nStill on screen — try again.');
                });
            });
        });
    }

    /* ══ view 3b: steel, three things, one screen ═════════════ */

    function _steelScreen(app, rifle) {
        var container = app.container;
        var units = (rifle.angleUnit === 'MIL' || rifle.angleUnit === 'IN') ? rifle.angleUnit : 'MOA';
        var step = units === 'MIL' ? 0.1 : (units === 'IN' ? 0.25 : 0.25);
        var last = _last();
        var S = { distanceYd: last.distanceYd || 600, dialed: 0, hits: [0], mv: null };

        Promise.all([
            app.db.getLoadsByRifle(rifle.id).catch(function () { return []; }),
            app.db.getMvMeasurementsByRifle(rifle.id).catch(function () { return []; }),
            app.db.getZeroEventsByRifle(rifle.id).catch(function () { return []; }),
            app.db.getTrackingVerificationsByRifle ? app.db.getTrackingVerificationsByRifle(rifle.id).catch(function () { return []; }) : Promise.resolve([]),
            (typeof Suppressors !== 'undefined') ? Suppressors.isEnabled(app.db) : Promise.resolve(false),
            (typeof Suppressors !== 'undefined') ? Suppressors.getLastUsed(app.db, rifle.id) : Promise.resolve(null)
        ]).then(function (res) {
            var loads = res[0] || [];
            var load = null;
            loads.forEach(function (l) { if (!load && (l.truedMv || l.truedBc)) load = l; });
            if (!load) loads.forEach(function (l) { if (!load && l.bulletBC) load = l; });
            if (!load && loads.length) load = loads[0];
            var mvMeasured = (res[1] || []).length > 0;
            var zeroConfirmed = (res[2] || []).length > 0;
            var tv = (res[3] || [])[0] || null;
            var trackingVerified = !!tv || typeof rifle.scopeCorrectionFactor === 'number';
            var suppressorEnabled = res[4];
            var lastCan = res[5];

            _renderSteel(app, rifle, S, units, step, {
                load: load, mvMeasured: mvMeasured, zeroConfirmed: zeroConfirmed,
                trackingVerified: trackingVerified, suppressorEnabled: suppressorEnabled, lastCan: lastCan
            });
        });
    }

    function _renderSteel(app, rifle, S, units, step, ctx) {
        var container = app.container;
        container.setAttribute('data-screen', 'v3-steel');

        var html = '<div class="screen">';
        html += '<div class="pagehead"><button class="backline" id="rs-back">&lsaquo; Back</button>' +
            '<div class="pagetitle">Steel</div></div>';

        html += '<div class="v3-fieldlbl">HOW FAR</div><div class="v3-chips" id="rs-dist">';
        DISTANCES.forEach(function (d) {
            html += '<button class="v3-chip' + (S.distanceYd === d ? ' on' : '') + '" data-dist="' + d + '">' + d + '</button>';
        });
        html += '<button class="v3-chip' + (DISTANCES.indexOf(S.distanceYd) === -1 ? ' on' : '') + '" data-dist="custom">&hellip;</button></div>';
        html += '<div class="edge hidden" style="padding:0 var(--edge)" id="rs-dist-custom"><div class="field">' +
            '<input type="number" inputmode="numeric" id="rs-dist-input" placeholder="Distance (yd)" value="' +
            (DISTANCES.indexOf(S.distanceYd) === -1 ? S.distanceYd : '') + '"></div></div>';

        html += '<div class="v3-fieldlbl">I DIALED</div>' + _v3Stepper('rs-dial', _fmtDial(S.dialed, units), units + ' up');
        html += '<div id="rs-hits-wrap">' + _hitsWrapHtml(S) + '</div>';

        html += '<div class="v3-linkrow" style="margin-top:10px">' +
            '<button class="v3-link" id="rs-mv-link">add bullet speed</button> &middot; ' +
            '<button class="v3-link" id="rs-advanced">advanced</button></div>';
        html += '<div id="rs-mv-field" class="hidden edge" style="padding:0 var(--edge)"><div class="field">' +
            '<label for="rs-mv-input">Bullet speed (fps)</label>' +
            '<input type="number" inputmode="numeric" id="rs-mv-input" placeholder="2950"></div></div>';

        html += '<div class="v3-spacer" style="height:20px"></div>';
        html += '<button class="v3-gold" id="rs-done">Done</button>';
        html += '<div style="height:16px"></div></div>';
        container.innerHTML = html;

        document.getElementById('rs-back').addEventListener('click', function () { show(app, rifle); });
        document.getElementById('rs-advanced').addEventListener('click', function () {
            if (window.ToolActions && ToolActions.steelSession) ToolActions.steelSession(app.db, rifle.id);
        });
        document.getElementById('rs-mv-link').addEventListener('click', function () {
            var f = document.getElementById('rs-mv-field');
            f.classList.toggle('hidden');
            if (!f.classList.contains('hidden')) document.getElementById('rs-mv-input').focus();
        });

        // distance chips + custom
        var distWrap = document.getElementById('rs-dist');
        distWrap.addEventListener('click', function (e) {
            var b = e.target.closest ? e.target.closest('[data-dist]') : null;
            if (!b) return;
            var chips = distWrap.querySelectorAll('[data-dist]');
            for (var i = 0; i < chips.length; i++) chips[i].classList.remove('on');
            b.classList.add('on');
            var v = b.getAttribute('data-dist');
            var custom = document.getElementById('rs-dist-custom');
            if (v === 'custom') { custom.classList.remove('hidden'); document.getElementById('rs-dist-input').focus(); }
            else { custom.classList.add('hidden'); S.distanceYd = parseInt(v, 10); }
        });
        document.getElementById('rs-dist-input').addEventListener('change', function () {
            var v = parseInt(this.value, 10);
            if (isFinite(v) && v >= 100 && v <= 3000) S.distanceYd = v;
        });

        _bindV3Stepper('rs-dial', function (dir) {
            S.dialed = Math.round((S.dialed + dir * step) * 100) / 100;
            document.querySelector('#rs-dial .val').innerHTML = _fmtDial(S.dialed, units) + '<small>' + units + ' up</small>';
        });
        // Contract v4.0 3b: "add more shots" appends rows to THIS card —
        // one delegated handler so re-painting the rows never re-binds
        // a growing pile of listeners.
        var hitsWrap = document.getElementById('rs-hits-wrap');
        function repaintHits() { hitsWrap.innerHTML = _hitsWrapHtml(S); }
        hitsWrap.addEventListener('click', function (e) {
            var stepBtn = e.target.closest ? e.target.closest('[data-vstep]') : null;
            if (stepBtn) {
                var parts = stepBtn.getAttribute('data-vstep').split(':');
                var idx = parseInt(parts[0], 10), dir = parseInt(parts[1], 10);
                S.hits[idx] = (S.hits[idx] || 0) + dir;
                repaintHits();
                return;
            }
            var rmBtn = e.target.closest ? e.target.closest('[data-remove-hit]') : null;
            if (rmBtn) {
                S.hits.splice(parseInt(rmBtn.getAttribute('data-remove-hit'), 10), 1);
                repaintHits();
                return;
            }
            var addBtn = e.target.closest ? e.target.closest('#rs-add-shot') : null;
            if (addBtn) {
                S.hits.push(0);
                repaintHits();
            }
        });

        document.getElementById('rs-done').addEventListener('click', function () {
            var btn = this;
            btn.disabled = true;
            _rememberLast({ distanceYd: S.distanceYd });
            var mvInput = document.getElementById('rs-mv-input');
            var mv = mvInput && mvInput.value ? parseFloat(mvInput.value) : NaN;
            S.mv = isFinite(mv) && mv >= 500 && mv <= 5000 ? mv : null;

            if (!ctx.load) {
                // No ammo on file at all — get just enough to attach the
                // string to. S already holds everything the user entered
                // (distance/dial/every shot), so nothing is lost going here.
                btn.disabled = false;
                _needsAmmo(app, rifle, S, units, ctx);
                return;
            }
            if (S.hits.length > 1) _finishSteelSaveMulti(app, rifle, S, units, ctx, btn);
            else _finishSteelSave(app, rifle, S, units, ctx, btn);
        });
    }

    /** IT HIT — one row per shot; "add more shots" appends rows (Contract
     *  v4.0 3b crown jewel: this IS detailed truing now, no separate
     *  door). Re-rendered wholesale into #rs-hits-wrap on every change;
     *  the click binding is delegated once in _renderSteel. */
    function _hitsWrapHtml(S) {
        var html = '<div class="v3-fieldlbl">IT HIT</div><div id="rs-hits">';
        S.hits.forEach(function (v, i) {
            html += '<div class="v3-hitrow"><div class="v3-stepper">' +
                '<button data-vstep="' + i + ':-1">&minus;</button>' +
                '<div class="val">' + _fmtHit(v) + '<small>' +
                (i === 0 ? 'tap &minus; if it hit low' : 'shot ' + (i + 1)) + '</small></div>' +
                '<button data-vstep="' + i + ':1">＋</button></div>' +
                (i > 0 ? '<button class="v3-link" data-remove-hit="' + i + '">remove shot ' + (i + 1) + '</button>' : '') +
                '</div>';
        });
        html += '</div><div class="v3-linkrow"><button class="v3-link" id="rs-add-shot">+ add more shots</button></div>';
        return html;
    }

    /** Save always happens (STANDARDS §6.1 / Part 2 §3.4) — the truing
     *  payoff is a separate, optional next step gated on the load
     *  actually having BC + a velocity number, not a precondition for
     *  logging the hit at all. */
    function _finishSteelSave(app, rifle, S, units, ctx, btn) {
        var suppressorId = (ctx.suppressorEnabled && ctx.lastCan) ? ctx.lastCan : null;
        var stringId = generateUUID();
        _write(app.db, 'addSteelString', {
            id: stringId, rifleId: rifle.id, loadId: ctx.load.id,
            sessionDate: new Date().toISOString(), distanceYd: S.distanceYd, tier: 'full',
            dialedElev: S.dialed, dialedWind: 0, units: units,
            wind: null, directionOfFireDeg: null,
            suppressorId: suppressorId, lotNumber: ctx.load.lotNumber || null, notes: 'v3-simple'
        }).then(function () {
            var hitIn = S.hits[0] || 0;
            var elevOffUnits = simpleFromMOA(inchesToMOA(hitIn, S.distanceYd), units, S.distanceYd);
            return _write(app.db, 'addSteelShot', {
                stringId: stringId, seq: 1,
                elevOff: Math.round(elevOffUnits * 100) / 100, windOff: 0, units: units,
                heldElev: 0, heldWind: 0, mvFps: S.mv, mvSource: S.mv ? 'manual' : null
            });
        }).then(function () {
            if (ctx.load.bulletBC && (ctx.load.muzzleVelocity || ctx.load.truedMv)) {
                if (typeof RiflePayoff !== 'undefined') {
                    RiflePayoff.run(app, rifle, ctx.load, {
                        rangeYds: S.distanceYd, dialed: S.dialed, hitInches: S.hits[0] || 0, units: units,
                        shotMV: S.mv, mvMeasured: ctx.mvMeasured, zeroConfirmed: ctx.zeroConfirmed,
                        trackingVerified: ctx.trackingVerified
                    });
                } else {
                    app.show(rifle.id);
                }
            } else {
                _loggedNeedsNumbers(app, rifle, ctx.load);
            }
        }).catch(function (err) {
            if (btn) btn.disabled = false;
            alert('Save failed: ' + err.message + '\n\nStill on screen — try again.');
        });
    }

    /** "add more shots" — the same save, one string, N shots. Save
     *  always happens first, then RiflePayoff.runMulti (the same
     *  engine, built for N observations sharing one distance/dial). */
    function _finishSteelSaveMulti(app, rifle, S, units, ctx, btn) {
        var suppressorId = (ctx.suppressorEnabled && ctx.lastCan) ? ctx.lastCan : null;
        var stringId = generateUUID();
        _write(app.db, 'addSteelString', {
            id: stringId, rifleId: rifle.id, loadId: ctx.load.id,
            sessionDate: new Date().toISOString(), distanceYd: S.distanceYd, tier: 'full',
            dialedElev: S.dialed, dialedWind: 0, units: units,
            wind: null, directionOfFireDeg: null,
            suppressorId: suppressorId, lotNumber: ctx.load.lotNumber || null, notes: 'v3-simple-multi'
        }).then(function () {
            return Promise.all(S.hits.map(function (hitIn, i) {
                var elevOffUnits = simpleFromMOA(inchesToMOA(hitIn || 0, S.distanceYd), units, S.distanceYd);
                return _write(app.db, 'addSteelShot', {
                    stringId: stringId, seq: i + 1,
                    elevOff: Math.round(elevOffUnits * 100) / 100, windOff: 0, units: units,
                    heldElev: 0, heldWind: 0, mvFps: S.mv, mvSource: S.mv ? 'manual' : null
                });
            }));
        }).then(function () {
            if (ctx.load.bulletBC && (ctx.load.muzzleVelocity || ctx.load.truedMv)) {
                if (typeof RiflePayoff !== 'undefined' && RiflePayoff.runMulti) {
                    RiflePayoff.runMulti(app, rifle, ctx.load, {
                        rangeYds: S.distanceYd, dialed: S.dialed, hits: S.hits.slice(), units: units,
                        shotMV: S.mv, mvMeasured: ctx.mvMeasured, zeroConfirmed: ctx.zeroConfirmed,
                        trackingVerified: ctx.trackingVerified, groupId: stringId
                    });
                } else {
                    app.show(rifle.id);
                }
            } else {
                _loggedNeedsNumbers(app, rifle, ctx.load);
            }
        }).catch(function (err) {
            if (btn) btn.disabled = false;
            alert('Save failed: ' + err.message + '\n\nStill on screen — try again.');
        });
    }

    /** No ammo on file at all yet — the minimal "+ New ammo" form,
     *  inline, right where the dead-end used to be. Saving it re-runs
     *  the exact save this button was about to do. */
    function _needsAmmo(app, rifle, S, units, ctx) {
        var container = app.container;
        container.innerHTML = '<div class="screen"><div class="pagehead">' +
            '<button class="backline" id="rna-back">&lsaquo; Back</button></div>' +
            '<h2 style="padding:0 var(--edge);font:var(--type-title)">One thing first</h2>' +
            '<p style="padding:0 var(--edge);color:var(--text-secondary);margin-bottom:14px">' +
            UI.esc(rifle.name || 'This rifle') + ' has no ammo on file yet — what were you shooting?</p>' +
            '<div class="edge" style="padding:0 var(--edge)">' + NewAmmoForm.html('rna') + '</div></div>';
        document.getElementById('rna-back').addEventListener('click', function () {
            _renderSteel(app, rifle, S, units, (units === 'MIL' ? 0.1 : 0.25), ctx);
        });
        NewAmmoForm.bind('rna', app.db, rifle.id, function (load) {
            ctx.load = load;
            if (S.hits.length > 1) _finishSteelSaveMulti(app, rifle, S, units, ctx, null);
            else _finishSteelSave(app, rifle, S, units, ctx, null);
        });
    }

    /** The save already happened — this is a friendly nudge, never a
     *  block. Roy can log a hundred more hits before ever filling in
     *  BC/velocity if he wants; the payoff just waits for him. */
    function _loggedNeedsNumbers(app, rifle, load) {
        var container = app.container;
        container.innerHTML = '<div class="screen"><h2 style="margin-top:60px;text-align:center;padding:0 var(--edge);font:var(--type-title)">Logged.</h2>' +
            '<p style="text-align:center;color:var(--text-secondary);padding:0 var(--edge);margin-top:10px">' +
            'To turn that hit into a dial correction, ' + UI.esc(load.name || 'this ammo') +
            ' needs its BC and box speed on file &mdash; two minutes, once.</p>' +
            '<button class="v3-gold" id="rnn-add" style="margin-top:24px">Add BC &amp; speed</button>' +
            '<div class="v3-linkrow"><button class="v3-link" id="rnn-back">Not now</button></div></div>';
        document.getElementById('rnn-add').addEventListener('click', function () {
            if (window.AppNav) AppNav.openRifle(rifle.id);
        });
        document.getElementById('rnn-back').addEventListener('click', function () { app.show(rifle.id); });
    }

    /* ══ view 3c: chronograph ══════════════════════════════════ */

    function _chronoScreen(app, rifle) {
        var container = app.container;
        container.setAttribute('data-screen', 'v3-chrono');
        var S = { value: 2850, count: 10 };
        var COUNTS = [1, 5, 10];

        var html = '<div class="screen">';
        html += '<div class="pagehead"><button class="backline" id="rc-back">&lsaquo; Back</button>' +
            '<div class="pagetitle">Bullet speed</div></div>';
        html += '<div class="v3-fieldlbl">AVERAGE SPEED</div>' + _v3Stepper('rc-speed', String(S.value), 'feet per second');
        html += '<div class="v3-fieldlbl">FROM ABOUT HOW MANY SHOTS?</div><div class="v3-chips" id="rc-count">';
        COUNTS.forEach(function (c) {
            html += '<button class="v3-chip' + (S.count === c ? ' on' : '') + '" data-count="' + c + '">' + c + '</button>';
        });
        html += '<button class="v3-chip" data-count="guess">just a guess</button></div>';
        html += '<div class="v3-linkrow" style="margin-top:12px"><button class="v3-link" id="rc-import">import a chronograph file instead</button></div>';
        html += '<div class="v3-spacer" style="height:20px"></div>';
        html += '<button class="v3-gold" id="rc-save">Save</button>';
        html += '<div style="height:16px"></div></div>';
        container.innerHTML = html;

        document.getElementById('rc-back').addEventListener('click', function () { show(app, rifle); });
        document.getElementById('rc-import').addEventListener('click', function () {
            if (window.AppNav) AppNav.go('chrono');
        });
        _bindV3Stepper('rc-speed', function (dir) {
            S.value = Math.max(500, Math.min(5000, S.value + dir * 10));
            document.querySelector('#rc-speed .val').innerHTML = S.value + '<small>feet per second</small>';
        });
        var countWrap = document.getElementById('rc-count');
        countWrap.addEventListener('click', function (e) {
            var b = e.target.closest ? e.target.closest('[data-count]') : null;
            if (!b) return;
            var chips = countWrap.querySelectorAll('[data-count]');
            for (var i = 0; i < chips.length; i++) chips[i].classList.remove('on');
            b.classList.add('on');
            var v = b.getAttribute('data-count');
            S.count = v === 'guess' ? null : parseInt(v, 10);
        });

        document.getElementById('rc-save').addEventListener('click', function () {
            var btn = this;
            btn.disabled = true;
            app.db.getLoadsByRifle(rifle.id).catch(function () { return []; }).then(function (loads) {
                var load = null;
                loads.forEach(function (l) { if (!load && (l.truedMv || l.truedBc)) load = l; });
                if (!load && loads.length) load = loads[0];

                if (S.count === null && !load) {
                    // "Just a guess" writes the number straight onto a
                    // load — there has to be one to write it onto. Never
                    // dead-end here: get the minimum ammo needed inline.
                    btn.disabled = false;
                    _chronoNeedsAmmo(app, rifle, S);
                    return;
                }
                _finishChronoSave(app, rifle, S, load, btn);
            }).catch(function (err) {
                btn.disabled = false;
                alert('Could not save: ' + err.message);
            });
        });
    }

    function _finishChronoSave(app, rifle, S, load, btn) {
        if (S.count === null) {
            load.muzzleVelocity = Math.round(S.value);
            app.db.updateLoad(load).then(function () { app.show(rifle.id); })
                .catch(function (err) {
                    if (btn) btn.disabled = false;
                    alert('Could not save: ' + err.message);
                });
            return;
        }
        _write(app.db, 'addMvMeasurement', {
            rifleId: rifle.id, loadId: load ? load.id : null,
            value: Math.round(S.value), shotCount: S.count,
            lotNumber: load ? (load.lotNumber || null) : null, source: 'manual'
        }).then(function () {
            if (typeof Readiness !== 'undefined') Readiness.invalidate(rifle.id);
            app.show(rifle.id);
        }).catch(function (err) {
            if (btn) btn.disabled = false;
            alert('Could not save: ' + err.message);
        });
    }

    /** No ammo on file at all — same minimal "+ New ammo" form as the
     *  steel flow, inline, so the typed speed isn't lost. */
    function _chronoNeedsAmmo(app, rifle, S) {
        var container = app.container;
        container.innerHTML = '<div class="screen"><div class="pagehead">' +
            '<button class="backline" id="rca-back">&lsaquo; Back</button></div>' +
            '<h2 style="padding:0 var(--edge);font:var(--type-title)">One thing first</h2>' +
            '<p style="padding:0 var(--edge);color:var(--text-secondary);margin-bottom:14px">' +
            UI.esc(rifle.name || 'This rifle') + ' has no ammo on file yet — the speed rides with the box.</p>' +
            '<div class="edge" style="padding:0 var(--edge)">' + NewAmmoForm.html('rca') + '</div></div>';
        document.getElementById('rca-back').addEventListener('click', function () {
            _chronoScreen(app, rifle);
        });
        NewAmmoForm.bind('rca', app.db, rifle.id, function (load) {
            _finishChronoSave(app, rifle, S, load, null);
        });
    }

    /* ══ shared: the big glove stepper (v3-stepper) ═══════════ */

    function _v3Stepper(id, valueHtml, unitLabel) {
        return '<div class="v3-stepper" id="' + id + '">' +
            '<button data-vstep="' + id + ':-1">&minus;</button>' +
            '<div class="val">' + valueHtml + '<small>' + unitLabel + '</small></div>' +
            '<button data-vstep="' + id + ':1">＋</button></div>';
    }
    function _bindV3Stepper(id, onStep) {
        var root = document.getElementById(id);
        if (!root) return;
        var btns = root.querySelectorAll('[data-vstep]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', function () {
                onStep(parseInt(this.getAttribute('data-vstep').split(':')[1], 10));
            });
        }
    }
    function _fmtDial(v, units) {
        var decimals = units === 'MIL' ? 1 : 1;
        var sign = v < 0 ? '&minus;' : '';
        return sign + Math.abs(v).toFixed(decimals);
    }
    function _fmtHit(v) {
        if (!v) return 'ON';
        return Math.abs(v) + '&Prime; ' + (v > 0 ? 'high' : 'low');
    }

    // v3.0 view 5 / v4.0 coach line: both jump straight to a fact card,
    // skipping the "What happened?" chooser.
    return { show: show, showZero: _zeroScreen, showSteel: _steelScreen, showChrono: _chronoScreen };
})();

// Launcher (registration seam)
if (typeof window !== 'undefined') {
    window.RifleAdd = RifleAdd;
}
