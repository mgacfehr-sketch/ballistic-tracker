/**
 * home.js — HomeManager: Home = THE RIFLE CARD (Contract v2.4 §1.1).
 *
 * Top to bottom:
 *   BRAND BAR   — W-dial mark + PROVEN wordmark
 *   THE CARD    — last-used rifle (swipe/arrows between rifles):
 *                 name + load line · "PROVEN TO ___ YARDS" (the app's
 *                 most prominent number, from the Calibration Status
 *                 rollup) · confidence word · 4-segment strip (Zero ·
 *                 MV · Trued · Tracking, tap → what/why sheet) ·
 *                 THE NEXT ACTION (one button, payoff stated, quiet
 *                 "Not now" for 7 days)
 *   THE DOORS   — Range Session · Steel/Field · Ballistics · Data &
 *                 Records as compact rows (demoted; the card is the
 *                 hero) + the quiet "More tools" toggle surface
 *   RECENT      — last session/rifle row with its status chip
 *
 * "Proven to 0 yards · Estimated" is a valid, honest, motivating
 * state — never dressed up. Truing and Scope Tracking have no doors
 * (§1.3): they are offered by the next action, the card's segments,
 * steel-session save, and the Ballistics utility.
 *
 * HomeCore (pure ordering logic, Node-tested) and Recents are kept:
 * Recents feeds the rifle chip default, this card's start index, and
 * the Recent strip.
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
    this.managers = null;   // { profile, history } — set by app.js after init
    this._rifles = [];
    this._cardIndex = 0;
}

/** The four doors (v2.4 §1.3) — truing/scopetrack have none. */
HomeManager.DOOR_KEYS = ['range', 'steel', 'ballistics', 'records'];

/** user_settings key: { [rifleId]: { [suggestionId]: dismissedAtIso } } */
HomeManager.DISMISS_KEY = 'next_action_dismissals';

HomeManager.prototype.init = function () {
    var self = this;
    this.container = document.getElementById('view-home');
    if (typeof ToolRegistry !== 'undefined') {
        ToolRegistry.onChange(function () {
            // Door visibility can change when activations change
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
    html += '<div id="home-card"></div>';
    html += '<div id="home-doors"></div>';
    html += '<div id="home-recent"></div>';
    this.container.innerHTML = '<div class="screen">' + html + '</div>';

    this._renderCard();
    this._renderDoors();
    this._renderRecent();
};

/* ══════════════ THE RIFLE CARD ══════════════ */

HomeManager.prototype._renderCard = function () {
    var el = document.getElementById('home-card');
    if (!el || !this.db) return;
    var self = this;

    this.db.getAllRifles().catch(function () { return []; }).then(function (rifles) {
        if (!el.isConnected) return;
        self._rifles = rifles || [];
        if (!self._rifles.length) {
            self._renderNoRifleCard(el);
            return;
        }
        var recent = Recents.get();
        var idx = 0;
        self._rifles.forEach(function (r, i) {
            if (recent && r.id === recent.rifleId) idx = i;
        });
        self._cardIndex = Math.min(idx, self._rifles.length - 1);
        self._renderCardAt(el);
    });
};

/** No rifles yet: the 90-seconds-to-payoff invite (§1.5). */
HomeManager.prototype._renderNoRifleCard = function (el) {
    el.innerHTML =
        '<div class="rifle-card">' +
        '<div class="rc-meter">' +
        '<div class="rc-meter-label">Proven to</div>' +
        '<div class="rc-meter-value">0<span class="rc-meter-unit">yards</span></div>' +
        '<div class="rc-meter-conf">No rifle yet</div>' +
        '</div>' +
        '<button class="rc-action" id="rc-add-rifle">' +
        '<b>Add your rifle</b>' +
        '<span class="rc-detail">Name and cartridge — the rest can wait.</span>' +
        '<span class="rc-payoff">90 seconds to your first DOPE card.</span>' +
        '</button>' +
        '</div>';
    var btn = document.getElementById('rc-add-rifle');
    var self = this;
    if (btn) btn.addEventListener('click', function () {
        if (typeof FirstRifleFlow !== 'undefined' && FirstRifleFlow.start) {
            FirstRifleFlow.start(self.db);
        } else if (window.AppNav) {
            AppNav.go('profiles');
        }
    });
};

HomeManager.prototype._renderCardAt = function (el) {
    var self = this;
    var rifle = this._rifles[this._cardIndex];
    var many = this._rifles.length > 1;

    var dots = '';
    if (many) {
        dots = '<div class="rc-dots">';
        this._rifles.forEach(function (r, i) {
            dots += '<i' + (i === self._cardIndex ? ' class="on"' : '') + '></i>';
        });
        dots += '</div>';
    }

    el.innerHTML =
        '<div class="rifle-card" id="rc-card">' +
        '<div class="rc-top">' +
        (many ? '<button class="rc-arrow" id="rc-prev" aria-label="Previous rifle">&lsaquo;</button>' : '<span class="rc-arrow"></span>') +
        '<div class="rc-title"><b>' + UI.esc(rifle.name || 'Rifle') + '</b>' +
        '<span id="rc-loadline">' + UI.esc(rifle.caliber || '') + '</span></div>' +
        (many ? '<button class="rc-arrow" id="rc-next" aria-label="Next rifle">&rsaquo;</button>' : '<span class="rc-arrow"></span>') +
        '</div>' +
        '<div class="rc-meter">' +
        '<div class="rc-meter-label">Proven to</div>' +
        '<div class="rc-meter-value" id="rc-yards">&mdash;<span class="rc-meter-unit">yards</span></div>' +
        '<div class="rc-meter-conf" id="rc-conf">&nbsp;</div>' +
        '</div>' +
        '<div class="rc-strip" id="rc-strip">' +
        this._segBtn('zero', 'Zero', null) +
        this._segBtn('mv', 'MV', null) +
        this._segBtn('trued', 'Trued', null) +
        this._segBtn('tracking', 'Tracking', null) +
        '</div>' +
        '<div id="rc-action-slot"></div>' +
        dots +
        '</div>';

    this._bindCardNav(el);

    // Async: status → meter + strip + load line + next action
    if (typeof CalibrationStatusCard === 'undefined' || !CalibrationStatusCard) return;
    CalibrationStatusCard.gather(this.db, rifle).then(function (g) {
        if (!el.isConnected || self._rifles[self._cardIndex] !== rifle) return;
        self._fillCard(el, rifle, g);
    }).catch(function () { /* offline with no cache — the skeleton stands */ });
};

HomeManager.prototype._segBtn = function (key, label, cls) {
    return '<button data-seg="' + key + '"' + (cls ? ' class="' + cls + '"' : '') + '>' +
        '<span class="seg-bar"></span>' + label + '</button>';
};

/** Segment fill state from the status element (§2.10 vocabulary). */
HomeManager.prototype._segClass = function (key, status) {
    var st = status[key] ? status[key].state : null;
    var on = { confirmed: 1, measured: 1, mv: 1, drag: 1, verified: 1 };
    var warn = { thin: 1, stale: 1, drifted: 1, adjust: 1 };
    if (status[key] && status[key].flagged) return 'warn';
    if (on[st]) return 'on';
    if (warn[st]) return 'on warn';
    return null;
};

HomeManager.prototype._fillCard = function (el, rifle, g) {
    var self = this;
    var status = g.status;

    // load line: cartridge · load name · velocity basis
    var bits = [];
    if (rifle.caliber) bits.push(rifle.caliber);
    if (g.load && g.load.name) bits.push(g.load.name);
    var loadline = document.getElementById('rc-loadline');
    if (loadline) loadline.textContent = bits.join(' · ');

    // THE METER — honest, never dressed up
    var yd = status.rollup.calibratedToYd || 0;
    var yards = document.getElementById('rc-yards');
    if (yards) {
        yards.innerHTML = UI.esc(Number(yd).toLocaleString()) +
            '<span class="rc-meter-unit">yards</span>';
    }
    var conf = document.getElementById('rc-conf');
    if (conf) {
        conf.textContent = yd ? status.rollup.chip.text : 'Estimated';
    }

    // the strip
    var strip = document.getElementById('rc-strip');
    if (strip) {
        ['zero', 'mv', 'trued', 'tracking'].forEach(function (key) {
            var btn = strip.querySelector('[data-seg="' + key + '"]');
            if (!btn) return;
            var cls = self._segClass(key, status);
            btn.className = cls || '';
            btn.innerHTML = '<span class="seg-bar"></span>' +
                (key === 'mv' ? 'MV' : key.charAt(0).toUpperCase() + key.slice(1));
        });
        strip.addEventListener('click', function (e) {
            var btn = e.target.closest ? e.target.closest('[data-seg]') : null;
            if (!btn) return;
            self._openSegmentSheet(btn.getAttribute('data-seg'), rifle, status);
        });
    }

    // THE NEXT ACTION
    this._computeNextAction(rifle, g).then(function (res) {
        if (!el.isConnected || self._rifles[self._cardIndex] !== rifle) return;
        self._renderNextAction(rifle, res.na, res.ctx);
    });
};

/** Segment tap → the existing what/why sheet + its deep link (§1.1/§1.3). */
HomeManager.prototype._openSegmentSheet = function (key, rifle, status) {
    if (typeof CalibrationStatusCard === 'undefined' || !CalibrationStatusCard ||
        !CalibrationStatusCard.openSheet || !status[key]) return;
    var self = this;
    var ACTIONS = {
        zero: { label: 'Confirm zero', type: 'rangeSession' },
        mv: { label: 'Add bullet speed', type: 'chrono' },
        trued: { label: 'True this rifle', type: 'truing' },
        tracking: { label: 'Verify tracking', type: 'scopeCheck' }
    };
    var a = ACTIONS[key];
    CalibrationStatusCard.openSheet(key, status[key], {
        actionLabel: a.label,
        onAction: function () { self._launch(a.type, rifle, {}); }
    });
};

/* ── the next-action pipeline (engine is pure; this gathers) ── */

HomeManager.prototype._computeNextAction = function (rifle, g) {
    var self = this;
    var db = this.db;
    var status = g.status;

    var hasLoad = (g.loads || []).some(function (l) { return l && l.bulletBC; });

    // MV-truing prescription (payoff distance) — solver math, guarded
    var mvTrueYd = null;
    if (g.load && g.load.bulletBC && (g.load.muzzleVelocity || g.load.truedMv) &&
        typeof prescribeTruingDistances === 'function') {
        try {
            var rx = prescribeTruingDistances({
                muzzleVelocity: g.load.truedMv || g.load.muzzleVelocity,
                bc: g.load.truedBc || g.load.bulletBC,
                dragModel: g.load.dragModel || 'G7',
                bulletWeight: g.load.bulletWeight || 140,
                zeroRange: rifle.zeroRange || 100,
                scopeHeight: rifle.scopeHeight || 1.5
            }, { tempF: null, pressureInHg: null, humidity: null, source: 'default' });
            mvTrueYd = rx.mvTrueYd;
        } catch (e) { /* unsolvable profile — payoff falls back to words */ }
    }

    // distance strings: only needed when untrued (bounded: 5 strings)
    var pStrings = Promise.resolve([]);
    if (status.trued && status.trued.state === 'untrued' && db.getSteelStringsByRifle) {
        pStrings = db.getSteelStringsByRifle(rifle.id).catch(function () { return []; })
            .then(function (strings) {
                var full = (strings || []).filter(function (s) { return s.tier === 'full'; }).slice(0, 5);
                return Promise.all(full.map(function (st) {
                    return db.getSteelShotsByString(st.id).catch(function () { return []; })
                        .then(function (shots) {
                            return { distanceYd: st.distanceYd, shotCount: (shots || []).length };
                        });
                }));
            })
            .then(function (list) {
                return list.filter(function (s) { return s.shotCount >= 3; });
            });
    }

    // cleaning nudge input
    var pRounds = db.getBarrelsByRifle(rifle.id).catch(function () { return []; })
        .then(function (barrels) {
            var active = null;
            (barrels || []).forEach(function (b) { if (!active && b.isActive) active = b; });
            if (!active && barrels && barrels.length) active = barrels[0];
            if (!active) return { since: null, barrelId: null };
            return db.getCleaningLogsByBarrel(active.id).catch(function () { return []; })
                .then(function (logs) {
                    var total = active.totalRounds || 0;
                    var since = total;
                    var latest = null;
                    (logs || []).forEach(function (l) {
                        if (!latest || (l.date || '') > (latest.date || '')) latest = l;
                    });
                    if (latest) since = Math.max(0, total - (latest.roundCountAtCleaning || 0));
                    return { since: since, barrelId: active.id };
                });
        });

    var pDismiss = db.getUserSetting(HomeManager.DISMISS_KEY).catch(function () { return null; });

    return Promise.all([pStrings, pRounds, pDismiss]).then(function (res) {
        var dismissAll = res[2] || {};
        var na = deriveNextAction({
            now: new Date().toISOString(),
            status: status,
            hasLoad: hasLoad,
            mvTrueYd: mvTrueYd,
            distanceStrings: res[0],
            roundsSinceCleaning: res[1].since,
            dismissals: dismissAll[rifle.id] || {}
        });
        return { na: na, ctx: { barrelId: res[1].barrelId, dismissAll: dismissAll } };
    });
};

HomeManager.prototype._renderNextAction = function (rifle, na, ctx) {
    var slot = document.getElementById('rc-action-slot');
    if (!slot) return;
    var self = this;

    if (na.action.type === 'none') {
        slot.innerHTML = '<div class="rc-action" style="text-align:center;cursor:default">' +
            '<b>' + UI.esc(na.title) + '</b></div>';
        return;
    }

    slot.innerHTML =
        '<button class="rc-action" id="rc-action">' +
        '<b>' + UI.esc(na.title) + '</b>' +
        (na.detail ? '<span class="rc-detail">' + UI.esc(na.detail) + '</span>' : '') +
        (na.payoff ? '<span class="rc-payoff">' + UI.esc(na.payoff) + '</span>' : '') +
        '</button>' +
        (na.dismissible ? '<button class="rc-notnow" id="rc-notnow">Not now</button>' : '');

    var btn = document.getElementById('rc-action');
    if (btn) btn.addEventListener('click', function () {
        self._launch(na.action.type, rifle, ctx);
    });
    var notnow = document.getElementById('rc-notnow');
    if (notnow) notnow.addEventListener('click', function () {
        var all = ctx.dismissAll || {};
        var mine = withNextActionDismissal(all[rifle.id] || {}, na.id, new Date().toISOString());
        var next = {};
        for (var k in all) { if (all.hasOwnProperty(k)) next[k] = all[k]; }
        next[rifle.id] = mine;
        self.db.setUserSetting(HomeManager.DISMISS_KEY, next)
            .catch(function () { /* cached locally */ })
            .then(function () { self._renderCard(); });
    });
};

/** Deep-link the suggestion straight into its flow, pre-scoped (§1.1). */
HomeManager.prototype._launch = function (type, rifle, ctx) {
    var self = this;
    var m = this.managers || {};
    switch (type) {
        case 'addLoad':
            if (m.profile) {
                if (window.AppNav) AppNav.go('profiles');
                m.profile.showLoadForm(rifle.id, null);
            } else if (window.AppNav) AppNav.openRifle(rifle.id);
            break;
        case 'rangeSession':
            if (window.SessionLaunch) SessionLaunch.start({ rifleId: rifle.id });
            else if (window.AppNav) AppNav.go('session');
            break;
        case 'chrono':
            // v2.5 §2.5: never import-gated — type it in is the primary
            if (typeof MvEntry !== 'undefined') {
                MvEntry.open(this.db, rifle, { onDone: function (saved) { if (saved) self.show(); } });
            } else if (window.AppNav) AppNav.go('chrono');
            break;
        case 'truing':
            if (window.ToolActions && ToolActions.truing) ToolActions.truing(this.db, rifle.id);
            break;
        case 'steelSession':
            if (window.ToolActions && ToolActions.steelSession) ToolActions.steelSession(this.db, rifle.id);
            break;
        case 'scopeCheck':
            if (typeof ScopeCheck !== 'undefined') {
                ScopeCheck.start(this.db, function () { self.show(); });
            }
            break;
        case 'cleaningLog':
            if (m.history && ctx && ctx.barrelId) {
                if (window.AppNav) AppNav.go('profiles');
                m.history.showCleaningLog(rifle.id, ctx.barrelId);
            } else if (window.AppNav) {
                AppNav.openCategory('records', rifle.id);
            }
            break;
    }
};

/* ── card navigation: arrows + swipe ─────────────────────── */

HomeManager.prototype._bindCardNav = function (el) {
    var self = this;
    var prev = document.getElementById('rc-prev');
    var next = document.getElementById('rc-next');
    function go(delta) {
        var n = self._rifles.length;
        if (!n) return;
        self._cardIndex = (self._cardIndex + delta + n) % n;
        Recents.touchRifle(self._rifles[self._cardIndex]); // the card IS last-used
        self._renderCardAt(el);
    }
    if (prev) prev.addEventListener('click', function () { go(-1); });
    if (next) next.addEventListener('click', function () { go(1); });

    var card = document.getElementById('rc-card');
    if (!card || this._rifles.length < 2) return;
    var x0 = null, y0 = null;
    card.addEventListener('touchstart', function (e) {
        if (e.touches && e.touches.length === 1) {
            x0 = e.touches[0].clientX;
            y0 = e.touches[0].clientY;
        }
    }, { passive: true });
    card.addEventListener('touchend', function (e) {
        if (x0 === null || !e.changedTouches || !e.changedTouches.length) return;
        var dx = e.changedTouches[0].clientX - x0;
        var dy = e.changedTouches[0].clientY - y0;
        x0 = y0 = null;
        if (Math.abs(dx) > 48 && Math.abs(dx) > 2 * Math.abs(dy)) {
            go(dx < 0 ? 1 : -1);
        }
    }, { passive: true });
};

/* ══════════════ THE DOORS ══════════════ */

HomeManager.prototype._renderDoors = function () {
    var el = document.getElementById('home-doors');
    if (!el || typeof Categories === 'undefined') return;
    var self = this;

    var html = '';
    HomeManager.DOOR_KEYS.forEach(function (key) {
        var def = Categories.DEFS[key];
        if (!def) return;
        if (!Categories.hasActiveTools(key)) return; // hidden door — data stays
        html += '<button class="door" data-cat="' + key + '">' +
            '<span class="ic">' + Icon(def.icon, 20) + '</span>' +
            '<b>' + UI.esc(def.title) + '</b>' +
            '<span class="chev">&rsaquo;</span></button>';
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

/** Quiet "+ More tools" row — shown whenever any door is toggleable. */
HomeManager.prototype._moreToolsRowHtml = function () {
    if (typeof ToolRegistry === 'undefined' || !ToolRegistry.getChecklist) return '';
    var list = ToolRegistry.getChecklist();
    if (!list.length) return '';
    return '<button class="rowlink u-full" id="home-more-tools" style="border:none;background:none">' +
        '<div class="txt"><span class="u-gold">＋ More tools</span></div></button>';
};

/** The door on/off surface (§1.3): toggling hides/shows, never deletes. */
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

    // v2.5 §1.1: THE lane switch lives here
    var detailedOn = typeof Lanes !== 'undefined' && Lanes.isDetailed();
    var laneRow =
        '<button class="option-row' + (detailedOn ? ' on' : '') + '" id="more-tools-lane">' +
        '<span>Detailed mode' +
        '<span class="choice-desc">Per-shot logging, wind, full truing controls</span></span>' +
        '</button>';

    overlay.innerHTML =
        '<div class="overlay-card">' +
        '<div class="overlay-title">Your doors</div>' +
        '<p class="overlay-text">Checked doors show on Home. Turning one off hides it — all its data stays.</p>' +
        '<div id="more-tools-rows">' + rowsHtml() + '</div>' +
        laneRow +
        '<button class="btn u-full u-mt-10" id="more-tools-done">Done</button>' +
        '</div>';
    document.body.appendChild(overlay);

    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('#more-tools-done').addEventListener('click', close);

    var laneBtn = overlay.querySelector('#more-tools-lane');
    if (laneBtn) laneBtn.addEventListener('click', function () {
        var next = !laneBtn.classList.contains('on');
        laneBtn.classList.toggle('on', next);
        if (typeof Lanes !== 'undefined') Lanes.setDetailed(next);
        // Home re-renders via Lanes.onChange
    });

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

/* ══════════════ RECENT ══════════════ */

/** RECENT — the last session's rifle with its status chip. */
HomeManager.prototype._renderRecent = function () {
    var el = document.getElementById('home-recent');
    if (!el || !this.db) return;
    var self = this;
    var recent = Recents.get();
    if (!recent || !recent.rifleId || !recent.sessionId) return; // nothing yet

    Promise.all([
        this.db.getRifle(recent.rifleId).catch(function () { return null; }),
        this.db.getSession(recent.sessionId).catch(function () { return null; })
    ]).then(function (res) {
        var rifle = res[0];
        var session = res[1];
        if (!rifle || !session || !el.isConnected) return;

        return Readiness.assess(self.db, rifle).then(function (r) {
            if (!el.isConnected) return;
            var bits = [];
            if (session.results && session.results.groupSizeMOA != null) {
                bits.push(formatFixed(session.results.groupSizeMOA, 2) + ' MOA');
            }
            if (session.impacts && session.impacts.length) {
                bits.push(session.impacts.length + ' shots');
            }
            var when = session.date ? new Date(session.date).toLocaleDateString() : '';
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
