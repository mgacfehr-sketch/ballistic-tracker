/**
 * test-validation-status.js — Amendment 1 Phase D pure engines.
 * Run: node tests/test-validation-status.js
 */

var passed = 0;
var failed = 0;

function check(label, actual, expected) {
    var ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

var VS = require('../js/validation-status.js');

// ── deriveSettlingStatus ─────────────────────────────────────

check('unknown rounds since cleaning -> not in settling, no fabricated remaining',
    VS.deriveSettlingStatus({ roundsSinceCleaning: null }),
    { inSettling: false, roundsRemaining: null, label: null });

var s1 = VS.deriveSettlingStatus({ roundsSinceCleaning: 5 });
check('5 rounds since cleaning (default 12) -> settling, 7 remaining', { inSettling: s1.inSettling, roundsRemaining: s1.roundsRemaining }, { inSettling: true, roundsRemaining: 7 });
check('settling label mentions remaining count', s1.label.indexOf('7 more shots') !== -1, true);

var s2 = VS.deriveSettlingStatus({ roundsSinceCleaning: 1, settlingLength: 2 });
check('1 of 2 remaining uses singular "shot"', s2.label.indexOf('1 more shot ') !== -1, true);

check('rounds since cleaning past settling length -> not settling',
    VS.deriveSettlingStatus({ roundsSinceCleaning: 12 }),
    { inSettling: false, roundsRemaining: 0, label: null });

check('custom settlingLength honored',
    VS.deriveSettlingStatus({ roundsSinceCleaning: 5, settlingLength: 20 }).roundsRemaining,
    15);

// ── computeBaseline ──────────────────────────────────────────

check('fewer than 2 samples -> null (not enough history, never fabricated)',
    VS.computeBaseline([0.2]), null);
check('empty/no samples -> null', VS.computeBaseline([]), null);

var baseline = VS.computeBaseline([0.1, 0.3, 0.2, 0.2]);
check('baseline mean is correct', Math.round(baseline.meanMOA * 100) / 100, 0.2);
check('baseline sample size is correct', baseline.sampleSize, 4);
check('baseline sd is non-negative', baseline.sdMOA >= 0, true);

check('non-finite/non-number samples are filtered out',
    VS.computeBaseline([0.2, NaN, undefined, 0.2]).sampleSize, 2);

// ── deriveSpotCheckOutcome ───────────────────────────────────

check('no baseline, small error -> drift (never "confirmed" without a baseline)',
    VS.deriveSpotCheckOutcome({ observedErrorMOA: 0.3, baseline: null }), 'drift');
check('no baseline, error at the 1 MOA fallback -> alarm',
    VS.deriveSpotCheckOutcome({ observedErrorMOA: 1.0, baseline: null }), 'alarm');
check('no baseline, error just under 1 MOA -> drift',
    VS.deriveSpotCheckOutcome({ observedErrorMOA: 0.99, baseline: null }), 'drift');
check('baseline with too-thin sample (1) behaves like no baseline',
    VS.deriveSpotCheckOutcome({ observedErrorMOA: 1.2, baseline: { meanMOA: 0, sdMOA: 0.1, sampleSize: 1 } }), 'alarm');

var tightBaseline = { meanMOA: 0.2, sdMOA: 0.05, sampleSize: 6 };
check('within tight baseline tolerance -> confirmed',
    VS.deriveSpotCheckOutcome({ observedErrorMOA: 0.22, baseline: tightBaseline }), 'confirmed');
check('moderate deviation from tight baseline -> drift',
    VS.deriveSpotCheckOutcome({ observedErrorMOA: 0.65, baseline: tightBaseline }), 'drift');
check('gross deviation from tight baseline -> alarm',
    VS.deriveSpotCheckOutcome({ observedErrorMOA: 1.5, baseline: tightBaseline }), 'alarm');

var wideBaseline = { meanMOA: 0.2, sdMOA: 0.4, sampleSize: 8 };
check('a noisy baseline widens the confirmed tolerance accordingly',
    VS.deriveSpotCheckOutcome({ observedErrorMOA: 0.7, baseline: wideBaseline }), 'confirmed');

// ── oneShotCheckCopy ──────────────────────────────────────────

check('one-shot alarm language never mentions "confirmed" or zero status',
    VS.oneShotCheckCopy('alarm').toLowerCase().indexOf('confirm') === -1, true);
check('one-shot alarm copy', VS.oneShotCheckCopy('alarm'), 'Travel check flagged — stop and check zero before you hunt.');
check('one-shot pass copy says "passed", never "confirmed"',
    VS.oneShotCheckCopy('drift'), 'Travel check passed — no gross shift observed.');
check('one-shot pass copy for a confirmed-classified single shot is identical wording (A5: never a stronger claim)',
    VS.oneShotCheckCopy('confirmed'), 'Travel check passed — no gross shift observed.');

// ── deriveTroubleshootingHold ─────────────────────────────────

check('no alarm at all -> never in hold',
    VS.deriveTroubleshootingHold({ alarmAt: null, checks: [] }),
    { inHold: false, ladderStep: null, nextCheck: null });

check('alarm with no checks since -> hold, first ladder step (zero)',
    VS.deriveTroubleshootingHold({ alarmAt: '2026-07-01T00:00:00Z', checks: [] }),
    { inHold: true, ladderStep: 'zero', nextCheck: 'zero' });

check('a check BEFORE the alarm does not count toward exit',
    VS.deriveTroubleshootingHold({
        alarmAt: '2026-07-10T00:00:00Z',
        checks: [{ step: 'zero', result: 'resolved', at: '2026-07-01T00:00:00Z' }]
    }),
    { inHold: true, ladderStep: 'zero', nextCheck: 'zero' });

check('a non-resolving check after the alarm advances the ladder step but stays in hold',
    VS.deriveTroubleshootingHold({
        alarmAt: '2026-07-01T00:00:00Z',
        checks: [{ step: 'zero', result: 'ok_no_issue_but_not_resolving', at: '2026-07-02T00:00:00Z' }]
    }).ladderStep,
    'mount');

check('a "resolved" check after the alarm clears the hold entirely',
    VS.deriveTroubleshootingHold({
        alarmAt: '2026-07-01T00:00:00Z',
        checks: [
            { step: 'zero', result: 'issue_found', at: '2026-07-02T00:00:00Z' },
            { step: 'mount', result: 'resolved', at: '2026-07-03T00:00:00Z' }
        ]
    }),
    { inHold: false, ladderStep: null, nextCheck: null });

check('an "ok" result (checked, nothing wrong) ADVANCES the ladder but does NOT clear the hold -- only "resolved" does',
    VS.deriveTroubleshootingHold({
        alarmAt: '2026-07-01T00:00:00Z',
        checks: [{ step: 'zero', result: 'ok', at: '2026-07-02T00:00:00Z' }]
    }),
    { inHold: true, ladderStep: 'mount', nextCheck: 'mount' });

check('walking all four rungs "ok" without ever resolving stays in hold at "builder"',
    VS.deriveTroubleshootingHold({
        alarmAt: '2026-07-01T00:00:00Z',
        checks: [
            { step: 'zero', result: 'ok', at: '2026-07-02T00:00:00Z' },
            { step: 'mount', result: 'ok', at: '2026-07-03T00:00:00Z' },
            { step: 'velocity', result: 'ok', at: '2026-07-04T00:00:00Z' }
        ]
    }),
    { inHold: true, ladderStep: 'builder', nextCheck: 'builder' });

check('"resolved" at the FIRST rung clears the hold immediately (no need to walk the whole ladder)',
    VS.deriveTroubleshootingHold({
        alarmAt: '2026-07-01T00:00:00Z',
        checks: [{ step: 'zero', result: 'resolved', at: '2026-07-02T00:00:00Z' }]
    }).inHold,
    false);

check('ladder never overruns past "builder"',
    VS.deriveTroubleshootingHold({
        alarmAt: '2026-07-01T00:00:00Z',
        checks: [{ step: 'builder', result: 'issue_found', at: '2026-07-02T00:00:00Z' }]
    }).ladderStep,
    'builder');

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
