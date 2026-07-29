/**
 * config-memory.js — per-rifle carry-forward state + the minimal
 * compatibility/invalidation service (Amendment 1 Phase C; Constitution
 * §12.1-12.2, §120; Amendment A12, A15).
 *
 * Two jobs, kept together because Amendment 1 Phase C ships them
 * together ("memory + minimal invalidation, together"):
 *
 *  1. deriveCurrentState — given the append-only config_epochs ledger
 *     (kind: 'suppressor' | 'lot'), derive what's CURRENT for a rifle.
 *     An explicit current-state fact outranks inference (A15); this is
 *     pure "latest wins" over an append-only log, same shape as
 *     calibration-status.js's _latestBy pattern (deliberately reused so
 *     a future reader recognizes the idiom).
 *
 *  2. checkCompatibility — Constitution §120's "Compatibility and
 *     Invalidation Service," centralized here so it is never
 *     re-implemented ad hoc in a UI module (§120: "These rules must be
 *     centralized and tested"). Compares a historical event's own
 *     captured configuration (suppressor/lot/barrel) against the
 *     rifle's CURRENT configuration and reports what that implies per
 *     the Constitution §12.2 table:
 *       - barrel change  -> HARD invalidates zero, truing, AND the
 *         velocity baseline (a different barrel is a different rifle,
 *         ballistically)
 *       - suppressor change -> HARD invalidates zero and the velocity
 *         baseline for cross-configuration comparison, but per A12 the
 *         OTHER configuration's history is preserved as its own
 *         candidate solution, not destroyed — reattaching restores it
 *       - lot change -> SOFT note only ("comparable, not identical");
 *         does not itself invalidate zero or truing (Constitution:
 *         "Velocity baseline and possibly zero; prior lot remains
 *         comparable but not identical" — the "possibly zero" case is
 *         judgment-call territory intentionally NOT hard-coded here)
 *
 * This module does NOT touch calibration-status.js's frozen contract
 * (Gate 0 hash lock) — it is a caller-side pre-check, exactly the
 * "centralized service" pattern §120 asks for, kept as its own tested
 * engine rather than blended into the frozen rollup's inputs.
 *
 * PURE — no DOM, no storage, no Date.now(). Node-tested:
 * tests/test-config-memory.js.
 */

/** Epoch kinds this ledger tracks. Barrel epochs are NOT stored here —
 *  they already exist as barrels.install_date/is_active; this constant
 *  exists so callers don't hand-type the string literals. */
var CONFIG_MEMORY_KINDS = { SUPPRESSOR: 'suppressor', LOT: 'lot' };

/** Latest-by-startedAt entry in an epoch list. Mirrors calibration-status.js's _latestBy. */
function _latestConfigEpoch(list) {
    var best = null;
    (list || []).forEach(function (e) {
        if (!e || !e.startedAt) return;
        if (!best || String(e.startedAt) > String(best.startedAt)) best = e;
    });
    return best;
}

/**
 * Derive current suppressor/lot state from the append-only epoch ledger.
 * input = { suppressorEpochs: [{value, startedAt}], lotEpochs: [{value, startedAt}] }
 * → { suppressor: {value, since}|null, lot: {value, since}|null }
 * `value` for suppressor is a suppressor_id (or null = bare); for lot it
 * is the lot text. No epochs at all → null (A15: "the acquisition
 * hierarchy applies only when no sufficiently current explicit state
 * exists" — null here is the caller's cue to fall back to whatever
 * legacy field it already reads, e.g. loads.lotNumber).
 */
function deriveCurrentState(input) {
    input = input || {};
    var s = _latestConfigEpoch(input.suppressorEpochs);
    var l = _latestConfigEpoch(input.lotEpochs);
    return {
        suppressor: s ? { value: s.value, since: s.startedAt } : null,
        lot: l ? { value: l.value, since: l.startedAt } : null
    };
}

/** Normalize a suppressor id for comparison: null/undefined/'' all mean "bare." */
function _normSuppressor(v) {
    return (v === undefined || v === null || v === '') ? null : v;
}

/**
 * The compatibility/invalidation service (Constitution §120).
 *
 * input = {
 *   currentSuppressorId: string|null|undefined,   // undefined = unknown, don't judge
 *   currentLotNumber: string|null|undefined,
 *   currentBarrelId: string|null|undefined,
 *   eventSuppressorId, eventLotNumber, eventBarrelId: same shapes, for the historical event
 * }
 * → {
 *   verdict: 'compatible'|'lot-changed'|'suppressor-changed'|'barrel-changed',
 *   compatible: boolean,
 *   invalidatesZero: boolean,
 *   invalidatesTruing: boolean,
 *   invalidatesVelocityBaseline: boolean,
 *   note: string|null
 * }
 *
 * Precedence: barrel > suppressor > lot (a barrel change is the most
 * severe — Constitution §12.2's "New barrel" row invalidates the most).
 * Any comparison where either side is `undefined` (genuinely unknown,
 * e.g. a legacy row with no barrel_id) is skipped for that dimension —
 * never fabricate a mismatch from missing data.
 */
function checkCompatibility(input) {
    input = input || {};

    var barrelKnown = input.currentBarrelId !== undefined && input.eventBarrelId !== undefined;
    var barrelChanged = barrelKnown && (input.currentBarrelId || null) !== (input.eventBarrelId || null);

    var suppressorKnown = input.currentSuppressorId !== undefined && input.eventSuppressorId !== undefined;
    var suppressorChanged = suppressorKnown &&
        _normSuppressor(input.currentSuppressorId) !== _normSuppressor(input.eventSuppressorId);

    var lotKnown = !!(input.currentLotNumber && input.eventLotNumber);
    var lotChanged = lotKnown && input.currentLotNumber !== input.eventLotNumber;

    if (barrelChanged) {
        return {
            verdict: 'barrel-changed',
            compatible: false,
            invalidatesZero: true,
            invalidatesTruing: true,
            invalidatesVelocityBaseline: true,
            note: 'New barrel since this event — zero, truing, and velocity baseline need reconfirmation on the current barrel.'
        };
    }
    if (suppressorChanged) {
        return {
            verdict: 'suppressor-changed',
            compatible: false,
            invalidatesZero: true,
            invalidatesTruing: false,
            invalidatesVelocityBaseline: true,
            note: 'Different muzzle configuration than this event — that configuration\'s zero and velocity are preserved separately, not blended with the current one.'
        };
    }
    if (lotChanged) {
        return {
            verdict: 'lot-changed',
            compatible: true,
            invalidatesZero: false,
            invalidatesTruing: false,
            invalidatesVelocityBaseline: false,
            note: 'Different ammunition lot than this event — comparable, not identical.'
        };
    }
    return {
        verdict: 'compatible',
        compatible: true,
        invalidatesZero: false,
        invalidatesTruing: false,
        invalidatesVelocityBaseline: false,
        note: null
    };
}

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CONFIG_MEMORY_KINDS: CONFIG_MEMORY_KINDS,
        deriveCurrentState: deriveCurrentState,
        checkCompatibility: checkCompatibility
    };
}
