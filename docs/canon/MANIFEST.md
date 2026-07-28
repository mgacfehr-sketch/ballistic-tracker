# Canon Manifest

This file is the authoritative index of PROVEN's governing documents. It
exists so that a canon file can never silently change underneath the
implementation: `tests/test-canon-manifest.js` recomputes the SHA-256 of
every file listed below and fails the moment a byte differs from the hash
recorded here.

**Rule:** any edit to a canon document (including this one) requires
updating the recorded hash in the same commit. An edit that changes canon
without updating this manifest is, by definition, a broken build.

None of the source documents carry an internal version number or date, so
this manifest uses the content hash itself as the version identifier —
the only version marker that cannot drift silently.

## Governing (normative) — precedence order

Precedence follows Amendment 1's own rule: *"Later documents govern only
the rules they explicitly modify... Normative keywords everywhere carry
the Constitution §0 definitions."* Reading order below is also the
conflict-resolution order for anything Amendment 1 does not explicitly
override.

| # | Document | File | Role | SHA-256 |
|---|---|---|---|---|
| 1 | Amendment 1 (Post-Review Corrections) | `PROVEN-Amendment-1.md` | Governs over the other four wherever it explicitly modifies them. Part B is the build order. | `fbeea9f9b7b17bf3b5179e1a2bef6906e604db53d757207f9d2e7184e44a5df9` |
| 2 | Product and Interaction Constitution | `PROVEN-Product-and-Interaction-Constitution.md` | Governs HOW the product must think, capture, protect truth, and behave. Its honesty and never-lose rules win any conflict with the Validation Doctrine. | `1ba3f5f7ead9e3b9e1118a0fe2e495b63f33dbdbac0746c8d961f51208833595` |
| 3 | Product Definition (UI-free) | `PROVEN-Product-Definition (1).md` | Governs WHAT the product is and must do. Co-equal with the Constitution; the Constitution governs behavior, this document governs scope/requirements. | `054a08fad24781d6cf1862e788d51133f4023b179aa5f5697f7b15854cbcc687` |
| 4 | Validation Doctrine | `PROVEN-Validation-Doctrine.md` | Adds the validation-cycle state machine and expert-workflow detail. Where it conflicts with the Constitution, the Constitution wins (its own §0 status line). Partly superseded by Amendment 1 Part A (A1, A4–A7, A9–A11). | `61729a9c9521437bdef6e642d6b87ebb3f5cf1a8d27fa64397c5a44cd7a178ef` |
| 5 | Evidence & History Doctrine | `PROVEN-Evidence-and-History-Doctrine.md` | Closes the doctrine layer: evidence levels (Part A) and historical intelligence (Part B). Partly amended by Amendment 1 Part A (A8, A13). | `ef1c879ca33e4c796de5f0e6acfd117cd76f80f3de99953344cbc3eeb06494eb` |

Together, documents 1–5 are "the canon." A contradiction between them, or
between the canon and the existing codebase's reality, is not resolved by
invention — implementation stops and a written amendment is proposed.

## Historical (non-governing)

| Document | File | Role | SHA-256 |
|---|---|---|---|
| Constitutional Review of the Existing Implementation | `PROVEN-Constitutional-Review.md` | Historical context mapping the pre-rebuild codebase to the Constitution. Superseded as a roadmap by Amendment 1 Part B. Does not govern; kept for the reasoning trail behind Amendment 1. | `a51cb3b0c34bfd13519f60549bd965a52cbf9bc43459ac7b541bc144081e2416` |

## Gate 0 artifacts (non-canon, non-governing)

Not "the canon" — these are read-only analysis outputs Amendment 1
Part B directs to live in `docs/canon/` anyway. Listed here (with a
hash, like everything else) purely so `test-canon-manifest.js`'s
directory-completeness check has nowhere to hide an untracked file —
not because they carry doctrinal authority.

| Document | File | Role | SHA-256 |
|---|---|---|---|
| Migration Inventory | `MIGRATION-INVENTORY.md` | Gate 0's read-only schema/provenance analysis (Amendment 1 Part B). Row counts TBD — no live DB access this session. | `d2f77ee7239239b3c7c08467a3e5357133697682043c243d2350126eb0b4f6ad` |

The `interface-contracts/` subdirectory (one file per protected engine,
Gate 0) is intentionally NOT enumerated here — `test-canon-manifest.js`
only scans `docs/canon/`'s direct children, and interface contracts are
already pinned by their own golden-fixture/hash-lock tests
(`tests/test-protected-engine-hashes.js` plus each engine's
`tests/test-golden-*.js`), not by this manifest.

## Housekeeping note

`PROVEN-Product-Definition (1).md` carries a `(1)` suffix from its
original download — cosmetic only, filename left unchanged to avoid an
unrequested rename; flagged for the owner to rename at their convenience.
