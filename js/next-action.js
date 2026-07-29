/**
 * next-action.js — THE NEXT ACTION engine (Contract v2.4 §1.2).
 *
 * Computes ONE suggestion from the rifle's calibration state + data
 * present. The pro protocol (zero → chrono → true) is never taught;
 * it is simply the path the number pulls you down. Every suggestion
 * states its payoff in yards where computable, confidence otherwise.
 *
 * PURE — no DOM, no storage, no Date.now(). The caller gathers:
 *   status           deriveCalibrationStatus() output (or null)
 *   hasLoad          any load with bullet data exists
 *   mvTrueYd         prescribeTruingDistances().mvTrueYd (null when
 *                    the profile can't be solved yet)
 *   distanceStrings  usable steel/paper-at-distance strings not yet
 *                    trued: [{distanceYd, shotCount}]
 *   roundsSinceCleaning  number|null (cleaning nudge input)
 *   dismissals       {suggestionId: dismissedAtIso} — "Not now" state
 *   now              ISO string
 *
 * The card renders the output; NextActionLaunch (browser half of the
 * Home card) maps action.type → the existing flow, pre-scoped to the
 * rifle. Priority ladder per contract — first unmet wins. "Go shoot"
 * is the floor and is never dismissible. Never invent a nag.
 */

var NEXT_ACTION_DISMISS_DAYS = 7;

/** Is this suggestion inside its 7-day "Not now" window? PURE. */
function nextActionDismissed(dismissals, id, nowIso) {
    if (!dismissals || !dismissals[id]) return false;
    var at = Date.parse(dismissals[id]);
    var now = Date.parse(nowIso);
    if (isNaN(at) || isNaN(now)) return false;
    return (now - at) < NEXT_ACTION_DISMISS_DAYS * 86400000;
}

/** New dismissals map with `id` stamped at `nowIso`. Immutable. */
function withNextActionDismissal(dismissals, id, nowIso) {
    var out = {};
    for (var k in dismissals) {
        if (dismissals.hasOwnProperty(k)) out[k] = dismissals[k];
    }
    out[id] = nowIso;
    return out;
}

/** Largest usable distance string (ties → more shots). */
function _bestDistanceString(strings) {
    var best = null;
    (strings || []).forEach(function (s) {
        if (!s || typeof s.distanceYd !== 'number' || s.distanceYd <= 0) return;
        if (!best || s.distanceYd > best.distanceYd ||
            (s.distanceYd === best.distanceYd && (s.shotCount || 0) > (best.shotCount || 0))) {
            best = s;
        }
    });
    return best;
}

/** Amendment 1 Phase D coach copy per troubleshooting ladder step
 *  (Validation Doctrine §7). */
var TROUBLESHOOT_STEP_TITLE = {
    zero: 'Re-check your zero',
    mount: 'Check your scope mount and action fasteners',
    velocity: 'Re-measure muzzle velocity',
    builder: 'This may need your builder\'s attention'
};

/**
 * The ladder. → { id, title, detail, payoff, action:{type}, dismissible }
 * or the go-shoot floor. Dismissed rungs fall through to the next.
 *
 * Amendment 1 Phase D additions (both optional, backward-compatible --
 * omitting either reproduces the exact pre-Phase-D ladder):
 *   input.troubleshootingHold: { inHold, ladderStep } | null/undefined
 *     -- js/validation-status.js's deriveTroubleshootingHold output.
 *     While inHold, this becomes the ONLY non-floor rung: Commandment
 *     32 ("never tune math around an unresolved hardware or zero
 *     problem") means the truing-suggesting rungs (true-rifle, re-true,
 *     confirm-true) must not appear at all until the hold clears.
 *   input.configCompatNote: string | null -- js/config-memory.js's
 *     checkCompatibility().note when the rifle's current suppressor/
 *     barrel differs from what the last zero/truing was recorded under
 *     (Constitution §12.2). Suppressed while in a troubleshooting hold
 *     (the hold rung already owns the "something needs checking" slot).
 */
function deriveNextAction(input) {
    var status = input.status || null;
    var zero = status ? status.zero : null;
    var mv = status ? status.mv : null;
    var trued = status ? status.trued : null;
    var tracking = status ? status.tracking : null;
    var provenYd = (status && status.rollup && status.rollup.calibratedToYd) || 0;
    var holdActive = !!(input.troubleshootingHold && input.troubleshootingHold.inHold);

    var ladder = [];

    /* 0 — troubleshooting hold: highest priority, non-dismissible
     * (Validation Doctrine §7 + Commandment 32). */
    if (holdActive) {
        var step = input.troubleshootingHold.ladderStep;
        ladder.push({
            id: 'troubleshoot-' + step,
            title: TROUBLESHOOT_STEP_TITLE[step] || 'Work through the troubleshooting check',
            detail: 'An earlier miss was bigger than a speed or drag problem explains — work this check before truing again.',
            payoff: 'Clears the hold so truing can resume.',
            action: { type: 'troubleshootingCheck', step: step },
            dismissible: false
        });
    }

    /* 1 — no load/bullet or no MV at all */
    if (!input.hasLoad || !mv || mv.state === 'none') {
        ladder.push({
            id: 'add-load',
            title: 'Add your load & box velocity',
            detail: 'Bullet, BC, and the number on the box — two minutes.',
            payoff: 'Instant DOPE card, estimated.',
            action: { type: 'addLoad' },
            dismissible: true
        });
    }

    /* 2 — zero never confirmed, needs adjustment, or aged out */
    if (zero && (zero.state === 'never' || zero.state === 'adjust' ||
        zero.state === 'stale' || zero.state === 'drifted')) {
        var zTitle, zDetail;
        if (zero.state === 'adjust') {
            zTitle = 'Dial the correction, then confirm your zero';
            zDetail = 'Confirm your zero — shoot a group at 100.';
        } else if (zero.state === 'stale' || zero.state === 'drifted') {
            zTitle = 'Re-confirm your zero';
            zDetail = zero.state === 'drifted'
                ? 'Your zero has moved — shoot a group and confirm it.'
                : 'It has been a while — confirm your zero again.';
        } else {
            zTitle = 'Confirm your zero';
            zDetail = 'Confirm your zero — shoot a group at 100.';
        }
        ladder.push({
            id: 'confirm-zero',
            title: zTitle,
            detail: zDetail,
            payoff: 'Proven at 100.',
            action: { type: 'rangeSession' },
            dismissible: true
        });
    }

    /* 2.5 — Phase C: the current suppressor/barrel doesn't match what
     * the last zero/truing was recorded under (Constitution §12.2). The
     * hold rung already owns "something needs checking" while active,
     * so this stays silent then instead of stacking two warnings. */
    if (input.configCompatNote && !holdActive) {
        ladder.push({
            id: 'config-changed',
            title: 'Confirm zero for this configuration',
            detail: input.configCompatNote,
            payoff: 'Keeps PROVEN TO honest for the setup you\'re actually shooting.',
            action: { type: 'rangeSession' },
            dismissible: true
        });
    }

    /* 3 — MV not measured (estimated / stale / lot change) */
    if (mv && mv.state !== 'measured' && mv.state !== 'none') {
        ladder.push({
            id: 'measure-mv',
            title: mv.state === 'stale' ? 'Re-measure your muzzle velocity' : 'Measure your muzzle velocity',
            detail: 'Clock your bullet speed — or type the box speed.',
            payoff: input.mvTrueYd
                ? 'Extends your proven range to ~' + Number(input.mvTrueYd).toLocaleString() + ' yd.'
                : 'Measured velocity beats the box number.',
            action: { type: 'chrono' },
            dismissible: true
        });
    }

    /* 4/5 — untrued: data ready → true; no data → go get some */
    if (trued && trued.state === 'untrued') {
        var best = _bestDistanceString(input.distanceStrings);
        if (best) {
            ladder.push({
                id: 'true-rifle',
                title: 'True this rifle',
                detail: 'You\'ve got a ' + (best.shotCount || 0) + '-shot string at ' +
                    Number(best.distanceYd).toLocaleString() + ' yd ready.',
                payoff: 'Proven to ' + Number(best.distanceYd).toLocaleString() + '.',
                action: { type: 'truing' },
                dismissible: true
            });
        } else {
            ladder.push({
                id: 'shoot-distance',
                title: 'Check yourself at distance',
                detail: 'Check yourself at distance — tell me where it hit.',
                payoff: 'Unlocks truing to that distance.',
                action: { type: 'steelSession' },
                dismissible: true
            });
        }
    }

    /* 5.5 — trued from one rough observation: one more shot firms it */
    if (trued && trued.state !== 'untrued' && !trued.flagged &&
        trued.confidence === 'Thin' && trued.toYd) {
        ladder.push({
            id: 'confirm-true',
            title: 'One more shot at ' + Number(trued.toYd).toLocaleString() + ' firms it up',
            detail: 'Your number is rough — a second hit makes it trustworthy.',
            payoff: 'Proven to ' + Number(trued.toYd).toLocaleString() + ', solidly.',
            action: { type: 'steelSession' },
            dismissible: true
        });
    }

    /* 6 — trued but confidence capped by unverified tracking */
    if (trued && trued.state !== 'untrued' && tracking &&
        (tracking.state === 'never' || tracking.state === 'stale')) {
        ladder.push({
            id: 'verify-tracking',
            title: 'Verify scope tracking',
            detail: '10 minutes at 100 — most scopes are a few percent off, silently.',
            payoff: 'Confidence to High.',
            action: { type: 'scopeCheck' },
            dismissible: true
        });
    }

    /* 7 — maintenance nudges, only when true */
    if (trued && trued.flagged) {
        ladder.push({
            id: 're-true',
            title: 'Re-true this rifle',
            detail: trued.toYd
                ? 'Your ' + Number(trued.toYd).toLocaleString() + ' dial moved — true it.'
                : 'Your dial moved — true it.',
            payoff: 'Keeps ' + (trued.toYd ? Number(trued.toYd).toLocaleString() + ' yd' : 'your proven range') + ' honest.',
            action: { type: 'truing' },
            dismissible: true
        });
    }
    if (typeof input.roundsSinceCleaning === 'number' &&
        input.roundsSinceCleaning >= (input.cleaningNudgeRounds || 400)) {
        ladder.push({
            id: 'clean-barrel',
            title: 'Log a cleaning',
            detail: Number(input.roundsSinceCleaning).toLocaleString() +
                ' rounds since the last one — worth a look.',
            payoff: 'Keeps the round count honest.',
            action: { type: 'cleaningLog' },
            dismissible: true
        });
    }

    /* Commandment 32: never propose a ballistic correction while an
     * unresolved troubleshooting hold is active -- strip the
     * correction-suggesting rungs entirely (the hold rung above already
     * occupies the "something needs attention" slot). */
    if (holdActive) {
        ladder = ladder.filter(function (r) {
            return r.id !== 'true-rifle' && r.id !== 're-true' && r.id !== 'confirm-true' && r.id !== 'shoot-distance';
        });
    }

    /* first rung not inside its "Not now" window wins */
    for (var i = 0; i < ladder.length; i++) {
        if (!nextActionDismissed(input.dismissals, ladder[i].id, input.now)) {
            return ladder[i];
        }
    }

    /* the floor — never dismissible, never a nag */
    return {
        id: 'go-shoot',
        title: provenYd
            ? 'You\'re proven to ' + Number(provenYd).toLocaleString() + ' — go shoot'
            : 'Go shoot',
        detail: '',
        payoff: '',
        action: { type: 'none' },
        dismissible: false
    };
}

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        NEXT_ACTION_DISMISS_DAYS: NEXT_ACTION_DISMISS_DAYS,
        nextActionDismissed: nextActionDismissed,
        withNextActionDismissal: withNextActionDismissal,
        deriveNextAction: deriveNextAction
    };
}
