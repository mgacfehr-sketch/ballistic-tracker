/**
 * calibration.js — Manages the two-point 1-inch calibration workflow.
 *
 * States: idle → waitingA → waitingB → complete
 */

function CalibrationManager() {
    this.state = 'idle';   // 'idle' | 'waitingA' | 'waitingB' | 'complete'
    this.pointA = null;    // {x, y} in image coords
    this.pointB = null;
    this.pixelsPerInch = 0;
}

/**
 * Start or restart the calibration process.
 */
CalibrationManager.prototype.start = function () {
    this.state = 'waitingA';
    this.pointA = null;
    this.pointB = null;
    this.pixelsPerInch = 0;
};

/**
 * Reset to idle.
 */
CalibrationManager.prototype.reset = function () {
    this.state = 'idle';
    this.pointA = null;
    this.pointB = null;
    this.pixelsPerInch = 0;
};

/**
 * Handle a tap during calibration.
 * @param {{x: number, y: number}} point - Image coordinates of the tap
 * @returns {{state: string, pixelsPerInch: number}} Updated state info
 */
CalibrationManager.prototype.handleTap = function (point) {
    if (this.state === 'waitingA') {
        this.pointA = { x: point.x, y: point.y };
        this.state = 'waitingB';
        return { state: this.state, pixelsPerInch: 0 };
    }

    if (this.state === 'waitingB') {
        this.pointB = { x: point.x, y: point.y };
        var pxDist = dist(this.pointA, this.pointB);

        if (pxDist < 5) {
            // Points too close — reject and retry
            this.pointB = null;
            return { state: 'waitingB', pixelsPerInch: 0, error: 'Points too close. Tap farther apart.' };
        }

        this.pixelsPerInch = pxDist; // distance in pixels = 1 inch
        this.state = 'complete';
        return { state: this.state, pixelsPerInch: this.pixelsPerInch };
    }

    return { state: this.state, pixelsPerInch: this.pixelsPerInch };
};

/**
 * Get the calibration data for storage.
 * @returns {object|null}
 */
CalibrationManager.prototype.getData = function () {
    if (this.state !== 'complete') return null;
    return {
        pointA: { x: this.pointA.x, y: this.pointA.y },
        pointB: { x: this.pointB.x, y: this.pointB.y },
        pixelsPerInch: this.pixelsPerInch
    };
};
