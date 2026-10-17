# Walnut & Copper: Gabriel's decisions (2026-10-17)

Every follow-up agent reads this before changing anything in its area. Newest at the bottom of each section.

## Standing

- Functionality stays 1:1; the study is the aesthetic and interaction reference, the app's information architecture stays.
- Herringbone wood behind the sidebars. **No parquet anywhere** (reversed his first call): drawer fronts are the study's procedural `.dfront` walnut.
- **No copper pull bar ("nub")** on drawer fronts.
- The idle easter egg changes text colour only.

## Layout

- **Sidebar width:** widen the sidebars slightly and remove the study's inner gutter (between the copper line and the controls), so the content column meets the study's width in the middle. Done once, after the merge, because it touches every drawer and the canvas size.

## Multi-brush and brush stamps (W4)

- **Eight tiles always.** Brushes beyond the count are dimmed; at a count of 8 every tile shows its brush.
- **Heading:** "Custom brush" (not "Tip").
- **Brush drawer stamp grid:** a radio group, one Tab stop, arrow keys move around the grid and pick (most accessible).
- **Brushes count slider:** above the tile screen, as in the study.
- **"Follow main" stamp:** keep it, with no "BRUSH" label or other indicator.

## Motion (W1)

- **Dial hubs (yin-yang) and atoms:** momentum spin that builds the longer the change goes on, then coasts down. As built.

## Fields and checkboxes (W3)

- Uppercase accessible names from `text-transform`: leave as is unless a screen-reader user reports a problem.
- Mandala overlay and Kaleido master toggles as wide checkbox panes: keep.
- **Focus's format buttons and Animations' take lengths:** give them radio semantics (role, `aria-checked`) and indicators.
- **Inline disclosures** (Visible sections, Your hotkeys, Saved animations): take the field look.
- The study's pane mesh on every button, dialogs included: keep.

## Integrator calls for the second wave (defaults; Gabriel may overrule)

Answers to `prep/gaps/SECOND-WAVE.md`'s questions, by its numbers:

- **Q1 sidebar values:** follow the study's sidebar value style (the study is the reference).
- **Q2 recording in progress:** the study's danger pane at full brightness, keeping the app's existing pulse as a slow brightness breath.
- **Q3 labels that fit no tier:** a clean two-line pane as a last resort, never an ellipsis. Re-check after the sidebars widen.
- **Q5 Save cues / Open cues labels blank since 5db4c76:** a regression; restore them.
- **Q6 accessibility-only attributes in app JS** (aria-label, aria-pressed, label for, a focusable layer disclosure): yes, no behaviour change.
- **Q7 key legends:** the study's compact keycap, as W3 built.
- **Q8 tier map:** 48 px for standalone fields and Stroke / Time, Simple / Everything; 32 px in rows, cards and editors; head tubes 38 px.
- **Q9 export progress:** a thin bar in tube colours, so the drawer never shifts while exporting.
- **Q10 number fields:** keep the spin buttons (they work), tinted to the theme.
- **Q11 Display drawer:** dividers between groups only; no new copy.
- **Q12 Multi-brush:** answered above (eight tiles, dimmed beyond the count; arrow keys in the stamp grid).
- **Q13 other players' extras** (gate lids, gravity trail, QUEUED / AFTER YOU): new behaviour, out of scope.
- **Q14 the right sidebar's resize edge** does nothing (pre-existing): not a theme item; listed for a separate fix.
- **Q15 desktop-only rows:** Gabriel checks them in his Electron build.
- **Laminar / Blend 0.00:** keeps the app's meaning (neutral middle, -1 full laminar); behaviour is frozen.
- **Q4 emoji in labels:** Gabriel: replace them with plain text or drawn glyphs like the study (accessible names follow the new words; no behaviour change).

## Open

- Swirl Together: room code in the Invite popover (recommended) or in the drawer; own-change lines on the log (recommended keep); quiet-room text (recommended keep 06e's sentence); "and N more" (recommended keep).
- Ignite while PhotoSafe ("reduce flashing") is on: steady glow instead of flicker, as built?
