#!/usr/bin/env node
'use strict';
/*
 * study-map.js - map a Walnut & Copper study file without ever printing its long lines.
 *
 * Usage:
 *   node prep/scripts/study-map.js <study.html> [--lite <out.html>]
 *
 * Reads the file line by line (byte-split on \n, so CRLF files round-trip) and prints
 * Markdown ready to paste into prep/README.md:
 *   1. lines of 20,000+ characters (length + a 60-char prefix), never their content
 *   2. each <style>...</style> block range with one row per section comment inside it
 *   3. markup landmarks outside the style/script blocks: elements with an id, with
 *      aria-label or role="region", every <h2>, every <button> with aria-expanded,
 *      each with its line and nesting depth
 *   4. each <script>...</script> block range with one row per section comment and per
 *      top-level function / const / let / var / class declaration
 *   5. the rule for converting full-file line numbers to the texture-stripped lite copy
 *
 * --lite <out.html> writes the lite copy: every line shorter than 20,000 characters,
 * each followed by "\n" (the same output as `awk 'length($0) < 20000'`, which keeps a
 * trailing "\r" as part of the line).
 *
 * Extras for checking the map against a hand-written one:
 *   --find <regex>   appends a section listing the lines that match each JavaScript regex
 *                    (line number, lite line, an 80-character excerpt around the match)
 *   --lines a-b      appends the first 80 characters of each line in the range (60 lines max)
 * Long lines are never excerpted; one is reported as "(long line)".
 * Set STUDY_MAP_DEBUG=1 to get tokenizer state histograms per script block on stderr.
 *
 * Plain Node, no dependencies. Only the file named on the command line is read; only
 * the --lite path is written.
 */

const fs = require('fs');
const path = require('path');

const LONG = 20000;          // awk 'length($0) < 20000' keeps a line; we remove length >= LONG
const PREFIX = 60;           // characters of a long line shown in the report
const CELL = 90;             // max characters per table cell
const DEBUG = !!process.env.STUDY_MAP_DEBUG;   // tokenizer state histograms on stderr
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr']);

// ---------------------------------------------------------------- arguments

function usage(code) {
  const msg = 'Usage: node prep/scripts/study-map.js <study.html> [--lite <out.html>] [--find <regex>]... [--lines a-b]...';
  (code ? console.error : console.log)(msg);
  process.exit(code);
}

function parseArgs(argv) {
  const out = { file: null, lite: null, find: [], lines: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lite') {
      if (!argv[i + 1]) usage(2);
      out.lite = argv[++i];
    } else if (a === '--find') {
      if (!argv[i + 1]) usage(2);
      try { out.find.push(new RegExp(argv[++i])); }
      catch (e) { console.error('Bad --find regex: ' + e.message); process.exit(2); }
    } else if (a === '--lines') {
      const m = /^(\d+)(?:-(\d+))?$/.exec(argv[i + 1] || '');
      if (!m) usage(2);
      i++;
      const a0 = +m[1], b0 = m[2] ? +m[2] : a0;
      if (b0 - a0 > 59) { console.error('--lines: at most 60 lines per range'); process.exit(2); }
      out.lines.push([a0, b0]);
    } else if (a === '-h' || a === '--help') {
      usage(0);
    } else if (a.startsWith('--')) {
      console.error('Unknown option ' + a);
      usage(2);
    } else if (!out.file) {
      out.file = a;
    } else {
      usage(2);
    }
  }
  if (!out.file) usage(2);
  return out;
}

// ---------------------------------------------------------------- line reader

/** Yields { n, buf } for every line, split on 0x0A; buf excludes the \n but keeps any \r. */
async function* readLines(file) {
  const stream = fs.createReadStream(file, { highWaterMark: 1 << 20 });
  let rest = Buffer.alloc(0);
  let n = 0;
  for await (const chunk of stream) {
    const data = rest.length ? Buffer.concat([rest, chunk]) : chunk;
    let start = 0;
    let idx;
    while ((idx = data.indexOf(0x0a, start)) !== -1) {
      n++;
      yield { n, buf: data.subarray(start, idx), nl: true };
      start = idx + 1;
    }
    rest = Buffer.from(data.subarray(start));
  }
  if (rest.length) {
    n++;
    yield { n, buf: rest, nl: false };
  }
}

// ---------------------------------------------------------------- helpers

function cell(s, max = CELL) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (s.length > max) s = s.slice(0, max - 1) + '…';
  return s.replace(/\|/g, '\\|');
}

function code(s, max = CELL) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length > max) s = s.slice(0, max - 1) + '…';
  s = s.replace(/\|/g, '\\|');
  return '`' + s.replace(/`/g, '‵') + '`';
}

function cleanComment(text) {
  let t = text.trim();
  const raw = t;
  t = t.replace(/^\/\*+/, '').replace(/\*+\/$/, '');
  t = t.replace(/^\/\/+/, '');
  t = t.replace(/^[\s\-=*#~_.:/\\>─━═]+/, '').replace(/[\s\-=*#~_.:/\\<─━═]+$/, '');
  t = t.replace(/\s+/g, ' ').trim();
  return t; // '' for a bare divider such as // -------- or /* ======== */
}

function dividerText(raw) { return '(divider) ' + raw.trim().slice(0, 24); }

function isDecorated(text) {
  return /(----|====|\*\*\*\*|####|~~~~|\/\/\/\/|────|━━━━|════)/.test(text);
}

// ---------------------------------------------------------------- CSS scanner (per segment)

function makeCssState() {
  return { mode: 'code', depth: 0, commentStart: 0 };
}

/** Advances the CSS state over `s`; returns the depth at the start of the segment. */
function cssScan(st, s) {
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (st.mode === 'comment') {
      if (c === '*' && s[i + 1] === '/') { st.mode = 'code'; i++; }
      continue;
    }
    if (st.mode === 'sq' || st.mode === 'dq') {
      if (c === '\\') { i++; continue; }
      if ((st.mode === 'sq' && c === '\'') || (st.mode === 'dq' && c === '"')) st.mode = 'code';
      continue;
    }
    if (c === '/' && s[i + 1] === '*') { st.mode = 'comment'; i++; continue; }
    if (c === '\'') { st.mode = 'sq'; continue; }
    if (c === '"') { st.mode = 'dq'; continue; }
    if (c === '{') st.depth++;
    else if (c === '}') st.depth = Math.max(0, st.depth - 1);
  }
}

// ---------------------------------------------------------------- JS scanner (per segment)

const REGEX_BEFORE_WORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void',
  'throw', 'instanceof', 'new', 'do', 'else', 'yield', 'await']);

function makeJsState() {
  return {
    mode: 'code',          // code | line | block | sq | dq | tpl | regex
    depth: 0, paren: 0, bracket: 0,
    tplStack: [],          // brace depth at each `${` entry
    lastSig: '', lastWord: '',
    regexClass: false,
  };
}

function jsAtBase(st) {
  return st.mode === 'code' && st.depth === 0 && st.paren === 0 && st.bracket === 0
    && st.tplStack.length === 0;
}

function jsRegexAllowed(st) {
  if (st.lastSig === '') return true;
  if (/[\w$]/.test(st.lastSig)) return REGEX_BEFORE_WORDS.has(st.lastWord);
  return /[(,=:[!&|?{};+\-*%<>~^]/.test(st.lastSig);
}

/** Advances the JS state over one line's worth of script text. */
function jsScan(st, s) {
  let word = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const d = s[i + 1];
    switch (st.mode) {
      case 'line':
        return; // rest of the line is comment
      case 'block':
        if (c === '*' && d === '/') { st.mode = 'code'; i++; }
        continue;
      case 'sq':
        if (c === '\\') { i++; continue; }
        if (c === '\'') st.mode = 'code';
        continue;
      case 'dq':
        if (c === '\\') { i++; continue; }
        if (c === '"') st.mode = 'code';
        continue;
      case 'tpl':
        if (c === '\\') { i++; continue; }
        if (c === '`') { st.mode = 'code'; st.lastSig = '`'; word = ''; continue; }
        if (c === '$' && d === '{') { st.tplStack.push(st.depth); st.mode = 'code'; st.lastSig = '{'; word = ''; i++; }
        continue;
      case 'regex':
        if (c === '\\') { i++; continue; }
        if (st.regexClass) { if (c === ']') st.regexClass = false; continue; }
        if (c === '[') { st.regexClass = true; continue; }
        if (c === '/') {
          st.mode = 'code'; st.lastSig = '/'; word = '';
          while (/[a-z]/i.test(s[i + 1] || '')) i++; // flags
        }
        continue;
      default: // code
        break;
    }
    // code mode
    if (c === ' ' || c === '\t') { if (word) { st.lastWord = word; word = ''; } continue; }
    if (c === '/' && d === '/') { st.mode = 'line'; return; }
    if (c === '/' && d === '*') { st.mode = 'block'; i++; continue; }
    if (/[\w$]/.test(c)) { word += c; st.lastSig = c; continue; }
    if (word) { st.lastWord = word; word = ''; }
    if (c === '\'') { st.mode = 'sq'; st.lastSig = '\''; continue; }
    if (c === '"') { st.mode = 'dq'; st.lastSig = '"'; continue; }
    if (c === '`') { st.mode = 'tpl'; st.lastSig = '`'; continue; }
    if (c === '/') {
      if (jsRegexAllowed(st)) { st.mode = 'regex'; st.regexClass = false; continue; }
      st.lastSig = '/'; continue;
    }
    if (c === '{') { st.depth++; }
    else if (c === '}') {
      if (st.tplStack.length && st.depth === st.tplStack[st.tplStack.length - 1]) {
        st.tplStack.pop(); st.mode = 'tpl'; continue;
      }
      st.depth = Math.max(0, st.depth - 1);
    }
    else if (c === '(') st.paren++;
    else if (c === ')') st.paren = Math.max(0, st.paren - 1);
    else if (c === '[') st.bracket++;
    else if (c === ']') st.bracket = Math.max(0, st.bracket - 1);
    if (c.trim()) st.lastSig = c;
  }
  if (word) st.lastWord = word;
  // strings, regexes and line comments do not span lines
  if (st.mode === 'line' || st.mode === 'sq' || st.mode === 'dq' || st.mode === 'regex') st.mode = 'code';
}

const RE_FUNC = /^(?:export\s+)?(?:async\s+)?function\s*(\*?)\s*([A-Za-z_$][\w$]*)\s*\(([^)]*)\)?/;
const RE_DECL = /^(?:export\s+)?(const|let|var)\s+(.+?)\s*(?:=|;|$)/;
const RE_CLASS = /^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/;

function jsDeclaration(trimmed) {
  let m;
  if ((m = RE_FUNC.exec(trimmed))) {
    return { kind: m[1] ? 'function*' : 'function', name: m[2] + '(' + m[3].trim() + ')' };
  }
  if ((m = RE_CLASS.exec(trimmed))) return { kind: 'class', name: m[1] };
  if ((m = RE_DECL.exec(trimmed))) {
    const rhs = trimmed.slice(m[0].length).trim();
    let kind = m[1];
    if (/^(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(rhs) || /^(?:async\s+)?function\b/.test(rhs)) kind += ' fn';
    return { kind, name: m[2] };
  }
  return null;
}

// ---------------------------------------------------------------- markup tag scanner

function parseAttrs(s) {
  const attrs = {};
  const re = /([^\s"'=<>`/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(s))) {
    const k = m[1].toLowerCase();
    if (k in attrs) continue;
    attrs[k] = m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] != null ? m[4] : '';
  }
  return attrs;
}

function stripTags(s) {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------- main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = args.file;
  if (!fs.existsSync(file)) { console.error('No such file: ' + file); process.exit(2); }

  const liteFd = args.lite ? fs.openSync(args.lite, 'w') : null;
  const NL = Buffer.from('\n');

  const longLines = [];         // { n, len, prefix }
  const styleBlocks = [];       // { start, end, comments: [{n, text, depth, decorated}] }
  const scriptBlocks = [];      // { start, end, rows: [{n, kind, text}] , attrs }
  const landmarks = [];         // { n, depth, tag, id, role, label, expanded, classes, text }
  const markupRanges = [];      // [start, end] of lines holding markup outside style/script
  const finds = args.find.map(re => ({ re, hits: [] }));
  const peeks = args.lines.map(([from, to]) => ({ from, to, rows: [] }));
  let totalLines = 0, totalBytes = 0;

  // scanner state
  let mode = 'markup';
  const stack = [];             // open element names
  let cur = null;               // current style/script block being filled
  let cssSt = null, jsSt = null;
  let tagBuf = null, tagStart = 0;        // multi-line tag carry-over
  let inHtmlComment = false;
  let markupOpen = null;                  // start line of the current markup range
  let lastCssCommentRow = null;           // for merging comment runs

  function openMarkup(n) { if (markupOpen == null) markupOpen = n; }
  function closeMarkup(n) {
    if (markupOpen == null) return;
    const last = markupRanges[markupRanges.length - 1];
    if (last && markupOpen <= last[1] + 1) last[1] = Math.max(last[1], n);
    else markupRanges.push([markupOpen, n]);
    markupOpen = null;
  }

  function handleTag(raw, n, lineText) {
    // raw: "<...>" complete tag text
    const inner = raw.slice(1, -1);
    if (inner[0] === '!' || inner[0] === '?') return null;
    const closing = inner[0] === '/';
    const m = /^\/?\s*([A-Za-z][\w:-]*)/.exec(inner);
    if (!m) return null;
    const name = m[1].toLowerCase();
    if (closing) {
      const idx = stack.lastIndexOf(name);
      if (idx !== -1) stack.length = idx;
      return { name, closing: true };
    }
    const selfClosing = /\/\s*$/.test(inner);
    const attrText = inner.slice(m[0].length).replace(/\/\s*$/, '');
    const attrs = parseAttrs(attrText);
    const depth = stack.length;
    const isLandmark = ('id' in attrs) || ('aria-label' in attrs) || attrs.role === 'region'
      || name === 'h2' || (name === 'button' && 'aria-expanded' in attrs);
    if (isLandmark) {
      let text = '';
      if (lineText != null) {
        const after = lineText.indexOf(raw);
        if (after !== -1) {
          const rest = lineText.slice(after + raw.length);
          const close = rest.search(new RegExp('</' + name + '\\s*>', 'i'));
          text = stripTags(close === -1 ? rest : rest.slice(0, close));
        }
      }
      const aria = [];
      if (attrs.role) aria.push('role=' + attrs.role);
      if ('aria-label' in attrs) aria.push('aria-label="' + attrs['aria-label'] + '"');
      if ('aria-expanded' in attrs) aria.push('aria-expanded=' + attrs['aria-expanded']);
      if ('aria-pressed' in attrs) aria.push('aria-pressed=' + attrs['aria-pressed']);
      if ('aria-checked' in attrs) aria.push('aria-checked=' + attrs['aria-checked']);
      if ('aria-labelledby' in attrs) aria.push('aria-labelledby=' + attrs['aria-labelledby']);
      if ('aria-live' in attrs) aria.push('aria-live=' + attrs['aria-live']);
      if ('aria-hidden' in attrs) aria.push('aria-hidden=' + attrs['aria-hidden']);
      landmarks.push({ n, depth, tag: name, id: attrs.id || '', aria: aria.join(' '),
        classes: attrs.class || '', text, type: attrs.type || '' });
    }
    if (!selfClosing && !VOID.has(name)) stack.push(name);
    return { name, closing: false, attrs, selfClosing };
  }

  /** Scans markup text from position p; returns {p, switchTo, block} when a style/script opens. */
  function scanMarkup(t, p, n) {
    while (p < t.length) {
      if (inHtmlComment) {
        const e = t.indexOf('-->', p);
        if (e === -1) return { p: t.length };
        inHtmlComment = false; p = e + 3; continue;
      }
      if (tagBuf != null) {
        // continue an unterminated tag
        const end = findTagEnd(t, p);
        if (end === -1) { tagBuf += t.slice(p) + '\n'; return { p: t.length }; }
        const raw = tagBuf + t.slice(p, end + 1);
        tagBuf = null;
        const r = handleTag(raw, tagStart, null);
        p = end + 1;
        if (r && !r.closing && !r.selfClosing && (r.name === 'style' || r.name === 'script')) {
          return { p, switchTo: r.name, startLine: tagStart, attrs: r.attrs };
        }
        continue;
      }
      const lt = t.indexOf('<', p);
      if (lt === -1) return { p: t.length };
      if (t.startsWith('<!--', lt)) {
        const e = t.indexOf('-->', lt + 4);
        if (e === -1) { inHtmlComment = true; return { p: t.length }; }
        p = e + 3; continue;
      }
      if (!/[A-Za-z!?/]/.test(t[lt + 1] || '')) { p = lt + 1; continue; }
      const end = findTagEnd(t, lt);
      if (end === -1) { tagBuf = t.slice(lt) + '\n'; tagStart = n; return { p: t.length }; }
      const raw = t.slice(lt, end + 1);
      const r = handleTag(raw, n, t);
      p = end + 1;
      if (r && !r.closing && !r.selfClosing && (r.name === 'style' || r.name === 'script')) {
        return { p, switchTo: r.name, startLine: n, attrs: r.attrs };
      }
    }
    return { p };
  }

  /** Index of the '>' that closes the tag starting at t[lt]=='<', honouring quotes; -1 if none. */
  function findTagEnd(t, lt) {
    let q = null;
    for (let i = lt + 1; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === q) q = null; continue; }
      if (c === '"' || c === '\'') { q = c; continue; }
      if (c === '>') return i;
    }
    return -1;
  }

  function cssLine(seg, n, whole) {
    const depthAtStart = cssSt.depth;
    const startMode = cssSt.mode;
    const trimmed = seg.trim();
    if (startMode === 'comment' && cur.pending && trimmed) {
      // a multi-line comment that opened with a bare divider takes its title from this line
      cur.pending.text = (cleanComment(trimmed) || trimmed) + ' …';
      cur.pending = null;
    }
    if (startMode === 'code' && whole && trimmed) {
      let isComment = false, text = '', pending = false;
      if (/^\/\*[\s\S]*\*\/$/.test(trimmed) && trimmed.indexOf('*/') === trimmed.length - 2) {
        isComment = true; text = cleanComment(trimmed) || dividerText(trimmed);
      } else if (trimmed.startsWith('/*') && trimmed.indexOf('*/') === -1) {
        isComment = true; text = cleanComment(trimmed);
        if (text) text += ' …'; else { text = dividerText(trimmed); pending = true; }
      }
      if (isComment) {
        if (lastCssCommentRow && lastCssCommentRow.n + lastCssCommentRow.count === n && !isDecorated(trimmed) && !lastCssCommentRow.decorated) {
          lastCssCommentRow.count++;
        } else {
          lastCssCommentRow = { n, kind: 'comment', text, depth: depthAtStart, decorated: isDecorated(trimmed), count: 1 };
          cur.comments.push(lastCssCommentRow);
          cur.pending = pending ? lastCssCommentRow : null;
        }
      } else {
        lastCssCommentRow = null;
        // landmark rules at the top level: :root blocks and at-rules (@media, @keyframes, @font-face, @layer ...)
        if (depthAtStart === 0) {
          let m;
          if (/^:root\b/.test(trimmed)) {
            openCssRule = { n, kind: 'rule', text: trimmed.split('{')[0].trim() || ':root', depth: 0, decorated: false, count: 1 };
            cur.comments.push(openCssRule);
          } else if ((m = /^(@[a-z-]+)([^{;]*)/i.exec(trimmed))) {
            openCssRule = { n, kind: 'rule', text: (m[1] + ' ' + m[2].trim()).trim(), depth: 0, decorated: false, count: 1 };
            cur.comments.push(openCssRule);
          }
        }
      }
    } else if (trimmed) lastCssCommentRow = null;
    cssScan(cssSt, seg);
    if (openCssRule && cssSt.depth === 0 && cssSt.mode === 'code' && seg.indexOf('}') !== -1) {
      openCssRule.end = n;
      openCssRule = null;
    }
  }
  let openCssRule = null;

  /**
   * Script lines are classified as they stream (comment-only line, declaration, other) with the
   * tokenizer state at the start of the line. The block's "top level" is decided when the block
   * ends (finishScriptBlock): depth (0,0,0) when declarations exist there, otherwise the shallowest
   * state that holds declarations, which handles a script wrapped in an IIFE.
   */
  function jsLine(seg, n, whole) {
    const st = jsSt;
    const trimmed = seg.trim();
    if (DEBUG) {
      const key = `${st.mode}:${st.depth}:${st.paren}:${st.bracket}:${st.tplStack.length}`;
      cur.debug = cur.debug || { hist: new Map(), first: [] };
      cur.debug.hist.set(key, (cur.debug.hist.get(key) || 0) + 1);
      if (cur.debug.first.length < 8 && trimmed) cur.debug.first.push(`${n} [${key}] ${trimmed.slice(0, 50)}`);
    }
    if (st.mode === 'block' && cur.pending && trimmed) {
      // a multi-line comment that opened with a bare divider takes its title from this line
      cur.pending.text = (cleanComment(trimmed) || trimmed) + ' …';
      cur.pending = null;
    }
    if (whole && trimmed && st.mode === 'code' && st.tplStack.length === 0) {
      const state = { depth: st.depth, paren: st.paren, bracket: st.bracket };
      let item = null;
      if (/^\/\//.test(trimmed) || (/^\/\*[\s\S]*\*\/$/.test(trimmed) && trimmed.indexOf('*/') === trimmed.length - 2)) {
        item = { n, kind: isDecorated(trimmed) ? 'section' : 'comment', text: cleanComment(trimmed) || dividerText(trimmed), decorated: isDecorated(trimmed), state };
      } else if (trimmed.startsWith('/*') && trimmed.indexOf('*/') === -1) {
        const text = cleanComment(trimmed);
        item = { n, kind: isDecorated(trimmed) ? 'section' : 'comment', text: text ? text + ' …' : dividerText(trimmed), decorated: isDecorated(trimmed), state };
        if (!text) cur.pending = item;
      } else {
        const d = jsDeclaration(trimmed);
        if (d) item = { n, kind: d.kind, text: d.name, state };
        else item = { n, kind: 'other', state };
      }
      cur.lines.push(item);
    } else if (trimmed) {
      cur.lines.push({ n, kind: 'other', state: null });
    }
    jsScan(st, seg);
  }

  function stateKey(s) { return s ? `${s.depth}.${s.paren}.${s.bracket}` : 'x'; }

  function finishScriptBlock(b) {
    const decls = b.lines.filter(l => l.kind !== 'other' && l.kind !== 'comment' && l.kind !== 'section' && l.state);
    let base = { depth: 0, paren: 0, bracket: 0 };
    if (!decls.some(l => stateKey(l.state) === '0.0.0') && decls.length) {
      // shallowest state that holds declarations (an IIFE wrapper gives depth 1 / paren 1)
      decls.sort((a, c) => (a.state.depth - c.state.depth) || (a.state.paren - c.state.paren) || (a.state.bracket - c.state.bracket));
      base = decls[0].state;
    }
    b.base = base;
    const key = stateKey(base);
    let last = null;
    for (const l of b.lines) {
      if (!l.state || stateKey(l.state) !== key || l.kind === 'other') { last = null; continue; }
      if (l.kind === 'comment' || l.kind === 'section') {
        if (last && last.n + last.count === l.n && !l.decorated && !last.decorated) { last.count++; continue; }
        last = { n: l.n, kind: l.kind, text: l.text, count: 1, decorated: l.decorated };
        b.rows.push(last);
      } else {
        last = null;
        b.rows.push({ n: l.n, kind: l.kind, text: l.text, count: 1 });
      }
    }
    if (DEBUG && b.debug) {
      console.error(`[debug] script block ${b.start}–${b.end}: base ${key}; end state ${jsSt ? jsSt.mode : '?'}`);
      for (const [k, v] of [...b.debug.hist.entries()].sort((a, c) => c[1] - a[1]).slice(0, 12)) console.error(`  ${k}: ${v} lines`);
      for (const f of b.debug.first) console.error('  ' + f);
    }
  }

  for await (const line of readLines(file)) {
    totalLines = line.n;
    totalBytes += line.buf.length + (line.nl ? 1 : 0);
    const text = line.buf.toString('utf8');
    const n = line.n;
    const long = text.length >= LONG;
    if (long) longLines.push({ n, len: text.length, prefix: text.slice(0, PREFIX) });
    if (liteFd !== null && !long) { fs.writeSync(liteFd, line.buf); fs.writeSync(liteFd, NL); }

    const t = text.replace(/\r$/, '');
    for (const r of peeks) {
      if (n >= r.from && n <= r.to) r.rows.push({ n, excerpt: long ? '(long line)' : t.slice(0, 80) + (t.length > 80 ? '…' : '') });
    }
    for (const f of finds) {
      const m = f.re.exec(t);
      if (!m) continue;
      let excerpt;
      if (long) excerpt = '(long line)';
      else {
        const a = Math.max(0, m.index - 20);
        excerpt = (a > 0 ? '…' : '') + t.slice(a, a + 80) + (a + 80 < t.length ? '…' : '');
      }
      f.hits.push({ n, excerpt });
    }
    let p = 0;
    let guard = 0;
    while (p <= t.length && guard++ < 10000) {
      if (mode === 'markup') {
        openMarkup(n);
        const r = scanMarkup(t, p, n);
        p = r.p;
        if (r.switchTo) {
          closeMarkup(n);
          mode = r.switchTo;
          cur = { start: r.startLine, end: null, comments: [], rows: [], lines: [], attrs: r.attrs || {} };
          if (mode === 'style') { styleBlocks.push(cur); cssSt = makeCssState(); lastCssCommentRow = null; }
          else { scriptBlocks.push(cur); jsSt = makeJsState(); }
          continue;
        }
        break;
      }
      // inside style or script: look for the end tag
      const endRe = mode === 'style' ? /<\/style\s*>/i : /<\/script\s*>/i;
      const rest = t.slice(p);
      const m = endRe.exec(rest);
      const seg = m ? rest.slice(0, m.index) : rest;
      const whole = p === 0 && !m;
      if (mode === 'style') cssLine(seg, n, whole || (p === 0 && m && seg.trim() !== ''));
      else jsLine(seg, n, whole || (p === 0 && m && seg.trim() !== ''));
      if (!m) break;
      cur.end = n;
      if (mode === 'script') finishScriptBlock(cur);
      cur = null;
      p = p + m.index;
      mode = 'markup';
      // let the markup scanner consume the close tag so the stack pops
      // (it will see "</style>" or "</script>" at position p)
    }
  }
  if (cur) { cur.end = totalLines; if (mode === 'script') finishScriptBlock(cur); }
  closeMarkup(totalLines);
  if (liteFd !== null) fs.closeSync(liteFd);

  // ---------------------------------------------------------------- lite line rule
  const removed = longLines.map(l => l.n);
  const toLite = n => {
    if (removed.includes(n)) return '—';
    let k = 0; for (const r of removed) if (r < n) k++;
    return String(n - k);
  };

  // ---------------------------------------------------------------- report
  const out = [];
  const w = s => out.push(s);
  const base = path.basename(file);
  const stat = fs.statSync(file);
  w(`## Study map: \`${base}\``);
  w('');
  w(`Generated by \`prep/scripts/study-map.js\` on ${new Date().toISOString().slice(0, 10)}. ` +
    `Line numbers are for the full file; the **Lite** column is the same line in the texture-stripped copy (section 5).`);
  w('');
  const range = r => (r[0] === r[1] ? String(r[0]) : `${r[0]}–${r[1]}`);
  w(`- ${totalLines.toLocaleString('en-US')} lines, ${totalBytes.toLocaleString('en-US')} bytes (${(stat.size / 1e6).toFixed(2)} MB)`);
  w(`- ${longLines.length} line${longLines.length === 1 ? '' : 's'} of ${LONG.toLocaleString('en-US')}+ characters` +
    (longLines.length ? ` (${longLines.map(l => l.n).join(', ')})` : ''));
  w(`- ${styleBlocks.length} \`<style>\` block${styleBlocks.length === 1 ? '' : 's'}: ` +
    styleBlocks.map(b => `${b.start}–${b.end}`).join(', '));
  w(`- ${scriptBlocks.length} \`<script>\` block${scriptBlocks.length === 1 ? '' : 's'}: ` +
    scriptBlocks.map(b => `${b.start}–${b.end}`).join(', '));
  w(`- markup outside those blocks: ` + markupRanges.filter(r => r[1] >= r[0]).map(range).join(', '));
  w(`- ${landmarks.length} markup landmarks (${landmarks.filter(l => l.id).length} with an id, ` +
    `${landmarks.filter(l => /aria-label=/.test(l.aria)).length} with aria-label, ` +
    `${landmarks.filter(l => /role=region/.test(l.aria)).length} role=region, ` +
    `${landmarks.filter(l => l.tag === 'h2').length} h2, ` +
    `${landmarks.filter(l => l.tag === 'button' && /aria-expanded=/.test(l.aria)).length} buttons with aria-expanded)`);
  w('');

  // 1. long lines
  w(`### 1. Long lines (never load these)`);
  w('');
  if (!longLines.length) w('None.');
  else {
    w(`| Line | Length (chars) | First ${PREFIX} characters |`);
    w('|---|---|---|');
    for (const l of longLines) w(`| ${l.n} | ${l.len.toLocaleString('en-US')} | ${code(l.prefix, PREFIX + 2)} |`);
  }
  w('');
  w(`Rule: a line is long when its length (including a trailing CR) is ${LONG.toLocaleString('en-US')} or more, the complement of \`awk 'length($0) < ${LONG}'\`.`);
  w('');

  // 2. style blocks
  w(`### 2. \`<style>\` blocks and their section comments`);
  w('');
  if (!styleBlocks.length) w('None.');
  styleBlocks.forEach((b, i) => {
    const attrs = Object.entries(b.attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
    w(`#### Style block ${i + 1}: lines ${b.start}–${b.end}${attrs ? ' (' + cell(attrs) + ')' : ''}`);
    w('');
    if (!b.comments.length) { w('No comments on their own line.'); w(''); return; }
    const nc = b.comments.filter(c => c.kind === 'comment').length;
    w(`${nc} comment rows (comments on their own line; **bold** = decorated), ${b.comments.length - nc} rule rows (top-level \`:root\` blocks and at-rules, listed so token ranges can be checked).`);
    w('');
    w('| Line | Lite | Kind | Section comment / rule | Note |');
    w('|---|---|---|---|---|');
    for (const c of b.comments) {
      const notes = [];
      if (c.depth > 0) notes.push('inside a rule');
      if (c.count > 1) notes.push(`+${c.count - 1} more comment line${c.count > 2 ? 's' : ''}`);
      const text = c.kind === 'rule' ? code(c.text) : (c.decorated ? '**' + cell(c.text) + '**' : cell(c.text));
      const lines = c.kind === 'rule' && c.end && c.end !== c.n ? `${c.n}–${c.end}` : String(c.n);
      const lite = c.kind === 'rule' && c.end && c.end !== c.n ? `${toLite(c.n)}–${toLite(c.end)}` : toLite(c.n);
      w(`| ${lines} | ${lite} | ${c.kind} | ${text} | ${notes.join(', ')} |`);
    }
    w('');
  });

  // 3. markup landmarks
  const mr = markupRanges.filter(r => r[1] >= r[0]);
  w(`### 3. Markup landmarks (lines ${mr.map(range).join(', ')})`);
  w('');
  w('Every element with an `id`, with `aria-label` or `role="region"`, every `<h2>`, and every `<button>` with `aria-expanded`. ' +
    'Depth = number of open ancestors at that point (the `<style>`/`<script>` elements count; their contents are not scanned). ' +
    'Text is the element\'s own text when its closing tag is on the same line.');
  w('');
  if (!landmarks.length) w('None.');
  else {
    w('| Line | Lite | Depth | Element | id | ARIA | class | Text |');
    w('|---|---|---|---|---|---|---|---|');
    for (const l of landmarks) {
      const el = l.tag + (l.type ? `[type=${l.type}]` : '');
      w(`| ${l.n} | ${toLite(l.n)} | ${l.depth} | ${code(el)} | ${l.id ? code(l.id) : ''} | ${cell(l.aria)} | ${l.classes ? code(l.classes, 50) : ''} | ${cell(l.text, 50)} |`);
    }
  }
  w('');

  // 4. script blocks
  w(`### 4. \`<script>\` blocks: section comments and top-level declarations`);
  w('');
  w('Top level = brace, paren and bracket depth 0 outside strings, template literals and comments. ' +
    '**Bold** rows are decorated comments (`// ---- x ----`, `// ==== x ====`); plain comment rows are runs of top-level comment lines (first line shown). ' +
    'Declaration rows give the kind (`function`, `const`, `const fn` for an arrow or function expression, `let`, `var`, `class`) and the name or pattern.');
  w('');
  if (!scriptBlocks.length) w('None.');
  scriptBlocks.forEach((b, i) => {
    const attrs = Object.entries(b.attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
    const fns = b.rows.filter(r => /^function/.test(r.kind)).length;
    const consts = b.rows.filter(r => /^(const|let|var|class)/.test(r.kind)).length;
    const comments = b.rows.filter(r => r.kind === 'comment' || r.kind === 'section').length;
    w(`#### Script block ${i + 1}: lines ${b.start}–${b.end}${attrs ? ' (' + cell(attrs) + ')' : ''}`);
    w('');
    const bk = b.base ? stateKey(b.base) : '0.0.0';
    w(`${fns} top-level functions, ${consts} top-level const/let/var/class declarations, ${comments} comment rows.` +
      (bk !== '0.0.0' ? ` Top level here is brace/paren/bracket depth ${bk.replace(/\./g, '/')}: the code is wrapped (an IIFE or similar), and declarations sit inside the wrapper.` : ''));
    w('');
    if (!b.rows.length) { w('Nothing at top level.'); w(''); return; }
    w('| Line | Lite | Kind | Name / comment |');
    w('|---|---|---|---|');
    for (const r of b.rows) {
      let text;
      if (r.kind === 'comment' || r.kind === 'section') {
        text = cell(r.text) + (r.count > 1 ? ` *(+${r.count - 1} line${r.count > 2 ? 's' : ''})*` : '');
        if (r.decorated) text = '**' + cell(r.text) + '**' + (r.count > 1 ? ` *(+${r.count - 1})*` : '');
      } else text = code(r.text);
      w(`| ${r.n} | ${toLite(r.n)} | ${r.kind} | ${text} |`);
    }
    w('');
  });

  // 5. lite rule
  w(`### 5. Full-file line → lite-copy line`);
  w('');
  w(`The lite copy is the full file with every line of ${LONG.toLocaleString('en-US')}+ characters removed (\`awk 'length($0) < ${LONG}'\`, or this script's \`--lite\`). ` +
    `**lite = full − (number of removed lines above full).** A removed line has no lite line. ` +
    `Going back: full = lite + (number of removed lines at or below that point).`);
  w('');
  if (!removed.length) w(`No lines are removed, so both files have the same ${totalLines} lines.`);
  else {
    w('| Full-file lines | Lite lines | Shift |');
    w('|---|---|---|');
    let prev = 1, k = 0;
    const edges = [...removed, totalLines + 1];
    for (const r of edges) {
      if (prev <= r - 1) {
        const a = prev, b = r - 1;
        w(`| ${a}–${b} | ${a - k}–${b - k} | ${k === 0 ? 'same' : '−' + k} |`);
      }
      if (r <= totalLines) { w(`| ${r} | — | removed |`); k++; }
      prev = r + 1;
    }
    w('');
    w(`Lite copy: ${totalLines - removed.length} lines.`);
  }
  w('');

  // 6. --find (optional)
  if (finds.length) {
    w(`### 6. \`--find\` matches`);
    w('');
    for (const f of finds) {
      w(`#### ${code(f.re.source)} — ${f.hits.length} line${f.hits.length === 1 ? '' : 's'}`);
      w('');
      if (!f.hits.length) { w('No match.'); w(''); continue; }
      w('| Line | Lite | Excerpt |');
      w('|---|---|---|');
      for (const h of f.hits.slice(0, 200)) w(`| ${h.n} | ${toLite(h.n)} | ${code(h.excerpt, 100)} |`);
      if (f.hits.length > 200) w(`| … | | ${f.hits.length - 200} more |`);
      w('');
    }
  }

  // 7. --lines (optional)
  if (peeks.length) {
    w(`### ${finds.length ? 7 : 6}. \`--lines\` excerpts (first 80 characters of each line)`);
    w('');
    for (const r of peeks) {
      w(`#### Lines ${r.from}–${r.to}`);
      w('');
      w('| Line | Lite | Excerpt |');
      w('|---|---|---|');
      for (const h of r.rows) w(`| ${h.n} | ${toLite(h.n)} | ${code(h.excerpt, 100)} |`);
      w('');
    }
  }
  process.stdout.write(out.join('\n') + '\n');
}

main().catch(err => { console.error(err && err.stack || String(err)); process.exit(1); });
