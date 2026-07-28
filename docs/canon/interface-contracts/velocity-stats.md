# Interface contract — `js/velocity-stats.js`

Gate 0 artifact. Pure, no DOM/storage, no dependency on any other
protected engine (self-contained — unlike `ballistic-solver.js` and
`truing-core.js`, this file has no hidden global-scope coupling).

**Statistics convention (from the file's own header):** POPULATION
standard deviation (divide by n), not sample SD (n−1), matching Garmin
ShotView's displayed summary. Exported per-shot velocities are rounded
to 0.1 fps but ShotView computes its summary from unrounded values, so
recomputed stats may differ from the display by up to ~0.1 fps.

## Core stats — `velocityStats(shots)`

`shots`: array of plain numbers OR `{fps: number, ...}` objects
(mixed arrays allowed); non-numeric/missing `fps` entries are silently
dropped, not errored. → `{n, avg, sd, es}`.

- `n === 0` → `{n:0, avg:null, sd:null, es:null}` (empty or all-unusable input).
- `n === 1` → `avg` set, `sd`/`es` are `0` (not `null` — a single shot has
  zero spread, which is a fact, not an absence of one).
- `es` (extreme spread) = `max - min`.

## Time-gap splitting

`parseTimeOfDay(text)` — ShotView time-of-day string ("3:09:32 PM" or
24hr "15:09") → seconds since midnight, or `null` if unparseable.
`12:00:00 AM` → `0`; `12:00:00 PM` → `43200`. An hour outside 1–12 with
an AM/PM suffix is invalid (`null`), not clamped.

`splitByTimeGap(shots, gapMinutes = 30)` — `shots: {fps, time}[]` →
array of shot-array groups, split wherever the gap between consecutive
parsed times exceeds `gapMinutes`. **Never guesses:** if *any* shot's
time is missing or unparseable, returns the entire input as one group
(`[shots]`) rather than a partial/wrong split. Handles midnight
rollover (negative deltas add 24h). `shots.length < 2` short-circuits:
`0` shots → `[]`, `1` shot → `[[shot]]`.

## Velocity-band clustering — `clusterStringsByVelocity(strings)`

`strings: {avgFps, sdFps?, n?|shots?}[]` (entries without a numeric
`avgFps` are excluded from clustering entirely) →
`{clusters: {members, meanFps, shotCount}[], ambiguous: {string, nearClusterIndices}[]}`.

- Greedy, sorted-ascending build: a string joins an existing cluster
  only if it is within the "same-ammo" threshold of **every** member
  already in that cluster (no chain-drift merging).
- Threshold = `max(3 × pooled population SD of the two strings, 25 fps)`
  — pooled SD falls back to `DEFAULT_STRING_SD = 15` for strings
  lacking their own `sdFps`. The 25fps floor stops tiny-SD strings from
  splitting on ordinary string-to-string drift.
- After clustering, any string that also sits within threshold of a
  *different* cluster's mean is reported in `ambiguous` — **the engine
  never guesses which cluster it belongs to**, it flags for a human
  decision (Constitution §17/§96: inference must not masquerade as
  resolved fact).

## Duplicate-import identity

`stringDedupKey(sheetName, date)` → `"{sheetName}|{epochMs or raw string}"`.
Two different ISO serializations of the *same instant* (`Z` suffix vs
`+00:00` offset) produce the **same key** — this is the fix for a real
prior bug (raw string comparison of round-tripped dates). Unparseable
dates fall back to the raw string; missing dates become `''`.

`velocityFingerprint(shots)` → comma-joined string of each shot's `fps`
canonicalized to 0.1 fps precision (ShotView export precision), or the
literal `'?'` for an unusable entry; `null` for an empty/absent list
(**an empty string has no identity and must never "match" another
empty one**). Order matters; two fingerprints of different lengths
never match by construction (different comma count).

## Round-count assignment — `assignRoundCounts(baseCount, sessions)`

`baseCount: number|null` (barrel rounds *before* the first string —
`null` means unknown), `sessions: {shots}[]` (oldest-first) →
`number[]|null[]`, one count per session. **AFTER semantics** (owner
decision, documented in the source): each output is the barrel's total
round count *after* that string was fired — the odometer reading at the
end of the string, not the start. Unknown `baseCount` → every output is
`null` (never guessed forward from an assumed baseline).

## Factory ammo lot drift — `lotDrift(strings, minDeltaFps = 30)`

`strings: {loadId, lotNumber, avgFps, shots, date, assignmentStatus}[]`
→ `{loadId, newLot, prevLot, deltaFps}[]`. Only `assignmentStatus ===
'confirmed'` strings with a `loadId`, `lotNumber`, and numeric `avgFps`
are considered. Per load, compares only the two most-recent lots (by
each lot's latest string date) — older lots are silent even if drifted.
Silent entirely when a load has fewer than two lots on record, or when
`|delta| < minDeltaFps`. `deltaFps` is `Math.round`ed and signed
(newest minus previous — can be negative).

## Suppressor configuration shift — `configShift(sessions, strings)`

`sessions: {config: 'suppressed'|'bare', results: {meanElevationMOA, meanWindageMOA}}[]`,
`strings: {config, avgFps, shots, assignmentStatus}[]` →
`{poi: {elevMOA, windMOA}|null, velocityDelta: number|null}|null`
(values are **suppressed minus bare**). Needs ≥1 session per
config for `poi`, ≥1 `assignmentStatus === 'confirmed'` string per
config for `velocityDelta` — each half is computed independently and
can be present while the other is `null`. Returns `null` (not a
partial object) only when **neither** half is measurable.

## Per-rifle aggregation — `aggregateRifle({sessions, strings, loads})`

Missing keys default to `[]` (no throw on `{}`). Returns
`{loads: LoadRow[], bestGroup, recommendedLoadId, pendingStrings}`.

- `pendingStrings` tallies each string's `assignmentStatus`
  (`unassigned`/`suggested`/`ambiguous`/`confirmed`); an unrecognized
  status counts as `unassigned`.
- Per load: `stats` is `velocityStats` over every shot from that load's
  *confirmed* strings only. `bestGroupMOA`/`bestGroupSessionId` come
  from `_bestGroupSession` (below), scoped to that load's sessions.
- **Eligible group**: `session.results.groupSizeMOA` is a finite number
  AND `session.impacts.length >= MIN_GROUP_SHOTS (3)`. Sessions below 3
  impacts are never considered a "group," however small their MOA.
- **Best group selection**: among eligible sessions, if any has
  `impacts.length >= PREFERRED_GROUP_SHOTS (5)`, ONLY those compete
  (5+-shot groups always outrank 3–4-shot groups regardless of MOA);
  otherwise all eligible sessions compete. Winner = smallest
  `groupSizeMOA`.
- `bestGroup` is the same selection run over ALL sessions (not scoped
  to one load).
- `recommendedLoadId`: among loads with a non-null `bestGroupMOA`,
  sort by `bestGroupMOA` ascending; ties within
  `GROUP_TIE_EPSILON_MOA (0.01)` MOA are broken by lower population
  velocity SD (missing SD sorts as `Infinity`, i.e. loses every tie).
  `null` if no load has an eligible group.

## Constants

| Name | Value |
|---|---|
| `DEFAULT_STRING_SD` | `15` (fps, clustering fallback) |
| `MIN_GROUP_SHOTS` | `3` (internal, not exported — eligibility floor) |
| `PREFERRED_GROUP_SHOTS` | `5` (internal, not exported — outranks smaller groups) |
| `GROUP_TIE_EPSILON_MOA` | `0.01` (internal, not exported — tie-break trigger) |

## Golden fixture coverage

`tests/fixtures/golden-velocity-stats.json` /
`tests/test-golden-velocity-stats.js` — 53 cases across all 10 exported
functions: `velocityStats`' n=0/n=1/all-identical/mixed-valid-invalid
edge cases; `parseTimeOfDay`'s 12hr/24hr/midnight/noon/invalid-hour
boundaries; `splitByTimeGap`'s no-gap/gap/missing-time/midnight-rollover/
custom-threshold behavior; `clusterStringsByVelocity`'s merge/separate/
ambiguous/excluded-entry cases; `stringDedupKey`'s cross-format instant
equality; `velocityFingerprint`'s empty/unusable-entry handling;
`assignRoundCounts`' known/unknown-baseline AFTER semantics;
`lotDrift`'s threshold and confirmed-only filtering; `configShift`'s
four measurability combinations; and `aggregateRifle` across a full
realistic rifle plus two rule-specific cases (the 0.01 MOA tie-break by
SD, and the 5-shot-group-outranks-3-shot-group preference).
