/**
 * truing.js — the Truing job UI (§2.5). DOM layer over the pure
 * engine in js/truing-core.js.
 *
 * Mode picker (Quick / Full, per the proven-truing mockup) →
 * environment capture (manual always; one-tap lookup, source-stamped)
 * → data (Quick: "I dialed X, it took Y" · Full: tied-in steel
 * strings with the data checklist + coach-voice interventions, never
 * blocking) → the MV↔BC fork with BOTH corrections auto-calculated
 * and doctrine guidance → result with the 5-segment confidence meter
 * and the tappable "Why?" normalization ledger → Apply writes an
 * APPEND-ONLY truing event and updates the load's derived trued
 * values. Nothing is ever overwritten.
 */

var TruingJob = (function () {
    'use strict';

    var _db = null;
    var _container = null;
    var _S = null;

    function _write(fn, data) {
        return (typeof SyncQueue !== 'undefined' && SyncQueue)
            ? SyncQueue.write(fn, data)
            : _db[fn](data);
    }

    function _toMOA(value, units, rangeYds) {
        if (units === 'MIL') return value * TRUING.MIL_TO_MOA;
        if (units === 'IN') return inchesToMOA(value, rangeYds);
        return value;
    }
    function _fromMOA(valueMOA, units, rangeYds) {
        if (units === 'MIL') return valueMOA / TRUING.MIL_TO_MOA;
        if (units === 'IN') return moaToInches(valueMOA, rangeYds);
        return valueMOA;
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
            db.getMvMeasurementsByRifle(rifleId).catch(function () { return []; }),
            db.getTrackingVerificationsByRifle(rifleId).catch(function () { return []; }),
            db.getZeroEventsByRifle(rifleId).catch(function () { return []; }),
            db.getSteelStringsByRifle ? db.getSteelStringsByRifle(rifleId).catch(function () { return []; }) : Promise.resolve([])
        ]).then(function (res) {
            var rifle = res[0];
            if (!rifle) { if (window.Categories) Categories.show('truing'); return; }
            var loads = res[1] || [];
            var load = null;
            loads.forEach(function (l) { if (!load && (l.truedMv || l.truedBc)) load = l; });
            if (!load) loads.forEach(function (l) { if (!load && l.bulletBC && l.muzzleVelocity) load = l; });
            if (!load && loads.length) load = loads[0];

            var mvMeas = res[2] || [];
            _S = {
                rifle: rifle,
                load: load,
                units: (rifle.angleUnit === 'MIL' || rifle.angleUnit === 'IN') ? rifle.angleUnit : 'MOA',
                mvMeasured: mvMeas.length ? mvMeas[0] : null,
                tracking: (res[3] && res[3][0]) || null,
                zeroEvents: res[4] || [],
                steelStrings: (res[5] || []).filter(function (s) { return s.tier === 'full'; }),
                env: { tempF: null, pressureInHg: null, humidity: null, source: 'default' },
                latitude: null,
                mode: null
            };
            if (!load || !load.bulletBC || !(load.muzzleVelocity || load.truedMv)) {
                renderNoLoad();
                return;
            }
            // v2.5 §3.1: a string handed over from Steel Session lands
            // DIRECTLY on Full true with that string preselected — the
            // mode picker was a dead-end stop nobody asked for.
            // (renderFull consumes + clears the sessionStorage handoff.)
            var handoff = null;
            try { handoff = sessionStorage.getItem('yort_truing_string'); } catch (e) { /* */ }
            if (handoff && _S.steelStrings.some(function (st) { return st.id === handoff; })) {
                renderFull();
                return;
            }
            renderModePicker();
        });
    }

    function _profile() {
        var S = _S;
        var mv = S.load.truedMv || (S.mvMeasured ? S.mvMeasured.value : null) || S.load.muzzleVelocity;
        return {
            muzzleVelocity: mv,
            bc: S.load.truedBc || S.load.bulletBC,
            dragModel: S.load.dragModel || 'G7',
            bulletWeight: S.load.bulletWeight || 140,
            zeroRange: S.rifle.zeroRange || 100,
            scopeHeight: S.rifle.scopeHeight || 1.5
        };
    }

    function renderNoLoad() {
        _container.setAttribute('data-screen', 'truing');
        _container.innerHTML = '<div class="screen">' +
            '<div class="pagehead"><button class="backline" id="tr-back">&lsaquo; Truing</button>' +
            '<div class="pagetitle">' + UI.esc(_S.rifle.name || 'Truing') + '</div></div>' +
            '<div class="empty-teach"><p>Truing needs a load with a BC and a velocity — add those to a load first.</p>' +
            '<button class="btn-primary" id="tr-add-load">Open the rifle</button></div></div>';
        document.getElementById('tr-back').addEventListener('click', function () {
            if (window.Categories) Categories.show('truing', _S.rifle.id);
        });
        document.getElementById('tr-add-load').addEventListener('click', function () {
            if (window.AppNav) AppNav.openRifle(_S.rifle.id);
        });
    }

    /* ── prerequisites (surfaced, never a gate — §2.5b) ───── */

    function _prereqRows() {
        var S = _S;
        var rows = '';
        var t = S.tracking || (typeof S.rifle.scopeCorrectionFactor === 'number'
            ? { factor: S.rifle.scopeCorrectionFactor, date: S.rifle.scopeTrackingTestedAt } : null);
        rows += _prereqRow('Scope tracking', t
            ? 'Verified' + (t.date ? ' ' + new Date(t.date).toLocaleDateString() : '')
            : 'Never verified — a 4% turret error will pollute this truing. 10 minutes at 100 fixes it.', !!t);
        var z = S.zeroEvents[0];
        rows += _prereqRow('Zero', z
            ? 'Confirmed' + (z.shotCount ? ' · ' + z.shotCount + ' shots' : '') +
              (z.date ? ' · ' + new Date(z.date).toLocaleDateString() : '')
            : 'Not confirmed — truing stands on the zero', !!z);
        rows += _prereqRow('Muzzle velocity', S.mvMeasured
            ? 'Measured ' + Math.round(S.mvMeasured.value) + ' fps' +
              (typeof S.mvMeasured.sd === 'number' ? ' · SD ' + S.mvMeasured.sd.toFixed(1) : '')
            : (S.load.muzzleVelocity ? 'Estimated ' + Math.round(S.load.muzzleVelocity) + ' fps — box number' : 'None'),
            !!S.mvMeasured);
        return UI.card(rows);
    }

    function _prereqRow(title, line, good) {
        return '<div class="rowlink"><div class="txt"><b>' + title + '</b>' +
            '<span class="t-micro">' + UI.esc(line) + '</span></div>' +
            '<span class="chip ' + (good ? 'chip-ready' : 'chip-caution') + '">&#9679;</span></div>';
    }

    /* ── mode picker ──────────────────────────────────────── */

    function renderModePicker() {
        var S = _S;
        _container.setAttribute('data-screen', 'truing');
        var rx = prescribeTruingDistances(_profile(), S.env);
        S.machDist = rx.machDist;
        S.prescription = rx;

        var html = '<div class="screen">';
        html += '<div class="pagehead"><button class="backline" id="tr-back">&lsaquo; Truing</button>' +
            '<div class="pagetitle">' + UI.esc(S.rifle.name || '') + '</div>' +
            '<div class="pagesub mono">' + UI.esc(S.load.name || '') + ' &middot; ' + UI.esc(S.units) + '</div></div>';

        html += UI.sectionHead('This rifle\'s bands');
        html += '<div class="card card-pad edge-none"><p class="t-micro" style="line-height:1.5">' +
            (rx.machDist.supersonicYd
                ? 'Supersonic to about <b class="mono">' + rx.machDist.supersonicYd + ' yd</b> in this air. ' +
                  'MV trues best near <b class="mono">' + (rx.mvTrueYd || '—') + ' yd</b>; drag trues in the ' +
                  '<b class="mono">' + (rx.dragBracket ? rx.dragBracket[0] + '–' + rx.dragBracket[1] + ' yd' : '—') + '</b> band.'
                : 'This load stays supersonic past 3000 yd — drag truing is out of reach at your ranges; MV is the working lever.') +
            '</p></div>';

        // v2.5 §3.1: prerequisites are ONE status block, never a gate —
        // followed by ONE clear primary that always goes somewhere.
        html += UI.sectionHead('Prerequisites');
        html += _prereqRows();

        var prereqsGood = !!(S.tracking || typeof S.rifle.scopeCorrectionFactor === 'number') &&
            S.zeroEvents.length > 0 && !!S.mvMeasured;
        var primaryLabel = prereqsGood ? 'Continue &rsaquo;' : 'True anyway &rsaquo;';
        html += '<button class="btn-primary btn-edge u-mt-14" id="tr-continue">' + primaryLabel + '</button>';
        html += '<p class="t-micro edge u-mt-10">' +
            (S.steelStrings.length
                ? S.steelStrings.length + ' logged string' + (S.steelStrings.length === 1 ? '' : 's') +
                  ' ready to tie in.'
                : 'No steel strings yet — you can still true from one observed hit.') + '</p>';

        // The two modes, demoted to quiet rows (Detailed users pick)
        html += UI.sectionHead('Or pick a mode');
        var modeRows = UI.rowlink({
            button: true, id: 'tr-quick',
            title: 'Quick true',
            sub: '"I dialed 15.0, it took 15.75." Assumes no wind and your saved velocity — rough.',
            chev: true
        });
        modeRows += UI.rowlink({
            button: true, id: 'tr-full',
            title: 'Full true',
            sub: S.steelStrings.length
                ? 'Tie in your steel strings — velocity and wind removed from the math'
                : 'Needs a logged steel string — log one and this lights up',
            chev: !!S.steelStrings.length
        });
        html += UI.card(modeRows);

        html += UI.sectionHead('Today\'s air');
        html += '<div id="tr-env">' + _envHtml() + '</div>';
        html += '<div style="height:16px"></div></div>';
        _container.innerHTML = html;

        document.getElementById('tr-back').addEventListener('click', function () {
            if (window.Categories) Categories.show('truing', S.rifle.id);
        });
        // The primary: strings → Full true; none → Quick true. Always forward.
        document.getElementById('tr-continue').addEventListener('click', function () {
            if (S.steelStrings.length) renderFull();
            else renderQuick();
        });
        document.getElementById('tr-quick').addEventListener('click', function () { renderQuick(); });
        document.getElementById('tr-full').addEventListener('click', function () {
            if (S.steelStrings.length) { renderFull(); return; }
            // never a silent no-op (the old dead-end)
            if (window.ToolActions && ToolActions.steelSession) {
                ToolActions.steelSession(_db, S.rifle.id);
            }
        });
        _bindEnv();
    }

    /* ── environment capture (§2.5a) ──────────────────────── */

    function _envHtml() {
        var S = _S;
        var srcLabel = { manual: 'entered by you', lookup: 'nearest station', 'default': 'assumed standard' }[S.env.source];
        return '<div class="card card-pad">' +
            '<div style="display:flex;gap:8px">' +
            _envField('tr-temp', 'Temp °F', S.env.tempF) +
            _envField('tr-press', 'Pressure inHg', S.env.pressureInHg) +
            _envField('tr-hum', 'Humidity %', S.env.humidity) +
            '</div>' +
            '<div class="u-mt-10" style="display:flex;gap:8px;align-items:center">' +
            '<button class="btn" id="tr-env-lookup">Look up conditions</button>' +
            '<span class="t-micro" id="tr-env-src">' + UI.esc(srcLabel) + '</span>' +
            '</div></div>';
    }

    function _envField(id, label, value) {
        return '<div class="field" style="flex:1;margin:0"><label>' + label + '</label>' +
            '<input type="text" inputmode="decimal" id="' + id + '" value="' +
            (value === null || value === undefined ? '' : value) + '"></div>';
    }

    function _bindEnv() {
        var S = _S;
        ['tr-temp', 'tr-press', 'tr-hum'].forEach(function (id, i) {
            var el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('change', function () {
                var v = parseFloat(el.value);
                var field = ['tempF', 'pressureInHg', 'humidity'][i];
                S.env[field] = isFinite(v) ? v : null;
                S.env.source = 'manual';
                var src = document.getElementById('tr-env-src');
                if (src) src.textContent = 'entered by you';
            });
        });
        var lookup = document.getElementById('tr-env-lookup');
        if (lookup) lookup.addEventListener('click', function () {
            var src = document.getElementById('tr-env-src');
            if (src) src.textContent = 'looking up…';
            if (typeof NetService === 'undefined') return;
            NetService.getConditions().then(function (c) {
                if (!c) throw new Error('no conditions');
                S.env = { tempF: c.tempF, pressureInHg: c.pressureInHg, humidity: c.humidity, source: 'lookup' };
                var wrap = document.getElementById('tr-env');
                if (wrap) { wrap.innerHTML = _envHtml(); _bindEnv(); }
            }).catch(function () {
                if (src) src.textContent = 'lookup failed — enter it by hand (works offline)';
            });
            NetService.getPosition().then(function (pos) {
                if (pos && pos.coords) S.latitude = pos.coords.latitude;
            }).catch(function () { /* no Coriolis without it */ });
        });
    }

    function _envForSolve() {
        var S = _S;
        if (S.env.source === 'default') return { tempF: 59, pressureInHg: 29.92, humidity: 50, source: 'default' };
        return {
            tempF: S.env.tempF !== null ? S.env.tempF : 59,
            pressureInHg: S.env.pressureInHg !== null ? S.env.pressureInHg : 29.92,
            humidity: S.env.humidity !== null ? S.env.humidity : 50,
            source: S.env.source
        };
    }

    /* ── QUICK TRUE ───────────────────────────────────────── */

    function renderQuick() {
        var S = _S;
        S.mode = 'quick';
        _container.setAttribute('data-screen', 'truing-quick');
        var html = '<div class="screen">';
        html += '<div class="pagehead"><button class="backline" id="tr-back2">&lsaquo; Truing</button>' +
            '<div class="pagetitle">Quick true</div>' +
            '<div class="pagesub mono">' + UI.esc(S.rifle.name || '') + ' &middot; ' + UI.esc(S.units) + '</div></div>';

        html += UI.sectionHead('Far point');
        html += '<div class="card card-pad">' +
            '<div class="field"><label>Range (yd)</label>' +
            '<input type="text" inputmode="numeric" id="tq-range" value="' +
            (S.prescription && S.prescription.mvTrueYd ? S.prescription.mvTrueYd : 600) + '"></div>' +
            '<div style="display:flex;gap:8px">' +
            '<div class="field" style="flex:1"><label>You dialed (' + UI.esc(S.units) + ')</label>' +
            '<input type="text" inputmode="decimal" id="tq-dialed"></div>' +
            '<div class="field" style="flex:1"><label>It actually took</label>' +
            '<input type="text" inputmode="decimal" id="tq-actual"></div>' +
            '</div>' +
            '<p class="t-micro">&ldquo;It took&rdquo; = the correction that centered it. Hit high by 0.5? It took 0.5 less.</p>' +
            '</div>';

        html += UI.sectionHead('Close point');
        html += '<div class="card card-pad"><p class="t-micro">Assumes your ' +
            (S.rifle.zeroRange || 100) + '-yd zero is on. Confirm it if you haven\'t.</p></div>';

        html += '<button class="btn-primary btn-edge u-mt-14" id="tq-compute">Compute correction</button>';
        html += '<p class="t-micro edge u-mt-10">Quick true assumes no wind and your saved MV of ' +
            Math.round(_profile().muzzleVelocity) + ' — good for a rough correction, not for a dope you\'ll bet a hunt on.</p>';
        html += '</div>';
        _container.innerHTML = html;

        document.getElementById('tr-back2').addEventListener('click', renderModePicker);
        document.getElementById('tq-compute').addEventListener('click', function () {
            var range = parseFloat(document.getElementById('tq-range').value);
            var dialed = parseFloat(document.getElementById('tq-dialed').value);
            var actual = parseFloat(document.getElementById('tq-actual').value);
            if (!isFinite(range) || !isFinite(actual) || range < 100) {
                alert('Enter the range and what it actually took.');
                return;
            }
            if (!isFinite(dialed)) dialed = actual;
            var obs = [{
                rangeYds: range,
                observedComeUpMOA: _toMOA(actual, S.units, range),
                groupId: 'quick'
            }];
            _compute(obs, {
                shotCount: 1, groupCount: 1, mvMeasuredPct: 0, windLoggedPct: 0,
                checklist: null
            });
        });
    }

    /* ── FULL TRUE ────────────────────────────────────────── */

    function renderFull() {
        var S = _S;
        S.mode = 'full';
        _container.setAttribute('data-screen', 'truing-full');

        // preselect a string handed over from Steel Session
        var handoff = null;
        try { handoff = sessionStorage.getItem('yort_truing_string'); sessionStorage.removeItem('yort_truing_string'); } catch (e) { /* */ }
        S.pickedStrings = {};
        S.steelStrings.forEach(function (st) {
            S.pickedStrings[st.id] = handoff ? st.id === handoff : false;
        });
        if (!handoff && S.steelStrings.length) S.pickedStrings[S.steelStrings[0].id] = true;

        var html = '<div class="screen">';
        html += '<div class="pagehead"><button class="backline" id="tr-back3">&lsaquo; Truing</button>' +
            '<div class="pagetitle">Full true</div>' +
            '<div class="pagesub mono">' + UI.esc(S.rifle.name || '') + '</div></div>';

        html += UI.sectionHead('Tie in your strings');
        var rows = '';
        S.steelStrings.slice(0, 10).forEach(function (st) {
            var when = st.sessionDate ? new Date(st.sessionDate).toLocaleDateString() : '';
            rows += '<button class="option-row' + (S.pickedStrings[st.id] ? ' on' : '') +
                '" data-string="' + st.id + '"><span>' + st.distanceYd + ' yd' +
                (st.wind && st.wind.mph ? ' · ' + steelWindText(st.wind.clock, st.wind.mph) : '') +
                (st.wind && st.wind.flagged ? ' · GUSTY' : '') +
                '<span class="choice-desc">' + when +
                (st.directionOfFireDeg !== null && st.directionOfFireDeg !== undefined ? ' · facing logged' : '') +
                '</span></span></button>';
        });
        html += rows;

        html += UI.sectionHead('Your data');
        html += '<div id="tf-checklist"></div>';
        html += '<div id="tf-coach"></div>';
        html += '<button class="btn-primary btn-edge u-mt-14" id="tf-compute">Review correction</button>';
        html += '<div style="height:16px"></div></div>';
        _container.innerHTML = html;

        document.getElementById('tr-back3').addEventListener('click', renderModePicker);
        var opts = _container.querySelectorAll('[data-string]');
        for (var i = 0; i < opts.length; i++) {
            opts[i].addEventListener('click', function () {
                var id = this.getAttribute('data-string');
                S.pickedStrings[id] = !S.pickedStrings[id];
                this.classList.toggle('on', S.pickedStrings[id]);
                _refreshChecklist();
            });
        }
        document.getElementById('tf-compute').addEventListener('click', _computeFull);
        _refreshChecklist();
    }

    function _pickedStringList() {
        return _S.steelStrings.filter(function (st) { return _S.pickedStrings[st.id]; });
    }

    function _refreshChecklist() {
        var S = _S;
        var el = document.getElementById('tf-checklist');
        var coach = document.getElementById('tf-coach');
        if (!el) return;
        var picked = _pickedStringList();
        Promise.all(picked.map(function (st) {
            return _db.getSteelShotsByString(st.id).catch(function () { return []; });
        })).then(function (shotLists) {
            if (!el.isConnected) return;
            var shots = 0, withMv = 0, withWind = 0, needsDof = false, hasDof = true;
            picked.forEach(function (st, i) {
                shots += shotLists[i].length;
                shotLists[i].forEach(function (s) { if (typeof s.mvFps === 'number') withMv++; });
                if (st.wind && typeof st.wind.mph === 'number') withWind += shotLists[i].length;
                if (st.distanceYd >= 800) {
                    needsDof = true;
                    if (st.directionOfFireDeg === null || st.directionOfFireDeg === undefined) hasDof = false;
                }
            });
            S._shotLists = shotLists;
            S._checkStats = { shots: shots, withMv: withMv, withWind: withWind };

            var rows = '';
            rows += _checkRow('Shots tied in', picked.length + ' string' + (picked.length === 1 ? '' : 's') +
                ' · ' + picked.map(function (st) { return st.distanceYd; }).join('/') + ' yd', String(shots));
            rows += _checkRow('Per-shot velocity', 'paired to each shot', shots && withMv === shots ? '✓' : withMv + '/' + shots);
            rows += _checkRow('Wind calls', 'logged per string', shots && withWind === shots ? '✓' : (withWind ? withWind + '/' + shots : '✗'));
            rows += _checkRow('Today\'s environment', S.env.source === 'default' ? 'assumed — enter it on the previous screen' : S.env.source, S.env.source !== 'default' ? '✓' : '✗');
            if (needsDof) rows += _checkRow('Direction of fire', 'for your ≥800 yd strings', hasDof ? '✓' : '✗');
            el.innerHTML = UI.card(rows);

            // Data-quality coaching (§2.5) — coach voice, never blocking
            var notes = [];
            if (shots && shots < 8) {
                notes.push('<b>' + shots + ' shot' + (shots === 1 ? ' is' : 's are') + ' thin.</b> 5 is the floor, 8–10 is reliable. True anyway (rough), or keep shooting?');
            }
            if (shots && withMv === 0) {
                notes.push('<b>No velocities on these shots.</b> Truing will use your saved ' +
                    Math.round(_profile().muzzleVelocity) + ' — if conditions changed, that\'s a guess. Pair a chrono string, or true rough.');
            }
            if (shots && withWind === 0) {
                notes.push('<b>No wind logged at distance.</b> Wind may have moved these shots — the correction trues elevation only.');
            }
            coach.innerHTML = notes.map(function (n) {
                return '<div class="banner banner-caution banner-edge u-mt-10" style="display:block">' +
                    '<span class="t-label" style="line-height:1.5">' + n + '</span></div>';
            }).join('');
        });
    }

    function _checkRow(title, sub, value) {
        return '<div class="rowlink"><div class="txt"><b>' + title + '</b>' +
            '<span class="t-micro">' + UI.esc(sub) + '</span></div>' +
            '<span class="mono" style="font-size:20px;font-weight:700">' + UI.esc(value) + '</span></div>';
    }

    function _computeFull() {
        var S = _S;
        var picked = _pickedStringList();
        if (!picked.length || !S._shotLists) return;
        var obs = [];
        picked.forEach(function (st, i) {
            var azimuth = (typeof st.directionOfFireDeg === 'number') ? st.directionOfFireDeg : null;
            if (azimuth !== null) S._azimuth = azimuth; // last one wins; per-group would be v2
            S._shotLists[i].forEach(function (shot) {
                var units = shot.units || st.units || 'MOA';
                var observed = (st.dialedElev || 0) + (shot.heldElev || 0) - (shot.elevOff || 0);
                obs.push({
                    rangeYds: st.distanceYd,
                    observedComeUpMOA: _toMOA(observed, units, st.distanceYd),
                    shotMV: typeof shot.mvFps === 'number' ? shot.mvFps : undefined,
                    groupId: st.id,
                    flagged: !!(st.wind && st.wind.flagged)
                });
            });
        });
        if (!obs.length) { alert('The selected strings have no logged shots.'); return; }
        var stats = S._checkStats;
        _compute(obs, {
            shotCount: stats.shots,
            groupCount: picked.length,
            mvMeasuredPct: stats.shots ? stats.withMv / stats.shots : 0,
            windLoggedPct: stats.shots ? stats.withWind / stats.shots : 0
        });
    }

    /* ── compute + result (§2.5 fork · meter · why) ───────── */

    function _compute(obs, quality) {
        var S = _S;
        var env = _envForSolve();
        var ctx = {
            profile: _profile(),
            env: env,
            machDist: machDistances(_profile(), env),
            latitudeDeg: S.latitude,
            azimuthDeg: S._azimuth || null
        };
        var result = solveTruing(obs, ctx, { mvMeasured: !!S.mvMeasured });
        if (!result || !result.mvOption || !result.bcOption) {
            alert('Could not compute a correction from this data.');
            return;
        }
        S.result = result;
        S.quality = quality;
        S.pickedCorrection = result.recommended;
        renderResult();
    }

    function renderResult() {
        var S = _S;
        var r = S.result;
        var profile = _profile();

        // group spread for confidence
        var spread = 0;
        if (r.groups.length > 1) {
            var means = r.groups.map(function (g) { return g.meanNormalizedMOA; });
            spread = Math.max.apply(null, means) - Math.min.apply(null, means);
        }
        var conf = truingConfidence({
            shotCount: S.quality.shotCount,
            groupCount: S.quality.groupCount,
            mvMeasuredPct: S.quality.mvMeasuredPct,
            windLoggedPct: S.quality.windLoggedPct,
            groupSpreadMOA: spread,
            envSource: _envForSolve().source,
            zeroConfirmed: S.zeroEvents.length > 0,
            trackingVerified: !!(S.tracking || typeof S.rifle.scopeCorrectionFactor === 'number'),
            supersonicPct: r.supersonicPct,
            correctionType: S.pickedCorrection,
            mode: S.mode
        });
        S.confidence = conf;

        _container.setAttribute('data-screen', 'truing-result');
        var html = '<div class="screen">';
        html += '<div class="pagehead"><button class="backline" id="tr-back4">&lsaquo; Correction</button></div>';

        // The fork: BOTH corrections, radio options, doctrine note
        html += UI.sectionHead('How should we correct it?');
        html += _forkOption('bc', 'Adjust Ballistic Coefficient',
            profile.bc.toFixed(3) + ' → ' + r.bcOption.value.toFixed(3) + ' ' + (profile.dragModel || 'G7'));
        html += _forkOption('mv', 'Adjust Muzzle Velocity',
            Math.round(profile.muzzleVelocity) + ' → ' + r.mvOption.value + ' fps');
        html += '<p class="t-micro edge u-mt-10" style="line-height:1.5">' + UI.esc(r.guidance) + '</p>';

        // Result card (fills from the picked option)
        html += '<div id="tr-result-card"></div>';

        // Confidence meter
        var segColor = conf.segments >= 4 ? 'var(--status-ready)' : (conf.segments >= 3 ? 'var(--status-caution)' : 'var(--status-problem)');
        html += '<div class="card card-pad edge u-mt-10">' +
            '<div style="display:flex;justify-content:space-between;align-items:baseline">' +
            '<b>Truing confidence</b><span style="color:' + segColor + ';font-weight:600">' + conf.word + '</span></div>' +
            '<div style="display:flex;gap:2px;height:10px;margin-top:10px">' +
            [1, 2, 3, 4, 5].map(function (i) {
                return '<i style="flex:1;border-radius:2px;background:' +
                    (i <= conf.segments ? segColor : 'var(--dial-track)') + '"></i>';
            }).join('') + '</div>' +
            (conf.capNotes.length
                ? '<p class="t-micro u-mt-10" style="line-height:1.5">' + UI.esc(conf.capNotes[0]) + '</p>'
                : '<p class="t-micro u-mt-10">Based on ' + S.quality.shotCount + ' shots across ' +
                  S.quality.groupCount + ' group' + (S.quality.groupCount === 1 ? '' : 's') + '.</p>') +
            '</div>';

        // Tappable why — the normalization ledger, silent by default
        html += '<button class="u-full" id="tr-why" style="background:none;border:none;min-height:52px;padding:8px;color:var(--brand-gold-strong);font-weight:600">' +
            '&#9662; Why? (what we removed before truing)</button>';
        html += '<div id="tr-ledger" class="hidden"></div>';

        html += '<button class="btn-primary btn-edge u-mt-10" id="tr-apply">Apply to ' + UI.esc(S.rifle.name || 'rifle') + '</button>';
        html += '<button class="btn btn-edge u-mt-10" id="tr-cancel">Not now</button>';
        html += '<div style="height:16px"></div></div>';
        _container.innerHTML = html;

        _fillResultCard();
        document.getElementById('tr-back4').addEventListener('click', function () {
            S.mode === 'quick' ? renderQuick() : renderFull();
        });
        var forks = _container.querySelectorAll('[data-fork]');
        for (var i = 0; i < forks.length; i++) {
            forks[i].addEventListener('click', function () {
                S.pickedCorrection = this.getAttribute('data-fork');
                renderResult(); // re-render: confidence + card follow the pick
            });
        }
        document.getElementById('tr-why').addEventListener('click', function () {
            var led = document.getElementById('tr-ledger');
            if (led.classList.contains('hidden')) {
                led.innerHTML = _ledgerHtml();
                led.classList.remove('hidden');
            } else {
                led.classList.add('hidden');
            }
        });
        document.getElementById('tr-apply').addEventListener('click', _apply);
        document.getElementById('tr-cancel').addEventListener('click', function () {
            if (window.Categories) Categories.show('truing', S.rifle.id);
        });
    }

    function _forkOption(key, title, valueLine) {
        var on = _S.pickedCorrection === key;
        return '<button class="option-row' + (on ? ' on' : '') + ' edge" data-fork="' + key + '">' +
            '<span>' + title + '<span class="choice-desc mono">' + UI.esc(valueLine) + '</span></span>' +
            '</button>';
    }

    function _fillResultCard() {
        var S = _S;
        var r = S.result;
        var profile = _profile();
        var el = document.getElementById('tr-result-card');
        if (!el) return;
        var isBc = S.pickedCorrection === 'bc';
        var opt = isBc ? r.bcOption : r.mvOption;
        el.innerHTML = '<div class="card edge u-mt-10" style="border:2px solid var(--brand-gold);text-align:center">' +
            '<div class="card-pad">' +
            '<div class="t-micro">' + (isBc ? 'Corrected Ballistic Coefficient' : 'Corrected Muzzle Velocity') + '</div>' +
            '<div class="mono" style="font-size:30px;font-weight:700;color:var(--brand-gold-strong);margin:4px 0">' +
            (isBc ? opt.value.toFixed(3) + ' ' + (profile.dragModel || 'G7') : opt.value + ' fps') + '</div>' +
            '<div class="t-micro">was ' + (isBc ? profile.bc.toFixed(3) : Math.round(profile.muzzleVelocity)) +
            ' &middot; your solutions now match how you shot</div>' +
            '</div></div>';
    }

    function _ledgerHtml() {
        var S = _S;
        var rows = '';
        S.result.ledger.forEach(function (e) {
            var bits = ['raw ' + _fmtL(e.observedMOA)];
            if (e.mvAdjMOA) bits.push('velocity ' + _fmtL(e.mvAdjMOA));
            if (e.coriolisAdjMOA) bits.push('earth ' + _fmtL(e.coriolisAdjMOA));
            bits.push('= ' + _fmtL(e.normalizedMOA) + ' trued on');
            rows += '<div class="rowlink"><div class="txt"><span class="mono t-micro">' +
                e.rangeYds + ' yd &middot; ' + UI.esc(bits.join(' · ')) + '</span></div></div>';
        });
        rows += '<div class="rowlink"><div class="txt"><span class="t-micro">Wind deflection is horizontal — ' +
            'it never touches the vertical we true on. Aerodynamic jump: not modeled (honest gap).</span></div></div>';
        return UI.card(rows);
    }

    function _fmtL(v) { return (Math.round(v * 100) / 100) + ''; }

    /* ── apply: APPEND-ONLY event + derived values ────────── */

    function _apply() {
        var S = _S;
        var r = S.result;
        var profile = _profile();
        var isBc = S.pickedCorrection === 'bc';
        var opt = isBc ? r.bcOption : r.mvOption;
        var btn = document.getElementById('tr-apply');
        btn.disabled = true;
        btn.textContent = 'Applying…';

        var event = {
            rifleId: S.rifle.id,
            loadId: S.load.id,
            mode: S.mode,
            stage: isBc ? 'drag' : 'mv',
            close: { rangeYds: S.rifle.zeroRange || 100, assumed: S.mode === 'quick' },
            far: { rangeYds: r.farRangeYds, band: r.farBand, groups: r.groups },
            inputs: {
                env: _envForSolve(),
                latitude: S.latitude,
                azimuth: S._azimuth || null,
                quality: S.quality,
                machDist: r.machDist,
                mvOption: r.mvOption,
                bcOption: r.bcOption,
                guidance: r.guidance,
                confidence: S.confidence
            },
            ledger: r.ledger,
            supersonicPct: r.supersonicPct,
            correctionType: S.pickedCorrection,
            oldValue: isBc ? profile.bc : Math.round(profile.muzzleVelocity),
            newValue: opt.value,
            confidence: S.confidence.word,
            appliedAt: new Date().toISOString()
        };

        _write('addTruingEvent', event).then(function (saved) {
            // derived current values live on the load, pointing at the event
            if (isBc) S.load.truedBc = opt.value;
            else S.load.truedMv = opt.value;
            S.load.truedEventId = saved.id;
            S.load.truedAt = event.appliedAt;
            return _db.updateLoad(S.load).catch(function (e) {
                console.warn('[Truing] cached values update failed (event saved):', e);
            });
        }).then(function () {
            if (typeof Readiness !== 'undefined') Readiness.invalidate(S.rifle.id);
            _container.setAttribute('data-screen', 'truing-done');

            // v2.5 §3.1: surface the true numbers + the rangefinder line
            var corrected = {};
            for (var k in profile) { if (profile.hasOwnProperty(k)) corrected[k] = profile[k]; }
            if (isBc) corrected.bc = opt.value; else corrected.muzzleVelocity = opt.value;
            var numbersLine = 'BC ' + corrected.bc.toFixed(3) + ' ' + (profile.dragModel || 'G7') +
                ' · ' + Math.round(corrected.muzzleVelocity) + ' fps';
            var factor = (S.tracking && S.tracking.factor) ||
                (typeof S.rifle.scopeCorrectionFactor === 'number' ? S.rifle.scopeCorrectionFactor : null);
            var rangefinderLine;
            if (factor && Math.abs(factor - 1) >= 0.0005 && typeof deviceCompensation === 'function') {
                var dc = null;
                try { dc = deviceCompensation(corrected, _envForSolve(), factor); } catch (e) { /* fall through */ }
                rangefinderLine = dc && !dc.identity
                    ? 'For your rangefinder: BC ' + dc.bcOut.toFixed(3) + ' · speed ' + dc.mvOut +
                      ' fps — compensated for your scope\'s clicks'
                    : 'For your rangefinder: BC ' + corrected.bc.toFixed(3) + ' · speed ' +
                      Math.round(corrected.muzzleVelocity) + ' fps — enter as-is';
            } else {
                rangefinderLine = 'For your rangefinder: BC ' + corrected.bc.toFixed(3) + ' · speed ' +
                    Math.round(corrected.muzzleVelocity) + ' fps — enter as-is';
            }

            _container.innerHTML = '<div class="screen">' +
                '<div class="pagehead"><div class="pagetitle">Applied</div></div>' +
                UI.banner('ready', 'Every future solution for ' + UI.esc(S.load.name || 'this load') +
                    ' uses the trued ' + (isBc ? 'BC' : 'MV') + '. The old value is kept in the truing history — nothing is ever erased.', true) +
                '<div class="card edge u-mt-14" style="border:2px solid var(--brand-gold);text-align:center">' +
                '<div class="card-pad">' +
                '<div class="t-micro">Your rifle\'s numbers</div>' +
                '<div class="mono" style="font-size:24px;font-weight:700;color:var(--brand-gold-strong);margin:4px 0">' +
                UI.esc(numbersLine) + '</div>' +
                '<div class="t-micro">' + UI.esc(rangefinderLine) + '</div>' +
                '</div></div>' +
                '<button class="btn-primary btn-edge u-mt-14" id="tr-done">Done</button></div>';
            document.getElementById('tr-done').addEventListener('click', function () {
                if (window.Categories) Categories.show('truing', S.rifle.id);
            });
        }).catch(function (err) {
            btn.disabled = false;
            btn.textContent = 'Apply to ' + (S.rifle.name || 'rifle');
            alert('Apply failed: ' + err.message);
        });
    }

    return { open: open };
})();

// Launcher (registration seam)
if (typeof window !== 'undefined') {
    window.ToolActions = window.ToolActions || {};
    window.ToolActions.truing = function (db, rifleId) {
        if (rifleId) TruingJob.open(db, rifleId);
        else if (typeof Categories !== 'undefined') Categories.show('truing');
    };
}
