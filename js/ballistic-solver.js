/**
 * ballistic-solver.js — Point-mass ballistic trajectory solver.
 *
 * Top section: Pure solver functions (no DOM, no side effects).
 * Bottom section: BallisticSolverManager UI class.
 *
 * Uses published G1/G7 standard drag curves, 4th-order Runge-Kutta
 * integration, and secant-method zero finding.
 */

// ── Constants ────────────────────────────────────────────────────

var GRAVITY = 32.17405; // ft/s^2
var STD_TEMP_F = 59;
var STD_PRESSURE_INHG = 29.92;
var SOLVER_DT = 0.0005; // 0.5ms time step

// 0.5 * rho_std * pi / (4 * 144)
// rho_std = 0.0764742 lb/ft^3 (standard sea-level air density)
// pi/4 for circular cross-section, /144 to convert in^2 to ft^2
var DRAG_CONSTANT = 0.5 * 0.0764742 * Math.PI / (4 * 144);

// ── G1 Drag Table (Mach, Cd) ────────────────────────────────────

var G1_DRAG_TABLE = [
    [0.00, 0.2629], [0.05, 0.2558], [0.10, 0.2487], [0.15, 0.2413],
    [0.20, 0.2344], [0.25, 0.2278], [0.30, 0.2214], [0.35, 0.2155],
    [0.40, 0.2104], [0.45, 0.2061], [0.50, 0.2032], [0.55, 0.2020],
    [0.60, 0.2034], [0.65, 0.2085], [0.70, 0.2165], [0.75, 0.2230],
    [0.775, 0.2313], [0.80, 0.2417], [0.825, 0.2546], [0.85, 0.2706],
    [0.875, 0.2912], [0.90, 0.3199], [0.925, 0.3564], [0.95, 0.3994],
    [0.975, 0.4412], [1.00, 0.4788], [1.025, 0.5115], [1.05, 0.5386],
    [1.075, 0.5600], [1.10, 0.5767], [1.125, 0.5890], [1.15, 0.5977],
    [1.175, 0.6037], [1.20, 0.6072], [1.225, 0.6083], [1.25, 0.6075],
    [1.30, 0.6029], [1.35, 0.5950], [1.40, 0.5850], [1.45, 0.5732],
    [1.50, 0.5600], [1.55, 0.5462], [1.60, 0.5319], [1.65, 0.5177],
    [1.70, 0.5037], [1.75, 0.4901], [1.80, 0.4772], [1.85, 0.4650],
    [1.90, 0.4538], [1.95, 0.4434], [2.00, 0.4336], [2.05, 0.4243],
    [2.10, 0.4155], [2.15, 0.4072], [2.20, 0.3992], [2.25, 0.3915],
    [2.30, 0.3843], [2.35, 0.3774], [2.40, 0.3709], [2.45, 0.3647],
    [2.50, 0.3587], [2.55, 0.3530], [2.60, 0.3476], [2.65, 0.3425],
    [2.70, 0.3376], [2.75, 0.3329], [2.80, 0.3284], [2.85, 0.3241],
    [2.90, 0.3199], [2.95, 0.3160], [3.00, 0.3122], [3.10, 0.3050],
    [3.20, 0.2984], [3.30, 0.2922], [3.40, 0.2864], [3.50, 0.2809],
    [3.60, 0.2757], [3.70, 0.2709], [3.80, 0.2663], [3.90, 0.2620],
    [4.00, 0.2579], [4.20, 0.2504], [4.40, 0.2435], [4.60, 0.2373],
    [4.80, 0.2315], [5.00, 0.2261]
];

// ── G7 Drag Table (Mach, Cd) ────────────────────────────────────

var G7_DRAG_TABLE = [
    [0.00, 0.1198], [0.05, 0.1197], [0.10, 0.1196], [0.15, 0.1194],
    [0.20, 0.1193], [0.25, 0.1194], [0.30, 0.1194], [0.35, 0.1194],
    [0.40, 0.1193], [0.45, 0.1193], [0.50, 0.1194], [0.55, 0.1193],
    [0.60, 0.1194], [0.65, 0.1197], [0.70, 0.1202], [0.725, 0.1207],
    [0.75, 0.1215], [0.775, 0.1226], [0.80, 0.1242], [0.825, 0.1266],
    [0.85, 0.1306], [0.875, 0.1368], [0.90, 0.1464], [0.925, 0.1660],
    [0.95, 0.2054], [0.975, 0.2993], [1.00, 0.3803], [1.025, 0.4015],
    [1.05, 0.4043], [1.075, 0.4034], [1.10, 0.4014], [1.125, 0.3987],
    [1.15, 0.3955], [1.20, 0.3884], [1.25, 0.3810], [1.30, 0.3732],
    [1.35, 0.3657], [1.40, 0.3580], [1.45, 0.3510], [1.50, 0.3440],
    [1.55, 0.3376], [1.60, 0.3315], [1.65, 0.3260], [1.70, 0.3209],
    [1.75, 0.3160], [1.80, 0.3114], [1.85, 0.3070], [1.90, 0.3028],
    [1.95, 0.2988], [2.00, 0.2951], [2.05, 0.2922], [2.10, 0.2892],
    [2.15, 0.2864], [2.20, 0.2835], [2.25, 0.2807], [2.30, 0.2779],
    [2.35, 0.2752], [2.40, 0.2725], [2.45, 0.2697], [2.50, 0.2670],
    [2.55, 0.2643], [2.60, 0.2615], [2.65, 0.2588], [2.70, 0.2561],
    [2.75, 0.2533], [2.80, 0.2506], [2.85, 0.2479], [2.90, 0.2451],
    [2.95, 0.2424], [3.00, 0.2397], [3.10, 0.2343], [3.20, 0.2289],
    [3.30, 0.2236], [3.40, 0.2184], [3.50, 0.2133], [3.60, 0.2084],
    [3.70, 0.2036], [3.80, 0.1990], [3.90, 0.1945], [4.00, 0.1901],
    [4.20, 0.1819], [4.40, 0.1743], [4.60, 0.1672], [4.80, 0.1606],
    [5.00, 0.1545]
];

// ── Pure Solver Functions ────────────────────────────────────────

/**
 * Linear interpolation of Cd from a drag table at a given Mach number.
 * @param {Array} table - Array of [mach, Cd] pairs
 * @param {number} mach - Mach number
 * @returns {number} Interpolated Cd
 */
function interpolateCd(table, mach) {
    if (mach <= table[0][0]) return table[0][1];
    if (mach >= table[table.length - 1][0]) return table[table.length - 1][1];

    for (var i = 1; i < table.length; i++) {
        if (table[i][0] >= mach) {
            var m0 = table[i - 1][0], cd0 = table[i - 1][1];
            var m1 = table[i][0], cd1 = table[i][1];
            var t = (mach - m0) / (m1 - m0);
            return cd0 + t * (cd1 - cd0);
        }
    }
    return table[table.length - 1][1];
}

/**
 * Speed of sound in ft/s given temperature in Fahrenheit.
 * @param {number} tempF
 * @returns {number} Speed of sound in ft/s
 */
function calculateSpeedOfSound(tempF) {
    return 49.0223 * Math.sqrt(tempF + 459.67);
}

/**
 * Air density ratio vs standard atmosphere, with humidity correction.
 * Uses Magnus formula for vapor pressure.
 * @param {number} tempF
 * @param {number} pressureInHg
 * @param {number} humidity - 0 to 100
 * @returns {number} Density ratio (dimensionless)
 */
function calculateAirDensityRatio(tempF, pressureInHg, humidity) {
    var tempC = (tempF - 32) * 5 / 9;
    var tempR = tempF + 459.67;
    var stdTempR = STD_TEMP_F + 459.67;

    // Magnus formula for saturation vapor pressure (inHg)
    var satVaporPressure = 0.02953 * Math.pow(10, 7.5 * tempC / (237.3 + tempC));
    var vaporPressure = (humidity / 100) * satVaporPressure;

    // Dry air partial pressure
    var dryPressure = pressureInHg - 0.3783 * vaporPressure;

    // Density ratio: (P_dry / P_std) * (T_std / T) adjusted for moisture
    var ratio = (dryPressure / STD_PRESSURE_INHG) * (stdTempR / tempR);
    return ratio;
}

/**
 * Estimate barometric pressure at altitude using standard atmosphere lapse rate.
 * @param {number} altitudeFt
 * @returns {number} Pressure in inHg
 */
function estimatePressureAtAltitude(altitudeFt) {
    return 29.92 * Math.pow(1 - 6.8756e-6 * altitudeFt, 5.2559);
}

/**
 * Decompose wind speed from a clock position into x (headwind/tailwind)
 * and z (crosswind) components in ft/s.
 *
 * Clock positions: 12 = full headwind, 6 = full tailwind,
 * 3 = full crosswind from right, 9 = full crosswind from left.
 *
 * Returns air velocity in the ground frame:
 *   windVx: negative = headwind (air opposes bullet), positive = tailwind
 *   windVz: negative = air moving left (from right), positive = air moving right (from left)
 *
 * @param {number} clockPos - Clock position (1-12)
 * @param {number} speedMph - Wind speed in mph
 * @returns {{windVxFps: number, windVzFps: number}}
 */
function windComponentsFromClock(clockPos, speedMph) {
    var speedFps = speedMph * 5280 / 3600;
    var angleDeg = (clockPos % 12) * 30;
    var angleRad = angleDeg * Math.PI / 180;
    return {
        windVxFps: -speedFps * Math.cos(angleRad),
        windVzFps: -speedFps * Math.sin(angleRad)
    };
}

/**
 * Compute derivatives for the equations of motion.
 * State: [x, y, vx, vy, z, vz]
 *   x = downrange (ft), y = vertical (ft), z = crosswind (ft)
 *   vx = downrange velocity, vy = vertical velocity, vz = crosswind velocity
 *
 * @param {number[]} state - [x, y, vx, vy, z, vz]
 * @param {number} windVx - headwind/tailwind air velocity in ft/s (negative = headwind)
 * @param {number} windVz - crosswind air velocity in ft/s (negative = from right)
 * @param {number} speedOfSound - ft/s
 * @param {number} bc - ballistic coefficient
 * @param {Array} dragTable - G1 or G7 table
 * @param {number} airDensityRatio
 * @returns {number[]} derivatives [dx, dy, dvx, dvy, dz, dvz]
 */
function solverDerivatives(state, windVx, windVz, speedOfSound, bc, dragTable, airDensityRatio) {
    var vx = state[2];
    var vy = state[3];

    // Velocity relative to air
    var vrx = vx - windVx;
    var vrz = (state[5] || 0) - windVz;
    var V = Math.sqrt(vrx * vrx + vy * vy + vrz * vrz);

    if (V < 1) return [vx, vy, 0, -GRAVITY, state[5] || 0, 0];

    var mach = V / speedOfSound;
    var cd = interpolateCd(dragTable, mach);

    // Drag deceleration magnitude: rho_ratio * DRAG_CONSTANT * Cd * V^2 / BC
    var dragAccel = airDensityRatio * DRAG_CONSTANT * cd * V * V / bc;

    // Resolve drag along velocity-relative-to-air vector
    var dvx = -dragAccel * (vrx / V);
    var dvy = -dragAccel * (vy / V) - GRAVITY;
    var dvz = -dragAccel * (vrz / V);

    return [vx, vy, dvx, dvy, state[5] || 0, dvz];
}

/**
 * Standard 4th-order Runge-Kutta integration step.
 * @param {number[]} state - current state [x, y, vx, vy, z, vz]
 * @param {number} dt - time step
 * @param {number} windVx - headwind/tailwind air velocity ft/s
 * @param {number} windVz - crosswind air velocity ft/s
 * @param {number} speedOfSound
 * @param {number} bc
 * @param {Array} dragTable
 * @param {number} airDensityRatio
 * @returns {number[]} new state
 */
function rk4Step(state, dt, windVx, windVz, speedOfSound, bc, dragTable, airDensityRatio) {
    var k1 = solverDerivatives(state, windVx, windVz, speedOfSound, bc, dragTable, airDensityRatio);

    var s2 = [];
    for (var i = 0; i < 6; i++) s2[i] = state[i] + 0.5 * dt * k1[i];
    var k2 = solverDerivatives(s2, windVx, windVz, speedOfSound, bc, dragTable, airDensityRatio);

    var s3 = [];
    for (var j = 0; j < 6; j++) s3[j] = state[j] + 0.5 * dt * k2[j];
    var k3 = solverDerivatives(s3, windVx, windVz, speedOfSound, bc, dragTable, airDensityRatio);

    var s4 = [];
    for (var m = 0; m < 6; m++) s4[m] = state[m] + dt * k3[m];
    var k4 = solverDerivatives(s4, windVx, windVz, speedOfSound, bc, dragTable, airDensityRatio);

    var next = [];
    for (var n = 0; n < 6; n++) {
        next[n] = state[n] + (dt / 6) * (k1[n] + 2 * k2[n] + 2 * k3[n] + k4[n]);
    }
    return next;
}

/**
 * Integrate a trajectory at a given bore angle and return the y-position at
 * a target downrange distance. Used by findZeroAngle.
 * @param {object} params
 * @param {number} angleDeg - bore elevation angle in degrees
 * @returns {number} y position (ft) at zero range
 */
function _simulateToRange(params, angleDeg) {
    var angleRad = angleDeg * Math.PI / 180;
    var mv = params.muzzleVelocity;
    var vx0 = mv * Math.cos(angleRad);
    var vy0 = mv * Math.sin(angleRad);
    var state = [0, 0, vx0, vy0, 0, 0];

    var zeroRangeFt = params.zeroRange * 3;
    var dt = SOLVER_DT;
    var maxSteps = 200000;

    for (var i = 0; i < maxSteps; i++) {
        state = rk4Step(state, dt, 0, 0, params.speedOfSound, params.bc, params.dragTable, params.airDensityRatio);
        if (state[0] >= zeroRangeFt) break;
    }

    // Bullet y at zero range, offset by scope height
    // Scope is above bore, so sight line at zero range is at scopeHeight
    return state[1];
}

/**
 * Find the bore elevation angle that zeros the rifle at the specified range.
 * Uses secant method (~10 iterations).
 * @param {object} params - { muzzleVelocity, bc, dragTable, zeroRange, scopeHeight, speedOfSound, airDensityRatio }
 * @returns {number} Zero angle in degrees
 */
function findZeroAngle(params) {
    // Scope height in feet (input is inches)
    var scopeHeightFt = (params.scopeHeight || 1.5) / 12;

    // Target: bullet y at zero range should equal -scopeHeight
    // (bullet starts at -scopeHeight below scope/sight line)
    // We want the bullet to cross the sight line at zero range
    // Sight line is at y = scopeHeightFt from bore at the muzzle
    // Bullet starts at y = 0 (bore line). We want y at zeroRange to equal scopeHeightFt (rise up to sight line)
    // Actually: bullet starts at bore (y=0), scope is scopeHeight above bore.
    // At zero range, bullet should be at scopeHeightFt above bore line.

    function error(angle) {
        var yAtZero = _simulateToRange(params, angle);
        return yAtZero - scopeHeightFt;
    }

    // Initial guesses: small angles
    var a0 = 0.0;
    var a1 = 0.1;
    var e0 = error(a0);
    var e1 = error(a1);

    for (var i = 0; i < 20; i++) {
        if (Math.abs(e1) < 1e-8) break;
        if (Math.abs(e1 - e0) < 1e-15) break;
        var aNew = a1 - e1 * (a1 - a0) / (e1 - e0);
        a0 = a1;
        e0 = e1;
        a1 = aNew;
        e1 = error(a1);
    }

    return a1;
}

/**
 * Compute a full ballistic trajectory table.
 *
 * @param {object} params
 * @param {number} params.muzzleVelocity - fps
 * @param {number} params.bc - ballistic coefficient
 * @param {string} params.dragModel - 'G1' or 'G7'
 * @param {number} params.zeroRange - zero range in yards
 * @param {number} params.scopeHeight - scope height in inches
 * @param {number} params.bulletWeight - grain
 * @param {number} params.maxRange - max range in yards
 * @param {number} params.rangeStep - step in yards
 * @param {number} params.windSpeedMph - wind speed in mph
 * @param {number} params.windClockPos - wind clock position (1-12)
 * @param {number} params.tempF - temperature Fahrenheit
 * @param {number} params.pressureInHg - barometric pressure
 * @param {number} params.humidity - relative humidity 0-100
 * @returns {object} { zeroAngleDeg, table: DropTableRow[] }
 */
function computeTrajectory(params) {
    var dragTable = params.dragModel === 'G7' ? G7_DRAG_TABLE : G1_DRAG_TABLE;
    var speedOfSound = calculateSpeedOfSound(params.tempF || STD_TEMP_F);
    var airDensityRatio = calculateAirDensityRatio(
        params.tempF || STD_TEMP_F,
        params.pressureInHg || STD_PRESSURE_INHG,
        params.humidity || 0
    );

    // Decompose wind into headwind/tailwind and crosswind components
    var windComps = windComponentsFromClock(params.windClockPos || 3, params.windSpeedMph || 0);
    var windVx = windComps.windVxFps;
    var windVz = windComps.windVzFps;

    var solverParams = {
        muzzleVelocity: params.muzzleVelocity,
        bc: params.bc,
        dragTable: dragTable,
        zeroRange: params.zeroRange || 100,
        scopeHeight: params.scopeHeight || 1.5,
        speedOfSound: speedOfSound,
        airDensityRatio: airDensityRatio
    };

    // Find zero angle
    var zeroAngleDeg = findZeroAngle(solverParams);
    var zeroAngleRad = zeroAngleDeg * Math.PI / 180;

    // Scope height in feet
    var scopeHeightFt = (params.scopeHeight || 1.5) / 12;

    // Now integrate the full trajectory
    var mv = params.muzzleVelocity;
    var vx0 = mv * Math.cos(zeroAngleRad);
    var vy0 = mv * Math.sin(zeroAngleRad);
    var state = [0, 0, vx0, vy0, 0, 0];

    var maxRangeFt = (params.maxRange || 1000) * 3;
    var rangeStepFt = (params.rangeStep || 100) * 3;
    var dt = SOLVER_DT;

    var table = [];
    var nextRangeFt = 0; // Start at 0 yards
    var bulletWeight = params.bulletWeight || 168;
    var zeroRange = params.zeroRange || 100;

    // Muzzle row (0 yards)
    var muzzleV = mv;
    var muzzleMach = muzzleV / speedOfSound;
    var muzzleEnergy = bulletWeight * muzzleV * muzzleV / 450437;
    // At muzzle, drop = -(scope height) since bullet is below sight line
    var muzzleDropIn = -scopeHeightFt * 12;
    var muzzleDropMOA = 0; // undefined at 0 range, show 0

    table.push({
        rangeYards: 0,
        dropInches: round4(muzzleDropIn),
        dropMOA: 0,
        comeUpMOA: 0,
        windDriftInches: 0,
        windDriftMOA: 0,
        velocityFps: Math.round(muzzleV),
        energyFtLbs: Math.round(muzzleEnergy),
        timeOfFlightSec: 0,
        machNumber: round4(muzzleMach)
    });

    nextRangeFt = rangeStepFt;
    var maxSteps = 500000;
    var step = 0;
    var tof = 0;

    while (state[0] < maxRangeFt && step < maxSteps) {
        state = rk4Step(state, dt, windVx, windVz, speedOfSound, params.bc, dragTable, airDensityRatio);
        tof += dt;
        step++;

        if (state[0] >= nextRangeFt) {
            var rangeYds = nextRangeFt / 3;

            // Sight line height at this range: scopeHeight - (scopeHeight / zeroRangeFt) * x
            // Actually the sight line is a straight line from scope to zero point:
            // At x=0: y = scopeHeightFt (scope above bore)
            // At x=zeroRangeFt: y = bullet_y_at_zero (which equals scopeHeightFt by definition)
            // The sight line is: y_sight = scopeHeightFt at bore, slopes down to target
            // Sight line angle from scope: tan(a) = scopeHeightFt / zeroRangeFt... no
            // Actually: sight line goes from scope (0, scopeHeightFt) through (zeroRangeFt, scopeHeightFt_at_zero)
            // But at zero range, bullet IS at sight line. So sight line passes through (zeroRangeFt, bullet_y_at_zero).
            // bullet_y_at_zero = scopeHeightFt.
            // Sight line from (0, scopeHeightFt) to (zeroRangeFt, scopeHeightFt)... that's horizontal.
            // No — the bore is angled upward. Let me reconsider.
            //
            // The scope is scopeHeightFt above the bore at the muzzle.
            // The bore is angled up at zeroAngleDeg.
            // The sight line is a straight line from the scope that intersects
            // the bullet path at the zero range.
            // bullet_y at zero range = scopeHeightFt (we solved for this).
            // scope position = (0, scopeHeightFt).
            // zero intersection = (zeroRangeFt, scopeHeightFt).
            // So the sight line IS horizontal? That can't be right either.
            //
            // Wait — the bullet rises above the sight line between muzzle and zero,
            // then drops below at far range. The zero is where bullet crosses sight line.
            // Let me just compute drop as bullet_y - sight_line_y.
            //
            // Sight line: starts at (0, scopeHeightFt), passes through (zeroRangeFt, bullet_y_at_zero).
            // Since bullet_y_at_zero = scopeHeightFt (by our zero solution), the sight line
            // is y_sight(x) = scopeHeightFt. That means the sight line IS horizontal.
            // That IS correct for a properly zeroed rifle — the sight line is essentially
            // horizontal and the bullet arcs up then back down to it at zero range.

            var dropFt = state[1] - scopeHeightFt;
            var dropInches = dropFt * 12;
            var driftFt = state[4];
            var driftInches = driftFt * 12;

            // Velocity
            var vx = state[2];
            var vy = state[3];
            var vz = state[5] || 0;
            var V = Math.sqrt(vx * vx + vy * vy + vz * vz);
            var mach = V / speedOfSound;
            var energy = bulletWeight * V * V / 450437;

            // MOA conversions (at this range)
            var dropMOA = 0;
            var comeUpMOA = 0;
            var driftMOA = 0;
            if (rangeYds > 0) {
                dropMOA = inchesToMOA(dropInches, rangeYds);
                comeUpMOA = -dropMOA; // come-up is opposite of drop
                driftMOA = inchesToMOA(driftInches, rangeYds);
            }

            table.push({
                rangeYards: rangeYds,
                dropInches: round4(dropInches),
                dropMOA: round4(dropMOA),
                comeUpMOA: round4(comeUpMOA),
                windDriftInches: round4(driftInches),
                windDriftMOA: round4(driftMOA),
                velocityFps: Math.round(V),
                energyFtLbs: Math.round(energy),
                timeOfFlightSec: round4(tof),
                machNumber: round4(mach)
            });

            nextRangeFt += rangeStepFt;
        }
    }

    return {
        zeroAngleDeg: zeroAngleDeg,
        table: table
    };
}

// ── CommonJS export guard ────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        GRAVITY: GRAVITY,
        STD_TEMP_F: STD_TEMP_F,
        STD_PRESSURE_INHG: STD_PRESSURE_INHG,
        SOLVER_DT: SOLVER_DT,
        DRAG_CONSTANT: DRAG_CONSTANT,
        G1_DRAG_TABLE: G1_DRAG_TABLE,
        G7_DRAG_TABLE: G7_DRAG_TABLE,
        interpolateCd: interpolateCd,
        calculateSpeedOfSound: calculateSpeedOfSound,
        calculateAirDensityRatio: calculateAirDensityRatio,
        estimatePressureAtAltitude: estimatePressureAtAltitude,
        windComponentsFromClock: windComponentsFromClock,
        solverDerivatives: solverDerivatives,
        rk4Step: rk4Step,
        findZeroAngle: findZeroAngle,
        computeTrajectory: computeTrajectory
    };
}


// ══════════════════════════════════════════════════════════════════
// BallisticSolverManager — UI class
// ══════════════════════════════════════════════════════════════════

function BallisticSolverManager(db) {
    this.db = db;
    this.container = null;
    this.rifles = [];
    this.loads = [];
    this.selectedRifle = null;
    this.selectedLoad = null;
}

BallisticSolverManager.prototype.init = function () {
    this.container = document.getElementById('view-solver');
};

BallisticSolverManager.prototype.show = function () {
    var self = this;
    if (!this.db) {
        this.container.innerHTML =
            '<div style="padding:2rem;text-align:center;color:#ff6b6b;">' +
            '<h3>Database Unavailable</h3>' +
            '<p>Close other tabs using this app and reload.</p>' +
            '</div>';
        return;
    }

    this.db.getAllRifles().then(function (rifles) {
        self.rifles = rifles || [];
        self._render();
    });
};

BallisticSolverManager.prototype._render = function () {
    var self = this;
    var html = '';

    // Toolbar
    html += '<div class="profile-toolbar"><div class="toolbar-spacer"></div>';
    html += '<span class="profile-title">Ballistic Solver</span>';
    html += '<div class="toolbar-spacer"></div></div>';

    // Form
    html += '<div class="solver-form">';

    // Rifle dropdown
    html += '<div class="form-group">';
    html += '<label for="solver-rifle">Rifle</label>';
    html += '<select id="solver-rifle">';
    html += '<option value="">Select a rifle...</option>';
    for (var i = 0; i < this.rifles.length; i++) {
        var r = this.rifles[i];
        var sel = (this.selectedRifle && this.selectedRifle.id === r.id) ? ' selected' : '';
        html += '<option value="' + r.id + '"' + sel + '>' +
            this._esc(r.name || 'Unnamed') +
            (r.caliber ? ' — ' + this._esc(r.caliber) : '') +
            '</option>';
    }
    html += '</select>';
    html += '</div>';

    // Load dropdown
    html += '<div class="form-group">';
    html += '<label for="solver-load">Load</label>';
    html += '<select id="solver-load"' + (this.loads.length === 0 ? ' disabled' : '') + '>';
    if (this.loads.length === 0) {
        html += '<option value="">Select a rifle first</option>';
    } else {
        html += '<option value="">Select a load...</option>';
        for (var j = 0; j < this.loads.length; j++) {
            var ld = this.loads[j];
            var lSel = (this.selectedLoad && this.selectedLoad.id === ld.id) ? ' selected' : '';
            var lLabel = this._esc(ld.name || 'Unnamed');
            if (ld.bulletWeight) lLabel += ' ' + ld.bulletWeight + 'gr';
            if (ld.muzzleVelocity) lLabel += ' ' + ld.muzzleVelocity + 'fps';
            html += '<option value="' + ld.id + '"' + lSel + '>' + lLabel + '</option>';
        }
    }
    html += '</select>';
    html += '</div>';

    // Profile info card (shown when load selected)
    if (this.selectedLoad) {
        var load = this.selectedLoad;
        var rifle = this.selectedRifle;
        html += '<div class="detail-card" id="solver-info-card">';
        if (load.bulletBC) {
            html += '<div class="detail-row"><span class="detail-label">BC</span><span class="detail-value">' +
                load.bulletBC + ' ' + (load.dragModel || 'G1') + '</span></div>';
        }
        if (load.muzzleVelocity) {
            html += '<div class="detail-row"><span class="detail-label">Muzzle Velocity</span><span class="detail-value">' +
                load.muzzleVelocity + ' fps</span></div>';
        }
        if (rifle && rifle.scopeHeight) {
            html += '<div class="detail-row"><span class="detail-label">Scope Height</span><span class="detail-value">' +
                rifle.scopeHeight + '"</span></div>';
        }
        if (rifle && rifle.zeroRange) {
            html += '<div class="detail-row"><span class="detail-label">Zero Range</span><span class="detail-value">' +
                rifle.zeroRange + ' yds</span></div>';
        }
        if (load.bulletWeight) {
            html += '<div class="detail-row"><span class="detail-label">Bullet Weight</span><span class="detail-value">' +
                load.bulletWeight + ' gr</span></div>';
        }
        html += '</div>';
    }

    // Range inputs
    html += '<div class="form-row">';
    html += '<div class="form-group form-group-half">';
    html += '<label for="solver-max-range">Max Range (yds)</label>';
    html += '<input type="number" id="solver-max-range" value="1000" min="100" max="3000" step="100" inputmode="numeric">';
    html += '</div>';
    html += '<div class="form-group form-group-half">';
    html += '<label for="solver-range-step">Range Step (yds)</label>';
    html += '<select id="solver-range-step">';
    html += '<option value="25">25</option>';
    html += '<option value="50" selected>50</option>';
    html += '<option value="100">100</option>';
    html += '</select>';
    html += '</div>';
    html += '</div>';

    // Wind inputs
    html += '<div class="form-row">';
    html += '<div class="form-group form-group-half">';
    html += '<label for="solver-wind">Wind Speed (mph)</label>';
    html += '<input type="number" id="solver-wind" value="10" min="0" max="60" step="1" inputmode="numeric">';
    html += '</div>';
    html += '<div class="form-group form-group-half">';
    html += '<label for="solver-wind-dir">Wind Direction</label>';
    html += '<select id="solver-wind-dir">';
    html += '<option value="12">12 o\'clock (headwind)</option>';
    html += '<option value="1">1 o\'clock</option>';
    html += '<option value="2">2 o\'clock</option>';
    html += '<option value="3" selected>3 o\'clock (from right)</option>';
    html += '<option value="4">4 o\'clock</option>';
    html += '<option value="5">5 o\'clock</option>';
    html += '<option value="6">6 o\'clock (tailwind)</option>';
    html += '<option value="7">7 o\'clock</option>';
    html += '<option value="8">8 o\'clock</option>';
    html += '<option value="9">9 o\'clock (from left)</option>';
    html += '<option value="10">10 o\'clock</option>';
    html += '<option value="11">11 o\'clock</option>';
    html += '</select>';
    html += '</div>';
    html += '</div>';

    // Atmospheric conditions (collapsible)
    html += '<details class="session-details" id="solver-atmo-details">';
    html += '<summary class="session-details-summary">Atmospheric Conditions</summary>';
    html += '<div class="session-details-body">';
    html += '<div class="form-row">';
    html += '<div class="form-group form-group-half">';
    html += '<label for="solver-temp">Temp (&deg;F)</label>';
    html += '<input type="number" id="solver-temp" value="59" min="-40" max="140" step="1" inputmode="numeric">';
    html += '</div>';
    html += '<div class="form-group form-group-half">';
    html += '<label for="solver-altitude">Altitude (ft)</label>';
    html += '<input type="number" id="solver-altitude" value="0" min="0" max="20000" step="100" inputmode="numeric">';
    html += '</div>';
    html += '</div>';
    html += '<div class="form-row">';
    html += '<div class="form-group form-group-half">';
    html += '<label for="solver-pressure">Pressure (inHg)</label>';
    html += '<input type="number" id="solver-pressure" value="29.92" min="20" max="35" step="0.01" inputmode="decimal">';
    html += '</div>';
    html += '<div class="form-group form-group-half">';
    html += '<label for="solver-humidity">Humidity (%)</label>';
    html += '<input type="number" id="solver-humidity" value="0" min="0" max="100" step="1" inputmode="numeric">';
    html += '</div>';
    html += '</div>';
    html += '</div>';
    html += '</details>';

    // Calculate button
    var canCalc = this.selectedLoad && this.selectedLoad.bulletBC && this.selectedLoad.muzzleVelocity;
    html += '<div class="btn-row">';
    html += '<button class="btn btn-primary" id="solver-calculate"' + (canCalc ? '' : ' disabled') + '>Calculate</button>';
    html += '</div>';

    html += '</div>'; // end solver-form

    // Results placeholder
    html += '<div id="solver-results"></div>';

    this.container.innerHTML = html;
    this._bindEvents();
};

BallisticSolverManager.prototype._bindEvents = function () {
    var self = this;

    var rifleSelect = document.getElementById('solver-rifle');
    var loadSelect = document.getElementById('solver-load');
    var calcBtn = document.getElementById('solver-calculate');
    var altitudeInput = document.getElementById('solver-altitude');
    var pressureInput = document.getElementById('solver-pressure');

    if (rifleSelect) {
        rifleSelect.addEventListener('change', function () {
            var rifleId = this.value;
            self.selectedRifle = null;
            self.selectedLoad = null;
            self.loads = [];

            if (!rifleId) {
                self._render();
                return;
            }

            // Find rifle
            for (var i = 0; i < self.rifles.length; i++) {
                if (String(self.rifles[i].id) === rifleId) {
                    self.selectedRifle = self.rifles[i];
                    break;
                }
            }

            // Fetch loads
            self.db.getLoadsByRifle(rifleId).then(function (loads) {
                self.loads = loads || [];
                self._render();
            });
        });
    }

    if (loadSelect) {
        loadSelect.addEventListener('change', function () {
            var loadId = this.value;
            self.selectedLoad = null;

            if (loadId) {
                for (var i = 0; i < self.loads.length; i++) {
                    if (String(self.loads[i].id) === loadId) {
                        self.selectedLoad = self.loads[i];
                        break;
                    }
                }
            }

            self._render();
        });
    }

    if (altitudeInput && pressureInput) {
        altitudeInput.addEventListener('change', function () {
            var alt = parseFloat(this.value) || 0;
            pressureInput.value = estimatePressureAtAltitude(alt).toFixed(2);
        });
    }

    if (calcBtn) {
        calcBtn.addEventListener('click', function () {
            self._calculate();
        });
    }
};

BallisticSolverManager.prototype._calculate = function () {
    if (!this.selectedLoad) return;

    var load = this.selectedLoad;
    var rifle = this.selectedRifle;

    var bc = parseFloat(load.bulletBC);
    var mv = parseFloat(load.muzzleVelocity);
    if (!bc || !mv) return;

    var maxRange = parseInt(document.getElementById('solver-max-range').value) || 1000;
    var rangeStep = parseInt(document.getElementById('solver-range-step').value) || 50;
    var windSpeed = parseFloat(document.getElementById('solver-wind').value) || 0;
    var windClockPos = parseInt(document.getElementById('solver-wind-dir').value) || 3;
    var tempF = parseFloat(document.getElementById('solver-temp').value) || 59;
    var altitude = parseFloat(document.getElementById('solver-altitude').value) || 0;
    var pressure = parseFloat(document.getElementById('solver-pressure').value) || 29.92;
    var humidity = parseFloat(document.getElementById('solver-humidity').value) || 0;

    var params = {
        muzzleVelocity: mv,
        bc: bc,
        dragModel: load.dragModel || 'G1',
        zeroRange: (rifle && rifle.zeroRange) ? parseFloat(rifle.zeroRange) : 100,
        scopeHeight: (rifle && rifle.scopeHeight) ? parseFloat(rifle.scopeHeight) : 1.5,
        bulletWeight: load.bulletWeight ? parseFloat(load.bulletWeight) : 168,
        maxRange: maxRange,
        rangeStep: rangeStep,
        windSpeedMph: windSpeed,
        windClockPos: windClockPos,
        tempF: tempF,
        pressureInHg: pressure,
        humidity: humidity
    };

    var result = computeTrajectory(params);
    this._renderTable(result);
};

BallisticSolverManager.prototype._renderTable = function (result) {
    var container = document.getElementById('solver-results');
    if (!container) return;

    var zeroRange = (this.selectedRifle && this.selectedRifle.zeroRange)
        ? parseFloat(this.selectedRifle.zeroRange) : 100;

    var html = '<div class="solver-table-wrap">';
    html += '<table class="solver-table">';
    html += '<thead><tr>';
    html += '<th>Range<span class="th-unit">yds</span></th>';
    html += '<th>Drop<span class="th-unit">in</span></th>';
    html += '<th>Drop<span class="th-unit">MOA</span></th>';
    html += '<th class="solver-comeup">Come Up<span class="th-unit">MOA</span></th>';
    html += '<th>Wind<span class="th-unit">in</span></th>';
    html += '<th>Wind<span class="th-unit">MOA</span></th>';
    html += '<th>Vel<span class="th-unit">fps</span></th>';
    html += '<th>Energy<span class="th-unit">ft-lb</span></th>';
    html += '<th>TOF<span class="th-unit">sec</span></th>';
    html += '<th>Mach</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    for (var i = 0; i < result.table.length; i++) {
        var row = result.table[i];
        var isZero = (row.rangeYards === zeroRange);
        var cls = isZero ? ' class="solver-row-zero"' : '';

        html += '<tr' + cls + '>';
        html += '<td>' + row.rangeYards + '</td>';
        html += '<td>' + formatFixed(row.dropInches, 1) + '</td>';
        html += '<td>' + formatFixed(row.dropMOA, 1) + '</td>';
        html += '<td class="solver-comeup">' + formatFixed(row.comeUpMOA, 1) + '</td>';
        html += '<td>' + formatFixed(row.windDriftInches, 1) + '</td>';
        html += '<td>' + formatFixed(row.windDriftMOA, 1) + '</td>';
        html += '<td>' + row.velocityFps + '</td>';
        html += '<td>' + row.energyFtLbs + '</td>';
        html += '<td>' + formatFixed(row.timeOfFlightSec, 3) + '</td>';
        html += '<td>' + formatFixed(row.machNumber, 2) + '</td>';
        html += '</tr>';
    }

    html += '</tbody></table>';
    html += '</div>';

    container.innerHTML = html;
};

BallisticSolverManager.prototype._esc = function (str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
};
