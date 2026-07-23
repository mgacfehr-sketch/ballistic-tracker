/**
 * steel-session.js — the Steel/Field Session job (§2.2).
 *
 * Two tiers by intent:
 *   CASUAL — photograph the plate / rough note. Minimal friction.
 *   FULL   — the serious loop: wind per string (tap-first clock dial),
 *            per-shot impact steppers (locked increments, per-rifle
 *            units), sticky holds (default 0/0), optional per-shot MV
 *            (numeric pad), direction of fire at ≥800, running string
 *            list, save / send to truing.
 *
 * Every shot stores dial + hold + impact + wind + optional MV — the
 * complete truing equation. Fully offline: all writes go through
 * SyncQueue; the string id is client-generated up front so shots can
 * reference it before anything reaches the server.
 *
 * Pure logic lives in js/steel-core.js (Node-tested). This file is
 * DOM only. Launcher: window.ToolActions.steelSession(db, rifleId).
 */

var SteelSession = (function () {
    'use strict';

    var DISTANCES = [500, 600, 700, 800, 900, 1000];
    var LAST_KEY = 'yort_steel_last'; // {distanceYd, units} device-local

    var _db = null;
    var _container = null;
    var _S = null; // session state

    function _write(fn, data) {
        return (typeof SyncQueue !== 'undefined' && SyncQueue)
            ? SyncQueue.write(fn, data)
            : _db[fn](data);
    }

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

    /* ── entry ────────────────────────────────────────────── */

    function open(db, rifleId) {
        _db = db;
        _container = document.getElementById('view-home');
        if (!_container) return;
        if (window.AppNav) AppNav.go('home');

        Promise.all([
            db.getRifle(rifleId).catch(function () { return null; }),
            db.getLoadsByRifle(rifleId).catch(function () { return []; }),
            (typeof Suppressors !== 'undefined') ? Suppressors.isEnabled(db) : Promise.resolve(false),
            (typeof Suppressors !== 'undefined') ? Suppressors.getLastUsed(db, rifleId) : Promise.resolve(null),
            db.getSuppressors ? db.getSuppressors().catch(function () { return []; }) : Promise.resolve([])
        ]).then(function (res) {
            var rifle = res[0];
            if (!rifle) {
                if (window.Categories) Categories.show('steel');
                return;
            }
            var loads = res[1] || [];
            var load = null;
            loads.forEach(function (l) { if (!load && l.truedMv) load = l; });
            if (!load && loads.length) load = loads[0];
            var last = _last();

            _S = {
                rifle: rifle,
                load: load,
                units: rifle.angleUnit === 'MIL' || rifle.angleUnit === 'IN' || rifle.angleUnit === 'MOA'
                    ? rifle.angleUnit : (rifle.angleUnit || 'MOA'),
                distanceYd: last.distanceYd || 700,
                dialedElev: 0,
                dialedWind: 0,
                wind: { clock: 12, mph: 0, flagged: false },
                dofChip: null,
                dofSource: null,
                suppressorEnabled: res[2],
                suppressorId: res[3] && (res[4] || []).some(function (c) { return c.id === res[3]; }) ? res[3] : null,
                suppressors: res[4] || [],
                lotNumber: load ? (load.lotNumber || null) : null,
                heldElev: 0,
                heldWind: 0,
                shots: [],
                gust: null // pending wind override for the NEXT logged shot
            };
            renderSetup();
        });
    }

    /* ── setup screen ─────────────────────────────────────── */

    function renderSetup() {
        _container.setAttribute('data-screen', 'steel-setup');
        var S = _S;
        var html = '<div class="screen">';
        html += '<div class="pagehead">' +
            '<button class="backline" id="st-back">&lsaquo; Steel/Field Session</button>' +
            '<div class="pagetitle">' + UI.esc(S.rifle.name || 'Steel') + '</div>' +
            (S.load ? '<div class="pagesub mono">' + UI.esc(S.load.name) +
                (S.lotNumber ? ' &middot; Lot ' + UI.esc(S.lotNumber) : '') + '</div>' : '') +
            '</div>';

        // Distance chips (§2.2) — one tap
        html += UI.sectionHead('Distance');
        html += '<div class="chip-row edge" id="st-dist">';
        DISTANCES.forEach(function (d) {
            html += '<button class="chip-opt' + (S.distanceYd === d ? ' is-selected' : '') +
                '" data-dist="' + d + '">' + d + '</button>';
        });
        html += '<button class="chip-opt' + (DISTANCES.indexOf(S.distanceYd) === -1 ? ' is-selected' : '') +
            '" data-dist="custom">＋</button>';
        html += '</div>';
        html += '<div class="edge hidden" id="st-dist-custom"><div class="field">' +
            '<input type="number" inputmode="numeric" id="st-dist-input" placeholder="Distance (yd)" value="' +
            (DISTANCES.indexOf(S.distanceYd) === -1 ? S.distanceYd : '') + '"></div></div>';

        // Dialed correction (full tier)
        html += UI.sectionHead('Dialed (' + UI.esc(S.units) + ')');
        html += '<div class="edge" id="st-dialed">' +
            _stepperHtml('dial-elev', 'Elevation', S.dialedElev, 'UP', 'DOWN') +
            _stepperHtml('dial-wind', 'Windage', S.dialedWind, 'RIGHT', 'LEFT') +
            '</div>';

        // Wind for this string — the clock dial (tap-first, §2.2 spec)
        html += UI.sectionHead('Wind for this string');
        html += '<div class="edge" id="st-wind">' + _windHtml() + '</div>';
        html += '<p class="t-micro edge">Set once per string; every shot inherits it. ' +
            'Log a gust override on any shot. Heavy wind? Flag it so truing down-weights this string.</p>';

        // Direction of fire (≥800; collapsed below)
        html += '<div id="st-dof-wrap">' + _dofHtml() + '</div>';

        // Suppressor + lot (sticky defaults, §2.8)
        if (S.suppressorEnabled) {
            html += UI.sectionHead('Suppressor');
            html += '<div class="chip-row edge" id="st-cans">';
            html += '<button class="chip-opt' + (S.suppressorId === null ? ' is-selected' : '') +
                '" data-can="bare">Bare</button>';
            S.suppressors.forEach(function (c) {
                html += '<button class="chip-opt' + (S.suppressorId === c.id ? ' is-selected' : '') +
                    '" data-can="' + c.id + '">' + UI.esc(c.name) + '</button>';
            });
            html += '</div>';
        }

        html += '<button class="btn-primary btn-edge u-mt-14" id="st-start">Start logging shots</button>';
        html += '<button class="btn btn-edge u-mt-10" id="st-casual">' +
            'Or just photograph the steel</button>';
        html += '<p class="t-micro edge">Photo mode saves the picture, but you\'ll measure ' +
            'in ' + UI.esc(S.units) + ' yourself — no auto-scale on steel.</p>';
        html += '</div>';
        _container.innerHTML = html;
        bindSetup();
    }

    function bindSetup() {
        var S = _S;
        document.getElementById('st-back').addEventListener('click', function () {
            if (window.Categories) Categories.show('steel', S.rifle.id);
        });
        var distWrap = document.getElementById('st-dist');
        distWrap.addEventListener('click', function (e) {
            var b = e.target.closest ? e.target.closest('[data-dist]') : null;
            if (!b) return;
            var v = b.getAttribute('data-dist');
            var custom = document.getElementById('st-dist-custom');
            if (v === 'custom') {
                custom.classList.remove('hidden');
                document.getElementById('st-dist-input').focus();
            } else {
                S.distanceYd = parseInt(v, 10);
                custom.classList.add('hidden');
                _selectChip(distWrap, b);
                _refreshDof();
            }
        });
        var distInput = document.getElementById('st-dist-input');
        distInput.addEventListener('change', function () {
            var v = parseInt(distInput.value, 10);
            if (v > 0) { S.distanceYd = v; _refreshDof(); }
        });

        _bindStepper('dial-elev', function (v) { S.dialedElev = v; }, function () { return S.dialedElev; });
        _bindStepper('dial-wind', function (v) { S.dialedWind = v; }, function () { return S.dialedWind; });
        _bindWind(document.getElementById('st-wind'));
        _bindDof();

        var cans = document.getElementById('st-cans');
        if (cans) cans.addEventListener('click', function (e) {
            var b = e.target.closest ? e.target.closest('[data-can]') : null;
            if (!b) return;
            var v = b.getAttribute('data-can');
            S.suppressorId = v === 'bare' ? null : v;
            _selectChip(cans, b);
        });

        document.getElementById('st-start').addEventListener('click', function () {
            _rememberLast({ distanceYd: S.distanceYd });
            renderLogger();
        });
        document.getElementById('st-casual').addEventListener('click', function () {
            renderCasual();
        });
    }

    function _selectChip(wrap, btn) {
        var all = wrap.querySelectorAll('.chip-opt');
        for (var i = 0; i < all.length; i++) all[i].classList.remove('is-selected');
        btn.classList.add('is-selected');
    }

    /* ── wind clock dial ──────────────────────────────────── */

    function _windHtml() {
        var S = _S;
        var html = '<div style="display:flex;gap:16px;align-items:center">';
        html += '<div id="st-clock" style="width:150px;flex:0 0 150px">' + _clockSvg() + '</div>';
        html += '<div style="flex:1">';
        html += '<div class="mono" style="font-size:26px;font-weight:700" id="st-wind-mph">' +
            S.wind.mph + ' mph</div>';
        html += '<div class="t-micro" id="st-wind-text">' +
            UI.esc(steelWindText(S.wind.clock, S.wind.mph)) + '</div>';
        html += '<div class="u-mt-10" style="display:flex;gap:8px">' +
            '<button class="btn" style="min-width:52px" id="st-mph-down">&minus;</button>' +
            '<button class="btn" style="min-width:52px" id="st-mph-up">＋</button>' +
            '<button class="btn" id="st-mph-type" title="Type it">123</button>' +
            '</div>';
        html += '<button class="chip-opt u-mt-10' + (S.wind.flagged ? ' is-selected' : '') +
            '" id="st-wind-flag">Gusty / unstable</button>';
        html += '</div></div>';
        return html;
    }

    /** Tap-first dial: 12 large tap zones set direction; the arrow is
     *  thick with an unmistakable head; direction ALWAYS in text. */
    function _clockSvg() {
        var S = _S;
        var svg = '<svg viewBox="0 0 150 150" style="width:100%">';
        svg += '<circle cx="75" cy="75" r="66" fill="none" stroke="var(--border-default)" stroke-width="2"/>';
        [[75, 12, 75, 22], [138, 75, 128, 75], [75, 138, 75, 128], [12, 75, 22, 75]].forEach(function (t) {
            svg += '<line x1="' + t[0] + '" y1="' + t[1] + '" x2="' + t[2] + '" y2="' + t[3] +
                '" stroke="var(--text-tertiary)" stroke-width="2"/>';
        });
        svg += '<text x="75" y="34" text-anchor="middle" font-size="11" fill="var(--text-tertiary)">12</text>' +
            '<text x="120" y="79" text-anchor="middle" font-size="11" fill="var(--text-tertiary)">3</text>' +
            '<text x="75" y="126" text-anchor="middle" font-size="11" fill="var(--text-tertiary)">6</text>' +
            '<text x="30" y="79" text-anchor="middle" font-size="11" fill="var(--text-tertiary)">9</text>';
        if (S.wind.mph > 0) {
            // wind FROM the clock position, arrow pointing at center
            var ang = (S.wind.clock % 12) * Math.PI / 6 - Math.PI / 2;
            var fx = 75 + Math.cos(ang) * 52, fy = 75 + Math.sin(ang) * 52;
            var tx = 75 + Math.cos(ang) * 16, ty = 75 + Math.sin(ang) * 16;
            svg += '<defs><marker id="st-ah" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">' +
                '<path d="M0 0L8 4L0 8z" fill="var(--brand-gold)"/></marker></defs>';
            svg += '<line x1="' + fx + '" y1="' + fy + '" x2="' + tx + '" y2="' + ty +
                '" stroke="var(--brand-gold)" stroke-width="4" marker-end="url(#st-ah)"/>';
        }
        svg += '<circle cx="75" cy="75" r="5" fill="var(--brand-gold)"/>';
        // The ENTIRE dial is the hit area (tap-target audit: a tap
        // anywhere resolves to the nearest of the 12 zones by angle)
        svg += '<circle cx="75" cy="75" r="74" fill="transparent" data-clock-dial="1" style="cursor:pointer"/>';
        svg += '</svg>';
        return svg;
    }

    function _bindWind(wrap) {
        var S = _S;
        function refresh() {
            document.getElementById('st-clock').innerHTML = _clockSvg();
            document.getElementById('st-wind-mph').textContent = S.wind.mph + ' mph';
            document.getElementById('st-wind-text').textContent = steelWindText(S.wind.clock, S.wind.mph);
            bindClock();
        }
        function bindClock() {
            var dial = wrap.querySelector('[data-clock-dial]');
            if (!dial) return;
            dial.addEventListener('click', function (e) {
                // nearest clock zone by tap angle — the whole dial taps
                var box = this.getBoundingClientRect();
                var dx = e.clientX - (box.left + box.width / 2);
                var dy = e.clientY - (box.top + box.height / 2);
                if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return; // dead center
                var hour = Math.round(((Math.atan2(dy, dx) + Math.PI / 2) / (Math.PI / 6)));
                hour = ((hour % 12) + 12) % 12;
                S.wind.clock = hour === 0 ? 12 : hour;
                if (S.wind.mph === 0) S.wind.mph = 5; // a direction implies wind
                refresh();
            });
        }
        bindClock();
        document.getElementById('st-mph-down').addEventListener('click', function () {
            S.wind.mph = Math.max(0, S.wind.mph - 1);
            refresh();
        });
        document.getElementById('st-mph-up').addEventListener('click', function () {
            S.wind.mph = Math.min(60, S.wind.mph + 1);
            refresh();
        });
        document.getElementById('st-mph-type').addEventListener('click', function () {
            _numPad('Wind speed (mph)', S.wind.mph, function (v) {
                S.wind.mph = Math.max(0, Math.min(60, Math.round(v)));
                refresh();
            });
        });
        document.getElementById('st-wind-flag').addEventListener('click', function () {
            S.wind.flagged = !S.wind.flagged;
            this.classList.toggle('is-selected', S.wind.flagged);
        });
    }

    /* ── direction of fire (≥800) ─────────────────────────── */

    function _dofHtml() {
        var S = _S;
        var far = S.distanceYd >= 800;
        var html = '';
        html += UI.sectionHead(far ? 'Facing (direction of fire)' : '');
        if (!far) {
            return '<details class="edge"><summary class="t-micro">＋ more (direction of fire)</summary>' +
                _dofChips() + '</details>';
        }
        return html + _dofChips() +
            '<p class="t-micro edge">At ' + S.distanceYd + ' yd the earth\'s rotation moves your ' +
            'vertical — truing uses this to remove it.</p>';
    }

    function _dofChips() {
        var S = _S;
        var html = '<div class="chip-row edge" id="st-dof">';
        STEEL_DOF_CHIPS.forEach(function (c) {
            html += '<button class="chip-opt' + (S.dofChip === c ? ' is-selected' : '') +
                '" data-dof="' + c + '">' + c + '</button>';
        });
        html += '<button class="chip-opt" id="st-compass">Use compass</button>';
        html += '</div>';
        return html;
    }

    function _refreshDof() {
        var wrap = document.getElementById('st-dof-wrap');
        if (wrap) { wrap.innerHTML = _dofHtml(); _bindDof(); }
    }

    function _bindDof() {
        var S = _S;
        var wrap = document.getElementById('st-dof');
        if (!wrap) return;
        wrap.addEventListener('click', function (e) {
            var b = e.target.closest ? e.target.closest('[data-dof]') : null;
            if (b) {
                S.dofChip = b.getAttribute('data-dof');
                S.dofSource = 'manual';
                _selectChip(wrap, b);
            }
        });
        var compass = document.getElementById('st-compass');
        if (compass) compass.addEventListener('click', function () {
            if (typeof DeviceOrientationEvent === 'undefined') return;
            var done = false;
            function onOrient(e) {
                if (done) return;
                var heading = (typeof e.webkitCompassHeading === 'number')
                    ? e.webkitCompassHeading
                    : (typeof e.alpha === 'number' ? 360 - e.alpha : null);
                var chip = steelDofFromHeading(heading);
                if (chip) {
                    done = true;
                    window.removeEventListener('deviceorientation', onOrient);
                    S.dofChip = chip;
                    S.dofSource = 'compass';
                    _refreshDof();
                }
            }
            var start = function () { window.addEventListener('deviceorientation', onOrient); };
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                DeviceOrientationEvent.requestPermission().then(function (state) {
                    if (state === 'granted') start();
                }).catch(function () { /* manual chips always work */ });
            } else {
                start();
            }
        });
    }

    /* ── the per-shot logger ──────────────────────────────── */

    function renderLogger() {
        _container.setAttribute('data-screen', 'steel-logger');
        var S = _S;
        var n = S.shots.length + 1;
        var html = '<div class="screen">';
        html += '<div class="pagehead">' +
            '<button class="backline" id="st-back-setup">&lsaquo; ' + S.distanceYd + ' yd &middot; ' +
            UI.esc(steelWindText(S.wind.clock, S.wind.mph)) + '</button>' +
            '<div class="pagetitle">Shot ' + n + ' — where did it land?</div>' +
            '</div>';

        // Units follow the rifle; seg control persists the preference
        html += '<div class="segment edge" id="st-units">' +
            ['IN', 'MOA', 'MIL'].map(function (u) {
                return '<button data-unit="' + u + '"' + (S.units === u ? ' class="on"' : '') + '>' +
                    (u === 'IN' ? 'Inches' : u) + '</button>';
            }).join('') + '</div>';

        html += '<div class="edge u-mt-10">' +
            _stepperHtml('shot-elev', 'Elevation', S._elev || 0, 'HIGH', 'LOW') +
            _stepperHtml('shot-wind', 'Windage', S._wind || 0, 'RIGHT', 'LEFT') +
            '</div>';

        // Sticky holds (crucial truing data; default 0/0 = dialed everything)
        html += '<button class="rowlink edge u-full" id="st-holds" style="border:1px dashed var(--border-default);border-radius:12px">' +
            '<div class="txt"><b>Holding: ' + _fmtHold(S.heldElev) + ' / ' + _fmtHold(S.heldWind) + '</b>' +
            '<span class="t-micro">held elevation / wind, on top of the dial — tap to change</span></div></button>';

        // Optional per-shot velocity — digits-only pad, ~3 seconds
        html += '<div class="field edge u-mt-10"><label for="st-mv">Velocity (optional, fps)</label>' +
            '<input type="text" inputmode="numeric" pattern="[0-9]*" id="st-mv" placeholder="from the chrono screen"></div>';

        // Gust override for THIS shot
        html += '<button class="rowlink edge u-full" id="st-gust">' +
            '<div class="txt"><span class="t-micro">' +
            (S.gust ? 'This shot: ' + UI.esc(steelWindText(S.gust.clock, S.gust.mph)) + ' (gust) — tap to clear'
                : 'Gust on this shot? Tap to log a different wind for it') +
            '</span></div></button>';

        html += '<button class="btn-primary btn-edge u-mt-10" id="st-log">Log shot ' + n + '</button>';

        // Running string list (mono; center hits green)
        if (S.shots.length) {
            html += UI.sectionHead('This string');
            var rows = '';
            S.shots.forEach(function (s) {
                var desc = steelDescribeShot(s.elevOff, s.windOff, S.units);
                var center = steelIsCenter(s.elevOff, s.windOff, S.units);
                rows += '<div class="rowlink"><div class="txt"><span class="mono" style="' +
                    (center ? 'color:var(--status-ready)' : '') + '">Shot ' + s.seq + ' &middot; ' +
                    UI.esc(desc) + (s.mvFps ? ' &middot; ' + Math.round(s.mvFps) + ' fps' : '') +
                    '</span></div></div>';
            });
            var sum = steelStringSummary(S.shots, S.units);
            rows += '<div class="rowlink"><div class="txt"><span class="t-micro mono">mean ' +
                UI.esc(steelDescribeShot(sum.meanElevOff, sum.meanWindOff, S.units)) +
                ' &middot; ' + sum.mvCount + '/' + sum.n + ' with MV</span></div></div>';
            html += UI.card(rows);
            if (typeof TruingJob !== 'undefined') {
                html += '<button class="btn btn-edge u-mt-10" id="st-to-truing" ' +
                    'style="color:var(--brand-gold);border-color:var(--brand-gold)">Send string to Truing &rsaquo;</button>';
            }
            html += '<button class="btn-primary btn-edge u-mt-10" id="st-save">Save to ' +
                UI.esc(S.rifle.name || 'rifle') + '</button>';
        }
        html += '<div style="height:16px"></div></div>';
        _container.innerHTML = html;
        bindLogger();
    }

    function _fmtHold(v) {
        return (Math.round(Math.abs(v) * 100) / 100) + (v === 0 ? '' : (v > 0 ? '↑' : '↓'));
    }

    function bindLogger() {
        var S = _S;
        document.getElementById('st-back-setup').addEventListener('click', renderSetup);

        var unitSeg = document.getElementById('st-units');
        unitSeg.addEventListener('click', function (e) {
            var b = e.target.closest ? e.target.closest('[data-unit]') : null;
            if (!b) return;
            S.units = b.getAttribute('data-unit');
            // persist per rifle (units flow everywhere — Part 0.6 #8)
            S.rifle.angleUnit = S.units;
            _db.updateRifle(S.rifle).catch(function () {});
            S._elev = 0; S._wind = 0;
            renderLogger();
        });

        S._elev = S._elev || 0;
        S._wind = S._wind || 0;
        _bindStepper('shot-elev', function (v) { S._elev = v; }, function () { return S._elev; });
        _bindStepper('shot-wind', function (v) { S._wind = v; }, function () { return S._wind; });

        document.getElementById('st-holds').addEventListener('click', function () {
            _holdsSheet();
        });
        document.getElementById('st-gust').addEventListener('click', function () {
            if (S.gust) { S.gust = null; renderLogger(); return; }
            _numPad('Gust speed (mph) from ' + S.wind.clock + " o'clock", S.wind.mph, function (v) {
                S.gust = { clock: S.wind.clock, mph: Math.max(0, Math.round(v)) };
                renderLogger();
            });
        });

        document.getElementById('st-log').addEventListener('click', function () {
            var mvEl = document.getElementById('st-mv');
            var mv = mvEl && mvEl.value ? parseFloat(mvEl.value) : null;
            S.shots.push({
                seq: S.shots.length + 1,
                elevOff: S._elev,
                windOff: S._wind,
                units: S.units,
                heldElev: S.heldElev,
                heldWind: S.heldWind,
                mvFps: (mv && mv > 300 && mv < 5000) ? mv : null,
                mvSource: (mv && mv > 300 && mv < 5000) ? 'manual' : null,
                windOverride: S.gust
            });
            S._elev = 0; S._wind = 0; S.gust = null;
            renderLogger();
        });

        var toTruing = document.getElementById('st-to-truing');
        if (toTruing) toTruing.addEventListener('click', function () {
            _saveString(true);
        });
        var save = document.getElementById('st-save');
        if (save) save.addEventListener('click', function () {
            _saveString(false);
        });
    }

    /** Sticky holds sheet — the new hold applies from this shot forward. */
    function _holdsSheet() {
        var S = _S;
        var overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.innerHTML =
            '<div class="overlay-card">' +
            '<div class="overlay-title">Holding (' + UI.esc(S.units) + ')</div>' +
            '<p class="overlay-text">What you\'re holding IN ADDITION to the dial. ' +
            'Dialing everything? Leave it 0/0. Applies from this shot forward.</p>' +
            _stepperHtml('hold-elev', 'Held elevation', S.heldElev, 'HIGH', 'LOW') +
            _stepperHtml('hold-wind', 'Held wind', S.heldWind, 'RIGHT', 'LEFT') +
            '<button class="btn-primary u-full u-mt-10" id="holds-done">Done</button>' +
            '</div>';
        document.body.appendChild(overlay);
        _bindStepper('hold-elev', function (v) { S.heldElev = v; }, function () { return S.heldElev; }, overlay);
        _bindStepper('hold-wind', function (v) { S.heldWind = v; }, function () { return S.heldWind; }, overlay);
        function close() {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            renderLogger();
        }
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        overlay.querySelector('#holds-done').addEventListener('click', close);
    }

    /* ── shared stepper (glove-friendly ± with tap-to-type) ── */

    function _stepperHtml(id, label, value, posWord, negWord) {
        var dir = value > 0 ? posWord : (value < 0 ? negWord : '');
        return '<div class="field"><label>' + UI.esc(label) + '</label>' +
            '<div style="display:flex;align-items:center;border:1px solid var(--border-default);border-radius:12px;overflow:hidden;background:var(--surface-raised)">' +
            '<button type="button" data-step="-1" data-stepper="' + id + '" style="width:56px;min-height:56px;border:none;background:none;font-size:24px;font-weight:700;color:var(--brand-gold-strong)">&minus;</button>' +
            '<button type="button" data-type="1" data-stepper="' + id + '" class="mono" style="flex:1;border:none;background:none;font-size:24px;font-weight:700;min-height:56px" id="' + id + '-val">' +
            Math.abs(value) + '</button>' +
            '<span class="t-micro" style="padding-right:6px;min-width:52px;text-align:right" id="' + id + '-dir">' + dir + '</span>' +
            '<button type="button" data-step="1" data-stepper="' + id + '" style="width:56px;min-height:56px;border:none;background:none;font-size:24px;font-weight:700;color:var(--brand-gold-strong)">＋</button>' +
            '</div></div>';
    }

    function _bindStepper(id, set, get, root) {
        root = root || _container;
        var btns = root.querySelectorAll('[data-stepper="' + id + '"]');
        function refresh() {
            var v = get();
            var valEl = root.querySelector('#' + id + '-val');
            var dirEl = root.querySelector('#' + id + '-dir');
            if (valEl) valEl.textContent = Math.abs(Math.round(v * 1000) / 1000);
            if (dirEl) {
                var posWord = id.indexOf('elev') !== -1 ? 'HIGH' : 'RIGHT';
                var negWord = id.indexOf('elev') !== -1 ? 'LOW' : 'LEFT';
                if (id.indexOf('dial-elev') !== -1) { posWord = 'UP'; negWord = 'DOWN'; }
                dirEl.textContent = v > 0 ? posWord : (v < 0 ? negWord : '');
            }
        }
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', function () {
                if (this.getAttribute('data-type')) {
                    _numPad('Enter value (' + _S.units + ')', Math.abs(get()), function (v) {
                        set(get() < 0 ? -Math.abs(v) : Math.abs(v));
                        refresh();
                    });
                    return;
                }
                var dir = parseInt(this.getAttribute('data-step'), 10);
                set(steelStep(get(), dir, _S.units));
                refresh();
            });
        }
    }

    /** Explicit number-pad entry (keyboard outdoors only by explicit tap). */
    function _numPad(title, current, onValue) {
        var overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.innerHTML =
            '<div class="overlay-card">' +
            '<div class="overlay-title">' + UI.esc(title) + '</div>' +
            '<div class="field"><input type="text" inputmode="decimal" id="np-input" value="' +
            (current || '') + '"></div>' +
            '<button class="btn-primary u-full" id="np-ok">Set</button>' +
            '</div>';
        document.body.appendChild(overlay);
        var input = overlay.querySelector('#np-input');
        input.focus();
        input.select();
        function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        overlay.querySelector('#np-ok').addEventListener('click', function () {
            var v = parseFloat(input.value);
            close();
            if (isFinite(v)) onValue(v);
        });
    }

    /* ── save ─────────────────────────────────────────────── */

    function _saveString(toTruing) {
        var S = _S;
        if (!S.shots.length) return;
        var stringId = generateUUID();

        function doSave(environment) {
            var stringPayload = {
                id: stringId,
                rifleId: S.rifle.id,
                loadId: S.load ? S.load.id : null,
                sessionDate: new Date().toISOString(),
                distanceYd: S.distanceYd,
                tier: 'full',
                dialedElev: S.dialedElev,
                dialedWind: S.dialedWind,
                units: S.units,
                wind: { clock: S.wind.clock, mph: S.wind.mph, flagged: S.wind.flagged },
                directionOfFireDeg: S.dofChip ? steelDofToDegrees(S.dofChip) : null,
                dofSource: S.dofSource,
                environment: environment,
                suppressorId: S.suppressorId,
                lotNumber: S.lotNumber
            };
            return _write('addSteelString', stringPayload).then(function () {
                var chain = Promise.resolve();
                S.shots.forEach(function (s) {
                    chain = chain.then(function () {
                        return _write('addSteelShot', {
                            stringId: stringId,
                            seq: s.seq,
                            elevOff: s.elevOff,
                            windOff: s.windOff,
                            units: s.units,
                            heldElev: s.heldElev,
                            heldWind: s.heldWind,
                            mvFps: s.mvFps,
                            mvSource: s.mvSource,
                            windOverride: s.windOverride
                        });
                    });
                });
                return chain;
            }).then(function () {
                if (typeof Suppressors !== 'undefined') {
                    Suppressors.rememberLastUsed(_db, S.rifle.id, S.suppressorId);
                }
                if (toTruing && typeof TruingJob !== 'undefined' && window.ToolActions && ToolActions.truing) {
                    try { sessionStorage.setItem('yort_truing_string', stringId); } catch (e) { /* */ }
                    ToolActions.truing(_db, S.rifle.id);
                    return;
                }
                _savedScreen(stringId);
            }).catch(function (err) {
                alert('Save failed: ' + err.message + '\n\nYour string is still on screen — try again.');
            });
        }

        // Environment: lookup when online (source-stamped), null offline —
        // truing offers manual entry either way (§2.5a)
        if (typeof NetService !== 'undefined' && navigator.onLine !== false) {
            NetService.getConditions().then(function (cond) {
                doSave(cond ? {
                    tempF: cond.tempF, pressureInHg: cond.pressureInHg,
                    humidity: cond.humidity, source: 'lookup'
                } : null);
            }).catch(function () { doSave(null); });
        } else {
            doSave(null);
        }
    }

    function _savedScreen(stringId) {
        var S = _S;
        var sum = steelStringSummary(S.shots, S.units);
        _container.setAttribute('data-screen', 'steel-saved');
        var html = '<div class="screen">';
        html += '<div class="pagehead"><div class="pagetitle">String saved</div>' +
            '<div class="pagesub mono">' + S.distanceYd + ' yd &middot; ' + sum.n + ' shots &middot; mean ' +
            UI.esc(steelDescribeShot(sum.meanElevOff, sum.meanWindOff, S.units)) + '</div></div>';
        html += UI.banner('ready', 'Saved to ' + UI.esc(S.rifle.name || 'rifle') + '.', true);
        html += '<button class="btn-primary btn-edge u-mt-14" id="st-another">Log another string</button>';
        html += '<button class="btn btn-edge u-mt-10" id="st-done">Done</button>';
        html += '</div>';
        _container.innerHTML = html;
        document.getElementById('st-another').addEventListener('click', function () {
            S.shots = [];
            S._elev = 0; S._wind = 0;
            renderSetup();
        });
        document.getElementById('st-done').addEventListener('click', function () {
            if (window.Categories) Categories.show('steel', S.rifle.id);
        });
    }

    /* ── casual tier ──────────────────────────────────────── */

    function renderCasual() {
        _container.setAttribute('data-screen', 'steel-casual');
        var S = _S;
        var html = '<div class="screen">';
        html += '<div class="pagehead">' +
            '<button class="backline" id="st-back-setup2">&lsaquo; Steel session</button>' +
            '<div class="pagetitle">Photograph the steel</div>' +
            '<div class="pagesub mono">' + S.distanceYd + ' yd &middot; ' + UI.esc(S.rifle.name || '') + '</div>' +
            '</div>';
        html += '<p class="t-micro edge">You\'ll measure ' + UI.esc(S.units) +
            ' yourself — no auto-scale on steel. The photo and your note ride with the rifle.</p>';
        html += '<label class="btn-primary btn-edge u-mt-10" for="st-photo">Take the photo</label>' +
            '<input type="file" id="st-photo" accept="image/*" capture="environment" class="hidden">';
        html += '<div class="field edge u-mt-10"><label for="st-note">What happened? (optional)</label>' +
            '<input type="text" id="st-note" maxlength="200" placeholder="e.g. 4 of 5 at 700, wind pushed two right"></div>';
        html += '<button class="btn-primary btn-edge u-mt-14" id="st-casual-save">Save to ' +
            UI.esc(S.rifle.name || 'rifle') + '</button>';
        html += '<p class="t-micro edge" id="st-casual-status"></p>';
        html += '</div>';
        _container.innerHTML = html;

        var photoBlob = null;
        document.getElementById('st-back-setup2').addEventListener('click', renderSetup);
        document.getElementById('st-photo').addEventListener('change', function () {
            var file = this.files && this.files[0];
            var status = document.getElementById('st-casual-status');
            if (!file) return;
            status.textContent = 'Compressing photo…';
            loadImageFromFile(file).then(function (img) {
                var canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                canvas.getContext('2d').drawImage(img, 0, 0);
                var capped = typeof capCanvasSize === 'function' ? capCanvasSize(canvas, 2048) : canvas;
                return canvasToJpegBlob(capped, 0.80);
            }).then(function (blob) {
                photoBlob = blob;
                status.textContent = 'Photo ready (' + Math.round(blob.size / 1024) + ' KB).';
            }).catch(function (e) {
                status.textContent = 'Could not read the photo: ' + e.message;
            });
        });
        document.getElementById('st-casual-save').addEventListener('click', function () {
            var note = document.getElementById('st-note').value.trim();
            var stringId = generateUUID();
            var btn = this;
            btn.disabled = true;
            _write('addSteelString', {
                id: stringId,
                rifleId: S.rifle.id,
                loadId: S.load ? S.load.id : null,
                distanceYd: S.distanceYd,
                tier: 'casual',
                units: S.units,
                suppressorId: S.suppressorId,
                lotNumber: S.lotNumber,
                photoRef: photoBlob ? (_db.userId + '/steel_' + stringId + '.jpg') : null,
                notes: note
            }).then(function () {
                if (photoBlob && typeof SyncQueue !== 'undefined' && SyncQueue) {
                    return SyncQueue.writeImage(stringId, photoBlob, null, 'steel');
                }
                if (photoBlob) return _db.saveSteelPhoto(stringId, photoBlob);
                return null;
            }).then(function () {
                S.shots = [];
                _savedScreen(stringId);
            }).catch(function (err) {
                btn.disabled = false;
                alert('Save failed: ' + err.message);
            });
        });
    }

    /* ── chrono reconciliation confirm screen (§2.2) ──────── */

    /**
     * Pair an imported velocity string to a saved steel string's
     * logged impacts, IN ORDER, on a confirm screen. Called from the
     * steel history (Data & Records). Online activity by nature.
     */
    function pairChrono(db, steelString, onDone) {
        Promise.all([
            db.getSteelShotsByString(steelString.id),
            db.getVelocityStringsByRifle(steelString.rifleId).catch(function () { return []; })
        ]).then(function (res) {
            var shots = res[0] || [];
            var candidates = (res[1] || []).filter(function (v) { return v.shots && v.shots.length; });
            if (!shots.length) { alert('This string has no logged shots.'); return; }
            if (!candidates.length) { alert('No imported velocity strings for this rifle yet — import the chrono file first.'); return; }
            _pickVelocityString(candidates, function (vstring) {
                _confirmPairing(db, steelString, shots, vstring, onDone);
            });
        });
    }

    function _pickVelocityString(candidates, onPick) {
        var overlay = document.createElement('div');
        overlay.className = 'overlay';
        var rows = '';
        candidates.slice(0, 12).forEach(function (v) {
            var when = v.date ? new Date(v.date).toLocaleDateString() : '';
            rows += UI.rowlink({
                button: true,
                title: v.sheetName || 'String',
                sub: (v.shots.length + ' shots · avg ' + Math.round(v.avgFps || 0) + ' fps' +
                    (when ? ' · ' + when : '')),
                subMono: true,
                data: { vpick: v.id }
            });
        });
        overlay.innerHTML = '<div class="overlay-card">' +
            '<div class="overlay-title">Which chrono string?</div>' +
            '<div class="card" style="margin:0">' + rows + '</div></div>';
        document.body.appendChild(overlay);
        function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        var picks = overlay.querySelectorAll('[data-vpick]');
        for (var i = 0; i < picks.length; i++) {
            picks[i].addEventListener('click', function () {
                var id = this.getAttribute('data-vpick');
                close();
                for (var c = 0; c < candidates.length; c++) {
                    if (candidates[c].id === id) { onPick(candidates[c]); return; }
                }
            });
        }
    }

    function _confirmPairing(db, steelString, shots, vstring, onDone) {
        var chronoFps = vstring.shots.map(function (s) { return s.fps; });
        var logged = shots.map(function (s) { return { seq: s.seq, mvFps: s.mvFps }; });
        var pairing = steelPairVelocities(logged, chronoFps);
        var source = vstring.source === 'labradar_csv' ? 'labradar' : 'shotview';

        var overlay = document.createElement('div');
        overlay.className = 'overlay';
        var rows = '';
        pairing.rows.forEach(function (r) {
            var label, cls = '';
            if (r.action === 'fill') label = '→ ' + Math.round(r.chrono) + ' fps (fills the blank)';
            else if (r.action === 'match') label = Math.round(r.chrono) + ' fps ✓';
            else if (r.action === 'conflict') { label = 'you typed ' + Math.round(r.logged) + ', chrono says ' + Math.round(r.chrono) + ' — using chrono'; cls = 'style="color:var(--status-caution)"'; }
            else if (r.action === 'extra') { label = 'chrono has an extra shot — not paired'; cls = 'style="color:var(--status-caution)"'; }
            else label = r.logged ? Math.round(r.logged) + ' fps (yours, no chrono row)' : 'no velocity';
            rows += '<div class="rowlink"><div class="txt"><span class="mono" ' + cls + '>Shot ' +
                r.seq + ' &middot; ' + UI.esc(label) + '</span></div></div>';
        });
        var mismatch = pairing.countMismatch !== 0
            ? '<p class="overlay-text" style="color:var(--status-caution)">Counts differ: ' +
              chronoFps.length + ' chrono vs ' + logged.length + ' logged — pair anyway (in order) or cancel and fix.</p>'
            : '';
        overlay.innerHTML = '<div class="overlay-card">' +
            '<div class="overlay-title">Pair velocities — in order</div>' +
            mismatch +
            '<div class="card" style="margin:0">' + rows + '</div>' +
            '<button class="btn-primary u-full u-mt-10" id="pair-confirm">Confirm pairing</button>' +
            '<button class="btn u-full u-mt-10" id="pair-cancel">Cancel</button>' +
            '</div>';
        document.body.appendChild(overlay);
        function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        overlay.querySelector('#pair-cancel').addEventListener('click', close);
        overlay.querySelector('#pair-confirm').addEventListener('click', function () {
            var updated = steelApplyPairing(logged, pairing, source);
            var chain = Promise.resolve();
            shots.forEach(function (s, i) {
                if (updated[i].mvFps === s.mvFps) return;
                chain = chain.then(function () {
                    s.mvFps = updated[i].mvFps;
                    s.mvSource = updated[i].mvSource;
                    return db.updateSteelShot(s);
                });
            });
            chain.then(function () {
                close();
                if (onDone) onDone();
            }).catch(function (err) {
                alert('Pairing failed: ' + err.message);
            });
        });
    }

    return {
        open: open,
        pairChrono: pairChrono
    };
})();

// Launcher (registration seam)
if (typeof window !== 'undefined') {
    window.ToolActions = window.ToolActions || {};
    window.ToolActions.steelSession = function (db, rifleId) {
        if (rifleId) {
            SteelSession.open(db, rifleId);
        } else if (typeof Categories !== 'undefined') {
            Categories.show('steel');
        }
    };
}
