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
    this._renderAlerts();
};

HomeManager.prototype._renderActions = function () {
    var self = this;
    var el = document.getElementById('home-actions');
    if (!el || typeof ToolRegistry === 'undefined') return;

    var actions = ToolRegistry.getHomeActions();
    var html = '';
    for (var i = 0; i < actions.length; i++) {
        var a = actions[i].homeAction;
        html += '<button class="home-action" data-action-id="' + a.id +
            '" data-view="' + a.view + '">' +
            '<span class="home-action-icon">' + a.icon + '</span>' +
            '<span class="home-action-label">' + a.label + '</span>' +
            '</button>';
    }
    el.innerHTML = html;

    var buttons = el.querySelectorAll('.home-action');
    for (var b = 0; b < buttons.length; b++) {
        buttons[b].addEventListener('click', function () {
            var view = this.getAttribute('data-view');
            if (window.AppNav) window.AppNav.go(view);
        });
    }
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
