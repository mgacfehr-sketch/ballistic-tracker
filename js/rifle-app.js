/**
 * rifle-app.js — RifleApp: THE RIFLE, the app's only resting screen
 * (Contract v3.0 Part 1). Replaces Home, the Rifles tab, the rifle
 * page, Data & Records, and Ballistics as top-level surfaces.
 *
 * Owns views 1 (the rifle), 2 (add chooser), 3b (steel, simple),
 * 3c (chrono), 4 (payoff), 5 (why), 6 (full chart), 7 (record) as
 * sibling screens rendered into #view-home, one at a time — the
 * established manager pattern (Categories, TruingJob, SteelSession):
 * a single mutable container, re-rendered per screen, not a DOM tree
 * of hidden/shown nodes. View 3a (paper capture) reuses SessionFlow
 * via SessionLaunch.start(); view 8 (paperwork) reuses
 * ProfileManager.showRifleDetail() via AppNav.openRifle().
 *
 * THE TEST FOR EVERY SCREEN: could Roy, handed the phone cold, add
 * what he shot today without asking anyone?
 */

function RifleApp(db) {
    this.db = db;
    this.container = null;
    this._rifles = [];
    this._cardIndex = 0;
}

RifleApp.prototype.init = function () {
    this.container = document.getElementById('view-home');
    // v3.0 §3.3: sync visibility must survive the rebuild — the old
    // "N saves waiting to sync" banner only ever rendered inside the
    // now-unreached Categories screens. One listener for the app's
    // lifetime (not per-render, else swiping between rifles would pile
    // up listeners); it just repaints whatever #rf-sync currently is.
    if (typeof SyncQueue !== 'undefined' && SyncQueue && SyncQueue.onChange) {
        SyncQueue.onChange(function () {
            var el = document.getElementById('rf-sync');
            if (el) SyncQueue.renderStatus(el);
        });
    }
};

/** THE RIFLE — the only resting screen. */
RifleApp.prototype.show = function (rifleId) {
    if (!this.container) return;
    var self = this;
    this.container.setAttribute('data-screen', 'v3-rifle');

    this.db.getAllRifles().catch(function () { return []; }).then(function (rifles) {
        self._rifles = rifles || [];
        if (!self._rifles.length) {
            self._renderNoRifle();
            return;
        }
        if (rifleId) {
            self._rifles.forEach(function (r, i) { if (r.id === rifleId) self._cardIndex = i; });
        } else if (typeof Recents !== 'undefined') {
            var recent = Recents.get();
            if (recent && recent.rifleId) {
                self._rifles.forEach(function (r, i) { if (r.id === recent.rifleId) self._cardIndex = i; });
            }
        }
        if (self._cardIndex >= self._rifles.length) self._cardIndex = 0;
        self._renderRifle();
    });
};

RifleApp.prototype._currentRifle = function () {
    return this._rifles[this._cardIndex] || null;
};

/** No rifles yet — the 90-second-to-payoff invite (unchanged from v2.4). */
RifleApp.prototype._renderNoRifle = function () {
    // v3.0: no per-screen brand line — #app-header already shows PROVEN.
    // above every view; a second one here would duplicate it.
    var html = '<div class="screen" style="padding-top:var(--space-lg)">' +
        '<div class="v3-numberbox"><div class="lbl">PROVEN TO</div>' +
        '<div class="num">0<em>yd</em></div><div class="conf">No rifle yet</div></div>' +
        '<button class="v3-gold" id="rf-add-rifle">＋&nbsp;&nbsp;Add your rifle</button>' +
        '</div>';
    this.container.innerHTML = html;
    var btn = document.getElementById('rf-add-rifle');
    var self = this;
    if (btn) btn.addEventListener('click', function () {
        if (typeof FirstRifleFlow !== 'undefined') FirstRifleFlow.start(self.db);
        else if (window.AppNav) AppNav.go('profiles');
    });
};

RifleApp.prototype._renderRifle = function () {
    var self = this;
    var rifle = this._currentRifle();

    var html = '<div class="screen" style="padding-top:var(--space-lg)">';
    // v3.0 step 8: the name is always the tap target for THE RIFLE'S
    // PAPERWORK (view 8, reusing ProfileManager.showRifleDetail via
    // AppNav.openRifle) — the dots row below is always the switcher/
    // add-rifle tap target instead (swipe still works with 2+ rifles).
    html += '<button class="v3-rname v3-rname-tap" id="rf-rname"><h1>' + UI.esc(rifle.name || 'Rifle') + '</h1>' +
        (rifle.caliber ? '<span class="load">' + UI.esc(rifle.caliber) + '</span>' : '') + '</button>';
    // Device bug: with exactly one rifle this row rendered nothing at
    // all, so "add a rifle" — a switcher-list row, not a Paperwork
    // sub-screen — had no tap target to find. Always render it; a
    // single rifle just shows one dot instead of none.
    html += '<button class="v3-dots" id="rf-dots" aria-label="Switch or add a rifle">';
    this._rifles.forEach(function (r, i) {
        html += '<i' + (i === self._cardIndex ? ' class="on"' : '') + '></i>';
    });
    html += '</button>';
    html += '<div id="rf-sync" style="padding:0 var(--edge)"></div>';
    html += '<button class="v3-numberbox" id="rf-number"><div class="lbl">PROVEN TO</div>' +
        '<div class="num" id="rf-num-val">&mdash;<em>yd</em></div><div class="conf" id="rf-conf">&nbsp;</div></button>';
    html += '<div class="v3-chart tap" id="rf-chart"><div class="cttl"><span>DROP CHART</span>' +
        '<small id="rf-chart-sub">tap for full &rsaquo;</small></div><div id="rf-chart-rows">' +
        '<div class="v3-crow"><span class="d">&nbsp;</span><span class="v">&hellip;</span></div></div></div>';
    html += '<button class="v3-gold" id="rf-add">＋&nbsp;&nbsp;Add what you shot</button>';
    html += '<div class="v3-feed"><div class="fttl">WHAT\'S HAPPENED</div><div id="rf-feed-rows">' +
        '<div class="v3-fitem-empty">Loading&hellip;</div></div></div>';
    html += '</div>';
    this.container.innerHTML = html;

    if (typeof SyncQueue !== 'undefined' && SyncQueue && SyncQueue.renderStatus) {
        SyncQueue.renderStatus(document.getElementById('rf-sync'));
    }

    this._bindRifleNav();

    var addBtn = document.getElementById('rf-add');
    if (addBtn) addBtn.addEventListener('click', function () {
        if (window.RifleAdd) RifleAdd.show(self, rifle);
    });
    var numBtn = document.getElementById('rf-number');
    if (numBtn) numBtn.addEventListener('click', function () {
        if (window.RifleWhy) RifleWhy.show(self, rifle);
    });
    var chartBox = document.getElementById('rf-chart');
    if (chartBox) chartBox.addEventListener('click', function () {
        if (window.RifleChart) RifleChart.show(self, rifle);
    });
    var rnameBtn = document.getElementById('rf-rname');
    if (rnameBtn) rnameBtn.addEventListener('click', function () {
        if (window.AppNav) AppNav.openRifle(rifle.id);
    });
    var dotsBtn = document.getElementById('rf-dots');
    if (dotsBtn) dotsBtn.addEventListener('click', function () {
        self._openRifleList();
    });

    this._loadAndFillRifle(rifle);
};

/** Everything the resting screen needs, in one gather. */
RifleApp.prototype._loadAndFillRifle = function (rifle) {
    var self = this;
    var db = this.db;

    var pStatus = (typeof CalibrationStatusCard !== 'undefined' && CalibrationStatusCard)
        ? CalibrationStatusCard.gather(db, rifle).catch(function () { return null; })
        : Promise.resolve(null);
    var pSessions = db.getSessionsByRifle(rifle.id).catch(function () { return []; });
    var pZero = db.getZeroEventsByRifle(rifle.id).catch(function () { return []; });
    var pSteel = db.getSteelStringsByRifle
        ? db.getSteelStringsByRifle(rifle.id).catch(function () { return []; }) : Promise.resolve([]);
    var pTruing = db.getTruingEventsByRifle(rifle.id).catch(function () { return []; });
    var pMv = db.getMvMeasurementsByRifle(rifle.id).catch(function () { return []; });
    var pBarrels = db.getBarrelsByRifle(rifle.id).catch(function () { return []; });
    var pTracking = db.getTrackingVerificationsByRifle(rifle.id).catch(function () { return []; });

    Promise.all([pStatus, pSessions, pZero, pSteel, pTruing, pMv, pBarrels, pTracking])
        .then(function (res) {
            if (!self.container.isConnected || self._currentRifle() !== rifle) return;
            var g = res[0], sessions = res[1], zeroEvents = res[2], steel = res[3],
                truing = res[4], mv = res[5], barrels = res[6], tracking = res[7];

            var activeBarrel = null;
            barrels.forEach(function (b) { if (!activeBarrel && b.isActive) activeBarrel = b; });
            if (!activeBarrel && barrels.length) activeBarrel = barrels[0];

            if (g) {
                self._fillNumber(rifle, g, steel, activeBarrel, tracking);
                self._fillChart(rifle, g);
            }

            var pClean = activeBarrel
                ? db.getCleaningLogsByBarrel(activeBarrel.id).catch(function () { return []; })
                : Promise.resolve([]);
            pClean.then(function (cleaning) {
                if (!self.container.isConnected || self._currentRifle() !== rifle) return;
                var feed = buildFeed({
                    sessions: sessions, zeroEvents: zeroEvents, steelStrings: steel,
                    truingEvents: truing, mvMeasurements: mv, cleaningLogs: cleaning
                });
                self._fillFeed(feed);
            });
        });
};

/** Roy words for the engine's confidence word. */
RifleApp.prototype._confWord = function (word) {
    var MAP = { Thin: 'rough', Moderate: 'getting there', Good: 'solid', High: 'locked in' };
    return MAP[word] || (word || '').toLowerCase();
};

RifleApp.prototype._fillNumber = function (rifle, g, steelStrings, activeBarrel, trackingVerifications) {
    var self = this;
    var status = g.status;
    var yd = status.rollup.calibratedToYd || 0;

    var numVal = document.getElementById('rf-num-val');
    if (numVal) numVal.innerHTML = Number(yd).toLocaleString() + '<em>yd</em>';

    var zeroOk = status.zero.state === 'confirmed' || status.zero.state === 'thin';
    var mvOk = status.mv.state === 'measured';
    var confWord = status.trued.state !== 'untrued'
        ? this._confWord(status.trued.confidence || status.rollup.word)
        : (yd ? this._confWord(status.rollup.word) : 'not started');

    var confEl = document.getElementById('rf-conf');

    // the coach line: the next-action engine, repurposed (Part 2) — never
    // a separate widget, just the tail of the confidence line.
    var hasLoad = !!(g.load && g.load.bulletBC);
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
        } catch (e) { /* unsolvable profile */ }
    }

    var distanceStrings = [];
    var pShots = Promise.resolve();
    if (status.trued.state === 'untrued' && (steelStrings || []).length) {
        var full = steelStrings.filter(function (s) { return s.tier === 'full'; }).slice(0, 5);
        pShots = Promise.all(full.map(function (st) {
            return this.db.getSteelShotsByString(st.id).catch(function () { return []; })
                .then(function (shots) { return { distanceYd: st.distanceYd, shotCount: (shots || []).length }; });
        }, this)).then(function (list) {
            distanceStrings = list.filter(function (s) { return s.shotCount >= 3; });
        });
    }

    var since = null;
    if (activeBarrel) {
        this.db.getCleaningLogsByBarrel(activeBarrel.id).catch(function () { return []; }).then(function (logs) {
            var latest = null;
            (logs || []).forEach(function (l) { if (!latest || (l.date || '') > (latest.date || '')) latest = l; });
            since = latest ? Math.max(0, (activeBarrel.totalRounds || 0) - (latest.roundCountAtCleaning || 0))
                : (activeBarrel.totalRounds || 0);
        });
    }

    pShots.then(function () {
        if (!self.container.isConnected || self._currentRifle() !== rifle) return;
        var na = deriveNextAction({
            now: new Date().toISOString(),
            status: status,
            hasLoad: hasLoad,
            mvTrueYd: mvTrueYd,
            distanceStrings: distanceStrings,
            roundsSinceCleaning: since,
            dismissals: {}
        });
        var coach = na.action.type !== 'none' ? (na.detail || na.title) : '';
        if (confEl) {
            confEl.innerHTML = UI.esc(confWord) +
                ' &middot; <b' + (zeroOk ? '' : ' class="warn"') + '>zero ' + (zeroOk ? '&check;' : '&times;') + '</b>' +
                ' &middot; <b' + (mvOk ? '' : ' class="warn"') + '>speed ' + (mvOk ? '&check;' : '&times;') + '</b>' +
                (coach ? ' &middot; <span style="color:var(--text-secondary)">' + UI.esc(coach) + '</span>' : '');
        }
    });
};

RifleApp.prototype._fillChart = function (rifle, g) {
    var el = document.getElementById('rf-chart-rows');
    var sub = document.getElementById('rf-chart-sub');
    if (!el || !g.load || !g.load.bulletBC || typeof computeTrajectory !== 'function') return;
    var status = g.status;
    var profile = {
        muzzleVelocity: g.load.truedMv || g.load.muzzleVelocity,
        bc: g.load.truedBc || g.load.bulletBC,
        dragModel: g.load.dragModel || 'G7',
        bulletWeight: g.load.bulletWeight || 140,
        zeroRange: rifle.zeroRange || 100,
        scopeHeight: rifle.scopeHeight || 1.5
    };
    if (!profile.muzzleVelocity) return;
    var hot = status.rollup.calibratedToYd || 0;
    var rows = pickDropRows(hot);
    var out;
    try {
        out = computeTrajectory({
            muzzleVelocity: profile.muzzleVelocity, bc: profile.bc, dragModel: profile.dragModel,
            zeroRange: profile.zeroRange, scopeHeight: profile.scopeHeight, bulletWeight: profile.bulletWeight,
            maxRange: rows[rows.length - 1] + 50, rangeStep: 10,
            windSpeedMph: 0, windClockPos: 12, tempF: 59, pressureInHg: 29.92, humidity: 50
        });
    } catch (e) { return; }
    var table = (out && out.table) || [];
    function comeUpAt(yd) {
        var prev = null;
        for (var i = 0; i < table.length; i++) {
            if (table[i].rangeYards >= yd) {
                if (!prev || table[i].rangeYards === yd) return table[i].comeUpMOA;
                var f = (yd - prev.rangeYards) / (table[i].rangeYards - prev.rangeYards || 1);
                return prev.comeUpMOA + (table[i].comeUpMOA - prev.comeUpMOA) * f;
            }
            prev = table[i];
        }
        return table.length ? table[table.length - 1].comeUpMOA : null;
    }
    var html = '';
    rows.forEach(function (yd) {
        var moa = comeUpAt(yd);
        html += '<div class="v3-crow' + (yd === hot ? ' hot' : '') + '"><span class="d">' +
            yd + ' yd</span><span class="v">' + (moa === null ? '—' : moa.toFixed(1) + ' MOA') + '</span></div>';
    });
    el.innerHTML = html;
    if (sub) sub.textContent = '29″Hg · tap for full ›';
};

RifleApp.prototype._fillFeed = function (feed) {
    var el = document.getElementById('rf-feed-rows');
    if (!el) return;
    if (!feed.length) {
        el.innerHTML = '<div class="v3-fitem-empty">Nothing logged yet — tap Add what you shot.</div>';
        return;
    }
    var self = this;
    var html = '';
    feed.forEach(function (item) {
        html += '<button class="v3-fitem" data-feed-id="' + UI.esc(item.id) + '" data-feed-type="' + UI.esc(item.type) + '">' +
            '<span><b>' + UI.esc(item.title) + '</b><small' + (item.pending ? ' class="pending"' : '') + '>' +
            (item.pending ? 'waiting to sync' : UI.esc(item.sub)) + '</small></span>' +
            '<span class="chev">&rsaquo;</span></button>';
    });
    el.innerHTML = html;
    var rows = el.querySelectorAll('[data-feed-id]');
    for (var i = 0; i < rows.length; i++) {
        rows[i].addEventListener('click', function () {
            var id = this.getAttribute('data-feed-id');
            var type = this.getAttribute('data-feed-type');
            if (window.RifleRecord) RifleRecord.show(self, self._currentRifle(), id, type);
        });
    }
};

/* ══ rifle switching: dots, swipe, tap-name list ══════════════ */

RifleApp.prototype._bindRifleNav = function () {
    var self = this;
    function go(delta) {
        var n = self._rifles.length;
        if (!n) return;
        self._cardIndex = (self._cardIndex + delta + n) % n;
        var r = self._currentRifle();
        if (typeof Recents !== 'undefined') Recents.touchRifle(r);
        self._renderRifle();
    }
    var screenEl = this.container.querySelector('.screen');
    if (!screenEl || this._rifles.length < 2) return;
    var x0 = null, y0 = null;
    screenEl.addEventListener('touchstart', function (e) {
        if (e.touches && e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }
    }, { passive: true });
    screenEl.addEventListener('touchend', function (e) {
        if (x0 === null || !e.changedTouches || !e.changedTouches.length) return;
        var dx = e.changedTouches[0].clientX - x0;
        var dy = e.changedTouches[0].clientY - y0;
        x0 = y0 = null;
        if (Math.abs(dx) > 48 && Math.abs(dx) > 2 * Math.abs(dy)) go(dx < 0 ? 1 : -1);
    }, { passive: true });
};

/** Plain list, per the contract ("a plain list appears if >4 or on name-area tap").
 *  Device bug: "add a rifle" had no tap target here at all — a user
 *  looking to add their next rifle naturally opens this list first,
 *  not Paperwork's "Everything else" drawer. "+ Add a rifle" and
 *  "Scan certificate" are always the last two rows. */
RifleApp.prototype._openRifleList = function () {
    var self = this;
    var overlay = document.createElement('div');
    overlay.className = 'overlay';
    var rows = '';
    this._rifles.forEach(function (r, i) {
        rows += '<button class="option-row' + (i === self._cardIndex ? ' on' : '') + '" data-pick="' + i + '">' +
            '<span>' + UI.esc(r.name || 'Rifle') + (r.caliber ? '<span class="choice-desc">' + UI.esc(r.caliber) + '</span>' : '') + '</span></button>';
    });
    rows += '<button class="option-row" data-pick-add="1"><span class="u-gold">＋ Add a rifle</span></button>';
    rows += '<button class="option-row" data-pick-scan="1"><span>Scan certificate</span></button>';
    overlay.innerHTML = '<div class="overlay-card"><div class="overlay-title">Which rifle?</div>' + rows + '</div>';
    document.body.appendChild(overlay);
    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    var picks = overlay.querySelectorAll('[data-pick]');
    for (var i = 0; i < picks.length; i++) {
        picks[i].addEventListener('click', function () {
            self._cardIndex = parseInt(this.getAttribute('data-pick'), 10);
            var r = self._currentRifle();
            if (typeof Recents !== 'undefined') Recents.touchRifle(r);
            close();
            self._renderRifle();
        });
    }
    var addRow = overlay.querySelector('[data-pick-add]');
    if (addRow) addRow.addEventListener('click', function () {
        close();
        if (typeof FirstRifleFlow !== 'undefined') FirstRifleFlow.start(self.db);
        else if (window.AppNav) AppNav.go('profiles');
    });
    var scanRow = overlay.querySelector('[data-pick-scan]');
    if (scanRow) scanRow.addEventListener('click', function () {
        close();
        self._explainScanCertificate();
    });
};

/** Same explanatory overlay as the Rifles-list "Scan certificate"
 *  button (profiles.js) — certificates carry a QR; scanning it is a
 *  camera-app action, not something this button does directly. */
RifleApp.prototype._explainScanCertificate = function () {
    var overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML =
        '<div class="overlay-card">' +
        '<div class="overlay-title">Scan a certificate</div>' +
        '<p class="overlay-text">Every Proven certificate carries a QR code. Point your phone&rsquo;s camera at it &mdash; the link opens that rifle right here.</p>' +
        '<button class="btn u-full" id="rf-scan-cert-close">Got it</button>' +
        '</div>';
    document.body.appendChild(overlay);
    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('#rf-scan-cert-close').addEventListener('click', close);
};
