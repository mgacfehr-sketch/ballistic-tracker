# Interface contract — `js/garmin-import.js`

Gate 0 artifact. Parses Garmin Xero ShotView chronograph exports (CSV or
multi-sheet XLSX, the latter pre-extracted into row arrays by SheetJS in
the browser) into normalized session objects. Pure, no DOM/storage, no
library dependencies for the row-array path — fully self-contained
(unlike `ballistic-solver.js`, this file has **no hidden coupling** to
another engine's globals; every function it calls is defined in this
file). Node-testable end to end.

## Session object shape

Every parse entry point returns (or resolves to an array of) this shape:

```
{
  source: 'shotview' | 'garmin_csv' | 'garmin_xlsx',   // caller-labeled default 'shotview'
  name: string | null,                                  // sheet/file name, cleaned
  date: string ('YYYY-MM-DDTHH:MM') | null,              // see date resolution below
  shots: [{ shot: number, fps: number, time: string|null }],
  reported: { avg: number|null, sd: number|null, es: number|null },  // Garmin's own summary stats, for cross-checking — never computed here
  warnings: string[]                                     // per-row problems; rows are skipped, never silently dropped from evidence
}
```

**Date resolution order:** the ShotView `DATE` summary row (via
`parseSummaryDate`) first, then the sheet/file name pattern (via
`parseSheetNameDate`), else `null`. Neither source is required — a
session with no resolvable date is still returned complete, never
rejected for a missing date.

## Public functions

| Function | Signature | Returns | Notes |
|---|---|---|---|
| `cleanCellText` | `(value: any)` | `string` | `null`/`undefined` → `''`; coerces via `String()`; replaces the exotic Unicode space characters ShotView embeds (U+00A0, U+2000–200B, U+202F, U+205F, U+3000, U+FEFF) with plain spaces, collapses runs, trims. |
| `isShotNumberCell` | `(value: any)` | `boolean` | `true` only for a cleaned cell matching `/^\d+$/` — i.e. a whole number. A velocity like `"2743.4"` is `false` (has a decimal point); this is what lets the row loop tell a shot row from a summary/junk row. |
| `findHeaderRow` | `(rows: any[][])` | `{rowIndex, cols: {shot,speed,time,cleanBore,coldBore,notes}}` (each `-1` if absent) `\| null` | Finds the header **by content**, scanning every row for one containing both a shot-number column (`#`, `shot`, or `shot #`) and a column starting with `speed` — never assumes a fixed row position. `time`/`cleanBore`/`coldBore`/first `note*` column are optional and independently detected. |
| `parseSheetNameDate` | `(name: string)` | `'YYYY-MM-DDTHH:MM'` \| `null` | Matches ShotView's sheet-name convention `..._YYYY-MM-DD_HH-MM..._n`; `null` if the pattern isn't found. |
| `parseSummaryDate` | `(text: string)` | `'YYYY-MM-DDTHH:MM'` \| `null` | Parses a ShotView `DATE` summary cell like `"June 26, 2026 at 3:07 PM"` via `new Date(...)` (locale/engine date parsing — the string carries no explicit timezone, so JS parses and the function re-extracts using LOCAL wall-clock getters symmetrically; round-trips correctly regardless of host timezone). `null` on an unparseable string. |
| `splitCsvLine` | `(line: string)` | `string[]` | Hand-rolled CSV cell splitter: handles quoted cells containing commas and doubled-quote (`""`) escapes. An empty line returns `['']` (one empty cell), not `[]`. |
| `parseSheetRows` | `(rows: any[][], meta?: {name?, source?})` | session object | **Core parser** — every other entry point reduces to this. Throws if `rows` is empty/absent, or if no header row is found, or if a header is found but zero rows qualify as shots (`isShotNumberCell` on the shot column). A shot row with an unparseable/non-positive speed is **skipped with a warning**, not a crash and not a silent drop — the row index (`first`, the shot number text) is preserved in the warning text. `meta.source` defaults to `'shotview'`; `meta.name` defaults to `null`. |
| `parseShotViewCSV` | `(text: string, filename?: string)` | session object | Throws on empty/whitespace-only text. Splits on any of `\r\n`, `\n`, `\r`, then delegates to `parseSheetRows` with `source: 'garmin_csv'`. |
| `parseShotViewSheets` | `(sheets: {name, rows}[])` | session object`[]` | Throws if `sheets` is empty. Parses each sheet independently via `parseSheetRows` (`source: 'garmin_xlsx'`); a sheet that throws does **not** fail the whole workbook — its failure message is collected and, if at least one sheet parsed, appended to `sessions[0].warnings` (evidence-preservation: a bad sheet's *reason* survives even though it produced no session of its own). Throws only if **every** sheet failed, with all per-sheet reasons joined into the error message. |
| `parseShotViewWorkbook` | `(workbook: SheetJS workbook)` | session object`[]` | Browser-only convenience wrapper — requires the global `XLSX` (throws a friendly error if absent). Converts each sheet to a row array via `XLSX.utils.sheet_to_json(..., {header:1, defval:null, blankrows:true, raw:false})` and delegates to `parseShotViewSheets`. Not covered by golden fixtures (requires the SheetJS global; out of scope for a Node-only engine contract). |

## Idempotency

`parseShotViewSheets`/`parseSheetRows`/`parseShotViewCSV` have no
internal mutable state — re-parsing the identical input twice produces
deep-equal output every time (verified during fixture generation).
Constitution §33.4's duplicate-import detection ("the same shot may
appear in a Garmin file... twice — PROVEN must not count it three
times") is **not** this file's responsibility: this engine only parses
one file/workbook into sessions; cross-file/cross-import deduplication
is a caller/db-layer concern.

## Golden fixture coverage

`tests/fixtures/golden-garmin-import.json` /
`tests/test-golden-garmin-import.js` — 36 cases (35 fixture-driven + the
`undefined` case hardcoded in the test file, since JSON cannot express
`undefined` as a literal). Every pure helper is pinned in isolation
(including edge cases `tests/test-garmin-import.js` doesn't reach
directly: `findHeaderRow` returning `null`, `splitCsvLine`'s
quote-escape and trailing-comma behavior). Three full-object snapshots
against the real `TEST SHOTVIEW SHEET.xlsx` sample data (reused from
`tests/fixtures/shotview-sheets.json` / `shotview-single.csv`, not
duplicated) exact-match every field including `warnings` and `reported`,
which the existing per-field suite checks individually but never as one
locked object. Three more cover the header-found-by-content case, the
skip-with-warning path, and the partial-workbook-failure path. Six
`throws` cases cover every rejection message in the file.
