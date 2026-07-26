/**
 * rifle-chart.js — FULL CHART (Contract v3.0 Part 1, view 6 — tap the
 * embedded chart). The complete drop table in the rifle's units, today's
 * conditions, and the "FOR YOUR RANGEFINDER" block — the same
 * `deviceCompensation` math `rifle-simple.js` (v2.5) used for its
 * rangefinder line, just re-homed. Print/Share reuse the existing DOPE
 * card wizard rather than a new generator.
 */

var RifleChart = (function () {
    'use strict';

    var ROWS_YD = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

    function show(app, rifle) {
        var container = app.container;
        container.setAttribute('data-screen', 'v3-chart');
        container.innerHTML = '<div class="screen">' +
            '<div class="pagehead"><button class="backline" id="rc2-back">&lsaquo; ' +
            UI.esc(rifle.name || 'Home') + '</button><div class="pagetitle">Drop chart</div></div>' +
            '<div id="rc2-sub" style="padding:0 var(--edge);color:var(--text-secondary);font-size:13.5px;margin:2px 0 12px">Loading&hellip;</div>' +
            '<div class="v3-chart" style="margin-top:0" id="rc2-rows"></div>' +
            '<div id="rc2-rf"></div>' +
            '<div class="v3-linkrow" style="margin-top:8px"><button class="v3-link" id="rc2-print">Print</button> &middot; ' +
            '<button class="v3-link" id="rc2-share">Share</button></div>' +
            '<div style="height:16px"></div></div>';

        document.getElementById('rc2-back').addEventListener('click', function () { app.show(rifle.id); });
        var openDope = function () {
            if (window.ToolActions && ToolActions.dopeCards) ToolActions.dopeCards(app.db);
        };
        document.getElementById('rc2-print').addEventListener('click', openDope);
        document.getElementById('rc2-share').addEventListener('click', openDope);

        Promise.all([
            app.db.getLoadsByRifle(rifle.id).catch(function () { return []; }),
            app.db.getTrackingVerificationsByRifle(rifle.id).catch(function () { return []; })
        ]).then(function (res) {
            if (!container.isConnected || app._currentRifle() !== rifle) return;
            var loads = res[0] || [];
            var load = null;
            loads.forEach(function (l) { if (!load && (l.truedMv || l.truedBc)) load = l; });
            if (!load) loads.forEach(function (l) { if (!load && l.bulletBC) load = l; });
            if (!load && loads.length) load = loads[0];
            var tv = (res[1] || [])[0] || null;
            _fill(rifle, load, tv);
        });
    }

    function _fill(rifle, load, tv) {
        var subEl = document.getElementById('rc2-sub');
        var rowsEl = document.getElementById('rc2-rows');
        var rfEl = document.getElementById('rc2-rf');
        if (!load || !load.bulletBC || !(load.muzzleVelocity || load.truedMv)) {
            if (subEl) subEl.textContent = 'Add a bullet and speed on the rifle\'s numbers page to see this.';
            if (rowsEl) rowsEl.innerHTML = '';
            return;
        }
        if (subEl) subEl.textContent = 'Using your measured speed and today\'s conditions.';

        var bc = load.truedBc || load.bulletBC;
        var mv = load.truedMv || load.muzzleVelocity;
        var drag = load.dragModel || 'G7';
        var profile = {
            muzzleVelocity: mv, bc: bc, dragModel: drag,
            bulletWeight: load.bulletWeight || 140,
            zeroRange: rifle.zeroRange || 100, scopeHeight: rifle.scopeHeight || 1.5
        };

        var out;
        try {
            out = computeTrajectory({
                muzzleVelocity: mv, bc: bc, dragModel: drag,
                zeroRange: profile.zeroRange, scopeHeight: profile.scopeHeight, bulletWeight: profile.bulletWeight,
                maxRange: ROWS_YD[ROWS_YD.length - 1] + 50, rangeStep: 10,
                windSpeedMph: 0, windClockPos: 12, tempF: 59, pressureInHg: 29.92, humidity: 50
            });
        } catch (e) { return; }
        var table = (out && out.table) || [];
        function comeUpAt(yd) {
            var prev = null;
            for (var i = 0; i < table.length; i++) {
                if (table[i].rangeYards >= yd) {
                    if (!prev || table[i].rangeYards === yd) return table[i].comeUpMOA;
                    var f = (yd - prev.rangeYards) / (table[i].rangeYards - prev.rangeYards || 1);
                    return prev.comeUpMOA + (table[i].comeUpMOA - prev.comeUpMOA) * f;
                }
                prev = table[i];
            }
            return table.length ? table[table.length - 1].comeUpMOA : null;
        }
        var html = '<div class="cttl"><span>DROP CHART</span><small>29&Prime;Hg &middot; 59&deg;F</small></div>';
        ROWS_YD.forEach(function (yd) {
            var moa = comeUpAt(yd);
            html += '<div class="v3-crow"><span class="d">' + yd + '</span><span class="v">' +
                (moa === null ? '&mdash;' : moa.toFixed(1)) + '</span></div>';
        });
        if (rowsEl) rowsEl.innerHTML = html;

        var factor = (tv && tv.factor) || (typeof rifle.scopeCorrectionFactor === 'number' ? rifle.scopeCorrectionFactor : null);
        var rfHtml;
        if (factor && Math.abs(factor - 1) >= 0.0005 && typeof deviceCompensation === 'function') {
            var dc = null;
            try {
                dc = deviceCompensation(profile, { tempF: 59, pressureInHg: 29.92, humidity: 50 }, factor);
            } catch (e) { /* fall through */ }
            rfHtml = dc && !dc.identity
                ? '<span class="mono">BC ' + dc.bcOut.toFixed(3) + ' ' + drag + ' &middot; speed ' + dc.mvOut + '</span><br>' +
                  '<small>enter these into your rangefinder &mdash; they include your corrections</small>'
                : '<span class="mono">BC ' + bc.toFixed(3) + ' ' + drag + ' &middot; speed ' + Math.round(mv) + '</span><br>' +
                  '<small>enter as-is</small>';
        } else {
            rfHtml = '<span class="mono">BC ' + bc.toFixed(3) + ' ' + drag + ' &middot; speed ' + Math.round(mv) + '</span><br>' +
                '<small>enter as-is &mdash; do the scope check to refine</small>';
        }
        if (rfEl) rfEl.innerHTML = '<div class="v3-rfbox"><b>FOR YOUR RANGEFINDER</b><br>' + rfHtml + '</div>';
    }

    return { show: show };
})();

// Launcher (registration seam)
if (typeof window !== 'undefined') {
    window.RifleChart = RifleChart;
}
