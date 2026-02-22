/**
 * calculations.js — Pure calculation functions for ballistic group analysis.
 * 
 * ALL functions in this file are pure: no DOM, no storage, no side effects.
 * Input: coordinates and measurements. Output: calculated results.
 * 
 * Coordinate system: pixel coordinates from canvas (origin = top-left).
 * "Up" on the target = negative Y in pixels.
 * All output distances are in inches unless otherwise noted.
 */

const MOA_FACTOR = 1.047; // 1 MOA = 1.047 inches at 100 yards

/**
 * Convert a measurement in inches to MOA at a given distance.
 * @param {number} inches - Measurement in inches
 * @param {number} distanceYards - Distance to target in yards
 * @returns {number} Measurement in MOA
 */
function inchesToMOA(inches, distanceYards) {
    if (distanceYards <= 0) throw new Error('Distance must be positive');
    return (inches / distanceYards) * (100 / MOA_FACTOR);
}

/**
 * Convert MOA to inches at a given distance.
 * @param {number} moa - Measurement in MOA
 * @param {number} distanceYards - Distance to target in yards
 * @returns {number} Measurement in inches
 */
function moaToInches(moa, distanceYards) {
    if (distanceYards <= 0) throw new Error('Distance must be positive');
    return moa * MOA_FACTOR * (distanceYards / 100);
}

/**
 * Calculate pixel distance between two points.
 * @param {{x: number, y: number}} p1
 * @param {{x: number, y: number}} p2
 * @returns {number} Distance in pixels
 */
function pixelDistance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Convert a pixel distance to inches using calibration.
 * @param {number} pxDist - Distance in pixels
 * @param {number} pixelsPerInch - Calibration ratio
 * @returns {number} Distance in inches
 */
function pixelsToInches(pxDist, pixelsPerInch) {
    if (pixelsPerInch <= 0) throw new Error('pixelsPerInch must be positive');
    return pxDist / pixelsPerInch;
}

/**
 * Calculate center-to-center distance between two impacts.
 * Subtracts one bullet diameter from edge-to-edge measurement.
 * @param {number} edgeToEdgeInches - Measured edge-to-edge distance in inches
 * @param {number} bulletDiameter - Bullet diameter in inches
 * @returns {number} Center-to-center distance in inches
 */
function centerToCenter(edgeToEdgeInches, bulletDiameter) {
    const ctc = edgeToEdgeInches - bulletDiameter;
    return Math.max(0, ctc); // Can't be negative
}

/**
 * Calculate the centroid (geometric center) of a set of impact points.
 * @param {{x: number, y: number}[]} impacts - Array of impact coordinates
 * @returns {{x: number, y: number}} Centroid point
 */
function calculateCentroid(impacts) {
    if (!impacts || impacts.length === 0) throw new Error('No impacts provided');
    const sumX = impacts.reduce((sum, p) => sum + p.x, 0);
    const sumY = impacts.reduce((sum, p) => sum + p.y, 0);
    return {
        x: sumX / impacts.length,
        y: sumY / impacts.length
    };
}

/**
 * Calculate group size (maximum center-to-center spread).
 * Finds the two impacts that are farthest apart.
 * Impact coordinates are hole centers (user taps the center of each hole),
 * so pixel distance between impacts is already center-to-center.
 * @param {{x: number, y: number}[]} impacts - Array of impact pixel coordinates (hole centers)
 * @param {number} pixelsPerInch - Calibration ratio
 * @returns {{inches: number, pair: [number, number]}} Group size and which shots form the max pair
 */
function calculateGroupSize(impacts, pixelsPerInch) {
    if (impacts.length < 2) return { inches: 0, pair: [0, 0] };

    let maxDist = 0;
    let maxPair = [0, 1];

    for (let i = 0; i < impacts.length; i++) {
        for (let j = i + 1; j < impacts.length; j++) {
            const dist = pixelDistance(impacts[i], impacts[j]);
            if (dist > maxDist) {
                maxDist = dist;
                maxPair = [i, j];
            }
        }
    }

    const ctcInches = pixelsToInches(maxDist, pixelsPerInch);

    return {
        inches: ctcInches,
        pair: maxPair
    };
}

/**
 * Calculate mean radius — average distance from each impact to the group centroid.
 * @param {{x: number, y: number}[]} impacts - Array of impact pixel coordinates
 * @param {number} pixelsPerInch - Calibration ratio
 * @returns {number} Mean radius in inches
 */
function calculateMeanRadius(impacts, pixelsPerInch) {
    if (impacts.length < 2) return 0;
    const centroid = calculateCentroid(impacts);
    const totalDist = impacts.reduce((sum, p) => sum + pixelDistance(p, centroid), 0);
    return pixelsToInches(totalDist / impacts.length, pixelsPerInch);
}

/**
 * Calculate extreme vertical spread (height of group).
 * Impact coordinates are hole centers, so spread is already center-to-center.
 * @param {{x: number, y: number}[]} impacts - Array of impact pixel coordinates (hole centers)
 * @param {number} pixelsPerInch - Calibration ratio
 * @returns {number} Vertical spread in inches (center-to-center)
 */
function calculateVerticalSpread(impacts, pixelsPerInch) {
    if (impacts.length < 2) return 0;
    const ys = impacts.map(p => p.y);
    const spreadPx = Math.max(...ys) - Math.min(...ys);
    return pixelsToInches(spreadPx, pixelsPerInch);
}

/**
 * Calculate extreme horizontal spread (width of group).
 * Impact coordinates are hole centers, so spread is already center-to-center.
 * @param {{x: number, y: number}[]} impacts - Array of impact pixel coordinates (hole centers)
 * @param {number} pixelsPerInch - Calibration ratio
 * @returns {number} Horizontal spread in inches (center-to-center)
 */
function calculateHorizontalSpread(impacts, pixelsPerInch) {
    if (impacts.length < 2) return 0;
    const xs = impacts.map(p => p.x);
    const spreadPx = Math.max(...xs) - Math.min(...xs);
    return pixelsToInches(spreadPx, pixelsPerInch);
}

/**
 * Calculate offset from Point of Aim (POA) to group centroid.
 * Returns elevation and windage offsets in inches.
 * Convention: positive elevation = impacts are HIGH, positive windage = impacts are RIGHT.
 * Note: In canvas coordinates, Y increases downward, so we negate the Y component.
 * @param {{x: number, y: number}} poa - Point of Aim in pixel coordinates
 * @param {{x: number, y: number}[]} impacts - Impact pixel coordinates
 * @param {number} pixelsPerInch - Calibration ratio
 * @returns {{elevationInches: number, windageInches: number}}
 */
function calculatePOAOffset(poa, impacts, pixelsPerInch) {
    if (impacts.length === 0) return { elevationInches: 0, windageInches: 0 };
    const centroid = calculateCentroid(impacts);
    const dx = centroid.x - poa.x; // positive = right
    const dy = poa.y - centroid.y; // positive = up (inverted from canvas Y)
    return {
        elevationInches: pixelsToInches(dy, pixelsPerInch),
        windageInches: pixelsToInches(dx, pixelsPerInch)
    };
}

/**
 * Calculate Adjust to Zero (ATZ) — scope adjustments needed.
 * This is the negation of the POA offset: if impacts are high-right, adjust down-left.
 * @param {{elevationInches: number, windageInches: number}} offset - POA offset
 * @param {number} distanceYards - Distance to target
 * @returns {{elevationMOA: number, windageMOA: number, elevationDir: string, windageDir: string}}
 */
function calculateATZ(offset, distanceYards) {
    const elevationMOA = inchesToMOA(Math.abs(offset.elevationInches), distanceYards);
    const windageMOA = inchesToMOA(Math.abs(offset.windageInches), distanceYards);

    return {
        elevationMOA: elevationMOA,
        windageMOA: windageMOA,
        elevationDir: offset.elevationInches > 0 ? 'Down' : 'Up',
        windageDir: offset.windageInches > 0 ? 'Left' : 'Right'
    };
}

/**
 * Run all calculations for a session and return a complete results object.
 * This is the main entry point for the calculation engine.
 * @param {object} params
 * @param {{x: number, y: number}[]} params.impacts - Impact pixel coordinates (ordered)
 * @param {{x: number, y: number}} params.poa - Point of Aim pixel coordinates
 * @param {number} params.pixelsPerInch - Calibration ratio
 * @param {number} params.bulletDiameter - Bullet diameter in inches
 * @param {number} params.distanceYards - Distance to target in yards
 * @returns {object} Complete results object
 */
function calculateSession(params) {
    const { impacts, poa, pixelsPerInch, bulletDiameter, distanceYards } = params;

    if (!impacts || impacts.length === 0) {
        throw new Error('No impacts to calculate');
    }

    const groupSize = calculateGroupSize(impacts, pixelsPerInch);
    const meanRadius = calculateMeanRadius(impacts, pixelsPerInch);
    const verticalSpread = calculateVerticalSpread(impacts, pixelsPerInch);
    const horizontalSpread = calculateHorizontalSpread(impacts, pixelsPerInch);
    const poaOffset = calculatePOAOffset(poa, impacts, pixelsPerInch);
    const atz = calculateATZ(poaOffset, distanceYards);
    const centroid = calculateCentroid(impacts);

    return {
        shotCount: impacts.length,
        distanceYards: distanceYards,

        groupSizeInches: round4(groupSize.inches),
        groupSizeMOA: round4(inchesToMOA(groupSize.inches, distanceYards)),
        groupSizePair: groupSize.pair,

        meanRadiusInches: round4(meanRadius),
        meanRadiusMOA: round4(inchesToMOA(meanRadius, distanceYards)),

        verticalSpreadInches: round4(verticalSpread),
        verticalSpreadMOA: round4(inchesToMOA(verticalSpread, distanceYards)),

        horizontalSpreadInches: round4(horizontalSpread),
        horizontalSpreadMOA: round4(inchesToMOA(horizontalSpread, distanceYards)),

        elevationOffsetInches: round4(poaOffset.elevationInches),
        elevationOffsetMOA: round4(inchesToMOA(Math.abs(poaOffset.elevationInches), distanceYards)),
        windageOffsetInches: round4(poaOffset.windageInches),
        windageOffsetMOA: round4(inchesToMOA(Math.abs(poaOffset.windageInches), distanceYards)),

        atzElevationMOA: round4(atz.elevationMOA),
        atzElevationDir: atz.elevationDir,
        atzWindageMOA: round4(atz.windageMOA),
        atzWindageDir: atz.windageDir,

        centroid: {
            x: centroid.x,
            y: centroid.y
        }
    };
}

/**
 * Round to 4 decimal places (avoids floating point display noise).
 */
function round4(n) {
    return Math.round(n * 10000) / 10000;
}

// Export for use in other modules and testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MOA_FACTOR,
        inchesToMOA,
        moaToInches,
        pixelDistance,
        pixelsToInches,
        centerToCenter,
        calculateCentroid,
        calculateGroupSize,
        calculateMeanRadius,
        calculateVerticalSpread,
        calculateHorizontalSpread,
        calculatePOAOffset,
        calculateATZ,
        calculateSession,
        round4
    };
}
