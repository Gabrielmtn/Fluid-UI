#!/usr/bin/env node
// Pushes dist/win-unpacked to the Steam depot via SteamPipe — or, with
// --demo, dist/demo/win-unpacked to the demo's (app 5162690, depot 5162691).
//
// Replaces the old inline `steamcmd +login ... %CD%\steam\app_build.vdf` npm
// script, which only worked when npm happened to spawn cmd.exe.
//
// THE SPACE PROBLEM (measured 2026-08-21, steamcmd 1785799152)
//   This repo lives under "Z:\New folder\Fluid-UI". steamcmd splits its
//   +run_app_build argument on whitespace no matter how it is quoted, so it
//   received "folder\Fluid-UI\steam\app_build.vdf" and reported
//   "App build file does not exist". Three things were tried:
//     - absolute path, quoted   -> split on the space, fails
//     - path relative to cwd    -> also fails: steamcmd resolves relative
//                                  paths against ITS OWN directory, not the
//                                  working directory it was launched from
//     - 8.3 short path          -> unavailable, short-name generation is off
//                                  on this volume
//   What works is handing steamcmd a path with no spaces in it at all, so
//   when the repo path contains one this creates a throwaway directory
//   JUNCTION in a space-free location, points steamcmd through it, and
//   removes it afterwards. Paths inside the VDFs need no changes: SteamPipe
//   resolves the depot config and the content root relative to the app build
//   file, which means they resolve through the junction too.
//
// Usage:
//   npm run publish:steam -- <builder-login>
//   npm run publish:steam:demo -- <builder-login>     (the demo, app 5162690)
//   STEAM_BUILDER=<builder-login> npm run publish:steam
//
// steamcmd is found on PATH, or point STEAMCMD at the exe. stdio is inherited
// so steamcmd can prompt for the password and Steam Guard code itself — this
// script never sees or stores credentials.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const argv = process.argv.slice(2);
const DEMO = argv.includes("--demo");
const TARGET = DEMO
  ? { name: "Swirl Together Demo", appid: 5162690, rel: "dist/demo/win-unpacked", exe: "Swirl Together Demo.exe",
      vdf: "app_build_demo.vdf", rebuild: "npm run dist:demo", edition: "demo" }
  : { name: "Swirl Together", appid: 5068940, rel: "dist/win-unpacked", exe: "Swirl Together.exe",
      vdf: "app_build.vdf", rebuild: "npm run dist:win", edition: undefined };
const CONTENT = path.join(ROOT, ...TARGET.rel.split("/"));
const EXE = TARGET.exe;

function die(msg) {
  console.error("\n  " + msg + "\n");
  process.exit(1);
}

// The content root must exist AND carry the current exe name. A rename that
// isn't rebuilt is the specific failure that ships a depot nobody can launch:
// the Steamworks launch option points at an exe that isn't in the build.
if (!fs.existsSync(CONTENT)) {
  die("No " + TARGET.rel + " — run `" + TARGET.rebuild + "` first.");
}
if (!fs.existsSync(path.join(CONTENT, EXE))) {
  const found = fs.readdirSync(CONTENT).filter((f) => f.endsWith(".exe"));
  die(
    TARGET.rel + ' has no "' + EXE + '" (found: ' +
      (found.join(", ") || "no .exe at all") +
      ").\n  The build is stale — rebuild with `" + TARGET.rebuild + "`."
  );
}
// The edition stamp (scripts/dist-demo.js) decides what the build IS: the
// demo with its clock, or the full game. Either one in the other's depot
// would ship the wrong app to every player, so they must match.
{
  let edition;
  try {
    edition = JSON.parse(fs.readFileSync(path.join(CONTENT, "resources", "app", "package.json"), "utf8")).swirlEdition;
  } catch (e) {
    die("Could not read " + TARGET.rel + "/resources/app/package.json — rebuild with `" + TARGET.rebuild + "`.");
  }
  if (edition !== TARGET.edition) {
    die(
      TARGET.rel + " is a " + (edition === "demo" ? "DEMO" : "full-game") + " build, but this uploads " +
        TARGET.name + " (app " + TARGET.appid + ").\n  Rebuild with `" + TARGET.rebuild + "`."
    );
  }
}
if (!fs.existsSync(path.join(ROOT, "steam", TARGET.vdf))) {
  die("Missing steam/" + TARGET.vdf);
}

const login = argv.filter((a) => a !== "--demo")[0] || process.env.STEAM_BUILDER;
if (!login) {
  die(
    "No builder account.\n" +
      "  npm run " + (DEMO ? "publish:steam:demo" : "publish:steam") + " -- <builder-login>\n" +
      "  (or set STEAM_BUILDER). This is the Steamworks BUILDER account, not\n" +
      "  your personal Steam login."
  );
}

// ── space-free route to steam/app_build.vdf ────────────────────────────────
// Only ever unlink: a junction must be detached, never walked into. Removing
// one recursively would delete the repository it points at.
function unlinkJunction(p) {
  let st;
  try { st = fs.lstatSync(p); } catch (e) { return; }
  if (!st.isSymbolicLink()) {
    die("Refusing to touch " + p + " — expected a junction, found a real directory.");
  }
  try { fs.unlinkSync(p); } catch (e) {
    try { fs.rmdirSync(p); } catch (e2) {}
  }
}

let junction = null;
function vdfPath() {
  const direct = path.join(ROOT, "steam", TARGET.vdf);
  if (!/\s/.test(direct)) return direct;

  const candidates = [
    path.join(os.tmpdir(), "swirl-steampipe"),
    path.join(path.parse(ROOT).root, ".swirl-steampipe"),
  ].filter((c) => !/\s/.test(c));
  if (!candidates.length) {
    die(
      "The repo path contains a space and no space-free location was found for\n" +
        "  the junction steamcmd needs. Move the repo somewhere without spaces."
    );
  }

  for (const link of candidates) {
    try {
      unlinkJunction(link);
      fs.symlinkSync(ROOT, link, "junction");
      const via = path.join(link, "steam", TARGET.vdf);
      if (fs.existsSync(via)) {
        junction = link;
        console.log("  note     : repo path contains a space — routing steamcmd");
        console.log("             through a temporary junction at " + link);
        return via;
      }
      unlinkJunction(link);
    } catch (e) { /* try the next candidate */ }
  }
  die("Could not create the junction steamcmd needs (tried: " + candidates.join(", ") + ").");
}

// ── run ────────────────────────────────────────────────────────────────────
let steamcmd = process.env.STEAMCMD || "steamcmd";
// shell:false below means Windows won't apply PATHEXT to a bare command name.
if (process.platform === "win32" && !path.extname(steamcmd)) steamcmd += ".exe";

const APP_BUILD = vdfPath();
const runDir = path.dirname(APP_BUILD);

console.log("  target   : " + TARGET.name + " (app " + TARGET.appid + ")");
console.log("  steamcmd : " + steamcmd);
console.log("  builder  : " + login);
console.log("  content  : " + CONTENT);
console.log("  app_build: " + APP_BUILD + "\n");

let r;
try {
  // shell:false deliberately — going through cmd.exe concatenates argv without
  // quoting, which is what mangled the path here in the first place.
  r = spawnSync(steamcmd, ["+login", login, "+run_app_build", APP_BUILD, "+quit"], {
    cwd: runDir,
    stdio: "inherit",
    shell: false,
  });
} finally {
  if (junction) unlinkJunction(junction);
}

if (r.error && r.error.code === "ENOENT") {
  die(
    "steamcmd not found. Install the Steamworks SDK (sdk/tools/ContentBuilder/\n" +
      "  builder/steamcmd.exe) and either add it to PATH or set STEAMCMD to its\n" +
      "  full path."
  );
}
if (r.status !== 0) die("steamcmd exited " + r.status + " — build NOT uploaded.");

// app_build.vdf ships with "setlive" "" on purpose, so an upload never goes
// straight to players; it lands as an unset build in the Steamworks Builds page.
console.log(
  "\n  Uploaded. The build is NOT live — set it on a branch from the\n" +
    "  Steamworks Builds page (app " + TARGET.appid + ").\n"
);
