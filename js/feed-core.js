/**
 * feed-core.js — "WHAT'S HAPPENED" (Contract v3.0 Part 1, view 1).
 * PURE: merges every event source for one rifle into a single
 * newest-first feed, worded the way Roy would say it out loud.
 *
 * Six event families, per the contract's own list (steel/paper/speed/
 * zero/correction/cleaning):
 *   - a zero-confirming paper session → "Zero confirmed" (the session
 *     row itself is folded in, never shown twice)
 *   - a non-zero paper session        → "Paper session"
 *   - a steel string whose truing event correlates (same distance,
 *     applied within 10 minutes — the simple-lane payoff flow always
 *     saves the string immediately before the correction) → ONE
 *     "Steel at N" item carrying the dial-corrected line
 *   - an uncorrelated steel string    → "Steel at N" (logged, no dial line)
 *   - an uncorrelated truing event (detailed lane, or a simple-mode
 *     correction with no matching string) → "Rifle trued"
 *   - a muzzle-velocity measurement   → "Bullet speed measured"
 *   - a cleaning log                  → "Barrel cleaned"
 *
 * No DOM, no storage, no Date.now(). Node-tested: tests/test-feed-core.js.
 */

var FEED_CORRELATE_MS = 10 * 60 * 1000; // simple-lane string→correction window

function _feedShortDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var today = new Date();
    var sameDay = d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    if (sameDay) return 'Today';
    return (d.getMonth() + 1) + '/' + d.getDate();
}

function _feedItem(id, type, date, title, sub, pending) {
    return { id: id, type: type, date: date || '', title: title, sub: sub, pending: !!pending };
}

function _fmtMOA(v) {
    return (Math.round(Math.abs(v) * 100) / 100).toFixed(2);
}

/**
 * input = {
 *   sessions: [{id, date, distanceYards, impacts, results, isZeroSession, _pending}],
 *   zeroEvents: [{id, date, sessionId, shotCount, distanceYards, groupData:{atzElevationMOA, atzWindageMOA}, _pending}],
 *   steelStrings: [{id, sessionDate, distanceYd, tier, _pending}],
 *   truingEvents: [{id, appliedAt, mode, correctionType, oldValue, newValue,
 *       far:{rangeYds}, inputs:{payoff, dialed}, confidence, _pending}],
 *   mvMeasurements: [{id, date, value, sd, shotCount, source, _pending}],
 *   cleaningLogs: [{id, date, roundCountAtCleaning, _pending}]
 * }
 * → [{id, type, date, title, sub, pending}] newest-first
 */
function buildFeed(input) {
    input = input || {};
    var items = [];
    var zeroBySession = {};
    (input.zeroEvents || []).forEach(function (z) {
        if (z && z.sessionId) zeroBySession[z.sessionId] = z;
    });

    // steel strings consumed by a correlated truing event get skipped
    // when the string is emitted below; track by string id.
    var consumedStrings = {};
    var strings = input.steelStrings || [];

    (input.truingEvents || []).forEach(function (te) {
        if (!te) return;
        var match = null;
        if (te.far && typeof te.far.rangeYds === 'number') {
            strings.forEach(function (st) {
                if (match || consumedStrings[st.id]) return;
                if (st.distanceYd !== te.far.rangeYds) return;
                var dt = Math.abs(Date.parse(st.sessionDate) - Date.parse(te.appliedAt));
                if (isFinite(dt) && dt <= FEED_CORRELATE_MS) match = st;
            });
        }
        if (match) {
            consumedStrings[match.id] = true;
            var payoff = te.inputs && te.inputs.payoff;
            var sub = _feedShortDate(te.appliedAt);
            if (payoff && typeof payoff.oldDial === 'number' && typeof payoff.newDial === 'number') {
                sub += payoff.moved
                    ? ' · dial corrected ' + payoff.oldDial.toFixed(1) + ' → ' + payoff.newDial.toFixed(1)
                    : ' · dial barely moved';
            } else {
                sub += ' · correction applied';
            }
            items.push(_feedItem(match.id, 'steel', te.appliedAt,
                'Steel at ' + match.distanceYd, sub, match._pending || te._pending));
        } else {
            var isBc = te.correctionType === 'bc';
            var what = isBc
                ? 'BC ' + Number(te.oldValue).toFixed(3) + ' → ' + Number(te.newValue).toFixed(3)
                : 'speed ' + Math.round(te.oldValue) + ' → ' + Math.round(te.newValue) + ' fps';
            items.push(_feedItem(te.id, 'correction', te.appliedAt,
                'Rifle trued', _feedShortDate(te.appliedAt) + ' · ' + what, te._pending));
        }
    });

    strings.forEach(function (st) {
        if (!st || consumedStrings[st.id]) return;
        items.push(_feedItem(st.id, 'steel', st.sessionDate,
            'Steel at ' + st.distanceYd, _feedShortDate(st.sessionDate), st._pending));
    });

    (input.sessions || []).forEach(function (s) {
        if (!s) return;
        var z = zeroBySession[s.id];
        if (s.isZeroSession && z) {
            var gd = z.groupData || {};
            var offset = (typeof gd.atzElevationMOA === 'number' && typeof gd.atzWindageMOA === 'number')
                ? Math.sqrt(gd.atzElevationMOA * gd.atzElevationMOA + gd.atzWindageMOA * gd.atzWindageMOA)
                : null;
            items.push(_feedItem(z.id, 'zero', z.date, 'Zero confirmed',
                _feedShortDate(z.date) + ' · ' + (z.shotCount || 0) + ' shots' +
                (offset !== null ? ' · ' + _fmtMOA(offset) + ' MOA' : ''),
                s._pending || z._pending));
            return;
        }
        var shots = s.impacts ? s.impacts.length : 0;
        var moa = s.results && typeof s.results.groupSizeMOA === 'number'
            ? _fmtMOA(s.results.groupSizeMOA) + ' MOA' : null;
        items.push(_feedItem(s.id, 'paper', s.date, 'Paper session',
            _feedShortDate(s.date) + ' · ' + shots + ' shots' + (moa ? ' · ' + moa : ''),
            s._pending));
    });

    // zero events with no matching session (manual/other source) still count
    (input.zeroEvents || []).forEach(function (z) {
        if (!z || !z.sessionId) {
            if (z) {
                items.push(_feedItem(z.id, 'zero', z.date, 'Zero confirmed',
                    _feedShortDate(z.date) + ' · ' + (z.shotCount || 0) + ' shots', z._pending));
            }
            return;
        }
        var owned = (input.sessions || []).some(function (s) { return s.id === z.sessionId; });
        if (!owned) {
            items.push(_feedItem(z.id, 'zero', z.date, 'Zero confirmed',
                _feedShortDate(z.date) + ' · ' + (z.shotCount || 0) + ' shots', z._pending));
        }
    });

    (input.mvMeasurements || []).forEach(function (m) {
        if (!m) return;
        var bits = [Math.round(m.value) + ' fps'];
        if (typeof m.sd === 'number') bits[0] += ' ± ' + Math.round(m.sd);
        if (m.shotCount) bits.push(m.shotCount + ' shots');
        items.push(_feedItem(m.id, 'speed', m.date,
            m.source === 'manual' ? 'Bullet speed typed in' : 'Bullet speed measured',
            _feedShortDate(m.date) + ' · ' + bits.join(' · '), m._pending));
    });

    (input.cleaningLogs || []).forEach(function (c) {
        if (!c) return;
        items.push(_feedItem(c.id, 'cleaning', c.date, 'Barrel cleaned',
            _feedShortDate(c.date) + (typeof c.roundCountAtCleaning === 'number'
                ? ' · at ' + Number(c.roundCountAtCleaning).toLocaleString() + ' rounds' : ''),
            c._pending));
    });

    items.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    return items;
}

/**
 * v3.0 §7 (view 7, the record screen): the same string↔truing-event
 * correlation buildFeed uses internally, exposed standalone so the
 * record view can find "what correction came from this string" without
 * re-deriving the whole feed. Pure, same rule (same distance, applied
 * within FEED_CORRELATE_MS of the string's session date).
 */
function findTruingForString(st, truingEvents) {
    if (!st) return null;
    var match = null;
    (truingEvents || []).forEach(function (te) {
        if (match || !te || !te.far || typeof te.far.rangeYds !== 'number') return;
        if (st.distanceYd !== te.far.rangeYds) return;
        var dt = Math.abs(Date.parse(st.sessionDate) - Date.parse(te.appliedAt));
        if (isFinite(dt) && dt <= FEED_CORRELATE_MS) match = te;
    });
    return match;
}

/**
 * The embedded drop chart's 4 "nearest-relevant" rows (view 1): the
 * proven-to distance and the three 100-yd steps below it, so the row
 * Roy cares about most is always the last (hot) one. When proven-to is
 * small, pads forward from 100 instead so the chart is never sparse.
 */
function pickDropRows(hotYd) {
    var hot = Math.max(100, Math.round((hotYd || 100) / 100) * 100);
    var rows = [hot - 300, hot - 200, hot - 100, hot].filter(function (v) { return v >= 100; });
    while (rows.length < 4) rows.push(rows[rows.length - 1] + 100);
    return rows;
}

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildFeed: buildFeed, FEED_CORRELATE_MS: FEED_CORRELATE_MS, pickDropRows: pickDropRows, findTruingForString: findTruingForString };
}
