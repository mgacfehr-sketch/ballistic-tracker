/**
 * test-config-memory.js — carry-forward current state + the
 * compatibility/invalidation service (Amendment 1 Phase C).
 * Run: node tests/test-config-memory.js
 */

var passed = 0;
var failed = 0;

function check(label, actual, expected) {
    var ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

var CM = require('../js/config-memory.js');

// ── deriveCurrentState ──────────────────────────────────────────

check('no epochs at all -> both null',
    CM.deriveCurrentState({ suppressorEpochs: [], lotEpochs: [] }),
    { suppressor: null, lot: null });

check('single suppressor epoch -> that value',
    CM.deriveCurrentState({
        suppressorEpochs: [{ value: 'can-1', startedAt: '2026-01-01T00:00:00Z' }],
        lotEpochs: []
    }),
    { suppressor: { value: 'can-1', since: '2026-01-01T00:00:00Z' }, lot: null });

check('latest of multiple lot epochs wins regardless of array order',
    CM.deriveCurrentState({
        suppressorEpochs: [],
        lotEpochs: [
            { value: 'LOT-B', startedAt: '2026-03-01T00:00:00Z' },
            { value: 'LOT-A', startedAt: '2026-01-01T00:00:00Z' }
        ]
    }),
    { suppressor: null, lot: { value: 'LOT-B', since: '2026-03-01T00:00:00Z' } });

check('null-value suppressor epoch (explicit "went bare") is a real current state, not absence',
    CM.deriveCurrentState({
        suppressorEpochs: [
            { value: 'can-1', startedAt: '2026-01-01T00:00:00Z' },
            { value: null, startedAt: '2026-02-01T00:00:00Z' }
        ],
        lotEpochs: []
    }),
    { suppressor: { value: null, since: '2026-02-01T00:00:00Z' }, lot: null });

check('entries missing startedAt are ignored',
    CM.deriveCurrentState({
        suppressorEpochs: [{ value: 'can-1' }],
        lotEpochs: []
    }),
    { suppressor: null, lot: null });

// ── checkCompatibility ──────────────────────────────────────────

function base() {
    return {
        currentSuppressorId: null, eventSuppressorId: null,
        currentLotNumber: 'LOT-A', eventLotNumber: 'LOT-A',
        currentBarrelId: 'b1', eventBarrelId: 'b1'
    };
}

check('everything matches -> compatible, nothing invalidated',
    CM.checkCompatibility(base()),
    { verdict: 'compatible', compatible: true, invalidatesZero: false, invalidatesTruing: false, invalidatesVelocityBaseline: false, note: null });

var barrelChanged = CM.checkCompatibility(Object.assign(base(), { eventBarrelId: 'b0' }));
check('barrel change -> hard-invalidates zero+truing+velocity', {
    verdict: barrelChanged.verdict, compatible: barrelChanged.compatible,
    invalidatesZero: barrelChanged.invalidatesZero, invalidatesTruing: barrelChanged.invalidatesTruing,
    invalidatesVelocityBaseline: barrelChanged.invalidatesVelocityBaseline
}, { verdict: 'barrel-changed', compatible: false, invalidatesZero: true, invalidatesTruing: true, invalidatesVelocityBaseline: true });

var suppChanged = CM.checkCompatibility(Object.assign(base(), { currentSuppressorId: 'can-1', eventSuppressorId: null }));
check('suppressor change (bare event, current has a can) -> invalidates zero+velocity, NOT truing', {
    verdict: suppChanged.verdict, compatible: suppChanged.compatible,
    invalidatesZero: suppChanged.invalidatesZero, invalidatesTruing: suppChanged.invalidatesTruing,
    invalidatesVelocityBaseline: suppChanged.invalidatesVelocityBaseline
}, { verdict: 'suppressor-changed', compatible: false, invalidatesZero: true, invalidatesTruing: false, invalidatesVelocityBaseline: true });

check('suppressor "" and null are both treated as bare (no false-positive change)',
    CM.checkCompatibility(Object.assign(base(), { currentSuppressorId: '', eventSuppressorId: null })).verdict,
    'compatible');

var lotChanged = CM.checkCompatibility(Object.assign(base(), { eventLotNumber: 'LOT-B' }));
check('lot change -> soft note only, still compatible', {
    verdict: lotChanged.verdict, compatible: lotChanged.compatible,
    invalidatesZero: lotChanged.invalidatesZero, invalidatesTruing: lotChanged.invalidatesTruing,
    invalidatesVelocityBaseline: lotChanged.invalidatesVelocityBaseline
}, { verdict: 'lot-changed', compatible: true, invalidatesZero: false, invalidatesTruing: false, invalidatesVelocityBaseline: false });
check('lot change note is non-null', typeof lotChanged.note === 'string' && lotChanged.note.length > 0, true);

check('barrel takes precedence over a simultaneous suppressor change',
    CM.checkCompatibility(Object.assign(base(), { eventBarrelId: 'b0', currentSuppressorId: 'can-1', eventSuppressorId: null })).verdict,
    'barrel-changed');

check('suppressor takes precedence over a simultaneous lot change',
    CM.checkCompatibility(Object.assign(base(), { currentSuppressorId: 'can-1', eventSuppressorId: null, eventLotNumber: 'LOT-B' })).verdict,
    'suppressor-changed');

check('unknown barrel (event side undefined) is never judged -- no fabricated mismatch',
    CM.checkCompatibility({
        currentSuppressorId: null, eventSuppressorId: null,
        currentLotNumber: 'LOT-A', eventLotNumber: 'LOT-A',
        currentBarrelId: 'b1', eventBarrelId: undefined
    }).verdict,
    'compatible');

check('unknown suppressor (both sides undefined, legacy row) is never judged',
    CM.checkCompatibility({
        currentSuppressorId: undefined, eventSuppressorId: undefined,
        currentLotNumber: 'LOT-A', eventLotNumber: 'LOT-A',
        currentBarrelId: 'b1', eventBarrelId: 'b1'
    }).verdict,
    'compatible');

check('missing lot on either side is never judged (unknown, not a mismatch)',
    CM.checkCompatibility({
        currentSuppressorId: null, eventSuppressorId: null,
        currentLotNumber: 'LOT-A', eventLotNumber: null,
        currentBarrelId: 'b1', eventBarrelId: 'b1'
    }).verdict,
    'compatible');

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
