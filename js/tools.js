/**
 * tools.js — the JOB activation registry (Contract v2.3 §1.2/§1.3).
 *
 * v2.3 reorganizes activation around JOBS (Range Session, Steel Session,
 * Load Development, Ballistics, Truing, Scope Tracking, Data & Records)
 * instead of individual tools. Two visibility axes still compose:
 *   hasFeature(def.feature)    — the TIER axis (beta-features.js)
 *   ToolRegistry.isActive(key) — the USER axis (checklist onboarding /
 *                                the "More tools" surface)
 * A job is visible only when both say yes. Data & Records is core
 * (always on). Jobs the user has off do not render on Home — hiding
 * keeps all data.
 *
 * Activations persist cross-device via db.setUserSetting
 * ('tool_activations', {v:2, tools}) — Supabase user_settings with
 * localStorage write-through. v1 maps (the retired preset era) migrate
 * transparently in ToolsCore.hydrate. All reads after init() are
 * synchronous against an in-memory cache.
 *
 * LEGACY_ALIASES keeps every pre-v2.3 call site working
 * (ToolRegistry.isVisible('bench') → the loadDev job, etc.).
 *
 * ToolsCore (pure, Node-tested) holds the logic; ToolRegistry is the
 * thin stateful wrapper the app talks to.
 */

var TOOLS = {
    rangeSession: {
        key: 'rangeSession', core: false, feature: null,
        label: 'Range Session',
        desc: 'Paper targets, chrono, document the day',
        defaultOn: true // pre-checked in onboarding
    },
    steelSession: {
        key: 'steelSession', core: false, feature: null,
        label: 'Steel/Field Session',
        desc: 'Log hits at distance — casual or full'
    },
    loadDev: {
        key: 'loadDev', core: false, feature: 'loadDevelopment', // tier-hidden in v1 (Part 0.5)
        label: 'Load Development',
        desc: 'Ladder tests, recipes, ammo comparison'
    },
    ballistics: {
        key: 'ballistics', core: false, feature: null,
        label: 'Ballistics',
        desc: 'Firing solution & DOPE cards'
    },
    truing: {
        key: 'truing', core: false, feature: null,
        label: 'Truing',
        desc: 'Make solutions match reality'
    },
    scopeTracking: {
        key: 'scopeTracking', core: false, feature: null,
        label: 'Scope Tracking',
        desc: 'Verify your clicks are true'
    },
    records: {
        key: 'records', core: true, feature: null,
        label: 'Data & Records',
        desc: 'History, dashboards, reports, proof'
    }
    // Feature waves add entries here — never a new registry, never a nav tab.
};

/**
 * Pre-v2.3 tool keys → their v2.3 job. Old call sites and persisted v1
 * activation maps both resolve through this. chrono maps to rangeSession
 * (chrono import is reachable inside it and stays neutrally launchable).
 */
var LEGACY_ALIASES = {
    checkTarget: 'rangeSession',
    solver: 'ballistics',
    chrono: 'rangeSession',
    scopeTruth: 'scopeTracking',
    dopeCards: 'ballistics',
    field: 'steelSession',
    bench: 'loadDev'
};

/** The onboarding checklist rows (order shown to the user). Data &
 *  Records is core and never asked. loadDev is tier-hidden in v1. */
var CHECKLIST_JOBS = ['rangeSession', 'steelSession', 'ballistics', 'truing', 'scopeTracking'];

// ── Pure core ─────────────────────────────────────────────────

var ToolsCore = {
    /** Resolve a possibly-legacy key to its v2.3 job key. */
    resolveKey: function (key) {
        return LEGACY_ALIASES[key] || key;
    },

    /**
     * Is this job active for the user? Core jobs always are.
     * activeMap: { jobKey: {active: bool, at: iso} }
     */
    isActive: function (toolDef, activeMap) {
        if (!toolDef) return false;
        if (toolDef.core) return true;
        var entry = activeMap && activeMap[toolDef.key];
        return !!(entry && entry.active);
    },

    /**
     * Visible = tier gate AND user activation.
     * hasFeatureFn injected so tests need no globals.
     */
    visible: function (toolDef, activeMap, hasFeatureFn) {
        if (!toolDef) return false;
        if (toolDef.feature && !hasFeatureFn(toolDef.feature)) return false;
        return ToolsCore.isActive(toolDef, activeMap);
    },

    /**
     * Returns a NEW activeMap with the job switched. Core jobs cannot
     * be deactivated (they define the app's floor). Idempotent.
     * Deactivating preserves the entry (hiding keeps all data).
     */
    setActive: function (toolDef, activeMap, active, nowIso) {
        var map = {};
        for (var k in activeMap) {
            if (activeMap.hasOwnProperty(k)) map[k] = activeMap[k];
        }
        if (!toolDef || (toolDef.core && !active)) return map;
        map[toolDef.key] = { active: !!active, at: nowIso || new Date().toISOString() };
        return map;
    },

    /**
     * Apply a checklist: activate every listed job. Unknown keys ignored.
     * (The old named presets are retired; this generic list activation is
     * the checklist onboarding's primitive.)
     */
    applyPreset: function (tools, activeMap, keys, nowIso) {
        var map = activeMap;
        for (var i = 0; i < (keys || []).length; i++) {
            var def = tools[ToolsCore.resolveKey(keys[i])];
            if (def) map = ToolsCore.setActive(def, map, true, nowIso);
        }
        return map;
    },

    /** Serialization contract for the user_settings row. */
    serialize: function (activeMap) {
        return { v: 2, tools: activeMap || {} };
    },

    /**
     * Hydrate a saved activation map.
     * v2 → as-is. v1 (preset era) → migrated: each active legacy tool
     * wakes its job, and rangeSession + ballistics always wake (their
     * v1 equivalents, checkTarget and solver, were core — every v1 user
     * had them). Garbage → empty map.
     */
    hydrate: function (saved) {
        if (saved && saved.v === 2 && saved.tools) return saved.tools;
        if (saved && saved.v === 1 && saved.tools) {
            var map = {};
            var at = new Date().toISOString();
            // v1 core equivalents were always on
            map.rangeSession = { active: true, at: at };
            map.ballistics = { active: true, at: at };
            for (var k in saved.tools) {
                if (!saved.tools.hasOwnProperty(k)) continue;
                var entry = saved.tools[k];
                if (!entry || !entry.active) continue;
                var job = ToolsCore.resolveKey(k);
                if (TOOLS[job]) map[job] = { active: true, at: entry.at || at };
            }
            return map;
        }
        return {};
    }
};

// ── Stateful registry ─────────────────────────────────────────

var ToolRegistry = (function () {
    var _db = null;
    var _active = {};       // hydrated activeMap (v2 job keys)
    var _listeners = [];

    function _hasFeatureSafe(name) {
        return typeof hasFeature === 'function' ? hasFeature(name) : false;
    }

    function _def(key) {
        return TOOLS[ToolsCore.resolveKey(key)];
    }

    function _notify() {
        for (var i = 0; i < _listeners.length; i++) {
            try { _listeners[i](); } catch (e) { console.warn('[Tools] listener failed:', e); }
        }
    }

    function _persist() {
        if (!_db) return Promise.resolve();
        return _db.setUserSetting('tool_activations', ToolsCore.serialize(_active))
            .catch(function (e) {
                console.warn('[Tools] persist failed (cached locally):', e);
            });
    }

    return {
        /** Load activations into memory. Resolve even on failure (cache/{}). */
        init: function (db) {
            _db = db;
            if (!db) { _active = {}; return Promise.resolve(); }
            return db.getUserSetting('tool_activations').then(function (saved) {
                _active = ToolsCore.hydrate(saved);
                // Persist a v1→v2 migration so it happens exactly once
                if (saved && saved.v === 1) _persist();
            }).catch(function () {
                _active = {};
            });
        },

        isActive: function (key) {
            return ToolsCore.isActive(_def(key), _active);
        },

        isVisible: function (key) {
            return ToolsCore.visible(_def(key), _active, _hasFeatureSafe);
        },

        activate: function (key) {
            _active = ToolsCore.setActive(_def(key), _active, true);
            _notify();
            return _persist();
        },

        deactivate: function (key) {
            _active = ToolsCore.setActive(_def(key), _active, false);
            _notify();
            return _persist();
        },

        /** Checklist onboarding: activate this explicit list of jobs. */
        applyPreset: function (keys) {
            _active = ToolsCore.applyPreset(TOOLS, _active, keys || []);
            _notify();
            return _persist();
        },

        /** The onboarding/"More tools" row set: tier-eligible jobs with
         *  their current activation state (core jobs excluded — always on). */
        getChecklist: function () {
            var out = [];
            for (var i = 0; i < CHECKLIST_JOBS.length; i++) {
                var def = TOOLS[CHECKLIST_JOBS[i]];
                if (!def) continue;
                if (def.feature && !_hasFeatureSafe(def.feature)) continue;
                out.push({
                    key: def.key, label: def.label, desc: def.desc,
                    active: ToolsCore.isActive(def, _active),
                    defaultOn: !!def.defaultOn
                });
            }
            return out;
        },

        /** Tier-eligible but not active — what the "More tools" surface offers. */
        getDormant: function () {
            var out = [];
            for (var k in TOOLS) {
                if (!TOOLS.hasOwnProperty(k)) continue;
                var def = TOOLS[k];
                if (def.core) continue;
                if (def.feature && !_hasFeatureSafe(def.feature)) continue;
                if (!ToolsCore.isActive(def, _active)) out.push(def);
            }
            return out;
        },

        onChange: function (fn) {
            _listeners.push(fn);
        }
    };
})();

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TOOLS: TOOLS,
        LEGACY_ALIASES: LEGACY_ALIASES,
        CHECKLIST_JOBS: CHECKLIST_JOBS,
        ToolsCore: ToolsCore
    };
}
