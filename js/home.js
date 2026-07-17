/**
 * home.js — HomeManager: the action-first Home (Proven §3.1).
 *
 * Top to bottom:
 *   BRAND BAR  — W-dial mark + PROVEN wordmark
 *   ALERTS     — one-sentence monitors; render ONLY when true
 *   THE FIVE JOB CATEGORIES — "What do you want to do?" as large rows
 *   RECENT     — last session/rifle rows with status chips
 *
 * The old adaptive per-tool actions and the "+ Add a tool" drawer are
 * gone: tool activation (ToolRegistry) now governs which rows appear
 * INSIDE each category screen (js/categories.js). A category with
 * zero active tools is hidden here.
 *
 * HomeCore (pure ordering logic) and Recents are kept: HomeCore is
 * Node-tested; Recents feeds the rifle chip default and this screen.
 */

// ── Pure core (kept for tests + usage counting) ───────────────

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
            // Category visibility can change when activations change
            if (self.container && self.container.classList.contains('active') &&
                self.container.getAttribute('data-screen') === 'home') {
                self.show();
            }
        });
    }
    this._registerBuiltinAlerts();
};

/**
 * Alerts: providers return Promise<[{id, text, onTap?}]>.
 * Silence is a feature — nothing renders when nothing is true.
 */
HomeManager.prototype.registerAlertProvider = function (fn) {
    this._alertProviders.push(fn);
};

/** The lot-drift monitor feeds Home alerts (mockup's example alert). */
HomeManager.prototype._registerBuiltinAlerts = function () {
    var self = this;
    this.registerAlertProvider(function (db) {
        if (!db || typeof lotDrift !== 'function') return Promise.resolve([]);
        return Promise.all([db.getAllRifles(), db.getAllVelocityStrings()]).then(function (res) {
            var rifles = res[0] || [];
            var strings = res[1] || [];
            var byRifle = {};
            strings.forEach(function (s) {
                if (!s.rifleId) return;
                (byRifle[s.rifleId] = byRifle[s.rifleId] || []).push(s);
            });
            var alerts = [];
            rifles.forEach(function (rifle) {
                var drifts = lotDrift(byRifle[rifle.id] || []);
                drifts.forEach(function (a, i) {
                    alerts.push({
                        id: 'lot-drift-' + rifle.id + '-' + i,
                        text: 'New lot ' + a.newLot + ' on ' + (rifle.name || 'a rifle') + ' runs ' +
                            Math.abs(a.deltaFps) + ' fps ' + (a.deltaFps > 0 ? 'faster' : 'slower') +
                            ' — confirm zero.',
                        onTap: function () {
                            if (window.Categories) Categories.show('check', rifle.id);
                        }
                    });
                });
            });
            return alerts;
        }).catch(function () { return []; });
    });
};

HomeManager.prototype.show = function () {
    if (!this.container) return;
    this.container.setAttribute('data-screen', 'home');

    var html = UI.brandBar();
    html += '<div id="home-alerts"></div>';
    html += UI.sectionHead('What do you want to do?');
    html += '<div id="home-cats"></div>';
    html += '<div id="home-recent"></div>';
    this.container.innerHTML = '<div class="screen">' + html + '</div>';

    this._renderCategories();
    this._renderAlerts();
    this._renderRecent();
};

/** The five job categories as large rows; hidden when toolless. */
HomeManager.prototype._renderCategories = function () {
    var el = document.getElementById('home-cats');
    if (!el || typeof Categories === 'undefined') return;
    var self = this;

    var html = '';
    Categories.KEYS.forEach(function (key) {
        var def = Categories.DEFS[key];
        if (!Categories.hasActiveTools(key)) return; // zero active tools → hidden
        html += UI.catRow({
            icon: def.icon,
            title: def.title,
            desc: def.desc,
            data: { cat: key }
        });
    });
    el.innerHTML = html;

    var rows = el.querySelectorAll('[data-cat]');
    for (var i = 0; i < rows.length; i++) {
        rows[i].addEventListener('click', function () {
            Categories.show(this.getAttribute('data-cat'));
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
        var html = UI.sectionHead('Alerts');
        for (var i = 0; i < alerts.length; i++) {
            html += '<button class="alert-strip' + (i > 0 ? ' u-mt-10' : '') +
                '" data-alert-id="' + UI.esc(alerts[i].id) + '">' +
                '<span>' + UI.esc(alerts[i].text) + '</span></button>';
        }
        el.innerHTML = html;
        var nodes = el.querySelectorAll('.alert-strip');
        for (var n = 0; n < nodes.length; n++) {
            (function (node, alert) {
                if (alert.onTap) node.addEventListener('click', alert.onTap);
            })(nodes[n], alerts[n]);
        }
    });
};

/** RECENT — the last session's rifle with its status chip. */
HomeManager.prototype._renderRecent = function () {
    var el = document.getElementById('home-recent');
    if (!el || !this.db) return;
    var self = this;
    var recent = Recents.get();
    if (!recent || !recent.rifleId) return; // nothing yet — render nothing

    Promise.all([
        this.db.getRifle(recent.rifleId).catch(function () { return null; }),
        recent.sessionId ? this.db.getSession(recent.sessionId).catch(function () { return null; }) : Promise.resolve(null)
    ]).then(function (res) {
        var rifle = res[0];
        var session = res[1];
        if (!rifle || !el.isConnected) return;

        return Readiness.assess(self.db, rifle).then(function (r) {
            if (!el.isConnected) return;
            var bits = [];
            if (session && session.results && session.results.groupSizeMOA != null) {
                bits.push(formatFixed(session.results.groupSizeMOA, 2) + ' MOA');
            }
            if (session && session.impacts && session.impacts.length) {
                bits.push(session.impacts.length + ' shots');
            }
            var when = session && session.date ? new Date(session.date).toLocaleDateString() : '';
            if (when) bits.push(when);

            var title = rifle.name || 'Rifle';
            if (rifle.caliber) title += ' · ' + rifle.caliber;

            el.innerHTML = UI.sectionHead('Recent') + UI.card(
                UI.rowlink({
                    button: true,
                    id: 'home-recent-row',
                    title: title,
                    sub: bits.length ? bits.join(' · ') : r.note,
                    chip: r.chip
                })
            );
            var row = document.getElementById('home-recent-row');
            if (row) row.addEventListener('click', function () {
                if (window.AppNav) window.AppNav.openRifle(rifle.id);
            });
        });
    }).catch(function () { /* quiet */ });
};

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HomeCore: HomeCore };
}
