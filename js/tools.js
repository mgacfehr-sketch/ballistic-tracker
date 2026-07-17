/**
 * tools.js — the tool activation registry (UX Architecture, Surface 3).
 *
 * Two visibility axes compose everywhere:
 *   hasFeature(tool.feature)   — the TIER axis (beta-features.js, unchanged)
 *   ToolRegistry.isActive(key) — the USER axis (per-user activations)
 * A tool is visible only when both say yes. Core tools are always active.
 *
 * Activations persist cross-device via db.setUserSetting('tool_activations')
 * (Supabase user_settings, localStorage write-through). All reads after
 * init() are synchronous against an in-memory cache.
 *
 * ToolsCore (pure, Node-testable) holds the transition/visibility logic;
 * ToolRegistry is the thin stateful wrapper the app talks to.
 */

var TOOLS = {
    checkTarget: {
        key: 'checkTarget', core: true, feature: null,
        problem: 'Check a target',
        homeAction: { id: 'check-target', icon: '📷', label: 'Check a target', view: 'session' }
    },
    solver: {
        key: 'solver', core: true, feature: null,
        problem: 'Get a firing solution',
        homeAction: { id: 'firing-solution', icon: '🎯', label: 'Get a firing solution', view: 'solver' }
    },
    chrono: {
        key: 'chrono', core: false, feature: 'chronoImport',
        problem: 'Track my velocities',
        homeAction: { id: 'import-chrono', icon: '📥', label: 'Import chrono data', view: 'chrono' },
        rifleCards: []
    },
    scopeTruth: {
        key: 'scopeTruth', core: false, feature: null,
        problem: 'Verify my scope dials true',
        homeAction: { id: 'scope-check', icon: '📐', label: 'Verify scope tracking', run: 'scopeCheck' },
        rifleCards: ['scope-truth']
    }
    // Feature waves add entries here — never a new registry, never a nav tab.
};

// Onboarding answer → which tools wake up
var ToolPresets = {
    hunt: [],
    compete: ['chrono', 'scopeTruth'],
    handload: ['chrono'],
    all: ['chrono', 'scopeTruth']
};

// ── Pure core ─────────────────────────────────────────────────

var ToolsCore = {
    /**
     * Is this tool active for the user? Core tools always are.
     * activeMap: { toolKey: {active: bool, at: iso} }
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
     * Returns a NEW activeMap with the tool switched. Core tools cannot
     * be deactivated (they define the app's floor). Idempotent.
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
     * Apply a preset: activate every listed tool. Unknown keys ignored.
     */
    applyPreset: function (tools, activeMap, presetKeys, nowIso) {
        var map = activeMap;
        for (var i = 0; i < (presetKeys || []).length; i++) {
            var def = tools[presetKeys[i]];
            if (def) map = ToolsCore.setActive(def, map, true, nowIso);
        }
        return map;
    },

    /** Serialization contract for the user_settings row. */
    serialize: function (activeMap) {
        return { v: 1, tools: activeMap || {} };
    },
    hydrate: function (saved) {
        if (saved && saved.v === 1 && saved.tools) return saved.tools;
        return {};
    }
};

// ── Stateful registry ─────────────────────────────────────────

var ToolRegistry = (function () {
    var _db = null;
    var _active = {};       // hydrated activeMap
    var _listeners = [];

    function _hasFeatureSafe(name) {
        return typeof hasFeature === 'function' ? hasFeature(name) : false;
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
            }).catch(function () {
                _active = {};
            });
        },

        isActive: function (key) {
            return ToolsCore.isActive(TOOLS[key], _active);
        },

        isVisible: function (key) {
            return ToolsCore.visible(TOOLS[key], _active, _hasFeatureSafe);
        },

        activate: function (key) {
            _active = ToolsCore.setActive(TOOLS[key], _active, true);
            _notify();
            return _persist();
        },

        deactivate: function (key) {
            _active = ToolsCore.setActive(TOOLS[key], _active, false);
            _notify();
            return _persist();
        },

        applyPreset: function (presetKey) {
            _active = ToolsCore.applyPreset(TOOLS, _active, ToolPresets[presetKey] || []);
            _notify();
            return _persist();
        },

        /** Visible tools that add a Home action, registry order. */
        getHomeActions: function () {
            var out = [];
            for (var k in TOOLS) {
                if (!TOOLS.hasOwnProperty(k)) continue;
                if (TOOLS[k].homeAction && this.isVisible(k)) {
                    out.push(TOOLS[k]);
                }
            }
            return out;
        },

        /** Tier-eligible but not active — what the drawer offers. */
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
    module.exports = { TOOLS: TOOLS, ToolPresets: ToolPresets, ToolsCore: ToolsCore };
}
