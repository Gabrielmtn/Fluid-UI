# W5: the Swirl Together drawer and its cathode screen

Read `prep/briefs/00-shared.md` first.

**You own** `css/39-theme-room.css` and `js/74-theme-room.js`. Move the "Swirl Together drawer" (~339-384), "Another player's change" (~407-449) and "Name chips" (~450-466) sections of `css/30-theme-walnut-copper.css`, and the Swirl Together part of `css/34-theme-scale.css` (~88-111), into 39 and rewrite them there. In `js/06e-mp-panel.js` you may add a presentation hook only if observing the DOM can't do the job; keep it tiny.

## Gabriel's words

> "interaction design of the text on the cathode screen (currently jerky, and too small of a screen with too much component gutter making it look cheap)"

Compare `prep/compare/1920/swirl-pair.png`: the app (left) has a boxed tray with wide gutters, panes that wrap ("START A / ROOM"), and a one-line activity screen. The study (right) has the sharing line with its pilot lamp, the room code as nixie tubes, a large three-line VFD change log, then Copy code and Leave, then Start a room and Stranger, the code field and Join, Sync phone, and Link to current settings, in one column with tight gutters.

## 1. The change log

`#mpActivity` (js/06e `renderActivity`, ~412) is the room's live region (`aria-live="polite"`). It shows only when two or more people are in the room, holds one line ("<name> changed <setting> and N more", or "Now on <name>'s settings"), and replaces its text in place, which is what reads as jerky. Port the study's cathode screen notifications (study-lite 1395-1465: `lineText`, `renderLine`, `notify`, `restack`, `stepLines`, `setLines`; the drawer feed: CSS `.feed` 467 and 491, markup 815-845, `stepFeed` 2835, empty states "Quiet · no changes yet" and "Offline"):

- New lines strike in on the cathode flicker; older lines step down on the spring and dim (the study's levels); the study's line count and pitch; repeats from the same person merge (the study's window); each line holds for the study's dwell.
- Build it in js/74 as an `aria-hidden` mirror, driven by observing `#mpActivity` (child list and text). `#mpActivity` stays the live region and the source of truth. Keep it in the accessibility tree: visually hidden, never `display: none` from the theme. 06e itself sets `display: none` when the room is empty; the mirror then shows the study's empty state.
- Show only what 06e reports. The study also logs your own changes; the app doesn't, and adding them would be new behaviour. Put that in your report as a question for Gabriel.
- Motion through `ThemeMotion.run`, no loop of your own. Under reduced motion, lines appear and move without animation.
- The screen is the study's size, with the study's tight gutters. It must never look like a small box in a big empty tray.

To test without a second machine: drive 06e the way a remote change does (find the function that sets `_activity` and the "together" condition), or use `prep/baseline/scripts/sync-log.js`, which runs two clients in one room. Never call a setter that persists.

## 2. The drawer layout

Match the study's column (markup 815-845, CSS 459-474): the sharing line with the teal pilot lamp (`.roomstat`, `.lamp.live`), the room code as one nixie tube per character (`.nixies` 461-466, `nixies()` 2764), the log, then the panes. Panes never wrap: one or two per row at the study's widths, labels on one line. Leave is a red pane. Remove the boxed tray and the extra gutter. The room code's text node stays for screen readers (the nixies are an `aria-hidden` mirror of it), and the code's ids stay.

## 3. Peer tints and chips

They work (`css/30`, js/71). Check them against the study (`.chip` 94-99, 2218-2248) when you move the rules, and fix what differs.

## Check

Shots of the drawer before joining, in a room alone, and with another player making changes (a sequence at fixed delays showing lines striking in and stepping down), next to the study's. All suites. The a11y gate: `#mpActivity` still announces.
