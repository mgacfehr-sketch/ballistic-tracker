/**
 * test-onboarding.js — Unit tests for the OCR reply parser (pure part
 * of onboarding.js). Run: node tests/test-onboarding.js
 */

var parse = require('../js/onboarding.js')._parseOcrReply;

var passed = 0;
var failed = 0;

function check(label, fn) {
    try {
        fn();
        passed++; console.log('  ✓ ' + label);
    } catch (e) {
        failed++; console.log('  ✗ ' + label + ' — ' + e.message);
    }
}
function eq(a, b, what) {
    if (a !== b) throw new Error((what || '') + ' expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
}
function throws(fn) {
    try { fn(); } catch (e) { return; }
    throw new Error('expected an Error, none thrown');
}

console.log('\nOCR reply parsing:');

check('clean JSON parses with all fields', function () {
    var r = parse('{"name":"Hornady 168gr ELD Match","bulletName":"ELD Match","bulletWeight":168,' +
        '"bulletDiameter":0.308,"bulletBC":0.523,"dragModel":"G1","muzzleVelocity":2700}');
    eq(r.name, 'Hornady 168gr ELD Match', 'name');
    eq(r.bulletWeight, 168, 'weight');
    eq(r.bulletDiameter, 0.308, 'dia');
    eq(r.dragModel, 'G1', 'dragModel');
});

check('markdown fences stripped', function () {
    var r = parse('```json\n{"name":"Federal GMM 175gr","bulletWeight":175}\n```');
    eq(r.name, 'Federal GMM 175gr', 'name');
    eq(r.bulletWeight, 175, 'weight');
});

check('nulls dropped, partial data ok', function () {
    var r = parse('{"name":"CCI Standard","bulletName":null,"bulletWeight":40,"bulletDiameter":null,' +
        '"bulletBC":null,"dragModel":null,"muzzleVelocity":1070}');
    eq(r.name, 'CCI Standard', 'name');
    eq('bulletDiameter' in r, false, 'null dia dropped');
    eq(r.muzzleVelocity, 1070, 'mv');
});

check('out-of-range values rejected', function () {
    var r = parse('{"name":"Weird Box","bulletWeight":5000,"bulletDiameter":3.5,"bulletBC":9,"muzzleVelocity":90}');
    eq(r.name, 'Weird Box', 'name kept');
    eq('bulletWeight' in r, false, 'absurd weight dropped');
    eq('bulletDiameter' in r, false, 'absurd dia dropped');
    eq('bulletBC' in r, false, 'absurd BC dropped');
    eq('muzzleVelocity' in r, false, 'absurd mv dropped');
});

check('bogus dragModel rejected', function () {
    var r = parse('{"name":"X","dragModel":"G9"}');
    eq('dragModel' in r, false, 'G9 dropped');
});

check('prose instead of JSON → throws', function () {
    throws(function () { parse('Sorry, I cannot read this box clearly.'); });
});

check('all-null reply → throws (nothing usable)', function () {
    throws(function () { parse('{"name":null,"bulletWeight":null}'); });
});

check('long name clamped to 80 chars', function () {
    var r = parse('{"name":"' + 'A'.repeat(200) + '"}');
    eq(r.name.length, 80, 'name length');
});

console.log('\n' + '═'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
