/**
 * readiness.js — one shared answer to "is this rifle ready?"
 *
 * Every surface that shows a readiness word or chip (Home recent,
 * the category-screen rifle chip, the rifle switcher, the Rifles
 * tab, the slim rifle page) calls Readiness.assess so the verdict
 * is computed ONE way: latest config-respecting session with a POA
 * verdict, judged by ZeroGuardian.
 *
 *   Readiness.assess(db, rifle) -> Promise<{
 *     state: 'ready' | 'adjust' | 'unchecked',
 *     word:  'READY' | 'ADJUST' | 'NOT CHECKED',
 *     chip:  { kind: 'ready'|'caution'|'problem', text },
 *     note:  one-line evidence sentence (correction / date),
 *     correction: 'X clicks DOWN · Y clicks LEFT' or null,
 *     lastChecked: Date or null,
 *     session: the judged session or null
 *   }>
 *
 * Results are memoized per (rifle id, call wave) via a short TTL so
 * list screens can assess a whole fleet without re-querying per row.
 */

var Readiness = (function () {
    'use strict';

    var _cache = {};       // rifleId -> { at: ms, promise }
    var TTL_MS = 15000;

    function correctionText(verdict) {
        var parts = [];
        if (verdict.elevClicks > 0) {
            parts.push(verdict.elevClicks + ' click' + (verdict.elevClicks === 1 ? '' : 's') + ' ' +
                String(verdict.elevDir || '').toUpperCase());
        }
        if (verdict.windClicks > 0) {
            parts.push(verdict.windClicks + ' click' + (verdict.windClicks === 1 ? '' : 's') + ' ' +
                String(verdict.windDir || '').toUpperCase());
        }
        return parts.length ? parts.join(' · ') : null;
    }

    function assess(db, rifle) {
        if (!db || !rifle || !rifle.id) {
            return Promise.resolve(unchecked(null));
        }
        var hit = _cache[rifle.id];
        if (hit && (Date.now() - hit.at) < TTL_MS) return hit.promise;

        var promise = db.getSessionsByRifle(rifle.id).then(function (sessions) {
            var sorted = (sessions || []).slice().sort(function (a, b) {
                return (b.date || '').localeCompare(a.date || '');
            });
            var latest = null;
            for (var i = 0; i < sorted.length; i++) {
                if (!sorted[i].results || typeof sorted[i].results.atzElevationMOA !== 'number') continue;
                // A bare zero says nothing about the suppressed state
                if (rifle.hasConfigs && sorted[i].config &&
                    sorted[i].config !== (rifle.activeConfig || 'bare')) continue;
                latest = sorted[i];
                break;
            }
            if (!latest || typeof ZeroGuardian === 'undefined') return unchecked(null);

            var verdict = ZeroGuardian.verdictFor(latest.results, rifle.scopeCorrectionFactor);
            if (!verdict) return unchecked(latest);

            var when = latest.date ? new Date(latest.date) : null;
            var whenStr = when ? when.toLocaleDateString() : '';

            if (verdict.confirmed) {
                return {
                    state: 'ready',
                    word: 'READY',
                    chip: { kind: 'ready', text: 'Ready' },
                    note: whenStr ? 'Zero confirmed ' + whenStr : 'Zero confirmed',
                    correction: null,
                    lastChecked: when,
                    session: latest
                };
            }
            var corr = correctionText(verdict);
            return {
                state: 'adjust',
                word: 'ADJUST',
                chip: { kind: 'caution', text: 'Adjust' },
                note: corr
                    ? 'Adjust ' + corr + (whenStr ? ' — last check ' + whenStr : '')
                    : 'Almost there — confirm with one more group',
                correction: corr,
                lastChecked: when,
                session: latest
            };
        }).catch(function () {
            return unchecked(null);
        });

        _cache[rifle.id] = { at: Date.now(), promise: promise };
        return promise;
    }

    function unchecked(session) {
        return {
            state: 'unchecked',
            word: 'NOT CHECKED',
            chip: { kind: 'problem', text: 'Not checked' },
            note: 'Photograph a target and Proven confirms your zero',
            correction: null,
            lastChecked: null,
            session: session || null
        };
    }

    function invalidate(rifleId) {
        if (rifleId) { delete _cache[rifleId]; } else { _cache = {}; }
    }

    return { assess: assess, invalidate: invalidate };
})();

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Readiness: Readiness };
}
