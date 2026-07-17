/**
 * home.js — HomeManager: the action-first adaptive Home (Surface 1).
 *
 * Not a dashboard: a short stack of ACTION buttons phrased as user
 * intentions, sourced from ToolRegistry.getHomeActions(). Layout, top
 * to bottom: alerts slot (Budget-A, empty renders nothing) → actions
 * (adaptively ordered, Step 5) → Recent strip (Step 5) → "+ Add a tool"
 * drawer (Step 7).
 *
 * Pure ordering logic lives in HomeCore (Node-testable).
 */

// ── Pure core ─────────────────────────────────────────────────

var HomeCore = {
    /**
     * Stable sort: descending by usage count, ties keep given order.
     * counts: { actionId: n }
     */
    orderActions: function (actions, counts) {
        var indexed = actions.map(function (a, i) { return { a: a, i: i }; });
        indexed.sort(function (x, y) {
            var cx = (counts && counts[x.a.homeAction.id]) || 0;
            var cy = (counts && counts[y.a.homeAction.id]) || 0;
            if (cy !== cx) return cy - cx;
            return x.i - y.i; // stable
        });
        return indexed.map(function (e) { return e.a; });
    },

    /** New counts object with the id bumped (cap 999). Immutable. */
    bumpCount: function (counts, id) {
        var out = {};
        for (var k in counts) {
            if (counts.hasOwnProperty(k)) out[k] = counts[k];
        }
        out[id] = Math.min((out[id] || 0) + 1, 999);
        return out;
    }
};

// ── Recents (device-local, snapshot names per CLAUDE.md rule 7) ──

var Recents = {
    KEY: 'yort_recent',

    _read: function () {
        try {
            var raw = localStorage.getItem(Recents.KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    },

    _write: function (data) {
        try { localStorage.setItem(Recents.KEY, JSON.stringify(data)); } catch (e) { /* best effort */ }
    },

    touchRifle: function (rifle) {
        if (!rifle || !rifle.id) return;
        var cur = Recents._read() || {};
        cur.rifleId = rifle.id;
        cur.rifleName = rifle.name || 'Rifle';
        cur.ts = new Date().toISOString();
        Recents._write(cur);
    },

    touchSession: function (sessionId, rifle) {
        var cur = Recents._read() || {};
        cur.sessionId = sessionId;
        if (rifle && rifle.id) {
            cur.rifleId = rifle.id;
            cur.rifleName = rifle.name || 'Rifle';
        }
        cur.ts = new Date().toISOString();
        Recents._write(cur);
    },

    get: function () {
        return Recents._read();
    }
};

// ── Manager ───────────────────────────────────────────────────

function HomeManager(db) {
    this.db = db;
    this.container = null;
    this._alertProviders = [];
}

HomeManager.prototype.init = function () {
    var self = this;
    this.container = document.getElementById('view-home');
    if (typeof ToolRegistry !== 'undefined') {
        ToolRegistry.onChange(function () {
            // Re-render live when activations change (drawer taps)
            if (self.container && self.container.classList.contains('active')) {
                self.show();
            }
        });
    }
};

/**
 * Budget-A alerts: providers return Promise<[{id, text, onTap?}]>.
 * Foundation ships the slot with zero providers — silence is a feature.
 */
HomeManager.prototype.registerAlertProvider = function (fn) {
    this._alertProviders.push(fn);
};

HomeManager.prototype.show = function () {
    if (!this.container) return;
    var self = this;

    var html = '<div class="home-screen">';
    html += '<div id="home-alerts"></div>';
    html += '<div id="home-actions"></div>';
    html += '<div id="home-recent"></div>';
    html += '<div id="home-drawer"></div>';
    html += '</div>';
    this.container.innerHTML = html;

    this._renderActions();
    this._renderRecent();
    this._renderAlerts();
    this._renderDrawer();
};

/**
 * The tool drawer: dormant capabilities phrased as user problems.
 * One tap activates (Home action appears live via onChange); active
 * non-core tools can be put back to sleep — data always preserved.
 */
HomeManager.prototype._renderDrawer = function () {
    var self = this;
    var el = document.getElementById('home-drawer');
    if (!el || typeof ToolRegistry === 'undefined') return;

    var dormant = ToolRegistry.getDormant();
    var activeExtras = [];
    for (var k in TOOLS) {
        if (!TOOLS.hasOwnProperty(k)) continue;
        if (!TOOLS[k].core && ToolRegistry.isVisible(k)) activeExtras.push(TOOLS[k]);
    }
    if (!dormant.length && !activeExtras.length) return; // nothing to manage

    var html = '<details class="home-drawer"><summary>+ Add a tool</summary>';
    html += '<div class="home-drawer-body">';
    for (var d = 0; d < dormant.length; d++) {
        html += '<button class="home-drawer-tool" data-tool="' + dormant[d].key + '" data-on="1">' +
            '<span class="home-action-label">' + dormant[d].problem + '</span>' +
            '<span class="home-drawer-add">Add</span>' +
            '</button>';
    }
    for (var a = 0; a < activeExtras.length; a++) {
        html += '<button class="home-drawer-tool home-drawer-active" data-tool="' + activeExtras[a].key + '" data-on="0">' +
            '<span class="home-action-label">' + activeExtras[a].problem + '</span>' +
            '<span class="home-drawer-remove">Hide</span>' +
            '</button>';
    }
    html += '<p class="chrono-hint">Hiding a tool keeps all its data — it just leaves your way.</p>';
    html += '</div></details>';
    el.innerHTML = html;

    var buttons = el.querySelectorAll('.home-drawer-tool');
    for (var b = 0; b < buttons.length; b++) {
        buttons[b].addEventListener('click', function () {
            var key = this.getAttribute('data-tool');
            if (this.getAttribute('data-on') === '1') {
                ToolRegistry.activate(key);
            } else {
                ToolRegistry.deactivate(key);
            }
            // onChange listener re-renders Home (drawer stays open state
            // is reset — acceptable; the changed action is the feedback)
        });
    }
};

HomeManager.prototype._counts = function () {
    try {
        var raw = localStorage.getItem('yort_home_counts');
        return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
};

HomeManager.prototype._renderActions = function () {
    var self = this;
    var el = document.getElementById('home-actions');
    if (!el || typeof ToolRegistry === 'undefined') return;

    // Adaptive: the actions this user actually uses float to the top
    var actions = HomeCore.orderActions(ToolRegistry.getHomeActions(), this._counts());
    var html = '';
    for (var i = 0; i < actions.length; i++) {
        var a = actions[i].homeAction;
        html += '<button class="home-action" data-action-id="' + a.id + '"' +
            (a.view ? ' data-view="' + a.view + '"' : '') +
            (a.run ? ' data-run="' + a.run + '"' : '') + '>' +
            '<span class="home-action-icon">' + a.icon + '</span>' +
            '<span class="home-action-label">' + a.label + '</span>' +
            '</button>';
    }
    el.innerHTML = html;

    var buttons = el.querySelectorAll('.home-action');
    for (var b = 0; b < buttons.length; b++) {
        buttons[b].addEventListener('click', function () {
            var id = this.getAttribute('data-action-id');
            var view = this.getAttribute('data-view');
            var run = this.getAttribute('data-run');
            try {
                localStorage.setItem('yort_home_counts',
                    JSON.stringify(HomeCore.bumpCount(self._counts(), id)));
            } catch (e) { /* adaptivity is best-effort */ }
            if (run && window.ToolActions && window.ToolActions[run]) {
                window.ToolActions[run](self.db);
            } else if (view && window.AppNav) {
                window.AppNav.go(view);
            }
        });
    }
};

HomeManager.prototype._renderRecent = function () {
    var el = document.getElementById('home-recent');
    if (!el) return;
    var recent = Recents.get();
    if (!recent || !recent.rifleId) return; // nothing yet — render nothing

    el.innerHTML = '<div class="home-recent-label">Recent</div>' +
        '<button class="home-recent-card" id="home-recent-rifle">' +
        '<span class="home-action-icon">🔭</span>' +
        '<span class="home-action-label">' + this._escapeHtml(recent.rifleName) + '</span>' +
        '<span class="profile-card-arrow">&rsaquo;</span>' +
        '</button>';

    document.getElementById('home-recent-rifle').addEventListener('click', function () {
        if (window.AppNav) window.AppNav.openRifle(recent.rifleId);
    });
};

HomeManager.prototype._escapeHtml = function (text) {
    var div = document.createElement('div');
    div.textContent = text === null || text === undefined ? '' : String(text);
    return div.innerHTML;
};

HomeManager.prototype._renderAlerts = function () {
    var el = document.getElementById('home-alerts');
    if (!el || !this._alertProviders.length) return; // silence is a feature
    var self = this;
    Promise.all(this._alertProviders.map(function (fn) {
        return fn(self.db).catch(function () { return []; });
    })).then(function (lists) {
        var alerts = [];
        lists.forEach(function (l) { alerts = alerts.concat(l || []); });
        if (!alerts.length || !el.isConnected) return;
        var html = '';
        for (var i = 0; i < alerts.length; i++) {
            html += '<div class="home-alert" data-alert-id="' + alerts[i].id + '">' +
                alerts[i].text + '</div>';
        }
        el.innerHTML = html;
        var nodes = el.querySelectorAll('.home-alert');
        for (var n = 0; n < nodes.length; n++) {
            (function (node, alert) {
                if (alert.onTap) node.addEventListener('click', alert.onTap);
            })(nodes[n], alerts[n]);
        }
    });
};

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HomeCore: HomeCore };
}
