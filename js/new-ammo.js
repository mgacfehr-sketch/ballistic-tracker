/**
 * new-ammo.js — "+ New ammo": the minimal, factory-box-friendly load
 * form (device feedback: a rifle with no loads dead-ended every
 * session flow at "which load?" with no way to create one in place).
 *
 * Three fields only — name, bullet, weight — because that's what's
 * printed on a box of factory ammo. No BC, no drag model, no velocity:
 * this creates a real load row the session can attach to right now;
 * the full load form (rifle Paperwork) is still where BC/velocity/lot
 * get filled in properly. Callers that need a truing-capable load
 * (steel) handle the "still missing numbers" case themselves after
 * the fact — this module's only job is "never block on no load."
 */

var NewAmmoForm = (function () {
    'use strict';

    /** HTML fragment — caller places it (inline reveal, dead-end
     *  replacement, whatever fits the screen) and calls bind() after
     *  inserting it into the DOM. idPrefix keeps ids unique per caller. */
    function html(idPrefix) {
        return '<div class="v3-fieldlbl">NEW AMMO</div>' +
            '<div class="field"><label for="' + idPrefix + '-name">Name</label>' +
            '<input type="text" id="' + idPrefix + '-name" maxlength="80" placeholder="Federal 175gr Gold Medal Match"></div>' +
            '<div class="field-row">' +
            '<div class="field"><label for="' + idPrefix + '-bullet">Bullet</label>' +
            '<input type="text" id="' + idPrefix + '-bullet" maxlength="60" placeholder="Sierra MatchKing"></div>' +
            '<div class="field"><label for="' + idPrefix + '-weight">Weight <span class="field-unit">gr</span></label>' +
            '<input type="number" id="' + idPrefix + '-weight" min="10" max="1200" step="1" inputmode="numeric" placeholder="175"></div>' +
            '</div>' +
            '<button type="button" class="v3-gold" id="' + idPrefix + '-save">Save &amp; continue</button>' +
            '<p class="t-micro u-mt-10" id="' + idPrefix + '-error"></p>';
    }

    /** Wires the Save button. onSaved(load) fires with the created,
     *  camelCase load row; the caller decides what "continue" means. */
    function bind(idPrefix, db, rifleId, onSaved) {
        var saveBtn = document.getElementById(idPrefix + '-save');
        if (!saveBtn) return;
        saveBtn.addEventListener('click', function () {
            var nameEl = document.getElementById(idPrefix + '-name');
            var bulletEl = document.getElementById(idPrefix + '-bullet');
            var weightEl = document.getElementById(idPrefix + '-weight');
            var errEl = document.getElementById(idPrefix + '-error');
            var name = nameEl ? nameEl.value.trim() : '';
            var bulletName = bulletEl ? bulletEl.value.trim() : '';
            var weight = weightEl ? parseFloat(weightEl.value) : NaN;

            if (!name) {
                if (errEl) errEl.textContent = 'Give it a name — the box label works.';
                return;
            }
            saveBtn.disabled = true;
            if (errEl) errEl.textContent = 'Saving…';
            db.addLoad({
                rifleId: rifleId,
                name: name,
                bulletName: bulletName,
                bulletWeight: isFinite(weight) && weight > 0 ? weight : 0
            }).then(function (load) {
                onSaved(load);
            }).catch(function (err) {
                saveBtn.disabled = false;
                if (errEl) errEl.textContent = 'Could not save — ' + friendlyError(err);
            });
        });
    }

    return { html: html, bind: bind };
})();

// Launcher (registration seam)
if (typeof window !== 'undefined') {
    window.NewAmmoForm = NewAmmoForm;
}
