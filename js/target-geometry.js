/**
 * target-geometry.js — THE calibration geometry law (v2.4 Part 3).
 *
 * ONE shared constant set: js/aruco-calibration.js (the homography
 * warp) and js/target-pdf.js (the printed artwork) BOTH derive from
 * this object, so the printed target and the detector can never
 * drift apart. Change geometry HERE and nowhere else.
 *
 * v2.4 marker relocation (owner-directed): from the old grid-corner
 * positions, the top pair moves DOWN 1.0" and the bottom pair UP 1.0"
 * (toward vertical center), and both pairs sit 0.5" OUTSIDE the aim
 * field horizontally — fully in the side margins, ≥1" from the paper
 * corners (staple-tear safe). Marker pixel patterns and printed size
 * are unchanged; only positions moved.
 *
 * Coordinates are inches in "grid space": the 6.0" aim field's
 * top-left corner is (0,0), x right, y down. Marker centers:
 *   TL (-0.5, 1.0)   TR (6.5, 1.0)
 *   BL (-0.5, 5.0)   BR (6.5, 5.0)
 * → horizontal center spacing 7.00", vertical 4.00".
 */

var TARGET_GEOMETRY = {
    GRID_INCHES: 6.0,      // the central aim field (bold outline)
    MARKER_SIZE: 0.6,      // printed marker square, unchanged
    QUIET_ZONE: 0.22,      // solid-white margin around each marker — non-negotiable
    MARKER_CENTERS: {
        TL: { x: -0.5, y: 1.0 },
        TR: { x: 6.5, y: 1.0 },
        BL: { x: -0.5, y: 5.0 },
        BR: { x: 6.5, y: 5.0 }
    }
};

// Derived spacings (tests + captions read these; never hand-write them)
TARGET_GEOMETRY.SPAN_X = TARGET_GEOMETRY.MARKER_CENTERS.TR.x - TARGET_GEOMETRY.MARKER_CENTERS.TL.x; // 7.00
TARGET_GEOMETRY.SPAN_Y = TARGET_GEOMETRY.MARKER_CENTERS.BL.y - TARGET_GEOMETRY.MARKER_CENTERS.TL.y; // 4.00

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TARGET_GEOMETRY;
}
