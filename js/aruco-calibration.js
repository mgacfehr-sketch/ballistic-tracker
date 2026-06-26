/**
 * aruco-calibration.js — Automatic target scaling using ArUco markers.
 *
 * The yorT target specification (DICT_4X4_50):
 *   marker id 0 = top-left
 *   marker id 1 = top-right
 *   marker id 2 = bottom-left
 *   marker id 3 = bottom-right
 *   each marker is 0.6" square
 *   measurement grid between markers is exactly 6.0" x 6.0"
 *   marker outer corners sit 0.18" outside grid corners
 *
 * If all 4 markers detect, the photo is warped flat and pixelsPerInch
 * is derived from the known geometry. Otherwise the caller falls back
 * to manual two-point calibration.
 *
 * Depends on js-aruco2 (loaded via <script> in index.html). Falls back
 * to "not available" if the library is missing.
 */

(function (global) {
    'use strict';

    // ── Target geometry constants ─────────────────────────────────
    var GRID_INCHES = 6.0;          // 6" x 6" measurement grid
    var MARKER_SIZE = 0.6;          // 0.6" square markers
    var MARKER_OFFSET = 0.8;        // outer corner 0.8" outside grid corner (measured from printed target)

    // Marker centers in grid-inch coords (grid origin = top-left at 0,0):
    //   outer corner of marker is at (-OFFSET, -OFFSET) etc., marker is OFFSET in,
    //   so center = outer corner + MARKER_SIZE/2 in toward grid center.
    var TL_CENTER = { x: -MARKER_OFFSET + MARKER_SIZE / 2, y: -MARKER_OFFSET + MARKER_SIZE / 2 };
    var TR_CENTER = { x: GRID_INCHES + MARKER_OFFSET - MARKER_SIZE / 2, y: -MARKER_OFFSET + MARKER_SIZE / 2 };
    var BL_CENTER = { x: -MARKER_OFFSET + MARKER_SIZE / 2, y: GRID_INCHES + MARKER_OFFSET - MARKER_SIZE / 2 };
    var BR_CENTER = { x: GRID_INCHES + MARKER_OFFSET - MARKER_SIZE / 2, y: GRID_INCHES + MARKER_OFFSET - MARKER_SIZE / 2 };

    // ── Public API ────────────────────────────────────────────────

    function ArucoCalibration() {
        this.lastResult = null;
    }

    /**
     * True only if the js-aruco2 library has loaded successfully.
     */
    ArucoCalibration.prototype.isReady = function () {
        return (typeof global.AR !== 'undefined') && (typeof global.AR.Detector === 'function');
    };

    /**
     * Attempt to detect the four target markers in the image.
     * @param {HTMLImageElement} image
     * @returns {Object} { success, markers, missingIds, message }
     *   When success===true, markers = { 0:{x,y}, 1:{x,y}, 2:{x,y}, 3:{x,y} } (centers in source-image pixels).
     */
    ArucoCalibration.prototype.detect = function (image) {
        if (!this.isReady()) {
            return { success: false, message: 'ArUco library unavailable' };
        }
        if (!image) return { success: false, message: 'No image' };

        var w = image.naturalWidth || image.width;
        var h = image.naturalHeight || image.height;

        // Draw at moderate resolution for detection (faster + good enough for ~0.6" markers)
        var detectMax = 1280;
        var detectScale = Math.min(1, detectMax / Math.max(w, h));
        var dw = Math.round(w * detectScale);
        var dh = Math.round(h * detectScale);

        var canvas = document.createElement('canvas');
        canvas.width = dw;
        canvas.height = dh;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, dw, dh);
        var imageData = ctx.getImageData(0, 0, dw, dh);

        var detector;
        try {
            detector = new global.AR.Detector({ dictionaryName: 'ARUCO_MIP_36h12' });
        } catch (e) {
            return { success: false, message: 'Failed to create detector: ' + e.message };
        }

        var detected;
        try {
            detected = detector.detect(imageData);
        } catch (e) {
            return { success: false, message: 'Detection error: ' + e.message };
        }

        // Build a list of ALL detected marker centers, ignoring marker ID entirely.
        // ID decoding varies by device/firmware; position is reliable.
        var centers = [];
        for (var i = 0; i < detected.length; i++) {
            var m = detected[i];
            var cx = 0, cy = 0;
            for (var k = 0; k < 4; k++) {
                cx += m.corners[k].x;
                cy += m.corners[k].y;
            }
            cx /= 4; cy /= 4;
            // Scale back to source image coords
            centers.push({ x: cx / detectScale, y: cy / detectScale });
        }

        if (centers.length < 4) {
            return { success: false, message: 'Found only ' + centers.length + ' of 4 markers' };
        }

        // Pick 4 outermost centers by diagonal projection.
        // Real corner fiducials are outside the grid; interior noise detections are not extremes.
        //   top-left     = min(x + y)
        //   bottom-right = max(x + y)
        //   top-right    = max(x - y)
        //   bottom-left  = min(x - y)
        var tl = centers[0], tr = centers[0], bl = centers[0], br = centers[0];
        for (var j = 1; j < centers.length; j++) {
            var c = centers[j];
            if (c.x + c.y < tl.x + tl.y) tl = c;
            if (c.x + c.y > br.x + br.y) br = c;
            if (c.x - c.y > tr.x - tr.y) tr = c;
            if (c.x - c.y < bl.x - bl.y) bl = c;
        }

        // Sanity guard: bounding box must span ≥30% of source image in both axes.
        // Rejects cases where only a small cluster of interior markers was detected.
        var minX = Math.min(tl.x, tr.x, bl.x, br.x);
        var maxX = Math.max(tl.x, tr.x, bl.x, br.x);
        var minY = Math.min(tl.y, tr.y, bl.y, br.y);
        var maxY = Math.max(tl.y, tr.y, bl.y, br.y);
        if ((maxX - minX) < w * 0.3 || (maxY - minY) < h * 0.3) {
            return { success: false, message: 'Markers too clustered — frame the full target' };
        }

        // slots: 0=TL, 1=TR, 2=BL, 3=BR (matches warpFlat expectations)
        var idMap = { 0: tl, 1: tr, 2: bl, 3: br };

        this.lastResult = { success: true, markers: idMap };
        return this.lastResult;
    };

    /**
     * Build a flattened (perspective-corrected) canvas of the target.
     * @param {HTMLImageElement} image - source photo
     * @param {Object} markers - {0:{x,y}, 1:{x,y}, 2:{x,y}, 3:{x,y}} in source pixels
     * @param {number} ppi - desired pixels-per-inch for the output
     * @returns {{ canvas: HTMLCanvasElement, pixelsPerInch: number, originInches: {x,y} }}
     *   The output canvas spans from (-MARKER_OFFSET - MARKER_SIZE) to (GRID + MARKER_OFFSET + MARKER_SIZE)
     *   so all four markers + the full grid are visible.
     */
    ArucoCalibration.prototype.warpFlat = function (image, markers, ppi) {
        ppi = ppi || 120;

        // Output canvas covers a little beyond the markers for context
        var pad = MARKER_OFFSET + MARKER_SIZE + 0.4;
        var minInch = -pad;
        var maxInch = GRID_INCHES + pad;
        var spanInch = maxInch - minInch;
        var outSize = Math.round(spanInch * ppi);

        // Destination points in output pixels (flat, axis-aligned)
        var dst = {
            0: { x: (TL_CENTER.x - minInch) * ppi, y: (TL_CENTER.y - minInch) * ppi },
            1: { x: (TR_CENTER.x - minInch) * ppi, y: (TR_CENTER.y - minInch) * ppi },
            2: { x: (BL_CENTER.x - minInch) * ppi, y: (BL_CENTER.y - minInch) * ppi },
            3: { x: (BR_CENTER.x - minInch) * ppi, y: (BR_CENTER.y - minInch) * ppi }
        };

        // Compute inverse homography mapping output pixel → source pixel
        var H = _computeHomography([
            dst[0], dst[1], dst[2], dst[3]
        ], [
            markers[0], markers[1], markers[2], markers[3]
        ]);

        var out = document.createElement('canvas');
        out.width = outSize;
        out.height = outSize;
        var outCtx = out.getContext('2d');

        // Draw source image to an offscreen canvas at full resolution to sample from
        var srcW = image.naturalWidth || image.width;
        var srcH = image.naturalHeight || image.height;
        var srcCanvas = document.createElement('canvas');
        srcCanvas.width = srcW;
        srcCanvas.height = srcH;
        var srcCtx = srcCanvas.getContext('2d');
        srcCtx.drawImage(image, 0, 0, srcW, srcH);
        var srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;

        var outData = outCtx.createImageData(outSize, outSize);
        var od = outData.data;

        for (var y = 0; y < outSize; y++) {
            for (var x = 0; x < outSize; x++) {
                // Apply homography: H maps output → source
                var denom = H[6] * x + H[7] * y + H[8];
                if (denom === 0) { continue; }
                var sx = (H[0] * x + H[1] * y + H[2]) / denom;
                var sy = (H[3] * x + H[4] * y + H[5]) / denom;
                var ix = Math.round(sx);
                var iy = Math.round(sy);
                if (ix < 0 || ix >= srcW || iy < 0 || iy >= srcH) continue;
                var srcOffset = (iy * srcW + ix) * 4;
                var outOffset = (y * outSize + x) * 4;
                od[outOffset]     = srcData[srcOffset];
                od[outOffset + 1] = srcData[srcOffset + 1];
                od[outOffset + 2] = srcData[srcOffset + 2];
                od[outOffset + 3] = 255;
            }
        }

        outCtx.putImageData(outData, 0, 0);

        return {
            canvas: out,
            pixelsPerInch: ppi,
            originInches: { x: minInch, y: minInch },
            gridStartPx: -minInch * ppi,
            gridEndPx: (GRID_INCHES - minInch) * ppi
        };
    };

    // ── Homography solver — direct linear transform (4 point pairs) ──
    // Returns 9-element array [h11, h12, h13, h21, h22, h23, h31, h32, h33]
    // mapping src → dst.
    function _computeHomography(src, dst) {
        // 8x8 linear system, h33 = 1
        // For each correspondence (sx, sy) → (dx, dy):
        //   sx*h31 + sy*h32 + h33 = wd
        //   dx*wd = sx*h11 + sy*h12 + h13
        //   dy*wd = sx*h21 + sy*h22 + h23
        // Rearrange: 2 equations per point.
        var A = [];
        var b = [];
        for (var i = 0; i < 4; i++) {
            var sx = src[i].x, sy = src[i].y;
            var dx = dst[i].x, dy = dst[i].y;
            A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
            b.push(dx);
            A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
            b.push(dy);
        }
        var h = _solveLinear(A, b);
        return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
    }

    // Gauss elimination for 8x8 system
    function _solveLinear(A, b) {
        var n = b.length;
        // Augment
        for (var i = 0; i < n; i++) A[i].push(b[i]);
        // Forward elim
        for (var col = 0; col < n; col++) {
            // Partial pivot
            var maxRow = col;
            var maxVal = Math.abs(A[col][col]);
            for (var r = col + 1; r < n; r++) {
                if (Math.abs(A[r][col]) > maxVal) { maxVal = Math.abs(A[r][col]); maxRow = r; }
            }
            if (maxRow !== col) { var tmp = A[col]; A[col] = A[maxRow]; A[maxRow] = tmp; }
            if (A[col][col] === 0) continue;
            for (var rr = col + 1; rr < n; rr++) {
                var f = A[rr][col] / A[col][col];
                for (var cc = col; cc <= n; cc++) {
                    A[rr][cc] -= f * A[col][cc];
                }
            }
        }
        // Back-substitute
        var x = new Array(n);
        for (var k = n - 1; k >= 0; k--) {
            var sum = A[k][n];
            for (var kk = k + 1; kk < n; kk++) sum -= A[k][kk] * x[kk];
            x[k] = A[k][k] === 0 ? 0 : sum / A[k][k];
        }
        return x;
    }

    // Expose constants for callers that want to draw the grid overlay later.
    ArucoCalibration.GRID_INCHES = GRID_INCHES;
    ArucoCalibration.MARKER_SIZE = MARKER_SIZE;
    ArucoCalibration.MARKER_OFFSET = MARKER_OFFSET;

    global.ArucoCalibration = ArucoCalibration;
})(typeof window !== 'undefined' ? window : this);
