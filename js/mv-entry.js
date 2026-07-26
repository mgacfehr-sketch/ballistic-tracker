/**
 * mv-entry.js — ADD BULLET SPEED, never import-gated (v2.5 §2.5).
 *
 * Wherever velocity is requested (the next action, the card's MV
 * segment, the rifle page), this sheet is the front door:
 *   PRIMARY   — Type it in: average + roughly-how-many-shots
 *               (+ optional SD). Writes mv_measurements with
 *               source 'manual' — honest measured-manual provenance.
 *   secondary — Import a chronograph file (the existing screen).
 *
 * Honest provenance rule: a bare number with NO shot count is a
 * guess, not a measurement — it updates the load's box velocity
 * (state stays "estimated") instead of writing an mv_measurement.
 * The confidence system already distinguishes these; nothing new.
 */

var MvEntry = (function () {
    'use strict';

    var COUNTS = [3, 5, 10, 20];

    /**
     * opts: { load?  — target load (defaults to the rifle's first,
     *         trued-first), onDone(saved:bool) }
     */
    function open(db, rifle, opts) {
        opts = opts || {};
        var pLoads = opts.load
            ? Promise.resolve([opts.load])
            : db.getLoadsByRifle(rifle.id).catch(function () { return []; });

        pLoads.then(function (loads) {
            var load = null;
            (loads || []).forEach(function (l) { if (!load && (l.truedMv || l.truedBc)) load = l; });
            if (!load && loads && loads.length) load = loads[0];
            _sheet(db, rifle, load, opts);
        });
    }

    function _sheet(db, rifle, load, opts) {
        var simple = typeof Lanes !== 'undefined' && !Lanes.isDetailed();
        var title = simple ? 'Bullet speed' : 'Muzzle velocity';
        var picked = { count: 10 };

        var overlay = document.createElement('div');
        overlay.className = 'overlay';

        var chips = COUNTS.map(function (c) {
            return '<button class="chip-opt' + (picked.count === c ? ' is-selected' : '') +
                '" data-mvcount="' + c + '">' + c + '</button>';
        }).join('') +
            '<button class="chip-opt" data-mvcount="guess">just a guess</button>';

        overlay.innerHTML =
            '<div class="overlay-card">' +
            '<div class="overlay-title">' + title + '</div>' +
            (load ? '<p class="overlay-text mono">' + UI.esc(load.name || '') + '</p>' : '') +
            '<div class="field"><label for="mv-avg">Average, fps</label>' +
            '<input type="number" inputmode="numeric" id="mv-avg" placeholder="2950" min="500" max="5000"></div>' +
            '<p class="t-label u-mt-10">Over roughly how many shots?</p>' +
            '<div class="chip-row u-mt-10" id="mv-counts">' + chips + '</div>' +
            '<details class="fold u-mt-10"><summary>SD too (if your meter shows it)</summary>' +
            '<div class="fold-body"><div class="field"><label for="mv-sd">SD, fps</label>' +
            '<input type="number" inputmode="decimal" id="mv-sd" placeholder="7.5" min="0" max="200"></div></div></details>' +
            '<p class="field-error" id="mv-error"></p>' +
            '<button class="btn-primary u-full u-mt-10" id="mv-save">Save to ' + UI.esc(rifle.name || 'rifle') + '</button>' +
            '<button class="btn-utility u-full u-mt-10" id="mv-import">Import a ' +
            (simple ? 'speed meter' : 'chronograph') + ' file</button>' +
            '<button class="btn u-full u-mt-10" id="mv-cancel">Not now</button>' +
            '</div>';
        document.body.appendChild(overlay);

        function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        overlay.querySelector('#mv-cancel').addEventListener('click', function () {
            close();
            if (opts.onDone) opts.onDone(false);
        });
        overlay.querySelector('#mv-import').addEventListener('click', function () {
            close();
            if (window.AppNav) AppNav.go('chrono');
        });
        overlay.querySelector('#mv-counts').addEventListener('click', function (e) {
            var b = e.target.closest ? e.target.closest('[data-mvcount]') : null;
            if (!b) return;
            var all = overlay.querySelectorAll('[data-mvcount]');
            for (var i = 0; i < all.length; i++) all[i].classList.remove('is-selected');
            b.classList.add('is-selected');
            var v = b.getAttribute('data-mvcount');
            picked.count = v === 'guess' ? null : parseInt(v, 10);
        });
        overlay.querySelector('#mv-save').addEventListener('click', function () {
            var avg = parseFloat(document.getElementById('mv-avg').value);
            var sd = parseFloat(document.getElementById('mv-sd').value);
            var err = document.getElementById('mv-error');
            if (!isFinite(avg) || avg < 500 || avg > 5000) {
                err.textContent = 'Enter the average speed in fps (500–5000).';
                return;
            }
            var btn = this;
            btn.disabled = true;
            var write;
            if (picked.count === null) {
                // a guess: honest ESTIMATED — the load's box number, no event
                if (!load) { err.textContent = 'Add a load first — the speed rides with the ammo.'; btn.disabled = false; return; }
                load.muzzleVelocity = Math.round(avg);
                write = db.updateLoad(load);
            } else {
                var payload = {
                    rifleId: rifle.id,
                    loadId: load ? load.id : null,
                    value: Math.round(avg),
                    sd: isFinite(sd) ? sd : null,
                    shotCount: picked.count,
                    lotNumber: load ? (load.lotNumber || null) : null,
                    source: 'manual'
                };
                write = (typeof SyncQueue !== 'undefined' && SyncQueue)
                    ? SyncQueue.write('addMvMeasurement', payload)
                    : db.addMvMeasurement(payload);
            }
            write.then(function () {
                if (typeof Readiness !== 'undefined') Readiness.invalidate(rifle.id);
                close();
                if (opts.onDone) opts.onDone(true);
            }).catch(function (e2) {
                btn.disabled = false;
                err.textContent = 'Could not save: ' + e2.message;
            });
        });
    }

    return { open: open };
})();
