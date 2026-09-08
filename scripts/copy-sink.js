// ═══════════════════════════════════════════════════════════════════
// scripts/copy-sink.js — the copy kitchen sink: every tooltip, hint,
// placeholder, dialog line and recipe answer in the app, bound to the
// exact source literal it came from, so it can be rewritten in bulk from
// one page and written straight back into index.html / js/*.js.
//
//   node scripts/copy-sink.js serve [port]     serve the repo + the sink at
//                                              http://127.0.0.1:3998/__sink/
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

const REPO = path.resolve(__dirname, '..');
const SINK_DIR = path.join(__dirname, 'copy-sink');
const RUNTIME_JSON = path.join(SINK_DIR, 'runtime.json');
const DEFAULT_PORT = 3998;

// Files that carry user-facing copy. 39-qrcode is a vendored encoder.
function copyFiles() {
    const js = fs.readdirSync(path.join(REPO, 'js'))
        .filter((f) => /\.js$/.test(f) && !/^39-qrcode/.test(f))
        .map((f) => 'js/' + f);
    return ['index.html', ...js, 'electron-main.js'].filter((f) => fs.existsSync(path.join(REPO, f)));
}

// ── helpers ────────────────────────────────────────────────────────
const wordCount = (s) => (s.match(/[A-Za-z\u00C0-\u024F][\w'’-]*/g) || []).length;
const sha8 = (s) => crypto.createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 8);
function lineOf(src, off) { let n = 1; for (let i = 0; i < off; i++) if (src.charCodeAt(i) === 10) n++; return n; }

// Kinds that are copy no matter how short; the rest need to read like a
// sentence before they count (labels, glyphs and names are not the target).
const ALWAYS = new Set(['title', 'placeholder', 'aria-label', 'ariaLabel', 'hint', 'tip', 'desc', 'description', 'message', 'answer', 'data-tip']);
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
    let out = text.replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t')
        .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
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
        if (!sentenceish(kind, text) || looksLikeCode(text)) return;
        if (kind === 'innerHTML') {
            // Markup is editable raw, but only when it carries prose.
            if (wordCount(text.replace(/<[^>]*>/g, ' ')) < 3) return;
            kind = 'html';
        }
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

    while (i < n) {
        if (src.startsWith('<!--', i)) { const j = src.indexOf('-->', i); i = j < 0 ? n : j + 3; continue; }
        if (src[i] !== '<') { i++; continue; }
        if (src[i + 1] === '/') {
            const m = /^<\/([a-zA-Z][\w-]*)\s*>/.exec(src.slice(i, i + 40));
            if (m) { for (let k = stack.length - 1; k >= 0; k--) if (stack[k].tag === m[1].toLowerCase()) { stack.length = k; break; } i += m[0].length; } else i++;
            continue;
        }
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
}

// ── the catalog ────────────────────────────────────────────────────
function extract() {
    const entries = [];
    for (const file of copyFiles()) {
        const src = fs.readFileSync(path.join(REPO, file), 'utf8');
        if (/\.html$/.test(file)) extractHtml(src, file, entries);
        else extractJs(src, file, 0, entries);
    }
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

// Merge runtime contexts into the catalog; add read-only entries for
// runtime strings that bind nowhere.
function catalog() {
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
    return out;
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
    for (const [file, list] of perFile) {
        const p = path.join(REPO, file);
        let src = fs.readFileSync(p, 'utf8');
        list.sort((a, b) => b.e.start - a.e.start);
        let lastStart = Infinity;
        for (const { e, text } of list) {
            if (e.end > lastStart) { report.skipped.push({ key: e.key, reason: 'overlaps another edit' }); continue; }
            let rep;
            if (e.enc === 'html-attr') rep = encodeHtmlAttr(text);
            else if (e.enc === 'html-text') rep = text;
            else if (e.enc === 'js-template-expr') rep = '`' + text.replace(/`/g, '\\`') + '`';
            else if (e.enc === 'js-html-attr') {
                // HTML-encode for the attribute's quote, then escape for the JS literal, minus its outer quotes.
                let h = encodeHtmlAttr(text);
                if (e.htmlQuote === "'") h = h.replace(/&quot;/g, '"').replace(/'/g, '&#39;');
                const q = e.quote || "'";
                rep = encodeJs(h, q).slice(1, -1);
            }
            else rep = encodeJs(text, e.quote || "'");
            src = src.slice(0, e.start) + rep + src.slice(e.end);
            lastStart = e.start;
            report.applied.push({ key: e.key, file, line: e.line });
        }
        fs.writeFileSync(p, src, 'utf8');
    }
    return report;
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
            if (p === '/__sink/apply' && req.method === 'POST') {
                const body = JSON.parse(await readBody(req) || '{}');
                return json(res, 200, apply(body.edits || []));
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
    else console.log('usage: node scripts/copy-sink.js serve [port] | extract | stats | harvest [url] | apply edits.json');
}

module.exports = { extract, catalog, apply, serve, harvest };
