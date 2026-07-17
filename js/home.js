/**
 * home.js — HomeManager: Home as a STATUS INSTRUMENT (Surface 1).
 *
 * Not a menu. Top to bottom (REDESIGN-SPEC III.1):
 *   HERO      — the last-used rifle with its readiness verdict as the
 *               dominant element (lamp + verdict word, one glance, one truth)
 *   ALERTS    — Budget-A attention strips; silence is a feature
 *   PRIMARY   — the ONE brass action (highest usage count)
 *   SECONDARY — remaining actions as a quiet, subordinate tile row
 *   BELOW     — recent activity + "+ Add a tool", whisper-quiet
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
 * Ships with zero providers — silence is a feature.
 */
HomeManager.prototype.registerAlertProvider = function (fn) {
    this._alertProviders.push(fn);
};

HomeManager.prototype.show = function () {
    if (!this.container) return;

    this.container.innerHTML =
        '<div class="screen">' +
        '<div class="zone-hero" id="home-hero"></div>' +
        '<div id="home-alerts"></div>' +
        '<div id="home-actions"></div>' +
        '<div class="zone-secondary" id="home-recent"></div>' +
        '<div id="home-drawer"></div>' +
        '</div>';

    var self = this;
    // The one-brass-object law: with no rifle yet, the hero's "set up my
    // rifle" is the screen's primary — every action demotes to a tile.
    this._renderHero().then(function (hasRifles) {
        self._renderActions(hasRifles !== false);
    });
    this._renderRecent();
    this._renderAlerts();
    this._renderDrawer();
};

/**
 * HERO — the shooter's situation at a glance. Most-recent rifle with
 * its readiness verdict dominant: one lamp, one word, one truth.
 */
HomeManager.prototype._renderHero = function () {
    var el = document.getElementById('home-hero');
    if (!el || !this.db) return Promise.resolve(true);
    var self = this;

    return this.db.getAllRifles().then(function (rifles) {
        if (!el.isConnected) return true;

        if (!rifles || !rifles.length) {
            // First run: teach in one sentence + one button
            el.innerHTML =
                '<div class="plate empty-teach">' +
                '<p>Your rifle is the hub everything lands on. Two minutes to set one up, and it answers instantly for life.</p>' +
                '<button class="action-primary" id="home-first-rifle">' + Icon('plus', 20) + ' Set up my rifle</button>' +
                '</div>';
            var btn = document.getElementById('home-first-rifle');
            if (btn) btn.addEventListener('click', function () {
                if (window.AppNav) window.AppNav.go('profiles');
            });
            return false; // no rifles: the hero owns the screen's primary
        }

        var recent = Recents.get();
        var rifle = null;
        if (recent && recent.rifleId) {
            for (var i = 0; i < rifles.length; i++) {
                if (rifles[i].id === recent.rifleId) { rifle = rifles[i]; break; }
            }
        }
        if (!rifle) rifle = rifles[0];

        // Verdict + evidence assemble from the rifle's own record
        return Promise.all([
            self.db.getSessionsByRifle(rifle.id).catch(function () { return []; }),
            self.db.getBarrelsByRifle(rifle.id).catch(function () { return []; })
        ]).then(function (res) {
            if (!el.isConnected) return;
            var sessions = (res[0] || []).slice().sort(function (a, b) {
                return (b.date || '').localeCompare(a.date || '');
            });
            var barrels = res[1] || [];
            var barrel = null;
            for (var b = 0; b < barrels.length; b++) {
                if (barrels[b].isActive) { barrel = barrels[b]; break; }
            }
            if (!barrel && barrels.length) barrel = barrels[0];

            // latest session that carries a POA verdict
            var latest = null;
            for (var s = 0; s < sessions.length; s++) {
                if (sessions[s].results && typeof sessions[s].results.atzElevationMOA === 'number') {
                    latest = sessions[s];
                    break;
                }
            }

            var verdict = null;
            if (latest && typeof ZeroGuardian !== 'undefined') {
                verdict = ZeroGuardian.verdictFor(latest.results, rifle.scopeCorrectionFactor);
            }

            var lampCls, wordCls, word, sub;
            var dateStr = latest && latest.date ? new Date(latest.date).toLocaleDateString() : '';
            if (verdict && verdict.confirmed) {
                lampCls = 'is-go'; wordCls = 'is-go'; word = 'READY';
                sub = 'Zero confirmed ' + dateStr;
            } else if (verdict) {
                lampCls = 'is-hold'; wordCls = 'is-hold'; word = 'CHECK ZERO';
                var parts = [];
                if (verdict.elevClicks > 0) parts.push(verdict.elevClicks + ' click' + (verdict.elevClicks === 1 ? '' : 's') + ' ' + verdict.elevDir.toUpperCase());
                if (verdict.windClicks > 0) parts.push(verdict.windClicks + ' click' + (verdict.windClicks === 1 ? '' : 's') + ' ' + verdict.windDir.toUpperCase());
                sub = parts.length
                    ? 'Adjust ' + parts.join(', ') + ' &mdash; last check ' + dateStr
                    : 'Almost there — confirm with one more group';
            } else {
                lampCls = 'is-off'; wordCls = 'is-off'; word = 'NOT CHECKED';
                sub = 'Photograph a target and yorT confirms your zero';
            }

            var meta = [];
            if (rifle.caliber) meta.push(self._escapeHtml(rifle.caliber));
            if (barrel && barrel.totalRounds) meta.push(Number(barrel.totalRounds).toLocaleString() + ' rounds');

            el.innerHTML =
                '<button class="plate plate-tap" id="home-hero-card">' +
                '<span class="instrument-label">Rifle</span>' +
                '<span class="t-title">' + self._escapeHtml(rifle.name || 'Rifle') + '</span>' +
                (meta.length ? '<span class="t-micro">' + meta.join(' &middot; ') + '</span>' : '') +
                '<div class="verdict u-mt-14">' +
                '<span class="verdict-lamp lamp-lg ' + lampCls + '"></span>' +
                '<div>' +
                '<div class="verdict-word ' + wordCls + '">' + word + '</div>' +
                '<div class="verdict-sub">' + sub + '</div>' +
                '</div></div>' +
                '</button>';

            var card = document.getElementById('home-hero-card');
            if (card) card.addEventListener('click', function () {
                if (window.AppNav) window.AppNav.openRifle(rifle.id);
            });
        });
    }).catch(function () { /* hero is best-effort; actions still render */ });
};

HomeManager.prototype._counts = function () {
    try {
        var raw = localStorage.getItem('yort_home_counts');
        return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
};

/**
 * ONE visually primary action (what they most likely came to do, from
 * usage data); the rest as a compact, subordinate tile row.
 */
HomeManager.prototype._renderActions = function (withPrimary) {
    var self = this;
    var el = document.getElementById('home-actions');
    if (!el || typeof ToolRegistry === 'undefined') return;

    var actions = HomeCore.orderActions(ToolRegistry.getHomeActions(), this._counts());
    if (!actions.length) return;

    var html = '';
    var rest;
    if (withPrimary === false) {
        rest = actions.map(function (t) { return t.homeAction; });
    } else {
        var primary = actions[0].homeAction;
        rest = actions.slice(1).map(function (t) { return t.homeAction; });
        html +=
            '<button class="action-primary" data-action-id="' + primary.id + '"' +
            (primary.view ? ' data-view="' + primary.view + '"' : '') +
            (primary.run ? ' data-run="' + primary.run + '"' : '') + '>' +
            Icon(primary.icon, 22) + '<span>' + primary.label + '</span>' +
            '</button>';
    }

    if (rest.length) {
        var cols = (rest.length === 2 || rest.length === 4) ? ' is-2' : '';
        html += '<div class="tile-row u-mt-10' + cols + '">';
        for (var i = 0; i < rest.length; i++) {
            html += '<button class="tile-action" data-action-id="' + rest[i].id + '"' +
                (rest[i].view ? ' data-view="' + rest[i].view + '"' : '') +
                (rest[i].run ? ' data-run="' + rest[i].run + '"' : '') + '>' +
                Icon(rest[i].icon, 22) + '<span>' + rest[i].label + '</span>' +
                '</button>';
        }
        html += '</div>';
    }
    el.innerHTML = html;

    var buttons = el.querySelectorAll('[data-action-id]');
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

/** RECENT — whisper-quiet, below the fold. */
HomeManager.prototype._renderRecent = function () {
    var el = document.getElementById('home-recent');
    if (!el) return;
    var self = this;
    var recent = Recents.get();
    if (!recent || !recent.sessionId || !this.db) return; // nothing yet — render nothing

    this.db.getSession(recent.sessionId).then(function (session) {
        if (!session || !el.isConnected) return;
        var bits = [];
        if (session.impacts && session.impacts.length) bits.push(session.impacts.length + '-shot group');
        if (session.results && session.results.groupSizeMOA != null) {
            bits.push(formatFixed(session.results.groupSizeMOA, 2) + ' MOA');
        }
        var when = session.date ? new Date(session.date).toLocaleDateString() : '';
        if (!bits.length) return;

        el.innerHTML =
            '<hr class="divider">' +
            '<div class="qcard-kicker">Recent</div>' +
            '<button class="action-ghost u-full drawer-tool" id="home-recent-session">' +
            '<span class="u-quiet">' + bits.join(' &middot; ') +
            (when ? ' <span class="t-micro">&mdash; ' + when + '</span>' : '') + '</span>' +
            Icon('chevron-right', 18) +
            '</button>';

        var row = document.getElementById('home-recent-session');
        if (row) row.addEventListener('click', function () {
            if (window.AppNav && recent.rifleId) window.AppNav.openRifle(recent.rifleId);
        });
    }).catch(function () { /* quiet */ });
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
            html += '<button class="alert-strip u-mb-12" data-alert-id="' + alerts[i].id + '">' +
                Icon('alert', 18) + '<span>' + alerts[i].text + '</span></button>';
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

/**
 * "+ Add a tool" — the tool drawer, phrased as user problems.
 * One tap wakes a dormant tool; hiding keeps all its data.
 */
HomeManager.prototype._renderDrawer = function () {
    var el = document.getElementById('home-drawer');
    if (!el || typeof ToolRegistry === 'undefined') return;

    var dormant = ToolRegistry.getDormant();
    var activeExtras = [];
    for (var k in TOOLS) {
        if (!TOOLS.hasOwnProperty(k)) continue;
        if (!TOOLS[k].core && ToolRegistry.isVisible(k)) activeExtras.push(TOOLS[k]);
    }
    if (!dormant.length && !activeExtras.length) return; // nothing to manage

    var html = '<details class="fold u-mt-14"><summary>' + Icon('plus', 18) + '&nbsp; Add a tool</summary>';
    html += '<div class="fold-body">';
    for (var d = 0; d < dormant.length; d++) {
        html += '<button class="action-ghost u-full drawer-tool" data-tool="' + dormant[d].key + '" data-on="1">' +
            '<span>' + dormant[d].problem + '</span>' +
            '<span class="chip">Add</span>' +
            '</button>';
    }
    for (var a = 0; a < activeExtras.length; a++) {
        html += '<button class="action-ghost u-full drawer-tool" data-tool="' + activeExtras[a].key + '" data-on="0">' +
            '<span>' + activeExtras[a].problem + '</span>' +
            '<span class="chip">Hide</span>' +
            '</button>';
    }
    html += '<p class="t-micro u-mt-10">Hiding a tool keeps all its data &mdash; it just leaves your way.</p>';
    html += '</div></details>';
    el.innerHTML = html;

    var buttons = el.querySelectorAll('.drawer-tool[data-tool]');
    for (var b = 0; b < buttons.length; b++) {
        buttons[b].addEventListener('click', function () {
            var key = this.getAttribute('data-tool');
            if (this.getAttribute('data-on') === '1') {
                ToolRegistry.activate(key);
            } else {
                ToolRegistry.deactivate(key);
            }
            // onChange listener re-renders Home (drawer open state resets —
            // acceptable; the changed action row is the feedback)
        });
    }
};

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HomeCore: HomeCore };
}
