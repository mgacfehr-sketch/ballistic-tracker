/**
 * test-suppressors.js — Amendment 1 Phase C addition: rememberLastUsed
 * writes a config_epochs row only when the suppressor actually CHANGES,
 * never on every use. Run: node tests/test-suppressors.js
 *
 * suppressors.js has no module.exports beyond lastUsedKey (browser-IIFE
 * pattern, no `typeof document` gate needed since nothing in it touches
 * the DOM until addSheet() is actually called) -- this test drives the
 * public `Suppressors` global the require() populates.
 */

var passed = 0;
var failed = 0;

function check(label, actual, expected) {
    var ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

var Suppressors = require('../js/suppressors.js');

/** A minimal fake db: user_settings as an in-memory map, addConfigEpoch spy. */
function fakeDb(initialLastUsed) {
    var settings = {};
    if (initialLastUsed !== undefined) settings['last_suppressor_r1'] = initialLastUsed;
    var epochs = [];
    return {
        _epochs: epochs,
        getUserSetting: function (key) { return Promise.resolve(settings.hasOwnProperty(key) ? settings[key] : null); },
        setUserSetting: function (key, value) { settings[key] = value; return Promise.resolve(value); },
        addConfigEpoch: function (data) { epochs.push(data); return Promise.resolve(data); }
    };
}

function run() {
    return Promise.resolve()
        .then(function () {
            // First-ever use with a real can: never used before -> epoch written.
            var db = fakeDb(undefined);
            return Suppressors.rememberLastUsed(db, 'r1', 'can-1').then(function () {
                check('first-ever use of a real can writes one epoch', db._epochs.length, 1);
                check('epoch carries the suppressor kind/value', { kind: db._epochs[0].kind, value: db._epochs[0].value }, { kind: 'suppressor', value: 'can-1' });
            });
        })
        .then(function () {
            // Re-using the SAME can again: no epoch (not a change).
            var db = fakeDb('can-1');
            return Suppressors.rememberLastUsed(db, 'r1', 'can-1').then(function () {
                check('re-using the same can writes NO epoch', db._epochs.length, 0);
            });
        })
        .then(function () {
            // Switching cans: one epoch.
            var db = fakeDb('can-1');
            return Suppressors.rememberLastUsed(db, 'r1', 'can-2').then(function () {
                check('switching to a different can writes one epoch', db._epochs.length, 1);
                check('epoch value is the NEW can', db._epochs[0].value, 'can-2');
            });
        })
        .then(function () {
            // Going bare from a can: null value, still a real change.
            var db = fakeDb('can-1');
            return Suppressors.rememberLastUsed(db, 'r1', null).then(function () {
                check('going bare from a can writes one epoch', db._epochs.length, 1);
                check('epoch value is null (bare)', db._epochs[0].value, null);
            });
        })
        .then(function () {
            // First-ever use, already bare (never used, staying bare): no real change.
            var db = fakeDb(undefined);
            return Suppressors.rememberLastUsed(db, 'r1', null).then(function () {
                check('first-ever use staying bare writes NO epoch', db._epochs.length, 0);
            });
        })
        .then(function () {
            // No rifleId -> no-op, no throw.
            var db = fakeDb(undefined);
            return Suppressors.rememberLastUsed(db, null, 'can-1').then(function () {
                check('no rifleId is a safe no-op', db._epochs.length, 0);
            });
        })
        .then(function () {
            console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
            process.exit(failed ? 1 : 0);
        })
        .catch(function (err) {
            console.error('FATAL:', err);
            process.exit(1);
        });
}

run();
