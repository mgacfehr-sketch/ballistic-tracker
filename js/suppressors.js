/**
 * suppressors.js — the per-user suppressor library (§1.3b).
 *
 * NAME required; brand, model, length, weight, notes optional. Sessions
 * (range and steel) ask "Suppressed?" only for suppressor-enabled users;
 * if suppressed, they ask WHICH can (last-used preselected, "+ Add"
 * inline). All shift/velocity analytics group by (rifle, suppressor).
 * Bare = suppressor_id NULL.
 *
 * This module owns:
 *   - the add-a-can sheet (onboarding + inline "+ Add")
 *   - the suppressor-enabled user setting
 *   - last-used-per-rifle memory (user_settings, cross-device)
 * Session flows call Suppressors.ask(...) — the one question UI —
 * so range and steel phrase it identically.
 */

var Suppressors = (function () {
    'use strict';

    var ENABLED_KEY = 'suppressor_enabled';

    function lastUsedKey(rifleId) {
        return 'last_suppressor_' + rifleId;
    }

    /* ── settings ─────────────────────────────────────────── */

    function isEnabled(db) {
        return db.getUserSetting(ENABLED_KEY).then(function (v) {
            return !!v;
        }).catch(function () { return false; });
    }

    function setEnabled(db, on) {
        return db.setUserSetting(ENABLED_KEY, !!on);
    }

    function getLastUsed(db, rifleId) {
        if (!rifleId) return Promise.resolve(null);
        return db.getUserSetting(lastUsedKey(rifleId)).then(function (v) {
            return v || null;
        }).catch(function () { return null; });
    }

    function rememberLastUsed(db, rifleId, suppressorId) {
        if (!rifleId) return Promise.resolve();
        return db.setUserSetting(lastUsedKey(rifleId), suppressorId || null)
            .catch(function () { /* best effort */ });
    }

    /* ── the add-a-can sheet ──────────────────────────────── */

    /**
     * Overlay to add one or more suppressors.
     * opts: { intro?: bool (onboarding wording), onDone(added[]) }
     * Always skippable — skipping never blocks anything.
     */
    function addSheet(db, opts) {
        opts = opts || {};
        var added = [];
        var overlay = document.createElement('div');
        overlay.className = 'overlay';

        function render() {
            var listHtml = '';
            if (added.length) {
                added.forEach(function (s) {
                    listHtml += '<div class="rowlink"><div class="txt"><b>' + UI.esc(s.name) + '</b>' +
                        (s.brand || s.model
                            ? '<span>' + UI.esc([s.brand, s.model].filter(Boolean).join(' ')) + '</span>'
                            : '') +
                        '</div></div>';
                });
                listHtml = '<div class="card" style="margin:0 0 12px">' + listHtml + '</div>';
            }
            overlay.innerHTML =
                '<div class="overlay-card">' +
                '<div class="overlay-title">' + (opts.intro ? 'Add your suppressor' : 'Add a suppressor') + '</div>' +
                (opts.intro
                    ? '<p class="overlay-text">Sessions will ask which can is on — every shift and velocity number is tracked per rifle + can. You can add more later.</p>'
                    : '') +
                listHtml +
                '<div class="field"><label for="sup-name">Name</label>' +
                '<input type="text" id="sup-name" placeholder="e.g. Nomad 30" maxlength="60"></div>' +
                '<div class="field"><label for="sup-brand">Brand <span class="t-micro">(optional)</span></label>' +
                '<input type="text" id="sup-brand" maxlength="60"></div>' +
                '<div class="field"><label for="sup-model">Model <span class="t-micro">(optional)</span></label>' +
                '<input type="text" id="sup-model" maxlength="60"></div>' +
                '<p class="t-micro u-mt-10" id="sup-error"></p>' +
                '<button class="btn-primary u-full" id="sup-save">Save can</button>' +
                '<button class="btn u-full u-mt-10" id="sup-done">' +
                (added.length ? 'Done' : (opts.intro ? 'Skip for now' : 'Cancel')) +
                '</button>' +
                '</div>';
            bind();
        }

        function close() {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            if (opts.onDone) opts.onDone(added);
        }

        function bind() {
            overlay.querySelector('#sup-save').addEventListener('click', function () {
                var name = overlay.querySelector('#sup-name').value.trim();
                var err = overlay.querySelector('#sup-error');
                if (!name) {
                    err.textContent = 'A name is all it needs.';
                    return;
                }
                err.textContent = 'Saving…';
                db.addSuppressor({
                    name: name,
                    brand: overlay.querySelector('#sup-brand').value.trim() || null,
                    model: overlay.querySelector('#sup-model').value.trim() || null
                }).then(function (saved) {
                    added.push(saved);
                    render(); // clears fields, shows the list, offers another
                }).catch(function (e) {
                    err.textContent = 'Could not save — ' + (e && e.message ? e.message : 'try again.');
                });
            });
            overlay.querySelector('#sup-done').addEventListener('click', close);
        }

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) close();
        });
        document.body.appendChild(overlay);
        render();
    }

    return {
        isEnabled: isEnabled,
        setEnabled: setEnabled,
        getLastUsed: getLastUsed,
        rememberLastUsed: rememberLastUsed,
        addSheet: addSheet,
        lastUsedKey: lastUsedKey
    };
})();

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { lastUsedKey: Suppressors.lastUsedKey };
}
