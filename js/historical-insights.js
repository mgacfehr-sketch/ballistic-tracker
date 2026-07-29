/**
 * historical-insights.js — Amendment 1 Phase D / A13: a deterministic
 * whitelist of trigger→insight rules. PURE — no DOM, no storage, no
 * Date.now(). Node-tested: tests/test-historical-insights.js.
 *
 * Evidence & History Doctrine B3 governs the shape of every rule here:
 *   - relevance gate: a rule fires only when it changes what the
 *     shooter should expect/check/decide right now (silence otherwise);
 *   - small-sample honesty: each rule has its own minimum sample before
 *     it may speak at all;
 *   - one statement, not a dashboard: deriveHistoricalInsight returns
 *     AT MOST ONE insight, the highest-priority rule that actually
 *     fires -- never a list;
 *   - every insight carries its evidence level (Part A) and a `basis`
 *     string one tap away (§B3: "which events, how many, over what span").
 *
 * The initial whitelist (A13's own list, minus pre-trip round budgeting,
 * which A14 requires to be request-only and lives in round-budget.js
 * instead): cleaning history, velocity vs. prior lot, rounds since last
 * truing, configuration invalidation notices, repeated spot-check
 * confirmations.
 *
 * Callers gather the plain `ctx` shape below (DB reads, config-memory
 * compatibility notes) -- this module only judges relevance and phrases
 * the result; it never queries anything itself.
 */

var HISTORICAL_INSIGHT_RULES = [
    // Priority 1: a live configuration-compatibility note (Phase C) is
    // the most decision-relevant thing to say right now -- it changes
    // what the shooter should trust about the CURRENT setup, not just
    // color commentary on trend.
    {
        id: 'config-change',
        priority: 1,
        evaluate: function (ctx) {
            if (!ctx.configChangeNote) return null;
            return { id: 'config-change', level: 'INFERRED', text: ctx.configChangeNote, basis: 'current configuration vs. this event\'s recorded configuration' };
        }
    },
    // Priority 2: B2's own canonical example -- "You last trued this
    // rifle 187 rounds ago -- MV has risen 18 fps since."
    {
        id: 'truing-mv-drift',
        priority: 2,
        evaluate: function (ctx) {
            if (typeof ctx.roundsSinceTruing !== 'number' || typeof ctx.mvDeltaSinceTruing !== 'number') return null;
            if (Math.abs(ctx.mvDeltaSinceTruing) < 10) return null; // small-sample/noise honesty floor
            var verb = ctx.mvDeltaSinceTruing > 0 ? 'risen' : 'fallen';
            return {
                id: 'truing-mv-drift', level: 'DERIVED',
                text: 'You last trued this rifle ' + ctx.roundsSinceTruing + ' rounds ago — MV has ' +
                    verb + ' ' + Math.round(Math.abs(ctx.mvDeltaSinceTruing)) + ' fps since.',
                basis: ctx.roundsSinceTruing + ' rounds since the last truing event'
            };
        }
    },
    // Priority 3: B2's own canonical example -- "That's 4 consecutive
    // confirmations at 700 across 3 months."
    {
        id: 'repeated-confirmations',
        priority: 3,
        evaluate: function (ctx) {
            var history = (ctx.spotCheckHistory || []).slice().sort(function (a, b) {
                return String(b.date || '').localeCompare(String(a.date || ''));
            });
            if (!history.length) return null;
            var distance = history[0].distanceYd;
            var count = 0;
            for (var i = 0; i < history.length; i++) {
                if (history[i].distanceYd !== distance) break;
                if (history[i].outcome !== 'confirmed') break;
                count++;
            }
            if (count < 2) return null; // "repeated" needs at least 2
            var span = _monthSpan(history[count - 1].date, history[0].date);
            return {
                id: 'repeated-confirmations', level: 'DERIVED',
                text: 'That\'s ' + count + ' consecutive confirmations at ' + distance +
                    (span ? ' across ' + span : '') + '.',
                basis: count + ' consecutive confirmed spot-checks at ' + distance + ' yd'
            };
        }
    },
    // Priority 4: B2's own canonical example -- "Previous lot averaged
    // 2,846 fps over 63 shots -- watch for a shift."
    {
        id: 'lot-comparison',
        priority: 4,
        evaluate: function (ctx) {
            var prev = ctx.priorLotStats, cur = ctx.currentLotStats;
            if (!prev || !cur) return null;
            if (!(prev.shotCount >= 3) || !(cur.shotCount >= 3)) return null; // small-sample honesty
            var delta = cur.avgFps - prev.avgFps;
            if (Math.abs(delta) < 10) return null;
            return {
                id: 'lot-comparison', level: 'DERIVED',
                text: 'This lot averages ' + Math.round(Math.abs(delta)) + ' fps ' +
                    (delta < 0 ? 'slower' : 'faster') + ' than your previous lot.',
                basis: cur.shotCount + ' shots this lot vs. ' + prev.shotCount + ' shots the previous lot'
            };
        }
    },
    // Priority 5: B2's own canonical example -- "Last three cleaning
    // cycles: 12, 10, 11 fouling shots before groups settled."
    {
        id: 'cleaning-history',
        priority: 5,
        evaluate: function (ctx) {
            var counts = (ctx.cleaningSettlingCounts || []).filter(function (v) { return typeof v === 'number' && isFinite(v); });
            if (counts.length < 3) return null;
            var last3 = counts.slice(0, 3);
            return {
                id: 'cleaning-history', level: 'INFERRED',
                text: 'Last three cleaning cycles: ' + last3.join(', ') + ' fouling shots before groups settled.',
                basis: last3.length + ' most recent cleaning cycles'
            };
        }
    }
];

function _monthSpan(oldIso, newIso) {
    var a = Date.parse(oldIso), b = Date.parse(newIso);
    if (isNaN(a) || isNaN(b) || b < a) return null;
    var months = Math.round((b - a) / (30 * 86400000));
    if (months <= 0) return null;
    return months + ' month' + (months === 1 ? '' : 's');
}

/**
 * At most ONE insight — the highest-priority rule (lowest `priority`
 * number) that actually fires. Silence (null) when nothing qualifies
 * (Evidence & History Doctrine B3: "History never nags").
 */
function deriveHistoricalInsight(ctx) {
    ctx = ctx || {};
    var rules = HISTORICAL_INSIGHT_RULES.slice().sort(function (a, b) { return a.priority - b.priority; });
    for (var i = 0; i < rules.length; i++) {
        var result = rules[i].evaluate(ctx);
        if (result) return result;
    }
    return null;
}

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        HISTORICAL_INSIGHT_RULES: HISTORICAL_INSIGHT_RULES,
        deriveHistoricalInsight: deriveHistoricalInsight
    };
}
