#!/usr/bin/env node
'use strict';
/*
 * merge-selectors.js — workstream B merge (prep/briefs/B-selector-contract.md, "Merge agent").
 *
 * Reads every prep/work/selectors/*.json slice, validates each row, dedupes by
 * (selector, kind) keeping every file:line reference and the union of modes, sorts
 * by kind then selector, and writes:
 *
 *   prep/selector-contract.json   the merged array (pure array, one object per selector)
 *   prep/selector-contract.md     the human report the brief specifies
 *   prep/work/selectors/_merge-report.json   counts, skipped rows, coverage, css grep results
 *
 * Plain Node, no dependencies, no network, read-only toward everything outside prep/.
 * Run from anywhere:  node prep/scripts/merge-selectors.js
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const SLICE_DIR = path.join(REPO, 'prep', 'work', 'selectors');
const OUT_JSON = path.join(REPO, 'prep', 'selector-contract.json');
const OUT_MD = path.join(REPO, 'prep', 'selector-contract.md');
const OUT_REPORT = path.join(SLICE_DIR, '_merge-report.json');

const KINDS = ['id', 'class', 'data-attr', 'aria-attr', 'custom-prop', 'tag-attr', 'pattern', 'text-key'];
const KIND_LABEL = {
  'id': 'Ids', 'class': 'Classes', 'data-attr': 'Data attributes', 'aria-attr': 'ARIA / state attributes',
  'custom-prop': 'Custom properties', 'tag-attr': 'Tag and attribute selectors', 'pattern': 'String-built patterns',
  'text-key': 'Text keys'
};
const MODES = ['read', 'write', 'both'];

// ARIA attributes that are *state* (CSS prep step 4 styles through these) vs names / relationships / roles.
const ARIA_STATE = new Set([
  'aria-pressed', 'aria-expanded', 'aria-checked', 'aria-disabled', 'aria-selected', 'aria-current',
  'aria-hidden', 'hidden', 'aria-valuenow', 'aria-valuetext', 'aria-valuemin', 'aria-valuemax', 'aria-busy',
  'aria-invalid', 'aria-grabbed', 'aria-sort'
]);

// The four stylesheets JS injects (README session notes). A class mentioned only here is "styled" by an
// unlayered sheet, which the cascade-layer step must know about; reported as a hint, not verified.
const INJECTED_STYLE_FILES = ['js/00a-boot.js', 'js/16-sam-integration.js', 'js/32-file-drop.js', 'js/47-pen-window.js'];

// ---------------------------------------------------------------------------------------------------------
// 1. Load and validate
// ---------------------------------------------------------------------------------------------------------

function isInt(v) { return Number.isInteger(v) || (typeof v === 'string' && /^\d+$/.test(v)); }

function validate(row, src, idx) {
  const problems = [];
  if (!row || typeof row !== 'object' || Array.isArray(row)) return ['not an object'];
  if (typeof row.selector !== 'string' || !row.selector.trim()) problems.push('selector missing/empty');
  if (!KINDS.includes(row.kind)) problems.push('kind not in ' + KINDS.join('|') + ' (got ' + JSON.stringify(row.kind) + ')');
  if (!MODES.includes(row.mode)) problems.push('mode not in read|write|both (got ' + JSON.stringify(row.mode) + ')');
  if (typeof row.file !== 'string' || !row.file.trim()) problems.push('file missing/empty');
  if (!isInt(row.line) || Number(row.line) < 1) problems.push('line not a positive integer (got ' + JSON.stringify(row.line) + ')');
  if (!(row.tier === 1 || row.tier === 2 || row.tier === '1' || row.tier === '2')) problems.push('tier not 1|2 (got ' + JSON.stringify(row.tier) + ')');
  if (row.api != null && typeof row.api !== 'string') problems.push('api not a string');
  if (row.context != null && typeof row.context !== 'string') problems.push('context not a string');
  if (typeof row.selector === 'string' && /[\r\n]/.test(row.selector)) problems.push('selector contains a newline');
  return problems;
}

// Normalise the selector text so the same hook written two ways dedupes to one row.
function normaliseSelector(kind, raw) {
  let s = String(raw).trim().replace(/\s+/g, ' ');
  if (kind === 'id') {
    s = s.replace(/^#+/, '');
    return '#' + s;
  }
  if (kind === 'class') {
    return s.replace(/^\.+/, '');
  }
  return s;
}

const skipped = [];
const rows = [];
const sliceFiles = fs.readdirSync(SLICE_DIR).filter(f => /\.json$/i.test(f) && !f.startsWith('_')).sort();
const perSlice = {};

for (const f of sliceFiles) {
  const full = path.join(SLICE_DIR, f);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (e) {
    skipped.push({ slice: f, index: null, reason: 'file is not valid JSON: ' + e.message });
    continue;
  }
  const arr = Array.isArray(data) ? data : (Array.isArray(data.rows) ? data.rows : null);
  if (!arr) {
    skipped.push({ slice: f, index: null, reason: 'top level is neither an array nor {rows:[...]}' });
    continue;
  }
  perSlice[f] = { rows: arr.length, kept: 0, skipped: 0 };
  arr.forEach((row, i) => {
    const problems = validate(row, f, i);
    if (problems.length) {
      skipped.push({ slice: f, index: i, reason: problems.join('; '), row });
      perSlice[f].skipped++;
      return;
    }
    perSlice[f].kept++;
    rows.push({
      selector: normaliseSelector(row.kind, row.selector),
      rawSelector: String(row.selector).trim(),
      kind: row.kind,
      mode: row.mode,
      file: row.file.trim().replace(/\\/g, '/'),
      line: Number(row.line),
      api: (row.api == null ? '' : String(row.api)).trim(),
      context: (row.context == null ? '' : String(row.context)).replace(/\s+/g, ' ').trim(),
      tier: Number(row.tier),
      slice: f.replace(/\.json$/i, '')
    });
  });
}

// ---------------------------------------------------------------------------------------------------------
// 2. Dedupe by (selector, kind)
// ---------------------------------------------------------------------------------------------------------

function cmpStr(a, b) {
  const al = a.toLowerCase(), bl = b.toLowerCase();
  if (al < bl) return -1;
  if (al > bl) return 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function fileRank(file) {
  // index.html first, then js/ in load order (their numeric prefix sorts naturally), then electron, then scripts/.
  if (file === 'index.html') return '0';
  if (file.startsWith('js/')) return '1' + file;
  if (file.startsWith('electron')) return '2' + file;
  return '3' + file;
}

const byKey = new Map();
for (const r of rows) {
  const key = r.kind + '\u0000' + r.selector;
  let m = byKey.get(key);
  if (!m) {
    m = { selector: r.selector, kind: r.kind, refs: [], aliases: new Set() };
    byKey.set(key, m);
  }
  m.refs.push(r);
  if (r.rawSelector !== r.selector) m.aliases.add(r.rawSelector);
}

const merged = [];
for (const m of byKey.values()) {
  m.refs.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const fr = cmpStr(fileRank(a.file), fileRank(b.file));
    if (fr) return fr;
    return a.line - b.line;
  });
  const modes = new Set();
  for (const r of m.refs) {
    if (r.mode === 'both') { modes.add('read'); modes.add('write'); } else modes.add(r.mode);
  }
  const mode = modes.has('read') && modes.has('write') ? 'both' : (modes.has('read') ? 'read' : 'write');
  const tiers = [...new Set(m.refs.map(r => r.tier))].sort();
  // first line per file (and how many refs that file has)
  const files = [];
  const seenFile = new Map();
  for (const r of m.refs) {
    if (!seenFile.has(r.file)) {
      seenFile.set(r.file, { file: r.file, line: r.line, tier: r.tier, refs: 0 });
      files.push(seenFile.get(r.file));
    }
    seenFile.get(r.file).refs++;
  }
  merged.push({
    selector: m.selector,
    kind: m.kind,
    mode,
    modes: [...modes].sort(),
    tier: tiers[0],
    tiers,
    files: files.map(f => f.file + ':' + f.line),
    fileCount: files.length,
    refCount: m.refs.length,
    tier1Refs: m.refs.filter(r => r.tier === 1).length,
    tier2Refs: m.refs.filter(r => r.tier === 2).length,
    aliases: m.aliases.size ? [...m.aliases].sort() : undefined,
    refs: m.refs.map(r => ({
      file: r.file, line: r.line, mode: r.mode, api: r.api, context: r.context, tier: r.tier, slice: r.slice
    }))
  });
}

merged.sort((a, b) => {
  const ka = KINDS.indexOf(a.kind), kb = KINDS.indexOf(b.kind);
  if (ka !== kb) return ka - kb;
  return cmpStr(a.selector, b.selector);
});

// ---------------------------------------------------------------------------------------------------------
// 3. Counts
// ---------------------------------------------------------------------------------------------------------

const counts = {};
for (const k of KINDS) counts[k] = { tier1: 0, tier2only: 0, total: 0, read: 0, write: 0, both: 0 };
for (const m of merged) {
  const c = counts[m.kind];
  c.total++;
  if (m.tier === 1) { c.tier1++; c[m.mode]++; } else c.tier2only++;
}
const totals = { tier1: 0, tier2only: 0, total: 0, read: 0, write: 0, both: 0 };
for (const k of KINDS) for (const f of Object.keys(totals)) totals[f] += counts[k][f];

// ---------------------------------------------------------------------------------------------------------
// 4. Coverage: which shipped js/*.js files have no rows at all (selector-free or missed)
// ---------------------------------------------------------------------------------------------------------

const filesWithRows = new Set(rows.map(r => r.file));
const jsFiles = fs.readdirSync(path.join(REPO, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f).sort();
const jsUncovered = jsFiles.filter(f => !filesWithRows.has(f)).map(f => {
  // cheap signal: does the file mention any DOM API at all?
  const src = fs.readFileSync(path.join(REPO, f), 'utf8');
  const hits = (src.match(/getElementById|querySelector|classList|\.dataset\.|setAttribute\(|innerHTML|createElement|style\.setProperty/g) || []).length;
  return { file: f, bytes: src.length, domApiHits: hits };
});
const tier1Files = [...filesWithRows].filter(f => f === 'index.html' || f.startsWith('js/') || f.startsWith('electron')).sort();
const tier2Files = [...filesWithRows].filter(f => f.startsWith('scripts/')).sort();

// ---------------------------------------------------------------------------------------------------------
// 5. Classes script writes that no stylesheet mentions
// ---------------------------------------------------------------------------------------------------------

function readSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } }

const cssFiles = fs.readdirSync(path.join(REPO, 'css')).filter(f => f.endsWith('.css')).sort().map(f => 'css/' + f);
const cssText = {};
for (const f of cssFiles) cssText[f] = readSafe(path.join(REPO, f));
// inline <style> blocks in index.html (the PhotoSafe block at 249-301 today)
const html = readSafe(path.join(REPO, 'index.html'));
const inlineBlocks = [];
{
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let mm;
  while ((mm = re.exec(html))) {
    const line = html.slice(0, mm.index).split('\n').length;
    inlineBlocks.push({ name: 'index.html:' + line + ' <style>', text: mm[1] });
  }
}
const injectedText = {};
for (const f of INJECTED_STYLE_FILES) injectedText[f] = readSafe(path.join(REPO, f));

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function cssMentions(cls) {
  const re = new RegExp('\\.' + escapeRe(cls) + '(?![\\w-])');
  const hits = [];
  for (const f of cssFiles) if (re.test(cssText[f])) hits.push(f);
  for (const b of inlineBlocks) if (re.test(b.text)) hits.push(b.name);
  return hits;
}
function injectedMentions(cls) {
  const re = new RegExp('\\.' + escapeRe(cls) + '(?![\\w-])');
  return INJECTED_STYLE_FILES.filter(f => re.test(injectedText[f]));
}

const writtenClasses = merged.filter(m => m.kind === 'class' && m.tier === 1 && m.modes.includes('write'));
const unstyledClasses = [];
for (const m of writtenClasses) {
  if (!/^[A-Za-z_-][\w-]*$/.test(m.selector)) continue; // not a plain class token (pattern-ish); skip from the grep
  const hits = cssMentions(m.selector);
  if (hits.length) continue;
  const writers = m.refs.filter(r => r.tier === 1 && (r.mode === 'write' || r.mode === 'both'));
  const staticOnly = writers.length > 0 && writers.every(r => r.file === 'index.html' && /^html /.test(r.api));
  unstyledClasses.push({
    selector: m.selector,
    writer: staticOnly ? 'static markup only' : (writers.some(r => r.file === 'index.html') ? 'markup + JS' : 'JS'),
    files: m.files.filter(f => !f.startsWith('scripts/')),
    injected: injectedMentions(m.selector),
    purpose: pickPurpose(m)
  });
}

// ---------------------------------------------------------------------------------------------------------
// 6. Markdown
// ---------------------------------------------------------------------------------------------------------

function pickPurpose(m) {
  // Prefer a tier-1 JS context over a static-markup one; among those prefer the most descriptive.
  let best = null, bestScore = -1;
  for (const r of m.refs) {
    let s = 0;
    if (r.tier === 1) s += 1000;
    if (!/^static markup/i.test(r.context)) s += 500;
    if (r.mode === 'write' || r.mode === 'both') s += 50;
    s += Math.min(r.context.length, 220) / 10;
    if (s > bestScore) { bestScore = s; best = r; }
  }
  return best ? best.context : '';
}

function cell(s, max) {
  let t = String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/`/g, "'").replace(/\s+/g, ' ').trim();
  if (max && t.length > max) {
    let cut = t.slice(0, max);
    const sp = cut.lastIndexOf(' ');
    if (sp > max * 0.6) cut = cut.slice(0, sp);
    t = cut + '…';
  }
  return t;
}
function code(s) { return '`' + String(s).replace(/`/g, "'").replace(/\|/g, '\\|') + '`'; }
function displaySelector(m) {
  if (m.kind === 'class') return '.' + m.selector;
  return m.selector;
}
function filesCell(m, cap) {
  cap = cap || 6;
  const t1 = m.files.filter(f => !f.startsWith('scripts/'));
  const t2 = m.files.filter(f => f.startsWith('scripts/'));
  const shown = t1.slice(0, cap).map(f => code(f));
  const parts = [];
  if (shown.length) parts.push(shown.join(', '));
  if (t1.length > cap) parts.push('+' + (t1.length - cap) + ' more');
  if (t2.length) parts.push('+' + t2.length + ' test/bake file' + (t2.length > 1 ? 's' : ''));
  return parts.join('; ');
}
function tier2FilesCell(m, cap) {
  cap = cap || 6;
  const shown = m.files.slice(0, cap).map(f => code(f));
  return shown.join(', ') + (m.files.length > cap ? '; +' + (m.files.length - cap) + ' more' : '');
}

const PURPOSE_MAX = 170;
const L = [];
const today = new Date().toISOString().slice(0, 10);

L.push('# Selector contract (do-not-rename list)');
L.push('');
L.push(`Generated ${today} by \`prep/scripts/merge-selectors.js\` from ${sliceFiles.length} slice files in \`prep/work/selectors/\` (workstream B). Full data, every reference with its context, is in \`prep/selector-contract.json\` (one object per selector, \`refs[]\` per file:line). This file is the readable half.`);
L.push('');
L.push('Every id, class, data attribute, ARIA attribute, custom property, string-built selector pattern and text key that JavaScript depends on. The later CSS steps may add hooks beside these; they may never rename or repurpose one. **Tier 1** is shipped renderer code (`index.html`, `js/*.js`); **Tier 2** is tests and bake scripts under `scripts/` (not shipped, but renaming breaks the gates). A selector seen in both tiers is listed in tier 1 with its test references counted.');
L.push('');
L.push('## Counts');
L.push('');
L.push('| Kind | Tier 1 | Tier 2 only | Total | Tier 1 read | Tier 1 write | Tier 1 both |');
L.push('|---|---:|---:|---:|---:|---:|---:|');
for (const k of KINDS) {
  const c = counts[k];
  L.push(`| ${KIND_LABEL[k]} (\`${k}\`) | ${c.tier1} | ${c.tier2only} | ${c.total} | ${c.read} | ${c.write} | ${c.both} |`);
}
L.push(`| **All** | **${totals.tier1}** | **${totals.tier2only}** | **${totals.total}** | ${totals.read} | ${totals.write} | ${totals.both} |`);
L.push('');
L.push(`Source rows: ${rows.length} kept, ${skipped.length} skipped as malformed, from ${sliceFiles.length} slices. Files with rows: ${tier1Files.length} tier 1 (\`index.html\` + ${tier1Files.length - (tier1Files.includes('index.html') ? 1 : 0)} of ${jsFiles.length} \`js/*.js\`), ${tier2Files.length} tier 2 under \`scripts/\`.`);
L.push('');
L.push('**Mode:** `read` = script queries it (querySelector, getElementById, closest, matches, dataset read, classList.contains, label for=, aria-* id references); `write` = script or static markup creates or toggles it (classList.add/remove/toggle, className =, id =, setAttribute, innerHTML templates, html attributes); `both` = union. Static `index.html` markup declaring a hook counts as `write` (it is what CSS and other scripts depend on).');
L.push('');
L.push('**Columns:** selector · mode · files (first line in each file; tier-1 files capped at 6, test/bake files counted) · purpose (the most descriptive context a slice recorded; the JSON has all of them). Classes carry a `.` here but not in the JSON; ids carry `#` in both.');
L.push('');
L.push('**Bucketing notes:** `hidden` and `role` writes are filed under ARIA (the brief lists `hidden` there); the ARIA section is split into *state* attributes (what CSS prep step 4 styles through) and *names, relationships and roles*. `tag-attr` rows (role selectors, `input[type=range]`, `label[for]`, focusable-element lists, inline `onclick` handlers the markup depends on) have their own section because the brief does not name one. Generic classes (`active`, `open`, `collapsed`, `dragging`…) dedupe into one row each; their refs tell which component each use belongs to.');
L.push('');

function sectionTable(title, kind, filter, note) {
  const items = merged.filter(m => m.kind === kind && m.tier === 1 && (!filter || filter(m)));
  L.push(`## ${title}`);
  L.push('');
  if (note) { L.push(note); L.push(''); }
  L.push(`${items.length} selectors.`);
  L.push('');
  L.push('| Selector | Mode | Files (first line each) | Purpose |');
  L.push('|---|---|---|---|');
  for (const m of items) {
    L.push(`| ${code(displaySelector(m))} | ${m.mode} | ${filesCell(m)} | ${cell(pickPurpose(m), PURPOSE_MAX)} |`);
  }
  L.push('');
  return items.length;
}

function refTable(title, items, note) {
  // one row per reference: for the small kinds where "the element it goes on" matters
  L.push(`## ${title}`);
  L.push('');
  if (note) { L.push(note); L.push(''); }
  L.push(`${items.length} selectors, ${items.reduce((n, m) => n + m.refs.filter(r => r.tier === 1).length, 0)} tier-1 references.`);
  L.push('');
  for (const m of items) {
    L.push(`### ${code(displaySelector(m))} — ${m.mode}${m.tier2Refs ? ` (+${m.tier2Refs} test/bake ref${m.tier2Refs > 1 ? 's' : ''})` : ''}`);
    L.push('');
    L.push('| File:line | Mode | API | Element / purpose |');
    L.push('|---|---|---|---|');
    for (const r of m.refs.filter(r => r.tier === 1)) {
      L.push(`| ${code(r.file + ':' + r.line)} | ${r.mode} | ${cell(r.api, 70)} | ${cell(r.context, 220)} |`);
    }
    L.push('');
  }
}

sectionTable('Ids', 'id');
sectionTable('Classes', 'class');
sectionTable('Data attributes', 'data-attr', null, 'Attribute names. `data-ui-key` / `data-ui-label` *values* are also contract (see Text keys). The CSS prep\'s `data-ui` identity attribute is a different name and must stay different.');

const ariaState = merged.filter(m => m.kind === 'aria-attr' && m.tier === 1 && ARIA_STATE.has(m.selector.replace(/=.*$/, '')));
const ariaOther = merged.filter(m => m.kind === 'aria-attr' && m.tier === 1 && !ARIA_STATE.has(m.selector.replace(/=.*$/, '')));
refTable('ARIA state attributes script toggles', ariaState, 'The hooks CSS prep step 4 styles through (`[aria-pressed="true"]`, `[aria-expanded="true"]`, `[aria-checked="true"]`, `[aria-disabled="true"]`, `[aria-selected]`, `[aria-current]`, `[hidden]`…). One row per place script writes or reads the attribute, with the element it goes on.');
refTable('ARIA names, relationships and roles script writes', ariaOther, 'Not state: labels, `aria-labelledby`/`aria-describedby`/`aria-controls` id references (both ids are contract), live regions, modal flags and `role`. Listed because the accessibility baseline depends on them; they are not styling hooks.');

sectionTable('Tag and attribute selectors', 'tag-attr', null, 'Element, attribute and role selectors script queries (`input[type=range]`, `label[for]`, `[role="dialog"]`, focusable-element lists) and inline `onclick="…"` handlers the markup depends on (global function names in the purpose column). A few rows are conventions rather than selectors (`class`, `tabindex`, `title`, `zoom (computed)`); kept as the slices recorded them.');

const customProps = merged.filter(m => m.kind === 'custom-prop' && m.tier === 1);
refTable('Custom properties with a JS side', customProps, 'CSS tokens script writes (`style.setProperty`) or reads (`getPropertyValue`, `var()` inside JS-written `cssText`). The semantic-token step must keep each name; `--val`/`--min`/`--max` are the slider fill contract, `--i`/`--rows` are the per-section ramp (**name collision with the theme\'s per-control `--i`**, see Open questions).');

sectionTable('String-built selector patterns', 'pattern', null, 'Selectors assembled from strings or template literals. `<…>` marks the variable part; the purpose column says what it resolves to. Readout ids follow `#<param>Value` with exceptions (`densityValue`, `velocityValue`, `pressureValue`, `iterationValue`, `opacityValue`, `dimmingValue`, `kaleidoValue`, `ss*Val`).');
sectionTable('Text keys', 'text-key', null, 'Persisted or matched text that doubles as a selector: section titles (collapse state in `sidebar.sections`, `ui.hiddenSections` as `section:<title>`, hotkey scopes, recipes, deep links), `data-ui-key` values (`strip:<key>`), button labels tests click by, window names and titles. A copy change here is a behaviour change for stored settings.');

// Tier 2 only
{
  const t2 = merged.filter(m => m.tier === 2);
  L.push('## Tier 2 (tests and bakes only)');
  L.push('');
  L.push(`Selectors that appear **only** in \`scripts/test/**\`, \`scripts/bake-*.js\`, \`scripts/shot-helpers.js\` or \`scripts/copy-sink*\`: ${t2.length}. Not shipped, but renaming breaks a gate. Selectors the tests share with shipped code are in the tier-1 sections above (their test references are counted in the files column). Most tier-2-only ids are harness probes (\`window.__test\`, \`__stage\`), the copy-sink review page, the phone/ PWA, or ids the tests expect to be absent.`);
  L.push('');
  for (const k of KINDS) {
    const items = t2.filter(m => m.kind === k);
    if (!items.length) continue;
    L.push(`### ${KIND_LABEL[k]} (${items.length})`);
    L.push('');
    L.push('| Selector | Mode | Files (first line each) | Purpose |');
    L.push('|---|---|---|---|');
    for (const m of items) L.push(`| ${code(displaySelector(m))} | ${m.mode} | ${tier2FilesCell(m)} | ${cell(pickPurpose(m), 140)} |`);
    L.push('');
  }
}

// Classes script writes that no stylesheet mentions
{
  L.push('## Classes script writes that no stylesheet mentions');
  L.push('');
  L.push(`Tier-1 classes with a \`write\` side whose token (\`.name\` followed by a non-word character) appears in none of the ${cssFiles.length} files in \`css/\` nor in the ${inlineBlocks.length} inline \`<style>\` block${inlineBlocks.length === 1 ? '' : 's'} of \`index.html\`: **${unstyledClasses.length} of ${writtenClasses.length}** written classes. These are safe to leave alone (renaming them changes nothing on screen), and they are free hooks if a theme rule wants one; the *writer* column says whether only static markup declares the class (then only HTML, no JS, carries it). The *injected* column is a hint: the class token appears in one of the four JS files that inject a \`<style>\` (\`js/00a\`, \`16\`, \`32\`, \`47\`), so it may be styled by an unlayered sheet; not verified. Classes matched only through \`[class*=…]\` attribute selectors would be missed by this grep (none of today's CSS uses one).`);
  L.push('');
  L.push('| Class | Writer | Files (first line each) | Injected sheet? | Purpose |');
  L.push('|---|---|---|---|---|');
  for (const u of unstyledClasses) {
    L.push(`| ${code('.' + u.selector)} | ${u.writer} | ${u.files.slice(0, 5).map(code).join(', ')}${u.files.length > 5 ? '; +' + (u.files.length - 5) + ' more' : ''} | ${u.injected.length ? u.injected.map(code).join(', ') : ''} | ${cell(u.purpose, 150)} |`);
  }
  L.push('');
}

// Coverage + skipped
{
  L.push('## Coverage and validation');
  L.push('');
  L.push('| Check | Result |');
  L.push('|---|---|');
  L.push(`| Slice files read | ${sliceFiles.length}: ${sliceFiles.map(f => code(f)).join(', ')} |`);
  L.push(`| Rows kept / skipped | ${rows.length} / ${skipped.length} |`);
  L.push(`| Ids normalised to \`#\` | ${rows.filter(r => r.kind === 'id' && !r.rawSelector.startsWith('#')).length} rows lacked the prefix and were merged with their prefixed twins |`);
  L.push(`| \`js/*.js\` files with no rows | ${jsUncovered.length} of ${jsFiles.length}: ${jsUncovered.map(u => code(u.file) + (u.domApiHits ? ` (${u.domApiHits} DOM-API hits, check)` : ' (0 DOM-API hits)')).join(', ') || 'none'} |`);
  L.push(`| Electron main-process files | \`electron-main.js\` / \`electron-pen-cursor.js\` have no rows; a grep for querySelector/getElementById/executeJavaScript/insertCSS in them finds nothing, so they do not reach into the page by selector. They do depend on the pen window's name and title (see Text keys \`swirl-pen-input\`, \`Swirl Together - Pen input\`). |`);
  L.push(`| Tier-2 files with rows | ${tier2Files.length} |`);
  L.push('');
  if (skipped.length) {
    L.push('### Skipped rows');
    L.push('');
    L.push('| Slice | Index | Reason |');
    L.push('|---|---:|---|');
    for (const s of skipped) L.push(`| ${code(s.slice)} | ${s.index == null ? '' : s.index} | ${cell(s.reason, 200)} |`);
    L.push('');
  }
}

// ---------------------------------------------------------------------------------------------------------
// 7. Write
// ---------------------------------------------------------------------------------------------------------

fs.writeFileSync(OUT_JSON, JSON.stringify(merged, null, 1) + '\n');
fs.writeFileSync(OUT_MD, L.join('\n') + '\n');
const report = {
  generated: new Date().toISOString(),
  slices: perSlice,
  rowsKept: rows.length,
  skipped,
  counts,
  totals,
  tier1Files,
  tier2Files,
  jsUncovered,
  unstyledClasses: unstyledClasses.map(u => ({ selector: u.selector, writer: u.writer, files: u.files, injected: u.injected })),
  cssFilesGrepped: cssFiles,
  inlineStyleBlocks: inlineBlocks.map(b => b.name),
  idsNormalised: rows.filter(r => r.kind === 'id' && !r.rawSelector.startsWith('#')).length
};
fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 1) + '\n');

// ---------------------------------------------------------------------------------------------------------
// 8. Console summary
// ---------------------------------------------------------------------------------------------------------

console.log(`slices: ${sliceFiles.length}  rows kept: ${rows.length}  skipped: ${skipped.length}`);
for (const s of skipped) console.log('  SKIP', s.slice, s.index, '-', s.reason);
console.log('kind            tier1  tier2only  total   read write both');
for (const k of KINDS) {
  const c = counts[k];
  console.log(k.padEnd(15), String(c.tier1).padStart(5), String(c.tier2only).padStart(10), String(c.total).padStart(6), String(c.read).padStart(6), String(c.write).padStart(5), String(c.both).padStart(4));
}
console.log('ALL'.padEnd(15), String(totals.tier1).padStart(5), String(totals.tier2only).padStart(10), String(totals.total).padStart(6), String(totals.read).padStart(6), String(totals.write).padStart(5), String(totals.both).padStart(4));
console.log(`written classes (tier 1): ${writtenClasses.length}; with no stylesheet mention: ${unstyledClasses.length}`);
console.log(`js files with no rows: ${jsUncovered.length} -> ${jsUncovered.map(u => u.file + '(' + u.domApiHits + ')').join(' ')}`);
console.log(`wrote ${path.relative(REPO, OUT_JSON)} (${fs.statSync(OUT_JSON).size} bytes), ${path.relative(REPO, OUT_MD)} (${fs.statSync(OUT_MD).size} bytes), ${path.relative(REPO, OUT_REPORT)}`);
