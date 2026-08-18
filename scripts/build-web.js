#!/usr/bin/env node
// Assembles the static web bundle that PartyKit serves alongside the relay.
//
// The app is zero-build, so this is just a curated COPY — no transpiling. It
// copies only the front-end the browser needs into ./public, leaving out
// node_modules, the party/ relay source, electron-main.js, the desktop build,
// and scratch. `partykit deploy` then serves ./public (see partykit.json) at the
// same origin as the relay, so one deploy ships the web app + multiplayer.
//
// Single source of truth stays at the repo root (which the Electron app also
// loads); ./public is generated and gitignored — rebuilt on every deploy.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public");

// Everything the browser loads (relative paths in index.html resolve from here).
// If you add a runtime asset dir (fonts/, img/), add it to this list.
const INCLUDE = ["index.html", "js", "css", "assets"];

// Empty public/ by clearing its CONTENTS (not removing the dir itself) — on
// Windows a process serving public/ can hold a lock that makes removing the
// directory fail with EPERM. Per-entry, best-effort with retries; anything that
// can't be removed gets overwritten by the copy below.
function cleanDir(p) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
    return;
  }
  for (const entry of fs.readdirSync(p)) {
    try {
      fs.rmSync(path.join(p, entry), { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
    } catch (e) {
      console.warn(`  ! couldn't remove public/${entry} (${e.code}) — will overwrite`);
    }
  }
}

cleanDir(OUT);

let files = 0;
for (const entry of INCLUDE) {
  const src = path.join(ROOT, entry);
  if (!fs.existsSync(src)) {
    console.warn("  ! skipped (missing): " + entry);
    continue;
  }
  const dest = path.join(OUT, entry);
  // assets/boot-swirl/ is the baked sim loop, kept for a future loader that
  // has its own idle renderer (the boot cursor is the OS spinner now — see
  // js/00a-boot.js). Nothing loads it, so it has no business in a deploy.
  fs.cpSync(src, dest, { recursive: true, force: true, filter: (s) => !s.includes("boot-swirl") });
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    const n = fs.readdirSync(src).length;
    files += n;
    console.log(`  + ${entry}/ (${n} files)`);
  } else {
    files += 1;
    console.log(`  + ${entry}`);
  }
}

// Cache-bust: append ?v=<buildId> to every local js/ and css/ URL so devices —
// especially iOS Safari, which caches JS/CSS very aggressively — fetch fresh assets
// after a deploy instead of running stale code. This rewrites <script src>, <link
// href>, AND the inline async-loader array strings (the shader files 04a..06 load
// from that array, not from <script src>). The HTML itself is served no-cache (see
// partykit.json "serve" TTLs) so this new ?v= is always seen.
const buildId = Date.now().toString(36);
const htmlPath = path.join(OUT, "index.html");
let html = fs.readFileSync(htmlPath, "utf8");
const before = html;
html = html.replace(/(["'])((?:js|css)\/[^"'?]+\.(?:js|css))\1/g, `$1$2?v=${buildId}$1`);
fs.writeFileSync(htmlPath, html);
const busted = (before.match(/(["'])(?:js|css)\/[^"'?]+\.(?:js|css)\1/g) || []).length;
console.log(`  cache-busted ${busted} js/css URLs with ?v=${buildId}`);

console.log(`\nWeb bundle ready at public/ (${files} top-level entries copied).`);
console.log("Deploy with:  npx partykit deploy   (serves public/ + the relay from one URL)");
