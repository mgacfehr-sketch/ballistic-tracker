/**
 * home.js — HomeManager: Home = the jobs (Contract v2.3 §1.2).
 *
 * Top to bottom:
 *   BRAND BAR  — W-dial mark + PROVEN wordmark
 *   THE JOBS   — "What are you doing?" as large rows, contract order
 *   + MORE TOOLS — quiet row; toggle any job on/off (hiding keeps data)
 *   RECENT     — last session/rifle row with its status chip
 *
 * NO ALERTS SECTION (removed per owner). Monitors speak inside
 * Data & Records and inline where contextually true (the lot question
 * can note "this lot ran 45 fps fast") — never as a Home feed.
 *
 * Jobs the user has off do not render (ToolRegistry). HomeCore (pure
 * ordering logic) and Recents are kept: HomeCore is Node-tested;
 * Recents feeds the rifle chip default and this screen.
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
}

HomeManager.prototype.init = function () {
    var self = this;
    this.container = document.getElementById('view-home');
    if (typeof ToolRegistry !== 'undefined') {
        ToolRegistry.onChange(function () {
            // Job visibility can change when activations change
            if (self.container && self.container.classList.contains('active') &&
                self.container.getAttribute('data-screen') === 'home') {
                self.show();
            }
        });
    }
};

HomeManager.prototype.show = function () {
    if (!this.container) return;
    this.container.setAttribute('data-screen', 'home');

    var html = UI.brandBar();
    html += UI.sectionHead('What are you doing?');
    html += '<div id="home-cats"></div>';
    html += '<div id="home-recent"></div>';
    this.container.innerHTML = '<div class="screen">' + html + '</div>';

    this._renderCategories();
    this._renderRecent();
};

/** The job rows (contract order); hidden when toolless. */
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
    el.innerHTML = html + this._moreToolsRowHtml();

    var rows = el.querySelectorAll('[data-cat]');
    for (var i = 0; i < rows.length; i++) {
        rows[i].addEventListener('click', function () {
            Categories.show(this.getAttribute('data-cat'));
        });
    }
    var more = document.getElementById('home-more-tools');
    if (more) more.addEventListener('click', function () { self._openMoreTools(); });
};

/** Quiet "+ More tools" row — shown whenever any job is toggleable. */
HomeManager.prototype._moreToolsRowHtml = function () {
    if (typeof ToolRegistry === 'undefined' || !ToolRegistry.getChecklist) return '';
    var list = ToolRegistry.getChecklist();
    if (!list.length) return '';
    return '<button class="rowlink u-full" id="home-more-tools" style="border:none;background:none">' +
        '<div class="txt"><span class="u-gold">＋ More tools</span></div></button>';
};

/** The job on/off surface (§1.3): toggling hides/shows, never deletes. */
HomeManager.prototype._openMoreTools = function () {
    var overlay = document.createElement('div');
    overlay.className = 'overlay';

    function rowsHtml() {
        var html = '';
        ToolRegistry.getChecklist().forEach(function (r) {
            html += '<button class="option-row' + (r.active ? ' on' : '') +
                '" data-more-job="' + r.key + '">' +
                '<span>' + UI.esc(r.label) +
                '<span class="choice-desc">' + UI.esc(r.desc) + '</span></span>' +
                '</button>';
        });
        return html;
    }

    overlay.innerHTML =
        '<div class="overlay-card">' +
        '<div class="overlay-title">Your jobs</div>' +
        '<p class="overlay-text">Checked jobs show on Home. Turning one off hides it — all its data stays.</p>' +
        '<div id="more-tools-rows">' + rowsHtml() + '</div>' +
        '<button class="btn u-full u-mt-10" id="more-tools-done">Done</button>' +
        '</div>';
    document.body.appendChild(overlay);

    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('#more-tools-done').addEventListener('click', close);

    overlay.querySelector('#more-tools-rows').addEventListener('click', function (e) {
        var row = e.target.closest ? e.target.closest('[data-more-job]') : null;
        if (!row) return;
        var key = row.getAttribute('data-more-job');
        var turningOn = !row.classList.contains('on');
        row.classList.toggle('on', turningOn);
        if (turningOn) ToolRegistry.activate(key);
        else ToolRegistry.deactivate(key);
        // Home re-renders via ToolRegistry.onChange
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
