# PROVEN — Amendment 1 (Post-Review Corrections)
**Status:** Constitutional amendment, adopted after independent adversarial
review. Governs over the four canon documents wherever it explicitly
modifies them. The canon is: Product Definition, Constitution, Validation
Doctrine, Evidence & History Doctrine, this Amendment.

**Precedence rule (new):** Later documents govern only the rules they
explicitly modify. Normative keywords everywhere carry the Constitution
§0 definitions; examples and approximate numbers are nonbinding unless
labeled REQUIRED.

---

## Part A — Doctrine corrections

**A1. Truing routing (supersedes Validation Doctrine §5's implication).**
The protected engine's Mach-bracket doctrine is the SOLE authority for
choosing velocity vs. drag truing: supersonic trajectory error trues
muzzle velocity; transonic-window error trues drag. Measured per-shot
velocity is evidence INPUT — it reduces uncertainty and improves
residuals — and is never a routing instruction. The owner's current
practice (measured MV, therefore true BC at any distance) is explicitly
NOT adopted; the engine's doctrine is the improvement over the method.

**A2. Fact taxonomy (amends Product Definition §4).**
"Three kinds" means three core ballistic observation types (zero,
velocity, distance impact). Lifecycle and change facts — cleaning,
configuration change, ammunition/lot, maintenance, spot-check,
exclusion, repair, troubleshooting-check — are equally canonical inputs
that scope and support interpretation. "Rejected" means rejected from
analytic use; the observation and its reason are always preserved.

**A3. PROVEN TO (amends Product Definition §3).**
Scoped per compatible active solution (rifle, barrel epoch, optic
applicability, muzzle state, load/lot where material, zero, solution
version). It may rise, hold, fall, or become unavailable. Its behavior
is defined exclusively by the existing rollup engine
(calibration-status.js), whose contract MUST be frozen with golden test
vectors (scope, evidence minimums, invalidation, reversal) before any
refactor touches its inputs. Staleness is a separate derived FRESHNESS
status governed by an explicit trigger table (soft-stale → confirmation
prompted; hard-invalidating → per compatibility rules). Time alone
never changes truth; it can only mark freshness.

**A4. Validation state (supersedes Validation Doctrine §1's arrow chain
as implementation).** The state machine is narrative. Implementation:
independent, configuration-scoped prerequisite statuses — zero,
velocity, drag/truing, scope tracking, settling segment, freshness,
configuration compatibility — from which a plain-language mission
readiness is DERIVED per scoped solution. Never stored as one linear
state. (The existing four-segment status model is the correct skeleton.)

**A5. One-shot checks (amends Validation Doctrine §6).**
A one-shot check detects gross shift only. Language: "travel check
passed / no gross shift observed." It never confirms, refreshes, or
degrades confirmed-zero status; only the zero protocol does.

**A6. Cleaning semantics (resolves Validation Doctrine §3 vs
Constitution).** Cleaning: (a) starts a post-cleaning performance
segment; (b) marks a zero confirmation check DUE (soft-stale); (c) does
NOT invalidate drag truing, scope tracking, velocity history, or any
historical truth. Settling: the first N post-cleaning shots (owner
default, initial 12) are LABELED a settling segment — preserved, never
auto-excluded; analyses may down-weight with the label visible.
Learned settling length is deferred until a validated method exists.

**A7. Owner numbers de-normed.** The 75–100-round cleaning interval,
10–15-shot settling, and 25–100 fps break-in rise are owner
preferences/observations, not product priors. The product records each
barrel's own curve and speaks only from that rifle's compatible data;
before sufficient history it says "not enough history."

**A8. Evidence taxonomy (amends Evidence & History Doctrine A1–A2).**
The five levels are claim KINDS, not a strength ranking. Reliability is
carried separately: provenance, basis/sample size, uncertainty,
applicability, freshness, and decision confidence. An output keeps its
kind regardless of input quality but inherits a confidence ceiling from
its weakest material input, with the chain inspectable. New evidence
may support, reject, or supersede a hypothesis; only newly measured
facts become observed/derived — causal conclusions remain inferences
unless the cause itself was directly observed.

**A9. Called shots.** A shooter-called flyer affects primary analysis
only when called before result review or supported by independent
evidence; call timing and reason are recorded; every result retains an
all-shots comparison.

**A10. Small-sample honesty.** Three-shot groups are provisional
evidence; confirmation and comparison language scales with basis.
Consecutive-hit and stop-after-two rules are ammunition-conservation
guidance, never the evidence threshold. Spot-check outcomes (confirmed
/ drift / alarm) are classified by residual magnitude relative to the
rifle's compatible baseline and combined uncertainty; a fixed ~1 MOA
fallback applies only when no baseline exists. Factory ammo selection
is labeled "selected from this limited factory trial" unless a larger
predeclared protocol was run.

**A11. Per-shot residual engine (amends Validation Doctrine §8).**
Requires its own versioned specification BEFORE implementation: inputs,
uncertainty propagation (chronograph ±0.1%-class error, distance,
atmosphere, impact-observation, dial), estimator, weighting, minimum
sample, outlier policy, synthetic golden cases. Association is
analytically eligible only for clean one-to-one sequences (no
unresolved gaps, duplicates, dial changes, or competing sources);
otherwise proposed-only. The engine reports (a) vertical dispersion
explained by measured velocity and (b) the remaining unresolved
residual with uncertainty — it NEVER assigns the residual to scope,
shooter, drag, zero, or hardware without a discriminating test.
Crosswind-induced vertical (aerodynamic jump) enters as an uncertainty
term, not a fitted parameter. Shadow-only until it passes synthetic
recovery, perturbation, known-answer, and predeclared real-range
validation; only then may it feed accepted solutions, always through
the protected routing engine (A1).

**A12. Suppressor/configuration reactivation (amends Validation
Doctrine §10).** Reattaching a known configuration restores its history
as applicable background and a candidate solution; current VALIDATED
status returns only after the smallest appropriate confirmation (e.g.,
zero spot-check), unless mounting repeatability has itself been
established under a defined protocol. One-hit corrections may produce a
provisional candidate and preview but never silently supersede an
accepted solution or raise PROVEN TO below the rollup engine's
thresholds.

**A13. Historical intelligence v1 (amends Evidence & History Doctrine
B3).** A deterministic whitelist of trigger→insight rules, each with
defined compatible evidence, minimum sample, priority, and suppression.
Initial whitelist: cleaning history, velocity vs. prior lot, rounds
since last zero/truing, configuration invalidation notices, repeated
spot-check confirmations, pre-trip round budget (A14). Precedents state
chronology and comparable facts without causal implication.

**A14. Round budgeting** runs only when the shooter asks or states a
planned objective; advisory only; never a capture prerequisite.

**A15. Context and carry-forward.** An explicit current-state fact
outranks inference; the acquisition hierarchy applies only when no
sufficiently current explicit state exists. V1 uses deterministic
context boundaries (explicit selection, single-rifle account, confirmed
import mapping, recent context within fixed time/place bounds) and
NEVER auto-associates high-risk evidence after a time, place, profile,
or rifle conflict. Probabilistic confidence scoring is deferred.

**A16. Offline promise, bounded (amends Product Definition §8).**
PROVEN never voluntarily discards acknowledged data. It requests
persistent storage, detects quota/write failure BEFORE acknowledging a
save, replicates at first opportunity, and documents the limits it
cannot control (device loss, user-cleared browser data, OS eviction).
"Every function offline" means every core range capture, local
calculation, and locally available record function; account lifecycle,
remote enrichment, claim, and replication may wait for connectivity.
Multi-device: conflicting corrections mark the affected dependency
CONFLICTED (no new accepted solution from it until resolved); unrelated
facts continue. Late historical imports recompute candidates but never
supersede an accepted current solution without compatibility checks and
an explicit acceptance event.

**A17. Storage semantics.** Canonical storage: documented base units,
UTC timestamps; original expression, units, timezone, and source
uncertainty preserved. V1 display locale: English/US. Editable/
deletable in the UI is implemented as supersede/reversible-exclusion;
physical erasure only under the deletion policy. "Permanent" evidence
means preserved without silent replacement while the authorized record
exists; account deletion and legal erasure are controlling exceptions.

---

## Part B — Revised build order (replaces the Constitutional Review roadmap)

**Gate 0 — freeze truth (before any other work).**
Golden input/output fixtures + interface contracts + hash checks for
every protected engine, INCLUDING calibration-status.js (this freezes
the PROVEN TO contract, A3) and the two-stage routing (A1). Canon
manifest (documents + versions) checked into the repo. Migration
inventory of existing live data.

**Phase A — durability floor.**
Persistent-storage request; quota/write-failure detection before save
acknowledgement; client-generated idempotent IDs; auth-expiry capture
behavior (offline work continues, bound to account, quarantined until
safe upload); right-sized failure-injection suite (crash, refresh,
lock, signal loss, expired auth, interrupted upload). Runs before any
new canonical writes exist.

**Phase B — fact spine, right-sized.**
Minimal event ledger (mandatory envelope only: id, type, schema
version, account, rifle, event time, provenance, source ref,
eligibility, supersedes, sync state, typed payload). Dual-write new
facts; BACKFILL script maps legacy records to events with explicit
"legacy/unknown" provenance (never invented facts); parity check on a
database clone; defined rollback. Vault-first import: original file +
hash preserved before association; unresolved imports park safely.
Workhorse factory-package SCHEMA defined now (build later) so the
envelope can represent factory truth. RLS/storage-policy audit for
every table and bucket this phase touches.

**Phase C — memory + minimal invalidation, together.**
Per-rifle carry-forward current state (ammo/lot, suppressor, places,
recurring distances) SHIPS WITH the minimal compatibility matrix
(optic remount, suppressor change, barrel change, lot change → what
goes stale vs. invalid). Never persisted confidence without rules for
when it stops applying. Recognition confirms replace questions.

**Phase D — validation statuses + coach brain.**
Independent scoped statuses (A4) + freshness table (A3) + spot-check
three-outcome classification (A10) + troubleshooting hold with defined
entry/exit + whitelist historical insights (A13) + request-only round
budgeting (A14).

**Phase E — per-shot residual engine.**
Spec (A11) → synthetic gate → shadow mode on real strings → predeclared
real-range validation → live, feeding the protected router only.

**Phase F — Workhorse continuation.**
Factory package build, secure claim (claim secret distinct from serial;
single-owner, revocable, transfer-capable), certificate evolution.
Support runbook: audited server-side repair operations, no mobile admin.

**Cross-cutting every phase:** protected-engine hash checks; export
parity (spreadsheet + machine-readable) against both stores until
cutover; deletion propagation test; canon-manifest check in CI.

**Deferred, logged, revisit before public beta:** observability/
telemetry, disaster-recovery drills, WCAG conformance gate, performance
budgets, localization beyond en-US, NFC/signed offline packages,
automatic hole-detection CV, learned settling, probabilistic context.

---

## Part C — Findings rejected or right-sized (for the record)

- Enterprise process items (3.6, 3.10, 3.12, 3.13, 3.15) are
  disproportionate for a pre-beta product with a handful of users;
  logged for pre-public-beta review, not blockers.
- 6.10's dismissal of Phase 0 is rejected in part: the completed fix
  batches addressed real data-loss bugs, not cosmetics; terminology
  cleanup folds into Phases C–D as surfaces are touched.
- 5.16 Coriolis: computed-effect threshold accepted as the eventual
  rule; the 800-yd prompt stands as the conservative v1 fallback.
- 3.14 localization: closed by A17 (en-US display, locale-independent
  storage).
- The reviewer's read of "only rises" (1.2) was a misreading of intent
  ("never inflates"), but the ambiguity was real; A3 closes it.
