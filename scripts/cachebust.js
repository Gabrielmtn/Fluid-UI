#!/usr/bin/env node
/*
  Cachebust index.html by appending ?v=<version> to local CSS/JS URLs.
  - Run without args to APPLY (creates a backup index.html.bak.cachebust)
  - Run with --restore to RESTORE the original index.html and remove backup
*/
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = process.cwd();
const htmlPath = path.join(root, 'index.html');
const bakPath = path.join(root, 'index.html.bak.cachebust');

function getVersion() {
  // Prefer git short hash; fallback to timestamp
  try {
    const hash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (hash) return hash;
  } catch (_) {}
  return Date.now().toString(36);
}

function isRemote(url) {
  return /:\/\//.test(url) || url.startsWith('data:');
}

function apply() {
  if (!fs.existsSync(htmlPath)) {
    console.error('[cachebust] index.html not found at', htmlPath);
    process.exit(1);
  }
  const version = getVersion();
  const src = fs.readFileSync(htmlPath, 'utf8');
  // Backup original once per run
  try { fs.copyFileSync(htmlPath, bakPath); } catch (_) {}

  // Replace all local CSS/JS href/src with versioned URLs
  const re = /(src|href)=("|')([^"']+?\.(?:js|css))(?:\?[^"']*)?(\2)/g;
  const out = src.replace(re, (m, attr, q, url, q2) => {
    if (isRemote(url)) return m; // leave remote URLs intact
    const base = url.split('?')[0];
    return `${attr}=${q}${base}?v=${version}${q2}`;
  });

  fs.writeFileSync(htmlPath, out, 'utf8');
  console.log(`[cachebust] Applied with version ${version}`);
}

function restore() {
  if (!fs.existsSync(bakPath)) {
    console.log('[cachebust] No backup to restore. Skipping.');
    return;
  }
  fs.copyFileSync(bakPath, htmlPath);
  fs.unlinkSync(bakPath);
  console.log('[cachebust] Restored original index.html');
}

if (process.argv.includes('--restore')) restore();
else apply();
