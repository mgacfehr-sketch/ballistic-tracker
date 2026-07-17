# REDESIGN REPORT — total presentation rebuild

Branch `redesign`, rebuild run of 2026-07-17. This run replaced the previous
redesign passes entirely: `css/main.css` was never opened, no existing class
name or DOM arrangement was used as a starting point, and the whole
presentation layer was rebuilt from a committed spec
(`docs/REDESIGN-SPEC.md`) outward. The engine — calculations.js,
velocity-stats.js, garmin-import.js, ballistic-solver.js, wizard-core.js,
db.js, net.js, schema, tests, SW offline strategy — is untouched.
**All 385 unit tests green at every commit** (71+37+103+49+8+117).

## Build log

| Step | Commit | What |
|---|---|---|
| 0 | `02902eb` | `docs/REDESIGN-SPEC.md` — shooter walkthrough of the seven questions, designer concept (graphite/brass palette, surface-step elevation, verdict-first type scale w/ tabular numerals, icon rules), three-zone composition grammar, ASCII sketches of Home / Rifle Hub / wizard, complete component vocabulary, frozen-file compat contract. Committed before any UI code. |
| 1 | `966beeb` | `js/icons.js` — one thin-stroke SVG family (~60 icons, 24×24, stroke 1.75, currentColor) behind `Icon(name, size)`. The only icon source in the app. |
| 2 | `aadd40d` | `css/ui.css` written from a blank file (tokens → components → sunlight remap → clearly-marked COMPAT section for frozen solver markup). `index.html` body rebuilt from scratch: machined auth plate, slim icon header, canvas-hero session view with bottom-sheet step panel and 7-segment machined progress, icon bottom nav. `main.css` unreferenced everywhere. SW v86. |
| 3 | `6a7064a` | Home as a **status instrument**: hero rifle plate with the readiness verdict dominant (lamp + READY / CHECK ZERO / NOT CHECKED + click-correction sentence), ONE brass primary action chosen from usage counts, quiet tile grid, recent + tool drawer whispering below a hairline. First-run keeps the one-brass-object law. |
| 4 | `f7f60ed` | Rifle Hub (seven-question card stack, kickers auto-hide over empty slots, contextual brass action on the verdict card), profiles list/forms/load detail, history (month-grouped instrument rows, verdict-first session detail), AI chat (readout-style answers, overlay history, icon composer), session flow (choice-plate picker, verified chip, verdict-first results card). SW v87. |
| 5 | `baf8846` | WizardShell full-screen conversation; chrono import/preview/assignment; field logger, ladder, DOPE-card steps; cold-bore + Verified-DOPE hub cards; performance report + certificate preflight; admin + crowd warehouse; wind-call. All chart canvases repainted to palette tokens. Dead compat rules pruned. SW v88. |
| 6 | (this commit) | Polish: final sweeps, this report. SW v89. |

## Verification method

Every major screen was rendered headlessly (Playwright, 390×844 @2x) with
fixture data and inspected as an image before its commit: Home (ready /
adjust / fresh / sunlight), Rifle Hub (top + bottom of stack), session
picker + results, wizard question, field logger overlay, AI consent + chat,
solver (frozen markup on compat styles). Sweeps run over `js/*.js` +
`index.html`:

- **Emoji/pictographs in rendered strings: 0** (remaining matches are
  box-drawing/arrows inside source comments only).
- **`style="…"` in emitted markup: 0** outside frozen `ballistic-solver.js`
  (allowed exceptions kept: canvas buffer geometry, textarea auto-height,
  print-iframe positioning).
- **Legacy classes: emitted only by frozen `ballistic-solver.js`**, styled by
  the marked COMPAT section at the end of `ui.css`. `.wizard-overlay`,
  `.wizard-card`, `.help-btn` rules deleted once their last emitters were
  rewritten.

## Acceptance self-grade

**1. Screenshot-diff test — different bones, not different paint?** Yes.
Home went from a stack of identical action buttons to hero-verdict /
one-primary / subordinate-grid zones. The rifle page went from uniform
cards to an engraved-kicker question stack with mixed rhythm (verdict
panel, load rows, seg toggle, spec sheet, link rows, award row). Results
went from a label:value table to instrument-first (verdict banner → 40px
group size → ATZ strip → everything else in a fold). Wizards went from a
centered modal card to a full-screen conversation with machined ticks.
Chat went from two bubbles to bubble-vs-readout asymmetry. No screen kept
its old skeleton.

**2. The Sig/Garmin test — would a stranger assume a professional design
team shipped this?** Honest answer: yes for structure and discipline — one
type scale, one icon family, one accent used only for state, tabular
numerals everywhere data lives, consistent machined hairlines. The gap to
a Garmin production app is motion polish and photographic content, not
composition.

**3. The glove test — primary action reachable and unmistakable
one-handed?** Yes. Exactly one 56px brass object per screen, full width,
in or near the thumb zone (Home primary, wizard Next in `.wiz-foot`,
Save in overlays, fab-zone "+ Add rifle"); chips and choice plates are
40–56px; bottom nav is 64px.

**4. The glance test — most important truth readable in under one second
from arm's length?** Yes on both graded screens. Home: an 18px lamp +
28px verdict word (READY / CHECK ZERO) on the hero plate — one glance, one
truth. Rifle Hub: same verdict component leads the stack under "Am I
ready?". Session results lead with the ZeroGuardian verdict, then a 40px
group-size numeral.

**5. The emoji test — zero emoji, one coherent icon family?** Yes. Zero
emoji in rendered output (sweep above); every icon in the product renders
from `js/icons.js` (the only inline SVGs elsewhere are the static copies
of the same geometry in `index.html`, required before JS loads).

## Known follow-ups (not regressions)

- `css/main.css` is dead and unreferenced but still on disk — deletion left
  to the owner per standing rule (also `docs/DESIGN-SYSTEM.md`, which
  documents the previous system, and `docs/REWRITE-BRIEF.md`, the internal
  brief used for this rebuild).
- The `loaded` class on the report thumbnail is a vestigial JS hook
  (unstyled, harmless).
- Chart canvases size their drawing buffer in JS; a `.chart-canvas` CSS
  helper could replace that if more charts appear.
- Sunlight mode was verified on Home; a full-screen sweep in sunlight mode
  is worth one range-day QA pass on a real phone in glare.
