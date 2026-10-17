# Shared preamble (every brief starts here)

You are preparing the Swirl Together codebase (`Z:\New folder\Fluid-UI`, a vanilla-JS WebGL fluid-painting app that ships as a web build and an Electron build) for a style-only reskin called Walnut & Copper. Read `prep/README.md` first, all of it, including the session notes at the end.

Hard rules:

- **Write only under `prep/`.** Never edit `index.html`, `css/`, `js/`, `package.json`, `.gitignore`, `scripts/`, or anything else. Do not run `npm install`. Do not commit. Scratch goes in `prep/work/` or the OS temp directory.
- **Read-only toward behaviour, sync, performance and script selectors.** You are describing the app as it is.
- **The study is not in the repo yet.** If your brief mentions `design/study-lite.html`, check whether it exists; if not, do the app-side half and write what is deferred under "Deferred until the study arrives".
- **Headless Chrome only through the repo driver** (`scripts/test/radial-menu/driver.js` → `boot()`), one instance per agent, closed in a `finally`. Never attach to port 9333 or a running Electron window. Never call an app setter that persists settings (see `scripts/test/GUIDANCE.md` §2b); dispatch `input`/`change` events on the real inputs or write `config.*` instead.
- **Report, don't decide.** Anything that would need a behaviour change, anything you could not verify, and every question go under a final `## Open questions` heading in your report. Also write them to your own file `prep/work/open-items/<your-task-id>.md` (one file per agent, so parallel agents never overwrite each other; a final agent consolidates these into `prep/OPEN-ITEMS.md`).
- **Shared files are owned by one agent.** Never write a file another agent owns: slice agents write under `prep/work/<workstream>/<slice>.*`; merge agents write the top-level reports. Baseline agents write `prep/baseline/<area>/NOTES.md`, not `prep/baseline/README.md` (F7 assembles that).
- **Evidence over prose.** Every claim about code carries a `file:line` reference. Tables over paragraphs. State what you did not cover.
- Your final text return is data for the orchestrator, not a message to a person: return what your brief asks for (usually a short summary with counts and paths), nothing else.
