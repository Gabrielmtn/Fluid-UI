# B — Selector contract (the do-not-rename list)

Read `prep/briefs/_preamble.md` first.

## Goal

`prep/selector-contract.md` and `prep/selector-contract.json`: every id, class, data attribute and attribute selector that JavaScript depends on, each marked read, write or both, with where. The later CSS steps may add hooks beside these; they may never rename or repurpose one.

## What counts (all of it)

Tier 1, shipped renderer code: `index.html` (inline `onclick=` handlers, `label for=`, `aria-labelledby`/`aria-controls` id references, `<script>` blocks), every `js/*.js` except `js/vendor/`, and `electron-main.js` / `electron-pen-cursor.js` where they reach into the page.

- **Reads:** `querySelector(All)`, `getElementById`, `getElementsByClassName`, `closest`, `matches`, `.dataset.x` reads, `classList.contains`, `el.id ===`, `className.indexOf`, `hasAttribute('data-…')`, selectors built from strings/template literals (record the pattern, e.g. `'#' + id + 'Value'`), `document.forms`, `label.htmlFor`, event delegation checks on `e.target.classList` / `.closest`.
- **Writes (script creates or toggles it, CSS depends on it):** `classList.add/remove/toggle`, `className = …`, `el.id = …`, `setAttribute('data-…')`/`dataset.x = …`, `setAttribute('aria-…')`, class and id names inside `innerHTML`/`insertAdjacentHTML`/template strings, `createElement` + id/class assignment, inline `<style>` text injected from JS (00a, 16, 32, 47).
- **ARIA state attributes script writes** (`aria-pressed`, `aria-expanded`, `aria-checked`, `aria-disabled`, `aria-selected`, `aria-hidden`, `hidden`) — these are the hooks CSS prep step 4 will style through, so list them with the element they go on.
- **Custom properties script writes** (`style.setProperty('--…')`) and reads (`getPropertyValue('--…')`) — CSS tokens with a JS dependency.
- **Persisted text keys that double as selectors:** section titles used as collapse-state keys, `data-ui-key` values stored by js/43/46/49.

Tier 2, not shipped but gates: `scripts/test/**/*.js`, `scripts/bake-*.js`, `scripts/shot-helpers.js`, `scripts/copy-sink.js`. Same extraction, lower fidelity is fine (ids and classes only).

## Slices

Each slice agent gets a file group (named in its task). For each file: grep for the APIs above (`rg -n`), read the surrounding lines for context, resolve string-built selectors where the pieces are visible nearby. Do not read 240 KB shader files end to end; grep them.

## Row format (JSON, one array per slice at `prep/work/selectors/<slice>.json`)

```json
{ "selector": "#mixer-strip", "kind": "id|class|data-attr|aria-attr|custom-prop|tag-attr|pattern|text-key",
  "mode": "read|write|both", "file": "js/20-mixer-layout.js", "line": 807,
  "api": "getElementById", "context": "root of the top bar; built once", "tier": 1 }
```

One row per (selector, file) is enough; collapse repeats within a file into the first line plus a count in `context`. Classes go without the dot in `selector` but keep a `.` prefix in the markdown. Patterns keep their shape (`#<param>Value`).

## Merge agent

Read every `prep/work/selectors/*.json`, dedupe by (selector, kind) keeping all files, derive `mode` as the union, and write:

- `prep/selector-contract.json` — the merged array, sorted by selector.
- `prep/selector-contract.md` — header with counts (ids / classes / data attrs / aria attrs / custom props / patterns; tier 1 vs 2), then sections: Ids, Classes, Data attributes, ARIA state attributes script toggles, Custom properties with a JS side, String-built selector patterns, Text keys, Tier 2 (tests/bakes). Each row: selector · mode · files (first line each) · what it is for. Then "Classes CSS styles that script never touches" is NOT your job (that is the audit's), but do list "Classes script writes that no stylesheet mentions" by grepping `css/` for each written class (these are safe to leave alone and useful to know).
- Append Open questions to `prep/OPEN-ITEMS.md` under `## B`.
