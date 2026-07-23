/**
 * ballistics-job.js — the Ballistics job glue (§2.4).
 *
 * The solver file (js/ballistic-solver.js) is contract-protected, so
 * this module DECORATES its manager from outside (the same
 * instance/prototype-decoration pattern the offline queue uses on
 * db.js): solutions silently use TRUED values, come-ups are
 * scope-tracking-corrected exactly like DOPE cards, and every
 * solution states its BASIS LINE (provenance, Part 0.6 #3):
 *   "Using trued MV 2,831 (7/22) · BC .319 trued · tracking-corrected ×1.04"
 * Nothing inside the protected file changes.
 */

(function () {
    'use strict';
    if (typeof BallisticSolverManager === 'undefined') return;

    /* Trued values, silently (§2.5: every future solution uses them). */
    var origCalc = BallisticSolverManager.prototype._calculate;
    BallisticSolverManager.prototype._calculate = function () {
        var orig = this.selectedLoad;
        var swapped = false;
        if (orig && (typeof orig.truedMv === 'number' || typeof orig.truedBc === 'number')) {
            var t = {};
            for (var k in orig) { if (orig.hasOwnProperty(k)) t[k] = orig[k]; }
            if (typeof orig.truedMv === 'number' && orig.truedMv > 0) t.muzzleVelocity = orig.truedMv;
            if (typeof orig.truedBc === 'number' && orig.truedBc > 0) t.bulletBC = orig.truedBc;
            this.selectedLoad = t;
            swapped = true;
        }
        try {
            origCalc.call(this);
        } finally {
            if (swapped) this.selectedLoad = orig;
        }
        _appendBasisLine(this);
    };

    /* Scope-tracking-corrected come-ups, silently (matches DOPE cards). */
    var origTable = BallisticSolverManager.prototype._renderTable;
    BallisticSolverManager.prototype._renderTable = function (result) {
        var rifle = this.selectedRifle;
        var f = rifle && typeof rifle.scopeCorrectionFactor === 'number' && isFinite(rifle.scopeCorrectionFactor)
            ? rifle.scopeCorrectionFactor : null;
        if (f && Math.abs(f - 1) > 0.001 && result && result.table &&
            typeof applyScopeCorrection === 'function') {
            result = {
                zeroAngleDeg: result.zeroAngleDeg,
                table: result.table.map(function (row) {
                    var o = {};
                    for (var k in row) { if (row.hasOwnProperty(k)) o[k] = row[k]; }
                    o.comeUpMOA = applyScopeCorrection(row.comeUpMOA, f);
                    return o;
                })
            };
        }
        origTable.call(this, result);
    };

    /** The basis line: what this solution is standing on. */
    function _appendBasisLine(mgr) {
        var results = document.getElementById('solver-results');
        if (!results) return;
        var old = document.getElementById('solver-basis');
        if (old && old.parentNode) old.parentNode.removeChild(old);

        var load = mgr.selectedLoad;
        var rifle = mgr.selectedRifle;
        if (!load || !rifle) return;

        var bits = [];
        if (typeof load.truedMv === 'number' && load.truedMv > 0) {
            bits.push('trued MV ' + Math.round(load.truedMv) +
                (load.truedAt ? ' (' + _shortDate(load.truedAt) + ')' : ''));
        } else if (load.muzzleVelocity) {
            bits.push('MV ' + Math.round(load.muzzleVelocity) + ' — box/estimated');
        }
        if (typeof load.truedBc === 'number' && load.truedBc > 0) {
            bits.push('BC ' + load.truedBc.toFixed(3) + ' trued');
        } else if (load.bulletBC) {
            bits.push('BC ' + load.bulletBC + ' published');
        }
        if (typeof rifle.scopeCorrectionFactor === 'number' &&
            Math.abs(rifle.scopeCorrectionFactor - 1) > 0.001) {
            bits.push('tracking-corrected ×' + rifle.scopeCorrectionFactor.toFixed(2));
        } else if (typeof rifle.scopeCorrectionFactor === 'number') {
            bits.push('tracking verified true');
        }
        if (!bits.length) return;

        var div = document.createElement('p');
        div.id = 'solver-basis';
        div.className = 't-micro mono';
        div.style.cssText = 'padding:8px var(--space-edge, 20px) 0;line-height:1.5';
        div.textContent = 'Using ' + bits.join(' · ');
        results.appendChild(div);

        // Upgrade the MV wording when a measurement event exists
        if (mgr.db && mgr.db.getMvMeasurementsByRifle &&
            !(typeof load.truedMv === 'number' && load.truedMv > 0)) {
            mgr.db.getMvMeasurementsByRifle(rifle.id).then(function (list) {
                var m = (list || [])[0];
                if (!m || !div.isConnected) return;
                bits[0] = 'measured MV ' + Math.round(m.value) + ' (' + _shortDate(m.date) + ')';
                div.textContent = 'Using ' + bits.join(' · ');
            }).catch(function () { /* keep the sync line */ });
        }
    }

    function _shortDate(iso) {
        var d = new Date(iso);
        return isNaN(d.getTime()) ? '' : (d.getMonth() + 1) + '/' + d.getDate();
    }
})();
