/**
 * rifle-why.js — WHY (Contract v3.0 Part 1, view 5 — tap the number).
 *
 * "Proven to 600 — rough" + the four calibration elements in Roy's
 * words, each with a status word and a one-line reason, each tappable
 * straight into its own fact card (Contract v4.0 — no separate doors):
 *   Zero            → the "I zeroed" fact card (3a)
 *   Bullet speed    → the "I clocked my speed" card (3c)
 *   Checked at distance → the "I shot at distance" card (3b) — "add
 *                     more shots" there IS detailed truing now
 *   Scope check     → the tall-target wizard (unchanged, existing)
 * Bottom: the same gold ＋ button — never a dead end.
 *
 * Reuses `CalibrationStatusCard.gather()` (unchanged, pure derivation)
 * for every number and word on this screen — no new math.
 */

var RifleWhy = (function () {
    'use strict';

    var CONF_WORD = { Thin: 'rough', Moderate: 'getting there', Good: 'solid', High: 'locked in' };
    function confWord(word) { return CONF_WORD[word] || (word || '').toLowerCase(); }

    function show(app, rifle) {
        var container = app.container;
        container.setAttribute('data-screen', 'v3-why');
        container.innerHTML = '<div class="screen">' +
            '<div class="pagehead"><button class="backline" id="rw-back">&lsaquo; ' +
            UI.esc(rifle.name || 'Home') + '</button></div>' +
            '<h2 id="rw-title" style="padding:0 var(--edge);font:var(--type-title)">Loading&hellip;</h2>' +
            '<div id="rw-sub" style="padding:0 var(--edge);color:var(--text-secondary);margin-bottom:16px"></div>' +
            '<div id="rw-segs"></div>' +
            '<div class="v3-spacer" style="height:20px"></div>' +
            '<button class="v3-gold" id="rw-add">＋&nbsp;&nbsp;Add what you shot</button>' +
            '<div style="height:16px"></div></div>';

        document.getElementById('rw-back').addEventListener('click', function () { app.show(rifle.id); });
        document.getElementById('rw-add').addEventListener('click', function () {
            if (window.RifleAdd) RifleAdd.show(app, rifle);
        });

        if (typeof CalibrationStatusCard === 'undefined' || !CalibrationStatusCard) return;
        CalibrationStatusCard.gather(app.db, rifle).then(function (g) {
            if (!container.isConnected || app._currentRifle() !== rifle) return;
            _fill(app, rifle, g);
        });
    }

    function _fill(app, rifle, g) {
        var status = g.status;
        var yd = status.rollup.calibratedToYd || 0;
        var word = status.trued.state !== 'untrued'
            ? confWord(status.trued.confidence || status.rollup.word)
            : (yd ? confWord(status.rollup.word) : 'not started');

        var titleEl = document.getElementById('rw-title');
        if (titleEl) titleEl.textContent = yd ? 'Proven to ' + yd.toLocaleString() + ' — ' + word : 'Not proven yet';
        var subEl = document.getElementById('rw-sub');
        if (subEl) subEl.textContent = 'Here\'s what that\'s based on, and what would raise it.';

        // cls: 'ok' (green, fully confirmed) · 'rough' (gold, partial/
        // needs attention) · 'no' (grey, not started) — three genuinely
        // different states, not a boolean, so each row picks explicitly.
        var ZERO_CLS = { never: 'no', adjust: 'rough', stale: 'rough', drifted: 'rough', thin: 'rough', confirmed: 'ok' };
        var ZERO_WORD = { never: 'NOT DONE', adjust: 'ADJUST', stale: 'STALE', drifted: 'STALE', thin: 'CONFIRMED', confirmed: 'CONFIRMED' };
        var MV_CLS = { none: 'no', estimated: 'rough', stale: 'rough', measured: 'ok' };
        var MV_WORD = { none: 'NOT DONE', estimated: 'ESTIMATED', stale: 'STALE', measured: 'MEASURED' };

        var truedCls, truedWord;
        if (status.trued.state === 'untrued') { truedCls = 'no'; truedWord = 'NOT DONE'; }
        else if (status.trued.flagged) { truedCls = 'rough'; truedWord = 'RE-CHECK'; }
        else if (status.trued.confidence === 'Good' || status.trued.confidence === 'High') { truedCls = 'ok'; truedWord = confWord(status.trued.confidence).toUpperCase(); }
        else { truedCls = 'rough'; truedWord = confWord(status.trued.confidence || 'Thin').toUpperCase(); }

        var rows = [
            { key: 'zero', title: 'Zero', line: status.zero.line, cls: ZERO_CLS[status.zero.state] || 'no', statusWord: ZERO_WORD[status.zero.state] || 'NOT DONE' },
            { key: 'speed', title: 'Bullet speed', line: status.mv.line, cls: MV_CLS[status.mv.state] || 'no', statusWord: MV_WORD[status.mv.state] || 'NOT DONE' },
            { key: 'trued', title: 'Checked at distance', line: status.trued.line, cls: truedCls, statusWord: truedWord },
            { key: 'tracking', title: 'Scope check', line: 'optional — for the last bit of precision',
                cls: status.tracking.state === 'verified' ? 'ok' : 'no',
                statusWord: status.tracking.state === 'verified' ? 'CHECKED' : 'NOT DONE' }
        ];

        var html = '';
        rows.forEach(function (r) {
            html += '<button class="v3-seg" data-row="' + r.key + '">' +
                '<span class="l"><b>' + UI.esc(r.title) + '</b><small>' + UI.esc(r.line) + '</small></span>' +
                '<span class="st ' + r.cls + '">' + UI.esc(r.statusWord) + '</span></button>';
        });
        var el = document.getElementById('rw-segs');
        if (el) el.innerHTML = html;

        var els = el ? el.querySelectorAll('[data-row]') : [];
        for (var i = 0; i < els.length; i++) {
            els[i].addEventListener('click', function () {
                _tapRow(app, rifle, this.getAttribute('data-row'));
            });
        }
    }

    function _tapRow(app, rifle, key) {
        if (key === 'zero') {
            // Contract v4.0 Law 2: no flow has steps — jump straight to
            // the "I zeroed" fact card, not the old photo wizard.
            if (window.RifleAdd && RifleAdd.showZero) RifleAdd.showZero(app, rifle);
        } else if (key === 'speed') {
            if (window.RifleAdd) RifleAdd.showChrono(app, rifle);
        } else if (key === 'trued') {
            // Contract v4.0 3b: no separate truing door — "add more
            // shots" on the same "I shot at distance" card IS truing now.
            if (window.RifleAdd && RifleAdd.showSteel) RifleAdd.showSteel(app, rifle);
        } else if (key === 'tracking') {
            if (typeof ScopeCheck !== 'undefined') {
                ScopeCheck.start(app.db, function () { app.show(rifle.id); });
            }
        }
    }

    return { show: show };
})();

// Launcher (registration seam)
if (typeof window !== 'undefined') {
    window.RifleWhy = RifleWhy;
}
