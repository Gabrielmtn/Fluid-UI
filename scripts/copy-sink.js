// ═══════════════════════════════════════════════════════════════════
// scripts/copy-sink.js — the copy kitchen sink: every line of text a
// player can read in the app (tooltips, labels, buttons, toasts, dialogs,
// recipe answers, page text), bound to the exact source it came from, so
// it can be rewritten from one page and written straight back into
// index.html / js/*.js / css/*.css. Everything runs on this machine: the
// "server" is this script, serving the page and writing the repo's files.
//
// The ledger (copy-sink/ledger.json, committed) records each line Gabriel
// has touched: kept as is, rewritten (mine), or not player text (code).
// `check` counts the lines still in their original wording; zero means
// every line in the build has been through his hands.
//
//   node scripts/copy-sink.js serve [port]     serve the repo + the sink at
//                                              http://127.0.0.1:3998/__sink/
//   node scripts/copy-sink.js check [all]      lines left untouched (exit 1 while any)
//   node scripts/copy-sink.js drops            audit what the net judged to be code
//   node scripts/copy-sink.js extract          print the catalog (JSON)
//   node scripts/copy-sink.js stats            counts by kind and file
//   node scripts/copy-sink.js harvest [url]    headless Chrome: attach the
//                                              runtime context (section, label,
//                                              control) to every string →
//                                              scripts/copy-sink/runtime.json
//   node scripts/copy-sink.js apply edits.json write an exported edit set
//
// Binding model. The extractor tokenizes index.html (attributes, hint-like
// text, inline scripts) and the JS chunks (strings with comments masked
// out) and records, for each copy string, the byte span of the literal(s)
// that hold it plus how to re-encode it (HTML attribute, HTML text, JS
// quote, template). Chains like 'a' + 'b' collapse into one literal on
// write; a trailing dynamic part (' + name) is kept and the entry is
// marked partial. Every entry's key is file + encoding + original text +
// its ordinal among identical texts in that file, so an edit survives the
// line drift caused by the edits applied before it. Apply re-extracts,
// re-finds each key, verifies the original text is still there, and
// replaces from the end of the file backwards.
//
// Runtime harvest (optional) loads the app in headless Chrome, walks the
// DOM for every title / placeholder / aria-label, pops the effect cards
// and reads the recipe registry, and pairs each text with a catalog
// entry, so the sink can show the string next to the labeled control it
// belongs to. Strings only reachable through a helper argument are bound
// there by literal search.
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

// COPY_SINK_REPO points the whole tool at another checkout (the round-trip
// test runs it against a scratch copy so it never writes the real tree).
const REPO = process.env.COPY_SINK_REPO ? path.resolve(process.env.COPY_SINK_REPO) : path.resolve(__dirname, '..');
const SINK_DIR = path.join(__dirname, 'copy-sink');
const RUNTIME_JSON = process.env.COPY_SINK_REPO ? path.join(REPO, 'copy-sink-runtime.json') : path.join(SINK_DIR, 'runtime.json');
const LEDGER_JSON = process.env.COPY_SINK_REPO ? path.join(REPO, 'copy-sink-ledger.json') : path.join(SINK_DIR, 'ledger.json');
const DEFAULT_PORT = 3998;

// Files that carry user-facing copy: what electron-builder packs (see
// package.json build.files). 39-qrcode is a vendored encoder; 44
// ("How do I…", parked 2026-10-14) is left out of the build.
function copyFiles() {
    const js = fs.readdirSync(path.join(REPO, 'js'))
        .filter((f) => /\.js$/.test(f) && !/^39-qrcode/.test(f) && !/^44-recipes/.test(f))
        .map((f) => 'js/' + f);
    return ['index.html', ...js, 'electron-main.js', 'electron-pen-cursor.js'].filter((f) => fs.existsSync(path.join(REPO, f)));
}
function cssFiles() {
    const dir = path.join(REPO, 'css');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => /\.css$/.test(f)).map((f) => 'css/' + f);
}

// ── helpers ────────────────────────────────────────────────────────
const wordCount = (s) => (s.match(/[A-Za-z\u00C0-\u024F][\w'’-]*/g) || []).length;
const sha8 = (s) => crypto.createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 8);
// Line of an offset. Callers ask many times of the same file in a row, so the
// newline offsets of the last file are kept.
let lineSrc = null, lineFn = null;
function lineOf(src, off) { if (src !== lineSrc) { lineSrc = src; lineFn = lineIndex(src); } return lineFn(off); }
// Newline offsets once, then a binary search.
function lineIndex(src) {
    const nl = []; for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) nl.push(i);
    return (off) => { let lo = 0, hi = nl.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (nl[mid] < off) lo = mid + 1; else hi = mid; } return lo + 1; };
}
const normText = (s) => String(s).replace(/\s+/g, ' ').trim();

// Kinds that are copy no matter how short; the rest need to read like a
// sentence before they count (labels, glyphs and names are not the target).
const ALWAYS = new Set(['title', 'placeholder', 'aria-label', 'ariaLabel', 'hint', 'tip', 'desc', 'description', 'message', 'answer', 'data-tip', 'alt']);
function sentenceish(kind, text) {
    if (ALWAYS.has(kind)) return text.trim().length >= 2 && /[A-Za-z]/.test(text);
    const w = wordCount(text);
    return w >= 4 || (w >= 2 && text.trim().length >= 24 && /[.!?…—]/.test(text));
}
function looksLikeCode(text) {
    const t = text.trim();
    if (!t || /^[a-z_$][\w$]*$/.test(t) || /^[\w$]*[.$-][\w$.-]*$/.test(t)) return true; // identifiers, ids, class names (a capitalised single word — "Minimize" — is copy)
    if (/^(https?:|data:|file:|\.\/|\/|#)/.test(t) || /^[\d.,%\s:-]+$/.test(t)) return true;
    if (/^[\w-]+:\s*[^;]+;/.test(t) && /;\s*$/.test(t)) return true; // cssText
    if (/[.#@\w\s,:>-]+\{[^}]*:[^}]*;[^}]*\}/.test(t) && !/[.!?]\s|[.!?]$/.test(t.replace(/\{[^}]*\}/g, ''))) return true; // a stylesheet
    if (/^</.test(t) && wordCount(t.replace(/<[^>]*>/g, ' ')) < 3) return true; // markup without prose
    return false;
}

// ── JS: strings + comment mask ─────────────────────────────────────
// Walks the source once. Returns the string tokens (with decoded values)
// and a copy of the source where comments are blanked to spaces so the
// anchor regexes cannot fire inside them. Regex literals are recognised by
// the usual "what came before" heuristic so a /['"]/ cannot poison the
// string state.
function scanJs(src, base) {
    base = base || 0;
    const tokens = [];
    const byStart = new Map();
    const mask = src.split('');
    const n = src.length;
    let i = 0;
    let lastSig = '';   // last significant char (for the regex heuristic)
    const push = (t) => { tokens.push(t); byStart.set(t.start, t); };
    while (i < n) {
        const c = src[i], d = src[i + 1];
        if (c === '/' && d === '/') {
            let j = i; while (j < n && src[j] !== '\n') { mask[j] = ' '; j++; }
            i = j; continue;
        }
        if (c === '/' && d === '*') {
            let j = i + 2; while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
            for (let k = i; k < Math.min(n, j + 2); k++) if (src[k] !== '\n') mask[k] = ' ';
            i = j + 2; continue;
        }
        if (c === "'" || c === '"' || c === '`') {
            const q = c; const start = i; let j = i + 1; let raw = ''; let hasExpr = false; let depth = 0;
            while (j < n) {
                const ch = src[j];
                if (ch === '\\') { raw += ch + (src[j + 1] || ''); j += 2; continue; }
                if (q === '`' && ch === '$' && src[j + 1] === '{') {
                    hasExpr = true; depth = 1; raw += '${'; j += 2;
                    while (j < n && depth > 0) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; raw += src[j]; j++; }
                    continue;
                }
                if (ch === q) break;
                if (ch === '\n' && q !== '`') break;   // unterminated: bail
                raw += ch; j++;
            }
            const end = Math.min(n, j + 1);
            push({ start: base + start, end: base + end, quote: q, raw, hasExpr, value: hasExpr ? raw : decodeJs(raw) });
            lastSig = q;
            i = end; continue;
        }
        if (c === '/' && /[(,=:\[!&|?{};+\-*%<>~^]|^$/.test(lastSig)) {
            // regex literal
            let j = i + 1; let inClass = false;
            while (j < n && src[j] !== '\n') {
                if (src[j] === '\\') { j += 2; continue; }
                if (src[j] === '[') inClass = true; else if (src[j] === ']') inClass = false;
                else if (src[j] === '/' && !inClass) break;
                j++;
            }
            j++; while (j < n && /[a-z]/.test(src[j])) j++;
            lastSig = '/'; i = j; continue;
        }
        if (!/\s/.test(c)) lastSig = c;
        i++;
    }
    return { tokens, byStart, mask: mask.join('') };
}
function decodeJs(raw) {
    return raw.replace(/\\(u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|\r?\n|.)/g, (m, all, ub, u4, x2) => {
        if (ub) return String.fromCodePoint(parseInt(ub, 16));
        if (u4) return String.fromCharCode(parseInt(u4, 16));
        if (x2) return String.fromCharCode(parseInt(x2, 16));
        if (/^\r?\n$/.test(all)) return '';
        return ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' })[all] ?? all;
    });
}
function encodeJs(text, quote) {
    // A template keeps its line breaks as they are (the source layout survives).
    let out = text.replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
        .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    if (quote !== '`') out = out.replace(/\n/g, '\\n');
    if (quote === '`') out = out.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    else out = out.split(quote).join('\\' + quote);
    return quote + out + quote;
}

// Read a literal chain ('a' + 'b' ...) starting at offset p of the mask.
function readChain(mask, byStart, p, base) {
    base = base || 0;
    const ws = (k) => { while (k < mask.length && /\s/.test(mask[k])) k++; return k; };
    let k = ws(p);
    const first = byStart.get(base + k);
    if (!first) return null;
    const parts = [first]; let partial = false;
    k = first.end - base;
    for (;;) {
        const k2 = ws(k);
        if (mask[k2] !== '+') break;
        const k3 = ws(k2 + 1);
        const t = byStart.get(base + k3);
        if (!t) { partial = true; break; }
        parts.push(t); k = t.end - base;
    }
    const hasExpr = parts.some((t) => t.hasExpr);
    return {
        start: parts[0].start, end: parts[parts.length - 1].end,
        quote: parts[0].quote, hasExpr, partial,
        value: parts.map((t) => t.value).join(''),
        parts: parts.length
    };
}

// Identifier (dotted) ending right before offset k in the mask.
function receiverBefore(mask, k) {
    let j = k; while (j > 0 && /[\w$.\]\[]/.test(mask[j - 1])) j--;
    return mask.slice(j, k);
}
// Name of the enclosing function above offset k (best effort).
function enclosingFn(mask, k) {
    const head = mask.slice(Math.max(0, k - 6000), k);
    const re = /function\s+([A-Za-z_$][\w$]*)\s*\(|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\()|([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?function\b/g;
    let m, last = null;
    while ((m = re.exec(head))) last = m[1] || m[2] || m[3];
    return last || '';
}
const PROP_KEYS = 'title|answer|hint|tip|desc|description|message|placeholder|text|label|name|body|sub|caption|note|summary|detail|info|help';

function extractJs(src, file, base, entries) {
    base = base || 0;
    const { tokens, byStart, mask } = scanJs(src, base);
    const seen = new Set();
    const add = (kind, chain, ctx) => {
        if (!chain || seen.has(chain.start)) return;
        const text = chain.value;
        // innerHTML is the net's: it cuts markup into its text runs, which
        // stay the same shape however a run is reworded (a whole-literal
        // entry here would swallow the runs once one grew into a sentence).
        if (kind === 'innerHTML') return;
        if (!sentenceish(kind, text) || looksLikeCode(text)) return;
        seen.add(chain.start);
        entries.push({
            file, kind, enc: chain.hasExpr ? 'js-template-expr' : 'js', quote: chain.quote,
            start: chain.start, end: chain.end, line: lineOf(src, chain.start - base),
            text, partial: chain.partial, parts: chain.parts,
            ctx: Object.assign({ fn: enclosingFn(mask, chain.start - base) }, ctx)
        });
    };
    let m;
    // A: el.title = '…'   el.placeholder = '…'   hint.textContent = '…'
    const reA = /\.(title|placeholder|textContent|innerHTML|innerText|ariaLabel)\s*=(?!=)\s*/g;
    while ((m = reA.exec(mask))) {
        const chain = readChain(mask, byStart, m.index + m[0].length, base);
        add(m[1] === 'ariaLabel' ? 'aria-label' : m[1], chain, { receiver: receiverBefore(mask, m.index) });
    }
    // B: setAttribute('title', '…')
    const reB = /\.setAttribute\(\s*(['"])(title|aria-label|placeholder|data-tip|alt)\1\s*,\s*/g;
    while ((m = reB.exec(mask))) {
        const chain = readChain(mask, byStart, m.index + m[0].length, base);
        add(m[2], chain, { receiver: receiverBefore(mask, m.index) });
    }
    // C: { title: '…', answer: '…' }  (preceded by { or , — never a ternary)
    const reC = new RegExp('\\b(' + PROP_KEYS + ')\\s*:\\s*', 'g');
    while ((m = reC.exec(mask))) {
        let j = m.index; while (j > 0 && /\s/.test(mask[j - 1])) j--;
        const prev = mask[j - 1];
        if (prev !== '{' && prev !== ',') continue;
        const chain = readChain(mask, byStart, m.index + m[0].length, base);
        add(m[1], chain, { key: m[1] });
    }
    // D: { 'Brush Size': '…' }  quoted keys → tooltip / hint tables
    const reD = /(['"])([^'"\n]{1,48})\1\s*:\s*/g;
    while ((m = reD.exec(mask))) {
        let j = m.index; while (j > 0 && /\s/.test(mask[j - 1])) j--;
        const prev = mask[j - 1];
        if (prev !== '{' && prev !== ',') continue;
        const chain = readChain(mask, byStart, m.index + m[0].length, base);
        if (chain && wordCount(chain.value) >= 3) add('table', chain, { key: m[2] });
    }
    // E: title="…" inside HTML that lives in a JS string (innerHTML templates).
    // Bound at the attribute value inside the literal; written back HTML-
    // encoded and then JS-escaped for the literal's own quote.
    for (const t of tokens) {
        if (!/\b(title|placeholder|aria-label|data-tip)=\\?["']/.test(t.raw)) continue;
        const reE = /\b(title|placeholder|aria-label|data-tip)=(\\?)(["'])/g; let am;
        while ((am = reE.exec(t.raw))) {
            const q = am[2] + am[3];                       // the quote as it appears in the raw literal (maybe \")
            const vStart = am.index + am[0].length;
            const vEnd = t.raw.indexOf(q, vStart);
            if (vEnd < 0) continue;
            const before = t.raw.slice(0, vStart);
            if (t.hasExpr && (before.split('${').length - 1) > (before.split('}').length - 1)) continue; // inside ${…}
            const rawVal = t.raw.slice(vStart, vEnd);
            if (t.hasExpr && rawVal.includes('${')) continue;
            const text = decodeHtml(decodeJs(rawVal));
            if (!sentenceish(am[1], text) || looksLikeCode(text)) continue;
            const start = t.start + 1 + vStart, end = t.start + 1 + vEnd;
            if (seen.has(start)) continue;
            seen.add(start);
            const tagm = /<([a-zA-Z][\w-]*)([^<>]*)$/.exec(before);
            const idm = tagm && /\bid=\\?["']([^"'\\]+)/.exec(tagm[2]);
            entries.push({
                file, kind: am[1], enc: 'js-html-attr', quote: t.quote, htmlQuote: am[3],
                start, end, line: lineOf(src, start - base), text, partial: false, parts: 1,
                ctx: { fn: enclosingFn(mask, t.start - base), tag: tagm ? tagm[1].toLowerCase() : '', id: idm ? idm[1] : '', inHtmlString: true }
            });
        }
    }
}

// ── HTML: attributes, hint-like text, inline scripts ───────────────
const VOID = new Set(['input', 'br', 'img', 'hr', 'meta', 'link', 'source', 'wbr', 'area', 'col', 'embed', 'param', 'track', 'base']);
const ATTR_KINDS = new Set(['title', 'placeholder', 'aria-label', 'data-tip', 'alt']);
const TEXT_TAGS = new Set(['p', 'li', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'small', 'em', 'strong', 'b', 'summary', 'figcaption', 'td']);
const INLINE_TAGS = /^(b|em|strong|small|span|kbd|code|i|br)$/;
const HINT_RE = /hint|help|note|desc|caption|tip|pw-|footer|splash|warn|empty|status|message|blurb|sub|intro|lead/i;

function decodeHtml(s) {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', hellip: '…', mdash: '—', ndash: '–', middot: '·', rarr: '→', larr: '←', times: '×', deg: '°', copy: '©' };
    return s.replace(/&(#x([0-9a-fA-F]+)|#(\d+)|([a-zA-Z]+));/g, (m, all, hx, dec, nm) => {
        if (hx) return String.fromCodePoint(parseInt(hx, 16));
        if (dec) return String.fromCodePoint(parseInt(dec, 10));
        return nm in named ? named[nm] : m;
    });
}
function encodeHtmlAttr(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, '&#10;');
}
const stripTags = (s) => decodeHtml(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

function extractHtml(src, file, entries) {
    const n = src.length;
    let i = 0;
    const stack = [];            // open elements
    let lastHeading = '';
    const labelsFor = new Map(); // id → label text

    const reLab = /<label\b([^>]*)>([\s\S]*?)<\/label>/g; let lm;
    while ((lm = reLab.exec(src))) {
        const f = /\bfor="([^"]*)"/.exec(lm[1]);
        if (f) labelsFor.set(f[1], stripTags(lm[2].replace(/<span[^>]*class="[^"]*value-display[^"]*"[^>]*>[\s\S]*?<\/span>/g, '')));
    }

    function innerRange(tag, from) {
        const reOpen = new RegExp('<' + tag + '\\b', 'g'), reClose = new RegExp('</' + tag + '\\s*>', 'g');
        let depth = 1, pos = from;
        for (;;) {
            reOpen.lastIndex = pos; reClose.lastIndex = pos;
            const o = reOpen.exec(src), c = reClose.exec(src);
            if (!c) return null;
            if (o && o.index < c.index) { depth++; pos = o.index + 1; continue; }
            depth--; if (depth === 0) return { start: from, end: c.index };
            pos = c.index + 1;
        }
    }
    const ancestors = () => stack.map((s) => s.tag + (s.id ? '#' + s.id : (s.cls ? '.' + s.cls.split(/\s+/)[0] : ''))).slice(-4).join(' > ');
    const inDialog = () => stack.some((s) => s.attrs.role === 'dialog' || s.id === 'hotkeyOverlay' || s.id === 'photoWarn' || /modal|overlay/.test(s.cls));

    // Every text node a player can read (the wide net's HTML half): labels,
    // captions, options, headings. <head> is skipped except the window title.
    const li = lineIndex(src);
    const nodes = [];
    function textNode(a, b) {
        if (stack.some((s) => s.tag === 'noscript' || s.tag === 'template')) return;
        const top = stack[stack.length - 1];
        if (stack.some((s) => s.tag === 'head') && !(top && top.tag === 'title')) return;
        while (a < b && /\s/.test(src[a])) a++;
        while (b > a && /\s/.test(src[b - 1])) b--;
        if (b <= a) return;
        // Line breaks and indents fold to one space; a &nbsp; stays (it is layout).
        const text = decodeHtml(src.slice(a, b)).replace(/[ \t\r\n]+/g, ' ');
        if (!pageWords(text)) return;
        let label = '';
        if (top && top.id && labelsFor.has(top.id)) label = labelsFor.get(top.id);
        nodes.push({
            file, kind: 'page text', enc: 'html-node', quote: null, start: a, end: b, line: li(a), text, partial: false, parts: 1,
            ctx: { tag: top ? top.tag : '', id: top ? top.id : '', cls: top ? (top.cls.split(/\s+/)[0] || '') : '', label, heading: lastHeading, path: ancestors() }
        });
    }

    while (i < n) {
        if (src.startsWith('<!--', i)) { const j = src.indexOf('-->', i); i = j < 0 ? n : j + 3; continue; }
        if (src[i] !== '<') { const j0 = src.indexOf('<', i); const j = j0 < 0 ? n : j0; textNode(i, j); i = j; continue; }
        if (src[i + 1] === '/') {
            const m = /^<\/([a-zA-Z][\w-]*)\s*>/.exec(src.slice(i, i + 40));
            if (m) { for (let k = stack.length - 1; k >= 0; k--) if (stack[k].tag === m[1].toLowerCase()) { stack.length = k; break; } i += m[0].length; } else i++;
            continue;
        }
        if (src[i + 1] === '!') { const j = src.indexOf('>', i); i = j < 0 ? n : j + 1; continue; }   // <!DOCTYPE …>
        const tm = /^<([a-zA-Z][\w-]*)/.exec(src.slice(i, i + 40));
        if (!tm) { i++; continue; }
        const tag = tm[1].toLowerCase();
        let j = i + tm[0].length; const attrs = {}; const attrSpans = [];
        while (j < n && src[j] !== '>') {
            if (/\s/.test(src[j]) || src[j] === '/') { j++; continue; }
            const am = /^([^\s=\/>]+)(\s*=\s*)?/.exec(src.slice(j, j + 200));
            if (!am) { j++; continue; }
            const name = am[1].toLowerCase(); j += am[0].length;
            if (am[2]) {
                const q = src[j];
                if (q === '"' || q === "'") {
                    const e = src.indexOf(q, j + 1); const vEnd = e < 0 ? n : e;
                    attrs[name] = decodeHtml(src.slice(j + 1, vEnd));
                    attrSpans.push({ name, start: j + 1, end: vEnd, quote: q });
                    j = vEnd + 1;
                } else { const vm = /^[^\s>]*/.exec(src.slice(j)); attrs[name] = vm[0]; j += vm[0].length; }
            } else attrs[name] = '';
        }
        const open = j + 1;
        const id = attrs.id || '', cls = attrs.class || '';
        if (/^h[1-4]$/.test(tag)) { const r = innerRange(tag, open); if (r) lastHeading = stripTags(src.slice(r.start, r.end)); }
        for (const a of attrSpans) {
            if (!ATTR_KINDS.has(a.name)) continue;
            const text = decodeHtml(src.slice(a.start, a.end));
            if (!sentenceish(a.name, text) || looksLikeCode(text)) continue;
            let label = '';
            if (tag === 'label') { const r = innerRange('label', open); if (r) label = stripTags(src.slice(r.start, r.end).replace(/<span[^>]*value-display[^>]*>[\s\S]*?<\/span>/g, '')); }
            else if (id && labelsFor.has(id)) label = labelsFor.get(id);
            else if (attrs.for && labelsFor.has(attrs.for)) label = labelsFor.get(attrs.for);
            else if (!VOID.has(tag)) { const r = innerRange(tag, open); if (r) label = stripTags(src.slice(r.start, r.end)).slice(0, 60); }
            entries.push({
                file, kind: a.name, enc: 'html-attr', quote: a.quote,
                start: a.start, end: a.end, line: lineOf(src, a.start), text, partial: false, parts: 1,
                ctx: { tag, type: attrs.type || '', id, for: attrs.for || '', cls: cls.split(/\s+/)[0] || '', label, heading: lastHeading, path: ancestors() }
            });
        }
        if (tag === 'script') {
            const r = innerRange('script', open);
            if (r && !attrs.src) extractJs(src.slice(r.start, r.end), file, r.start, entries);
            i = r ? r.end : open; continue;
        }
        if (tag === 'style') { const r = innerRange('style', open); i = r ? r.end : open; continue; }
        if (TEXT_TAGS.has(tag)) {
            const hintish = HINT_RE.test(cls) || HINT_RE.test(id) || (tag === 'li' && stack.some((s) => s.id === 'hotkeyOverlay')) ||
                ((tag === 'p' || tag === 'h1' || tag === 'h2') && inDialog());
            if (hintish) {
                const r = innerRange(tag, open);
                if (r) {
                    const raw = src.slice(r.start, r.end);
                    const text = stripTags(raw);
                    const nestedBlock = /<([a-zA-Z][\w-]*)\b/g; let nm, nested = false;
                    while ((nm = nestedBlock.exec(raw))) if (!INLINE_TAGS.test(nm[1].toLowerCase())) { nested = true; break; }
                    if (!nested && wordCount(text) >= 3) {
                        entries.push({
                            file, kind: /<[a-z]/i.test(raw) ? 'html' : 'text', enc: 'html-text', quote: null,
                            start: r.start, end: r.end, line: lineOf(src, r.start), text: raw,
                            partial: false, parts: 1,
                            ctx: { tag, id, cls: cls.split(/\s+/)[0] || '', label: '', heading: lastHeading, path: ancestors() }
                        });
                    }
                }
            }
        }
        if (!VOID.has(tag) && !/\/\s*$/.test(src.slice(i, j))) stack.push({ tag, id, cls, attrs, open });
        i = open;
    }
    // Text nodes inside a hint paragraph already caught whole stay with it.
    const mine = entries.filter((e) => e.file === file);
    for (const nd of nodes) if (!mine.some((e) => e.start <= nd.start && e.end >= nd.end)) entries.push(nd);
}

// Text inside markup is display text, never an identifier, so it only has to
// carry letters and be more than a number with a unit.
function pageWords(text) {
    return /[A-Za-zÀ-ɏ]{2}/.test(text) && !/^[\s.,:;%×+\-–—\/()#]*\d[\d\s.,:;%×+\-–—\/()#]*[A-Za-z%°]{0,3}$/.test(text);
}

// ── CSS: generated content ('REC', '\00a0Off') ─────────────────────
function cssUnescape(raw) {
    return raw.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/\\\r?\n/g, '').replace(/\\([^0-9a-fA-F])/g, '$1');
}
function cssEscape(text, quote) {
    return text.replace(/\\/g, '\\\\').split(quote).join('\\' + quote)
        .replace(/[^\x20-\x7e]/g, (c) => '\\' + c.codePointAt(0).toString(16) + ' ');
}
function extractCss(src, file, entries) {
    const li = lineIndex(src);
    const mask = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    const re = /\bcontent\s*:\s*([^;}]*)/g; let m;
    while ((m = re.exec(mask))) {
        const vStart = m.index + m[0].length - m[1].length;
        const open = mask.lastIndexOf('{', m.index), close = mask.lastIndexOf('}', open);
        const selector = open > 0 ? mask.slice(close + 1, open).trim().replace(/\s+/g, ' ') : '';
        const reS = /(['"])((?:\\[\s\S]|(?!\1)[^\\\n])*)\1/g; let s;
        while ((s = reS.exec(m[1]))) {
            const text = cssUnescape(s[2]);
            if (!pageWords(text)) continue;
            const start = vStart + s.index + 1, end = start + s[2].length;
            entries.push({ file, kind: 'css', enc: 'css-str', quote: s[1], start, end, line: li(start), text, partial: false, parts: 1, ctx: { selector, path: selector } });
        }
    }
}

// ── the wide net: every other string a player can read ─────────────
// The anchors above find copy by where it is headed (.title =, {answer: …},
// a hint paragraph). The net catches the rest: each string literal in the JS,
// judged by where it sits in the syntax tree (acorn). A string that is
// compared, used as a key, handed to console / querySelector / classList /
// storage / addEventListener, or assigned to className or style is code; one
// that reads as CSS, a selector, a colour, a path or an identifier is code;
// the rest is words. Markup inside a string is split into its text runs, so
// the label in '<b>Tip</b>' is an entry of its own. Error messages are kept
// (kind "error") because some of them reach a toast.
let acornLib = null;
function acorn() { if (!acornLib) acornLib = require('acorn'); return acornLib; }
// `node scripts/copy-sink.js drops` lists what the net judged to be code, to audit it.
let netDrops = null;
// Labels the code looks a control up by (tour targets, RENAMED maps): words → where.
// A label on screen with the same words gets a warning: renaming it breaks the lookup.
const lookups = new Map();

const words2 = (s) => (s.match(/[A-Za-zÀ-ɏ]{2,}/g) || []).length;
// Method calls whose string arguments are code. ARG0: only the first one
// (an event or attribute name; the second may be words).
const CODE_CALLS = new Set(('add remove toggle contains includes indexOf lastIndexOf startsWith endsWith split join match matchAll test exec search ' +
    'padStart padEnd toFixed localeCompare parse stringify defineProperty hasOwnProperty getUniformLocation getAttribLocation bindAttribLocation ' +
    'addColorStop animate debug dbg log trace assert group groupCollapsed groupEnd time timeEnd profile profileEnd count table dir dlog vlog debugLog ' +
    'appendSwitch setAppUserModelId getPath setPath loadFile loadURL registerSchemesAsPrivileged setAsDefaultProtocolClient getComputedStyle ' +
    'createObjectURL revokeObjectURL querySelector querySelectorAll getElementById getElementsByClassName getElementsByTagName getElementsByName ' +
    'closest matches createElement createElementNS getContext getExtension toDataURL toBlob canPlayType isTypeSupported matchMedia execCommand ' +
    'mark measure setPointerCapture releasePointerCapture hasPointerCapture fetch require importScripts getAttribute removeAttribute hasAttribute ' +
    'toggleAttribute getItem removeItem get has delete getPropertyValue removeProperty attachShader shaderSource compileShader getShaderParameter ' +
    'getProgramParameter getParameter insertRule deleteRule func load writeCrashLog beginRestart revealWindow').split(/\s+/).filter(Boolean));
const ARG0_CODE = new Set(('on once off emit send sendSync invoke handle handleOnce removeListener removeAllListeners addEventListener removeEventListener ' +
    'setAttribute setItem set setProperty replace replaceAll insertAdjacentHTML insertAdjacentElement postMessage dispatchEvent').split(/\s+/));
const TEXT_ATTRS = /^(title|aria-label|placeholder|alt|data-tip|aria-description|aria-valuetext|aria-roledescription|label)$/;
const CODE_OBJS = new Set(['console', 'JSON', 'Object', 'Reflect', 'localStorage', 'sessionStorage', 'ipcMain', 'ipcRenderer', 'performance', 'Math', 'path', 'fs', 'gl', 'Intl', 'Atomics', 'Number', 'crypto', 'process', 'os', 'child_process']);
const CODE_NEW = new Set(['RegExp', 'Worker', 'SharedWorker', 'CustomEvent', 'Event', 'KeyboardEvent', 'PointerEvent', 'MouseEvent', 'WheelEvent', 'FocusEvent', 'InputEvent', 'URL', 'Function', 'BroadcastChannel', 'WebSocket', 'MediaRecorder', 'FontFace', 'Path2D', 'Audio', 'Image', 'Intl.NumberFormat', 'Intl.DateTimeFormat', 'URLSearchParams', 'TextDecoder', 'VideoEncoder', 'AudioEncoder', 'VideoFrame', 'OffscreenCanvas']);
const ERROR_NEW = /^(Error|TypeError|RangeError|SyntaxError|ReferenceError|DOMException|AggregateError)$/;
// Object keys whose values are code ({ type: 'range', cls: 'btn' }).
const CODE_PROPS = new Set(('id key type cls className class classList icon event events action cmd mode kind tag tagName src href url path file ext mime mimeType ' +
    'format font fontFamily fontWeight color colour fill stroke bg background style css cssText selector sel el target channel param prop field codec container ' +
    'display cursor role dir lang inputMode autocomplete accept pattern step min max shader frag vert uniform attr attribute dataKey storageKey lsKey storage ns ' +
    'namespace slug ref anchor position align valign easing transition animation blend blendMode composite globalCompositeOperation textAlign textBaseline ' +
    'lineCap lineJoin direction filter imageSmoothingQuality preload crossOrigin responseType method cache credentials sortKey code keyCode which button ' +
    'pointerType hotkey kbd combo accel accelerator role sizes rel download probe').split(/\s+/).filter(Boolean));
const CODE_ASSIGN = /^(className|id|src|href|cssText|font|fillStyle|strokeStyle|textAlign|textBaseline|globalCompositeOperation|lineCap|lineJoin|filter|type|accept|download|hash|search|pathname|protocol|width|height|htmlFor|rel|target|crossOrigin|preload|autocomplete|inputMode|dir|lang|role|cursor|key|code|imageSmoothingQuality|direction|letterSpacing|wordSpacing|fontKerning|responseType|binaryType|mode|kind)$/;
const CODE_VAR = /(^|[a-z0-9_])(Css|Style|Sel|Selector|Key|Id|Cls|Class|Url|Src|Path|Ext|Mime|Font|Frag|Vert|Shader|Glsl|Re|Regex|Evt|Event|Ns|Prefix|Attr)$|^(css|style|sel|selector|key|id|cls|klass|url|src|path|ext|mime|font|frag|vert|shader|glsl|re|regex|evt|event|ns|tag|type|mode|attr|prefix)$|_(KEY|ID|CSS|SEL|URL|NS|EVENT|CLASS|PREFIX|PATH|STYLE|FONT|ATTR|MIME|EXT|TAG|TYPE)S?$/;

function calleeParts(c) {
    if (!c) return { name: '', obj: '' };
    if (c.type === 'Identifier') return { name: c.name, obj: '' };
    if (c.type === 'MemberExpression' && !c.computed) {
        const o = c.object;
        const obj = o.type === 'Identifier' ? o.name : (o.type === 'MemberExpression' && !o.computed ? o.property.name : (o.type === 'ThisExpression' ? 'this' : ''));
        return { name: c.property.name || '', obj };
    }
    return { name: '', obj: '' };
}
function walkAst(node, parents, visit) {
    if (!node || typeof node.type !== 'string') return;
    visit(node, parents);
    parents.push(node);
    for (const k in node) {
        if (k === 'type' || k === 'start' || k === 'end') continue;
        const v = node[k];
        if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walkAst(c, parents, visit); }
        else if (v && typeof v.type === 'string') walkAst(v, parents, visit);
    }
    parents.pop();
}
// Why the string at node is code, '' when it may be words, 'error' for an
// Error message.
function codeContext(node, parents) {
    let child = node;
    for (let i = parents.length - 1; i >= 0; i--) {
        const p = parents[i];
        switch (p.type) {
            case 'ExpressionStatement': return p.directive ? 'directive' : '';
            case 'ImportDeclaration': case 'ExportAllDeclaration': case 'ExportNamedDeclaration': case 'ImportExpression': return 'import';
            case 'TaggedTemplateExpression': return 'tagged';
            case 'Property': case 'PropertyDefinition': {
                if (p.key === child) return 'key';
                const kn = p.key && (p.key.name || p.key.value);
                if (typeof kn === 'string' && CODE_PROPS.has(kn)) return 'prop:' + kn;
                // a label used to FIND a control: a tour's target ({ target: { strip: 'Density' } })
                // or a map of old names to new labels (RENAMED). Changing it breaks the lookup.
                const obj = parents[i - 1], holder = parents[i - 2];
                if (obj && obj.type === 'ObjectExpression' && holder) {
                    if (holder.type === 'Property' && /^(target|find|locate|match)$/.test(holder.key && (holder.key.name || holder.key.value))) return 'lookup';
                    if (holder.type === 'VariableDeclarator' && /^(RENAMED|ALIASES|LEGACY\w*|OLD_\w+)$/.test((holder.id && holder.id.name) || '')) return 'lookup';
                }
                return '';
            }
            case 'MemberExpression': return p.property === child ? 'member' : '';
            case 'BinaryExpression':
                if (p.operator === '+') { child = p; continue; }
                return 'op:' + p.operator;
            case 'SwitchCase': return p.test === child ? 'case' : '';
            case 'ConditionalExpression': if (p.test === child) return 'test'; child = p; continue;
            case 'LogicalExpression': case 'TemplateLiteral': case 'SequenceExpression': case 'ArrayExpression': case 'ParenthesizedExpression': case 'SpreadElement':
                child = p; continue;
            case 'AssignmentExpression': {
                if (p.right !== child) return 'lhs';
                const l = p.left;
                if (l.type === 'MemberExpression' && l.object.type === 'MemberExpression' && !l.object.computed && /^(style|dataset)$/.test(l.object.property.name)) return 'style';
                if (l.type === 'MemberExpression' && l.computed) return '';
                const ln = l.type === 'MemberExpression' ? (l.property.name || '') : (l.type === 'Identifier' ? l.name : '');
                if (CODE_ASSIGN.test(ln) || (l.type === 'Identifier' && CODE_VAR.test(ln))) return 'assign:' + ln;
                return '';
            }
            case 'VariableDeclarator': { const nm = (p.id && p.id.name) || ''; return CODE_VAR.test(nm) ? 'var:' + nm : ''; }
            case 'AssignmentPattern': return p.left === child ? 'lhs' : '';
            case 'CallExpression': case 'NewExpression': {
                if (p.callee === child) return 'callee';
                const { name, obj } = calleeParts(p.callee);
                const argi = p.arguments.indexOf(child);
                if (p.type === 'NewExpression') {
                    if (ERROR_NEW.test(name)) return 'error';
                    const full = obj ? obj + '.' + name : name;
                    if (CODE_NEW.has(name) || CODE_NEW.has(full)) return 'new ' + full;
                    return '';
                }
                if (name === 'reject' && obj === 'Promise') return 'error';
                if (CODE_OBJS.has(obj)) return 'call:' + obj + '.' + name;
                if (name === 'setAttribute' && argi === 1) {
                    const a0 = p.arguments[0];
                    return a0 && a0.type === 'Literal' && TEXT_ATTRS.test(String(a0.value)) ? '' : 'attr';
                }
                if (ARG0_CODE.has(name)) return argi === 0 ? 'call:' + name : '';
                if (CODE_CALLS.has(name)) return 'call:' + name;
                return '';
            }
            default: return '';
        }
    }
    return '';
}

// A string that reads as a sentence or a label is words even when it has a
// dot or a colon in it ("e.g. this", "Video: saving").
// Counted by whitespace-separated tokens that are plain words (letters,
// maybe an apostrophe, a capitalised hyphen compound, trailing punctuation),
// so 'hk-block radial-block' or 'fill="none"' never pass for prose.
const PLAIN_TOK = /^[(“"'‘]?[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’]*(-[A-Za-zÀ-ɏ]+)*[,.;:!?…)”"’]*$/;
function looksSentence(s) {
    if (/\{[^}]*:[^}]*;/.test(s)) return false;                         // a CSS rule
    const toks = s.split(/\s+/).filter(Boolean);
    if (toks.length < 2) return false;
    // a lower-case hyphen compound is a class name until proven otherwise
    const plain = toks.filter((t) => PLAIN_TOK.test(t) && (!/-/.test(t) || /^[(“"'‘]?[A-Z]/.test(t)));
    if (plain.length < 2 || plain.length / toks.length < 0.5) return false;
    return /[.!?…:)]\s*$|[.!?]\s/.test(s) || /^[A-Z][a-z]/.test(s) || plain.length >= 3;
}
const GLSL = /\b(precision\s+(high|medium|low)p|(uniform|varying|in|out)\s+(float|int|vec[234]|mat[234]|sampler2D)\b|(vec[234]|mat[234]|sampler2D)\s+\w|gl_\w+|void\s+main\s*\(|texture2?D?\s*\(\s*\w+\s*,)|#version\s+\d/;
// '' when s is words; otherwise what kind of code it reads as.
function codeShape(t) {
    const s = t.replace(/\$\{[^}]*\}/g, ' ').trim();
    if (!/[A-Za-zÀ-ɏ]{2}/.test(s)) return 'no letters';
    if (GLSL.test(t) || /\b(precision|uniform|varying|gl_\w+|texture2D|void main|#version)\b/.test(t)) return 'glsl';
    if (/^(return|var|let|const|if|for|while|function)\b[^]*[;{}]\s*$/.test(s)) return 'code';
    if (/^\s*(rgba?|hsla?|linear-gradient|radial-gradient|conic-gradient|color-mix|var|url|calc|cubic-bezier|steps)\(|^#[0-9a-f]{3,8}$/i.test(s)) return 'colour';
    if (/:\/\/|^(\.{0,2}\/|data:|blob:|file:|mailto:)/.test(s) || /^[\w@.-]+\/[\w.\/@-]+$/.test(s)) return 'path';
    if (/^--?[a-z][\w-]*(=\S*)?(\s+--?[a-z][\w-]*(=\S*)?)*$/.test(s)) return 'command-line flag';
    if (/^\(\s*[\w-]+\s*:\s*[\w.-]+\s*\)/.test(s)) return 'media query';
    if (/^&#?\w+;$/.test(s)) return 'entity';
    if (/\b\w+\s+__\w+\s+\w+\(|^\s*(bool|int|void|intptr_t|uint\d+_t|int\d+_t)\s+\w/.test(s)) return 'ffi signature';
    if (/!important|^[\s,]*[\w-]+\s*:[^;{}]*[;}]\s*\}?\s*$/.test(s) && !looksSentence(s.replace(/[{};]/g, ' '))) return 'css';
    if (/\{[^}]*:[^}]*\}|^\s*[\w-]+\s*:\s*[^;]+;|;\s*[\w-]+\s*:\s*\S/.test(s) && !looksSentence(s.replace(/[{};]/g, ' '))) return 'css';
    const selectorMarks = /(^|[\s,>+~(])[.#][A-Za-z_-][\w-]*|\[[\w-]+([~|^$*]?=[^\]]*)?\]|::?(hover|focus|focus-visible|active|before|after|not|is|where|nth-child|nth-of-type|first-child|last-child|checked|disabled|root)\b/;
    if (selectorMarks.test(s) && !/[.!?…]\s+[A-Z]|[.!?…]$/.test(s)) return 'selector';
    if (looksSentence(s)) return '';
    if (/^[a-z][\w-]*(\[|[.#][A-Za-z_-]|::?[a-z-]+\b)|\s>\s*[.#a-z]/.test(s)) return 'selector';
    if (/(serif|sans-serif|monospace|cursive|fantasy|system-ui|emoji)\s*$|^'[^']+',/.test(s) || /^(bold |italic |normal )?\d+(\.\d+)?(px|pt|em|rem)\b/.test(s)) return 'font';
    if (/^(translate|scale|rotate|skew|matrix|perspective)\w*\(|^[\s\d.,+-]*(px|deg|rad|turn|%|s|ms|vh|vw|em|rem)?[\s,)]*$|^\s*(px|deg|ms|rad)\b[\s,)]*$/.test(s)) return 'transform';
    if (/[\w-]=\\?"|^\\?"\s*\/?>|^\\?"\s+[\w-]+=/.test(s)) return 'markup';
    if (/^[A-Z][a-z]+(-[A-Z]?[a-z]+)+$/.test(s)) return '';                 // Multi-Brush, Ultra-fine
    if (/^\w[\w.-]*\.(js|mjs|css|html|png|jpe?g|json|onnx|wasm|svg|webp|mp4|webm|gif|wav|mp3|ogg|txt|fluid|bin|ico)$/i.test(s)) return 'filename';
    if (/^(Arrow\w+|Shift\w*|Control\w*|Alt\w*|Meta\w*|Escape|Enter|Tab|Backspace|Delete|Key[A-Z]|Digit\d|F\d{1,2}|Page\w+|Home|End|Space|Numpad\w+|Insert|CapsLock|ContextMenu)$/.test(s)) return 'key name';
    if (/^[a-z][\w-]*$/.test(s)) return 'identifier';
    if (/^[a-z]+([A-Z][a-z0-9]*)+$/.test(s) || /^[A-Z][a-z]+([A-Z][a-z0-9]+)+$/.test(s)) return 'camelCase';
    if (/^[A-Z0-9_]+$/.test(s) && /_/.test(s)) return 'CONSTANT';
    if (/^[a-z0-9-]+(\s+[a-z0-9-]+)+$/.test(s) && /-/.test(s)) return 'class list';
    if (/^[\w-]+(\.[\w-]+)+$/.test(s) || /^[\w-]+:[\w.-]+$/.test(s)) return 'dotted key';
    if (/^(use strict|use asm)$/.test(s)) return 'directive';
    if (looksLikeCode(s)) return 'code';
    return '';
}

// Text runs of markup held in JS source between [a, b): the parts outside
// tags (and outside <style>/<script>), carrying "inside a tag" across the
// pieces of a template or a chain. Escapes are skipped as a unit.
function startsInTag(raw) {
    const lt = raw.indexOf('<'), gt = raw.indexOf('>');
    if (gt < 0 || (lt >= 0 && lt < gt)) return false;
    const head = raw.slice(0, gt);
    return /["'=]/.test(head) || /^\s*\/?\s*$/.test(head);
}
const MARKUP = /<\/?[a-zA-Z][\w-]*(\s|>|\/|$)/;
function textRuns(src, a, b, inTag) {
    const runs = []; let i = a, runStart = inTag ? -1 : a; let skipTo = null;
    const ws = (k) => /\s/.test(src[k]) || (src[k] === '\\' && /[nrt]/.test(src[k + 1] || ''));
    const pushRun = (s, e) => {
        while (s < e && ws(s)) s += src[s] === '\\' ? 2 : 1;
        while (e > s && (/\s/.test(src[e - 1]) || (src[e - 2] === '\\' && /[nrt]/.test(src[e - 1])))) e -= /\s/.test(src[e - 1]) ? 1 : 2;
        if (e > s) runs.push({ start: s, end: e });
    };
    while (i < b) {
        const c = src[i];
        if (c === '\\') { i += 2; continue; }
        if (skipTo) { if (src.startsWith(skipTo, i)) { skipTo = null; inTag = true; } i++; continue; }
        if (!inTag && c === '<' && /[A-Za-z\/!]/.test(src[i + 1] || '')) {
            if (runStart >= 0 && i > runStart) pushRun(runStart, i);
            const tg = /^<(style|script)\b/i.exec(src.slice(i, i + 8));
            inTag = true; runStart = -1; i++;
            if (tg) { const close = src.slice(i).search(new RegExp('<\\/' + tg[1], 'i')); if (close >= 0 && i + close < b) { i = i + close; } else skipTo = '</' + tg[1]; }
            continue;
        }
        if (inTag && c === '>') { inTag = false; runStart = i + 1; i++; continue; }
        i++;
    }
    if (!inTag && runStart >= 0 && b > runStart) pushRun(runStart, b);
    return { runs, inTag };
}

// ── chains of + ─────────────────────────────────────────────────────
const isPlus = (n) => !!n && n.type === 'BinaryExpression' && n.operator === '+';
// Code that is a string whatever its inputs: words, a template, a choice
// between two of those, a + with words on one side, or a call that returns one.
function stringy(n) {
    if (!n) return false;
    switch (n.type) {
        case 'Literal': return typeof n.value === 'string';
        case 'TemplateLiteral': return true;
        case 'ConditionalExpression': return stringy(n.consequent) && stringy(n.alternate);
        case 'BinaryExpression': return n.operator === '+' && (stringy(n.left) || stringy(n.right));
        case 'CallExpression': {
            const c = n.callee;
            if (c.type === 'Identifier') return c.name === 'String';
            return c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier'
                && /^(toUpperCase|toLowerCase|toFixed|toPrecision|toString|toLocaleString|join|trim|trimStart|trimEnd|padStart|padEnd|replace|replaceAll|repeat|charAt)$/.test(c.property.name);
        }
        default: return false;
    }
}
// A + whose first step already joins words: everything in it is a join.
function joinsFromStart(n) {
    let b = n; while (isPlus(b.left)) b = b.left;
    return stringy(b.left) || stringy(b.right);
}
// Does the + at `child` belong to the chain of its parent + ? Not when it
// sits on the right and adds before it joins: 'Arm ' + (idx + 1).
const inParentChain = (child, parent) => isPlus(parent) && !(parent.right === child && isPlus(child) && !joinsFromStart(child));
// The parts of a chain of +, left to right, as the app joins them. Numbers
// added before any words join stay one part: 'Arm ' + (idx + 1) + ' tip' is
// 'Arm ', idx + 1, ' tip' (it read ⟨idx⟩⟨1⟩ before), and n + 1 + ' items'
// is n + 1, ' items'.
function plusParts(root) {
    const out = [];
    (function chain(n) {
        const spine = []; let b = n;
        while (isPlus(b)) { spine.push(b); b = b.left; }
        let acc = b, joined = stringy(b);
        if (joined) out.push(b);
        for (let i = spine.length - 1; i >= 0; i--) {
            const r = spine[i].right;
            if (!joined && !stringy(r)) { acc = spine[i]; continue; }   // still adding: one part so far
            if (!joined) { out.push(acc); joined = true; }
            if (isPlus(r) && joinsFromStart(r)) chain(r); else out.push(r);
        }
        if (!joined) out.push(acc);
    })(root);
    return out;
}

// Where the words go (via) and, for a piece of a 'a' + b + 'c' chain, the
// whole sentence with this piece marked (\u0001…\u0002) and the dynamic
// parts as ⟨…⟩, so a fragment can be read in context.
function netCtx(src, node, parents) {
    const short = (s, n) => { s = s.replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
    let i = parents.length - 1, root = node;
    while (i >= 0 && inParentChain(root, parents[i])) { root = parents[i]; i--; }
    let sentence = '';
    if (root !== node) {
        const parts = plusParts(root).map((n) => {
            if (n.type === 'Literal' && typeof n.value === 'string') return n === node ? '\u0001' + n.value + '\u0002' : n.value;
            if (n.type === 'TemplateLiteral') { const r = src.slice(n.start + 1, n.end - 1); return n === node ? '\u0001' + r + '\u0002' : r; }
            return '⟨' + short(src.slice(n.start, n.end), 28) + '⟩';
        });
        sentence = parts.join('');
        if (sentence.length > 700) sentence = '';
    }
    let child = root;
    while (i >= 0 && /^(ConditionalExpression|LogicalExpression|TemplateLiteral|ArrayExpression|ParenthesizedExpression|SequenceExpression)$/.test(parents[i].type)) { child = parents[i]; i--; }
    const p = i >= 0 ? parents[i] : null;
    let via = '';
    if (p) {
        if (p.type === 'CallExpression' || p.type === 'NewExpression') via = (p.type === 'NewExpression' ? 'new ' : '') + short(src.slice(p.callee.start, p.callee.end), 40) + '(…)';
        else if (p.type === 'Property') {
            via = (p.key.name || p.key.value || '') + ':';
            const obj = parents[i - 1], call = parents[i - 2];
            if (obj && obj.type === 'ObjectExpression' && call && (call.type === 'CallExpression' || call.type === 'NewExpression')) via = short(src.slice(call.callee.start, call.callee.end), 32) + '({ ' + via + ' })';
        }
        else if (p.type === 'AssignmentExpression') via = short(src.slice(p.left.start, p.left.end), 40) + ' =';
        else if (p.type === 'VariableDeclarator') via = 'var ' + ((p.id && p.id.name) || '');
        else if (p.type === 'ReturnStatement') via = 'return';
        else if (p.type === 'ArrowFunctionExpression') via = '=> …';
    }
    return { sentence, via };
}

function netJs(src, file, base, entries, li) {
    let ast;
    const opts = { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true };
    try { ast = acorn().parse(src, opts); }
    catch (_) {
        try { ast = acorn().parse(src, Object.assign({}, opts, { sourceType: 'module' })); }
        catch (e) { console.warn('[copy-sink] net: could not parse ' + file + ': ' + e.message); return; }
    }
    let spans = entries.filter((e) => e.file === file).map((e) => [e.start, e.end]);
    const covered = (s, e) => spans.some((sp) => sp[0] <= s && sp[1] >= e);
    const add = (o) => { spans.push([o.start, o.end]); entries.push(o); };
    const isLit = (n) => (n.type === 'Literal' && typeof n.value === 'string') || (n.type === 'TemplateLiteral' && n.expressions.length === 0);
    const litVal = (n) => n.type === 'Literal' ? n.value : (n.quasis[0].value.cooked != null ? n.quasis[0].value.cooked : decodeJs(src.slice(n.start + 1, n.end - 1)));
    const shortSrc = (n) => { const s = src.slice(n.start, n.end).replace(/\s+/g, ' ').trim(); return s.length > 28 ? s.slice(0, 27) + '…' : s; };

    // A line built as 'a' + name + 'b' is ONE entry: its words with each
    // dynamic part shown as ⟨…⟩, so it reads and is rewritten as the sentence
    // a player sees. On write, the text between the ⟨…⟩ goes back into the
    // literals in order (a run of 'a' + 'b' becomes one literal); the code in
    // the ⟨…⟩ is never touched. Markup and ${} templates in a line keep the
    // per-literal path. Returns false to hand the line to that path.
    // A rebuilt line is 'words' + code + 'words', left to right. That is the
    // same join of words only when every + between the parts already was
    // one (plusParts keeps sums whole, so this holds unless no part is
    // known to be words), and no comment sits between the parts (a rebuild
    // would drop it).
    function rebuildBlock(root, parts) {
        if (parts.length > 1 && !stringy(parts[0]) && !stringy(parts[1])) return 'sum';
        for (let i = 1; i < parts.length; i++) if (/\/\/|\/\*/.test(src.slice(parts[i - 1].end, parts[i].start))) return 'comment';
        return '';
    }
    // Code that can stand on either side of a + as it is; anything else
    // (a ? b : c, a || b, a - b ...) goes in brackets. Acorn's ranges leave
    // the source's own brackets out.
    const BARE_OPERAND = /^(Identifier|Literal|TemplateLiteral|MemberExpression|CallExpression|NewExpression|ThisExpression|ArrayExpression|ChainExpression|TaggedTemplateExpression|UnaryExpression|UpdateExpression|AwaitExpression)$/;
    const needsBrackets = (n) => !(BARE_OPERAND.test(n.type) || (n.type === 'BinaryExpression' && /^(\*|\/|%|\*\*)$/.test(n.operator)));

    function netChain(root, rootParents) {
        const parts = plusParts(root);
        for (const n of parts) {
            if (n.type === 'TemplateLiteral' && n.expressions.length) return false;
            if (isLit(n)) { const raw = src.slice(n.start + 1, n.end - 1); if (MARKUP.test(raw) || startsInTag(raw) || GLSL.test(raw) || /[⟨⟩]/.test(raw)) return false; }
        }
        const lits = parts.filter(isLit);
        if (!lits.length) return true;
        const s0 = base + root.start, e0 = base + root.end;
        if (covered(s0, e0)) return true;
        const why = codeContext(root, rootParents);
        const slots = [{ lits: [] }], exprs = [];
        for (const n of parts) { if (isLit(n)) slots[slots.length - 1].lits.push(n); else { exprs.push(n); slots.push({ lits: [] }); } }
        const pieces = slots.map((sl) => sl.lits.map(litVal).join(''));
        const joined = pieces.join(' ');
        if (why && why !== 'error') { if (netDrops) netDrops.push({ file, line: li(s0), why, text: joined }); return true; }
        if (!pageWords(joined)) return true;
        const shape = codeShape(joined);
        if (shape) { if (netDrops && shape !== 'no letters') netDrops.push({ file, line: li(s0), why: 'shape:' + shape, text: joined }); return true; }
        // a run of literals is written back as one only when nothing but + sits between them
        for (const sl of slots) for (let i = 1; i < sl.lits.length; i++) {
            if (!/^(\s|\+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*$/.test(src.slice(sl.lits[i - 1].end, sl.lits[i].start))) return false;
        }
        let text = '';
        slots.forEach((sl, i) => { text += pieces[i]; if (i < exprs.length) text += '⟨' + shortSrc(exprs[i]) + '⟩'; });
        // an anchor entry for this line's leading words (.title = 'a' + x) is folded in: same words, whole line
        let kind = why === 'error' ? 'error' : '';
        const litSpans = lits.map((n) => [base + n.start, base + n.end]);
        for (let i = entries.length - 1; i >= 0; i--) {
            const x = entries[i];
            if (x.file !== file || !(x.enc === 'js' || x.enc === 'js-template-expr')) continue;
            if (litSpans.some((sp) => sp[0] === x.start) && x.end <= e0) { kind = kind || x.kind; entries.splice(i, 1); }
        }
        spans = spans.filter((sp) => !litSpans.some((l) => l[0] === sp[0]));
        const ctx = Object.assign({ fn: '' }, netCtx(src, root, rootParents));
        ctx.pieces = pieces.filter((t) => t.trim().length >= 4);
        if (!kind) {
            const v = ctx.via || '';
            kind = /\.title =$|^title:|title: \}\)$/.test(v) ? 'title' : /aria-?label/i.test(v) ? 'aria-label' : /placeholder/.test(v) ? 'placeholder' : 'words';
        }
        const runs = slots.map((sl) => sl.lits.length ? { start: base + sl.lits[0].start, end: base + sl.lits[sl.lits.length - 1].end, quote: src[sl.lits[0].start] } : null);
        // What apply needs to write the line again whole (a ⟨…⟩ deleted, or
        // words where the code has no literal): each ⟨…⟩ as shown, where its
        // code sits, whether it needs brackets as a + operand, and why the
        // line can't be rebuilt ('' = it can).
        entries.push({
            file, kind, enc: 'js-chain', quote: runs.find(Boolean).quote, start: s0, end: e0, line: li(s0), text, partial: false, parts: lits.length,
            chain: { runs, exprs: exprs.length, labels: exprs.map(shortSrc), spans: exprs.map((n) => [base + n.start, base + n.end]), wrap: exprs.map(needsBrackets), rebuild: rebuildBlock(root, parts) }, ctx
        });
        // only the literal runs count as covered: a string inside a ⟨…⟩ ('the palette' in name || 'the palette') is its own entry
        runs.forEach((r) => { if (r) spans.push([r.start, r.end]); });
        return true;
    }
    const chainState = new Map();   // root node → 'chain' | 'each'

    walkAst(ast, [], (node, parents) => {
        const isStr = node.type === 'Literal' && typeof node.value === 'string';
        const isTpl = node.type === 'TemplateLiteral';
        if (!isStr && !isTpl) return;
        const p0 = parents[parents.length - 1];
        if (isPlus(p0)) {
            // up to the top of this chain; a sum on its right is a chain of its own
            let k = parents.length - 1;
            while (k - 1 >= 0 && inParentChain(parents[k], parents[k - 1])) k--;
            const root = parents[k];
            let st = chainState.get(root);
            if (!st) { st = netChain(root, parents.slice(0, k)) ? 'chain' : 'each'; chainState.set(root, st); }
            if (st === 'chain') return;
        }
        if (covered(base + node.start, base + node.end)) return;
        const why = codeContext(node, parents);
        if (why === 'lookup' && isStr) (lookups.get(node.value) || lookups.set(node.value, []).get(node.value)).push(file + ':' + li(base + node.start));
        if (why && why !== 'error') { if (netDrops) netDrops.push({ file, line: li(base + node.start), why, text: isStr ? node.value : src.slice(node.start + 1, node.end - 1) }); return; }
        const kind = why === 'error' ? 'error' : 'words';
        const raw = src.slice(node.start + 1, node.end - 1);
        const quote = src[node.start];
        const fnName = () => { for (let k = parents.length - 1; k >= 0; k--) { const p = parents[k]; if (/Function/.test(p.type)) { if (p.id) return p.id.name; const q = parents[k - 1]; if (q && q.type === 'VariableDeclarator' && q.id.name) return q.id.name; if (q && q.type === 'Property' && q.key) return q.key.name || q.key.value || ''; if (q && q.type === 'AssignmentExpression') return src.slice(q.left.start, q.left.end).split('.').pop(); } } return ''; };
        // Shader source: its comparisons look like tags and its comments like prose.
        if (GLSL.test(raw)) return;
        if (MARKUP.test(raw) || startsInTag(raw)) {
            // markup: one entry per text run (attributes are the anchors' job)
            const pieces = isTpl ? node.quasis.map((q) => [q.start, q.end]) : [[node.start + 1, node.end - 1]];
            let inTag = startsInTag(raw);
            let c = null;
            // the rest of the markup's words around a run, so it reads in context
            const plain = (str) => { try { return decodeHtml(decodeJs(str.replace(/\$\{[^}]*\}/g, ' ⟨…⟩ ').replace(/<[^>]*>?/g, ' '))).replace(/\s+/g, ' '); } catch (_) { return ''; } };
            const found = [];
            for (const [a, b] of pieces) {
                const r = textRuns(src, a, b, inTag); inTag = r.inTag;
                for (const run of r.runs) {
                    const s = base + run.start, e = base + run.end;
                    if (covered(s, e)) continue;
                    const text = decodeHtml(decodeJs(src.slice(run.start, run.end)));
                    if (!pageWords(text) || /^\s*\$\{/.test(text)) continue;
                    if (/^(css|colour|transform|markup|glsl|code)$/.test(codeShape(text))) continue;   // style or code between tags
                    found.push({ run, s, e, text });
                }
            }
            // every run of this markup, so a run is only placed where all of them show
            const runPieces = found.map((f) => normText(f.text)).filter((t) => t.length >= 4);
            for (const { run, s, e, text } of found) {
                c = c || Object.assign({ fn: fnName() }, netCtx(src, node, parents));
                const pre = plain(src.slice(node.start + 1, run.start)).slice(-260), post = plain(src.slice(run.end, node.end - 1)).slice(0, 260);
                const ctx = Object.assign({}, c, { pieces: runPieces });
                if (/[A-Za-z]{2}/.test(pre + post)) ctx.sentence = (pre.trim() ? pre : '') + '\u0001' + text + '\u0002' + (post.trim() ? post : '');
                add({ file, kind, enc: 'js-html-text', quote, start: s, end: e, line: li(s), text, partial: false, parts: 1, ctx });
            }
            return;
        }
        const hasExpr = isTpl && node.expressions.length > 0;
        const text = isStr ? node.value : (hasExpr ? raw : (node.quasis[0].value.cooked != null ? node.quasis[0].value.cooked : decodeJs(raw)));
        const shape = codeShape(text);
        if (shape) { if (netDrops && shape !== 'no letters') netDrops.push({ file, line: li(base + node.start), why: 'shape:' + shape, text }); return; }
        const s = base + node.start, e = base + node.end;
        if (hasExpr && spans.some((sp) => sp[0] >= s && sp[1] <= e)) {
            // A template holding a string that is already an entry (a .title =
            // inside one of its ${}): its own words are taken piece by piece, so
            // no two entries overlap and both can be written in one go.
            const c = Object.assign({ fn: fnName() }, netCtx(src, node, parents));
            for (const q of node.quasis) {
                const qs = base + q.start, qe = base + q.end;
                const qt = q.value.cooked != null ? q.value.cooked : decodeJs(q.value.raw);
                if (qe <= qs || covered(qs, qe) || !pageWords(qt) || codeShape(qt)) continue;
                add({ file, kind, enc: 'js-template-part', quote: '`', start: qs, end: qe, line: li(qs), text: qt, partial: true, parts: 1, ctx: c });
            }
            return;
        }
        add({
            file, kind, enc: hasExpr ? 'js-template-expr' : 'js', quote, start: s, end: e, line: li(s), text, partial: false, parts: 1,
            ctx: Object.assign({ fn: fnName() }, netCtx(src, node, parents))
        });
    });
}

// ── the catalog ────────────────────────────────────────────────────
function extract() {
    const entries = [];
    lookups.clear();
    for (const file of copyFiles()) {
        const src = fs.readFileSync(path.join(REPO, file), 'utf8');
        const li = lineIndex(src);
        if (/\.html$/.test(file)) {
            extractHtml(src, file, entries);
            const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi; let m;
            while ((m = re.exec(src))) {
                if (/\bsrc\s*=/.test(m[1])) continue;
                netJs(m[2], file, m.index + m[0].indexOf('>') + 1, entries, li);
            }
        } else {
            extractJs(src, file, 0, entries);
            netJs(src, file, 0, entries, li);
        }
    }
    for (const file of cssFiles()) extractCss(fs.readFileSync(path.join(REPO, file), 'utf8'), file, entries);
    entries.sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start);
    const ord = new Map();
    for (const e of entries) {
        const k = e.file + '\u0000' + e.enc + '\u0000' + e.text;
        const o = ord.get(k) || 0; ord.set(k, o + 1);
        e.ordinal = o;
        e.key = e.file + '#' + e.enc + '#' + o + '#' + sha8(e.text);
    }
    return entries;
}

// Late binding for runtime strings the anchors missed (helper arguments):
// the literal whose decoded value equals the text, if it is unique.
function bindByLiteral(text, cache) {
    if (!cache.tokens) {
        cache.tokens = [];
        for (const file of copyFiles()) {
            if (/\.html$/.test(file)) continue;
            const src = fs.readFileSync(path.join(REPO, file), 'utf8');
            for (const t of scanJs(src).tokens) if (!t.hasExpr && t.value.length >= 4) cache.tokens.push({ file, t, line: lineOf(src, t.start) });
        }
    }
    const hits = cache.tokens.filter((x) => x.t.value === text);
    if (hits.length !== 1) return null;
    const h = hits[0];
    return {
        file: h.file, kind: 'arg', enc: 'js', quote: h.t.quote, start: h.t.start, end: h.t.end, line: h.line,
        text, partial: false, parts: 1, ctx: { fn: '' }, ordinal: 0, key: h.file + '#js#0#' + sha8(text)
    };
}

function loadRuntime() {
    try { return JSON.parse(fs.readFileSync(RUNTIME_JSON, 'utf8')); } catch (_) { return null; }
}

// The catalog the sink page reads: every entry with its runtime place, its
// dev flag and its ledger state.
function catalog() {
    const out = placedCatalog();
    const L = loadLedger();
    for (const e of out.entries) {
        e.dev = devNoise(e); e.role = roleOf(e);
        const s = stateOf(L, e.text); if (s) e.touched = s;
        const lk = lookups.get(e.text); if (lk && e.role === 'screen') e.lookedUp = lk;
    }
    return out;
}

// Where a player meets these words, so the sink can say it in large type:
// screen (printed on the control itself), tooltip (on hover), reader (screen
// readers only), placeholder (inside an empty box), message (a notice or a
// dialog), guide (the How do I… guide), card (an effect's hover card), error,
// or unknown. What the app showed at runtime wins; then the kind of string;
// then where the code sends it.
function roleOf(e) {
    // the same words printed on screen somewhere count as on-screen first: that is what a rewrite changes
    const rts = e.runtime || [];
    const r = rts.find((x) => x.attr === 'node' && !x.contains) || rts[0];
    if (r) {
        if (r.attr === 'node') return r.contains && /title|aria/.test(e.kind) ? (e.kind === 'title' ? 'tooltip' : 'reader') : 'screen';
        if (r.attr === 'title' || r.attr === 'data-tip') return 'tooltip';
        if (r.attr === 'aria-label') return 'reader';
        if (r.attr === 'placeholder') return 'placeholder';
        if (/^fx-/.test(r.attr)) return 'card';
        if (/^recipe-/.test(r.attr)) return 'guide';
    }
    const k = e.kind, v = (e.ctx && e.ctx.via) || '';
    if (k === 'title' || k === 'tip' || k === 'data-tip') return 'tooltip';
    if (k === 'aria-label' || k === 'alt') return 'reader';
    if (k === 'placeholder') return 'placeholder';
    if (/44-recipes/.test(e.file || '')) return 'guide';
    if (k === 'error') return 'error';
    if (e.file === 'electron-main.js' && /message|detail|buttons|guidance|showErrorBox|showMessageBox/.test(v + ' ' + k)) return 'message';
    if (k === 'message' || k === 'detail') return 'message';
    if (k === 'page text' || k === 'css' || k === 'textContent' || k === 'text' || k === 'html' || k === 'label' || k === 'name' || k === 'sub' || k === 'hint' || k === 'note' || k === 'table') return k === 'table' ? 'tooltip' : 'screen';
    if (e.enc === 'js-html-text') return 'screen';
    if (/\.title =$|^title:|\{ title: \}\)$|setAttribute\('title'/.test(v)) return 'tooltip';
    if (/aria-?label|ariaLabel/i.test(v)) return 'reader';
    if (/placeholder/.test(v)) return 'placeholder';
    if (/\.(textContent|innerText|innerHTML) =$|^(label|text|caption|name|heading|header):|fillText|createTextNode|\.label =$/.test(v)) return 'screen';
    if (/toast|Toast|say|Say|tell|status|Status|notice|Notice|flash|alert|Alert|confirm|Confirm|showMessageBox|showErrorBox|hint|Hint|note|Note|msg|Msg|message|Message|warn|report|[Ee]rror|[Pp]rogress|notify|setAction/.test(v)) return 'message';
    // UI builders and label-ish names: said to be on screen when unsure, the
    // safe side (a tooltip kept short does no harm; a label grown long does)
    if (/^(group|about|label|labelText|heading|caption|text|title):$|^var (label|labels|text|title|heading|names|what|verb|name)$|labelText =|\brow\(|\bel\(|fxRow|RowHTML|selectInput|lines\(|addCollisionLayer|chip|Chip|btn|Btn|button|Button/.test(v)) return 'screen';
    return 'unknown';
}

// Merge runtime contexts into the catalog; add read-only entries for
// runtime strings that bind nowhere.
function placedCatalog() {
    const entries = extract();
    const rt = loadRuntime();
    const out = { generatedAt: new Date().toISOString(), runtimeAt: rt ? rt.at : null, entries };
    if (!rt) return out;
    const byText = new Map(), byNorm = new Map();
    const norm = (s) => stripTags(s).replace(/\s+/g, ' ').trim();
    for (const e of entries) {
        if (!byText.has(e.text)) byText.set(e.text, []); byText.get(e.text).push(e);
        const nk = norm(e.text); if (!byNorm.has(nk)) byNorm.set(nk, []); byNorm.get(nk).push(e);
    }
    const partials = entries.filter((e) => e.partial);
    const cache = {};
    const keys = new Set(entries.map((e) => e.key));
    const extra = [];
    rt.items.forEach((it, idx) => {
        let hits = byText.get(it.text) || [];
        if (!hits.length) hits = byNorm.get(norm(it.text)) || [];   // markup / whitespace differences (HTML text nodes)
        if (it.attr === 'node') {
            // A text node only lends its place to the entry it shows; one built
            // at runtime (a name, a number) is not a string of its own.
            if (hits.length) { const free = hits.find((e) => !e.runtime) || hits[0]; (free.runtime = free.runtime || []).push(it); }
            return;
        }
        if (!hits.length) hits = partials.filter((e) => e.text.length >= 10 && it.text.startsWith(e.text));
        if (!hits.length) {
            const b = bindByLiteral(it.text, cache);
            if (b) {
                if (!keys.has(b.key)) { entries.push(b); keys.add(b.key); byText.set(b.text, [b]); }
                hits = byText.get(b.text);
            }
        }
        if (!hits.length) {
            extra.push({ file: null, kind: it.attr, enc: 'runtime-only', quote: null, start: 0, end: 0, line: 0, text: it.text, partial: true, parts: 0,
                ordinal: 0, key: 'runtime#' + idx + '#' + sha8(it.text), ctx: {}, runtime: [it] });
            return;
        }
        const free = hits.find((e) => !e.runtime) || hits[0];
        (free.runtime = free.runtime || []).push(it);
    });
    for (const e of extra) entries.push(e);
    // A line built from pieces ('Take “' + name + '” off the menu', or a
    // label inside markup) takes the place of the runtime text that shows ALL
    // its pieces, so it sorts and scopes with its own control. One short piece
    // alone proves nothing ("Right-click" is in more than one place).
    const nodeItems = rt.items.filter((it) => it.attr === 'node' || it.attr === 'title' || it.attr === 'aria-label' || it.attr === 'placeholder');
    for (const e of entries) {
        if (e.runtime || e.enc === 'runtime-only') continue;
        const ps = ((e.ctx && e.ctx.pieces) || []).map(norm).filter((p) => p.length >= 4);
        if (!ps.length || ps.join('').length < 10) continue;
        const hit = nodeItems.find((it) => ps.every((p) => it.text.indexOf(p) >= 0));
        if (hit) e.runtime = [Object.assign({}, hit, { contains: true })];
    }
    return out;
}

// What a player never reads as words: rows the sink cannot write
// (runtime-only), the boot cursor CSS, and innerHTML blobs that are really
// whole panels or templates unless they carry a sentence. The page and
// `check` both go by this flag.
const BLOCK_TAG = /<(div|span|button|h3|option|input|label|select)\b/i;
// Files whose words never reach a player, only the console: 42's tier names
// (PerfTiers.apply in the console and the perf scripts), 01a's config keys
// and its DOM-drift check, 38's button audit, 05a's shader link error.
// Checked by hand 2026-10-15; a file that ever puts words on screen stays out.
const DEV_FILES = new Set(['js/42-perf-tiers.js', 'js/01a-param-registry.js', 'js/38-button-audit.js', 'js/05a-shader-core.js']);
function devNoise(e) {
    if (e.enc === 'runtime-only') return true;
    if (DEV_FILES.has(e.file)) return true;
    if (/\{\s*cursor:/.test(e.text)) return true;
    if (e.kind === 'html' && BLOCK_TAG.test(e.text)) {
        if (/\$\{/.test(e.text) || e.text.length > 1200) return true;
        if (wordCount(e.text.replace(/<[^>]+>/g, ' ')) < 6) return true;
    }
    return false;
}

// ── the ledger: which lines Gabriel has touched ────────────────────
// scripts/copy-sink/ledger.json, committed. Keyed by the words themselves
// (whitespace collapsed), so the same line in five places is one touch, and
// a line whose words change in code is untouched again.
const LEDGER_ABOUT = 'Every line of player-facing text Gabriel has touched in the copy sink, keyed by its words (whitespace collapsed). ' +
    '"kept" = read and left as it was, "mine" = rewritten by him, "code" = not text a player reads. A line whose words are not here is untouched, ' +
    'so a line changed in code comes back as untouched. `node scripts/copy-sink.js check` counts what is left.';
function loadLedger() {
    try { const j = JSON.parse(fs.readFileSync(LEDGER_JSON, 'utf8')); j.texts = j.texts || {}; return j; } catch (_) { return { texts: {} }; }
}
function saveLedger(L) {
    const texts = {};
    Object.keys(L.texts).sort((a, b) => a.localeCompare(b)).forEach((k) => { texts[k] = L.texts[k]; });
    fs.writeFileSync(LEDGER_JSON, JSON.stringify({ about: LEDGER_ABOUT, texts }, null, 1) + '\n', 'utf8');
}
const today = () => new Date().toLocaleDateString('en-CA');
// list: [{ text, s }] with s = kept | mine | code, or null to untouch.
function ledgerSet(list) {
    const L = loadLedger();
    for (const it of list) {
        const k = normText(it.text || ''); if (!k) continue;
        if (it.s) L.texts[k] = it.s + ' ' + today(); else delete L.texts[k];
    }
    saveLedger(L);
    return L;
}
function stateOf(L, text) { const v = L.texts[normText(text)]; return v ? v.split(' ')[0] : ''; }

// The player text still in its original wording: one row per distinct line.
function remaining(c) {
    c = c || catalog();
    const L = loadLedger();
    const lines = new Map();
    for (const e of c.entries) {
        if (devNoise(e)) continue;
        const k = normText(e.text); if (!k) continue;
        if (!lines.has(k)) lines.set(k, { text: k, state: stateOf(L, k), where: [] });
        lines.get(k).where.push(e);
    }
    const all = [...lines.values()];
    const left = all.filter((l) => !l.state);
    const words = (ls) => ls.reduce((n, l) => n + wordCount(l.text.replace(/<[^>]*>/g, ' ')), 0);
    return { all, left, touched: all.length - left.length, words: words(all), wordsLeft: words(left), byState: all.reduce((o, l) => { o[l.state || 'untouched'] = (o[l.state || 'untouched'] || 0) + 1; return o; }, {}) };
}

// ── apply ──────────────────────────────────────────────────────────
// edits: [{ key, text, orig? }]  → rewrites the source; returns a report.
function apply(edits) {
    const fresh = extract();
    const byKey = new Map(fresh.map((e) => [e.key, e]));
    const cache = {};
    const report = { applied: [], skipped: [] };
    const perFile = new Map();
    for (const ed of edits) {
        let e = byKey.get(ed.key);
        if (!e && ed.orig) { const b = bindByLiteral(ed.orig, cache); if (b && b.key === ed.key) e = b; }
        if (!e) { report.skipped.push({ key: ed.key, reason: 'not found in current source (already applied, or the original changed)' }); continue; }
        if (e.enc === 'runtime-only') { report.skipped.push({ key: ed.key, reason: 'runtime-only string; no source literal bound' }); continue; }
        if (typeof ed.text !== 'string' || ed.text === e.text) { report.skipped.push({ key: ed.key, reason: 'unchanged' }); continue; }
        if (!perFile.has(e.file)) perFile.set(e.file, []);
        perFile.get(e.file).push({ e, text: ed.text });
    }
    const encodeHtmlText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\xa0/g, '&nbsp;');
    // Raw template text: a backtick typed as text gets its escape, one that
    // already has it is left alone.
    const rawTemplate = (s) => s.replace(/(?<!\\)((?:\\\\)*)`/g, '$1\\`');
    // An edit becomes one or more ops (a whole line 'a' + x + 'b' writes each
    // literal run), so overlap is judged per op: a line and a string inside
    // one of its ⟨…⟩ can both be written in one go.
    // Why a line can't be written again whole (netJs rebuildBlock)
    const REBUILD_NO = {
        sum: 'the tool can\'t tell whether this line adds numbers, so its ⟨…⟩ parts have to stay; ask Claude to take one out',
        comment: 'this line has a code comment inside it, so it can\'t be rebuilt here; ask Claude'
    };
    // The line written again whole: each stretch of words as one literal,
    // each ⟨…⟩ left in as its code, joined with +. A ⟨…⟩ deleted whole takes
    // its code out of the line. The ones left have to read as they did, in
    // their order, so it is clear which went. `why` is the refusal when the
    // line can't be rebuilt (else REBUILD_NO's).
    function rebuildChain(e, toks, pieces, src, why) {
        const c = e.chain;
        if (!c.spans) return { error: why || 'the tool needs restarting to rewrite this line' };
        if (c.rebuild) return { error: why || REBUILD_NO[c.rebuild] || 'this line can\'t be rebuilt here; ask Claude' };
        let keep = [];
        if (toks.length === c.exprs) keep = toks.map((_, k) => k);
        else {
            let j = 0;
            for (const t of toks) {
                while (j < c.labels.length && c.labels[j] !== t) j++;
                if (j >= c.labels.length) return { error: '⟨' + t + '⟩ isn\'t one of this line\'s parts as it was, in that order; leave each ⟨…⟩ exactly as it was, or delete it whole' };
                keep.push(j++);
            }
        }
        const code = (k) => src.slice(c.spans[k][0], c.spans[k][1]);
        // Two ⟨…⟩ shown alike but holding different code: which one went is a guess
        for (const k of keep) for (let d = 0; d < c.exprs; d++) {
            if (!keep.includes(d) && c.labels[d] === c.labels[k] && code(d) !== code(k)) return { error: 'two ⟨' + c.labels[k] + '⟩ here hold different code, so which one you deleted is unclear; ask Claude to take it out' };
        }
        const q = e.quote || "'";
        const out = [];
        pieces.forEach((p, i) => {
            if (p) out.push({ words: true, s: encodeJs(p, q) });
            if (i < keep.length) out.push({ words: false, s: c.wrap[keep[i]] ? '(' + code(keep[i]) + ')' : code(keep[i]) });
        });
        // Still a join of words: two bits of code first would add up as numbers
        if (!out.slice(0, 2).some((x) => x.words)) out.unshift({ words: true, s: q + q });
        return { ops: [{ start: e.start, end: e.end, rep: out.map((x) => x.s).join(' + ') }] };
    }
    function opsOf(e, text, src) {
        if (e.enc === 'js-chain') {
            const toks = (text.match(/⟨[^⟩]*⟩/g) || []).map((t) => t.slice(1, -1).trim());
            const pieces = text.split(/⟨[^⟩]*⟩/);
            const n = e.chain.exprs;
            if (toks.length > n) return { error: 'this line has ' + n + ' ⟨…⟩ part' + (n === 1 ? '' : 's') + ' in its code; a new one can\'t be added here' };
            // A ⟨…⟩ deleted: the line is written again without its code
            if (toks.length < n) return rebuildChain(e, toks, pieces, src);
            // Every ⟨…⟩ kept: the words go back into the literals where they
            // stand, the rest of the line untouched. Words where the code has
            // no literal need the line written again.
            const ops = [];
            for (let i = 0; i < pieces.length; i++) {
                const r = e.chain.runs[i];
                if (!r) {
                    if (pieces[i].trim()) return rebuildChain(e, toks, pieces, src, e.chain.rebuild ? 'the code has no spot for words ' + (i === 0 ? 'before the first ⟨…⟩' : i === pieces.length - 1 ? 'after the last ⟨…⟩' : 'between those two ⟨…⟩') + '; put them next to another part' : '');
                    continue;
                }
                ops.push({ start: r.start, end: r.end, rep: encodeJs(pieces[i], r.quote) });
            }
            return { ops };
        }
        let rep;
        if (e.enc === 'html-attr') rep = encodeHtmlAttr(text);
        else if (e.enc === 'html-text') rep = text;
        else if (e.enc === 'html-node') rep = encodeHtmlText(text);
        else if (e.enc === 'css-str') rep = cssEscape(text, e.quote || "'");
        else if (e.enc === 'js-template-expr') rep = '`' + rawTemplate(text) + '`';
        else if (e.enc === 'js-template-part') rep = encodeJs(text, '`').slice(1, -1);
        else if (e.enc === 'js-html-attr') {
            // HTML-encode for the attribute's quote, then escape for the JS literal, minus its outer quotes.
            let h = encodeHtmlAttr(text);
            if (e.htmlQuote === "'") h = h.replace(/&quot;/g, '"').replace(/'/g, '&#39;');
            rep = encodeJs(h, e.quote || "'").slice(1, -1);
        }
        else if (e.enc === 'js-html-text') rep = encodeJs(encodeHtmlText(text), e.quote || "'").slice(1, -1);
        else rep = encodeJs(text, e.quote || "'");
        return { ops: [{ start: e.start, end: e.end, rep }] };
    }
    const done = [];   // { key, file, line, start, end, text }
    const allOps = []; // { file, start, delta } of what was written, to follow positions
    for (const [file, list] of perFile) {
        const p = path.join(REPO, file);
        const before = fs.readFileSync(p, 'utf8');
        let src = before;
        const ops = [];
        const mine = [];
        for (const { e, text } of list) {
            const o = opsOf(e, text, before);
            if (o.error) { report.skipped.push({ key: e.key, reason: o.error }); continue; }
            if (o.ops.some((a) => ops.some((b) => a.start < b.end && b.start < a.end))) { report.skipped.push({ key: e.key, reason: 'overlaps another edit' }); continue; }
            o.ops.forEach((a) => ops.push(a));
            mine.push({ key: e.key, file, line: e.line, start: e.start, end: e.end, text });
        }
        ops.sort((a, b) => b.start - a.start);
        for (const a of ops) src = src.slice(0, a.start) + a.rep + src.slice(a.end);
        // A rewrite must leave the script parseable (a stray ${ or backtick
        // in a template would not): check before anything touches the disk.
        let broken = syntaxError(file, src);
        if (broken && syntaxError(file, before)) broken = '';   // it did not parse before either: not ours to judge
        if (broken) {
            for (const m of mine) report.skipped.push({ key: m.key, reason: 'would break ' + file + ' (' + broken + '); nothing in that file was written' });
            continue;
        }
        fs.writeFileSync(p, src, 'utf8');
        ops.forEach((a) => allOps.push({ file, start: a.start, delta: a.rep.length - (a.end - a.start) }));
        for (const m of mine) { report.applied.push({ key: m.key, file, line: m.line }); done.push(m); }
    }
    if (done.length) {
        // The rewritten words are his: mark them, and give the page each
        // string's new key (ops before a position shift it). A rewrite can
        // change how its string is cut, so whatever entry now covers the new
        // words is marked too, and is the one the page follows.
        const fresh2 = extract();
        const marks = [];
        const shiftAt = (file, pos) => allOps.filter((o) => o.file === file && o.start < pos).reduce((n, o) => n + o.delta, 0);
        for (const m of done) {
            const s = m.start + shiftAt(m.file, m.start), e = m.end + shiftAt(m.file, m.end);
            const over = fresh2.filter((x) => x.file === m.file && x.start < e && x.end > s);
            const hit = over.find((x) => x.start === s && x.end === e) || over.find((x) => x.start <= s && x.end >= e) || over[0];
            marks.push({ text: m.text, s: 'mine' });
            over.forEach((x) => { if (x.start <= s && x.end >= e) marks.push({ text: x.text, s: 'mine' }); });
            const a = report.applied.find((x) => x.key === m.key);
            if (a) { a.text = m.text; if (hit) a.newKey = hit.key; }
        }
        ledgerSet(marks);
    }
    return report;
}

// '' when the file still parses, else the parser's message. HTML: each inline script.
function syntaxError(file, src) {
    const opts = { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true };
    const tryParse = (code) => {
        try { acorn().parse(code, opts); return ''; }
        catch (e) { try { acorn().parse(code, Object.assign({}, opts, { sourceType: 'module' })); return ''; } catch (_) { return e.message; } }
    };
    if (/\.js$/.test(file)) return tryParse(src);
    if (/\.html$/.test(file)) {
        const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi; let m;
        while ((m = re.exec(src))) { if (/\bsrc\s*=/.test(m[1])) continue; const err = tryParse(m[2]); if (err) return 'inline script: ' + err; }
    }
    return '';
}

// ── static server + sink routes ────────────────────────────────────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
function readBody(req) {
    return new Promise((res, rej) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => res(Buffer.concat(c).toString('utf8'))); req.on('error', rej); });
}
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }

function serve(port) {
    port = port || DEFAULT_PORT;
    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, 'http://x');
            const p = decodeURIComponent(url.pathname);
            if (p === '/__sink' || p === '/__sink/') {
                res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
                return res.end(fs.readFileSync(path.join(SINK_DIR, 'index.html')));
            }
            if (p === '/__sink/catalog') return json(res, 200, catalog());
            if (p === '/__sink/locate.js' || p === '/__sink/review.js') {
                res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
                return res.end(fs.readFileSync(path.join(SINK_DIR, path.basename(p))));
            }
            // The app, with the sprint's "show me where" hook and the review
            // tour (?review) added on the way out (copy-sink/locate.js,
            // review.js): the shipped index.html never carries them.
            if (p === '/' || p === '/index.html') {
                const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8')
                    .replace('</body>', '<script src="/__sink/locate.js"></script><script src="/__sink/review.js"></script></body>');
                res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
                return res.end(html);
            }
            if (p === '/__sink/apply' && req.method === 'POST') {
                const body = JSON.parse(await readBody(req) || '{}');
                return json(res, 200, apply(body.edits || []));
            }
            if (p === '/__sink/ledger' && req.method === 'POST') {
                const body = JSON.parse(await readBody(req) || '{}');
                const L = ledgerSet(body.set || []);
                return json(res, 200, { ok: true, n: Object.keys(L.texts).length });
            }
            if (p === '/__sink/harvest' && req.method === 'POST') {
                return json(res, 200, await harvest('http://127.0.0.1:' + port + '/'));
            }
            let fp = path.join(REPO, p === '/' ? 'index.html' : p);
            if (!fp.startsWith(REPO)) { res.writeHead(403); return res.end(); }
            if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
            if (!fs.existsSync(fp)) { res.writeHead(404); return res.end('not found'); }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
            fs.createReadStream(fp).pipe(res);
        } catch (e) {
            json(res, 500, { error: String(e && e.stack || e) });
        }
    });
    server.listen(port, '127.0.0.1', () => {
        console.log('copy sink   http://127.0.0.1:' + port + '/__sink/');
        console.log('app         http://127.0.0.1:' + port + '/');
    });
    return server;
}

// ── harvest: runtime contexts via headless Chrome ──────────────────
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function harvest(url) {
    const { connect, waitReady } = require('./test/cdp.js');
    const PORT = 9341;
    const profile = path.join(require('os').tmpdir(), 'fluid-sink-profile-' + process.pid);
    const portUp = () => new Promise((res) => { http.get('http://127.0.0.1:' + PORT + '/json', (r) => { r.resume(); res(true); }).on('error', () => res(false)); });
    const chrome = spawn(CHROME, [
        '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
        '--window-size=1600,900', '--no-first-run', '--no-default-browser-check',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding', url
    ], { stdio: 'ignore' });
    let page = null;
    try {
        for (let i = 0; i < 80 && !(await portUp()); i++) await sleep(250);
        page = await connect(PORT);
        await waitReady(page, { timeoutMs: 60000 });
        for (let i = 0; i < 60; i++) {
            const ok = await page.eval("!!document.getElementById('mixer-strip') && !!document.getElementById('breathingToggle')").catch(() => false);
            if (ok) break;
            await sleep(250);
        }
        await page.eval("(function(){ try{localStorage.setItem('fluidui.photoWarn.ack.v1','1');}catch(_){} var pw=document.getElementById('photoWarn'); if(pw) pw.hidden=true; return 1; })()");
        await sleep(1200);   // late builders (drawers, popups mounted on idle)
        const walker = fs.readFileSync(path.join(SINK_DIR, 'harvest-page.js'), 'utf8');
        const items = await page.eval(walker, { timeoutMs: 60000 });
        const out = { at: new Date().toISOString(), url, items };
        fs.writeFileSync(RUNTIME_JSON, JSON.stringify(out, null, 1));
        return { ok: true, items: items.length, file: path.relative(REPO, RUNTIME_JSON) };
    } catch (e) {
        return { ok: false, error: String(e && e.stack || e) };
    } finally {
        if (page) try { page.close(); } catch (_) {}
        try { chrome.kill(); } catch (_) {}
        await sleep(400);
        try { spawn('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_) {}
        await sleep(600);
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
    }
}

// ── CLI ────────────────────────────────────────────────────────────
if (require.main === module) {
    const [cmd, arg] = process.argv.slice(2);
    if (cmd === 'serve') serve(parseInt(arg, 10) || DEFAULT_PORT);
    else if (cmd === 'extract') process.stdout.write(JSON.stringify(catalog(), null, 1));
    else if (cmd === 'stats') {
        const c = catalog(); const byKind = {}, byFile = {};
        for (const e of c.entries) { byKind[e.kind] = (byKind[e.kind] || 0) + 1; byFile[e.file || '(runtime)'] = (byFile[e.file || '(runtime)'] || 0) + 1; }
        console.log('entries', c.entries.length, '| with runtime ctx', c.entries.filter((e) => e.runtime).length, '| partial', c.entries.filter((e) => e.partial).length);
        console.log('by kind', byKind); console.log('by file', byFile);
    }
    else if (cmd === 'harvest') {
        let srv = null; let url = arg;
        if (!url) { srv = serve(DEFAULT_PORT + 1); url = 'http://127.0.0.1:' + (DEFAULT_PORT + 1) + '/'; }
        harvest(url).then((r) => { console.log(JSON.stringify(r)); if (srv) srv.close(); process.exit(r.ok ? 0 : 1); });
    }
    else if (cmd === 'apply') {
        const edits = JSON.parse(fs.readFileSync(arg, 'utf8'));
        console.log(JSON.stringify(apply(Array.isArray(edits) ? edits : edits.edits || []), null, 1));
    }
    else if (cmd === 'check') {
        // Exit 1 while any player text is untouched: the gate before a Steam build.
        const r = remaining();
        const pct = r.all.length ? Math.floor(100 * r.touched / r.all.length) : 100;
        console.log('Player text: ' + r.all.length + ' lines, ' + r.words + ' words.');
        console.log('Touched: ' + r.touched + ' (' + pct + '%)  ' + JSON.stringify(r.byState));
        if (!r.left.length) { console.log('Nothing left in the original wording.'); process.exit(0); }
        console.log('Left: ' + r.left.length + ' lines, ' + r.wordsLeft + ' words.');
        const byFile = {};
        r.left.forEach((l) => { const f = l.where[0].file || 'runtime'; byFile[f] = (byFile[f] || 0) + 1; });
        Object.keys(byFile).sort((a, b) => byFile[b] - byFile[a]).slice(0, arg === 'all' ? 999 : 12)
            .forEach((f) => console.log('  ' + String(byFile[f]).padStart(5) + '  ' + f));
        process.exit(1);
    }
    else if (cmd === 'drops') {
        // Audit the net: every literal it judged to be code, with the reason.
        for (const d of auditDrops()) if (/[A-Za-z]{2,}.*\s.*[A-Za-z]{2,}/.test(d.text)) console.log(d.why.padEnd(26) + (d.file + ':' + d.line).padEnd(34) + JSON.stringify(d.text).slice(0, 140));
    }
    else console.log('usage: node scripts/copy-sink.js serve [port] | extract | stats | check [all] | drops | harvest [url] | apply edits.json');
}

function auditDrops() { netDrops = []; extract(); const d = netDrops; netDrops = null; return d; }

module.exports = { extract, catalog, apply, serve, harvest, auditDrops };
