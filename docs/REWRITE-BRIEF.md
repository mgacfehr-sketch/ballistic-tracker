# Module rewrite brief — presentation rebuild (internal, deleted after rebuild)

You are rewriting the RENDER LAYER of one JS module of the yorT PWA. The old
presentation is dead. Follow this brief exactly.

## Mission
Rewrite every HTML string / DOM construction in your module to emit the NEW
structure defined by `docs/REDESIGN-SPEC.md` (read it first — especially
Part II.8 composition grammar, Part III for your screen, Part IV vocabulary)
and styled by `css/ui.css` (read it: every class you emit must exist there,
except JS hooks). Keep ALL logic, data calls, public APIs, and behavior.

## Hard rules
1. **FORBIDDEN:** opening `css/main.css`; any class name not in `css/ui.css`
   (JS-hook-only classes are allowed if styled nowhere — prefer `data-` attrs
   or ids for hooks); emoji or pictographic Unicode anywhere; `style="…"`
   attributes and `el.style.*` (exceptions: canvas-computed geometry,
   `display` toggles ONLY via `classList.add/remove('hidden')` instead).
2. **Icons:** only `Icon('name', sizePx)` from `js/icons.js` (read it for the
   name list). Replace ✓→Icon('check'), ⚠→Icon('alert'), ✎→Icon('pencil'),
   🗑→Icon('trash'), ★→Icon('star'), ←/→/↩→Icon('arrow-left'/'arrow-right'/
   'undo'), ‹/›→Icon('chevron-left'/'chevron-right'), ×→Icon('x'),
   🔊/🔇→Icon('sound')/Icon('sound-off'). Typographic entities `&middot;`
   `&mdash;` `&Prime;` `&deg;` are fine in text.
3. **Grammar:** verdict sentence first, numbers under. Max ONE
   `.action-primary` visible per screen. Empty states = `.empty-teach`
   (one sentence + one button). Labels above numbers (`.instrument`).
   Data tables = `.datatable` inside `.datatable-wrap`. Key/value rows =
   `.spec-row`. Section kickers = `.qcard-kicker`. Tap rows = `.row-item`
   with `.row-main`/`.row-aside`. Toolbars = `.view-toolbar` with
   `.toolbar-back` (chevron-left icon + label), `.toolbar-title`,
   optional `.toolbar-act`. Screens wrap content in `.screen`.
4. **Forms:** `.field` + `.field-label` + input/select (bare input inside
   `.field` is styled), `.field-row` for pairs, `.field-unit` for units in
   labels, `.field-hint`, `.field-error`. Collapsibles = `<details
   class="fold"><summary>…</summary><div class="fold-body">…</div></details>`.
   Chip pickers = `.chip-row` + `.chip-opt` (+`.is-selected`). Segmented =
   `.seg` + `.seg-opt`. Help = `<button class="hint-btn"
   onclick="showHelp('key')">?</button>`.
5. **Buttons:** `.action-primary` (the screen's one loud thing),
   `.action` (quiet), `.action-ghost` (text), `.action-danger`
   (destructive), `.action-row` (flex row). Spacing utilities:
   `.u-mt-10 .u-mt-14 .u-mb-12 .u-full .u-center`; text utilities:
   `.t-title .t-head .t-micro .u-label .u-quiet .u-mono`.
6. **Keep intact:** function/method names and signatures, constructor
   contracts, all `db.*` calls, ToolRegistry/hasFeature gates, element IDs
   that OTHER modules or this module's own bindings reference, escapeHtml
   usage on user data, Node `module.exports` blocks, file-top comments
   (update wording where it describes markup).
7. Element visibility: use the `hidden` class (`classList.add('hidden')`),
   never `style.display`.
8. NO new nav tabs, no new views. `window.AppNav.go/openRifle/...` for
   navigation.
9. After writing: run `node --check js/<file>.js` and fix any syntax error.
10. Do not touch any other file. Do not run git commands.

## Tone of copy
Plain shooter English. Sentence case ("Check a target", not "Check A
Target"). Verdicts may be uppercase single words. No exclamation marks.
