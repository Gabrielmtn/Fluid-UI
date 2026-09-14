#!/usr/bin/env node
// Builds "Swirl Together Demo" (Steam app 5162690) into dist/demo/win-unpacked.
//
// The demo is the whole app plus a five-minute clock and a wishlist ask
// (js/52-demo-clock.js), so this is `npm run dist:win` with four overrides,
// deep-merged over package.json's "build" block by electron-builder itself:
//
//   productName    "Swirl Together Demo" → Swirl Together Demo.exe, the exe
//                  the demo's Steamworks launch option must name
//   directories    dist/demo             → never touches the full game's
//                  .output                              dist/win-unpacked
//   extraMetadata  swirlEdition: "demo"  → written into the packaged
//                                          package.json; electron-main.js
//                                          reads it (EDITION) for the Steam
//                                          App ID and the page's clock
//   win.icon       build/icon-demo.ico   → the exe's own icon (and so the
//                                          taskbar's), the same S as the
//                                          demo's Steam icons; baked by
//                                          scripts/bake-demo-capsules.js icon
//
// Everything else — files, exclusions, extraFiles (steam_api64.dll, the
// licences), asar off, the dir target — is the full build's, unchanged.
// Upload with: npm run publish:steam:demo -- <builder-login>
const fs = require("fs");
const path = require("path");
const { build } = require("electron-builder");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "dist", "demo", "win-unpacked");
const EXE = "Swirl Together Demo.exe";
const ICON = path.join("build", "icon-demo.ico");

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
    productName: "Swirl Together Demo",
    directories: { output: "dist/demo" },
    extraMetadata: { swirlEdition: "demo" },
    win: { icon: ICON },
  },
})
  .then(() => {
    // The two things a Steam demo cannot ship without: the exe its launch
    // option names, and the edition stamp that makes it the demo at all.
    const exe = path.join(OUT, EXE);
    const pkgPath = path.join(OUT, "resources", "app", "package.json");
    const edition = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, "utf8")).swirlEdition : null;
    if (!fs.existsSync(exe)) throw new Error("no " + EXE + " in " + OUT);
    if (edition !== "demo") throw new Error("packaged package.json has swirlEdition=" + edition + ", expected demo");
    console.log("\n  Demo build ready: " + exe);
    console.log("  swirlEdition: demo  ·  Steam app 5162690  ·  depot 5162691");
    console.log("  Upload: npm run publish:steam:demo -- <builder-login>\n");
  })
  .catch((e) => {
    console.error("\n  Demo build FAILED: " + (e && e.message ? e.message : e) + "\n");
    process.exit(1);
  });
