/**
 * rifle-simple.js — MY RIFLE, the simple lane's one scrolling page
 * (Contract v2.5 §2.4). Frequency-ordered, Roy's words:
 *
 *   status card → Drop chart (gold) → My numbers (bullet speed with
 *   its source · your rifle's numbers · the "For your rangefinder"
 *   line) → History → Barrel → Report & Certificate → Export.
 *
 * The detailed lane keeps today's fuller rifle page (Rifles tab);
 * this page is where the simple Home's "My rifle" row lands.
 */

var SimpleRiflePage = (function () {
    'use strict';

    function show(db, rifleId) {
        var container = document.getElementById('view-home');
        if (!container) return;
        if (window.AppNav) AppNav.go('home');

        Promise.all([
            db.getRifle(rifleId).catch(function () { return null; }),
            db.getLoadsByRifle(rifleId).catch(function () { return []; }),
            db.getBarrelsByRifle(rifleId).catch(function () { return []; }),
            db.getMvMeasurementsByRifle(rifleId).catch(function () { return []; }),
            db.getTrackingVerificationsByRifle(rifleId).catch(function () { return []; })
        ]).then(function (res) {
            var rifle = res[0];
            if (!rifle) { if (window.AppNav) AppNav.go('home'); return; }
            _render(db, rifle, res[1] || [], res[2] || [], res[3] || [], res[4] || []);
        });
    }

    function _render(db, rifle, loads, barrels, mvMeasurements, trackingVerifications) {
        var container = document.getElementById('view-home');
        container.setAttribute('data-screen', 'rifle-simple');

        var load = null;
        loads.forEach(function (l) { if (!load && (l.truedMv || l.truedBc)) load = l; });
        if (!load) loads.forEach(function (l) { if (!load && l.bulletBC) load = l; });
        if (!load && loads.length) load = loads[0];

        var barrel = null;
        barrels.forEach(function (b) { if (!barrel && b.isActive) barrel = b; });
        if (!barrel && barrels.length) barrel = barrels[0];

        var html = '<div class="screen">';
        html += '<div class="pagehead">' +
            '<button class="backline" id="rs-back">&lsaquo; Home</button>' +
            '<div class="pagetitle">' + UI.esc(rifle.name || 'My rifle') + '</div>' +
            (rifle.caliber ? '<div class="pagesub mono">' + UI.esc(rifle.caliber) + '</div>' : '') +
            '</div>';

        // status (the same card the app trusts everywhere)
        html += '<div id="rs-status" class="edge-none"></div>';

        // Drop chart — the gold utility, right under the status
        html += '<div class="utility-row u-mt-10">' +
            UI.utilityBtn({ label: 'Drop chart', id: 'rs-dope' }) +
            UI.utilityBtn({ label: 'Add bullet speed', id: 'rs-mv' }) +
            '</div>';

        // My numbers
        html += UI.sectionHead('Your rifle\'s numbers');
        html += '<div id="rs-numbers">' + _numbersHtml(rifle, load, mvMeasurements, trackingVerifications) + '</div>';

        // History
        html += UI.sectionHead('History');
        html += UI.card(UI.rowlink({
            button: true, id: 'rs-history',
            title: 'Everything this rifle has done',
            sub: 'Sessions · Steel · Truing · Maintenance',
            chev: true
        }));

        // Barrel
        if (barrel) {
            html += UI.sectionHead('Barrel');
            html += '<div class="card" id="rs-barrel"><div class="rowlink"><div class="txt">' +
                '<span class="t-micro">Counting rounds&hellip;</span></div></div></div>';
        }

        // Records & proof
        html += UI.sectionHead('Records');
        var recRows = UI.rowlink({
            button: true, id: 'rs-report',
            title: 'Report & Certificate',
            sub: 'For your records, or proof to share',
            chev: true
        });
        recRows += UI.rowlink({
            button: true, id: 'rs-edit',
            title: 'Rifle details & loads',
            sub: 'Scope, zero range, ammo — the full page',
            chev: true
        });
        html += UI.card(recRows);
        html += '<div class="utility-row u-mt-10">' + UI.utilityBtn({ label: 'Export data', id: 'rs-export' }) + '</div>';
        html += '<div style="height:16px"></div></div>';
        container.innerHTML = html;

        // status card
        if (typeof CalibrationStatusCard !== 'undefined' && CalibrationStatusCard) {
            var scEl = document.getElementById('rs-status');
            if (scEl) CalibrationStatusCard.render(scEl, db, rifle);
        }

        // barrel numbers
        if (barrel) {
            db.getCleaningLogsByBarrel(barrel.id).catch(function () { return []; }).then(function (logs) {
                var el = document.getElementById('rs-barrel');
                if (!el || !el.isConnected) return;
                var total = barrel.totalRounds || 0;
                var latest = null;
                (logs || []).forEach(function (l) {
                    if (!latest || (l.date || '') > (latest.date || '')) latest = l;
                });
                var since = latest ? Math.max(0, total - (latest.roundCountAtCleaning || 0)) : total;
                el.innerHTML = UI.statStrip([
                    { value: Number(total).toLocaleString(), label: 'Rounds' },
                    { value: Number(since).toLocaleString(), label: 'Since cleaning' }
                ]);
            });
        }

        // wires
        document.getElementById('rs-back').addEventListener('click', function () {
            if (window.AppNav) AppNav.go('home');
        });
        document.getElementById('rs-dope').addEventListener('click', function () {
            if (window.ToolActions && ToolActions.dopeCards) ToolActions.dopeCards(db);
        });
        document.getElementById('rs-mv').addEventListener('click', function () {
            if (typeof MvEntry !== 'undefined') {
                MvEntry.open(db, rifle, { onDone: function (saved) { if (saved) show(db, rifle.id); } });
            }
        });
        document.getElementById('rs-history').addEventListener('click', function () {
            if (typeof Categories !== 'undefined' && Categories.showHistory) {
                Categories.showHistory(rifle.id);
            }
        });
        document.getElementById('rs-report').addEventListener('click', function () {
            if (typeof Categories !== 'undefined' && Categories.openReportCertificateFor) {
                Categories.openReportCertificateFor(rifle.id);
            }
        });
        document.getElementById('rs-edit').addEventListener('click', function () {
            if (window.AppNav) AppNav.openRifle(rifle.id);
        });
        document.getElementById('rs-export').addEventListener('click', function () {
            if (typeof DataExport !== 'undefined') DataExport.open(db);
        });
    }

    /** Bullet speed with its source · trued values · the rangefinder line. */
    function _numbersHtml(rifle, load, mvMeasurements, trackingVerifications) {
        if (!load || !load.bulletBC) {
            return '<div class="card"><div class="empty-teach">' +
                '<p>No bullet on file yet — add the bullet and box speed and your drop chart lights up.</p>' +
                '</div></div>';
        }
        var bc = load.truedBc || load.bulletBC;
        var mv = load.truedMv || load.muzzleVelocity || 0;
        var drag = load.dragModel || 'G7';

        // speed source (honest provenance, latest measurement wins)
        var latest = null;
        (mvMeasurements || []).forEach(function (m) {
            if (!latest || String(m.date) > String(latest.date)) latest = m;
        });
        var speedLine;
        if (load.truedMv) speedLine = Math.round(load.truedMv) + ' fps — trued from your hits';
        else if (latest) speedLine = Math.round(latest.value) + ' fps — measured' +
            (latest.source === 'manual' ? ', typed in' : '') +
            (latest.shotCount ? ' over ' + latest.shotCount + ' shots' : '');
        else if (load.muzzleVelocity) speedLine = Math.round(load.muzzleVelocity) + ' fps — the box number';
        else speedLine = 'No speed yet';

        // the rangefinder line (device-export math when tracking verified)
        var tv = null;
        (trackingVerifications || []).forEach(function (t) {
            if (!tv || String(t.date) > String(tv.date)) tv = t;
        });
        var factor = (tv && tv.factor) ||
            (typeof rifle.scopeCorrectionFactor === 'number' ? rifle.scopeCorrectionFactor : null);
        var rangefinder;
        if (factor && Math.abs(factor - 1) >= 0.0005 && typeof deviceCompensation === 'function' && mv) {
            var dc = null;
            try {
                dc = deviceCompensation({
                    muzzleVelocity: mv, bc: bc, dragModel: drag,
                    bulletWeight: load.bulletWeight || 140,
                    zeroRange: rifle.zeroRange || 100,
                    scopeHeight: rifle.scopeHeight || 1.5
                }, { tempF: 59, pressureInHg: 29.92, humidity: 50 }, factor);
            } catch (e) { /* fall through */ }
            rangefinder = dc && !dc.identity
                ? 'For your rangefinder: BC ' + dc.bcOut.toFixed(3) + ' · speed ' + dc.mvOut +
                  ' fps — checked against your scope\'s clicks'
                : 'For your rangefinder: BC ' + bc.toFixed(3) + ' · speed ' + Math.round(mv) + ' fps — enter as-is';
        } else {
            rangefinder = 'For your rangefinder: BC ' + bc.toFixed(3) + ' · speed ' + Math.round(mv) +
                ' fps — enter as-is';
        }

        var rows = UI.rowlink({
            title: 'Bullet',
            subHtml: '<span class="mono">' + UI.esc((load.bulletName || load.name || '') +
                (load.bulletWeight ? ' · ' + load.bulletWeight + ' gr' : '') +
                ' · BC ' + bc.toFixed(3) + ' ' + drag +
                (load.truedBc ? ' (trued)' : '')) + '</span>'
        });
        rows += UI.rowlink({
            title: 'Bullet speed',
            subHtml: '<span class="mono">' + UI.esc(speedLine) + '</span>'
        });
        rows += UI.rowlink({
            title: 'Rangefinder setup',
            subHtml: '<span class="mono">' + UI.esc(rangefinder) + '</span>'
        });
        return UI.card(rows);
    }

    return { show: show };
})();
