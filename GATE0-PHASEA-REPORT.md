# Gate 0 + Phase A — Build Report

**Scope:** Amendment 1, Part B, Gate 0 ("freeze truth") and Phase A
("durability floor") only. Phase B (fact spine) was explicitly out of
scope and was not started.

**Branch:** `redesign`. 15 commits, one per logical step, each verified
green before the next began. No SQL was run — the one SQL-adjacent
artifact (the migration inventory's read-only COUNT query) is a
proposal for the owner to run, not something executed this session.

---

## Gate 0 — freeze truth

### Canon manifest
`docs/canon/MANIFEST.md` — the five governing documents (Amendment 1,
Constitution, Product Definition, Validation Doctrine, Evidence &
History Doctrine) plus the historical Constitutional Review, each with
a recorded SHA-256 and a stated precedence order. `tests/test-canon-manifest.js`
fails if any canon file's bytes drift from the recorded hash, or if any
`.md` file appears in `docs/canon/` unrecorded. This test caught itself
being wrong once already — mid-session, `MIGRATION-INVENTORY.md` was
added without updating the manifest, and the test failed immediately as
designed (fixed in commit `c9cfa24`).

### Protected-engine hash lock
`tests/fixtures/protected-engine-hashes.json` + `tests/test-protected-engine-hashes.js`
record a SHA-256 for all 8 protected engines. Every Gate 0 commit re-ran
this test to prove the golden-fixture work never touched engine bytes.

### Golden fixtures + interface contracts, all 8 protected engines

| Engine | Fixture cases | Interface contract |
|---|---|---|
| `calculations.js` | 41 | `docs/canon/interface-contracts/calculations.md` |
| `ballistic-solver.js` | 24 (no prior test file existed) | `.../ballistic-solver.md` |
| `truing-core.js` | 24 — locks the A1 Mach-bracket routing at every boundary yard | `.../truing-core.md` |
| `simple-true.js` | 24 | `.../simple-true.md` |
| `velocity-stats.js` | 53 | `.../velocity-stats.md` |
| `garmin-import.js` | 36 | `.../garmin-import.md` |
| `calibration-status.js` | 19 — the A3 PROVEN TO contract: rises, holds, hard falls (3 distinct triggers), one reversal, one soft-invalidation | `.../calibration-status.md` |
| `target-geometry.js` | 8 (full constant-object snapshot) | `.../target-geometry.md` |

Four of the eight (`simple-true`, `velocity-stats`, `garmin-import`,
`target-geometry`) were produced by parallel fork subagents given the
established pattern from the first four and this session's full canon
context; each was independently re-run and reviewed before commit —
verified green, verified no engine files touched, content spot-checked
against the doc conventions used elsewhere.

### Migration inventory
`docs/canon/MIGRATION-INVENTORY.md` — every table enumerated from the
12 SQL migration files plus every `js/db.js` `.from()` call site.
Read-only; no live database query was made (no credentials this
session, and out of scope regardless). Row counts are marked **TBD**
with a read-only COUNT query appendix — the owner explicitly chose this
approach over sharing credentials or pasting admin-dashboard output.

---

## Phase A — durability floor

Audited the existing offline sync queue (`js/sync-queue.js`, already
substantial: durable IndexedDB queueing, upsert-by-id idempotent flush,
network-vs-server error classification, honest "waiting to sync" UI
language) against Amendment 1 A16, and closed four real gaps:

1. **Persistent storage.** `navigator.storage.persist()` requested on
   `SyncQueue.init()`, best-effort, never blocks startup. Nothing
   requested this before.
2. **Quota classification.** `isQuotaError()` distinguishes a
   storage-full failure from an ordinary error. Write-acknowledgment
   was already structurally sound (no promise ever resolved before its
   IndexedDB transaction committed) — this makes the failure mode
   nameable for the UI rather than a behavior change.
3. **Auth-expiry.** A stale/expired Supabase session while nominally
   online was previously thrown to the caller as a permanent server
   rejection instead of queued. `isAuthError()` now routes it through
   the same queue-and-retry path as a connectivity drop, and — since
   the fix is re-authenticating, not correcting malformed data — auth
   failures no longer burn toward `MAX_ATTEMPTS` during flush.
4. **Account-binding quarantine.** Every queued op now stamps
   `capturedUserId` at capture time. Previously `flushQueuedRow`
   attributed a queued row to whichever account was signed in **at
   flush time** — on a shared device, a second user signing in before
   the first user's queue drained would have had the first user's
   offline shots silently written under the second user's account.
   `flush()` now skips any op whose captured account doesn't match the
   current session, leaving it pending and untouched;
   `queueSummary()`/`renderStatus()` surface this as **quarantined**,
   distinct from ordinary pending.

**Logout warning.** `js/app.js`'s logout handler now checks
`SyncQueue.summary()` (pending + errored + quarantined) and warns via
`window.confirm()` (matching the existing confirm-dialog convention)
before signing out; declining cancels logout. Per Constitution §53 /
A16, logout with unsynced work must warn and never silently discard.

**Client-generated idempotent IDs.** Audited, not modified — already
fully in place. All 20 `db.js` `addX` methods generate a client UUID
before any network call (`data.id || generateUUID()`), and
`flushQueuedRow` upserts by id (`onConflict: 'id'`), so retries are
genuinely idempotent.

**Failure-injection suite.** `tests/test-failure-injection.js`, 28
checks, "right-sized" per Amendment 1 Part B's own phrase: this repo
ships zero build tools and no browser test runner (CLAUDE.md), so real
crash/reload/lock simulation isn't available the way it would be with
Playwright. The suite instead combines pure-logic proofs against
`SyncQueueCore`'s real exported decision functions with source-presence
checks confirming the browser module actually wires those decisions
into the write/flush/logout paths — the same technique already
established in `tests/test-screen-nav.js`. Covers: the bounded promise
itself, crash/refresh/device-lock (durable queue + unconditional
app-start flush + multi-signal reconnect listeners), signal loss,
expired auth (including the new quarantine mechanism), logout,
interrupted upload (image blobs never deleted locally until upload is
confirmed), and quota/persistent-storage.

---

## Test suite status

All 32 test files green, run individually via `node tests/test-*.js`
(no test runner/CI exists in this repo — confirmed at the start of this
session). Approximately 1,270 individual checks across existing tests
plus everything added this session. `tests/test-protected-engine-hashes.js`
and `tests/test-canon-manifest.js` both pass, confirming no protected
engine or canon document was altered.

`sw.js` `CACHE_VERSION` bumped 144 → 145 (`js/sync-queue.js` and
`js/app.js` are app-shell files, per CLAUDE.md rule 9).

---

## Owner-review queue

Judgment calls and discovered findings that need a human decision —
none block Gate 0/Phase A completion, all are either already-noted
tradeoffs or pre-existing issues surfaced by this work, not created by
it.

### Doctrinal / structural (highest attention)

1. **Is the admin-RPC hardening live?** CROWD-DATA-migrations.sql's
   Migration 5 (requiring `is_crowd_admin()` on `admin_get_stats`/
   `admin_get_users`/`admin_get_usage_summary`/`admin_export_all`) is
   explicitly marked OPTIONAL in the migration file. Whether it has
   been run against production is unknown from the repo alone. If not,
   CLAUDE.md's Known Issue ("admin_* RPCs... no server-side admin
   check") is still live today. **Action: confirm directly against
   Supabase.**

2. **Seven base tables predate schema-as-code** (`rifles`, `barrels`,
   `loads`, `sessions`, `zero_records`, `scope_adjustments`,
   `cleaning_logs`) — no `CREATE TABLE` exists anywhere in the repo's
   SQL files for them, only layered `ALTER TABLE` additions. Their
   complete column set isn't reconstructable from the repo. **Action:**
   before Phase B's backfill script is written, pull an
   `information_schema` dump from the live database rather than
   trusting this repo as a complete schema reference for those seven.

3. **`zero_records` (legacy) vs `zero_events` (new, provenance-aware)**
   — two zero-truth paths with no documented reconciliation.
   `calibration-status.js` (the PROVEN TO engine) only reads
   `zero_events` + the live verdict; any surviving write path to
   `zero_records` would be invisible to the rollup entirely. **Action:**
   confirm nothing still writes `zero_records` in production, or
   understand why it's dead if so.

4. **`dope_entries` referenced in `js/db.js` but doesn't exist live**
   (its migration was removed at owner review). Currently dormant
   (the feature that would call it, `dopeLog`, is beta-gated off), but
   it's a live trap: re-enabling `dopeLog` without also running a
   `dope_entries` migration reproduces the exact `deleteRifle` crash
   that was already worked around once. **Action:** either restore the
   migration or remove the dead call sites before ever flipping that
   flag.

### Engine-behavior findings (documented in each interface contract, not fixed — protected engines)

5. **`ballistic-solver.js`'s `computeTrajectory()`** depends on bare
   `round4`/`inchesToMOA` globals that only exist because
   `index.html` loads `calculations.js` first into a shared script
   scope — undeclared anywhere in the file itself. Works today; would
   break under a bundler, a bare `require()`, or a reordered script
   tag. The identical pattern exists for `target-geometry.js`'s two
   consumers (`aruco-calibration.js`, `target-pdf.js`) — apparently
   this codebase's standard way of sharing pure code across plain
   `<script>` files, not a one-off defect. **Action:** worth a
   conscious decision before any Capacitor/bundler work (Build
   Principle 2) — either keep relying on load order deliberately, or
   make these dependencies explicit.

6. **`simple-true.js`'s `payoff.moved`** can read `false` even when a
   real, doctrine-correct correction was applied and kept — its
   before/after dial values are each rounded to 1 decimal in the
   caller's *display* unit before comparison, so a genuine correction
   can round away in a coarse unit (verified case: a BC correction
   0.315→0.304 shows `moved: false` in MIL at 600yd). The payoff copy
   would tell the shooter "barely moves" despite a kept correction.
   **Action:** a UI-facing decision (display more precision? compare in
   MOA before converting? accept it as intentional "not worth
   mentioning" behavior?) — not an engine bug per se, a judgment call
   about what "moved" should mean.

7. **`garmin-import.js` has no cross-import deduplication.** Parsing is
   deterministic and self-contained, but Constitution §33.4's "the same
   shot must not be counted three times" is entirely a caller/db-layer
   responsibility today. **Action:** confirm that responsibility is
   actually owned somewhere (it should be, before Phase B's fact spine
   generalizes import handling) — this session didn't audit the caller
   side to confirm.

### Data-integrity smells (not provenance gaps per se, noted in the migration inventory)

8. `barrels.round_count` / `barrels.total_rounds` — two columns synced
   by application code (`_normalizeBarrel`/`_barrelRowForWrite` in
   `db.js`), not by the schema.
9. `ai_usage_logs.estimated_cost` / `.cost` — unreconciled dual columns,
   already flagged in REORG-migrations.sql's own comment as "an
   admin-dashboard task."
10. `session-images` Storage bucket has no content-hash or upload-state
    tracking. Constitution §56 ("original attachments require special
    protection") isn't fully met yet — flagged as a Phase A/B
    dependency, not solved this pass (Phase A's failure-injection work
    covers the *sync queue's* image handling, which is already sound;
    the gap is specifically bucket-level integrity verification).

### Phase A implementation judgment calls

11. `isAuthError()`'s matching (`jwt`, `refresh_token`, `unauthorized`,
    `session expired`, etc.) is a reasonable first pass, not verified
    against real Supabase error shapes in production logs. If a
    legitimate business-logic error ever happens to contain one of
    these words, it would incorrectly queue-and-retry instead of
    surfacing immediately. **Action:** revisit against real error logs
    before this matters at scale.
12. Quarantined ops currently have no dedicated resolution UI beyond
    the status banner's text — they wait silently until the capturing
    account signs back in. A fuller flow (e.g., letting the current
    account explicitly view/export/discard another account's stranded
    queue) is out of scope for Phase A.
13. The failure-injection suite is deliberately "right-sized" (pure
    logic + source presence, per Amendment 1 Part B's own words) rather
    than a full browser-level chaos suite. A heavier version — real
    reload/lock/crash simulation via a Playwright harness — is a
    reasonable pre-public-beta addition, consistent with Amendment 1's
    own "Deferred, logged, revisit before public beta" list (which
    already names disaster-recovery drills).
14. Housekeeping: `docs/canon/PROVEN-Product-Definition (1).md` carries
    a cosmetic `(1)` suffix from its original download. Left unchanged
    to avoid an unrequested rename; the owner can rename it whenever
    convenient (the manifest's hash lock will just need updating in the
    same commit as any such rename).

---

## STOP

Gate 0 and Phase A are complete per the criteria given: fixtures
hash-locked and green, failure suite green, this report written, all
existing tests still green, canon and protected engines byte-identical
throughout. Waiting for go-ahead before Phase B (the fact spine).
