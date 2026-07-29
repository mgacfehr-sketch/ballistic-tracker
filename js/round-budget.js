/**
 * round-budget.js — Amendment 1 A14: pre-trip round budgeting.
 * PURE — no DOM, no storage, no Date.now(). Node-tested:
 * tests/test-round-budget.js.
 *
 * Validation Doctrine §2: "Before a trip the expert asks: when was this
 * rifle last cleaned, how many rounds remain in the cleaning interval,
 * and is that enough to complete today's mission AND leave margin for
 * the hunt? ... The product must answer, per rifle: rounds since
 * cleaning vs. the owner's interval; the estimated round cost of the
 * pending mission; the verdict in plain words."
 *
 * A14: "Round budgeting runs only when the shooter asks or states a
 * planned objective; advisory only; never a capture prerequisite." This
 * module is therefore deliberately NOT wired into next-action.js's
 * always-on coach ladder — it is exposed only through an explicit,
 * user-invoked entry point (a "Planning a trip?" door), matching A14's
 * "request-only" requirement at the architecture level, not just in copy.
 */

var ROUND_BUDGET = {
    // Doctrine's own worked example ("only 10 rounds left before
    // cleaning" was flagged as a bad outcome) -- an implementation
    // default for "too tight to be worth it," not a canon-REQUIRED
    // number (Amendment 1's precedence rule: examples are nonbinding
    // unless labeled REQUIRED).
    LOW_MARGIN_ROUNDS: 15
};

/**
 * input = { roundsSinceCleaning: number, cleaningIntervalRounds: number,
 *           missionRoundCost: number }
 * → { remaining, margin, word: 'clean-first'|'ok', verdict }
 */
function deriveRoundBudget(input) {
    input = input || {};
    var since = typeof input.roundsSinceCleaning === 'number' ? input.roundsSinceCleaning : 0;
    var interval = typeof input.cleaningIntervalRounds === 'number' ? input.cleaningIntervalRounds : 0;
    var cost = typeof input.missionRoundCost === 'number' ? input.missionRoundCost : 0;
    var remaining = interval - since;
    var margin = remaining - cost;

    if (remaining <= 0) {
        return {
            remaining: remaining, margin: margin, word: 'clean-first',
            verdict: 'Clean it first — you\'re already past this barrel\'s usual cleaning interval.'
        };
    }
    if (margin < 0) {
        return {
            remaining: remaining, margin: margin, word: 'clean-first',
            verdict: 'Clean it first — this mission alone would put you ' + Math.abs(margin) +
                ' rounds past your cleaning interval.'
        };
    }
    if (margin < ROUND_BUDGET.LOW_MARGIN_ROUNDS) {
        return {
            remaining: remaining, margin: margin, word: 'clean-first',
            verdict: 'Clean it first — you\'d finish with only ' + margin +
                ' rounds left before cleaning, and you don\'t want to hunt on a dirty-margin barrel.'
        };
    }
    return {
        remaining: remaining, margin: margin, word: 'ok',
        verdict: 'You have the margin — ' + margin + ' rounds left after this mission before your next cleaning.'
    };
}

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ROUND_BUDGET: ROUND_BUDGET, deriveRoundBudget: deriveRoundBudget };
}
