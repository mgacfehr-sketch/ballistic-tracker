/**
 * truing-wizard.js — "True your rifle": the third main-menu destination
 * (owner order). Standalone, step-by-step entry into the SAME
 * one-observation truing engine js/rifle-payoff.js already drives from
 * the steel flow — one question per screen, Roy's words throughout:
 *
 *   which rifle -> which ammo (that rifle's only) -> "How far is the
 *   target?" -> "What did you dial?" -> "What was your muzzle
 *   velocity?" -> "Where did it hit?" -> result (corrected BC/MV
 *   stated plainly, drag model labeled, dial change in shooter terms)
 *   -> Keep it / Undo.
 *
 * Routes through simpleTrueObservation() (js/simple-true.js) exactly
 * as rifle-payoff.js does — doctrine-routed silently by truing-core's
 * `recommended`, never by caller intent (Amendment 1 A1). The honesty
 * guard is the SAME guard every other caller gets (null return = "can't
 * use that", refused politely, never bypassed here). Keep persists via
 * SimpleTrue.keep — the one append-only write path every truing caller
 * shares. simple-true.js and truing-core.js (protected engines) are
 * untouched.
 *
 * Renders into #view-home, same container/pattern as MainMenu and
 * SimpleTrue.
 */
var TruingWizard = (function () {
    'use strict';

    // Matches calculations.js's zeroVerdict() default click value — the
    // one click-size convention already established in this codebase.
    var DEFAULT_CLICK_MOA = 0.25;

    function start(db) {
        var container = document.getElementById('view-home');
        if (!container || !db) return;
        var S = {
            rifle: null, load: null,
            rangeYds: null, dialed: null, units: 'MOA', shotMV: null
        };
        _screenRifle(container, db, S);
    }

    function _home() {
        if (window.AppNav) AppNav.go('home');
    }

    function _profileFor(rifle, load) {
        return {
            muzzleVelocity: load.truedMv || load.muzzleVelocity,
            bc: load.truedBc || load.bulletBC,
            dragModel: load.dragModel || 'G7',
            bulletWeight: load.bulletWeight || 140,
            zeroRange: rifle.zeroRange || 100,
            scopeHeight: rifle.scopeHeight || 1.5
        };
    }
    var TW_ENV = { tempF: null, pressureInHg: null, humidity: null, source: 'default' };

    /* ── Screen 1: which rifle ────────────────────────────── */
    function _screenRifle(container, db, S) {
        container.setAttribute('data-screen', 'truing-rifle');
        container.innerHTML = '<div class="screen">' +
            '<div class="pagehead"><button class="backline" id="tw-back-home">&lsaquo; Home</button>' +
            '<div class="pagetitle">Which rifle are you using?</div></div>' +
            '<div id="tw-rifle-list" class="edge"><p class="t-micro">Loading&hellip;</p></div>' +
            '<div style="height:16px"></div></div>';
        document.getElementById('tw-back-home').addEventListener('click', _home);

        db.getAllRifles().then(function (rifles) {
            var list = document.getElementById('tw-rifle-list');
            if (!list) return;
            rifles = (rifles || []).slice().sort(function (a, b) {
                return (a.name || '').localeCompare(b.name || '');
            });
            if (!rifles.length) {
                list.innerHTML = '<div class="empty-teach"><p>Add a rifle first so this has something to true.</p>' +
                    '<button class="action" id="tw-go-rifles">Set up a rifle</button></div>';
                var goBtn = document.getElementById('tw-go-rifles');
                if (goBtn) goBtn.addEventListener('click', function () {
                    if (window.AppNav && AppNav.openRifleList) AppNav.openRifleList();
                    else _home();
                });
                return;
            }
            var html = '<div class="choice-stack">';
            rifles.forEach(function (r) {
                html += '<button class="choice-plate tw-rifle-btn" data-id="' + UI.esc(r.id) + '">' +
                    '<span>' + UI.esc(r.name || 'Rifle') +
                    (r.caliber ? '<span class="choice-desc">' + UI.esc(r.caliber) + '</span>' : '') + '</span>' +
                    Icon('chevron-right', 18) + '</button>';
            });
            html += '</div>';
            list.innerHTML = html;
            var btns = list.querySelectorAll('.tw-rifle-btn');
            for (var i = 0; i < btns.length; i++) {
                btns[i].addEventListener('click', function () {
                    var id = this.getAttribute('data-id');
                    S.rifle = rifles.filter(function (r) { return r.id === id; })[0];
                    S.units = (S.rifle.angleUnit === 'MIL') ? 'MIL' : 'MOA';
                    _screenAmmo(container, db, S);
                });
            }
        });
    }

    /* ── Screen 2: which ammo (that rifle's only) ────────────── */
    function _screenAmmo(container, db, S) {
        container.setAttribute('data-screen', 'truing-ammo');
        container.innerHTML = '<div class="screen">' +
            '<div class="pagehead"><button class="backline" id="tw-back-rifle">&lsaquo; ' +
            UI.esc(S.rifle.name || 'Rifle') + '</button>' +
            '<div class="pagetitle">Which ammo are you using?</div></div>' +
            '<div id="tw-ammo-list" class="edge"><p class="t-micro">Loading&hellip;</p></div>' +
            '<div style="height:16px"></div></div>';
        document.getElementById('tw-back-rifle').addEventListener('click', function () {
            _screenRifle(container, db, S);
        });

        db.getLoadsByRifle(S.rifle.id).then(function (loads) {
            var list = document.getElementById('tw-ammo-list');
            if (!list) return;
            loads = (loads || []).slice().sort(function (a, b) {
                return (a.name || '').localeCompare(b.name || '');
            });
            if (!loads.length) {
                list.innerHTML = '<div class="empty-teach"><p>No ammo on file for ' +
                    UI.esc(S.rifle.name || 'this rifle') + ' yet.</p>' +
                    '<button class="action" id="tw-go-rifle-detail">Add ammo</button></div>';
                var goBtn = document.getElementById('tw-go-rifle-detail');
                if (goBtn) goBtn.addEventListener('click', function () {
                    if (window.AppNav && AppNav.openRifle) AppNav.openRifle(S.rifle.id);
                    else _home();
                });
                return;
            }
            var html = '<div class="choice-stack">';
            loads.forEach(function (ld) {
                html += '<button class="choice-plate tw-load-btn" data-id="' + UI.esc(ld.id) + '">' +
                    '<span>' + UI.esc(ld.name || 'Ammo') +
                    '<span class="choice-desc">' + (ld.bulletWeight || '') + 'gr</span></span>' +
                    Icon('chevron-right', 18) + '</button>';
            });
            html += '</div>';
            list.innerHTML = html;
            var btns = list.querySelectorAll('.tw-load-btn');
            for (var i = 0; i < btns.length; i++) {
                btns[i].addEventListener('click', function () {
                    var id = this.getAttribute('data-id');
                    S.load = loads.filter(function (l) { return l.id === id; })[0];
                    if (!S.load.bulletBC || !(S.load.muzzleVelocity || S.load.truedMv)) {
                        _needsNumbers(container, S);
                        return;
                    }
                    _screenDistance(container, db, S);
                });
            }
        });
    }

    /** Dead end, same shape as rifle-add.js's _loggedNeedsNumbers — this
     *  ammo can't be trued until it has a BC and a base speed on file. */
    function _needsNumbers(container, S) {
        container.setAttribute('data-screen', 'truing-needs-numbers');
        container.innerHTML = '<div class="screen">' +
            '<h2 style="margin-top:60px;text-align:center;padding:0 var(--edge);font:var(--type-title)">Not yet.</h2>' +
            '<p style="text-align:center;color:var(--text-secondary);padding:0 var(--edge);margin-top:10px">' +
            'To true ' + UI.esc(S.load.name || 'this ammo') +
            ', it needs its BC and box speed on file first &mdash; two minutes, once.</p>' +
            '<button class="v3-gold" id="tw-nn-add" style="margin-top:24px">Add BC &amp; speed</button>' +
            '<div class="v3-linkrow"><button class="v3-link" id="tw-nn-back">Not now</button></div></div>';
        document.getElementById('tw-nn-add').addEventListener('click', function () {
            if (window.AppNav && AppNav.openRifle) AppNav.openRifle(S.rifle.id);
            else _home();
        });
        document.getElementById('tw-nn-back').addEventListener('click', _home);
    }

    /* ── Screens 3-5: one numeric question each ──────────────── */
    function _screenNumber(container, opts) {
        container.setAttribute('data-screen', 'truing-' + opts.id);
        var html = '<div class="screen">' +
            '<div class="pagehead"><button class="backline" id="' + opts.id + '-back">&lsaquo; ' +
            UI.esc(opts.backLabel) + '</button>' +
            '<div class="pagetitle">' + UI.esc(opts.title) + '</div>' +
            (opts.sub ? '<div class="pagesub">' + UI.esc(opts.sub) + '</div>' : '') + '</div>' +
            '<div class="field edge"><label for="' + opts.id + '-input">' + UI.esc(opts.unitLabel) + '</label>' +
            '<input type="number" inputmode="decimal" id="' + opts.id + '-input" ' +
            'placeholder="' + UI.esc(opts.placeholder) + '"' +
            (typeof opts.value === 'number' ? ' value="' + opts.value + '"' : '') + '></div>' +
            '<p class="field-error edge" id="' + opts.id + '-err"></p>' +
            '<button class="btn-primary btn-edge u-mt-10" id="' + opts.id + '-next">Next</button>' +
            '<div style="height:16px"></div></div>';
        container.innerHTML = html;

        document.getElementById(opts.id + '-back').addEventListener('click', opts.onBack);
        document.getElementById(opts.id + '-next').addEventListener('click', function () {
            var input = document.getElementById(opts.id + '-input');
            var errEl = document.getElementById(opts.id + '-err');
            var v = parseFloat(input.value);
            if (!isFinite(v) || v < opts.min || v > opts.max) {
                if (errEl) errEl.textContent = opts.errorMsg || ('Enter a number between ' + opts.min + ' and ' + opts.max + '.');
                return;
            }
            opts.onNext(v);
        });
        var inputEl = document.getElementById(opts.id + '-input');
        if (inputEl) inputEl.focus();
    }

    function _screenDistance(container, db, S) {
        _screenNumber(container, {
            id: 'dist', title: 'How far is the target?', unitLabel: 'Distance (yards)',
            placeholder: '600', backLabel: S.rifle.name || 'Rifle',
            min: 1, max: 3000, value: S.rangeYds,
            errorMsg: 'Enter a distance in yards.',
            onBack: function () { _screenAmmo(container, db, S); },
            onNext: function (v) { S.rangeYds = v; _screenDial(container, db, S); }
        });
    }

    function _screenDial(container, db, S) {
        _screenNumber(container, {
            id: 'dial', title: 'What did you dial?', unitLabel: 'Elevation dialed (' + S.units + ')',
            placeholder: S.units === 'MIL' ? '2.0' : '7.0', backLabel: 'Distance',
            min: -100, max: 100, value: S.dialed,
            errorMsg: 'Enter the elevation you dialed, in ' + S.units + '.',
            onBack: function () { _screenDistance(container, db, S); },
            onNext: function (v) { S.dialed = v; _screenMV(container, db, S); }
        });
    }

    function _screenMV(container, db, S) {
        _screenNumber(container, {
            id: 'mv', title: 'What was your muzzle velocity?', sub: 'Average from the chrono.',
            unitLabel: 'Velocity (fps)', placeholder: '2950', backLabel: 'Dial',
            min: 500, max: 5000, value: S.shotMV,
            errorMsg: 'Enter your average velocity in fps.',
            onBack: function () { _screenDial(container, db, S); },
            onNext: function (v) { S.shotMV = v; _screenHit(container, db, S); }
        });
    }

    /* ── Screen 6: where did it hit ──────────────────────────── */
    function _screenHit(container, db, S) {
        container.setAttribute('data-screen', 'truing-hit');
        var html = '<div class="screen">' +
            '<div class="pagehead"><button class="backline" id="tw-hit-back">&lsaquo; Velocity</button>' +
            '<div class="pagetitle">Where did it hit?</div>' +
            '<div class="pagesub">Compared to your point of aim.</div></div>' +
            '<div class="field edge"><label for="tw-hit-amt">Amount</label>' +
            '<input type="number" inputmode="decimal" min="0" step="0.1" id="tw-hit-amt" placeholder="3.5"></div>' +
            '<div class="segment edge" id="tw-hit-dir">' +
            '<button data-dir="high" class="on">HIGH</button>' +
            '<button data-dir="low">LOW</button></div>' +
            '<div class="segment edge u-mt-10" id="tw-hit-unit">' +
            '<button data-unit="in" class="on">Inches</button>' +
            '<button data-unit="clicks">Clicks</button></div>' +
            '<p class="field-error edge" id="tw-hit-err"></p>' +
            '<button class="btn-primary btn-edge u-mt-10" id="tw-hit-go">See what changed</button>' +
            '<div style="height:16px"></div></div>';
        container.innerHTML = html;

        var dir = 'high';
        var unit = 'in';
        document.getElementById('tw-hit-back').addEventListener('click', function () {
            _screenMV(container, db, S);
        });
        document.getElementById('tw-hit-dir').addEventListener('click', function (e) {
            var b = e.target.closest ? e.target.closest('[data-dir]') : null;
            if (!b) return;
            dir = b.getAttribute('data-dir');
            var btns = this.querySelectorAll('button');
            for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i] === b);
        });
        document.getElementById('tw-hit-unit').addEventListener('click', function (e) {
            var b = e.target.closest ? e.target.closest('[data-unit]') : null;
            if (!b) return;
            unit = b.getAttribute('data-unit');
            var btns = this.querySelectorAll('button');
            for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i] === b);
        });

        document.getElementById('tw-hit-go').addEventListener('click', function () {
            var amtEl = document.getElementById('tw-hit-amt');
            var errEl = document.getElementById('tw-hit-err');
            var amt = parseFloat(amtEl.value);
            if (!isFinite(amt) || amt < 0) {
                if (errEl) errEl.textContent = 'Enter how far off it hit.';
                return;
            }
            var signed = dir === 'high' ? amt : -amt;
            var hitInches = (unit === 'clicks')
                ? moaToInches(signed * DEFAULT_CLICK_MOA, S.rangeYds)
                : signed;
            _compute(container, db, S, hitInches);
        });
    }

    /* ── Compute + result ─────────────────────────────────────── */
    function _compute(container, db, S, hitInches) {
        var profile = _profileFor(S.rifle, S.load);
        var out = null;
        try {
            out = simpleTrueObservation({
                profile: profile,
                env: TW_ENV,
                rangeYds: S.rangeYds,
                dialed: S.dialed || 0,
                hitInches: hitInches,
                units: S.units,
                shotMV: typeof S.shotMV === 'number' ? S.shotMV : undefined,
                mvMeasured: true,
                zeroConfirmed: false,
                trackingVerified: false
            });
        } catch (e) {
            console.warn('[TruingWizard] solve failed:', e);
        }
        if (!out) {
            _couldNotUse(container, S);
            return;
        }
        _renderResult(container, db, S, out, profile, hitInches);
    }

    /** Honest refusal — same guard every caller of simpleTrueObservation
     *  gets (zero-band hit, or a correction pinned at the bracket edge). */
    function _couldNotUse(container, S) {
        container.setAttribute('data-screen', 'truing-none');
        var nearLimit = Math.round((S.rifle.zeroRange || 100) * 1.5);
        var why = S.rangeYds <= nearLimit
            ? 'That hit is too close to your zero to teach us anything — shots past ~' +
              nearLimit + ' yards are where your numbers improve.'
            : 'That miss is bigger than a speed or drag problem can explain — check your zero and what you dialed, then try again.';
        container.innerHTML = '<div class="screen">' +
            '<div class="v3-payoff">' +
            '<div class="say" style="margin-top:60px">' + UI.esc(why) + '</div>' +
            '<div class="sub">Nothing was changed.</div>' +
            '</div>' +
            '<button class="v3-gold" id="tw-none-ok">OK</button>' +
            '<div style="height:16px"></div></div>';
        document.getElementById('tw-none-ok').addEventListener('click', _home);
    }

    /** The payoff — the corrected number stated plainly (drag model
     *  labeled when it's BC; fps when it's velocity), plus the same
     *  dial-change sentence rifle-payoff.js's steel path shows. */
    function _renderResult(container, db, S, out, profile, hitInches) {
        container.setAttribute('data-screen', 'truing-result');
        var p = out.payoff;
        var isBc = out.picked === 'bc';

        var numberSay;
        if (isBc) {
            var oldBc = profile.bc;
            numberSay = 'Your <b>' + UI.esc(profile.dragModel) + ' BC:</b> <b class="new">' +
                out.option.value.toFixed(3) + '</b> — was ' + Number(oldBc).toFixed(3);
        } else {
            var oldMv = Math.round(profile.muzzleVelocity);
            numberSay = 'Your <b>muzzle velocity:</b> <b class="new">' +
                Math.round(out.option.value) + ' fps</b> — was ' + oldMv + ' fps';
        }

        var dialSay = p.moved
            ? 'Your <b>' + p.rangeYds + '-yard</b> dial changes from ' +
              '<b class="old">' + p.oldDial.toFixed(1) + '</b> to <b class="new">' + p.newDial.toFixed(1) + '</b>.'
            : 'Your <b>' + p.rangeYds + '-yard</b> dial barely moves — your numbers were already close.';
        var sub = p.moved
            ? 'Everything past ~' + p.pastYd + ' just got more accurate.'
            : 'Nothing to change — this confirms what you had.';

        var html = '<div class="screen">' +
            '<div class="v3-payoff">' +
            '<div class="mark">&check;</div>' +
            '<div class="say">' + numberSay + '</div>' +
            '<div class="say" style="margin-top:10px">' + dialSay + '</div>' +
            '<div class="sub">' + sub + '</div>' +
            '</div>' +
            '<div class="v3-spacer" style="height:10px"></div>' +
            '<button class="v3-gold" id="tw-keep">Keep it</button>' +
            '<div class="v3-linkrow"><button class="v3-link" id="tw-undo">Undo</button></div>' +
            '<div style="height:16px"></div></div>';
        container.innerHTML = html;

        document.getElementById('tw-undo').addEventListener('click', _home);
        document.getElementById('tw-keep').addEventListener('click', function () {
            var btn = document.getElementById('tw-keep');
            btn.disabled = true;
            btn.textContent = 'Keeping…';
            var ctx = {
                db: db, rifle: S.rifle, load: S.load, env: TW_ENV,
                dialed: S.dialed || 0, mvMeasured: true
            };
            var keepS = { hitIn: hitInches, windIn: 0, mv: typeof S.shotMV === 'number' ? S.shotMV : null };
            SimpleTrue.keep(ctx, keepS, out).then(function () {
                _home();
            }).catch(function (err) {
                btn.disabled = false;
                btn.textContent = 'Keep it';
                alert('Could not save: ' + err.message);
            });
        });
    }

    return { start: start };
})();

// Launcher (registration seam)
if (typeof window !== 'undefined') {
    window.TruingWizard = TruingWizard;
}
