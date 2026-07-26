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
    var html = '<div class="screen">' +
        this._brandHtml() +
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

RifleApp.prototype._brandHtml = function () {
    return '<div class="v3-brand"><span class="wordmark">PROVEN<i>.</i></span></div>';
};

/* ══ Step 1 shell placeholder — full data wiring lands in step 2 ══ */
RifleApp.prototype._renderRifle = function () {
    var rifle = this._currentRifle();
    var many = this._rifles.length > 1;

    var dots = '';
    if (many) {
        dots = '<div class="v3-dots">';
        this._rifles.forEach(function (r, i) {
            dots += '<i' + (i === this._cardIndex ? ' class="on"' : '') + '></i>';
        }, this);
        dots += '</div>';
    }

    var html = '<div class="screen">';
    html += this._brandHtml();
    html += '<div class="v3-rname"><h1>' + UI.esc(rifle.name || 'Rifle') + '</h1>' +
        (rifle.caliber ? '<span class="load">' + UI.esc(rifle.caliber) + '</span>' : '') + '</div>';
    html += dots;
    html += '<div class="v3-numberbox"><div class="lbl">PROVEN TO</div>' +
        '<div class="num">&mdash;<em>yd</em></div><div class="conf">&nbsp;</div></div>';
    html += '<button class="v3-gold" id="rf-add">＋&nbsp;&nbsp;Add what you shot</button>';
    html += '</div>';
    this.container.innerHTML = html;

    var self = this;
    var addBtn = document.getElementById('rf-add');
    if (addBtn) addBtn.addEventListener('click', function () {
        if (window.RifleAdd) RifleAdd.show(self, rifle);
    });
};
