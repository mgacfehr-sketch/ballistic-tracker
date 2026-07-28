# PROVEN — Constitutional Review of the Existing Implementation

**Reviewed against:** PROVEN Product and Interaction Constitution
**Scope:** Everything built across v2.4 → v2.5 → v3.0 → v4.0 on branch `redesign`, plus engines, data model, offline layer, target system, and certificate.
**Standing rule applied:** the Constitution takes precedence over implementation. Nothing is defended because it exists.

---

## 1. Executive Summary

The Constitution vindicates the engines and condemns the spine.

Everything mathematical and everything about honesty is aligned or nearly
aligned: the two-stage truing doctrine, silent routing, provenance labeling
("typed" vs measured), the PROVEN TO rollup that never flatters, append-and-
supersede corrections with undo, manual fallback everywhere, no gamification,
no engagement mechanics. These were the right instincts and they survive
constitutional review intact.

The failures the owner kept hitting on his phone — repeated questions,
wrong-rifle risk, dead ends, lost work, "too many sheets" — all trace to two
structural roots that four UI rebuilds never touched:

1. **The data spine is session-shaped, not fact-shaped.** Saves are still
   "sessions" underneath. The Constitution's model — small statements of
   fact, events underneath, range visits assembled automatically — was
   approximated in the v4 UI but never in the data path. Every wizard we
   deleted grew back as a picker or a validation because the storage
   layer still wants a session's worth of context per save.

2. **The product has no memory of current state.** The Constitution's single
   governing principle — *carry the last-known state forward; ask only what
   changed* — is almost entirely unimplemented. The app re-asks ammo,
   suppressor state, and distances it should already know. Nearly every
   question the owner found annoying is a question the Constitution
   classifies as forbidden (Anti-patterns 92, 93).

The four UI rebuilds treated symptoms. The Constitution names the disease.
The good news: the cure is mostly additive (a fact/event layer, a
carry-forward context layer), the engines don't change, and the v4 "three
facts" surface happens to map almost perfectly onto the constitutional
capture model — it just needs the memory and the spine underneath it.

---

## 2. Constitutional Scorecard

| Constitutional pillar | Grade | Notes |
|---|---|---|
| Engines as sole math authority (C21, §116.7) | **A** | Protected-file discipline, hash checks, decorate-don't-edit. Fully aligned. |
| Truing doctrine; user never chooses math (C22–24, AP99) | **A** | simple-true routes silently; honesty guard refuses nonsense. |
| PROVEN TO honesty (C25–27, §19, AP101–102) | **A–** | Never farthest-hit, never flatters, can sit at 0. Not yet epoch-scoped (see §4.4). |
| Provenance labeling (C10–11, C42, AP96–97) | **B+** | "(typed)" on certificates, measured vs typed distinguished. Not yet a full provenance class on every stored fact. |
| Append-and-supersede history (C13, C19) | **B** | Exists in truing corrections + record edit/delete with undo. Not universal across all fact types. |
| Never-lose / offline (C15–18, §51–53) | **B** | Draft autosave (v4), sync queue, honest "Saved — will sync," offline solver. Not yet tested against the full §53 failure matrix; attachments vault (§56) not hardened. |
| Ask only what changed / carry-forward (C2, C8–9, AP92) | **D** | The central constitutional principle. Largely unimplemented — ammo, suppressor, distances re-asked. |
| Sessions abolished (C7, AP91, §8.1) | **C–** | Gone from v4 vocabulary and primary UI; alive in the data path, escape-hatch logger, and record semantics. |
| Capture validity ≠ analytic eligibility (C14, AP94, Test K) | **C** | Honesty guard keeps the *draft* but rejected observations are not preserved as stored facts with a reason. |
| Passive evidence preserved before association (C6, §21, §23) | **D** | Garmin import demands rifle context up front; no unresolved-evidence queue. |
| Multi-rifle recognition (C39–40, §42, Test H) | **C+** | List + search exists; no last-used ranking, no scan path, no Garmin profile mapping. |
| Configuration epochs & invalidation (C28, §120, Test F) | **D** | Barrel/cleaning tracked; no compatibility service — a scope remount invalidates nothing today. |
| Workhorse factory birth record (C41–42, §44–50, Test L) | **D** | Certificate scan seam exists; no factory evidence package, no claim flow. Greenfield, not refactor. |
| Roy language (C37, §30) | **B+** | v2.5 language pass + three-fact vocabulary. Residual jargon in drawer/expert surfaces (acceptable there). |
| Progressive disclosure without modes (C38, AP106) | **B+** | Lanes deleted; "advanced" inline reveals. Aligned in shape. |
| No setup before value (AP90) | **B+** | One-question onboarding, factory-ammo-in-seconds. Load resolution still occasionally blocks (see §4.2). |
| v1 scope discipline (AP114, §143) | **A** | AI chat, crowd data, mobile admin all correctly out. |

---

## 3. Fully Aligned — leave alone

1. **All protected engines** (solver, truing-core, simple-true, velocity-stats, garmin-import parsing, calibration-status, target-geometry) and the discipline protecting them.
2. **The PROVEN TO mechanic** as the honest, non-gamified centerpiece — the Constitution's §19 is a description of what we already built.
3. **The payoff card** (Keep/Undo, "your 600 dial changes from 4.0 to 3.8") — a direct implementation of §10 "immediate value is part of capture."
4. **The three-fact capture vocabulary** ("I zeroed / I shot at distance / I clocked my speed") — maps one-to-one onto the Constitution's "small statements of fact" (§5). This is the piece of the UI work that constitutionally *survives on merit*.
5. **Certificate honesty** — em-dashes for unknowns, "(typed)" provenance, never overstating (§48).
6. **The ArUco calibrated target with manual fallback** — §32's acquisition matrix and AP107 (no integration dependency) are both satisfied.
7. **Draft autosave + "Finish what you started"** (v4 Law 4) — the never-lose seed, correct in kind.
8. **Honest offline status language** ("Saved — will sync") and the sync queue's queue-first behavior.
9. **One-question onboarding; suppressor deferred to first save** — AP90 compliant.
10. **v1 exclusions** — Ask yorT dormant, crowd-data dormant, admin off mobile.

## 4. Needs Refactoring — works, but violates principles

### 4.1 The data spine: sessions → facts (HIGHEST PRIORITY)
**Violates:** §5, §8, C1, C7, AP91.
Saves are session-shaped rows; the record feed, the escape-hatch logger, and parts of history still think in sessions. **Why it matters:** every downstream annoyance (pickers, validations, context re-asks) exists to feed the session's schema. **Refactor path (additive, no rip-out):** introduce a canonical `events` table (envelope per §117: type, rifle, time, provenance, supersedes, eligibility, sync state) and dual-write — every fact card writes one event row alongside today's tables. Projections keep reading the old tables until parity. Range visits become derived clusters later, never user objects. The word "session" leaves all user-facing language immediately (cheap, do first).

### 4.2 Carry-forward context (HIGHEST PRIORITY, biggest UX payoff)
**Violates:** C2, C8–9, AP92–93, §8.2, §24.2.
The app re-asks ammo per fact, suppressor state per save, distance per steel shot. **Refactor:** a per-rifle `current state` (ammo/lot, suppressor, last place, recurring target distances) carried forward until a change event; recognition-style confirms only when stale or consequential ("Still shooting the Hornady 143s?" — one tap). Recurring steel distances remembered per place (§32 matrix). This one refactor deletes most remaining questions in the product.

### 4.3 Capture validity vs analytic eligibility
**Violates:** C14, AP94, Test K.
The honesty guard refuses ineligible observations but only the *draft* survives; the observation isn't stored as a fact with an ineligibility reason. **Refactor:** persist every well-formed observation as an event with `analytic_eligibility: ineligible + reason`; the Why panel can explain "saved, but not used because…" (§30's plain uncertainty language). Small change, large constitutional weight.

### 4.4 Configuration epochs + invalidation service
**Violates:** C28, §120, Test F; PROVEN TO scoping (§19).
Nothing invalidates today: remount a scope, PROVEN TO stands. **Refactor (staged):** add "Something changed" as a fourth small statement (scope off/on, suppressor change, barrel swap, cleaned) writing config-change events; one centralized applicability function answers "does this zero still hold?" and PROVEN TO recomputes per epoch. Start with the two changes that matter most (optic remount, suppressor state) — full lineage tracking can come later.

### 4.5 Passive evidence: preserve first, associate later
**Violates:** C6, §21, §23, Test D.
Garmin import demands a rifle before accepting the file. **Refactor:** accept and vault the file unconditionally; propose association from mapping/context; one recognition question only when two rifles are plausible; unresolved imports park safely, never rejected, never silently attached.

### 4.6 Multi-rifle recognition
**Violates:** C39–40, §42.
Search exists; ranking doesn't. **Refactor:** order the switcher by last-used/recent-context; map Garmin profile names to rifles after first confirmation; the Workhorse QR/certificate scan becomes a recognition path (already a seam). No folders, no taxonomy — the Constitution forbids collector administration, and we correctly never built it.

### 4.7 Never-lose hardening
**Violates:** §53's full matrix, §56.
Drafts survive crash simulation; not yet proven against refresh, upgrade, expired auth, attachment-upload failure. **Refactor:** run Test I (offline failure injection) as a permanent suite; add content-hash + upload-state tracking for target photos so an original is never lost to signal drop.

## 5. Remove Completely

1. **The word and concept "session" from every user-facing surface** — labels, record feed groupings, escape-hatch headers. (The escape-hatch *logger itself* survives as a legal expert fallback under §26 — but it logs facts, not "a session.")
2. **Any remaining mid-flow rifle or load picker** where context is already known (the last of the pre-v4 form thinking; several were killed, the audit's F2/F3 were the stragglers — sweep and finish).
3. **Per-save re-asking of suppressor state** as a routine question — replaced by carry-forward + confirm-on-change (§24.2). Asking every time is AP92.
4. **The 8-rifle threshold gating the switcher's search box** — search is always visible; thresholds are an engagement-era reflex. (Trivial, but constitutionally it's the "recognition, not browsing" rule.)

## 6. UI Assumptions to Discard

1. That capture happens through screens the user navigates *to*. The constitutional model is statements arriving from anywhere (share-sheet import, camera, one-tap confirms) with the UI as receipt-and-payoff, not as corridor.
2. That every fact needs a flow. A cleaning event is one tap + auto-timestamp. "What happened?" and "what changed?" are peers.
3. That the rifle switcher is a *list problem*. It's a recognition problem (recent, mapped, scanned) with a list as fallback.
4. That validation is a gate. It's a label (eligible/ineligible) on an always-saved fact.
5. That onboarding teaches. The Workhorse factory record is the tutorial (§50); for generic rifles, the coach line is the tutorial. No lessons anywhere.
6. That the drop chart is the destination. It's a projection; the destination is "what should I dial and how far can I trust it."

## 7. Ideas That Must Be Preserved

1. PROVEN TO as front page, score, and honesty statement — with its ability to fall.
2. The three-fact sentences + payoff-in-shooter-terms. (Add the fourth: "something changed.")
3. Two-stage doctrine, silent routing, honesty guard.
4. Keep/Undo reversibility; append-and-supersede.
5. "(typed)" and every provenance distinction on certificates and outputs.
6. Draft autosave and "Finish what you started."
7. ArUco target geometry constants + manual fallback parity.
8. Protected-engine discipline and hash checks.
9. Roy-language register; one-gold-button physical grammar (sunlight/one-finger constraints in §31 are exactly what the v3 color law encoded).
10. The 80/20 rule: one observed hit beats never truing — now constitutionally framed as "a hit is evidence, not proof" (C25).

## 8. Roadmap — least disruption first

**Phase 0 — words and stragglers (days).**
Purge "session" from user-facing language; always-visible switcher search; finish the mid-flow picker sweep; fix the coach line (already queued). No schema work.

**Phase 1 — the fact spine, additively (the keystone).**
`events` table with the §117 envelope; every fact card dual-writes an event alongside existing tables; rejected-but-well-formed observations persist with eligibility reasons (Test K passes). Existing reads untouched; one additive migration, reviewed before running.

**Phase 2 — memory (the UX payoff).**
Per-rifle carry-forward state: current ammo/lot, suppressor, recurring places/distances; recognition confirms replace questions; switcher ranks by recency. This phase is when the owner *feels* the Constitution: the app stops asking.

**Phase 3 — change statements + invalidation.**
"Something changed" statement; config-change events; centralized applicability for optic remount + suppressor first; PROVEN TO scoped per epoch and allowed to fall (Test F passes).

**Phase 4 — passive evidence.**
Vault-first Garmin import; unresolved queue; profile mapping; one-question ambiguity resolution (Tests C/D pass).

**Phase 5 — never-lose hardening + Workhorse continuation.**
Test I failure-injection suite; attachment hashing/upload states; then the factory evidence package + secure claim (Test L) — greenfield, and the moment the business story and the product story become the same thing.

Each phase independently shippable; engines untouched throughout; every migration additive and owner-reviewed. UI changes concentrate in Phases 2–3 and are subtractive — questions and pickers get deleted, not added.

---

### The one-sentence verdict

We built an honest calculator with a session-shaped filing cabinet and no memory; the Constitution demands an honest memory with a calculator inside — the calculator is done, the honesty is done, and the memory is the work remaining.
