# CLAUDE.md — Instructions for Claude Code

## Project
Ballistic Tracker — a PWA for precision rifle shooters to photograph targets, mark shot impacts, calculate group statistics, and manage gun profiles.

## Tech Stack
- Plain HTML, CSS, JavaScript (NO frameworks, NO build tools)
- IndexedDB for local storage
- HTML5 Canvas for image/marker interaction
- PWA (service worker + manifest)

## Architecture Rules
1. **Calculation engine (`calculations.js`) must be pure functions.** No DOM access, no storage, no side effects. Input coordinates → output measurements. Write unit tests for these.
2. **One file per concern.** Canvas interaction, calibration, calculations, database, session flow, profiles, export — all separate files.
3. **Mobile-first.** All touch targets minimum 44px. Design for phone screens. Test zoom/pan on touch devices.
4. **Defensive coding.** Validate all inputs. Handle null/undefined. No silent failures.
5. **Calibration is per-session.** Never assume a global scale factor.
6. **Store snapshots, not references.** When saving a session, copy bullet diameter, velocity, etc. into the session record. Don't rely on the load profile not changing.

## Current Phase
Building Phase 1: Core Session Workflow
- Load image (camera or photo library)
- Set 1-inch calibration (two taps)
- Input distance + bullet diameter
- Mark POA
- Mark numbered impacts (up to 10)
- Calculate group size, MOA, offsets, ATZ
- Display annotated image with results overlay
- Save/share annotated image

## Key Formulas
```
pixelsPerInch = pixelDistanceBetweenCalibrationPoints / 1.0
groupSize_inches = pixelDistance / pixelsPerInch
  (impacts are tapped at hole centers, so pixel distance IS center-to-center)
MOA = (inches / distanceYards) * (100 / 1.047)
ATZ = negate the offset from POA to group centroid, in MOA
```

## File Structure
See SPEC.md for complete structure. Key files for Phase 1:
- `index.html` — app shell
- `css/main.css` — styles
- `js/app.js` — init and navigation
- `js/canvas-manager.js` — image loading, zoom/pan, marker placement
- `js/calibration.js` — calibration logic
- `js/calculations.js` — all math (PURE FUNCTIONS)
- `js/session-flow.js` — step-by-step workflow controller
- `js/export.js` — annotated image rendering
- `js/utils.js` — helpers

## Testing
- Test `calculations.js` with known values before building UI
- Example: 5 shots at 100 yards, .308 bullet, group should calculate correctly
- Verify MOA conversion: 1.047" at 100 yards = 1.0 MOA

## Style
- Dark theme (easy on eyes at range, matches shooting app conventions)
- Green accent color for markers (high visibility on most target backgrounds)
- Blue for POA marker
- Clean, functional UI — not decorative. This is a tool.

## Do NOT
- Use any npm packages or build tools
- Use React, Vue, or any framework
- Store images as blobs in IndexedDB
- Make the calculation engine depend on the DOM
- Use localStorage (use IndexedDB)
- Hard-code bullet diameters or distances
