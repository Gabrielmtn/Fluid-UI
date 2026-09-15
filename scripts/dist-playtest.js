#!/usr/bin/env node
// Builds "Swirl Together Playtest", the itch.io playtest, into dist/playtest:
// the unpacked app (win-unpacked) and the zip that goes on the itch page.
//
// The playtest is the whole app with the playtest label in the bottom bar
// (js/52-demo-clock.js, the same label the web build shows) and no
// Steamworks, so this is `npm run dist:win` with these overrides, deep-merged
// over package.json's "build" block by electron-builder itself:
//
//   productName    "Swirl Together Playtest" → the exe, the window title and
//                  the profile folder (%APPDATA%\Swirl Together Playtest),
//                  so it never shares settings with a Steam copy
//   directories    dist/playtest         → never touches the full game's
//                  .output                              dist/win-unpacked
//   extraMetadata  swirlEdition "playtest" → electron-main.js EDITION: no
//                                          Steam, and the page's label
//                  version               → what the splash, F1 and crash
//                                          reports say (not the Steam 1.0.0)
//   win.icon       build/icon-demo.ico   → the S, not Electron's atom
//   win.target     + zip                 → win-unpacked plus the zip
//   win.artifactName                     → Swirl-Together-Playtest-<n>-win64.zip,
//                                          <n> read from PLAYTEST_LABEL so the
//                                          file and the app say the same thing
//
// Upload the zip on the itch dashboard (kind: executable, platform: Windows),
// or push the folder with butler: butler push dist/playtest/win-unpacked <user>/<game>:windows
const fs = require("fs");
const path = require("path");
const { build } = require("electron-builder");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "dist", "playtest");
const UNPACKED = path.join(OUT, "win-unpacked");
const EXE = "Swirl Together Playtest.exe";
const ICON = path.join("build", "icon-demo.ico");

// The number testers see is PLAYTEST_LABEL in js/52-demo-clock.js. An app
// version has to be three numbers, so "0.01 playtest" ships as 0.0.1 —
// bump the two together.
const PLAYTEST_VERSION = "0.0.1";
const labelSrc = fs.readFileSync(path.join(ROOT, "js", "52-demo-clock.js"), "utf8");
const labelMatch = /PLAYTEST_LABEL = '([^']+)'/.exec(labelSrc);
if (!labelMatch) {
  console.error("\n  No PLAYTEST_LABEL in js/52-demo-clock.js — the zip is named after it.\n");
  process.exit(1);
}
const LABEL = labelMatch[1];
const ZIP = "Swirl-Together-Playtest-" + LABEL.split(" ")[0] + "-win64.zip";

// A missing icon would not fail the build — electron-builder quietly falls
// back to Electron's own — so say so up front instead of shipping the atom.
if (!fs.existsSync(path.join(ROOT, ICON))) {
  console.error("\n  No " + ICON + " — bake it first: node scripts/bake-demo-capsules.js icon\n");
  process.exit(1);
}

build({
  projectDir: ROOT,
  win: [],
  config: {
    productName: "Swirl Together Playtest",
    directories: { output: "dist/playtest" },
    extraMetadata: { swirlEdition: "playtest", version: PLAYTEST_VERSION },
    win: { icon: ICON, target: ["zip"], artifactName: ZIP },
  },
})
  .then(() => {
    // What a tester's copy cannot be without: the exe, the edition stamp
    // that keeps Steam out and puts the label up, and the zip itself.
    const exe = path.join(UNPACKED, EXE);
    const pkgPath = path.join(UNPACKED, "resources", "app", "package.json");
    const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, "utf8")) : {};
    const zip = path.join(OUT, ZIP);
    if (!fs.existsSync(exe)) throw new Error("no " + EXE + " in " + UNPACKED);
    if (pkg.swirlEdition !== "playtest") throw new Error("packaged package.json has swirlEdition=" + pkg.swirlEdition + ", expected playtest");
    if (pkg.version !== PLAYTEST_VERSION) throw new Error("packaged version is " + pkg.version + ", expected " + PLAYTEST_VERSION);
    if (!fs.existsSync(zip)) throw new Error("no " + ZIP + " in " + OUT);
    const mb = (fs.statSync(zip).size / 1048576).toFixed(0);
    console.log("\n  Playtest build ready: " + exe);
    console.log("  \"" + LABEL + "\"  ·  v" + PLAYTEST_VERSION + "  ·  no Steam");
    console.log("  itch upload: " + zip + " (" + mb + " MB)\n");
  })
  .catch((e) => {
    console.error("\n  Playtest build FAILED: " + (e && e.message ? e.message : e) + "\n");
    process.exit(1);
  });
