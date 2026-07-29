/**
 * device-export.js — Device Sync/Export (§2.12): "keep your devices
 * honest."
 *
 * Rangefinder/solver devices (Revic, Sig KILO/BDX, Kestrel) accept
 * BC + MV but know nothing about scope-tracking error. Proven holds
 * the TRUE values plus the scope factor — so it computes what to
 * punch into a device whose solutions get DIALED through that scope.
 * Math: truingCore.deviceCompensation (pure, Node-tested). Manual
 * copy-out only — no device APIs in v1.
 */

var DeviceExport = (function () {
    'use strict';

    var _db = null;
    var _container = null;

    function open(db, rifleId) {
        _db = db;
        _container = document.getElementById('view-home');
        if (!_container) return;
        if (window.AppNav) AppNav.go('home');

        Promise.all([
            db.getRifle(rifleId).catch(function () { return null; }),
            db.getLoadsByRifle(rifleId).catch(function () { return []; }),
            db.getMvMeasurementsByRifle(rifleId).catch(function () { return []; }),
            db.getTruingEventsByRifle(rifleId).catch(function () { return []; })
        ]).then(function (res) {
            var rifle = res[0];
            // UI Consolidation phase: this used to fall back to the now-
            // effectively-dead Categories.show('ballistics') (Categories
            // itself has zero live callers today). Falls back to the
            // Card instead, matching "every flow ends at the Card."
            if (!rifle) { if (window.AppNav) AppNav.go('home'); return; }
            var loads = res[1] || [];
            var load = null;
            loads.forEach(function (l) { if (!load && (l.truedMv || l.truedBc)) load = l; });
            if (!load) loads.forEach(function (l) { if (!load && l.bulletBC && l.muzzleVelocity) load = l; });
            if (!load && loads.length) load = loads[0];
            render(rifle, load, res[2] || [], res[3] || []);
        });
    }

    function render(rifle, load, mvMeasurements, truingEvents) {
        _container.setAttribute('data-screen', 'device-export');
        var factor = typeof rifle.scopeCorrectionFactor === 'number' && isFinite(rifle.scopeCorrectionFactor)
            ? rifle.scopeCorrectionFactor : null;

        var html = '<div class="screen">';
        html += '<div class="pagehead">' +
            '<button class="backline" id="de-back">&lsaquo; Ballistics</button>' +
            '<div class="pagetitle">Device export</div>' +
            '<div class="pagesub mono">' + UI.esc(rifle.name || '') + '</div></div>';

        if (!load || !load.bulletBC || !(load.muzzleVelocity || load.truedMv)) {
            html += '<div class="empty-teach"><p>This needs a load with BC and velocity — add those first.</p></div></div>';
            _container.innerHTML = html;
            _bindBack(rifle);
            return;
        }

        var mv = load.truedMv || (mvMeasurements[0] ? mvMeasurements[0].value : null) || load.muzzleVelocity;
        var bc = load.truedBc || load.bulletBC;
        var mvLabel = load.truedMv ? 'trued' : (mvMeasurements[0] ? 'measured' : 'box/estimated');
        var bcLabel = load.truedBc ? 'trued' : 'published';

        // THE TRUE PROFILE — the portable truth
        html += UI.sectionHead('The true profile');
        html += '<div class="card card-pad edge-none">' +
            _bigRow('Muzzle velocity', Math.round(mv) + ' fps', mvLabel) +
            _bigRow('BC (' + (load.dragModel || 'G7') + ')', Number(bc).toFixed(3), bcLabel) +
            _bigRow('Scope factor', factor !== null ? '×' + factor.toFixed(3) : 'not verified',
                factor !== null
                    ? 'from ' + (rifle.scopeTrackingTestedAt ? new Date(rifle.scopeTrackingTestedAt).toLocaleDateString() : 'tall-target')
                    : 'run Scope Tracking to measure it') +
            '<p class="t-micro u-mt-10">These are Proven\'s numbers — the portable truth about this rifle.</p>' +
            '</div>';

        // THE DEVICE PROFILE — compensated for dialing through this scope
        html += UI.sectionHead('The device profile');
        if (factor === null) {
            html += '<div class="card card-pad edge-none"><p class="t-micro" style="line-height:1.5">' +
                'Your tracking has never been verified, so there\'s nothing to compensate — ' +
                'enter the true profile into the device as-is. Verify tracking (10 minutes at 100) ' +
                'and this screen computes the corrected pair.</p></div>';
        } else if (Math.abs(factor - 1) < 0.005) {
            html += '<div class="card card-pad edge-none"><p class="t-micro" style="line-height:1.5">' +
                'Your scope tracks true — the device profile IS the true profile. Punch in the numbers above.</p></div>';
        } else {
            // working range: zero → calibrated-to (latest truing far), else 800
            var toYd = 800;
            if (truingEvents[0] && truingEvents[0].far && truingEvents[0].far.rangeYds) {
                toYd = Math.max(500, truingEvents[0].far.rangeYds);
            }
            var workingRange = { fromYd: Math.max(200, (rifle.zeroRange || 100) * 2), toYd: toYd };
            var profile = {
                muzzleVelocity: mv, bc: bc, dragModel: load.dragModel || 'G7',
                bulletWeight: load.bulletWeight || 140,
                zeroRange: rifle.zeroRange || 100, scopeHeight: rifle.scopeHeight || 1.5
            };
            var comp = deviceCompensation(profile, null, factor, workingRange);
            if (!comp) {
                html += '<div class="card card-pad edge-none"><p class="t-micro">Could not compute a compensation for this profile.</p></div>';
            } else {
                html += '<div class="card edge-none" style="border:2px solid var(--brand-gold)"><div class="card-pad">' +
                    '<div style="display:flex;gap:16px;justify-content:center;text-align:center">' +
                    '<div><div class="t-micro">BC ' + (load.dragModel || 'G7') + '</div>' +
                    '<div class="mono" style="font-size:34px;font-weight:700;color:var(--brand-gold-strong)">' +
                    comp.bcOut.toFixed(3) + '</div></div>' +
                    '<div><div class="t-micro">MV fps</div>' +
                    '<div class="mono" style="font-size:34px;font-weight:700;color:var(--brand-gold-strong)">' +
                    comp.mvOut + '</div></div>' +
                    '</div>' +
                    (comp.sweetSpot
                        ? '<p class="t-micro u-mt-10" style="text-align:center">best ' +
                          comp.sweetSpot.fromYd + '–' + comp.sweetSpot.toYd + ' yd · within ' +
                          (Math.round(comp.sweetSpot.maxErrMOA * 100) / 100) + ' MOA there</p>'
                        : '') +
                    '</div></div>';
                html += '<p class="t-micro edge u-mt-10" style="line-height:1.5">' +
                    'For your rangefinder or Kestrel, <b>dialing through this scope</b>: the scope\'s ' +
                    (factor > 1 ? 'clicks run ' + Math.round((factor - 1) * 100) + '% large'
                        : 'clicks run ' + Math.round((1 - factor) * 100) + '% small') +
                    ', so these numbers bake that back in. A BC curve can\'t perfectly copy a linear click ' +
                    'error — stay inside the sweet spot. Assumes tracking factor ×' + factor.toFixed(2) +
                    (rifle.scopeTrackingTestedAt ? ' from the ' + new Date(rifle.scopeTrackingTestedAt).toLocaleDateString() + ' tall-target' : '') +
                    '. <b>If you fix or replace the scope, regenerate.</b></p>';
            }
        }
        html += '<div style="height:16px"></div></div>';
        _container.innerHTML = html;
        _bindBack(rifle);
    }

    function _bigRow(label, value, sub) {
        return '<div class="rowlink" style="padding-left:0;padding-right:0"><div class="txt">' +
            '<b>' + UI.esc(label) + '</b><span class="t-micro">' + UI.esc(sub) + '</span></div>' +
            '<span class="mono" style="font-size:22px;font-weight:700">' + UI.esc(value) + '</span></div>';
    }

    function _bindBack(rifle) {
        var back = document.getElementById('de-back');
        if (back) back.addEventListener('click', function () {
            // UI Consolidation phase: was Categories.show('ballistics', ...)
            // — Categories has zero live callers today; the Card is this
            // phase's universal "done" destination.
            if (window.AppNav) AppNav.go('home');
        });
    }

    return { open: open };
})();

// Launcher (registration seam)
if (typeof window !== 'undefined') {
    window.ToolActions = window.ToolActions || {};
    window.ToolActions.deviceExport = function (db, rifleId) {
        if (rifleId) DeviceExport.open(db, rifleId);
        else if (window.AppNav) AppNav.go('home');
    };
}
