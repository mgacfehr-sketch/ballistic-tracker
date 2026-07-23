# REORG-REPORT.md — Range-Day Reorganization (Contract v2.3)

Running build report for the v2.3 Range-Day Reorganization on branch `redesign`.
Per-step notes, judgment calls, and deviations land here as each step commits.
Everything requiring the owner is batched in the **OWNER REVIEW QUEUE** at the bottom
(nothing blocks the build on it; nothing touches Supabase until the owner runs the
migration).

Test baseline at contract start: **385 tests green** (6 suites:
calculations 71, crowd-data 37, foundation 103, garmin-import 49, onboarding 8,
velocity-stats 117). Service worker at CACHE_VERSION 97.

---

## Step 0 — STANDARDS.md

- Generated `STANDARDS.md` at repo root: stack ground rules, file organization,
  pure-engine vs UI module boundaries (CommonJS-guard pattern), the feature
  registration seam (TOOLS → Categories.DEFS → ToolActions; never a nav tab),
  data-access rules (db.js only, client UUIDs, snapshots), the Part 0.6 data laws
  condensed (offline-first, append-only events, provenance, units-per-rifle),
  security patterns (RLS four-policy idempotent template, SECURITY DEFINER gating,
  never-trust-the-client), naming, the Node test harness pattern, UI standards
  (tokens, tap targets, verdict-first, coach voice, outdoor budgets), and the
  per-step deploy checklist.
- All standards were derived from the codebase's existing best patterns (WAVES
  migration policy style, garmin-import parser discipline, wizard-core purity,
  tokens.css contract) — no invented conventions.
- **Judgment call (standing):** the contract's "ENGINE FILES UNTOUCHED: js/db.js"
  is interpreted as *additive-only*: new CRUD methods for new tables are required
  by the all-Supabase-through-db.js architecture rule, plus one generic
  `flushQueuedRow(table, record)` for the offline sync queue. Zero changes to any
  existing method's behavior. → Owner review queue item 1.

---

## OWNER REVIEW QUEUE

Everything that needs Mitch, batched. Nothing in the build proceeds in Supabase
until item 2 is done; the app is built assuming the migration ran.

### 1. Review STANDARDS.md
Read `STANDARDS.md` (repo root). It governs all v2.3 work and future contracts.
Flag anything you disagree with — the standing judgment call to note: db.js gets
additive-only new methods (new tables' CRUD + `flushQueuedRow`), existing methods
untouched.

### 2. Review + run REORG-migrations.sql  *(pending — written at Step 2)*
Review externally first; nothing proceeds in Supabase without that. Then run it
once in the Supabase SQL Editor (Dashboard → SQL Editor → New query → paste →
Run). It is additive-only and safely re-runnable.

### 3. Truing-engine review notes  *(pending — written at Step 7)*
Key functions, test results, and judgment calls for js/truing-core.js.

### 4. Final QA browser checklist  *(pending — written at Step 12)*
Ordered post-migration checklist: browser walks per job, airplane-mode offline
walk, certificate transfer test, Supabase Point-in-Time-Recovery/backup
click-path, and anything else requiring the live database.

### Flagged decisions (running list)
- *(none yet)*
