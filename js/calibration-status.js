/**
 * calibration-status.js — the Calibration Status card (§2.10).
 *
 * Calibration is a passively-updated per-rifle STATUS, never a wizard.
 * Four elements + a rollup, DERIVED from append-only events (Part 0.6
 * #2) — zero_events, mv_measurements, tracking_verifications,
 * truing_events — plus the live zero verdict. Rifle/load columns are
 * cached "current" values; the events are the truth.
 *
 * Split module (ballistic-solver pattern):
 *   TOP  — pure derivation core, Node-tested (tests/test-calibration-status.js)
 *   BOTTOM — CalibrationStatusCard, the DOM renderer (browser only)
 *
 * Aging rules (constants; defaults documented in REORG-REPORT.md):
 *   Zero  → stale after zeroStaleDays, or IMMEDIATELY on a logged scope
 *           adjustment after the zero. Drifted when the latest zero's
 *           centroid moved > zeroDriftMOA from the prior confirmed zero.
 *   MV    → stale when the session lot differs from the measured lot,
 *           or after mvStaleDays.
 *   Trued → flagged when zero re-confirmed or MV re-measured MATERIALLY
 *           (> mvMaterialDeltaFps) since the truing event.
 * Aging softens wording; it never deletes history.
 */

var CALIBRATION_AGING = {
    zeroStaleDays: 90,
    mvStaleDays: 180,
    trackingStaleDays: 365,
    zeroThinShots: 5,
    zeroDriftMOA: 0.5,
    mvMaterialDeltaFps: 15
};

/** Whole days between two ISO datetimes (b - a). Bad input → null. */
function calDaysBetween(aIso, bIso) {
    var a = Date.parse(aIso);
    var b = Date.parse(bIso);
    if (isNaN(a) || isNaN(b)) return null;
    return Math.floor((b - a) / 86400000);
}

function _latestBy(list, dateField) {
    var best = null;
    (list || []).forEach(function (e) {
        if (!e || !e[dateField]) return;
        if (!best || String(e[dateField]) > String(best[dateField])) best = e;
    });
    return best;
}

function _shortDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return (d.getMonth() + 1) + '/' + d.getDate();
}

/**
 * Derive the four elements + rollup. PURE — `now` is an input.
 *
 * input = {
 *   now: ISO string (required),
 *   rifle: { zeroRange?, scopeCorrectionFactor?, scopeTrackingTestedAt? },
 *   load:  { muzzleVelocity?, lotNumber?, truedMv?, truedBc? } | null,
 *   currentLot: string|null            — the lot being shot now
 *   zeroVerdict: { state:'ready'|'adjust'|'unchecked', correction? } | null,
 *   zeroEvents: [{date, shotCount, distanceYards, groupData:{atzElevationMOA, atzWindageMOA}}],
 *   scopeAdjustments: [{date}],
 *   mvMeasurements: [{date, value, sd, shotCount, lotNumber}],
 *   trackingVerifications: [{date, factor}],
 *   truingEvents: [{appliedAt, stage, correctionType, supersonicPct, far, newValue}]
 * }
 *
 * → { tracking, zero, mv, trued, rollup, hint }
 *   each element: { state, line, ...details }
 */
function deriveCalibrationStatus(input) {
    var now = input.now;
    var rifle = input.rifle || {};
    var load = input.load || null;
    var A = CALIBRATION_AGING;

    /* ── Scope tracking ───────────────────────────────────── */
    var tv = _latestBy(input.trackingVerifications, 'date');
    var factor = tv ? tv.factor
        : (typeof rifle.scopeCorrectionFactor === 'number' ? rifle.scopeCorrectionFactor : null);
    var trackDate = tv ? tv.date : (rifle.scopeTrackingTestedAt || null);
    var tracking;
    if (factor === null || !isFinite(factor)) {
        tracking = { state: 'never', factor: null, date: null, line: 'Never verified' };
    } else {
        var tAge = trackDate ? calDaysBetween(trackDate, now) : null;
        var errPct = (factor - 1) * 100;
        var factorLine = Math.abs(errPct) <= 1
            ? 'Tracks true'
            : 'Clicks ' + Math.abs(errPct).toFixed(1) + '% ' + (errPct < 0 ? 'small' : 'large') + ' — corrected';
        if (tAge !== null && tAge > A.trackingStaleDays) {
            tracking = {
                state: 'stale', factor: factor, date: trackDate,
                line: factorLine + ' · verified ' + _shortDate(trackDate) + ' — re-test'
            };
        } else {
            tracking = {
                state: 'verified', factor: factor, date: trackDate,
                line: factorLine + (trackDate ? ' · ' + _shortDate(trackDate) : '')
            };
        }
    }

    /* ── Zero ─────────────────────────────────────────────── */
    var ze = _latestBy(input.zeroEvents, 'date');
    var verdict = input.zeroVerdict || null;
    var zero;
    if (!ze && (!verdict || verdict.state === 'unchecked')) {
        zero = { state: 'never', shotCount: null, date: null, line: 'Not confirmed yet' };
    } else if (verdict && verdict.state === 'adjust') {
        zero = {
            state: 'adjust', shotCount: ze ? ze.shotCount : null,
            date: ze ? ze.date : null,
            line: verdict.correction ? 'Adjust — ' + verdict.correction : 'Adjust and re-confirm'
        };
    } else {
        var zDate = ze ? ze.date : null;
        var zShots = ze ? (ze.shotCount || 0) : null;
        var zAge = zDate ? calDaysBetween(zDate, now) : null;
        // Scope adjustment AFTER the zero invalidates it immediately
        var adjAfter = false;
        (input.scopeAdjustments || []).forEach(function (a) {
            if (a && a.date && zDate && String(a.date) > String(zDate)) adjAfter = true;
        });
        // Drift: latest centroid vs the prior confirmed zero's centroid
        var drifted = false;
        var events = (input.zeroEvents || []).slice().sort(function (a, b) {
            return String(a.date || '').localeCompare(String(b.date || ''));
        });
        if (events.length >= 2) {
            var last = events[events.length - 1].groupData || {};
            var prev = events[events.length - 2].groupData || {};
            if (typeof last.atzElevationMOA === 'number' && typeof prev.atzElevationMOA === 'number') {
                var dE = (last.atzElevationMOA || 0) - (prev.atzElevationMOA || 0);
                var dW = (last.atzWindageMOA || 0) - (prev.atzWindageMOA || 0);
                if (Math.sqrt(dE * dE + dW * dW) > A.zeroDriftMOA) drifted = true;
            }
        }
        if (adjAfter) {
            zero = { state: 'stale', shotCount: zShots, date: zDate, line: 'Scope adjusted since — confirm again' };
        } else if (zAge !== null && zAge > A.zeroStaleDays) {
            zero = {
                state: 'stale', shotCount: zShots, date: zDate,
                line: 'Confirmed ' + _shortDate(zDate) + ' — stale, confirm before the hunt'
            };
        } else if (drifted) {
            zero = { state: 'drifted', shotCount: zShots, date: zDate, line: 'Zero has moved — check your mounts' };
        } else if (zShots !== null && zShots < A.zeroThinShots) {
            zero = {
                state: 'thin', shotCount: zShots, date: zDate,
                line: zShots + '-shot zero — thin; ' + A.zeroThinShots + '+ makes it trustworthy'
            };
        } else if (ze || (verdict && verdict.state === 'ready')) {
            zero = {
                state: 'confirmed', shotCount: zShots, date: zDate,
                line: 'Confirmed' + (zShots ? ' · ' + zShots + ' shots' : '') +
                    (zDate ? ' · ' + _shortDate(zDate) : '')
            };
        } else {
            zero = { state: 'never', shotCount: null, date: null, line: 'Not confirmed yet' };
        }
    }

    /* ── Muzzle velocity ──────────────────────────────────── */
    var mm = _latestBy(input.mvMeasurements, 'date');
    var mv;
    if (mm) {
        var mAge = calDaysBetween(mm.date, now);
        var lotMismatch = !!(input.currentLot && mm.lotNumber && input.currentLot !== mm.lotNumber);
        var valueBit = Math.round(mm.value) + ' fps' +
            (typeof mm.sd === 'number' ? ' · SD ' + mm.sd.toFixed(1) : '') +
            (mm.shotCount ? ' · ' + mm.shotCount + ' shots' : '');
        if (lotMismatch) {
            mv = {
                state: 'stale', value: mm.value, sd: mm.sd, date: mm.date, shotCount: mm.shotCount,
                line: valueBit + ' — measured on lot ' + mm.lotNumber + ', you\'re shooting ' +
                    input.currentLot + '; re-measure'
            };
        } else if (mAge !== null && mAge > A.mvStaleDays) {
            mv = {
                state: 'stale', value: mm.value, sd: mm.sd, date: mm.date, shotCount: mm.shotCount,
                line: valueBit + ' · ' + _shortDate(mm.date) + ' — aging, re-measure'
            };
        } else {
            mv = {
                state: 'measured', value: mm.value, sd: mm.sd, date: mm.date, shotCount: mm.shotCount,
                line: valueBit + (mm.date ? ' · ' + _shortDate(mm.date) : '')
            };
        }
    } else if (load && typeof load.muzzleVelocity === 'number' && load.muzzleVelocity > 0) {
        mv = {
            state: 'estimated', value: load.muzzleVelocity, sd: null, date: null, shotCount: null,
            line: Math.round(load.muzzleVelocity) + ' fps — estimated, not measured'
        };
    } else {
        mv = { state: 'none', value: null, sd: null, date: null, shotCount: null, line: 'No velocity data' };
    }

    /* ── Trued ────────────────────────────────────────────── */
    var te = _latestBy(input.truingEvents, 'appliedAt');
    var trued;
    if (!te) {
        trued = { state: 'untrued', stage: null, toYd: null, flagged: false, line: 'Untrued — solutions use book values' };
    } else {
        var toYd = te.far && typeof te.far.rangeYds === 'number' ? te.far.rangeYds : null;
        var flagged = false;
        var flagWhy = null;
        (input.zeroEvents || []).forEach(function (z) {
            if (z && z.date && String(z.date) > String(te.appliedAt)) {
                // a NEW zero after truing only flags when the zero moved
                if (zero.state === 'drifted' || zero.state === 'adjust') {
                    flagged = true; flagWhy = 'zero shifted since this truing';
                }
            }
        });
        if (mm && String(mm.date) > String(te.appliedAt) && te.correctionType === 'mv' &&
            typeof te.newValue === 'number' &&
            Math.abs(mm.value - te.newValue) > A.mvMaterialDeltaFps) {
            flagged = true; flagWhy = 'MV re-measured ' + Math.round(mm.value) + ' since this truing';
        }
        if (te.stage === 'drag') {
            var pct = typeof te.supersonicPct === 'number' ? Math.round(te.supersonicPct * 100) : null;
            trued = {
                state: 'drag', stage: 'drag', toYd: toYd, flagged: flagged,
                line: 'Drag-trued' + (toYd ? ' at ' + toYd + ' yd' : '') +
                    (pct !== null ? ' (' + pct + '% of supersonic)' : '') +
                    (flagged ? ' — ' + flagWhy : '')
            };
        } else {
            trued = {
                state: 'mv', stage: 'mv', toYd: toYd, flagged: flagged,
                line: 'MV-verified' + (toYd ? ' to ' + toYd + ' yd' : '') +
                    (flagged ? ' — ' + flagWhy : '')
            };
        }
    }

    /* ── Rollup: one honest word + calibrated-to ──────────── */
    var word, chipKind;
    switch (zero.state) {
        case 'confirmed': word = 'READY'; chipKind = 'ready'; break;
        case 'thin': word = 'THIN'; chipKind = 'caution'; break;
        case 'adjust': word = 'ADJUST'; chipKind = 'caution'; break;
        case 'stale':
        case 'drifted': word = 'STALE'; chipKind = 'caution'; break;
        default: word = 'NOT CHECKED'; chipKind = 'problem';
    }
    var calibratedToYd = null;
    if (trued.toYd && (zero.state === 'confirmed' || zero.state === 'thin')) {
        calibratedToYd = trued.toYd;
    } else if (zero.state === 'confirmed' || zero.state === 'thin') {
        var ze2 = _latestBy(input.zeroEvents, 'date');
        calibratedToYd = (ze2 && ze2.distanceYards) || rifle.zeroRange || null;
    }
    var rollup = {
        word: word,
        chip: { kind: chipKind, text: word.charAt(0) + word.slice(1).toLowerCase() },
        calibratedToYd: calibratedToYd,
        line: calibratedToYd
            ? 'Calibrated to ' + Number(calibratedToYd).toLocaleString() + ' yards'
            : 'Not calibrated to distance yet'
    };

    /* ── One hint line (the teacher, right-sized) ─────────── */
    var hint = null;
    if (zero.state === 'never') hint = 'Confirm zero — everything starts there.';
    else if (zero.state === 'adjust') hint = 'Dial the correction, then shoot a confirmation group.';
    else if (tracking.state === 'never') hint = 'Verify tracking to raise truing confidence to High.';
    else if (mv.state !== 'measured') hint = 'Chronograph this load — measured velocity beats a box number.';
    else if (trued.state === 'untrued') hint = 'True at distance to stretch your calibrated range.';
    else if (zero.state === 'stale' || zero.state === 'drifted') hint = 'A quick group brings this back to READY.';
    else if (trued.flagged) hint = 'Re-true — the numbers under this truing have changed.';

    return { tracking: tracking, zero: zero, mv: mv, trued: trued, rollup: rollup, hint: hint };
}

// Export the pure core for Node tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CALIBRATION_AGING: CALIBRATION_AGING,
        calDaysBetween: calDaysBetween,
        deriveCalibrationStatus: deriveCalibrationStatus
    };
}

/* ══════════════════════════════════════════════════════════════
 * Browser-only below: CalibrationStatusCard — the DOM renderer.
 * Renders into a container on the slim rifle page and at the top
 * of Data & Records. Each element row is tappable → a short
 * what/why sheet with the one-line unlock. Never a nag.
 * ══════════════════════════════════════════════════════════════ */

var CalibrationStatusCard = (typeof document !== 'undefined') ? (function () {
    'use strict';

    var SHEETS = {
        tracking: {
            title: 'Scope tracking',
            what: 'The tall-target test measures whether your turret actually moves the reticle as far as it claims.',
            why: 'Most scopes are 2–5% off, silently. A 4% turret error pollutes every dialed solution and every truing.',
            unlock: 'Verify it once (10 minutes at 100) and every solution auto-corrects forever.'
        },
        zero: {
            title: 'Zero',
            what: 'A confirmed zero is a photographed group whose center sits on your point of aim.',
            why: 'Ten shots beat three: group centers wander, and a thin zero can look perfect by luck. Everything downstream — solutions, truing, DOPE — stands on this.',
            unlock: 'A 5–10 shot confirmed group makes this rifle READY.'
        },
        mv: {
            title: 'Muzzle velocity',
            what: 'Measured MV comes from your chronograph; estimated MV is the box number.',
            why: 'Box numbers routinely run 50+ fps off — that is inches at distance. Lot changes move it again.',
            unlock: 'Import a chrono string and this flips to measured, with SD.'
        },
        trued: {
            title: 'Trued',
            what: 'Truing reconciles predicted vs actual drops at distance — MV in the supersonic band, drag near transonic.',
            why: 'Trued on a calm day with measured velocity, your solutions match how the rifle actually shoots.',
            unlock: 'True at distance to stretch the range this rifle is calibrated to.'
        }
    };

    /**
     * Gather events + verdict and derive the status — NO rendering.
     * The Home rifle card (v2.4 §1.1) and this card both consume it.
     * → Promise<{status, loads, load}>
     */
    function gather(db, rifle) {
        function safe(p) { return p.catch(function () { return []; }); }
        var pVerdict = (typeof Readiness !== 'undefined')
            ? Readiness.assess(db, rifle).catch(function () { return null; })
            : Promise.resolve(null);

        return Promise.all([
            safe(db.getLoadsByRifle(rifle.id)),
            safe(db.getZeroEventsByRifle(rifle.id)),
            safe(db.getScopeAdjustmentsByRifle(rifle.id)),
            safe(db.getMvMeasurementsByRifle(rifle.id)),
            safe(db.getTrackingVerificationsByRifle(rifle.id)),
            safe(db.getTruingEventsByRifle(rifle.id)),
            pVerdict
        ]).then(function (res) {
            var loads = res[0] || [];
            var load = null;
            loads.forEach(function (l) { if (!load && l.truedMv) load = l; });
            if (!load && loads.length) load = loads[0];

            var verdict = res[6];
            var status = deriveCalibrationStatus({
                now: new Date().toISOString(),
                rifle: rifle,
                load: load,
                currentLot: load ? (load.lotNumber || null) : null,
                zeroVerdict: verdict ? { state: verdict.state, correction: verdict.correction } : null,
                zeroEvents: res[1],
                scopeAdjustments: res[2],
                mvMeasurements: res[3],
                trackingVerifications: res[4],
                truingEvents: res[5]
            });
            return { status: status, loads: loads, load: load };
        });
    }

    /** Status only (the common consumer shape). */
    function getStatus(db, rifle) {
        if (!db || !rifle) return Promise.resolve(null);
        return gather(db, rifle).then(function (g) { return g.status; });
    }

    /**
     * Gather events + verdict, derive, render.
     * opts: { onConfirmZero? } — extra affordances live with the caller.
     */
    function render(el, db, rifle, opts) {
        opts = opts || {};
        if (!el || !db || !rifle) return Promise.resolve(null);
        return gather(db, rifle).then(function (g) {
            if (!el.isConnected) return null;
            el.innerHTML = _cardHtml(g.status);
            _bind(el, g.status);
            return g.status;
        });
    }

    function _stateChip(state) {
        var good = { verified: 1, confirmed: 1, measured: 1, mv: 1, drag: 1 };
        var warn = { stale: 1, thin: 1, drifted: 1, adjust: 1, estimated: 1 };
        var kind = good[state] ? 'ready' : (warn[state] ? 'caution' : 'problem');
        return kind;
    }

    function _row(key, title, element) {
        var kind = _stateChip(element.state);
        if (element.flagged) kind = 'caution';
        return '<button class="rowlink" data-cal-el="' + key + '">' +
            '<div class="txt"><b>' + title + '</b>' +
            '<span class="t-micro">' + UI.esc(element.line) + '</span></div>' +
            '<span class="chip chip-' + kind + '">' + '&#9679;' + '</span>' +
            '</button>';
    }

    function _cardHtml(status) {
        var html = '<div class="card" id="cal-status-card">';
        html += '<div class="rowlink" style="min-height:auto;padding-top:14px">' +
            '<div class="txt"><b style="font-size:20px">' + UI.esc(status.rollup.word) + '</b>' +
            '<span class="t-micro mono">' + UI.esc(status.rollup.line) + '</span></div>' +
            UI.chip(status.rollup.chip.kind, status.rollup.chip.text) +
            '</div>';
        html += _row('tracking', 'Scope tracking', status.tracking);
        html += _row('zero', 'Zero', status.zero);
        html += _row('mv', 'Muzzle velocity', status.mv);
        html += _row('trued', 'Trued', status.trued);
        if (status.hint) {
            html += '<div class="rowlink" style="min-height:auto">' +
                '<div class="txt"><span class="t-micro">' + UI.esc(status.hint) + '</span></div></div>';
        }
        html += '</div>';
        return html;
    }

    function _bind(el, status) {
        var rows = el.querySelectorAll('[data-cal-el]');
        for (var i = 0; i < rows.length; i++) {
            rows[i].addEventListener('click', function () {
                var key = this.getAttribute('data-cal-el');
                var sheet = SHEETS[key];
                var element = status[key];
                if (!sheet || !element) return;
                _openSheet(sheet, element);
            });
        }
    }

    /**
     * The what/why sheet. opts (all optional):
     *   actionLabel + onAction — a gold action button above Close
     *   (v2.4 §1.1: the card's segments deep-link into their flow).
     */
    function _openSheet(sheet, element, opts) {
        opts = opts || {};
        var overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.innerHTML =
            '<div class="overlay-card">' +
            '<div class="overlay-title">' + UI.esc(sheet.title) + '</div>' +
            '<p class="overlay-text mono">' + UI.esc(element.line) + '</p>' +
            '<p class="overlay-text">' + UI.esc(sheet.what) + '</p>' +
            '<p class="overlay-text">' + UI.esc(sheet.why) + '</p>' +
            '<p class="overlay-text u-gold">' + UI.esc(sheet.unlock) + '</p>' +
            (opts.actionLabel && opts.onAction
                ? '<button class="btn-primary u-full" id="cal-sheet-action">' + UI.esc(opts.actionLabel) + '</button>'
                : '') +
            '<button class="btn u-full u-mt-10" id="cal-sheet-close">Close</button>' +
            '</div>';
        document.body.appendChild(overlay);
        function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        overlay.querySelector('#cal-sheet-close').addEventListener('click', close);
        var act = overlay.querySelector('#cal-sheet-action');
        if (act) act.addEventListener('click', function () { close(); opts.onAction(); });
    }

    /** Public sheet entry for the Home card's segment taps. */
    function openSheet(key, element, opts) {
        var sheet = SHEETS[key];
        if (!sheet || !element) return;
        _openSheet(sheet, element, opts);
    }

    return { render: render, getStatus: getStatus, gather: gather, openSheet: openSheet };
})() : null;
