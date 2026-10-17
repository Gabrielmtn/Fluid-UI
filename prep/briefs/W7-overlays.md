# W7: overlays

Read `prep/briefs/00-shared.md` first.

**You own** `css/40-theme-overlays.css` and `js/75-theme-overlays.js`. Everything else is another workstream's. In particular, leave alone the Multi-brush's arm tip menu (`.arm-tip-menu`) and arm rows panel (`.arm-colors-rows`): W4 is restyling them. When you style a shared base class (`.brush-shape-menu`, `.arm-colors-panel`), exclude those two with `:not(...)`.

## The gap

The sidebars and the top bar now use the study's components. Everything that floats above them still wears the old black UI with a warm palette remap (`css/32`): modals, popup menus, floating panels, the F1 sheet, the radial menu, the colour picker, toasts. The study designs few of these directly. Its rule for surfaces it doesn't draw is: "keeps its current controls and behaviour; each one takes the matching component from the other drawers". Apply that.

## Inventory first

Find every overlay surface and list it with its file, how it opens, and what's in it. Known ones (search the class names in `index.html`, `js/` and `css/`):

- **Modals:** the `.delete-modal` family (`ui-fork-modal`, `reset-app-modal`, `open-desktop-modal`, `demo-wishlist-modal`, `app-confirm-modal`, `app-close-modal`; `recipe-modal` is parked), `.hotkey-modal`.
- **Popup menus:** `.brush-shape-menu` (`preset-menu`, `palette-menu`), `.collision-source-menu`, the room menu (`.mp-menu-item`).
- **Floating panels:** `.arm-colors-panel` (`mixer-presets-panel`, `mixer-more-panel`, `brush-settings-panel lsb-panel`), `.atv-panel`.
- **Others:** the skip menu (js/66), the F1 sheet, the radial menu (js/58), the colour picker popover (js/64, `.cp-pop`), the mask editor overlay (`.mask-editor-overlay`, frame and controls only), toasts (`.mp-room-toast` is already a VFD screen; find the others), the quality underbar and slowdown button, the demo clock underbar (js/52).
- Leave the photosensitivity warning (`#photoWarn`) exactly as it is: it paints before the CSS loads, on purpose.

## The treatment

- **Panels and modals:** the study's cabinet: the herringbone walnut or the dark tray, the copper line as the only box (`.cab` 427-431, `.dtray` 453-458), a soft drop shadow. Title in the display face with the engraved shadow, body text in Libre Franklin.
- **Buttons:** cathode panes like the sidebars'. Destructive actions are the red pane. Primary action fills its row only where the study's rule says so.
- **Menus and listboxes:** the study's inline listbox look (`.wc-lbx` / `.wc-opt` in `css/31`, study 2000-2077): dark glass, mesh, option rows that light on hover and selection.
- **Screens:** anything that reports status (toasts, the underbar's messages) reads as a VFD screen like `#mpActivity`.
- **Fields and checkboxes** inside overlays take whatever W3's components are; style only what is specific to the overlay.
- **Motion:** if an overlay's buttons should strike and surge like the sidebars', register them through `ThemeMotion.pane` from js/75 (js/71 only animates panes inside the sidebars, the top bar and three popups today). Open and close can ease on the drawer spring through `ThemeMotion.run`, with transforms and opacity only; never delay a modal's focus or its keyboard handling.

## Check

A shot of every overlay, open, at 1920, next to the drawer component it borrows from. The dialog-focus, popup-focus, skip-menu and radial-menu suites must pass.
