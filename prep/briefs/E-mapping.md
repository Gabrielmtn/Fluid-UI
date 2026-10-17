# E — Mapping

Read `prep/briefs/_preamble.md` first, then `prep/work/open-items/claude-session.md` (Gabriel's parity emphasis and the known theme-doc deviations).

## Inputs

`prep/inventory.md`, `prep/selector-contract.md`, `prep/study-survey.md` (its study control list and component catalogue), `design/walnut-copper-theme.md` (Components table), the Component mapping section of `prep/README.md`, and the `data-ui` vocabulary from CSS prep step 4: `dial`, `telegraph`, `pane`, `field`, `keycap`, `tube`, `lamp`, `drawer` (extend it only where the study has a family with no name in that list: `screen`, `scope`, `crt`, `nixie`, `chip`, `divider`; say so).

## Do

For every control in the inventory, in the same surface order:

| Control | App selector (from inventory) | Script hooks on it (from the contract: what must not change) | Proposed `data-ui` kind | Proposed styling hooks (ARIA state attrs available today; `data-ui` to add) | Study component / selector / lines (from the survey) | Confidence | Flag |

Rules for the kind column: a slider/fader → `dial` only if the study renders it as a dial, otherwise `field`; momentary buttons → `keycap`; toggles with `aria-pressed` → `telegraph` or `keycap` (say which and why); readouts/values → `tube`; status indicators → `lamp`; sidebar sections → `drawer`; grouped containers (fader channel, colour cluster) → `pane`. Where none fits (gravity pad, colour wells/swatches, layer rows with thumbnails, QR code, preset thumbnails, Kaleido guides, range with ticks, file inputs, text areas), set kind to `none` and flag it.

Flags: `no-match` (no study component), `study-only` (the study shows a control or behaviour the app does not have: must NOT be ported), `needs-aria` (state only in a class or JS variable, no ARIA attr to style through), `contract-collision` (the natural hook name is already a script hook), `behaviour` (styling it the study's way would change behaviour: range, keys, IA, native select → custom combobox, hidden proxy inputs), `lazy` (created on demand).

Then: a summary table of counts per kind and per flag, a list "App controls with no study match" and a list "Study controls with no app counterpart" for Gabriel. Both lists are the parity check he asked for; be exhaustive.

## Output

`prep/mapping.md`; Open questions appended to `prep/OPEN-ITEMS.md` under `## E`. Return the counts.
