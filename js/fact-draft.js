/**
 * fact-draft.js — Contract v4.0 Law 4: "Nothing typed is ever lost."
 * Every fact card autosaves its in-progress state to localStorage on
 * every change; drafts survive app close, crash, and offline. A draft
 * is cleared only once its real save (Supabase, via SyncQueue) has
 * actually gone through — never on cancel/back, so a Roy who
 * accidentally backs out doesn't lose what he typed either.
 *
 * This is scratch state ahead of a real write, not a domain record —
 * same category as rifle-add.js's existing `yort_steel_last` sticky
 * default, not the "sessions/profiles" localStorage CLAUDE.md reserves
 * for Supabase.
 */
var FactDraft = (function () {
    'use strict';

    var KINDS = [
        { kind: 'zero', label: 'zeroing it' },
        { kind: 'steel', label: 'a shot at distance' },
        { kind: 'chrono', label: 'clocking your speed' }
    ];

    function _key(kind, rifleId) { return 'yort_draft_' + kind + '_' + rifleId; }

    function save(kind, rifleId, state) {
        if (!rifleId) return;
        try { localStorage.setItem(_key(kind, rifleId), JSON.stringify(state)); } catch (e) { /* best effort */ }
    }

    function load(kind, rifleId) {
        if (!rifleId) return null;
        try {
            var raw = localStorage.getItem(_key(kind, rifleId));
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function clear(kind, rifleId) {
        if (!rifleId) return;
        try { localStorage.removeItem(_key(kind, rifleId)); } catch (e) { /* best effort */ }
    }

    /** Any draft for this rifle, across all fact cards — the Card's
     *  "Finish what you started" line. First one found wins (a Roy
     *  mid-entry on one card hasn't started a second at the same time). */
    function findAny(rifleId) {
        if (!rifleId) return null;
        for (var i = 0; i < KINDS.length; i++) {
            var d = load(KINDS[i].kind, rifleId);
            if (d) return { kind: KINDS[i].kind, label: KINDS[i].label, state: d };
        }
        return null;
    }

    return { save: save, load: load, clear: clear, findAny: findAny, KINDS: KINDS };
})();

if (typeof window !== 'undefined') window.FactDraft = FactDraft;
if (typeof module !== 'undefined' && module.exports) module.exports = FactDraft;
