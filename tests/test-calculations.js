/**
 * tests/test-calculations.js — Unit tests for the calculation engine.
 * Run with: node tests/test-calculations.js
 * 
 * Tests use known values to verify math correctness.
 */

const calc = require('../js/calculations.js');

let passed = 0;
let failed = 0;

function assert(condition, testName, details) {
    if (condition) {
        console.log(`  ✓ ${testName}`);
        passed++;
    } else {
        console.log(`  ✗ ${testName}`);
        if (details) console.log(`    ${details}`);
        failed++;
    }
}

function assertApprox(actual, expected, tolerance, testName) {
    const diff = Math.abs(actual - expected);
    assert(diff <= tolerance, testName, `Expected ~${expected}, got ${actual} (diff: ${diff})`);
}

// ─── MOA Conversion ─────────────────────────────────────────────

console.log('\nMOA Conversion:');

assertApprox(
    calc.inchesToMOA(1.047, 100), 1.0, 0.001,
    '1.047 inches at 100 yards = 1.0 MOA'
);

assertApprox(
    calc.inchesToMOA(2.094, 100), 2.0, 0.001,
    '2.094 inches at 100 yards = 2.0 MOA'
);

assertApprox(
    calc.inchesToMOA(1.047, 200), 0.5, 0.001,
    '1.047 inches at 200 yards = 0.5 MOA'
);

assertApprox(
    calc.moaToInches(1.0, 100), 1.047, 0.001,
    '1.0 MOA at 100 yards = 1.047 inches'
);

assertApprox(
    calc.moaToInches(1.0, 1000), 10.47, 0.01,
    '1.0 MOA at 1000 yards = 10.47 inches'
);

// ─── Pixel Distance ─────────────────────────────────────────────

console.log('\nPixel Distance:');

assertApprox(
    calc.pixelDistance({x: 0, y: 0}, {x: 3, y: 4}), 5.0, 0.001,
    '3-4-5 triangle = 5.0 pixels'
);

assertApprox(
    calc.pixelDistance({x: 10, y: 10}, {x: 10, y: 10}), 0.0, 0.001,
    'Same point = 0 pixels'
);

// ─── Center-to-Center ───────────────────────────────────────────

console.log('\nCenter-to-Center:');

assertApprox(
    calc.centerToCenter(1.308, 0.308), 1.0, 0.001,
    '1.308" edge-to-edge with .308 bullet = 1.000" C-T-C'
);

assertApprox(
    calc.centerToCenter(0.200, 0.308), 0.0, 0.001,
    'Edge-to-edge smaller than bullet diameter = 0 (clamped)'
);

// ─── Centroid ───────────────────────────────────────────────────

console.log('\nCentroid:');

const centroid1 = calc.calculateCentroid([{x: 0, y: 0}, {x: 10, y: 0}, {x: 5, y: 10}]);
assertApprox(centroid1.x, 5.0, 0.001, 'Triangle centroid X = 5.0');
assertApprox(centroid1.y, 3.333, 0.01, 'Triangle centroid Y = 3.33');

// ─── Group Size ─────────────────────────────────────────────────

console.log('\nGroup Size:');

// Scenario: 100 pixels per inch, two shots 200px apart
// Impacts are tapped at hole centers, so 200/100 = 2.0" center-to-center
const gs1 = calc.calculateGroupSize(
    [{x: 0, y: 0}, {x: 200, y: 0}],
    100 // pixelsPerInch
);
assertApprox(gs1.inches, 2.0, 0.001, 'Two shots 200px apart at 100ppi = 2.000" C-T-C');

// ─── Full Session Calculation ───────────────────────────────────

console.log('\nFull Session (5 shots at 100 yards):');

// Simulate 5 shots with known positions
// pixelsPerInch = 100 (so 100px = 1 inch)
// Bullet: .308
// Distance: 100 yards
// POA at center: (500, 500)
// Impacts clustered around (550, 480) — slightly right and high

const sessionResult = calc.calculateSession({
    impacts: [
        {x: 540, y: 470},
        {x: 560, y: 490},
        {x: 545, y: 475},
        {x: 555, y: 485},
        {x: 550, y: 480}
    ],
    poa: {x: 500, y: 500},
    pixelsPerInch: 100,
    bulletDiameter: 0.308,
    distanceYards: 100
});

assert(sessionResult.shotCount === 5, 'Shot count = 5');

// Max spread should be between shot 1 (540,470) and shot 2 (560,490)
// Distance = sqrt(20^2 + 20^2) = 28.28px = 0.2828" center-to-center
assertApprox(sessionResult.groupSizeInches, 0.2828, 0.01, 'Group size ≈ 0.283"');
assert(sessionResult.groupSizeMOA >= 0, 'Group size MOA is non-negative');

// Centroid should be around (550, 480)
assertApprox(sessionResult.centroid.x, 550, 1, 'Centroid X ≈ 550');
assertApprox(sessionResult.centroid.y, 480, 1, 'Centroid Y ≈ 480');

// POA offset: centroid is right of POA (positive windage) and above POA (positive elevation)
// Windage: (550-500)/100 = 0.5 inches right
// Elevation: (500-480)/100 = 0.2 inches high
assertApprox(sessionResult.windageOffsetInches, 0.5, 0.01, 'Windage offset ≈ 0.5" right');
assertApprox(sessionResult.elevationOffsetInches, 0.2, 0.01, 'Elevation offset ≈ 0.2" high');

// ATZ should say to adjust Down and Left
assert(sessionResult.atzElevationDir === 'Down', 'ATZ elevation direction = Down');
assert(sessionResult.atzWindageDir === 'Left', 'ATZ windage direction = Left');

console.log('\nSession result sample:');
console.log(`  Group: ${sessionResult.groupSizeInches}" (${sessionResult.groupSizeMOA} MOA)`);
console.log(`  ATZ: ${sessionResult.atzElevationDir} ${sessionResult.atzElevationMOA} MOA, ${sessionResult.atzWindageDir} ${sessionResult.atzWindageMOA} MOA`);

// ─── Wider Group Test ───────────────────────────────────────────

console.log('\nWider Group (1000 yard target, ~15" spread):');

// pixelsPerInch = 20 (lower res photo of distant target)
// Bullet: .308
// Distance: 1000 yards
const wideResult = calc.calculateSession({
    impacts: [
        {x: 200, y: 200},
        {x: 350, y: 220},
        {x: 280, y: 350},
        {x: 250, y: 180},
        {x: 320, y: 300}
    ],
    poa: {x: 275, y: 260},
    pixelsPerInch: 20,
    bulletDiameter: 0.308,
    distanceYards: 1000
});

console.log(`  Group: ${wideResult.groupSizeInches}" (${wideResult.groupSizeMOA} MOA)`);
console.log(`  ATZ: ${wideResult.atzElevationDir} ${wideResult.atzElevationMOA} MOA, ${wideResult.atzWindageDir} ${wideResult.atzWindageMOA} MOA`);

// At 20ppi, shot 1 (200,200) to shot 3 (280,350) = sqrt(80^2+150^2) = 170px = 8.5" C-T-C
// That seems reasonable for a 1000yd group test
assert(wideResult.groupSizeInches > 5, 'Wide group > 5 inches');
assert(wideResult.groupSizeMOA > 0, 'Wide group MOA > 0');

// ─── Summary ────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
    process.exit(1);
}
