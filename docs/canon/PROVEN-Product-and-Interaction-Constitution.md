# PROVEN — Product and Interaction Constitution

**Status:** Constitutional product document  
**Audience:** Product owners, designers, engineers, Codex/Claude Code agents, QA, Workhorse Rifles operations, and future integration partners  
**Authority:** This document governs how PROVEN must think, capture information, protect truth, and behave. The separate **PROVEN Product Definition (UI-free)** governs what the product is required to accomplish. If an implementation choice conflicts with either document, the implementation must change.

---

## 0. How to Use This Document

This is not a collection of interface ideas. It is not a wireframe, page map, feature backlog, or visual design system.

It is the constitution for PROVEN.

It defines:

- the product's governing philosophy;
- the mental model users should experience;
- the architecture required to preserve an honest rifle history;
- the order in which information should be acquired;
- when the product may infer, assume, confirm, or require input;
- how complexity must remain hidden without hiding truth;
- how the product must behave offline;
- how Workhorse factory records become the beginning of a rifle's life history;
- the anti-patterns future teams are forbidden to introduce; and
- the tests every design and implementation must pass.

The words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative:

- **MUST / MUST NOT** describe non-negotiable requirements.
- **SHOULD / SHOULD NOT** describe strong defaults that require a documented reason to violate.
- **MAY** describes an allowed option, not a requirement.

This document deliberately avoids prescribing screens, buttons, tabs, navigation, or visual layouts. Those must be derived later from these rules rather than copied from existing shooting software.

### Constitutional decisions at a glance

This document makes twelve foundational decisions:

1. The shooter reports **changes and observations**, not the rifle's full state every time.
2. Range visits are assembled automatically underneath the product; users do not manage sessions.
3. Manual effort requires correct context first, while passive evidence is preserved before association.
4. A rifle is a persistent identity with time-bounded configuration epochs, not a pile of disconnected profiles.
5. Measured, imported, typed, inferred, and derived information remain distinguishable forever.
6. Original evidence is preserved; corrections append and supersede rather than overwrite history.
7. Offline local capture is the normal operating condition, and synchronization is replication rather than save.
8. Existing tested engines remain the sole authority for solver, truing, velocity, import, calibration, and PROVEN TO math.
9. PROVEN TO is scoped to the compatible current setup and may decrease when evidence no longer applies.
10. Workhorse rifles begin with a verifiable factory birth record instead of an empty profile.
11. The default experience reveals only immediate truth; expert evidence appears through contextual progressive disclosure.
12. Product success is measured by useful truth captured per second of conscious attention.

### Document map

- **Parts I–III** define the thesis, mental model, event/evidence architecture, and PROVEN TO scope.
- **Parts IV–V** define interaction behavior and automatic acquisition, including Garmin, paper targets, and long-range steel.
- **Parts VI–IX** define multi-rifle scale, Workhorse factory continuity, offline behavior, ownership, and privacy.
- **Parts X–XII** define analysis, cognitive load, friction budgets, and complete ideal journeys.
- **Parts XIII–XV** define forbidden patterns, fifty commandments, and the implementation architecture.
- **Parts XVI–XVIII** define acceptance tests, v1 scope/build order, and decision governance.
- **Parts XIX–XXI** define minimum canonical facts, terminology, and the final constitutional test.

---

# Part I — The Constitutional Thesis

## 1. The Product in Its Deepest Form

PROVEN is the permanent memory of a rifle.

It is an evidence-backed, continuously updated model of a specific physical rifle, its changing configuration, the ammunition fired through it, the conditions under which it was used, and the results it produced.

A useful shorthand is **digital twin**, but PROVEN must use that concept honestly. It is not an omniscient simulation. It knows what has been captured, preserves what remains unknown, and distinguishes measured facts from assumptions. Its value grows because it remembers and connects evidence across time better than a person can.

The ballistic solver is not the product. It is one engine inside the product.

The drop chart is not the product. It is one artifact produced by the product.

The logbook is not the product. It is one representation of the product's memory.

The product is the trusted continuity between:

1. what physically happened to the rifle;
2. what evidence was captured;
3. what the mathematics can honestly conclude; and
4. what the shooter should do next.

### Constitutional statement

> Shooting feels like art or magic when the variables are disconnected. PROVEN reconnects the variables until only the mathematics remain.

---

## 2. The Real Problem Is Not Missing Data

Most of the data already exists somewhere:

- muzzle velocities are stored in a chronograph;
- target groups are visible on paper or in photographs;
- shot times exist in device logs;
- weather can be associated with time and location;
- ammunition information is printed on boxes and lot labels;
- a shooter knows when a suppressor was installed;
- a shooter remembers cleaning at the moment it happens;
- the scope dial and impact are observable at long range;
- the rifle's configuration is physically present;
- the phone already knows time, location, camera metadata, and often direction.

The failure is continuity.

The information is scattered across devices, photographs, packaging, handwritten notes, text messages, memory, and separate applications. Months later, the shooter cannot reliably reconstruct which rifle, which lot, which zero, which suppressor state, which cleaning interval, which target, or which conditions produced a particular result.

PROVEN solves disconnection, not merely data entry.

The system must therefore optimize for three things:

1. **Capture:** preserve evidence with almost no conscious effort.
2. **Continuity:** attach the evidence to the correct rifle state across time.
3. **Interpretation:** convert accumulated evidence into honest ballistic and diagnostic conclusions.

The order matters. Analysis built on incomplete or contaminated history is false sophistication.

---

## 3. The Primary Product Goal

The primary goal is not maximum feature depth. It is maximum useful truth captured per unit of user effort.

A useful objective function is:

> **Capture efficiency = verified, useful facts preserved ÷ seconds of conscious user attention**

This changes how the product should be judged.

PROVEN should not optimize for:

- time spent in the app;
- number of screens viewed;
- number of fields completed;
- daily engagement;
- number of features discovered;
- visual density;
- the appearance of technical sophistication.

PROVEN should optimize for:

- the percentage of real shooting events that are captured;
- the percentage of captured facts that have clear provenance;
- the percentage of data acquired without typing;
- the reduction in repeated questions;
- the time required to record a normal range visit;
- the percentage of imported evidence correctly associated on the first attempt;
- the speed from new rifle to first trustworthy ballistic correction;
- the absence of lost or silently overwritten information; and
- the honesty of every conclusion.

The best PROVEN experience may involve very little time looking at PROVEN. The activity is shooting. The software should disappear into the work.

---

## 4. The Core Promise to the Shooter

PROVEN makes four promises:

### 4.1 Tell us only what only you can know

The product must not ask the shooter to enter information the phone, chronograph, camera, existing rifle history, or prior choices can already provide.

### 4.2 Tell us only what changed

The product must carry the rifle's last-known state forward. The shooter should not repeatedly describe the same rifle, ammunition, scope, suppressor state, zero, or range target.

### 4.3 We will remember the rest

Once a fact is captured, PROVEN must preserve it, connect it to the correct history, and make it available to future analysis.

### 4.4 We will never claim more than the evidence proves

Convenience may reduce input. It may never weaken epistemic honesty. An inferred ammunition lot remains inferred. Weather from a nearby station remains estimated. A typed velocity remains typed. A single impact remains one observation. A hit at 1,000 yards is not automatically proof to 1,000 yards.

---

## 5. The One Governing Design Principle

> **The user should not maintain a database. The user should report reality in the smallest natural unit possible, and PROVEN should build the database.**

That principle has several consequences:

- The user must not be required to create, name, open, and close formal shooting sessions.
- The user must not repeatedly fill out a rifle state form.
- The user must not decide which mathematical truing method to use.
- The user must not classify observations as velocity-truing or drag-truing data.
- The user must not manually connect every photograph, chronograph string, and weather record.
- The user must not reconstruct prior conditions from memory before new data can be saved.
- The user must not finish a setup wizard before recording something valuable.

The system should instead receive small statements of fact:

- this rifle was cleaned;
- this ammunition lot was opened;
- these velocities were recorded;
- this group was fired at this distance;
- this scope was dialed to this value;
- the center of impact was this far high or low;
- this suppressor was installed or removed;
- this component changed.

Everything else is system work.

---

## 6. The Six-Level Acquisition Hierarchy

Every piece of information must be acquired in this order of preference:

1. **Automatically capture it.**
2. **Import it from the device or source that already recorded it.**
3. **Infer it from reliable context.**
4. **Reuse the last-known value.**
5. **Ask the user for one simple confirmation.**
6. **Require manual entry only when unavoidable.**

Before any team adds a required field, it must document why levels 1 through 5 are impossible or unsafe.

There is also a prior question:

> **Does the product need this information now?**

If the fact does not affect current capture, current safety, current computation, or a near-term conclusion, the product should preserve the available evidence and ask later—or never ask at all.

### 6.1 Automatic capture

Examples include device time, photo metadata, locally available location, import timestamps, and system-generated identifiers. Automatic facts must still retain source and uncertainty.

### 6.2 Import

Examples include a Garmin Xero export, a target image, an existing rifle certificate, or a file from an approved measurement source. The original source artifact must be retained.

### 6.3 Inference

Inference is appropriate when context is strong enough to reduce effort but not strong enough to be called measured fact. Examples include associating a chronograph string with the only rifle used at that place and time or recognizing a recurring range target.

Inference must never silently upgrade itself to measurement.

### 6.4 Reuse

Stable state should persist. If the same scope, barrel, ammunition lot, suppressor state, and zero were last known to be in use, PROVEN should carry them forward until evidence of change appears.

### 6.5 Confirmation

Confirmation should be recognition, not recall. The user should be able to affirm or correct a proposed answer rather than reconstruct the answer from memory.

### 6.6 Manual entry

Manual input must accept the shooter's natural units and vocabulary. The system must perform conversion. Manual input must remain available as a universal fallback so that no integration failure prevents capture.

---

# Part II — The User's Mental Model

## 7. The Mental Model PROVEN Must Create

The user's mental model should be:

> **“PROVEN knows the current state of this rifle. I only need to tell it what happened or what changed.”**

The user should not have to understand:

- event sourcing;
- relational data;
- configuration versions;
- sync queues;
- data provenance taxonomies;
- inference confidence;
- ballistic routing doctrine;
- import normalization;
- solution versioning; or
- conflict resolution.

Those are implementation responsibilities.

The user should understand only five concepts:

1. **My rifle** — the physical rifle whose history continues over time.
2. **What changed** — cleaning, ammunition, scope, barrel, suppressor, or other configuration change.
3. **What happened** — velocities, groups, impacts, misses, and observations.
4. **What PROVEN now knows** — the current state, trends, and confidence.
5. **How far I can trust it** — **PROVEN TO ___ YARDS** for the applicable rifle configuration and ammunition.

---

## 8. Rifle First, Event Underneath

The persistent object is the rifle. The natural user context is “this rifle.”

The underlying data model, however, must be event-based.

This is not a contradiction.

A rifle is understood through a timeline of facts:

- built;
- tested;
- zeroed;
- fired;
- cleaned;
- reconfigured;
- chronographed;
- trued;
- inspected;
- corrected.

The user sees continuity. The system stores events.

### 8.1 No mandatory session management

A range visit may be useful as an automatically assembled grouping of events, but it must not be a prerequisite object the shooter has to create or maintain.

PROVEN should infer a range visit from combinations of:

- time proximity;
- location proximity;
- imported shot timestamps;
- target photo timestamps;
- the active rifle context;
- repeated ammunition and configuration state; and
- explicit user statements when needed.

The resulting cluster may be corrected later, but shooting data must never depend on the user remembering to “start” or “end” a session.

### 8.2 The key simplification: record deltas, not repeated state

A traditional application asks the user to describe the whole setup every time.

PROVEN must maintain an expected current state and ask only for differences.

If nothing changed, nothing should be re-entered.

If the user cleaned the rifle, only the cleaning event is new.

If the suppressor was removed, only that change is new.

If a new ammunition lot was opened, only the lot change is new.

If a scope was replaced, only the component change is new; the system determines which prior conclusions are no longer applicable.

This “change log, not repeated setup” model is the foundation of effortless capture.

---

## 9. The Product Must Support Two Kinds of Attention

The same user has different cognitive capacity while shooting than while reviewing later.

PROVEN must adapt to the moment without requiring the user to choose a mode.

### 9.1 Shooting attention

While shots are being fired, the product should:

- capture and preserve;
- avoid interrupting shot cadence;
- ask only questions that are immediately necessary;
- present only consequential information;
- make every interaction resumable;
- use recognition instead of recall;
- avoid long explanations; and
- remain fully functional offline.

### 9.2 Review attention

After the shooting activity, the product may:

- reconcile ambiguous imports;
- show trends and comparisons;
- expose detailed shot strings;
- explain why a correction was or was not usable;
- show statistical confidence;
- suggest the next highest-value verification step; and
- let an expert inspect or export the underlying evidence.

The product should infer these attention states from activity and context. It must not force the user to select “simple mode,” “expert mode,” “range mode,” or “review mode.”

---

## 10. Immediate Value Is Part of Capture

Every meaningful capture should produce an immediate payoff.

The payoff may be:

- confirmation that the evidence is safely stored;
- updated round count;
- updated rounds since cleaning;
- updated velocity statistics;
- a changed dial value at a familiar distance;
- a change in PROVEN TO distance;
- a statement that performance remains normal;
- a warning that a new result falls outside the rifle's established range; or
- a clear explanation that the evidence was saved but could not yet be used for truing.

A user who repeatedly contributes information without seeing value will stop contributing information.

The payoff must be expressed in shooter terms, not software terms.

---

# Part III — Product and Data Architecture

## 11. The Architecture in One Line

> **Capture sources → raw evidence vault → normalization → context resolution → immutable fact record → existing tested engines → derived rifle state → honest outputs**

Each stage has a distinct responsibility. Combining stages creates hidden data loss and false confidence.

---

## 12. The Rifle as the Aggregate Root

A rifle is the durable identity around which the history is organized.

The durable identity should normally follow the serialized receiver or action. Components may change without erasing the rifle's ownership history.

A rifle contains several separate lineages that must not be casually mixed:

- **barrel lineage** — barrel, chamber, twist, length, round count, and wear life;
- **optic lineage** — scope, mount, tracking verification, and zero relationship;
- **muzzle configuration** — suppressor, brake, bare muzzle, and related point-of-impact behavior;
- **ammunition lineage** — product/load, bullet, lot, and measured velocity behavior;
- **zero lineage** — confirmed zero under a compatible rifle, optic, muzzle, and ammunition state;
- **ballistic solution lineage** — each version of the computed solution and the evidence that produced it.

The user should not have to manage these lineages. The system must.

### 12.1 Configuration epochs

A configuration epoch is a time-bounded interval during which a relevant part of the rifle's physical state is believed to be stable.

Examples:

- installing a new barrel begins a new barrel epoch;
- replacing or remounting a scope begins a new optic/zero applicability epoch;
- adding a suppressor creates or activates a different muzzle configuration;
- changing ammunition lot begins a new lot interval;
- cleaning creates a maintenance event but not necessarily a new rifle configuration.

The system must use epochs to prevent incompatible evidence from contaminating current conclusions.

### 12.2 What configuration changes invalidate

The implementation must encode explicit invalidation and compatibility rules. At minimum:

| Change | History preserved | Conclusions requiring reconsideration |
|---|---|---|
| New barrel | Entire prior rifle history | Barrel velocity trend, barrel round count, zero, truing applicability, group baseline |
| Scope replaced or mount changed | Rifle and barrel history | Zero, scope tracking applicability, long-range dial validation |
| Scope removed and reinstalled | Prior rifle history | Zero confirmation; tracking may remain valid if the same scope is used |
| Suppressor added or removed | Both states preserved separately | Zero/POI and velocity applicability for the active muzzle state |
| New ammunition product/load | Prior load history | Velocity, zero applicability, trued solution for the new load |
| New ammunition lot | Product history preserved | Velocity baseline and possibly zero; prior lot remains comparable but not identical |
| Cleaning | All history preserved | Rounds-since-cleaning state and post-cleaning performance segment |
| Tall-target tracking test | All history preserved | Tracking confidence for the applicable optic epoch |

These rules may become more precise over time, but an implementation must never solve uncertainty by blending incompatible data.

---

## 13. Canonical Event Types

The underlying event model should be small, durable, and extensible. It should represent facts, not interface workflows.

Core event families include:

1. **Identity events**
   - rifle created or claimed;
   - ownership transferred;
   - factory record attached.

2. **Configuration events**
   - barrel installed or removed;
   - scope or mount changed;
   - suppressor or muzzle device changed;
   - scope height, twist, or other build fact recorded;
   - component correction or supersession.

3. **Ammunition events**
   - ammunition product/load introduced;
   - lot identified;
   - advertised specifications recorded;
   - current lot changed.

4. **Shot and velocity events**
   - individual shot recorded;
   - chronograph string imported;
   - velocity value typed;
   - invalid or duplicate shot marked without deletion.

5. **Target and group events**
   - target image captured;
   - group measured;
   - zero confirmed;
   - point of aim and group center recorded;
   - target measurement corrected.

6. **Long-range observation events**
   - target distance recorded;
   - direction of fire recorded;
   - scope dial used recorded;
   - impact or group center high/low recorded;
   - miss or uncertainty recorded;
   - observation accepted or found analytically ineligible.

7. **Maintenance events**
   - cleaned;
   - inspected;
   - fastener or hardware issue found;
   - repair performed;
   - maintenance note recorded.

8. **Environment events**
   - atmosphere measured;
   - atmosphere imported;
   - atmosphere estimated from time and location;
   - environmental value corrected.

9. **Computation events**
   - solution generated;
   - velocity truing correction accepted;
   - drag correction accepted;
   - correction undone or superseded;
   - PROVEN TO state recalculated;
   - anomaly conclusion generated.

The event model must allow future event types without forcing historical records to be rewritten.

---

## 14. Facts, Evidence, Inferences, and Conclusions Must Remain Separate

PROVEN must never store all information as if it were equally true.

Every important value must carry at least four dimensions:

1. **Value** — the number, category, statement, or artifact.
2. **Provenance** — where it came from.
3. **Applicability** — which rifle, configuration, load, time, and conditions it applies to.
4. **Confidence** — how much the system may rely on it and why.

### 14.1 Recommended provenance classes

- **Factory-recorded** — captured by Workhorse or another authorized source under a defined protocol.
- **Device-imported** — received from a chronograph or measurement device.
- **Photo-measured** — derived from an image whose scale and geometry are known.
- **User-observed** — reported by a shooter from a direct observation.
- **User-typed** — manually entered as a value without attached measurement evidence.
- **System-inferred** — proposed from context or prior state.
- **System-derived** — computed deterministically from source facts by a versioned engine.

These labels are not a simple ranking. A user-observed impact can be essential evidence. A factory value can still be old. Confidence must also consider sample size, recency, configuration compatibility, and internal consistency.

### 14.2 The confidence firewall

Automation may make input easier. It must never make a weak fact look strong.

Examples:

- A weather service value associated with a GPS location is **estimated atmosphere**, not a measured onsite reading.
- Reusing the last ammunition lot is **assumed current** until confirmed or supported by evidence.
- A velocity typed from a box is **typed/advertised**, not chronographed.
- A single steel impact is **one observation**, not a verified group center.
- A rifle inferred from timing and location remains **inferred association** until confidence is high enough or the user confirms it.

The user may see simple language, but the underlying distinctions must never be discarded.

---

## 15. Raw Evidence Must Be Preserved

PROVEN must store the original source artifact whenever one exists:

- original Garmin export;
- original target photograph;
- original certificate package;
- original imported spreadsheet;
- original image metadata;
- original user note or spoken transcription;
- original measured values before correction or exclusion.

Derived and normalized records must point back to that source.

The source artifact must not be replaced by a compressed interpretation. A display copy or thumbnail may be created, but future engines must be able to reprocess the original evidence.

This requirement allows:

- better future target recognition;
- corrected import parsers;
- auditability;
- duplicate detection;
- reversibility;
- migration to improved statistical methods; and
- proof that a conclusion came from a real observation.

---

## 16. Append-and-Supersede, Never Silent Rewrite

Facts may be corrected, but history must not be silently rewritten.

A correction creates a new event that supersedes the earlier event. The original remains preserved and traceable.

A deletion should ordinarily become a reversible exclusion or tombstone rather than physical destruction of the record, except when complete account deletion is requested.

Every accepted ballistic correction must be reversible.

Every solution must identify:

- the source facts used;
- the engine version used;
- the resulting values;
- the time it was computed; and
- which prior solution it superseded.

---

## 17. Capture Validity and Analytic Eligibility Are Different

PROVEN must almost never reject a user's attempt to record what happened.

An observation may be valid as history even when it is not eligible for a particular calculation.

Examples:

- A long-range impact without a confirmed zero should be saved but not used to true.
- A steel hit with unknown dial should be saved but may not support a correction.
- A photograph without scale should be preserved even if group size cannot yet be measured.
- A chronograph string with ambiguous rifle association should be stored as unresolved evidence.
- An observation outside the valid truing bracket should remain in the rifle history even though the truing engine does not use it.

The system should say, in substance:

> “I saved what happened. I could not use it for this calculation because ___.”

It must never say “invalid” and discard the evidence.

---

## 18. The Derived Current State

The event history is the source of truth. The system should maintain fast, derived projections for ordinary use.

For each rifle and applicable configuration, these projections may include:

- current build/configuration state;
- current ammunition product and lot;
- exact, minimum, or estimated round count;
- rounds since cleaning;
- latest confirmed zero;
- current velocity estimate and its provenance;
- velocity SD/ES and sample basis;
- current trued drag/BC/DSF state;
- scope tracking confidence;
- current drop chart;
- current PROVEN TO distance;
- performance baseline and expected variation;
- active warnings or unresolved changes; and
- next highest-value verification step.

Derived state may be regenerated at any time from the immutable history. It must not become an independent source of truth.

---

## 19. PROVEN TO Is Scoped, Not Generic

**PROVEN TO ___ YARDS** must apply to a specific compatible combination of:

- rifle identity;
- barrel epoch;
- optic/mount applicability;
- muzzle configuration;
- ammunition/load and, where material, lot;
- zero state; and
- ballistic solution version.

The product must not display the maximum distance ever reached by any setup as though it applies to the rifle in its current state.

PROVEN TO is not:

- the farthest distance ever hit;
- the maximum range in a ballistic table;
- a gamified achievement;
- a manufacturer claim;
- a guarantee of impact;
- a substitute for current wind judgment.

It is an honest statement of the distance to which the current ballistic solution has adequate supporting evidence under the product's doctrine.

It may rise when evidence improves. It may fall when a relevant configuration change, contradictory evidence, or stale prerequisite invalidates prior confidence. Honesty is more important than preserving a sense of progress.

---

# Part IV — Interaction Architecture

## 20. The Fundamental Interaction Loop

Every ordinary interaction should follow this sequence:

1. **Recognize context** — determine the likely rifle, configuration, ammunition, place, and purpose.
2. **Capture the smallest useful fact** — preserve the import, photograph, observation, or change.
3. **Resolve only consequential ambiguity** — ask one simple question only when the answer materially affects correctness.
4. **Commit safely** — save locally first, with clear provenance and no dependency on network access.
5. **Return immediate value** — show what was learned, changed, or preserved.
6. **Get out of the way** — do not pull the shooter into unrelated setup or analysis.

This can be summarized as:

> **Recognize → capture → confirm only if needed → reward → disappear**

---

## 21. Context Must Be Resolved Before Manual Effort

The Product Definition requires context to be resolved before effort is spent. This must be enforced carefully.

If the user is about to type or deliberately measure something, PROVEN must know which rifle and relevant state will receive that work before the user invests effort.

The product must not allow this failure pattern:

1. user enters ten values;
2. system asks which rifle;
3. user discovers the wrong rifle or configuration was active;
4. work is lost or must be repeated.

For passive evidence arriving from outside the application, the rule is different. PROVEN should first preserve the raw artifact, then resolve its association. An imported file or shared photograph must never be rejected merely because context is not yet known.

Therefore:

- **manual effort requires context first;**
- **passive evidence requires preservation first.**

---

## 22. Active Context Without Session Management

PROVEN should maintain a temporary, confidence-scored **active context** rather than requiring a formal user-created session.

The active context may include:

- likely rifle;
- current configuration epoch;
- current ammunition and lot;
- likely range/place;
- likely recurring target;
- current environment source;
- current shooter;
- recent chronograph import; and
- recent target evidence.

The system may establish or update this context from:

- explicit rifle selection or scan;
- the only rifle in the account;
- last-used rifle;
- recent activity at the same time and place;
- metadata embedded in a Workhorse certificate;
- a mapped Garmin rifle/profile name;
- a recurring ammunition lot;
- an import's timestamp pattern;
- target photo metadata; and
- user confirmation.

### 22.1 Active context must expire safely

An active context may persist long enough to reduce repeated questions, but it must not persist so aggressively that next month's shots are silently attached to the wrong rifle.

Expiration should consider:

- elapsed time;
- location change;
- app/device restart;
- a different import identity;
- a conflicting ammunition signature;
- explicit component changes; and
- the presence of multiple plausible rifles.

The exact confidence model is an implementation detail. The constitutional rule is that convenience may never create silent history contamination.

### 22.2 Wrong association is a higher-cost error than one confirmation

When ambiguity could attach performance evidence to the wrong rifle, PROVEN should ask one recognition-based confirmation.

When ambiguity concerns a low-stakes detail that can be corrected later, PROVEN should preserve the evidence and avoid interruption.

---

## 23. The Unresolved Evidence Queue

The architecture must support evidence that is safely captured but not yet fully associated.

Examples:

- a Garmin export shared without a known rifle;
- a target photo taken outside PROVEN;
- an old photograph imported from the camera roll;
- an ammunition label photo with no current range event;
- a chronograph string that could belong to two similar rifles.

The system should maintain an internal unresolved-evidence queue.

The user should not feel responsible for “managing an inbox.” The system should:

1. attempt automatic resolution;
2. use prior mappings and context;
3. ask only when a single answer resolves a meaningful ambiguity;
4. combine related questions rather than interrupt repeatedly; and
5. leave low-value ambiguity unresolved without blocking the rest of the product.

No evidence may disappear because association failed.

---

## 24. Questions Are Expensive

Every question consumes attention, interrupts shooting, and creates an opportunity for abandonment or error.

Before asking, the product must evaluate:

1. Can the phone or source device know this?
2. Was this already answered previously?
3. Can the system safely carry the last value forward?
4. Can the answer be inferred with adequate confidence?
5. Can the question wait until a natural pause?
6. Does the answer unlock an immediate conclusion or prevent contamination?
7. Can one question resolve several fields at once?

If the answer does not materially improve truth or prevent error, do not ask.

### 24.1 One question at a time

When a question is necessary, it should ask about one concept in the shooter's vocabulary.

Do not present a checklist of unrelated uncertainties.

Do not make the user choose a workflow category before stating what happened.

### 24.2 Recognition over recall

Prefer:

> “Still using Federal 140-grain, lot 47A?”

over:

> “Enter ammunition manufacturer, product line, bullet weight, and lot.”

Prefer:

> “Suppressor still installed?”

when there is real reason to confirm, over requiring muzzle-device selection at every range visit.

### 24.3 Ask at the right time

Ask immediately only when:

- the answer is required before manual effort;
- the wrong answer would contaminate rifle history;
- the answer is needed for a safety-critical or physics-critical output; or
- one answer creates immediate high value.

Ask later when:

- the artifact is already safely stored;
- the shooter is actively firing;
- the answer affects analysis but not preservation;
- the system can provide partial value without it; or
- the user is likely to answer more accurately after reviewing the evidence.

---

## 25. Capture Must Be Interruptible and Resumable

At a range, users are interrupted by cease-fires, spotters, equipment, other shooters, weather, and the act of shooting.

Every capture path must:

- save progress continuously;
- survive app closure, device lock, crash, and signal loss;
- resume without forcing the user to reconstruct prior input;
- preserve incomplete observations with an honest status;
- avoid destructive timeouts; and
- never require the user to remember where they were in a workflow.

A partially completed fact is still valuable evidence. It may be completed later.

---

## 26. No Forms as the Primary Experience

Forms may exist as a fallback for expert editing, import repair, or complete manual entry. They must not define the ordinary experience.

A conventional form forces the user to:

- understand the data model;
- scan many fields;
- determine which fields apply;
- remember prior state;
- convert units;
- decide what is required; and
- fear losing work before submission.

The primary interaction should instead be based on:

- imported artifacts;
- photographs;
- persisted context;
- small statements of change;
- one-value observations;
- one-tap confirmation; and
- immediate computed payoff.

The user should describe reality, not populate schema.

---

## 27. Input Modalities Must Be Interchangeable

No single input method should become a point of failure.

PROVEN should support a hierarchy of equivalent capture methods:

- device/file import;
- camera capture;
- structured speech capture where available;
- direct numerical entry;
- selection from recent values;
- approximate observation; and
- later correction.

A structured spoken statement may be useful for a shooter at steel—for example, recording distance, dial, and vertical impact in one natural utterance. If implemented, this is an input method, not an AI chat assistant. It must resolve into visible structured facts that can be confirmed and must have a non-voice fallback.

No essential feature may depend exclusively on:

- online speech recognition;
- computer vision;
- a manufacturer API;
- a proprietary file format;
- a specific phone sensor; or
- continuous connectivity.

---

## 28. The Product Must Accept the Shooter's Units

PROVEN must not make the shooter perform conversions.

It should accept and remember preferences for:

- yards or meters;
- mils or MOA;
- inches, centimeters, clicks, or angular correction;
- feet per second or meters per second;
- Fahrenheit or Celsius;
- pressure conventions appropriate to the solver; and
- common natural expressions such as “two tenths high.”

Internally, the product may normalize values to canonical units. The original expression and source unit should remain preserved where meaningful.

A user should be able to switch display units without changing the underlying fact.

---

## 29. Progressive Disclosure Is Contextual, Not a User Mode

PROVEN must satisfy a low-tech expert and a data-driven enthusiast without splitting the product into “basic” and “advanced” versions.

Complexity should appear only when it is relevant.

### 29.1 Layer 1 — immediate truth

The default experience should reveal only:

- the current rifle/context;
- the fact just captured;
- whether it was safely saved;
- the immediate result;
- the current PROVEN TO statement; and
- one next action when one is clearly valuable.

### 29.2 Layer 2 — supporting explanation

When the user seeks more detail, the product may reveal:

- why a value changed;
- which observations were used;
- whether a source was typed, imported, measured, or inferred;
- sample size and confidence language;
- compatibility with the current setup; and
- reasons an observation was not used.

### 29.3 Layer 3 — expert evidence

An expert may inspect:

- complete shot strings;
- raw velocities;
- SD/ES calculations;
- target measurement details;
- truing residuals;
- solution versions;
- full history;
- exported data; and
- source artifacts.

The existence of Layer 3 must not make Layer 1 more complicated.

### 29.4 Complexity follows the task

The product should reveal advanced detail because the user is doing an advanced task—not because the user toggled a permanent “expert mode.”

---

## 30. Language Must Be Native to Shooters

The primary user has deep rifle knowledge and low software patience.

Use terms such as:

- rifle;
- zero;
- group;
- shot string;
- muzzle velocity;
- high/low;
- dial;
- suppressor;
- cleaning;
- ammunition lot;
- rounds; and
- target distance.

Avoid exposing terms such as:

- entity;
- record object;
- workflow;
- data source mapping;
- synchronization conflict;
- configuration epoch;
- ingestion;
- normalization; and
- projection.

Those may exist in engineering documentation, never as required user vocabulary.

The product must explain uncertainty plainly:

- “measured from eight shots”;
- “typed, not measured”;
- “estimated from nearby weather”;
- “one observation—low confidence”;
- “saved, but not used because zero was not confirmed.”

Technical honesty does not require technical software language.

---

## 31. Physical Interface Constraints

Although this constitution does not design the visual interface, every future interface must respect the physical environment. The primary consumer implementation is a phone-first PWA backed by Supabase/Postgres, but these behavioral rules apply equally to factory, desktop, and future clients.

It must be usable:

- in direct sunlight;
- with one finger;
- with gloves where practical;
- on a phone at a shooting bench;
- while the user is standing or carrying equipment;
- with intermittent attention;
- without precision gestures; and
- without relying on color alone.

Therefore, future designs must avoid:

- small touch targets;
- dense multi-column data entry;
- drag-and-drop as the only method;
- hover-dependent behavior;
- hidden save states;
- low-contrast status indicators;
- long unbroken instructions; and
- destructive gestures that can be triggered accidentally.

The user must always know whether a fact is safely stored locally, pending sync, or unresolved.

---

# Part V — Automatic Data Acquisition Strategy

## 32. Acquisition by Variable

The following matrix defines the preferred path for common information. It is architectural guidance, not a screen specification.

| Information | Preferred acquisition | Secondary path | Last-resort path | Persistence rule |
|---|---|---|---|---|
| Time | Device metadata | Source-file timestamp | User correction | Always automatic; never ask by default |
| Location | Phone GPS | Photo/source metadata | Place selection or typed location | Reuse within event cluster; private by default |
| Rifle identity | Explicit scan/claim or confident active context | Recent rifle, import mapping | Search/select | Never infer silently when ambiguity could contaminate history |
| Barrel/optic/muzzle configuration | Last-known state | Component evidence or prior mapping | Simple change statement | Carry forward until a change event |
| Ammunition product | Box/label scan or prior current ammo | Import mapping/recent ammo | Search/type minimal identity | Carry forward until changed |
| Ammunition lot | Label/box photo or barcode/OCR | Prior lot confirmation | Type or mark unknown | Never fabricate; unknown is allowed |
| Muzzle velocity | Garmin export import | Typed average/string | Advertised speed | Preserve every shot and provenance |
| Shot count | Deduplicated imported shots and target counts | User-reported total | Estimate/range | Store exact, minimum, or estimated status |
| Target image | Camera/import | Existing photo | No photo; manual observation | Preserve original image |
| Group measurement | Calibrated target photo | Manual measurement | Approximate group | Preserve method and uncertainty |
| Zero | Measured group at known distance | Manual group data | User statement, labeled unconfirmed | Zero confirmation tied to compatible configuration |
| Target distance | Stored range target/rangefinder import | Reuse recurring target | Type/speak once | Persist by target/place when stable |
| Direction of fire | Stored target coordinates/phone bearing | Reuse recurring target | Manual direction | Required or prompted for ≥800 yd when unknown |
| Scope dial used | Known PROVEN recommendation or device source | Reuse expected dial with confirmation | Type/speak | Preserve actual dial, not merely predicted dial |
| Impact high/low | Image measurement or structured observation | Target-fraction/reticle observation | Type approximate value | Keep original expression and uncertainty |
| Atmosphere | Onsite sensor import | Time/location weather estimate | Manual | Label measured vs estimated; never call station wind onsite wind |
| Cleaning | One change statement | Retrospective approximate event | Unknown | Reset rounds-since-cleaning projection, preserve uncertainty |
| Suppressor state | Last-known configuration | Visual/behavioral prompt | Simple confirmation | Persist until changed |
| Scope tracking | Calibrated tall-target evidence | Manual test values | Unknown | Optional; tied to optic epoch |

---

## 33. Garmin Xero Must Be an Import-First Experience

Assume Garmin Xero is the dominant chronograph source.

The user should almost never type individual velocities.

### 33.1 Required v1 principle

The guaranteed path must work from an exported file or share action without requiring a direct hardware API. Future APIs or automatic device synchronization may improve the experience, but they must not be prerequisites for the core product.

### 33.2 Preferred integration ladder

1. Direct authorized API or account sync, if a stable and permitted interface becomes available.
2. Native share/export from the Garmin ecosystem into PROVEN.
3. File selection from device storage or a watched import location.
4. Import from a forwarded file or desktop handoff.
5. Camera capture of a summary as a convenience fallback.
6. Manual average or string entry as the universal fallback.

### 33.3 Import behavior

A Garmin import must:

- store the original export unchanged;
- parse all available shot timestamps and values;
- use the existing tested import engine as the source of truth;
- detect duplicate imports idempotently;
- preserve excluded or marked shots rather than deleting them;
- map recurring Garmin profile names to rifles or loads after one confirmation;
- associate the string with time, place, rifle, ammunition, and event context when possible;
- allow unresolved association without losing the file;
- distinguish measured velocity from typed or advertised velocity; and
- immediately calculate available statistics using the existing tested velocity engine.

### 33.4 Deduplication

The same shot may appear in a Garmin file, a target group count, and a user-reported total. PROVEN must not count it three times.

Shot deduplication should consider:

- source artifact identity and hash;
- shot timestamps;
- sequence position;
- velocity values;
- event timing;
- target shot count; and
- explicit user correction.

When exact reconciliation is impossible, the round count must be labeled as minimum or estimated rather than falsely exact.

### 33.5 Mapping should learn

After a user confirms that a recurring Garmin profile belongs to a specific rifle/load, PROVEN should remember the mapping. It should ask again only when conflicting evidence appears.

---

## 34. Target Capture Philosophy

Target evidence is among the most valuable information in PROVEN because it grounds zero, grouping performance, and long-range observation.

The product must make a photograph useful before making it perfect.

### 34.1 Preserve first

A target photo must be stored immediately, even if:

- the rifle is not yet known;
- scale is missing;
- holes cannot be detected;
- point of aim is ambiguous;
- the image is taken later from the camera roll; or
- the target is steel rather than paper.

### 34.2 Calibrated paper target path

For the PROVEN printable target with shared ArUco geometry, the preferred behavior is:

- identify target corners automatically;
- correct perspective;
- establish scale;
- detect or assist identification of bullet holes;
- use known caliber when measuring edge-to-edge group size;
- preserve the original and calibrated image;
- let the user correct missed or false hole detections without redoing the capture; and
- derive group center, group size, point-of-impact offset, and zero evidence.

Computer vision is a convenience path. Manual point marking and manual group entry must always remain possible.

### 34.3 Generic paper target path

A non-PROVEN target may still provide value.

The system should seek scale from:

- a known grid;
- a known target model;
- a ruler or reference object;
- user-provided target dimensions; or
- manual group measurement.

If scale cannot be established, the photograph still belongs in the rifle record as visual evidence.

### 34.4 Do not force target administration

The user should not have to create a target record before taking a picture. The image is the beginning of the record, not the reward for completing metadata.

---

## 35. Long-Range Steel Is a First-Class Capture Case

Velocity and drag truing commonly occur on painted steel near 900 to 1,000 yards. The product must not assume every useful target is a paper target that can be photographed at arm's length.

At steel, the key ballistic observation is usually the vertical relationship among:

- confirmed zero;
- target distance;
- direction of fire when relevant;
- environment;
- actual scope dial used;
- point of aim;
- shot count; and
- observed center of impact high or low.

Windage and lateral misses may be preserved, but they must not contaminate vertical truing logic.

### 35.1 Minimize what the shooter must report

PROVEN should already know or propose:

- the current rifle;
- current load and lot;
- current zero state;
- expected dial from the active solution;
- time and location;
- likely environment;
- a recurring target's distance and azimuth; and
- the recent Garmin string.

The shooter should usually provide only what the system cannot observe:

- whether the actual dial differed from the proposed dial;
- where the impact or group center landed vertically; and
- the certainty/shot basis of that observation.

### 35.2 Accept natural observations

The shooter may observe impact in:

- mils;
- MOA;
- clicks;
- inches or centimeters;
- fractions of a known target;
- reticle subtensions; or
- an approximate statement such as “about two tenths high.”

PROVEN should convert the observation while preserving the original expression and uncertainty.

### 35.3 Prefer groups or strings, but value one observation honestly

A group center or multi-shot string is more informative than one hit. The product should make it easy to record the full observation rather than cherry-pick successful impacts.

However, one credible observation is still more valuable than never truing. It may produce a rough, explicitly low-confidence correction under the existing doctrine.

The system must never present one hit as a high-confidence proof.

### 35.4 Photo and optic-assisted paths

When a spotting-scope image, target camera image, or later photograph of painted steel is available, PROVEN may use it to measure impact location. This must remain optional. The ordinary steel workflow must succeed from a direct shooter/spotter observation without requiring an image.

### 35.5 Recurring range targets should become remembered places

If a shooter repeatedly uses the same 900-yard or 1,000-yard steel at a known range, PROVEN should remember:

- target identity;
- distance;
- azimuth or target coordinates;
- target size; and
- prior observations.

The shooter should not re-enter stable target facts on every visit.

---

## 36. Truing Must Be Expert Doctrine Without Expert Work

The user must never be required to choose whether an observation should true velocity or drag.

The existing tested engines and doctrine determine that silently:

- observations comfortably supersonic are routed to muzzle-velocity truing;
- observations in the transonic window defined by doctrine (Mach 1.2–0.9) are routed to drag/BC/DSF truing;
- observations outside valid brackets are preserved but not misused;
- zero must be confirmed before an observation is used for truing;
- sample size and observation quality determine confidence language; and
- physically impossible or nonsensical corrections are rejected analytically without discarding the observation.

The user should see the practical result:

- what dial changed;
- at what distances the change matters;
- how confident the correction is;
- what evidence was used; and
- what next observation would most improve confidence.

The user should not have to see the internal routing unless they seek expert detail.

---

## 37. Environment Must Be Useful and Honest

Atmosphere affects the solution, but forcing users to type weather at the bench defeats the product.

### 37.1 Source hierarchy

1. Onsite measured environment from an approved source.
2. Imported environmental values embedded in a related source.
3. Device sensors where reliable and available.
4. Estimated historical/current conditions from time and location.
5. Reused values within a short, stable event cluster.
6. Manual entry or correction.

### 37.2 Estimated is not measured

Weather from a nearby service must be labeled estimated. It may be sufficient for a useful solution, but it must not appear on a certificate as an onsite measurement.

Wind deserves special caution. A weather-service wind is not a measurement of downrange wind at the shooter's location and must not be represented as such.

### 37.3 Historical enrichment

When shooting occurs offline, PROVEN should capture time and location locally and may enrich the event with historical weather after connectivity returns. The later enrichment must retain its source and must not overwrite an onsite measurement.

### 37.4 Direction of fire

Direction of fire matters at and beyond 800 yards. The system should obtain it from:

- stored shooter and target coordinates;
- a known recurring range target;
- phone bearing captured while identifying the target;
- an imported range/rangefinder source; or
- one manual direction entry.

Once a fixed target's direction is known, it should be reused.

---

## 38. Ammunition Must Be First-Class and Nearly Effortless

Factory ammunition is normal, not an exception.

A shooter must be able to introduce a new ammunition product at the moment it is first used without completing a cataloging project.

### 38.1 Minimum viable ammunition identity

The minimum useful identity may be:

- manufacturer/product name;
- bullet weight;
- cartridge; and
- lot when available.

Other details can be captured from the box, product data, or later enrichment.

### 38.2 Photograph the box, do not transcribe the box

The preferred path is to capture or import an image of the box and lot label. PROVEN may extract likely values, but it must preserve the image and let the user confirm only ambiguous details.

### 38.3 Carry the current lot forward

Once a lot is established, it remains the current lot until:

- the user reports a change;
- a new box/lot image is captured;
- an import mapping changes; or
- conflicting evidence justifies a simple confirmation.

### 38.4 Unknown lot is allowed

The inability to identify a lot must never prevent the user from recording shots. The system should state that lot-level comparison is unavailable rather than fabricating certainty.

---

## 39. Round Count Must Be Honest About Precision

Round count affects barrel life, cleaning intervals, and diagnosis. It is important, but users will not always have exact history.

PROVEN must support:

- **exact count** — every shot is accounted for;
- **minimum count** — at least this many shots are documented;
- **estimated count** — based on user recollection or partial evidence; and
- **unknown prior count** — history begins from a known point without pretending the rifle was new.

The product should automatically accumulate rounds from deduplicated evidence.

A user should not have to increment a counter after every shot.

When a chronograph did not record all fired rounds, the user may report a total for the event. PROVEN should reconcile, not duplicate, the counts.

Workhorse factory rifles should begin with an exact documented factory count.

---

## 40. Cleaning and Maintenance Are Change Events

Cleaning should be among the easiest facts in the entire product to record.

The user should be able to state simply that the rifle was cleaned. PROVEN should already know:

- which rifle;
- the current round count;
- the time; and
- the prior rounds-since-cleaning state.

Optional details such as cleaning method, copper removal, products used, or bore condition may exist for experts but must never burden ordinary capture.

Retrospective entries should accept natural uncertainty:

- exact date;
- approximate date;
- “after the last range trip”;
- approximate round count.

The system should preserve the uncertainty rather than rejecting the event.

Hardware inspections and repairs should use the same change-event philosophy.

---

## 41. Configuration Recognition and Change Capture

Most configuration facts are stable. They should persist until changed.

PROVEN should not ask whether a suppressor is installed every time the user fires. It should carry the last-known state forward and ask only when:

- the user reports a change;
- a new photograph or device mapping suggests a change;
- results show a step change consistent with a configuration difference;
- the rifle has been inactive long enough that confirmation is prudent; or
- the current conclusion depends heavily on the state and ambiguity is real.

A configuration change should be expressible as one natural fact. The system should determine downstream invalidation.

Examples:

- “I put the suppressor back on.”
- “I changed scopes.”
- “This is a new barrel.”
- “I remounted the same scope.”
- “I opened a new lot.”

The shooter should not be asked which databases, models, or historical calculations need updating.

---

# Part VI — One Rifle and Fifty Rifles

## 42. Multi-Rifle Scale Must Not Add Everyday Complexity

An owner with one rifle and an owner with fifty rifles should experience the same core loop:

> identify the rifle with minimal effort → record what changed or happened → receive value

The architecture may manage large collections, but collection management must not dominate the experience.

### 42.1 One-rifle behavior

When an account has one rifle, that rifle should normally be the assumed context. The user should not repeatedly select it.

The system should still guard against imported evidence that clearly belongs elsewhere, but the ordinary experience should feel immediate.

### 42.2 Many-rifle behavior

When an account has many rifles, rifle identification must become a recognition task rather than a long library-browsing task.

Preferred identification methods include:

1. physical scan or claim code tied to the rifle;
2. last-used and recently used context;
3. a clear rifle photograph and nickname;
4. mapped chronograph profile names;
5. search by cartridge, manufacturer, model, serial, or nickname;
6. optional user-created favorites or collections; and
7. explicit selection as a fallback.

No owner should be required to create folder hierarchies, tags, or categories before the collection is usable.

### 42.3 Physical identity aids

For collectors and Workhorse customers, PROVEN should support a durable physical identity path such as a QR code, certificate code, or optional NFC association.

A physical scan should resolve:

- rifle identity;
- current ownership/claim status;
- factory record where applicable; and
- likely current configuration.

The code should identify the rifle, not expose private rifle history to anyone who scans it without authorization.

### 42.4 Selection should learn from behavior

The system should rank likely rifles from:

- recent use;
- current place;
- recurring range patterns;
- chronograph mappings;
- cartridge/ammunition evidence;
- recently viewed rifle context; and
- explicit favorites.

It must not use a weak heuristic to silently attach measurements to a rifle when several plausible candidates exist.

### 42.5 Multiple rifles in one range visit

A range visit may contain several rifles. The underlying event cluster must support switching active rifle context without forcing the user to end one formal session and start another.

Evidence should remain attached to the correct rifle while sharing common place, time, and environmental context where appropriate.

### 42.6 Shared rifles and multiple shooters

The default shooter may be the account owner, but PROVEN should support another shooter when relevant.

Factory testing must identify the authorized tester. Family or team use may identify a different shooter without forcing shooter selection on every event.

Performance analysis should avoid comparing unlike contexts as though they were identical. When shooter or shooting protocol is known, it should remain part of the evidence applicability.

---

## 43. The Rifle Library Is Not the Product

A collection view may be necessary, but it must not become the mental center of PROVEN.

The product should not reward users for administrative completeness. A rifle may begin with only:

- a recognizable name or photograph;
- cartridge;
- enough identity to avoid confusion; and
- the first useful fact.

Build details can be imported, inferred, photographed, or added later when they become relevant.

A new user must never be forced to fully catalog fifty rifles before using one rifle at the range.

---

# Part VII — Workhorse Rifles Factory Integration

## 44. The Workhorse Advantage

A normal rifle app begins with an empty profile and asks the owner to supply everything.

A Workhorse rifle should begin with a documented birth record.

The first approximately fifty rounds should establish:

- exact factory round count;
- factory configuration;
- ammunition product and lot;
- chronograph evidence;
- complete velocity strings;
- targets and group measurements;
- zero evidence;
- environmental conditions and source;
- long-range observations and truing;
- scope tracking evidence when performed;
- photographs and source artifacts;
- ballistic solution versions;
- PROVEN TO state; and
- tester/protocol provenance.

The customer should begin with the experience:

> **“This rifle already has a history. Workhorse proved it. I am continuing it.”**

---

## 45. The Factory Record Is the Rifle's First Chapter

The factory record should be an immutable, versioned evidence package attached to the rifle's identity.

It should include:

- a unique rifle identifier;
- a complete list of source artifacts;
- normalized events;
- configuration state at shipment;
- engine versions used;
- certificate values;
- provenance for every claim; and
- an integrity mechanism such as a signed package or verifiable checksum.

The customer may add corrections or later observations, but the original factory record must not be silently altered.

If Workhorse corrects a factory entry, the correction must supersede the original with an auditable explanation.

---

## 46. Claiming a Workhorse Rifle Must Be Simpler Than Creating One

A Workhorse customer should not manually recreate the rifle.

The claim path should use a secure certificate/serial association to load the documented history.

After claim, PROVEN should need only to determine what changed between factory shipment and first customer use.

Examples:

- Was the factory scope retained?
- Was the suppressor configuration changed?
- Is the customer using the same ammunition product/lot?
- Was the scope removed, remounted, or adjusted?

These should be asked only when relevant to the first output. The customer must not be confronted with the entire factory data model.

---

## 47. Factory Provenance Must Remain Visible but Not Noisy

The customer should be able to distinguish:

- factory-measured data;
- factory-typed specifications;
- customer-measured data;
- customer observations;
- system estimates; and
- current derived conclusions.

The ordinary experience may summarize this simply, but certificates and expert detail must state it exactly.

A Workhorse claim must never be presented as stronger than the underlying protocol and evidence.

---

## 48. The Certificate of Performance

The Certificate of Performance is not marketing decoration. It is a human-readable projection of the evidence record at a specific point in time.

It must state:

- rifle identity and applicable configuration;
- ammunition/load and lot when known;
- confirmed zero evidence;
- measured velocity basis and sample size;
- truing evidence and relevant distances;
- scope tracking status if verified;
- current PROVEN TO distance;
- what was measured, imported, typed, inferred, or unavailable;
- issue date and solution version; and
- a scannable path to the authorized digital record.

The certificate must never flatten provenance. “Typed” must not become “measured.” “Estimated weather” must not become “measured atmosphere.”

When the rifle changes materially, the historical certificate remains valid as a statement about the earlier state but must not masquerade as current.

---

## 49. Factory Operations Should Use the Same Truth Model

Workhorse may require more structured operational capture than a consumer. That does not justify a separate truth system.

Factory testing and customer continuation should share:

- the same event definitions;
- the same provenance model;
- the same solver/truing engines;
- the same target calibration constants;
- the same statistical rules;
- the same append-and-supersede history; and
- the same PROVEN TO doctrine.

Factory-specific operational tooling may exist, but it should produce the same canonical events the consumer product understands.

This prevents translation errors and makes the customer's record a true continuation rather than a marketing import.

---

## 50. Factory Data Must Teach Without Becoming a Tutorial

The first fifty rounds should show the customer what good documentation looks like through the rifle's own history.

The customer should be able to see, in context:

- what a confirmed zero looks like;
- how chronograph strings become velocity statistics;
- how target evidence supports a claim;
- how a long-range observation changes the solution;
- how ammunition lot and conditions are preserved; and
- how PROVEN TO is earned.

The product should not force the customer through a long onboarding lesson. The already-complete rifle history is the lesson.

---

# Part VIII — Offline-First and Never-Lose Architecture

## 51. Offline Is the Normal Range Condition

Offline behavior is not a degraded mode. It is the expected mode at the place where PROVEN matters most.

Every core action must work without signal:

- identify or select a locally known rifle;
- record a cleaning or configuration change;
- import a locally available Garmin file;
- capture target photographs;
- record zero and long-range observations;
- calculate with locally available tested engines and data;
- update locally available derived state;
- show drop charts already supported by available data;
- preserve all work; and
- queue synchronization.

The product must never require connectivity to save first and think later.

---

## 52. Local Commit Comes Before Server Sync

Every user-created or imported event must receive a durable local commit before the product reports it as saved.

The architecture should use:

- client-generated unique identifiers;
- append-only local event storage;
- idempotent operations;
- durable attachment queues;
- explicit sync status;
- retry-safe uploads; and
- deterministic merge behavior.

Server synchronization is a replication step, not the moment at which the fact becomes real.

---

## 53. Nothing Entered Is Ever Lost

This is an absolute requirement.

The implementation must survive:

- validation failure;
- app navigation;
- device lock;
- browser refresh;
- crash;
- network interruption;
- duplicate import;
- server timeout;
- expired authentication;
- partial attachment upload;
- sync conflict; and
- software upgrade.

A validation rule may prevent an observation from affecting a calculation. It may not erase the observation.

A failed upload may delay server replication. It may not remove the local artifact.

A user correction may supersede an earlier value. It may not silently destroy the earlier evidence.

---

## 54. Sync Must Be Honest and Quiet

The user should not have to manage synchronization.

The system should:

- sync automatically when possible;
- retry safely;
- avoid duplicate events;
- upload original artifacts reliably;
- retain local access until remote confirmation;
- identify items that truly require user resolution; and
- clearly distinguish saved locally from synchronized.

The product must never imply “saved everywhere” when an item exists only on one device.

It must also avoid alarming the user with routine technical detail. Ordinary queued synchronization should be calm and unobtrusive.

---

## 55. Conflict Resolution Follows the Event Model

Because facts are append-only and corrections supersede, many conventional last-write-wins conflicts can be avoided.

When two devices record independent facts, both should be preserved.

When two devices correct the same fact differently, PROVEN should:

- preserve both corrections;
- identify the conflict;
- avoid silently choosing based only on timestamp; and
- ask for resolution only if the conflict affects current truth.

Derived state can then be recalculated from the resolved event history.

---

## 56. Original Attachments Require Special Protection

Images and source files may be large and may sync later than structured events.

The system must retain:

- local original;
- durable upload state;
- content hash;
- relationship to the event;
- derived measurements; and
- confirmation when remote storage completes.

A low-resolution display copy must never be mistaken for the preserved original.

The user should not lose the only target photo because the phone lost signal after capture.

---

## 57. Multi-Device Behavior

Data lives server-side for ownership, backup, and multi-device use, but the product remains locally operable.

Each device should maintain the subset of rifle history and engine data required for expected offline use. At minimum, recently used and explicitly retained rifles should be available offline.

When a user with fifty rifles plans to use an infrequently accessed rifle where signal is absent, PROVEN should provide a low-friction way to ensure its current record is available locally. This must not require the user to understand caching.

---

# Part IX — Data Ownership, Privacy, and Trust

## 58. The Shooter Owns the Record

The user owns the data they create and the copy of the rifle history transferred to them.

PROVEN must provide export of:

- rifle identities and build data;
- complete event history;
- shot strings and velocity data;
- target and source artifacts;
- maintenance and cleaning history;
- configuration history;
- ammunition/load/lot history;
- environment records;
- truing observations and corrections;
- derived solutions and provenance; and
- certificates.

A spreadsheet export is required. A complete machine-readable export and attachment package should also be supported so ownership is meaningful rather than cosmetic.

---

## 59. Private by Default

Rifle ownership, serial information, precise range locations, hunting locations, ammunition usage, and performance history are sensitive.

The product must default to private.

It must not:

- expose precise locations publicly;
- share customer range history with Workhorse by default;
- sell or repurpose rifle data without explicit informed consent;
- use private data to create public crowd claims in v1;
- make a scannable rifle identifier reveal history without authorization; or
- hide data-sharing choices inside general terms.

Location should be collected only for clear product value and retained with appropriate user control.

---

## 60. Manufacturer and Customer Records Must Have Clear Boundaries

Workhorse may retain its own manufacturing and quality records under its own obligations. The customer receives an authorized copy as the rifle's starting history.

Customer activity after delivery should remain private unless the customer explicitly shares it for support, warranty, service, resale, or another defined purpose.

The product must distinguish:

- Workhorse's source factory record;
- the customer's owned continuation; and
- any support copy intentionally shared back to Workhorse.

---

## 61. Complete Account Deletion

Account deletion must remove the customer's server-side account data and associated private copies as promised by the product.

The system must explain any narrow exception that is legally or operationally required, such as a separate manufacturer's retained factory QA record, without implying that private customer shooting history is retained.

Deletion behavior must be testable, documented, and complete across primary storage, derived projections, and ordinary backups according to a defined retention policy.

---

## 62. Derived Intelligence Cannot Escape Its Evidence

A diagnostic conclusion, trend, or anomaly is part of the user's rifle record and must be exportable and deletable with the underlying account.

PROVEN must not create opaque profiles whose conclusions cannot be traced to source events.

The user must be able to understand, at an appropriate level, why PROVEN believes something changed.

---

# Part X — Analysis, Feedback, and Troubleshooting

## 63. PROVEN Must Remember Before It Diagnoses

The product's long-term power comes from comparison against the rifle's own documented history.

After enough comparable evidence, PROVEN should help distinguish:

- normal shot-to-shot variation;
- normal group-to-group variation;
- expected cold-bore behavior;
- expected post-cleaning behavior;
- ammunition-lot differences;
- suppressor-on versus suppressor-off behavior;
- gradual velocity drift with barrel age;
- zero drift;
- abrupt step changes; and
- results that are statistically unusual enough to justify checking hardware or protocol.

The product must not rush to diagnosis before the record supports it.

When evidence is sparse, the honest conclusion is:

> “There is not enough comparable data yet.”

That is better than false certainty.

---

## 64. The Comparison Unit Must Be Like-for-Like

A rifle's performance depends on more than rifle identity.

Analysis should compare observations with compatible context, including when known:

- barrel epoch and round count;
- optic/mount state;
- muzzle-device state;
- ammunition product and lot;
- zero state;
- rounds since cleaning;
- cold/warm bore sequence;
- shooter;
- shooting support or protocol;
- environmental range; and
- target distance and measurement method.

The system may broaden a comparison when data is sparse, but it must represent the increased uncertainty.

It must not call a new ammunition lot “worse” merely because it was shot under a materially different protocol.

---

## 65. Statistical Honesty Governs All Feedback

PROVEN must distinguish:

- one observation;
- a small sample;
- an emerging pattern;
- a stable baseline; and
- a statistically significant departure from that baseline.

The precise statistical methods belong to tested engines and future validated analysis modules. The constitutional requirements are:

- show sample basis;
- avoid false precision;
- account for measurement uncertainty;
- do not treat omitted misses as nonexistent;
- do not claim causation from correlation;
- do not compare incompatible configurations without warning;
- avoid overfitting many variables to a small sample; and
- explain confidence in shooter language.

Examples of honest language:

- “Today's group is within this rifle's normal range.”
- “This is the third group showing the same vertical shift.”
- “Velocity is lower than the prior lot, but the sample is only four shots.”
- “This change is larger than 98% of comparable groups in this rifle's history.”
- “The result is unusual. Check zero, mount, and fasteners before changing the ballistic solution.”

---

## 66. Diagnose Change Shape Before Naming a Cause

Different failure shapes imply different classes of explanation:

- **gradual trend** may suggest barrel wear, fouling accumulation, or environmental/lot drift;
- **abrupt step change** may suggest a configuration change, zero shift, mount issue, or measurement mismatch;
- **temporary post-cleaning shift** may resolve after fouling shots;
- **higher dispersion without center shift** may suggest ammunition, shooter, support, or hardware consistency;
- **center shift with stable dispersion** may suggest zero or configuration change;
- **velocity shift with stable group center** may affect distant dope before close zero;
- **long-range vertical error with stable zero and velocity** may point toward drag, tracking, distance, or atmosphere applicability.

PROVEN should first describe the observed pattern. It should then offer the smallest useful diagnostic recommendation.

It must not declare “a screw came loose” as fact unless that was actually observed and recorded.

---

## 67. Recommendations Must Be Prioritized

A shooter who sees an unusual result does not need a list of twelve possible causes.

PROVEN should rank the next check by:

1. probability given the evidence;
2. impact on accuracy;
3. ease and safety of verification;
4. reversibility; and
5. whether the check protects the integrity of later data.

The default should be one recommended next action, with deeper alternatives available on demand.

Examples:

- confirm zero before retruing;
- verify the ammunition lot;
- inspect scope mount and action fasteners;
- fire a larger chronograph sample;
- record a comparable post-cleaning group;
- repeat the observation at an appropriate truing distance.

The product should not encourage users to “tune the math” around a hardware problem.

---

## 68. New Evidence Can Confirm or Challenge Prior Truth

PROVEN is not a one-way progress system.

When new evidence conflicts with the current solution, the system must:

- preserve the new evidence;
- assess whether the context is compatible;
- check zero and configuration prerequisites;
- distinguish random variation from systematic error;
- avoid immediately overwriting a stable solution with one outlier;
- explain the conflict; and
- update, lower confidence, or recommend verification according to evidence.

PROVEN TO may remain unchanged, rise, or fall. The metric serves truth, not user encouragement.

---

## 69. Output Must Be Actionable in the Shooter's Terms

The product should translate analysis into consequences the shooter recognizes.

Prefer:

> “Your 600-yard dial changes from 4.0 to 3.8 mil.”

over:

> “The optimizer reduced effective muzzle velocity residual by 4.7%.”

Prefer:

> “This lot averages 36 fps slower than your previous lot.”

with sample basis, over a generic “performance changed” warning.

Prefer:

> “Your zero is no longer supported after the scope was remounted.”

rather than silently reducing a confidence score.

Expert detail may expose the deeper calculation, but ordinary feedback must connect data to shooting decisions.

---

## 70. PROVEN Should Identify the Next Highest-Value Fact

Because the system knows what is missing, it can identify which next observation would most improve trust.

Examples:

- confirm zero;
- import a larger velocity string;
- verify scope tracking;
- shoot at a distance appropriate for velocity truing;
- obtain a transonic observation for drag truing;
- capture direction of fire at a recurring 1,000-yard target;
- identify the current ammunition lot.

The recommendation must be contextual and limited. It should not become a checklist that makes the user feel behind.

The product should distinguish:

- **required before a calculation can be trusted;**
- **useful for more confidence;** and
- **optional expert detail.**

---

# Part XI — Cognitive Load and Friction Rules

## 71. Simplicity Means Fewer Demands, Not Less Capability

A simple product can preserve hundreds of variables if the system acquires, carries, and organizes them without asking the user to manage them.

Therefore, do not simplify by deleting valuable evidence or hiding uncertainty.

Simplify by:

- reducing repeated input;
- accepting evidence in its natural form;
- resolving context automatically;
- carrying state forward;
- asking only for deltas;
- delaying nonessential questions;
- using defaults with visible provenance;
- performing conversions automatically;
- giving one clear next action; and
- making expert detail available without making it mandatory.

---

## 72. The User Must Never Reconstruct the Past to Record the Present

PROVEN should never require the shooter to answer a chain of historical questions before preserving today's evidence.

If prior round count, cleaning date, or ammunition lot is unknown, the system should:

- record today's known facts;
- mark prior state honestly;
- begin an exact or minimum history from the current point; and
- improve continuity going forward.

Unknown history is not failure. Failing to begin because history is incomplete is failure.

---

## 73. Defaults Must Be Smart, Visible, and Reversible

A default should reduce effort without hiding its assumption.

Good defaults:

- last-known suppressor state;
- current ammunition lot;
- preferred units;
- recurring target distance;
- expected dial from the current solution;
- account owner as shooter;
- recent rifle context when unambiguous.

A user must be able to correct a default easily. The correction should improve future inference.

A default must not become an unchangeable hidden rule.

---

## 74. Do Not Ask for Precision the Observation Does Not Have

If the shooter knows an impact was “about two tenths high,” do not force a hundredth-mil value.

If cleaning occurred “sometime after the last trip,” accept an approximate interval.

If prior round count is near 250 but not exact, preserve an estimate rather than forcing 250 as exact.

False precision is more damaging than honest approximation.

---

## 75. The Product Must Not Punish Incomplete Capture

A partial observation should remain useful.

The system may say:

- saved, but missing dial;
- saved, but target distance is unknown;
- saved as visual evidence only;
- saved, but lot comparison is unavailable;
- saved, but not eligible for truing.

It must not:

- erase the work;
- block all progress;
- require unrelated fields;
- turn an incomplete observation into a completed guess; or
- make the user restart.

---

## 76. Every Interaction Needs a Friction Budget

Future teams must define an interaction budget for each common task.

The following are constitutional targets, subject to usability testing:

| Common task | Target conscious interaction |
|---|---|
| Record a cleaning for the current rifle | A few seconds; one fact, no form |
| Confirm a persisted suppressor or ammunition state | One recognition decision when genuinely needed |
| Import a normal Garmin string | Share/import plus no more than one or two consequential confirmations |
| Capture a calibrated paper target | Take/select photo; corrections only if recognition fails |
| Record a long-range steel observation | Known context plus the actual dial difference and vertical result; normally well under 30 seconds |
| Begin using a one-rifle account | No repeated rifle selection |
| Use one rifle from a fifty-rifle collection | Recognition or scan, not browsing through all fifty |
| Workhorse first use | Claim rifle and confirm only material post-factory changes |
| New generic rifle to first trued correction | Under three minutes of total app interaction, unaided, as required by the Product Definition |

A team that exceeds a budget must first remove questions or automate acquisition before redesigning visual presentation.

---

## 77. Measure the Right Product Metrics

Recommended product metrics include:

- median conscious input time per shooting event cluster;
- percentage of velocity shots imported rather than typed;
- percentage of target photos successfully associated;
- percentage of stable context carried forward without correction;
- rate of wrong-rifle association;
- percentage of events with explicit provenance;
- percentage of partial observations preserved;
- number of repeated questions per rifle;
- percentage of new users reaching confirmed zero and first correction;
- percentage of offline events synchronized without user intervention;
- number of data-loss incidents, which must remain zero;
- percentage of conclusions traceable to source evidence; and
- user correction rate for automatic inference.

Avoid using time-in-app or number of interactions as positive engagement goals. Lower may be better.

---

## 78. New Features Must Pay Rent

Every proposed required input, feature, prompt, or workflow must answer:

1. What truth does it add?
2. What decision does that truth improve?
3. Can the same truth be acquired automatically, imported, inferred, or reused?
4. How often will the user encounter it?
5. What is the cost in attention?
6. What happens if the user skips it?
7. Does it create immediate value?
8. Can it be deferred until relevant?
9. Does it preserve offline operation?
10. Can it contaminate history if inferred incorrectly?

A feature that adds administrative work without increasing ballistic trust, diagnostic value, or data continuity should be rejected.

---

# Part XII — Ideal User Journeys

These journeys describe system behavior and mental effort. They are not screen specifications.

## 79. Journey A — Workhorse Customer Receives a Rifle

### Starting condition

The rifle has approximately fifty factory-documented rounds and a Certificate of Performance.

### Ideal experience

1. The customer securely claims the rifle from its certificate or physical identifier.
2. PROVEN loads the factory birth record locally, including source evidence and current drop solution.
3. The customer immediately sees that the rifle is not an empty profile: factory targets, velocity string, ammunition lot, zero, truing, and PROVEN TO state already exist.
4. PROVEN identifies only changes that matter after shipment, such as a removed scope, different suppressor, or different ammunition.
5. If nothing material changed, the customer is ready to use the current data.
6. The first customer range evidence becomes the next event in the same history.

### What the customer does not do

- re-enter serial or build data;
- type factory muzzle velocity;
- create a load from scratch;
- recreate a zero;
- upload every factory target manually;
- decide how the rifle was trued; or
- complete a tutorial before seeing value.

---

## 80. Journey B — Generic Rifle With Incomplete History

### Starting condition

The shooter owns a rifle with approximately 250 prior rounds but cannot remember the exact cleaning date, round count, or last zero.

### Ideal experience

1. The shooter creates only enough rifle identity to recognize it later.
2. PROVEN accepts an approximate prior round count and marks it estimated.
3. The shooter records today's target and Garmin data without reconstructing the past.
4. PROVEN establishes today's known configuration, ammunition, and zero evidence.
5. From this point forward, round count and maintenance continuity become increasingly exact.
6. The system states what is known and what remains approximate.

### Constitutional result

The absence of perfect history does not prevent perfect continuity beginning today.

---

## 81. Journey C — Ordinary Range Day With Garmin Xero

### Starting condition

The rifle, current ammunition lot, suppressor state, and recurring range are already known.

### Ideal experience

1. The shooter uses the Garmin normally.
2. The shooter shares or imports the Garmin export.
3. PROVEN recognizes the mapped profile, time, place, current rifle, and ammunition.
4. The original file is saved locally and parsed.
5. Duplicate shots are prevented.
6. Velocity statistics and round count update immediately.
7. If a target photograph exists, it is connected by time and context.
8. The shooter is asked nothing unless the association is genuinely ambiguous or a material change is detected.
9. PROVEN reports the practical result and then gets out of the way.

---

## 82. Journey D — Zero Confirmation From a Paper Target

### Starting condition

The shooter has a PROVEN calibrated target at a known distance.

### Ideal experience

1. The rifle and current configuration are already known.
2. The shooter takes one target photograph.
3. PROVEN corrects geometry, finds scale, proposes bullet holes, and calculates the group.
4. The shooter corrects only any recognition error.
5. The group center relative to point of aim becomes the zero observation.
6. PROVEN records shot count, target, image, measurement method, distance, and uncertainty.
7. Zero is confirmed only if the evidence meets doctrine.
8. The user immediately sees what the confirmed zero unlocks.

### Fallback

If image measurement fails, manual hole marking or typed group/offset preserves the same event without starting over.

---

## 83. Journey E — Truing on Painted Steel at 900–1,000 Yards

### Starting condition

Zero is confirmed. Garmin velocity data exists. The shooter is at a recurring long-range target.

### Ideal experience

1. PROVEN recognizes the rifle, load, target distance, target direction, likely atmosphere, and predicted dial.
2. The shooter fires a string and observes the center of impacts.
3. The shooter states only the actual dial if different and the vertical result in natural units.
4. PROVEN connects the observation to the shot string and conditions.
5. The truing engine silently routes the observation to velocity or drag according to doctrine.
6. The system saves the observation even if it cannot use it.
7. The shooter sees the practical dial change and confidence.
8. PROVEN TO changes only if warranted.

### What the shooter does not do

- choose “velocity true” versus “BC true”;
- calculate correction direction;
- convert target fractions to angular units;
- re-enter stable target geometry;
- type weather the phone can estimate; or
- lose the observation because one optional field is absent.

---

## 84. Journey F — Cleaning the Rifle at Home

### Ideal experience

1. PROVEN already knows the likely rifle or allows immediate recognition.
2. The owner records that it was cleaned.
3. Time and current round count attach automatically.
4. Rounds since cleaning reset in the derived state.
5. Optional details remain optional.
6. The next range visit automatically knows the rifle is at the beginning of a post-cleaning interval.

The event should require less effort than writing a note the user will later lose.

---

## 85. Journey G — New Ammunition Lot

### Ideal experience

1. The shooter photographs the box and lot label once.
2. PROVEN proposes product, cartridge, bullet weight, and lot.
3. The shooter confirms only ambiguous information.
4. The new lot becomes current for that rifle/load.
5. Garmin strings and targets automatically attach to the new lot.
6. PROVEN compares the lot only after enough compatible evidence exists.

The shooter does not transcribe the box or rebuild the load.

---

## 86. Journey H — Fifty-Rifle Collector

### Starting condition

The owner has fifty rifles, several in the same cartridge.

### Ideal experience

1. The shooter identifies today's rifle through a physical scan, recent context, or quick recognition.
2. PROVEN loads the rifle's current state locally.
3. The shooter records events exactly as a one-rifle owner would.
4. A second rifle can become active during the same range visit without formal session administration.
5. Garmin profile mappings and physical identity prevent cross-contamination.
6. If two rifles remain plausible, PROVEN asks one confirmation before manual effort.

The owner never scrolls through all fifty as a required first step.

---

## 87. Journey I — Unexpected Group Shift

### Starting condition

A rifle has a strong documented baseline. Today's group is centered materially away from normal.

### Ideal experience

1. PROVEN saves the target and compares it with compatible prior groups.
2. The system describes the change shape: abrupt center shift with otherwise normal dispersion.
3. It checks whether scope, mount, suppressor, ammunition, zero, cleaning, or environment changed.
4. It does not immediately retruth the ballistic solution.
5. It recommends the highest-value verification, such as confirming zero and checking the mount/fasteners.
6. If a hardware issue is later found, that maintenance event becomes part of the history.
7. Future analysis can connect the anomaly and repair without rewriting either.

---

## 88. Journey J — Offline Range With Later Enrichment

### Ideal experience

1. The shooter works without signal.
2. Rifle state, target capture, Garmin import, calculations, and observations function locally.
3. Every event is durably saved with local status.
4. Time and location are preserved.
5. When connectivity returns, artifacts and events synchronize automatically.
6. Historical weather may be attached as estimated context.
7. If another device added independent data, both histories merge without loss.
8. The user is asked only about genuine conflicts affecting truth.

---

## 89. Journey K — Importing Forgotten Evidence Later

### Starting condition

The shooter discovers target photographs and a Garmin file days or months later.

### Ideal experience

1. PROVEN preserves the artifacts immediately.
2. Metadata proposes time, place, rifle, and event association.
3. Prior rifle state at that historical time—not today's state—is used for inference.
4. The user confirms only unresolved high-stakes context.
5. The historical event is inserted chronologically without rewriting later history.
6. Derived trends and solutions are recomputed if appropriate.

Late evidence should improve the record, not be rejected because it was not captured live.

---

# Part XIII — Forbidden Anti-Patterns

## 90. Setup Before Value

**Forbidden:** requiring a complete rifle build, account profile, ammunition catalog, unit configuration, or tutorial before the user can preserve the first useful fact.

**Required alternative:** accept minimum identity, capture the evidence, and enrich only when needed.

---

## 91. User-Managed Sessions

**Forbidden:** making the shooter create, name, start, pause, resume, and close a range session before data can be recorded correctly.

**Required alternative:** infer event clusters and maintain an active context. Allow explicit correction without making administration mandatory.

---

## 92. Repeated Full-State Forms

**Forbidden:** asking for rifle, load, lot, suppressor, zero, weather, and scope state on every range visit.

**Required alternative:** carry forward the last-known state and ask only about changes or real ambiguity.

---

## 93. Asking the User What the Device Already Knows

**Forbidden:** routine manual entry of timestamps, location, imported velocities, photo metadata, stable target distance, or previously mapped rifle identity.

**Required alternative:** automatic capture, import, inference, or reuse.

---

## 94. All-or-Nothing Validation

**Forbidden:** refusing to save an observation because one field is missing or analytically unusable.

**Required alternative:** preserve the evidence, label what is missing, and separate capture validity from analytic eligibility.

---

## 95. Silent Data Loss

**Forbidden:** clearing input after navigation, dropping an attachment after failed upload, discarding an out-of-range observation, overwriting a correction, or losing offline work.

There is no acceptable alternative except preservation.

---

## 96. Silent Inference as Fact

**Forbidden:** presenting reused or inferred values as measured facts.

Examples include:

- assumed ammunition lot shown as confirmed;
- weather-service atmosphere shown as onsite measured;
- predicted dial stored as actual dial without confirmation;
- inferred rifle association treated as explicit when ambiguity was material.

**Required alternative:** retain provenance and confidence.

---

## 97. Flattened Provenance

**Forbidden:** storing only one final muzzle velocity, BC, zero, or group size without preserving how it was obtained.

**Required alternative:** retain source artifact, event history, method, sample, applicability, and solution version.

---

## 98. Blending Incompatible Histories

**Forbidden:** pooling data across a new barrel, different suppressor state, different ammunition product, remounted optic, or invalidated zero as though nothing changed.

**Required alternative:** configuration epochs, compatibility rules, and scoped conclusions.

---

## 99. Making the Shooter Choose the Math

**Forbidden:** asking the user to choose velocity truing, BC truing, DSF truing, supersonic method, or transonic method as part of ordinary capture.

**Required alternative:** route observations through tested doctrine silently and explain the result afterward.

---

## 100. Tuning Around Bad Hardware

**Forbidden:** immediately changing ballistic values to absorb an abrupt unexplained shift before checking zero, configuration, distance, atmosphere, and hardware.

**Required alternative:** diagnose prerequisites and change shape first.

---

## 101. Farthest Hit as Proof

**Forbidden:** setting PROVEN TO to the farthest successful impact or showing the maximum ever achieved by any configuration.

**Required alternative:** calculate the metric from compatible verified evidence under doctrine.

---

## 102. Gamifying Trust

**Forbidden:** streaks, badges, celebratory inflation, or pressure to make PROVEN TO rise when evidence does not justify it.

**Required alternative:** treat PROVEN TO as an honesty statement, including the possibility of no change or a justified decrease.

---

## 103. Engagement-Centered Product Design

**Forbidden:** adding prompts, notifications, dashboards, or recurring tasks primarily to increase app opens or time spent.

**Required alternative:** reduce attention while increasing captured truth.

---

## 104. Dashboard Before Capture

**Forbidden:** prioritizing charts and historical analysis before the capture, provenance, offline, and association foundations are reliable.

**Required alternative:** build the memory correctly before decorating it.

---

## 105. Expert Detail in the Default Path

**Forbidden:** forcing ordinary users through SD/ES settings, solver models, advanced environmental fields, target calibration details, or solution internals.

**Required alternative:** progressive disclosure tied to task and curiosity.

---

## 106. Permanent Basic/Expert Modes

**Forbidden:** requiring a user to choose a permanent mode that hides needed truth from one user or exposes unnecessary complexity to another.

**Required alternative:** contextual progressive disclosure with the same underlying record.

---

## 107. Integration Dependency

**Forbidden:** making core capture impossible when Garmin, weather, camera recognition, speech, or another service is unavailable.

**Required alternative:** provide a manual, offline fallback that preserves the same canonical fact.

---

## 108. Collector Administration

**Forbidden:** making a fifty-rifle owner build folders, tags, categories, and complete profiles before using the product.

**Required alternative:** recognition, search, scan, recent context, and gradual enrichment.

---

## 109. Notification Noise

**Forbidden:** repeatedly reminding the user to complete low-value metadata, clean on a generic schedule, or interact with the product for engagement.

**Required alternative:** surface a recommendation only when it is evidence-based, contextual, and materially useful.

---

## 110. Unexplained Confidence Scores

**Forbidden:** presenting a generic percentage that combines provenance, sample size, recency, and applicability without explaining what it means.

**Required alternative:** simple confidence language with accessible supporting reasons.

---

## 111. Destructive Last-Write-Wins Sync

**Forbidden:** resolving multi-device conflicts by silently replacing whichever event arrived first.

**Required alternative:** preserve both facts/corrections and resolve only the consequential conflict.

---

## 112. Replacing Evidence With Interpretation

**Forbidden:** keeping only detected bullet holes, calculated group size, parsed velocity rows, or a thumbnail while discarding the original file or image.

**Required alternative:** preserve original evidence and derive interpretations separately.

---

## 113. Pretending Approximation Is Failure

**Forbidden:** forcing exact dates, round counts, impact values, or historical conditions when the user only knows an approximation.

**Required alternative:** accept uncertainty explicitly and improve the record from that point forward.

---

## 114. Feature Creep Into v1

**Forbidden in v1:** AI chat assistant, crowd/aggregate data, social features, load-development recipes/ladder workflows, broad hardware integrations beyond chronograph file import, or mobile admin tooling.

**Required alternative:** finish the core evidence-to-truth loop and effortless capture foundation.

---

# Part XIV — Non-Negotiable Design Commandments

## 115. The Commandments

1. **The shooter does not maintain a database. PROVEN does.**
2. **Ask only for what changed or what only the shooter can know.**
3. **Automatic capture outranks import; import outranks inference; inference outranks reuse; reuse outranks confirmation; confirmation outranks manual entry.**
4. **Do not ask a question merely because a field exists.**
5. **Manual effort requires the correct context before the effort begins.**
6. **Passive evidence is preserved before association is resolved.**
7. **No core workflow requires a user-created session.**
8. **The last-known rifle state carries forward until evidence of change.**
9. **Stable facts are entered once.**
10. **Every meaningful fact has provenance, applicability, and confidence.**
11. **Inference may simplify capture but may never masquerade as measurement.**
12. **Original source artifacts are permanent evidence, not disposable upload material.**
13. **Facts are append-only; corrections supersede; history is never silently rewritten.**
14. **Capture validity is separate from analytic eligibility.**
15. **Nothing entered or imported is ever lost.**
16. **Offline is normal, not degraded.**
17. **Local durable save precedes server synchronization.**
18. **Every import is idempotent.**
19. **Every accepted correction is reversible.**
20. **Every derived output traces to source evidence and a versioned engine.**
21. **Existing tested engines remain the mathematical source of truth.**
22. **Zero is the foundation; PROVEN does not true around an unconfirmed zero.**
23. **Velocity and drag truing remain separate according to doctrine.**
24. **The shooter never chooses the truing math.**
25. **A hit is evidence, not automatic proof.**
26. **PROVEN TO is scoped to a compatible rifle configuration and ammunition state.**
27. **PROVEN TO may fall when truth requires it.**
28. **Configuration changes preserve history but invalidate incompatible conclusions.**
29. **The system compares like with like and states when it cannot.**
30. **The system describes statistical uncertainty rather than hiding it.**
31. **The system recommends one highest-value next action before listing alternatives.**
32. **The product must never tune math around an unresolved hardware or zero problem.**
33. **A partial truth is better than a fabricated complete record.**
34. **Unknown is a valid state.**
35. **Approximate is a valid state when labeled.**
36. **The user never performs unit conversion for the software.**
37. **The ordinary path uses shooter language, not software language.**
38. **Complexity appears because the task requires it, not because a mode was selected.**
39. **One-rifle ownership requires no repeated rifle selection.**
40. **Fifty-rifle ownership requires recognition, not collection administration.**
41. **A Workhorse rifle begins with its factory history intact.**
42. **Factory claims state exactly what was measured versus typed or estimated.**
43. **Customer history remains private by default.**
44. **The shooter owns and can export the complete record.**
45. **The product's success is measured by captured truth per second of attention—not engagement.**
46. **Every new required interaction must justify why the system cannot do the work.**
47. **The phone should not become the main activity at the range.**
48. **The app should reward capture immediately, then disappear.**
49. **The 60-year-old low-tech expert must succeed without instruction.**
50. **The 25-year-old data expert must be able to inspect everything without burdening the 60-year-old.**

These commandments are acceptance criteria, not aspirations.

---

# Part XV — Implementation Architecture for Codex/Claude Code

## 116. Architectural Components

A compliant implementation should separate the following responsibilities:

### 116.1 Capture adapters

Receive raw input from:

- manual statements;
- camera;
- file share/import;
- Garmin exports;
- certificate packages;
- local device metadata;
- future authorized integrations.

Capture adapters preserve first. They do not decide final truth.

### 116.2 Raw evidence vault

Stores original artifacts, hashes, metadata, local durability state, and upload state.

### 116.3 Normalization layer

Uses existing tested import/calibration logic to convert source-specific artifacts into canonical proposed facts while retaining links to the original.

### 116.4 Context resolver

Scores possible associations among:

- account;
- rifle;
- configuration epoch;
- ammunition/load/lot;
- event cluster;
- target/place;
- shooter; and
- environment.

It chooses automatic association only within defined risk thresholds and creates one-question resolution when needed.

### 116.5 Immutable event store

Persists canonical facts, corrections, exclusions, applicability, and provenance locally and in Supabase/Postgres.

### 116.6 Projection engine

Builds current rifle state, round counts, cleaning intervals, current load, current zero, solution state, and other fast views from events.

### 116.7 Existing mathematical engines

The tested solver, truing engine, velocity statistics, import logic, target calibration, and PROVEN TO rollup remain authoritative. New interface code must call them rather than reimplement them.

### 116.8 Diagnostic analysis layer

Operates on compatible event sets and must expose evidence basis and uncertainty. It must remain separable from core ballistic truth.

### 116.9 Sync engine

Replicates local events and attachments idempotently, detects conflicts, and never uses synchronization failure as a reason to discard local data.

### 116.10 Output projections

Produce:

- current drop chart;
- rangefinder-ready trued values;
- PROVEN TO statement;
- certificate;
- rifle history;
- diagnostic feedback; and
- export packages.

Outputs are projections, not independent records.

---

## 117. Canonical Event Envelope

Every canonical event should include, directly or by reference:

- unique event ID generated before sync;
- event type and schema version;
- account/ownership scope;
- rifle ID when resolved;
- applicable configuration IDs/epochs;
- ammunition/load/lot applicability;
- event time and time confidence;
- location and location precision/source when retained;
- shooter/operator when relevant;
- raw evidence references;
- normalized value(s) and original units/expression;
- provenance class;
- confidence/uncertainty metadata;
- source device/import identity;
- creation device and local sequence;
- supersedes/excludes relationships;
- analytic eligibility state and reason;
- synchronization state; and
- audit timestamps.

Not every event needs every field. The envelope must support them without forcing the user to provide them.

---

## 118. Evidence Association State Machine

An imported or captured artifact should move through explicit states such as:

1. **captured locally**;
2. **source preserved**;
3. **normalized or awaiting parser**;
4. **context proposed**;
5. **context resolved**;
6. **canonical events committed**;
7. **analysis evaluated**;
8. **synchronized**; and
9. **superseded/excluded if corrected.**

Failure at a later state must not reverse an earlier durable state.

A parser failure leaves the source preserved.

An association failure leaves the normalized proposal or source unresolved.

An analytic rejection leaves the canonical historical observation intact.

---

## 119. Context Resolution Risk Classes

Not every inference has the same cost.

### 119.1 High-risk identity/applicability facts

Examples:

- rifle identity;
- barrel epoch;
- ammunition product/load;
- suppressor/muzzle state when zero or solution depends on it;
- optic/zero applicability;
- actual dial used.

Wrong inference can contaminate the record or produce wrong dope. Require high confidence or confirmation.

### 119.2 Medium-risk physics/context facts

Examples:

- ammunition lot;
- target distance;
- environment source;
- direction of fire;
- shooter identity for diagnostics.

Inference may be proposed, but the system must retain source and uncertainty.

### 119.3 Low-risk organizational facts

Examples:

- automatic range-visit grouping;
- display ordering;
- suggested nickname;
- nonanalytic photo grouping.

These may be inferred more freely because correction is low cost.

The context resolver must use risk, not only confidence, when deciding whether to ask.

---

## 120. Compatibility and Invalidation Service

Configuration changes must produce deterministic applicability outcomes.

The service should answer questions such as:

- Does this zero still apply?
- Can this velocity string be pooled with the current lot?
- Does the prior truing correction apply with this suppressor state?
- Does this scope tracking test remain relevant after remounting?
- Which performance baseline is comparable?
- Should PROVEN TO be reduced?

These rules must be centralized and tested. They must not be re-created independently in interface components.

---

## 121. Solution Versioning

Every ballistic solution must be immutable and versioned.

A solution version should identify:

- rifle/configuration/load scope;
- zero source;
- velocity source and sample;
- drag/BC/DSF source;
- atmosphere assumptions or defaults;
- scope tracking state;
- observations used and excluded;
- engine and data-model versions;
- output table;
- PROVEN TO result; and
- predecessor/supersession relationship.

The current solution is a projection pointing to one version. Undo changes the projection through a new event; it does not edit history.

---

## 122. No Math in Interface Components

UI or interaction components must not implement independent ballistic, truing, velocity-statistics, target-calibration, or PROVEN TO calculations.

They may format values and collect facts. They must call tested engines through defined interfaces.

This prevents subtle divergence between desktop, PWA, factory, and future integrations.

---

## 123. Idempotency and Duplicate Protection

Every import and event submission must tolerate retries.

Duplicate detection should use:

- source file hash;
- stable source IDs when available;
- event IDs;
- shot timestamps and sequence;
- attachment hashes;
- device/local operation IDs; and
- user-confirmed merge/exclusion.

The system should preserve the duplicate artifact when necessary for audit while excluding duplicate analytic contribution.

---

## 124. Background Work Must Never Hide Required Truth

The product may perform normalization, weather enrichment, target analysis, or synchronization after the immediate capture.

However:

- local capture status must be truthful;
- the user must not believe an analysis is complete when it is pending;
- a pending result must not block unrelated work;
- failures must retain evidence and offer a fallback; and
- later enrichment must not overwrite a stronger source.

---

## 125. Accessibility and Resilience Are Architecture, Not Polish

Large hit areas, readable contrast, keyboard/assistive support, resumable input, and offline behavior must be designed into components and state management from the beginning.

They cannot be reliably added after workflows assume precise gestures, constant connectivity, or one uninterrupted form submission.

---

# Part XVI — Constitutional Acceptance Tests

No design or implementation is complete because it looks clean or passes unit tests. It must pass realistic behavioral tests derived from the constitution.

## 126. Test A — Roy's First Contact

**User:** 60-year-old experienced hunter, one-finger typist, no instructions.  
**Starting state:** one generic rifle, factory ammunition, no PROVEN history.

**Pass conditions:**

- He can create enough rifle identity to avoid confusion without completing a full build sheet.
- He can record or import velocity without typing every shot.
- He can preserve a target and confirm zero using shooter vocabulary.
- He can record a long-range high/low observation without choosing a truing method.
- He reaches the first trued correction within the Product Definition's three-minute interaction target.
- He never encounters required software vocabulary.
- No entered work is lost when he leaves an interaction halfway through.

**Automatic failure:** any required tutorial, multi-page setup, unexplained mode choice, or mandatory full-state form.

---

## 127. Test B — Expert Depth Without Default Complexity

**User:** 25-year-old data-driven precision shooter.

**Pass conditions:**

- The same captured events expose full shot strings, SD/ES, source evidence, target measurement, truing detail, and export.
- Expert inspection does not require a separate duplicate rifle record.
- Advanced detail remains out of the ordinary path until requested or contextually relevant.
- Corrections and exclusions are auditable and reversible.

**Automatic failure:** the expert must use a different “advanced mode” that changes the underlying truth model, or the ordinary user must see all expert controls by default.

---

## 128. Test C — Garmin Import With Known Context

**Starting state:** mapped Garmin profile, known current rifle, ammunition lot, and range.

**Pass conditions:**

- One import/share action preserves the original file locally.
- All shots are parsed through the tested import engine.
- No rifle-selection question appears when context is unambiguous.
- Duplicate import does not duplicate shots or round count.
- Statistics and derived state update offline.
- Provenance states device-imported.

**Automatic failure:** individual velocity entry is required, network access is required to save, or re-import doubles the count.

---

## 129. Test D — Garmin Import With Ambiguous Context

**Starting state:** two plausible rifles use similar ammunition and no strong mapping exists.

**Pass conditions:**

- The file is preserved before association.
- The system asks one rifle-recognition question before the user performs any manual editing.
- If the user does not answer, the file remains unresolved and recoverable.
- No current rifle receives the velocities silently.

**Automatic failure:** evidence is discarded, the wrong rifle is silently chosen, or the user must re-import after resolving context.

---

## 130. Test E — Painted Steel Truing

**Starting state:** confirmed zero, current solution, recurring 1,000-yard target, offline.

**Pass conditions:**

- Target distance and azimuth are reused.
- Predicted dial is available locally.
- The shooter can record actual dial and vertical impact in natural units.
- The observation is connected to the relevant shot string and atmosphere source.
- The tested truing engine routes the observation without user method selection.
- If analytically ineligible, the observation remains stored with a clear reason.
- The practical dial consequence is shown.

**Automatic failure:** paper-target photography is required, the shooter chooses BC vs velocity truing, or an ineligible observation is erased.

---

## 131. Test F — Configuration Change

**Scenario:** the user removes and remounts the scope.

**Pass conditions:**

- Prior history remains intact.
- Zero applicability changes according to centralized rules.
- Scope tracking evidence is handled separately according to applicability.
- PROVEN TO is recalculated honestly.
- The user is told what must be reconfirmed in shooter language.
- The user does not decide which historical records to invalidate.

**Automatic failure:** prior data is deleted, old zero remains silently current, or the system creates an unrelated duplicate rifle.

---

## 132. Test G — One Rifle

**Pass conditions:**

- The owner is not repeatedly asked to choose the only rifle.
- All ordinary events use the current rifle context unless conflicting evidence appears.
- The product remains safe against importing evidence clearly belonging elsewhere.

**Automatic failure:** every interaction begins with collection browsing.

---

## 133. Test H — Fifty Rifles

**Pass conditions:**

- A rifle can be recognized by scan, recent context, search, or mapped source.
- The owner is never required to scroll through all fifty.
- Multiple rifles can be used in one range visit without session administration.
- Similar rifles do not receive silent cross-associated evidence.
- The owner may begin using one rifle without completing the other forty-nine.

**Automatic failure:** mandatory folder taxonomy, complete collection setup, or repeated full-profile entry.

---

## 134. Test I — Offline Failure Injection

During target capture and Garmin import, simulate:

- signal loss;
- app close;
- browser refresh;
- device lock;
- server timeout;
- expired authentication;
- attachment upload failure; and
- retry after restart.

**Pass conditions:**

- Every source artifact and entered fact remains locally durable.
- The user resumes without reconstructing work.
- Sync retries do not create duplicates.
- Local and remote status remain truthful.

**Automatic failure:** any user-entered fact or only copy of an artifact is lost.

---

## 135. Test J — Provenance Integrity

Create equivalent-looking velocity values from:

- Garmin import;
- typed average;
- advertised box speed;
- Workhorse factory measurement; and
- system inference.

**Pass conditions:**

- Each remains distinguishable in storage and appropriate output.
- Certificates never label typed or advertised speed as measured.
- Calculations use provenance according to doctrine.
- Export retains source distinctions.

**Automatic failure:** values collapse into one unqualified muzzle-velocity field.

---

## 136. Test K — Incomplete Observation

Record a long-range steel impact with distance and vertical error but no actual dial.

**Pass conditions:**

- The observation is saved.
- The missing dial is clearly identified.
- The observation does not true the solution unless later resolved under valid chronology.
- The user can complete or correct it later without re-entry.

**Automatic failure:** the observation is rejected or a predicted dial is silently substituted as actual.

---

## 137. Test L — Workhorse Claim

**Pass conditions:**

- Secure claim loads the full factory history and original evidence package.
- Factory round count and provenance remain exact.
- Customer changes append after the factory record.
- Material post-factory changes invalidate only applicable conclusions.
- The customer does not recreate the rifle or its first fifty rounds.

**Automatic failure:** factory data becomes an untraceable summary or can be silently edited as customer input.

---

## 138. Test M — Export and Deletion

**Pass conditions:**

- Export includes structured history, provenance, derived outputs, and source artifacts.
- Spreadsheet data is understandable outside PROVEN.
- Complete machine-readable export can reconstruct the record.
- Account deletion follows documented policy across active data and projections.
- Private customer range history is not retained or shared outside the stated boundary.

**Automatic failure:** export contains only current values, omits evidence, or deletion leaves ordinary accessible copies.

---

## 139. Test N — Statistical Restraint

Feed the system one unusual group after a stable history.

**Pass conditions:**

- The group is preserved.
- The system checks compatibility and describes uncertainty.
- It does not diagnose a hardware cause as fact.
- It does not immediately overwrite a stable ballistic solution without evidence.
- It recommends a high-value verification step.

**Automatic failure:** one outlier produces a confident diagnosis or flattering/erratic PROVEN TO movement.

---

## 140. Test O — Late Historical Import

Import a six-month-old target photo and chronograph file.

**Pass conditions:**

- EXIF/source timestamps propose the historical event time.
- Historical configuration state is considered.
- Later events are not overwritten.
- Trends and solutions recompute through versioned events when appropriate.
- Uncertain historical context remains labeled.

**Automatic failure:** the data is attached to today's configuration merely because it was imported today.

---

# Part XVII — V1 Constitutional Scope and Build Order

## 141. V1 Is the Smallest Complete Truth Loop

V1 must not be defined as the largest number of visible features. It must be the smallest implementation that proves the full loop:

1. identify a rifle with minimal effort;
2. preserve current configuration and changes;
3. capture/import zero, velocity, and long-range observations;
4. retain provenance and original evidence;
5. operate offline without loss;
6. call existing tested engines;
7. produce a trued solution and PROVEN TO statement;
8. preserve a complete rifle history;
9. export owned data; and
10. support the Workhorse factory-to-customer continuation.

---

## 142. Required Foundation Before Visual Expansion

The build order should prioritize:

### Foundation 1 — truth model

- canonical events;
- provenance;
- configuration epochs;
- applicability/invalidation;
- solution versioning;
- append-and-supersede.

### Foundation 2 — never-lose local architecture

- local durable event store;
- raw evidence vault;
- resumable capture;
- idempotent sync;
- attachment protection.

### Foundation 3 — context and continuity

- current rifle state;
- active context;
- carry-forward defaults;
- unresolved evidence;
- multi-rifle recognition.

### Foundation 4 — core capture adapters

- Garmin export import;
- target photographs and manual fallback;
- simple zero capture;
- long-range steel observation;
- cleaning and configuration changes;
- ammunition/lot introduction.

### Foundation 5 — tested computation and outputs

- velocity statistics;
- solver;
- two-stage truing;
- target calibration;
- PROVEN TO rollup;
- drop chart/rangefinder values;
- certificate.

### Foundation 6 — Workhorse continuation

- factory evidence package;
- secure claim;
- immutable provenance;
- customer continuation.

Only after these foundations are reliable should the product invest heavily in broad diagnostic models, rich trend visualizations, or additional integrations.

---

## 143. Explicitly Deferred From v1

Consistent with the Product Definition, v1 must not be delayed by:

- AI conversational assistant;
- crowd or aggregate rifle data;
- social feeds or public profiles;
- load-development recipes, ladders, or community loads;
- broad direct hardware integrations beyond chronograph file import;
- mobile administrative tooling; or
- speculative engagement systems.

Structured speech, future direct Garmin authorization, rangefinder integration, and more advanced target imaging may be designed as adapters, but the core must succeed without them.

---

## 144. Diagnostics Should Begin Conservatively

V1 may provide simple, evidence-grounded feedback such as:

- velocity compared with prior compatible samples;
- group compared with prior compatible groups;
- rounds since cleaning;
- current versus prior lot;
- zero/configuration invalidation; and
- not-enough-data statements.

It should not claim sophisticated root-cause diagnosis until methods are validated against sufficient real histories.

The architecture must preserve the data needed for future diagnostics from day one.

---

# Part XVIII — Decision Governance

## 145. The Constitutional Feature Review

Before implementation, every proposed feature or required interaction must be reviewed with this template:

### Purpose

- What shooter problem does this solve?
- Does it support capture, continuity, truthful interpretation, or required output?

### User effort

- What does the user have to notice, remember, decide, type, or repeat?
- Can the system acquire the information at a higher level of the six-level hierarchy?
- Can the interaction be deferred or eliminated?

### Truth

- What is the provenance?
- What happens when the inference is wrong?
- Does the feature distinguish unknown, approximate, inferred, typed, and measured?
- Can it contaminate a rifle history?

### Architecture

- Is the original evidence preserved?
- Is the event append-only and reversible?
- Does it work offline?
- Is import idempotent?
- Does it use existing tested engines?
- Are configuration applicability rules centralized?

### Simplicity

- Can Roy use it unaided?
- Does it add complexity to users who do not need it?
- Is there one obvious default action?
- Is advanced detail progressively disclosed?

### Value

- What immediate payoff follows capture?
- How will success be measured in truth per second of attention?

A feature that cannot pass this review should not enter the product.

---

## 146. Exceptions Require Written Rationale

A team may deviate from a SHOULD only when it records:

- the rule being deviated from;
- the user evidence or technical constraint;
- alternatives considered;
- the effect on effort, truth, offline behavior, and data ownership;
- the mitigation; and
- the date for reevaluation.

A MUST may be changed only by amending the constitution and Product Definition deliberately. It may not be bypassed inside implementation code.

---

## 147. Constitutional Changes Must Preserve the Product's Center

The constitution may evolve as real users and technical constraints teach the team. Changes should be accepted when they:

- reduce user effort without reducing truth;
- improve evidence capture or provenance;
- correct an invalid assumption;
- strengthen offline reliability;
- improve compatibility handling;
- make Workhorse continuity more authentic; or
- improve accessibility for both primary and expert users.

Changes should be rejected when they primarily:

- imitate a competitor;
- increase engagement metrics;
- expose the internal data model;
- add required administration;
- hide uncertainty;
- flatten provenance; or
- make the product look advanced while making it harder to use.

---

## 148. Decisions Deliberately Left Open

This constitution intentionally does not lock the product into premature choices about:

- exact page/navigation structure;
- visual style;
- specific control types;
- exact active-context timeout values;
- exact statistical thresholds for anomaly detection;
- exact confidence wording at every sample size;
- the current availability or terms of a Garmin API;
- the exact speech-recognition implementation;
- specific QR/NFC hardware choices;
- the precise local database library;
- the exact sync framework; or
- future rangefinder and environmental-device integrations.

These choices must be made later through prototypes, technical verification, and usability testing while remaining inside the constitutional rules.

Leaving them open is intentional. It prevents premature answers from forcing the product into a convoluted corner.

---

# Part XIX — Minimum Canonical Facts by Core Action

This section defines the smallest evidence set needed to represent common actions. It does not mean every value must be manually entered.

## 149. Zero Observation

Minimum canonical facts:

- rifle/configuration applicability;
- event time;
- target distance;
- point of aim;
- group center or point-of-impact offset;
- shot count or observation basis;
- measurement method/provenance; and
- source artifact when available.

Zero is **confirmed** only when doctrine requirements are met. A user statement alone may be preserved as a zero claim without being promoted to confirmed zero.

---

## 150. Velocity Observation

Minimum canonical facts:

- rifle/barrel applicability;
- ammunition/load and lot when known;
- one or more velocity values or a typed summary;
- event time;
- source/provenance; and
- source artifact when imported.

Environment and configuration should attach automatically when available but must not block preservation.

---

## 151. Long-Range Impact Observation

Minimum canonical facts for analytic use:

- rifle/current compatible configuration;
- applicable confirmed zero;
- ammunition/load;
- target distance;
- actual dial used;
- vertical impact or group-center error;
- observation basis/shot count;
- event time; and
- sufficient environment/direction context for doctrine.

Missing facts do not prevent capture; they prevent or reduce analytic eligibility.

---

## 152. Cleaning Event

Minimum canonical facts:

- rifle/barrel applicability;
- event time or approximate interval; and
- fact that cleaning occurred.

Everything else is optional enrichment.

---

## 153. Configuration Change

Minimum canonical facts:

- rifle;
- what changed;
- effective time or approximate interval; and
- new state when known.

The compatibility/invalidation service determines downstream effects.

---

## 154. Ammunition Lot Change

Minimum canonical facts:

- rifle/load applicability;
- ammunition product/load;
- lot value or explicit unknown;
- effective time; and
- source/provenance.

An image of the box/lot label should be retained when available.

---

# Part XX — Glossary

## 155. Active context

The system's temporary, confidence-scored understanding of the rifle, configuration, ammunition, place, and related state currently relevant to new evidence. It is not a user-managed session.

## 156. Analytic eligibility

Whether a captured fact meets the doctrine and prerequisites for a specific calculation. Ineligibility never means the historical observation is discarded.

## 157. Configuration epoch

A time-bounded period during which a relevant physical part or state is believed to remain stable.

## 158. Digital twin

The evidence-backed longitudinal model of a specific physical rifle. It is honest about unknowns and is not an omniscient simulation.

## 159. Event cluster / range visit

An automatically assembled grouping of related events by time, place, rifle, and context. It exists for organization and review, not as a required user workflow.

## 160. Evidence

An original artifact or direct observation supporting a fact, such as a Garmin file, target photo, certificate, or shooter-reported impact.

## 161. Provenance

The source and method by which a fact became known: factory-recorded, device-imported, photo-measured, user-observed, user-typed, system-inferred, or system-derived.

## 162. PROVEN TO

The honest distance to which the applicable current ballistic solution has adequate supporting evidence under PROVEN doctrine. It is not the farthest hit or a guarantee.

## 163. Projection

A derived current view rebuilt from the event history, such as current round count, zero state, velocity estimate, drop chart, or PROVEN TO distance.

## 164. Raw evidence vault

Durable storage for original source artifacts and metadata before and after normalization, association, and analysis.

## 165. Solution version

An immutable computed ballistic state tied to specific evidence, configuration, engine version, and outputs.

## 166. Supersede

To correct or replace the applicability of a prior fact through a new traceable event without silently deleting the earlier record.

---

# Part XXI — Final Constitutional Statement

## 167. What PROVEN Must Become

PROVEN must become the easiest way a shooter has ever remembered a rifle.

It should know:

- what the rifle is;
- what configuration it was in;
- what ammunition it fired;
- how fast every measured shot traveled;
- what the targets showed;
- what the environment was or was estimated to be;
- when the rifle was cleaned;
- how many rounds had been fired;
- what the scope was dialed to;
- where the impacts landed;
- what changed;
- what remained normal;
- what became unusual; and
- how far the resulting solution can honestly be trusted.

But the shooter must not feel the weight of that database.

The shooter should experience only this:

> **PROVEN already remembers the rifle. I tell it what changed and what happened. It does the hard work and tells me what the evidence means.**

The product succeeds when a 60-year-old expert shooter can use it on first contact without instruction, a 25-year-old data enthusiast can inspect every underlying detail, a fifty-rifle collector does not become a database administrator, and a Workhorse customer receives a rifle whose first chapter has already been proven.

The final test for every decision is simple:

> **Does this capture more truth with less effort while preserving complete honesty?**

If yes, it belongs in PROVEN.

If no, it does not.
