/**
 * lanes.js — TWO LANES, ONE ENGINE (Contract v2.5 Part 1).
 *
 * One setting: Detailed mode, OFF by default. The Simple lane is the
 * front door — few inputs, Roy's words, one obvious thing to do. The
 * Detailed lane is everything v2.3/v2.4 built, unchanged. Both lanes
 * write the SAME tables and events; the confidence system underneath
 * never changes.
 *
 * Persisted in user_settings key 'detailed_mode' (no schema):
 *   { v: 1, detailed: bool, source: 'user'|'inferred' }
 * One-time inference: an existing user who has logged FULL steel
 * strings has already chosen the detailed workflow — default them ON
 * (recorded as source 'inferred', flips freely afterward).
 *
 * THE COPY MAP (Part 1.4): one place both vocabularies live so they
 * can never drift per-screen. Simple = Roy words ("bullet speed",
 * "drop chart"); Detailed keeps precise vocabulary.
 *
 *   Copy.t('mv')        → 'bullet speed' | 'muzzle velocity'
 *   Copy.t('mv', true)  → Title case of the same
 *
 * LanesCore (pure) is Node-tested; Lanes is the thin stateful wrapper.
 */

/* ── THE COPY MAP ─────────────────────────────────────────── */

var LANE_COPY = {
    mv:            { simple: 'bullet speed',            detailed: 'muzzle velocity' },
    mvShort:       { simple: 'speed',                   detailed: 'MV' },
    dope:          { simple: 'drop chart',              detailed: 'DOPE card' },
    impactOffset:  { simple: 'where did it hit?',       detailed: 'impact offset' },
    profile:       { simple: 'your rifle\'s numbers',   detailed: 'ballistic profile' },
    verified:      { simple: 'checked',                 detailed: 'verified' },
    calibrated:    { simple: 'checked',                 detailed: 'calibrated' },
    trueVerb:      { simple: 'tighten up',              detailed: 'true' },
    solution:      { simple: 'dial',                    detailed: 'firing solution' },
    logShooting:   { simple: 'Log shooting',            detailed: 'Log shooting' },
    chrono:        { simple: 'speed meter file',        detailed: 'chronograph file' }
};

/* ── Pure core ────────────────────────────────────────────── */

var LanesCore = {
    /** Copy lookup. Unknown keys return the key itself (loud in QA,
     *  harmless in the field). */
    copy: function (map, key, detailed) {
        var entry = map[key];
        if (!entry) return key;
        return detailed ? entry.detailed : entry.simple;
    },

    /** Title-case the first letter (headings/buttons). */
    title: function (s) {
        s = String(s || '');
        return s.charAt(0).toUpperCase() + s.slice(1);
    },

    /**
     * Resolve the lane from a saved setting + one-time inference.
     * saved: the user_settings value (or null/undefined).
     * hasFullStrings: has this account logged full steel strings?
     * → { detailed, persist }  persist=true → write the inference back
     *   so it happens exactly once.
     */
    resolve: function (saved, hasFullStrings) {
        if (saved && saved.v === 1 && typeof saved.detailed === 'boolean') {
            return { detailed: saved.detailed, persist: false };
        }
        if (hasFullStrings) {
            return { detailed: true, persist: true };
        }
        return { detailed: false, persist: false }; // default: Simple
    },

    serialize: function (detailed, source) {
        return { v: 1, detailed: !!detailed, source: source || 'user' };
    },

    /**
     * Roy-ify a sentence (§1.4): translate precise vocabulary into
     * Roy's words for simple-lane DISPLAY. Ordered, case-preserving on
     * the first letter. The detailed lane never calls this.
     */
    royify: function (text) {
        var RULES = [
            [/\bmuzzle velocity\b/gi, 'bullet speed'],
            [/\bMV\b/g, 'speed'],
            [/\bDOPE card\b/gi, 'drop chart'],
            [/\bDOPE\b/g, 'drop chart'],
            [/\bchronograph file\b/gi, 'speed meter file'],
            [/\bchrono file\b/gi, 'speed meter file'],
            [/\bchronograph\b/gi, 'speed meter'],
            [/\bchrono\b/gi, 'speed meter'],
            [/\bballistic profile\b/gi, 'your rifle’s numbers']
        ];
        var out = String(text || '');
        RULES.forEach(function (r) {
            out = out.replace(r[0], function (match) {
                var repl = r[1];
                // keep a leading capital ("Muzzle velocity" → "Bullet speed")
                if (match.charAt(0) === match.charAt(0).toUpperCase() &&
                    match.charAt(1) && match.charAt(1) === match.charAt(1).toLowerCase()) {
                    return repl.charAt(0).toUpperCase() + repl.slice(1);
                }
                return repl;
            });
        });
        return out;
    }
};

/* ── Stateful wrapper ─────────────────────────────────────── */

var Lanes = (function () {
    var _db = null;
    var _detailed = false;
    var _listeners = [];

    function _notify() {
        _listeners.forEach(function (fn) {
            try { fn(_detailed); } catch (e) { console.warn('[Lanes] listener failed:', e); }
        });
    }

    return {
        /**
         * Load the lane. The full-strings inference runs only when no
         * setting exists (one cheap query per rifle, once per account
         * ever — the result persists).
         */
        init: function (db) {
            _db = db;
            if (!db) { _detailed = false; return Promise.resolve(); }
            return db.getUserSetting('detailed_mode').then(function (saved) {
                if (saved && saved.v === 1 && typeof saved.detailed === 'boolean') {
                    _detailed = saved.detailed;
                    return null;
                }
                // one-time inference: any full steel string anywhere?
                if (!db.getSteelStringsByRifle) return null;
                return db.getAllRifles().catch(function () { return []; })
                    .then(function (rifles) {
                        var chain = Promise.resolve(false);
                        (rifles || []).forEach(function (r) {
                            chain = chain.then(function (found) {
                                if (found) return true;
                                return db.getSteelStringsByRifle(r.id)
                                    .catch(function () { return []; })
                                    .then(function (strings) {
                                        return (strings || []).some(function (s) { return s.tier === 'full'; });
                                    });
                            });
                        });
                        return chain;
                    })
                    .then(function (hasFull) {
                        var r = LanesCore.resolve(null, hasFull);
                        _detailed = r.detailed;
                        if (r.persist) {
                            return db.setUserSetting('detailed_mode',
                                LanesCore.serialize(true, 'inferred'))
                                .catch(function () { /* cached locally */ });
                        }
                        return null;
                    });
            }).catch(function () {
                _detailed = false;
            });
        },

        isDetailed: function () { return _detailed; },

        setDetailed: function (on) {
            _detailed = !!on;
            _notify();
            if (!_db) return Promise.resolve();
            return _db.setUserSetting('detailed_mode', LanesCore.serialize(_detailed, 'user'))
                .catch(function () { /* cached locally */ });
        },

        onChange: function (fn) { _listeners.push(fn); }
    };
})();

/** The copy entry the app calls: Copy.t('mv') / Copy.t('mv', true) */
var Copy = {
    t: function (key, titleCase) {
        var s = LanesCore.copy(LANE_COPY, key,
            typeof Lanes !== 'undefined' && Lanes.isDetailed());
        return titleCase ? LanesCore.title(s) : s;
    },
    /** Simple lane: Roy's words. Detailed lane: text unchanged. */
    roy: function (text) {
        if (typeof Lanes !== 'undefined' && Lanes.isDetailed()) return String(text || '');
        return LanesCore.royify(text);
    }
};

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LANE_COPY: LANE_COPY, LanesCore: LanesCore };
}
