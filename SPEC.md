# Ballistic Tracker PWA — Full Specification

## Overview
A Progressive Web App (PWA) for precision rifle shooters to photograph targets, mark shot impacts, calculate group statistics, manage gun/load profiles, track barrel life, and get AI-powered shooting advice. Designed for mobile-first use at the range. Zero cost, no app store — installable from the browser.

## Tech Stack
- **Frontend:** Plain HTML, CSS, JavaScript (no frameworks)
- **Storage:** IndexedDB (via a thin wrapper)
- **Image handling:** HTML5 Canvas API
- **PWA:** Service worker + manifest for offline support and home screen install
- **AI (Phase 6):** Claude API (Anthropic)
- **Ballistic solver (Phase 7):** Custom point-mass solver in JavaScript (G1/G7 drag models)

---

## Build Phases

### Phase 1 — Core Session Workflow (Build First)
The heart of the app. A standalone flow that works without profiles.

**Step-by-step UX flow:**
1. **Load image** — Camera capture or pick from phone photo library
2. **Set 1" calibration** — User zooms into a known 1-inch reference on the target, taps point A, taps point B. App calculates `pixelsPerInch = distance_in_pixels / 1.0`
3. **Input distance to target** — Numeric input, 1–1500 yards
4. **Input bullet diameter** — Numeric input in inches (e.g., 0.308). In quick/misc mode this is manual; in profile mode it auto-fills from the load
5. **Mark Point of Aim (POA)** — Single tap to place a blue/distinct marker where the shooter was aiming
6. **Mark impacts sequentially** — Tap to place numbered markers (1, 2, 3... up to 10). Each marker is a circle sized to bullet diameter at the current scale. Markers are numbered and color-coded (green crosshair style, referencing Ballistic-X UX). User can tap an existing marker to delete/re-place it.
7. **Calculate and display results** — Show overlay card on the annotated image

**Calculations (all distances are center-to-center after subtracting one bullet diameter from edge-to-edge pixel measurements):**

- **Group size (max spread):** Maximum center-to-center distance between any two impacts. Display in inches AND MOA.
- **MOA conversion:** `moa = (inches / distance_yards) × (100 / 1.047)`
- **Mean radius:** Average distance from each impact to the group centroid (mean X, mean Y of all impacts)
- **Vertical extreme spread:** Max Y difference between any two impacts (inches + MOA)
- **Horizontal extreme spread:** Max X difference between any two impacts (inches + MOA)
- **Elevation offset from POA:** Distance from POA to group centroid, vertical component (inches + MOA). Positive = high, negative = low.
- **Windage offset from POA:** Distance from POA to group centroid, horizontal component (inches + MOA). Positive = right, negative = left.
- **ATZ (Adjust to Zero):** The scope adjustment needed. E.g., "Down 0.60 MOA, Right 0.25 MOA". This is just the negation of the offset — if impacts are high-left, adjust down-right.

**Annotated image output:**
- Composite the original photo + all markers (numbered crosshairs) + POA marker + results overlay card
- User can save this composite image to phone photo library or share it
- The overlay card shows: group size (inches + MOA), distance, shot count, ATZ adjustments
- Canvas export via `canvas.toBlob()` or `canvas.toDataURL()`

**Canvas interaction requirements:**
- Pinch-to-zoom on mobile
- Pan when zoomed in
- Tap to place markers (must work accurately when zoomed)
- Markers must scale correctly with zoom level
- Image orientation must be handled (EXIF rotation from phone cameras)

---

### Phase 2 — Data Model & Gun/Load Profiles

**Entities:**

#### Rifle
- `id` (UUID)
- `name` (string, e.g., "Bergara B14 HMR")
- `caliber` (string, e.g., ".308 Win")
- `scopeHeight` (number, inches — center of bore to center of scope)
- `zeroRange` (number, yards)
- `angleUnit` (string, "MOA" — future: "MIL")
- `notes` (string, optional)
- `createdAt` (ISO datetime)
- `updatedAt` (ISO datetime)

#### Barrel
- `id` (UUID)
- `rifleId` (FK → Rifle)
- `twistRate` (string, e.g., "1:10")
- `twistDirection` (string, "Right" or "Left")
- `installDate` (ISO date)
- `isActive` (boolean — only one active barrel per rifle)
- `totalRounds` (number — manually tracked total round count)
- `notes` (string, optional)

#### Load (Ammo Profile)
- `id` (UUID)
- `rifleId` (FK → Rifle)
- `name` (string, e.g., "Hornady 168gr ELD-M")
- `bulletName` (string)
- `bulletWeight` (number, grains)
- `bulletLength` (number, inches, optional)
- `bulletDiameter` (number, inches, e.g., 0.308)
- `bulletBC` (number, ballistic coefficient)
- `dragModel` (string, "G1" or "G7")
- `muzzleVelocity` (number, fps — baseline/expected)
- `notes` (string, optional)
- `createdAt` (ISO datetime)

#### Session (Range Visit Record)
- `id` (UUID)
- `rifleId` (FK → Rifle, nullable for quick/misc mode)
- `loadId` (FK → Load, nullable for quick/misc mode)
- `barrelId` (FK → Barrel, nullable)
- `date` (ISO datetime)
- `distanceYards` (number)
- `roundsFired` (number)
- `measuredVelocity` (number, fps, optional — chrono reading)
- `weather` (embedded WeatherSnapshot, optional)
- `imageFilename` (string — reference to stored image file)
- `calibrationData` (object: `{pointA: {x,y}, pointB: {x,y}, pixelsPerInch: number}`)
- `bulletDiameter` (number — snapshot at time of session, in case load changes)
- `poaPoint` (object: `{x, y}` in image pixel coordinates)
- `impacts` (array of `{id, number, x, y}` — ordered, in image pixel coordinates)
- `results` (object: calculated group size, mean radius, offsets, ATZ, etc.)
- `sightInComments` (string, optional)
- `isZeroSession` (boolean — marks this as the zero confirmation session)
- `createdAt` (ISO datetime)

#### WeatherSnapshot (embedded, not a separate table)
- `temperature` (number, °F, nullable)
- `altitude` (number, feet, nullable)
- `barometricPressure` (number, inHg, nullable)
- `humidity` (number, %, nullable)
- `windSpeed` (number, mph, nullable)
- `windDirection` (string, e.g., "3 o'clock", nullable)

#### ZeroRecord
- `id` (UUID)
- `rifleId` (FK → Rifle)
- `loadId` (FK → Load)
- `sessionId` (FK → Session, optional — link to the session where zero was confirmed)
- `date` (ISO date)
- `rangeYards` (number)
- `weather` (embedded WeatherSnapshot)
- `notes` (string, optional)

#### ScopeAdjustment
- `id` (UUID)
- `rifleId` (FK → Rifle)
- `sessionId` (FK → Session, optional — link to associated session)
- `date` (ISO datetime)
- `elevationChange` (number, MOA — positive = up)
- `windageChange` (number, MOA — positive = right)
- `reason` (string, optional)
- `notes` (string, optional)

#### CleaningLog
- `id` (UUID)
- `rifleId` (FK → Rifle)
- `barrelId` (FK → Barrel)
- `date` (ISO datetime)
- `roundCountAtCleaning` (number — barrel total rounds at time of cleaning, pre-filled from barrel)
- `notes` (string, optional)

**Profile limits:** Up to 50 rifle profiles. No hard limit on loads per rifle, sessions, or log entries.

**Derived/computed values (not stored, calculated on read):**
- Rounds since last cleaning = barrel `totalRounds` minus `roundCountAtCleaning` from most recent cleaning log
- Velocity trend = ordered list of `measuredVelocity` from sessions over time

---

### Phase 3 — Session History & Logging
- Save sessions to profiles after calculation
- View session history per rifle (list, sorted by date)
- Performance over time view: group size trend (chart or list)
- Cleaning log CRUD: add cleaning events, show rounds since last clean
- Scope adjustment log CRUD: add adjustments, view history
- Round count dashboard per barrel
- Muzzle velocity tracking per session, trend view
- Weather entry form (all fields optional, nullable)

---

### Phase 4 — Quick/Miscellaneous Mode
- Full session workflow (Phase 1) without any profile association
- Must prompt for bullet diameter (with common presets: .224, .243, .264, .277, .284, .308, .338)
- Results can be saved as a standalone "misc" session or discarded
- Annotated image can always be saved/shared regardless

---

### Phase 5 — Advanced Statistics
Added to the results overlay and session detail view:
- **CEP (Circular Error Probable):** Radius of the smallest circle centered on group centroid that contains 50% of shots
- **Radial SD:** Standard deviation of each shot's distance from group centroid
- **Vertical SD:** Standard deviation of Y-coordinates of impacts
- **Horizontal SD:** Standard deviation of X-coordinates of impacts
- **Mean windage:** Average horizontal offset from POA (inches + MOA)
- **Mean elevation:** Average vertical offset from POA (inches + MOA)
- **POI Score:** (Research specific scoring algorithm — placeholder)

---

### Phase 6 — AI Assistant
- Chat interface within the app
- When user asks a question, app gathers relevant context from IndexedDB:
  - Recent sessions for the selected rifle
  - Group size trends
  - Velocity trends
  - Weather data from recent sessions vs. zero conditions
  - Round count / barrel life
  - Cleaning history
  - Scope adjustment history
- Context is packaged into a structured prompt and sent to Claude API (claude-sonnet-4-5-20250929)
- Example queries:
  - "My POI shifted 0.5 MOA left today, should I adjust?"
  - "Why are my groups opening up?"
  - "Is this wind or something else?"
- Cost: fractions of a cent per query
- Requires: user provides their own Anthropic API key (stored locally, never transmitted elsewhere)

---

### Phase 7 — Ballistic Solver
- Custom point-mass solver implemented in JavaScript
- Uses G1 or G7 standard drag curves (published coefficients)
- Inputs auto-filled from rifle + load profile: BC, muzzle velocity, scope height, zero range, bullet weight, atmospheric conditions
- Outputs: drop table (MOA/MIL adjustments at each distance increment), wind drift table
- Runs entirely locally, no API dependency
- Integrated into the app as a tool alongside the AI assistant

---

### Phase 8 — Polish & PWA
- Service worker for offline functionality
- Web app manifest (name, icon, theme color, display: standalone)
- Home screen install prompt
- App icon design
- Mobile UX refinement (touch targets, scroll behavior, loading states)
- EXIF orientation handling for camera photos
- Edge case handling and error states
- Performance optimization for large session histories

---

## File Structure

```
ballistic-app/
├── index.html                  # App shell, navigation
├── manifest.json               # PWA manifest
├── sw.js                       # Service worker
├── css/
│   ├── main.css                # Global styles, variables, layout
│   └── canvas.css              # Canvas/overlay specific styles
├── js/
│   ├── app.js                  # App initialization, routing, navigation
│   ├── db.js                   # IndexedDB wrapper (CRUD for all entities)
│   ├── canvas-manager.js       # Image loading, zoom/pan, marker placement
│   ├── calibration.js          # 1-inch reference calibration logic
│   ├── calculations.js         # All math: group size, MOA, offsets, ATZ, stats
│   ├── session-flow.js         # Step-by-step session workflow controller
│   ├── profiles.js             # Rifle/load/barrel profile management UI
│   ├── history.js              # Session history, trends, logs
│   ├── export.js               # Annotated image rendering and sharing
│   ├── ai-assistant.js         # Claude API integration (Phase 6)
│   ├── ballistic-solver.js     # Point-mass solver (Phase 7)
│   └── utils.js                # UUID generation, date formatting, helpers
├── assets/
│   ├── icons/                  # PWA icons
│   └── images/                 # Any static images
├── SPEC.md                     # This file
├── CLAUDE.md                   # Instructions for Claude Code
└── README.md                   # Project documentation
```

---

## Key Design Principles
1. **Calculation engine is pure functions** — no DOM, no storage, no side effects. Takes coordinates in, returns measurements out. Fully testable.
2. **Calibration data is stored per session** — different photos have different scales.
3. **Images stored as files, referenced by path** — not blobs in the database.
4. **All fields that could change over time are snapshotted in the session** — bullet diameter, velocity, weather. The session is a self-contained record.
5. **Mobile-first design** — every interaction designed for thumb use on a phone screen at the range.
6. **Offline-capable** — core functionality works without network. Only AI assistant requires connectivity.
7. **Data exportable** — structured so future sync/export is straightforward.

---

## Constants & Formulas

```
MOA_FACTOR = 1.047 // 1 MOA = 1.047 inches at 100 yards

// Inches to MOA at a given distance
toMOA(inches, distanceYards) = (inches / distanceYards) * (100 / MOA_FACTOR)

// Center-to-center from pixel measurement
centerToCenter(pixelDistance, pixelsPerInch, bulletDiameterInches) =
  (pixelDistance / pixelsPerInch) - bulletDiameterInches

// Group size = max center-to-center distance between any pair of impacts
// Mean radius = average distance from each impact to centroid
// Centroid = (mean(all X), mean(all Y))
// ATZ = negation of (centroid offset from POA), converted to MOA
```
