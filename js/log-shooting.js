/**
 * log-shooting.js — LOG SHOOTING, the simple lane's one flow
 * (Contract v2.5 §2.2). One question first: "Paper or steel?"
 *
 *   PAPER → the existing photo capture (suppressor/lot defaults applied
 *           silently; a quiet "details" link changes them).
 *   STEEL → three fields, one screen: Distance · "I dialed" · then
 *           "Where did it hit?" (§2.3). Wind, holds, per-shot MV,
 *           direction of fire, tier choice: none of it appears — a
 *           quiet "more" reveals the detailed logger for the curious,
 *           and "Just photograph the plate" keeps the casual escape.
 *
 * The steel entry SAVES a real steel string + shot (same tables as the
 * detailed logger, honest defaults: no wind logged, holds 0/0) before
 * the payoff runs — Save always happens; Keep/Undo governs only the
 * correction (§3.4).
 */

var LogShooting = (function () {
    'use strict';

    var DISTANCES = [300, 400, 500, 600, 700, 800, 900, 1000];
    var LAST_KEY = 'yort_steel_last'; // shared with SteelSession

    var _db = null;

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

    function _write(fn, data) {
        return (typeof SyncQueue !== 'undefined' && SyncQueue)
            ? SyncQueue.write(fn, data)
            : _db[fn](data);
    }

    /* ── entry: paper or steel? ───────────────────────────── */

    function start(db, rifleId) {
        _db = db;
        var container = document.getElementById('view-home');
        if (!container) return;
        if (window.AppNav) AppNav.go('home');

        _resolveRifle(rifleId).then(function (rifle) {
            if (!rifle) {
                if (typeof FirstRifleFlow !== 'undefined') FirstRifleFlow.start(db);
                return;
            }
            container.setAttribute('data-screen', 'log-shooting');
            var html = '<div class="screen">';
            html += '<div class="pagehead">' +
                '<button class="backline" id="ls-back">&lsaquo; Home</button>' +
                '<div class="pagetitle">Log shooting</div>' +
                '<div class="pagesub mono">' + UI.esc(rifle.name || '') + '</div></div>';

            html += '<button class="cat" id="ls-paper">' +
                '<div class="ic">' + Icon('job-range', 22) + '</div>' +
                '<div class="txt"><b>Paper</b><span>Photograph the target — group and zero, measured for you</span></div>' +
                '<span class="chev">&rsaquo;</span></button>';
            html += '<button class="cat" id="ls-steel">' +
                '<div class="ic">' + Icon('job-steel', 22) + '</div>' +
                '<div class="txt"><b>Steel</b><span>One hit at distance makes your whole drop chart better</span></div>' +
                '<span class="chev">&rsaquo;</span></button>';

            html += '<div style="height:16px"></div></div>';
            container.innerHTML = html;

            document.getElementById('ls-back').addEventListener('click', function () {
                if (window.AppNav) AppNav.go('home');
            });
            document.getElementById('ls-paper').addEventListener('click', function () {
                if (window.SessionLaunch) SessionLaunch.start({ rifleId: rifle.id });
                else if (window.AppNav) AppNav.go('session');
            });
            document.getElementById('ls-steel').addEventListener('click', function () {
                _steelScreen(rifle);
            });
        });
    }

    function _resolveRifle(rifleId) {
        if (rifleId) return _db.getRifle(rifleId).catch(function () { return null; });
        return _db.getAllRifles().catch(function () { return []; }).then(function (rifles) {
            if (!rifles || !rifles.length) return null;
            var recent = (typeof Recents !== 'undefined') ? Recents.get() : null;
            var pick = rifles[0];
            rifles.forEach(function (r) { if (recent && r.id === recent.rifleId) pick = r; });
            return pick;
        });
    }

    /* ── the simple steel screen: three fields, one screen ── */

    function _steelScreen(rifle) {
        var container = document.getElementById('view-home');
        var units = (rifle.angleUnit === 'MIL' || rifle.angleUnit === 'IN') ? rifle.angleUnit : 'MOA';
        var step = units === 'MIL' ? 0.1 : 0.25;
        var S = {
            distanceYd: _last().distanceYd || 600,
            dialedElev: 0,
            dialedWind: 0
        };

        Promise.all([
            _db.getLoadsByRifle(rifle.id).catch(function () { return []; }),
            _db.getMvMeasurementsByRifle(rifle.id).catch(function () { return []; }),
            _db.getZeroEventsByRifle(rifle.id).catch(function () { return []; })
        ]).then(function (res) {
            var loads = res[0] || [];
            var load = null;
            loads.forEach(function (l) { if (!load && (l.truedMv || l.truedBc)) load = l; });
            if (!load) loads.forEach(function (l) { if (!load && l.bulletBC) load = l; });
            if (!load && loads.length) load = loads[0];
            var mvMeasured = (res[1] || []).length > 0;
            var zeroConfirmed = (res[2] || []).length > 0;

            container.setAttribute('data-screen', 'log-steel');
            var html = '<div class="screen">';
            html += '<div class="pagehead">' +
                '<button class="backline" id="lst-back">&lsaquo; Log shooting</button>' +
                '<div class="pagetitle">Steel</div>' +
                '<div class="pagesub mono">' + UI.esc(rifle.name || '') +
                (load ? ' · ' + UI.esc(load.name || '') : '') + '</div></div>';

            html += UI.sectionHead('How far?');
            html += '<div class="chip-row edge" id="lst-dist">';
            DISTANCES.forEach(function (d) {
                html += '<button class="chip-opt' + (S.distanceYd === d ? ' is-selected' : '') +
                    '" data-dist="' + d + '">' + d + '</button>';
            });
            html += '<button class="chip-opt' + (DISTANCES.indexOf(S.distanceYd) === -1 ? ' is-selected' : '') +
                '" data-dist="custom">＋</button></div>';
            html += '<div class="edge hidden" id="lst-custom"><div class="field">' +
                '<input type="number" inputmode="numeric" id="lst-dist-input" placeholder="Distance (yd)"></div></div>';

            html += UI.sectionHead('I dialed (' + UI.esc(units) + ')');
            html += '<div class="edge">' +
                _stepper('lst-elev', 'Up', S.dialedElev) +
                '</div>';
            html += '<details class="fold edge u-mt-10"><summary>Wind dialed too</summary>' +
                '<div class="fold-body">' + _stepper('lst-wind', 'Right / Left', S.dialedWind) + '</div></details>';

            html += '<button class="btn-primary btn-edge u-mt-14" id="lst-go">I shot — where did it hit? &rsaquo;</button>';

            // the escapes: casual photo · the full logger
            html += '<button class="action btn-edge u-full u-mt-10" id="lst-casual">Just photograph the plate</button>';
            html += '<details class="fold edge u-mt-10"><summary>more</summary>' +
                '<div class="fold-body"><p class="t-micro">Wind, holds, per-shot speeds, direction of fire — the full logger.</p>' +
                '<button class="btn u-full u-mt-10" id="lst-detailed">Open the detailed logger</button></div></details>';
            html += '<div style="height:16px"></div></div>';
            container.innerHTML = html;

            // distance chips
            var distWrap = document.getElementById('lst-dist');
            distWrap.addEventListener('click', function (e) {
                var b = e.target.closest ? e.target.closest('[data-dist]') : null;
                if (!b) return;
                var chips = distWrap.querySelectorAll('[data-dist]');
                for (var i = 0; i < chips.length; i++) chips[i].classList.remove('is-selected');
                b.classList.add('is-selected');
                var v = b.getAttribute('data-dist');
                var custom = document.getElementById('lst-custom');
                if (v === 'custom') {
                    custom.classList.remove('hidden');
                    document.getElementById('lst-dist-input').focus();
                } else {
                    custom.classList.add('hidden');
                    S.distanceYd = parseInt(v, 10);
                }
            });
            document.getElementById('lst-dist-input').addEventListener('change', function () {
                var v = parseInt(this.value, 10);
                if (isFinite(v) && v >= 100 && v <= 3000) S.distanceYd = v;
            });

            _bindStepper('lst-elev', S, 'dialedElev', step);
            _bindStepper('lst-wind', S, 'dialedWind', step);

            document.getElementById('lst-back').addEventListener('click', function () {
                start(_db, rifle.id);
            });
            document.getElementById('lst-casual').addEventListener('click', function () {
                if (window.ToolActions && ToolActions.steelCasual) ToolActions.steelCasual(_db, rifle.id);
            });
            document.getElementById('lst-detailed').addEventListener('click', function () {
                if (window.ToolActions && ToolActions.steelSession) ToolActions.steelSession(_db, rifle.id);
            });

            document.getElementById('lst-go').addEventListener('click', function () {
                _rememberLast({ distanceYd: S.distanceYd });
                if (!load || !load.bulletBC || !(load.muzzleVelocity || load.truedMv)) {
                    _noNumbersYet(rifle, load);
                    return;
                }
                _askHit(rifle, load, units, S, { mvMeasured: mvMeasured, zeroConfirmed: zeroConfirmed });
            });
        });
    }

    /** No BC/speed on file — honest, with the one obvious fix. */
    function _noNumbersYet(rifle) {
        var container = document.getElementById('view-home');
        container.innerHTML = '<div class="screen"><div class="pagehead">' +
            '<div class="pagetitle">One thing first</div></div>' +
            '<p class="t-body edge">To turn a hit into better numbers, ' +
            UI.esc(rifle.name || 'this rifle') + ' needs its bullet and box speed on file — two minutes, once.</p>' +
            '<button class="btn-primary btn-edge u-mt-14" id="lnn-add">Add bullet &amp; speed</button>' +
            '<button class="btn btn-edge u-mt-10" id="lnn-back">Not now</button></div>';
        document.getElementById('lnn-add').addEventListener('click', function () {
            if (window.AppNav) AppNav.openRifle(rifle.id);
        });
        document.getElementById('lnn-back').addEventListener('click', function () {
            if (window.AppNav) AppNav.go('home');
        });
    }

    /** Hand off to §2.3 — saving the string+shot FIRST (§3.4). */
    function _askHit(rifle, load, units, S, flags) {
        var stringId = null;
        SimpleTrue.askHit({
            db: _db,
            rifle: rifle,
            load: load,
            rangeYds: S.distanceYd,
            dialed: S.dialedElev,
            units: units,
            mvMeasured: flags.mvMeasured,
            zeroConfirmed: flags.zeroConfirmed,
            trackingVerified: typeof rifle.scopeCorrectionFactor === 'number',
            beforeCompute: function (hit) {
                // a REAL steel string + shot — same tables, honest defaults
                stringId = generateUUID();
                return _write('addSteelString', {
                    id: stringId,
                    rifleId: rifle.id,
                    loadId: load.id,
                    sessionDate: new Date().toISOString(),
                    distanceYd: S.distanceYd,
                    tier: 'full',
                    dialedElev: S.dialedElev,
                    dialedWind: S.dialedWind,
                    units: units,
                    wind: null,            // simple lane: no wind logged (honest)
                    directionOfFireDeg: null,
                    notes: 'simple'
                }).then(function () {
                    var elevOffUnits = simpleFromMOA(
                        inchesToMOA(hit.hitIn, S.distanceYd), units, S.distanceYd);
                    var windOffUnits = simpleFromMOA(
                        inchesToMOA(hit.windIn || 0, S.distanceYd), units, S.distanceYd);
                    return _write('addSteelShot', {
                        stringId: stringId,
                        seq: 1,
                        elevOff: Math.round(elevOffUnits * 100) / 100,
                        windOff: Math.round(windOffUnits * 100) / 100,
                        units: units,
                        heldElev: 0,
                        heldWind: 0,
                        mvFps: hit.mv || null,
                        mvSource: hit.mv ? 'manual' : null
                    });
                });
            },
            onDone: function () {
                // land on the card — it now tells the story
                if (window.AppNav) AppNav.go('home');
            }
        });
    }

    /* ── shared stepper (big, glove-friendly) ─────────────── */

    function _stepper(id, label, value) {
        return '<div class="u-mt-10"><div class="t-label" style="margin-bottom:6px">' + label + '</div>' +
            '<div style="display:flex;align-items:center;gap:10px">' +
            '<button class="btn" style="flex:0 0 64px;min-height:64px;font-size:28px" data-lstep="' + id + ':-1">&minus;</button>' +
            '<div style="flex:1;text-align:center"><b class="mono" id="' + id + '-val" style="font-size:34px">' +
            (Math.round(value * 100) / 100) + '</b></div>' +
            '<button class="btn" style="flex:0 0 64px;min-height:64px;font-size:28px" data-lstep="' + id + ':1">＋</button>' +
            '</div></div>';
    }

    function _bindStepper(id, S, field, step) {
        var btns = document.querySelectorAll('[data-lstep^="' + id + ':"]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', function () {
                var dir = parseInt(this.getAttribute('data-lstep').split(':')[1], 10);
                S[field] = Math.round((S[field] + dir * step) * 100) / 100;
                var el = document.getElementById(id + '-val');
                if (el) el.textContent = S[field];
            });
        }
    }

    return { start: start };
})();

// Launcher (registration seam)
if (typeof window !== 'undefined') {
    window.ToolActions = window.ToolActions || {};
    window.ToolActions.logShooting = function (db, rifleId) {
        LogShooting.start(db, rifleId);
    };
}
