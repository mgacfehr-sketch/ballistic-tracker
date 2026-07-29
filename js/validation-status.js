/**
 * validation-status.js — Amendment 1 Phase D: settling segments,
 * spot-check three-outcome classification, one-shot check language, and
 * the troubleshooting hold. PURE — no DOM, no storage, no Date.now().
 * Node-tested: tests/test-validation-status.js.
 *
 * This does NOT replace calibration-status.js's frozen four-element
 * rollup (Amendment A4: "the existing four-segment status model is the
 * correct skeleton") — it adds the independent statuses A4 says were
 * still missing: settling segment, spot-check outcome, and the
 * troubleshooting hold. Callers compose these alongside the frozen
 * rollup; nothing here reaches into calibration-status.js's contract.
 */

var VALIDATION_STATUS = {
    // A7: "owner default, initial 12" -- an owner PREFERENCE, not a
    // canon-mandated number (Amendment 1's own precedence rule: examples
    // and approximate numbers are nonbinding unless labeled REQUIRED).
    // Amendment A7 explicitly defers a LEARNED per-barrel length until a
    // validated method exists -- this constant is only the placeholder
    // used until then.
    SETTLING_DEFAULT_SHOTS: 12,
    // A10 REQUIRED language: "a fixed ~1 MOA fallback applies only when
    // no baseline exists" / Validation Doctrine §6: "gross error (>=1
    // MOA class)". This ONE number is canon-stated; the SD multipliers
    // below are implementation defaults, not canon numbers.
    SPOTCHECK_ALARM_MOA: 1.0,
    SPOTCHECK_CONFIRM_SD_MULT: 1.5,
    SPOTCHECK_ALARM_SD_MULT: 3,
    // Validation Doctrine §7 ladder, in order.
    TROUBLESHOOTING_LADDER: ['zero', 'mount', 'velocity', 'builder']
};

/**
 * Post-cleaning settling segment (A6: "the first N post-cleaning shots
 * ... are LABELED a settling segment -- preserved, never auto-excluded;
 * analyses may down-weight with the label visible").
 * input = { roundsSinceCleaning: number|null, settlingLength?: number }
 * → { inSettling, roundsRemaining, label }
 */
function deriveSettlingStatus(input) {
    input = input || {};
    if (typeof input.roundsSinceCleaning !== 'number') {
        return { inSettling: false, roundsRemaining: null, label: null };
    }
    var length = typeof input.settlingLength === 'number'
        ? input.settlingLength : VALIDATION_STATUS.SETTLING_DEFAULT_SHOTS;
    var remaining = length - input.roundsSinceCleaning;
    if (remaining > 0) {
        return {
            inSettling: true,
            roundsRemaining: remaining,
            label: 'Settling — ' + remaining + ' more shot' + (remaining === 1 ? '' : 's') +
                ' before this counts as a clean baseline'
        };
    }
    return { inSettling: false, roundsRemaining: 0, label: null };
}

/**
 * Mean + SD over compatible prior residuals (already computed by the
 * caller, in MOA, using js/config-memory.js's checkCompatibility to
 * decide which prior observations qualify). Returns null when there
 * isn't enough sample to be a baseline at all (A10: small-sample
 * honesty -- "not enough history" beats a fabricated baseline).
 */
function computeBaseline(samples) {
    var vals = (samples || []).filter(function (v) { return typeof v === 'number' && isFinite(v); });
    if (vals.length < 2) return null;
    var mean = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    var variance = vals.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / vals.length;
    return { meanMOA: mean, sdMOA: Math.sqrt(variance), sampleSize: vals.length };
}

/**
 * Spot-check three-outcome classification (A10). Never fabricates
 * "confirmed" without a baseline to confirm against -- pre-baseline,
 * the only defined rule is the fixed ~1 MOA alarm fallback (A10's own
 * words), so classification degrades to a binary alarm/drift.
 * input = { observedErrorMOA: number, baseline: {meanMOA,sdMOA,sampleSize}|null }
 * → 'confirmed' | 'drift' | 'alarm'
 */
function deriveSpotCheckOutcome(input) {
    input = input || {};
    var err = typeof input.observedErrorMOA === 'number' ? input.observedErrorMOA : 0;
    var baseline = input.baseline || null;
    if (!baseline || baseline.sampleSize < 2) {
        return Math.abs(err) >= VALIDATION_STATUS.SPOTCHECK_ALARM_MOA ? 'alarm' : 'drift';
    }
    var residual = Math.abs(err - baseline.meanMOA);
    var confirmTol = Math.max(baseline.sdMOA * VALIDATION_STATUS.SPOTCHECK_CONFIRM_SD_MULT, 0.3);
    var alarmTol = Math.max(VALIDATION_STATUS.SPOTCHECK_ALARM_MOA, baseline.sdMOA * VALIDATION_STATUS.SPOTCHECK_ALARM_SD_MULT);
    if (residual <= confirmTol) return 'confirmed';
    if (residual > alarmTol) return 'alarm';
    return 'drift';
}

/**
 * A5: "A one-shot check detects gross shift only ... It never confirms,
 * refreshes, or degrades confirmed-zero status; only the zero protocol
 * does." Fixed language, two outcomes only (a one-shot travel check is
 * never itself a 'confirmed'-with-baseline event -- it only ever says
 * pass/fail on gross shift).
 */
function oneShotCheckCopy(outcome) {
    return outcome === 'alarm'
        ? 'Travel check flagged — stop and check zero before you hunt.'
        : 'Travel check passed — no gross shift observed.';
}

/**
 * The troubleshooting hold (Validation Doctrine §7 + A10's "do NOT
 * true. Invalidate, route to the troubleshooting ladder"). Entry: an
 * alarm outcome with no resolving check since. Exit: a check logged
 * AFTER the alarm reporting 'resolved' or 'ok'. While in hold, the
 * caller must not propose a ballistic correction (Commandment 32) --
 * this function only reports the state; enforcing the "don't true"
 * rule is the caller's job (next-action.js / rifle-payoff.js).
 * input = { alarmAt: iso|null, checks: [{step, result, at}], now }
 * → { inHold, ladderStep, nextCheck }
 */
function deriveTroubleshootingHold(input) {
    input = input || {};
    if (!input.alarmAt) return { inHold: false, ladderStep: null, nextCheck: null };
    var resolved = false;
    var lastStepDone = null;
    (input.checks || []).forEach(function (c) {
        if (!c || !c.at || String(c.at) < String(input.alarmAt)) return;
        if (c.result === 'resolved' || c.result === 'ok') resolved = true;
        lastStepDone = c.step;
    });
    if (resolved) return { inHold: false, ladderStep: null, nextCheck: null };
    var ladder = VALIDATION_STATUS.TROUBLESHOOTING_LADDER;
    var nextIdx = lastStepDone ? ladder.indexOf(lastStepDone) + 1 : 0;
    if (nextIdx < 0) nextIdx = 0;
    if (nextIdx >= ladder.length) nextIdx = ladder.length - 1;
    return { inHold: true, ladderStep: ladder[nextIdx], nextCheck: ladder[nextIdx] };
}

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        VALIDATION_STATUS: VALIDATION_STATUS,
        deriveSettlingStatus: deriveSettlingStatus,
        computeBaseline: computeBaseline,
        deriveSpotCheckOutcome: deriveSpotCheckOutcome,
        oneShotCheckCopy: oneShotCheckCopy,
        deriveTroubleshootingHold: deriveTroubleshootingHold
    };
}
