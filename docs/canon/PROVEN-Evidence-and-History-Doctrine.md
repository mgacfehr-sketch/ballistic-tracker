# PROVEN — Evidence & History Doctrine
**Status:** Final constitutional amendment. Closes the doctrine layer.
Sits alongside the Product Definition, Constitution, and Validation
Doctrine. After this document, philosophy changes only by amendment
driven by real-world testing — not by new foundational writing.

---

# Part A — The Evidence Doctrine

## A1. Every claim has an evidence level

Provenance (already constitutional) answers *where a fact came from*:
device-imported, photo-measured, user-typed, factory-recorded.
The evidence level answers a different question: *what kind of knowing
is this?* Both are carried; neither substitutes for the other.

Five levels, in descending epistemic strength:

1. **OBSERVED** — a direct measurement of a single real event.
   *A shot's measured muzzle velocity. A hole's position on a calibrated
   target. The dial the shooter reports using.*
2. **DERIVED** — arithmetic on observations, no model in between.
   *Average MV, SD, ES of a string. Group size from measured holes.
   Rounds since cleaning.*
3. **CALCULATED** — output of a physical model fed by observations.
   *The trued drag model. A predicted drop at 700. The PROVEN TO number.*
4. **INFERRED** — a pattern-based conclusion the evidence supports but
   does not prove. *"This barrel typically needs ~12 fouling shots."
   "This is probably the same steel target as last visit."*
5. **HYPOTHESIS** — a candidate explanation among several.
   *"Scope movement is the most likely cause of this shift."*

## A2. Rules

- Every stored conclusion and every displayed claim carries its level.
  The UI must always know which it is showing, and phrasing must match:
  observed/derived facts may be stated flatly; calculated values are
  stated with their basis available one tap away; inferences are
  hedged in plain words ("usually," "likely"); hypotheses are always
  offered WITH their alternatives and a discriminating next test, never
  as a verdict.
- A level can only be raised by new evidence, never by restatement,
  repetition, or time. A hypothesis confirmed by a discriminating test
  becomes observed/derived through that test's data — the original
  hypothesis record is superseded, not edited.
- Levels compose downward: a calculation fed by a typed (unverified)
  velocity cannot present itself as stronger than its weakest material
  input; the chain is inspectable (Constitution C20).
- Diagnostics live at levels 4–5 by default (Constitution §144's
  conservatism, now with a vocabulary). The troubleshooting ladder
  (Validation Doctrine §7) is the canonical hypothesis workflow: rank
  causes, propose the cheapest discriminating check, record the result,
  re-rank.
- Forbidden: presenting a hypothesis in verdict language; presenting an
  inference as a measurement (Anti-pattern 96, extended); letting the
  coach line issue level-4/5 claims without hedged phrasing.

## A3. Why this exists

Accidental overconfidence is the failure mode of every "smart" product.
The Evidence Doctrine makes overconfidence a *type error*: the claim's
level travels with it, so the interface cannot speak more certainly
than the mathematics knows.

---

# Part B — Historical Intelligence

## B1. The principle

> History is not presented chronologically. History is presented
> because it is relevant to the question the shooter is answering
> right now.

The Record (the chronological list) remains as archive and audit. But
the *product's* use of history is retrieval: when the shooter is doing
something, PROVEN surfaces the past that bears on it — and stays silent
when nothing does.

## B2. Canonical examples (normative in kind, not exhaustive)

- **Cleaning:** "Last three cleaning cycles: 12, 10, 11 fouling shots
  before groups settled." (Sets today's expectation; INFERRED level.)
- **Truing:** "You last trued this rifle 187 rounds ago — MV has risen
  18 fps since." (Frames whether drift is expected.)
- **Troubleshooting:** "The last time this rifle shifted like this was
  before the barrel replacement." (A hypothesis-shaping precedent,
  offered as HYPOTHESIS, never as diagnosis.)
- **Spot-check passed:** "That's 4 consecutive confirmations at 700
  across 3 months." (Earned confidence, stated as DERIVED count.)
- **New lot opened:** "Previous lot averaged 2,846 fps over 63 shots —
  watch for a shift." (Baseline for comparison.)
- **Pre-trip:** "Validation typically costs you 18 rounds; you have 31
  left in this cleaning interval." (The Validation Doctrine's round
  budget, powered by history.)

## B3. Rules

- **Relevance gate:** a historical statement appears only when it
  changes what the shooter should expect, check, or decide right now.
  If it doesn't, silence. (Constitution §24: questions are expensive —
  so are announcements.)
- **Compare like with like:** retrieved history must match the current
  configuration epoch, ammunition, and context per the compatibility
  rules (C29, AP98). "This rifle used to..." claims that span a barrel
  swap must say so.
- **One statement, not a dashboard:** at most one historical insight
  per moment, chosen by value; deeper comparison lives behind a tap
  (progressive disclosure, §29).
- **Every historical statement carries its evidence level** (Part A)
  and its basis one tap away: which events, how many, over what span.
- **History never nags.** Retrieval is triggered by what the shooter is
  doing, never by engagement logic (AP103, AP109).
- **Small-sample honesty:** below a usable sample, the product says
  "not enough history yet" or says nothing — it does not extrapolate
  from one event (Test N's restraint, generalized).

## B4. Why this exists

A notebook remembers in order. An expert remembers *on cue* — cleaning
day recalls past cleanings, a shift recalls past shifts. Historical
Intelligence is the difference between storing the rifle's life and
having learned from it. This, with the per-shot doctrine, is where
PROVEN becomes smarter than the shooter's memory rather than merely
neater.

---

# Closing the doctrine layer

The canon is now complete and fixed at four documents:

1. **Product Definition** — what PROVEN is.
2. **Constitution** — how PROVEN must behave.
3. **Validation Doctrine** — how expert validation works and how PROVEN
   improves the method.
4. **Evidence & History Doctrine** — how PROVEN knows, and how it
   remembers.

From this point forward: implementation is the primary activity.
Discoveries during building or real-world testing that the canon does
not adequately address are handled by STOPPING and proposing a written
amendment — never by inventing behavior inside code. An amendment
states the rule it changes, the evidence for the change, and its effect
on the other documents.
