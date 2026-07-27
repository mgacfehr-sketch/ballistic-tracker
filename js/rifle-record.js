/**
 * rifle-record.js — A RECORD (Contract v3.0 Part 1, view 7 — tap a
 * feed item). "The owner's fat-finger bug gets fixed here": a
 * simple-lane steel shot's numbers are editable, and every record
 * type is deletable — honoring the append-only rule for truing_events
 * (STANDARDS §6.2): a correction's own history entry is never deleted,
 * only "undone" by writing a fresh current value back onto the load
 * if the string behind it goes away and that correction was still
 * the load's current one.
 *
 * Feed items (feed-core.js) carry only {id, type, date, title, sub,
 * pending} — no raw row — so each type here re-fetches its own record
 * by id, the same gather-by-rifle pattern rifle-app.js already uses.
 * A 'paper' record hands off entirely to the existing, mature session
 * detail screen (history.js) via AppNav.openSession rather than
 * duplicating its image/stats/delete UI.
 */

var RifleRecord = (function () {
    'use strict';

    function show(app, rifle, id, type) {
        if (type === 'paper') { _loadPaper(app, rifle, id); return; }

        var container = app.container;
        container.setAttribute('data-screen', 'v3-record');
        container.innerHTML = '<div class="screen">' +
            '<div class="pagehead"><button class="backline" id="rr-back">&lsaquo; ' +
            UI.esc(rifle.name || 'Home') + '</button></div>' +
            '<h2 id="rr-title" style="padding:0 var(--edge);font:var(--type-title)">Loading&hellip;</h2>' +
            '<div id="rr-sub" style="padding:0 var(--edge);color:var(--text-secondary);margin-bottom:14px"></div>' +
            '<div id="rr-body"></div>' +
            '<div id="rr-actions" class="v3-linkrow" style="margin-top:16px"></div>' +
            '<div style="height:24px"></div></div>';
        document.getElementById('rr-back').addEventListener('click', function () { app.show(rifle.id); });

        if (type === 'steel') _loadSteel(app, rifle, id);
        else if (type === 'zero') _loadZero(app, rifle, id);
        else if (type === 'speed') _loadSpeed(app, rifle, id);
        else if (type === 'cleaning') _loadCleaning(app, rifle, id);
        else if (type === 'correction') _loadCorrection(app, rifle, id);
        else _renderGone();
    }

    function _fmtDate(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        var today = new Date();
        var sameDay = d.getFullYear() === today.getFullYear() &&
            d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
        var time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        return (sameDay ? 'Today' : d.toLocaleDateString()) + ', ' + time;
    }

    function _fill(title, sub, rowsHtml, actionsHtml) {
        var t = document.getElementById('rr-title'); if (t) t.textContent = title;
        var s = document.getElementById('rr-sub'); if (s) s.textContent = sub || '';
        var b = document.getElementById('rr-body'); if (b) b.innerHTML = rowsHtml || '';
        var a = document.getElementById('rr-actions'); if (a) a.innerHTML = actionsHtml || '';
    }

    function _kv(k, v, color) {
        return '<div class="v3-kv"><span class="k">' + UI.esc(k) + '</span><span class="v"' +
            (color ? ' style="color:' + color + '"' : '') + '>' + v + '</span></div>';
    }

    function _renderGone() {
        _fill('Not found', 'This record may have already been deleted.', '', '');
    }

    /* ══ steel ══════════════════════════════════════════════════ */

    function _loadSteel(app, rifle, id) {
        var db = app.db;
        Promise.all([
            db.getSteelStringsByRifle(rifle.id).catch(function () { return []; }),
            db.getSteelShotsByString(id).catch(function () { return []; }),
            db.getTruingEventsByRifle(rifle.id).catch(function () { return []; }),
            db.getLoadsByRifle(rifle.id).catch(function () { return []; })
        ]).then(function (res) {
            var st = null;
            (res[0] || []).forEach(function (s) { if (s.id === id) st = s; });
            if (!st) { _renderGone(); return; }
            var shots = res[1] || [];
            var te = (typeof findTruingForString === 'function') ? findTruingForString(st, res[2] || []) : null;
            var load = null;
            if (te) (res[3] || []).forEach(function (l) { if (l.id === te.loadId) load = l; });
            _renderSteel(app, rifle, st, shots, te, load);
        });
    }

    function _renderSteel(app, rifle, st, shots, te, load) {
        var units = st.units || 'MOA';
        var rows = _kv('Distance', st.distanceYd + ' yd');
        if (typeof st.dialedElev === 'number') rows += _kv('Dialed', st.dialedElev.toFixed(1) + ' ' + units + ' up');

        var oneShot = shots.length === 1 ? shots[0] : null;
        if (oneShot) {
            var missWord = oneShot.elevOff > 0 ? 'high' : (oneShot.elevOff < 0 ? 'low' : 'on');
            rows += _kv('It hit', Math.abs(oneShot.elevOff).toFixed(2) + ' ' + units + ' ' + missWord);
            if (oneShot.windOff) {
                var windWord = oneShot.windOff > 0 ? 'right' : 'left';
                rows += _kv('Windage', Math.abs(oneShot.windOff).toFixed(2) + ' ' + units + ' ' + windWord);
            }
            if (oneShot.mvFps) rows += _kv('Bullet speed', Math.round(oneShot.mvFps) + ' fps');
        } else if (shots.length > 1) {
            rows += _kv('Shots', shots.length + ' — see the full log for detail');
        }

        var stillCurrent = false;
        if (te) {
            var isBc = te.correctionType === 'bc';
            var was = isBc ? Number(te.oldValue).toFixed(3) : Math.round(te.oldValue) + ' fps';
            var now = isBc ? Number(te.newValue).toFixed(3) : Math.round(te.newValue) + ' fps';
            stillCurrent = !!load && (isBc ? load.truedBc === te.newValue : Math.round(load.truedMv || 0) === Math.round(te.newValue));
            rows += _kv('Correction', was + ' &rarr; ' + now + (stillCurrent ? ' (kept)' : ''),
                stillCurrent ? 'var(--status-ready)' : null);
        }

        var actions = '';
        if (oneShot) actions += '<button class="v3-link" id="rr-edit">Edit</button> &middot; ';
        actions += '<button class="v3-link danger" id="rr-delete">Delete</button>';

        _fill('Steel at ' + st.distanceYd, _fmtDate(st.sessionDate), rows, actions);

        var editBtn = document.getElementById('rr-edit');
        if (editBtn) editBtn.addEventListener('click', function () { _editSteelShot(app, rifle, st, oneShot, te, load); });
        document.getElementById('rr-delete').addEventListener('click', function () {
            if (!confirm('Delete this steel record? This can’t be undone.')) return;
            app.db.deleteSteelString(st.id).then(function () {
                if (te && stillCurrent &&
                    confirm('This was behind ' + (rifle.name || 'the rifle') + '’s current correction. Also undo it back to the earlier value?')) {
                    if (te.correctionType === 'bc') load.truedBc = te.oldValue; else load.truedMv = te.oldValue;
                    return app.db.updateLoad(load);
                }
            }).then(function () { app.show(rifle.id); })
                .catch(function (err) { alert('Delete failed: ' + friendlyError(err)); });
        });
    }

    function _editSteelShot(app, rifle, st, shot, te, load) {
        var units = st.units || 'MOA';
        var rows = '<div class="edge" style="padding:0 var(--edge)">' +
            '<div class="field"><label for="rr-elev">Elevation miss (' + units + ', + high / &minus; low)</label>' +
            '<input type="number" step="0.01" inputmode="decimal" id="rr-elev" value="' + shot.elevOff + '"></div>' +
            '<div class="field"><label for="rr-wind">Windage miss (' + units + ', + right / &minus; left)</label>' +
            '<input type="number" step="0.01" inputmode="decimal" id="rr-wind" value="' + (shot.windOff || 0) + '"></div>' +
            '<div class="field"><label for="rr-mv">Bullet speed (fps, optional)</label>' +
            '<input type="number" inputmode="numeric" id="rr-mv" value="' + (shot.mvFps || '') + '"></div>' +
            '</div>';
        var actions = '<button class="v3-link" id="rr-save">Save</button> &middot; <button class="v3-link" id="rr-cancel">Cancel</button>';
        _fill('Edit — Steel at ' + st.distanceYd, 'Fixes the number only — it won’t re-run the correction.', rows, actions);

        document.getElementById('rr-cancel').addEventListener('click', function () { _renderSteel(app, rifle, st, [shot], te, load); });
        document.getElementById('rr-save').addEventListener('click', function () {
            var btn = this;
            btn.disabled = true;
            var elev = parseFloat(document.getElementById('rr-elev').value);
            var wind = parseFloat(document.getElementById('rr-wind').value);
            var mv = parseFloat(document.getElementById('rr-mv').value);
            var patch = {
                id: shot.id, stringId: shot.stringId, seq: shot.seq,
                elevOff: isFinite(elev) ? elev : shot.elevOff,
                windOff: isFinite(wind) ? wind : (shot.windOff || 0),
                units: shot.units, heldElev: shot.heldElev, heldWind: shot.heldWind,
                mvFps: isFinite(mv) && mv > 0 ? mv : null,
                mvSource: isFinite(mv) && mv > 0 ? (shot.mvSource || 'manual') : null
            };
            app.db.updateSteelShot(patch).then(function () { app.show(rifle.id); })
                .catch(function (err) { btn.disabled = false; alert('Save failed: ' + friendlyError(err)); });
        });
    }

    /* ══ zero ═══════════════════════════════════════════════════ */

    function _loadZero(app, rifle, id) {
        app.db.getZeroEventsByRifle(rifle.id).catch(function () { return []; }).then(function (list) {
            var z = null;
            (list || []).forEach(function (e) { if (e.id === id) z = e; });
            if (!z) { _renderGone(); return; }
            var gd = z.groupData || {};
            var rows = _kv('Distance', (z.distanceYards || 0) + ' yd') + _kv('Shots', z.shotCount || 0);
            if (typeof gd.atzElevationMOA === 'number') {
                rows += _kv('Elevation offset', Math.abs(gd.atzElevationMOA).toFixed(2) + ' MOA ' + (gd.atzElevationMOA >= 0 ? 'high' : 'low'));
            }
            if (typeof gd.atzWindageMOA === 'number') {
                rows += _kv('Windage offset', Math.abs(gd.atzWindageMOA).toFixed(2) + ' MOA ' + (gd.atzWindageMOA >= 0 ? 'right' : 'left'));
            }
            _fill('Zero confirmed', _fmtDate(z.date), rows, '<button class="v3-link danger" id="rr-delete">Delete</button>');
            document.getElementById('rr-delete').addEventListener('click', function () {
                if (!confirm('Delete this zero confirmation? The paper session itself stays in the rifle’s paperwork.')) return;
                app.db.deleteZeroEvent(z.id).then(function () { app.show(rifle.id); })
                    .catch(function (err) { alert('Delete failed: ' + friendlyError(err)); });
            });
        });
    }

    /* ══ speed ══════════════════════════════════════════════════ */

    function _loadSpeed(app, rifle, id) {
        app.db.getMvMeasurementsByRifle(rifle.id).catch(function () { return []; }).then(function (list) {
            var m = null;
            (list || []).forEach(function (x) { if (x.id === id) m = x; });
            if (!m) { _renderGone(); return; }
            var rows = _kv('Speed', Math.round(m.value) + ' fps');
            if (typeof m.sd === 'number') rows += _kv('Variation', '&plusmn;' + Math.round(m.sd) + ' fps');
            if (m.shotCount) rows += _kv('Shots', m.shotCount);
            rows += _kv('Source', UI.esc(m.source === 'manual' ? 'Typed in' : (m.source || 'measured')));
            _fill(m.source === 'manual' ? 'Bullet speed typed in' : 'Bullet speed measured', _fmtDate(m.date), rows,
                '<button class="v3-link danger" id="rr-delete">Delete</button>');
            document.getElementById('rr-delete').addEventListener('click', function () {
                if (!confirm('Delete this speed measurement?')) return;
                app.db.deleteMvMeasurement(m.id).then(function () { app.show(rifle.id); })
                    .catch(function (err) { alert('Delete failed: ' + friendlyError(err)); });
            });
        });
    }

    /* ══ cleaning ═══════════════════════════════════════════════ */

    function _loadCleaning(app, rifle, id) {
        app.db.getBarrelsByRifle(rifle.id).catch(function () { return []; }).then(function (barrels) {
            return Promise.all((barrels || []).map(function (b) {
                return app.db.getCleaningLogsByBarrel(b.id).catch(function () { return []; });
            }));
        }).then(function (lists) {
            var c = null;
            (lists || []).forEach(function (logs) { (logs || []).forEach(function (l) { if (l.id === id) c = l; }); });
            if (!c) { _renderGone(); return; }
            var rows = '';
            if (typeof c.roundCountAtCleaning === 'number') rows += _kv('Rounds at cleaning', Number(c.roundCountAtCleaning).toLocaleString());
            if (c.notes) rows += _kv('Notes', UI.esc(c.notes));
            _fill('Barrel cleaned', _fmtDate(c.date), rows, '<button class="v3-link danger" id="rr-delete">Delete</button>');
            document.getElementById('rr-delete').addEventListener('click', function () {
                if (!confirm('Delete this cleaning log entry?')) return;
                app.db.deleteCleaningLog(c.id).then(function () { app.show(rifle.id); })
                    .catch(function (err) { alert('Delete failed: ' + friendlyError(err)); });
            });
        });
    }

    /* ══ correction (uncorrelated truing event, detailed lane) ═══ */
    /* Append-only doctrine: no Delete here — a permanent history row. */

    function _loadCorrection(app, rifle, id) {
        app.db.getTruingEventsByRifle(rifle.id).catch(function () { return []; }).then(function (list) {
            var te = null;
            (list || []).forEach(function (e) { if (e.id === id) te = e; });
            if (!te) { _renderGone(); return; }
            var isBc = te.correctionType === 'bc';
            var rows = _kv('Range', (te.far && te.far.rangeYds ? te.far.rangeYds : '—') + ' yd');
            rows += _kv(isBc ? 'BC' : 'Speed',
                (isBc ? Number(te.oldValue).toFixed(3) : Math.round(te.oldValue) + ' fps') + ' &rarr; ' +
                (isBc ? Number(te.newValue).toFixed(3) : Math.round(te.newValue) + ' fps'));
            rows += _kv('Confidence', UI.esc(te.confidence || '—'));
            rows += '<p style="padding:12px var(--edge) 0;color:var(--text-secondary);font-size:13px">' +
                'This is a permanent history entry — it stays even if a later correction replaces it.</p>';
            _fill('Rifle trued', _fmtDate(te.appliedAt), rows, '');
        });
    }

    /* ══ paper — hand off to the existing session detail screen ══ */

    function _loadPaper(app, rifle, id) {
        if (window.AppNav && AppNav.openSession) AppNav.openSession(id, rifle.id);
        else app.show(rifle.id);
    }

    return { show: show };
})();

// Launcher (registration seam)
if (typeof window !== 'undefined') {
    window.RifleRecord = RifleRecord;
}
