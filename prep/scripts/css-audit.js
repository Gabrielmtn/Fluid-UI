// prep/scripts/css-audit.js — C1: the static half of the CSS audit for the
// Walnut & Copper prep (prep/briefs/C-css-audit.md). Plain Node, no
// dependencies, deterministic output, so it can be re-run after every later
// CSS step and the results diffed.
//
//   node prep/scripts/css-audit.js             writes prep/css-values.csv and
//                                              prep/work/css/static.md, prints a summary
//   node prep/scripts/css-audit.js --no-live   same (this file has no live part; the flag
//                                              is accepted so the brief's command line works;
//                                              the live half is prep/scripts/css-live.js, C2)
//   node prep/scripts/css-audit.js --out <dir> write both outputs into <dir> instead
//
// What it reads (nothing is modified):
//   - the stylesheets index.html links, in load order (css/*.css)
//   - every inline <style> block in index.html (the #photoWarn block)
//   - the three <style> blocks JS injects into the app document
//     (js/00a-boot.js boot cursor, js/32-file-drop.js hover outline,
//     js/16-sam-integration.js keyframes) and the pen window's stylesheet
//     string (js/47-pen-window.js; a separate document)
//   - inline style="" attributes in index.html, by surface
//   - inline style strings in js/*.js: style="…" in templates, .style.cssText =,
//     el.style.x = <literal>, style.setProperty('--…')
//   - css/00-tokens.css as the token table for the cross-reference
//
// Hand-written CSS tokeniser: comments, strings, url(), nested at-rules
// (@media, @supports, @container, @layer, @keyframes, @font-face), one
// level of CSS nesting as a safety net. Not a validator: malformed input is
// skipped, not reported, except where noted in the report.
//
// CSV columns: value,property,file,line,selector,category,context,token
// (the brief's six first, in order; `context` = enclosing at-rules or the
// inline/injected source; `token` = 00-tokens.css tokens whose value equals
// this literal, the step-2 worklist).
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const OUT_DIR = outIdx >= 0 ? path.resolve(argv[outIdx + 1]) : null;
const OUT_CSV = OUT_DIR ? path.join(OUT_DIR, 'css-values.csv') : path.join(ROOT, 'prep', 'css-values.csv');
const OUT_MD = OUT_DIR ? path.join(OUT_DIR, 'static.md') : path.join(ROOT, 'prep', 'work', 'css', 'static.md');

// ─── small utilities ────────────────────────────────────────────────────────

function read(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^﻿/, '');
}
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }
function lineIndexer(text) {
    const starts = [0];
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
    return function lineOf(off) {
        let lo = 0, hi = starts.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; }
        return lo + 1;
    };
}
const normWs = s => String(s).replace(/\s+/g, ' ').trim();
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
function csvCell(v) {
    v = v == null ? '' : String(v);
    return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
function md(v) { return String(v == null ? '' : v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' '); }
function code(v) { const s = String(v == null ? '' : v).replace(/\r?\n/g, ' '); return s ? '`' + s.replace(/`/g, 'ˋ') + '`' : ''; }
function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function sortBy(arr, ...keys) {
    return arr.slice().sort((x, y) => {
        for (const k of keys) { const r = cmp(k(x), k(y)); if (r) return r; }
        return 0;
    });
}
function counter() {
    const m = new Map();
    return {
        add(k, n) { m.set(k, (m.get(k) || 0) + (n == null ? 1 : n)); },
        get(k) { return m.get(k) || 0; },
        entries() { return sortBy([...m.entries()], e => -e[1], e => e[0]); },
        size() { return m.size; },
        map: m,
    };
}
function pad(n) { return String(n); }
function truncate(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function skipString(text, i) {
    const q = text[i]; i++;
    while (i < text.length) {
        const c = text[i];
        if (c === '\\') { i += 2; continue; }
        if (c === q) return i + 1;
        if (c === '\n') return i; // unterminated: stop at end of line
        i++;
    }
    return i;
}
// Scan from i to the first stop char at paren/bracket depth 0, outside strings and comments.
function scanTo(text, i, stops) {
    let dp = 0, db = 0;
    while (i < text.length) {
        const ch = text[i];
        if (ch === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? text.length : e + 2; continue; }
        if (ch === '"' || ch === "'") { i = skipString(text, i); continue; }
        if (ch === '(') dp++;
        else if (ch === ')') { if (dp > 0) dp--; }
        else if (ch === '[') db++;
        else if (ch === ']') { if (db > 0) db--; }
        else if (dp === 0 && db === 0 && stops.includes(ch)) return { end: i, ch };
        i++;
    }
    return { end: text.length, ch: '' };
}
// Split at depth-0 separators. sep: ',' | '/' | ';' | 'ws'
function splitTop(s, sep) {
    const parts = []; let depth = 0, cur = '';
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === '"' || ch === "'") { const e = skipString(s, i); cur += s.slice(i, e); i = e - 1; continue; }
        if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
        const isSep = depth === 0 && (sep === 'ws' ? /\s/.test(ch) : ch === sep);
        if (isSep) { if (cur.trim()) parts.push(cur.trim()); cur = ''; }
        else cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
}
function parseFn(tok) {
    const m = /^([a-zA-Z-][\w-]*)\(/.exec(tok);
    if (!m || !tok.endsWith(')')) return null;
    let depth = 0;
    for (let i = m[0].length - 1; i < tok.length; i++) {
        const ch = tok[i];
        if (ch === '"' || ch === "'") { i = skipString(tok, i) - 1; continue; }
        if (ch === '(') depth++;
        else if (ch === ')') { depth--; if (depth === 0 && i !== tok.length - 1) return null; }
    }
    return { name: m[1].toLowerCase(), args: tok.slice(m[0].length, -1) };
}
const unquote = s => s.trim().replace(/^(['"])(.*)\1$/, '$2');
const kebab = s => s.replace(/[A-Z]/g, c => '-' + c.toLowerCase()).replace(/^webkit-/, '-webkit-').replace(/^moz-/, '-moz-');

// ─── colours ─────────────────────────────────────────────────────────────────

const NAMED = (function () {
    const list = 'aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc bisque ffe4c4 black 000000 blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 chocolate d2691e coral ff7f50 cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff darkblue 00008b darkcyan 008b8b darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b darkmagenta 8b008b darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000 darksalmon e9967a darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f darkslategrey 2f4f4f darkturquoise 00ced1 darkviolet 9400d3 deeppink ff1493 deepskyblue 00bfff dimgray 696969 dimgrey 696969 dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0 forestgreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 goldenrod daa520 gray 808080 green 008000 greenyellow adff2f grey 808080 honeydew f0fff0 hotpink ff69b4 indianred cd5c5c indigo 4b0082 ivory fffff0 khaki f0e68c lavender e6e6fa lavenderblush fff0f5 lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6 lightcoral f08080 lightcyan e0ffff lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3 lightpink ffb6c1 lightsalmon ffa07a lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 lightslategrey 778899 lightsteelblue b0c4de lightyellow ffffe0 lime 00ff00 limegreen 32cd32 linen faf0e6 magenta ff00ff maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd mediumorchid ba55d3 mediumpurple 9370db mediumseagreen 3cb371 mediumslateblue 7b68ee mediumspringgreen 00fa9a mediumturquoise 48d1cc mediumvioletred c71585 midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5 navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500 orangered ff4500 orchid da70d6 palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 peru cd853f pink ffc0cb plum dda0dd powderblue b0e0e6 purple 800080 rebeccapurple 663399 red ff0000 rosybrown bc8f8f royalblue 4169e1 saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57 seashell fff5ee sienna a0522d silver c0c0c0 skyblue 87ceeb slateblue 6a5acd slategray 708090 slategrey 708090 snow fffafa springgreen 00ff7f steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8 tomato ff6347 turquoise 40e0d0 violet ee82ee wheat f5deb3 white ffffff whitesmoke f5f5f5 yellow ffff00 yellowgreen 9acd32'.split(/\s+/);
    const m = {};
    for (let i = 0; i < list.length; i += 2) m[list[i]] = list[i + 1];
    return m;
})();
const COLOUR_FN = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color']);
const COLOUR_PROP = /(^|-)color$|^background|^border|^outline|shadow$|^fill$|^stroke$|^column-rule|^text-decoration|^text-emphasis|^--|^filter$|^backdrop-filter$|^-webkit-backdrop-filter$|^-webkit-text-fill-color$|^-webkit-text-stroke|^box-shadow|^text-shadow|^border-image|^mask|^-webkit-mask|^caret-color$|^accent-color$|^scrollbar-color$/;
const HEX_RE = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
// Returns { key, display, kind } or null. kind: hex|fn|named|keyword|other
function parseColour(tok) {
    const t = tok.trim(), low = t.toLowerCase();
    const mk = (r, g, b, a, kind) => {
        r = Math.round(r); g = Math.round(g); b = Math.round(b);
        a = Math.round(a * 1000) / 1000;
        const hex = '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
        return { key: `${r},${g},${b},${a}`, display: a === 1 ? hex : `rgba(${r}, ${g}, ${b}, ${a})`, kind };
    };
    if (low === 'transparent') return { key: '0,0,0,0', display: 'transparent', kind: 'keyword' };
    if (low === 'currentcolor') return { key: 'currentcolor', display: 'currentColor', kind: 'keyword' };
    if (NAMED[low]) { const h = NAMED[low]; return mk(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1, 'named'); }
    const hm = HEX_RE.exec(t);
    if (hm) {
        let h = hm[1];
        if (h.length <= 4) h = h.split('').map(c => c + c).join('');
        const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
        const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
        return mk(r, g, b, a, 'hex');
    }
    const fn = parseFn(t);
    if (!fn) return null;
    const num = (s, scale) => {
        s = s.trim().toLowerCase();
        if (s === 'none') return 0;
        if (s.endsWith('%')) return parseFloat(s) / 100 * scale;
        if (/deg$/.test(s)) return parseFloat(s);
        if (/turn$/.test(s)) return parseFloat(s) * 360;
        if (/rad$/.test(s)) return parseFloat(s) * 180 / Math.PI;
        return parseFloat(s);
    };
    if (fn.name === 'rgb' || fn.name === 'rgba' || fn.name === 'hsl' || fn.name === 'hsla') {
        if (/var\(|calc\(/.test(fn.args)) return { key: 'fn:' + low.replace(/\s+/g, ''), display: normWs(t), kind: 'other' };
        const parts = fn.args.split(/[\s,\/]+/).map(s => s.trim()).filter(Boolean);
        if (parts.length < 3) return null;
        const a = parts.length > 3 ? (parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1;
        if (fn.name.startsWith('rgb')) return mk(num(parts[0], 255), num(parts[1], 255), num(parts[2], 255), a, 'fn');
        const [r, g, b] = hslToRgb(num(parts[0], 360), parseFloat(parts[1]), parseFloat(parts[2]));
        return mk(r, g, b, a, 'fn');
    }
    if (COLOUR_FN.has(fn.name)) return { key: 'fn:' + low.replace(/\s+/g, ''), display: normWs(t), kind: 'other' };
    return null;
}

// ─── CSS parser ──────────────────────────────────────────────────────────────

const GROUP_AT = new Set(['media', 'supports', 'container', 'layer', 'document', 'scope', 'starting-style']);

// meta: { file, lineOf(offset), source } → { rules, atRules, comments, declCount }
function parseCss(text, meta) {
    const out = { rules: [], atRules: [], comments: [], declCount: 0, stray: [] };
    const lineOf = meta.lineOf;
    const n = text.length;
    let i = 0;
    const ctx = [];
    const ctxStrings = () => ctx.map(c => '@' + c.name + (c.params ? ' ' + c.params : ''));

    function pushComment(start, end) {
        out.comments.push({ start, end, text: normWs(text.slice(start + 2, Math.max(start + 2, end - 2))), line: lineOf(start) });
    }
    function skipWs() {
        for (;;) {
            while (i < n && /\s/.test(text[i])) i++;
            if (text[i] === '/' && text[i + 1] === '*') {
                const e = text.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2;
                pushComment(i, end); i = end;
            } else break;
        }
    }
    function newRule(selectorText, start, kind) {
        const rule = {
            kind, selectorText, decls: [], file: meta.file, line: lineOf(start), offset: start,
            context: ctxStrings(), source: meta.source || '', keyframes: null,
            selectors: kind === 'style' ? splitTop(selectorText, ',').map(normWs).filter(Boolean) : [],
        };
        for (const c of ctx) c.rules.push(rule);
        return rule;
    }
    function addDecl(rule, raw, start, end) {
        // comments inside the declaration are kept as comments (reasons), then stripped
        const cre = /\/\*[\s\S]*?\*\//g; let cm;
        while ((cm = cre.exec(raw))) pushComment(start + cm.index, start + cm.index + cm[0].length);
        const clean = stripComments(raw).trim();
        if (!clean) return;
        const colon = clean.indexOf(':');
        if (colon < 0) { out.stray.push({ text: truncate(clean, 80), line: lineOf(start), file: meta.file }); return; }
        let prop = clean.slice(0, colon).trim();
        let value = clean.slice(colon + 1).trim();
        if (!prop.startsWith('--')) prop = prop.toLowerCase();
        let important = false;
        const m = /!\s*important\s*$/i.exec(value);
        if (m) { important = true; value = value.slice(0, m.index).trim(); }
        value = normWs(value);
        const d = { prop, value, important, line: lineOf(start), offset: start, end, rule };
        rule.decls.push(d);
        out.declCount++;
    }
    function readDecls(rule) {
        for (;;) {
            skipWs();
            if (i >= n) return;
            if (text[i] === '}') { i++; return; }
            if (text[i] === ';') { i++; continue; }
            const start = i;
            const r = scanTo(text, i, ';{}');
            const raw = text.slice(start, r.end);
            if (r.ch === '{') {
                // CSS nesting (not used by the app today; kept so a nested rule is not lost)
                const sel = normWs(stripComments(raw));
                i = r.end + 1;
                const nested = newRule(rule.selectorText + ' { ' + sel + ' }', start, 'style');
                nested.nested = true;
                readDecls(nested);
                out.rules.push(nested);
                continue;
            }
            i = r.end + (r.ch === ';' ? 1 : 0);
            addDecl(rule, raw, start, r.end);
        }
    }
    function parseKeyframes(node) {
        for (;;) {
            skipWs();
            if (i >= n) return;
            if (text[i] === '}') { i++; return; }
            const start = i;
            const r = scanTo(text, i, '{}');
            if (r.ch !== '{') { i = r.end + 1; continue; }
            const sel = normWs(stripComments(text.slice(start, r.end)));
            i = r.end + 1;
            const rule = newRule('@keyframes ' + node.params + ' ' + sel, start, 'keyframe');
            rule.keyframes = node.params;
            readDecls(rule);
            out.rules.push(rule);
        }
    }
    function parseRules(endAtBrace) {
        for (;;) {
            skipWs();
            if (i >= n) return;
            const ch = text[i];
            if (ch === '}') { i++; if (endAtBrace) return; continue; }
            if (ch === ';') { i++; continue; }
            const start = i;
            if (ch === '@') {
                const r = scanTo(text, i, '{;');
                const prelude = normWs(stripComments(text.slice(start, r.end)));
                const m = /^@([\w-]+)\s*([\s\S]*)$/.exec(prelude);
                const name = (m ? m[1] : prelude.slice(1)).toLowerCase();
                const params = m ? m[2].trim() : '';
                const node = { name, params, file: meta.file, line: lineOf(start), context: ctxStrings(), rules: [], kind: r.ch === '{' ? 'block' : 'statement', source: meta.source || '' };
                out.atRules.push(node);
                i = r.end + 1;
                if (r.ch !== '{') continue;
                if (GROUP_AT.has(name)) { ctx.push(node); parseRules(true); ctx.pop(); }
                else if (name === 'keyframes' || name.endsWith('-keyframes')) { ctx.push(node); parseKeyframes(node); ctx.pop(); }
                else { const rule = newRule('@' + name + (params ? ' ' + params : ''), start, name); readDecls(rule); out.rules.push(rule); }
                continue;
            }
            const r = scanTo(text, i, '{;}');
            if (r.ch !== '{') { out.stray.push({ text: truncate(normWs(text.slice(start, r.end)), 80), line: lineOf(start), file: meta.file }); i = r.end + 1; continue; }
            const selectorText = normWs(stripComments(text.slice(start, r.end)));
            i = r.end + 1;
            const rule = newRule(selectorText, start, 'style');
            readDecls(rule);
            out.rules.push(rule);
        }
    }
    parseRules(false);
    return out;
}

// A declaration list without braces (style="" attributes, cssText strings).
function parseDeclList(text) {
    const decls = [];
    for (const part of splitTop(text, ';')) {
        const clean = stripComments(part).trim();
        if (!clean) continue;
        const colon = clean.indexOf(':');
        if (colon < 0) continue;
        let prop = clean.slice(0, colon).trim();
        let value = clean.slice(colon + 1).trim();
        if (!prop.startsWith('--')) prop = prop.toLowerCase();
        let important = false;
        const m = /!\s*important\s*$/i.exec(value);
        if (m) { important = true; value = value.slice(0, m.index).trim(); }
        decls.push({ prop, value: normWs(value), important });
    }
    return decls;
}

// ─── selectors ───────────────────────────────────────────────────────────────

function readIdent(s, i) { const m = /^-?[\w-]*(?:\\.[\w-]*)*/.exec(s.slice(i)); return i + (m ? m[0].length : 0); }
function matchParen(s, i) { // s[i] === '(' → index after the matching ')'
    let d = 0;
    for (; i < s.length; i++) {
        const ch = s[i];
        if (ch === '"' || ch === "'") { i = skipString(s, i) - 1; continue; }
        if (ch === '(') d++; else if (ch === ')') { d--; if (d === 0) return i + 1; }
    }
    return s.length;
}
// [a, b, c] specificity of one complex selector
function specificity(sel) {
    let a = 0, b = 0, c = 0, i = 0;
    const PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);
    while (i < sel.length) {
        const ch = sel[i];
        if (ch === '#') { a++; i = readIdent(sel, i + 1); }
        else if (ch === '.') { b++; i = readIdent(sel, i + 1); }
        else if (ch === '[') { b++; const e = sel.indexOf(']', i); i = e < 0 ? sel.length : e + 1; }
        else if (ch === ':') {
            if (sel[i + 1] === ':') { c++; i = readIdent(sel, i + 2); if (sel[i] === '(') i = matchParen(sel, i); }
            else {
                const ns = readIdent(sel, i + 1); const name = sel.slice(i + 1, ns).toLowerCase(); i = ns;
                if (sel[i] === '(') {
                    const e = matchParen(sel, i); const inner = sel.slice(i + 1, e - 1); i = e;
                    if (name === 'not' || name === 'is' || name === 'has' || name === 'matches') {
                        let best = [0, 0, 0];
                        for (const sub of splitTop(inner, ',')) { const sp = specificity(sub); if (cmpSpec(sp, best) > 0) best = sp; }
                        a += best[0]; b += best[1]; c += best[2];
                    } else if (name === 'where') { /* zero */ }
                    else b++;
                } else if (PSEUDO_ELEMENTS.has(name)) c++;
                else b++;
            }
        }
        else if (ch === '*') i++;
        else if (/[a-zA-Z_]/.test(ch) || (ch === '-' && /[a-zA-Z]/.test(sel[i + 1] || ''))) { c++; i = readIdent(sel, i); }
        else if (ch === '\\') i += 2;
        else i++;
    }
    return [a, b, c];
}
function cmpSpec(x, y) { return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; }
// Compounds of one complex selector, split at depth-0 combinators.
function compounds(sel) {
    const out = []; let cur = ''; let depth = 0;
    for (let i = 0; i < sel.length; i++) {
        const ch = sel[i];
        if (ch === '"' || ch === "'") { const e = skipString(sel, i); cur += sel.slice(i, e); i = e - 1; continue; }
        if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
        if (depth === 0 && (ch === ' ' || ch === '>' || ch === '+' || ch === '~')) { if (cur) out.push(cur); cur = ''; continue; }
        cur += ch;
    }
    if (cur) out.push(cur);
    return out;
}
function depth0(sel) { // the selector with bracket / paren / string contents blanked
    let out = ''; let depth = 0;
    for (let i = 0; i < sel.length; i++) {
        const ch = sel[i];
        if (ch === '"' || ch === "'") { const e = skipString(sel, i); out += ' '.repeat(e - i); i = e - 1; continue; }
        if (ch === '(' || ch === '[') { depth++; out += ch; continue; }
        if (ch === ')' || ch === ']') { depth = Math.max(0, depth - 1); out += ch; continue; }
        out += depth === 0 ? ch : ' ';
    }
    return out;
}

// ─── literal extraction ──────────────────────────────────────────────────────

const TIME_RE = /^-?\d*\.?\d+(ms|s)$/i;
const EASING_KW = new Set(['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'step-start', 'step-end']);
const EASING_FN = new Set(['cubic-bezier', 'steps', 'linear']);
const ANIM_KW = new Set(['infinite', 'forwards', 'backwards', 'both', 'none', 'alternate', 'alternate-reverse', 'normal', 'reverse', 'running', 'paused', 'inherit', 'initial', 'unset', 'revert', 'auto']);
const FONT_SIZE_RE = /^(\d*\.?\d+(px|em|rem|%|pt|vw|vh|vmin|vmax|ch|ex)|xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger|calc\(.*\)|var\(.*\)|clamp\(.*\))(\/\S+)?$/;

// push(category, value, note?) — categories: colour font-family font-size font-weight radius shadow duration delay easing animation-name z-index var
function extractLiterals(prop, value, push, stats) {
    const colourCtx = COLOUR_PROP.test(prop);
    function walk(v, inGradient) {
        for (const layer of splitTop(v, ',')) {
            for (const tok of splitTop(layer, 'ws')) {
                if (!tok) continue;
                if (tok[0] === '"' || tok[0] === "'") continue;
                const fn = parseFn(tok);
                if (fn) {
                    if (fn.name === 'var') {
                        // the var read itself is recorded by the regex pass below; only the fallback holds literals
                        const args = splitTop(fn.args, ',');
                        if (args.length > 1) walk(args.slice(1).join(','), inGradient);
                    } else if (fn.name === 'url') {
                        stats.urls++;
                        if (/^\s*['"]?data:/i.test(fn.args)) stats.dataUris++;
                    } else if (COLOUR_FN.has(fn.name)) {
                        push('colour', normWs(tok));
                    } else {
                        if (fn.name === 'color-mix' || fn.name === 'light-dark') push('colour', normWs(tok));
                        walk(fn.args, inGradient || /gradient$/.test(fn.name));
                    }
                    continue;
                }
                if (HEX_RE.test(tok)) { push('colour', tok); continue; }
                const low = tok.toLowerCase();
                if ((NAMED[low] || low === 'transparent' || low === 'currentcolor') && (colourCtx || inGradient)) push('colour', tok);
            }
        }
    }
    // var() reads: one regex pass over the whole value, so reads inside oklch(),
    // calc() arithmetic, gradients and fallbacks are all counted exactly once.
    { const re = /var\(\s*(--[\w-]+)/g; let m; while ((m = re.exec(value))) push('var', m[1]); }
    walk(value, false);

    const isVar = /^var\(/.test(value);
    if (prop === 'font-family') {
        for (const f of splitTop(value, ',')) if (!/^var\(/.test(f)) push('font-family', unquote(f));
    } else if (prop === 'font') {
        const toks = splitTop(value, 'ws');
        const si = toks.findIndex(t => FONT_SIZE_RE.test(t));
        if (si >= 0) {
            const size = toks[si].split('/')[0];
            if (!/^var\(/.test(size)) push('font-size', size);
            for (const t of toks.slice(0, si)) if (/^(\d{3}|bold|bolder|lighter)$/.test(t)) push('font-weight', t);
            for (const f of splitTop(toks.slice(si + 1).join(' '), ',')) if (!/^var\(/.test(f)) push('font-family', unquote(f));
        }
    } else if (prop === 'font-size') { if (!isVar) push('font-size', value); }
    else if (prop === 'font-weight') { if (!isVar) push('font-weight', value); }
    else if (/^border(-[a-z]+)*-radius$/.test(prop)) {
        for (const side of splitTop(value, '/')) for (const t of splitTop(side, 'ws')) if (!/^var\(/.test(t)) push('radius', t);
    } else if (prop === 'box-shadow' || prop === 'text-shadow') {
        for (const layer of splitTop(value, ',')) if (!/^(none|inherit|initial|unset)$/i.test(layer)) push('shadow', normWs(layer));
    } else if (prop === 'filter' || prop === 'backdrop-filter' || prop === '-webkit-backdrop-filter') {
        for (const t of splitTop(value, 'ws')) { const fn = parseFn(t); if (fn && fn.name === 'drop-shadow') push('shadow', normWs(t)); }
    } else if (/^transition(-\w+)?$/.test(prop) || /^animation(-\w+)?$/.test(prop)) {
        const isAnim = prop.startsWith('animation');
        const sub = prop.includes('-') ? prop.slice(prop.indexOf('-') + 1) : '';
        for (const layer of splitTop(value, ',')) {
            let times = 0;
            for (const t of splitTop(layer, 'ws')) {
                if (/^var\(/.test(t)) continue;
                const low = t.toLowerCase();
                const fn = parseFn(t);
                if (sub === 'property') continue;
                if (sub === 'duration') { if (TIME_RE.test(t)) push('duration', low); continue; }
                if (sub === 'delay') { if (TIME_RE.test(t)) push('delay', low); continue; }
                if (sub === 'timing-function') { push('easing', normWs(t)); continue; }
                if (sub === 'name') { if (low !== 'none') push('animation-name', t); continue; }
                if (sub && sub !== '') continue; // iteration-count, fill-mode, direction, play-state
                if (TIME_RE.test(t)) { push(times === 0 ? 'duration' : 'delay', low); times++; continue; }
                if (EASING_KW.has(low) || (fn && EASING_FN.has(fn.name))) { push('easing', normWs(t)); continue; }
                if (isAnim && !ANIM_KW.has(low) && !/^\d/.test(t) && !fn) push('animation-name', t);
            }
        }
    } else if (prop === 'z-index') { if (!isVar) push('z-index', value); }
}

// ─── sources ─────────────────────────────────────────────────────────────────

// JS string-literal pieces of src[start..end): literals become text, anything
// else becomes the placeholder __JS__; each piece carries its JS line.
function jsStringPieces(src, start, end, lineOf) {
    const pieces = [];
    let i = start, codeBuf = false;
    const flushCode = () => { if (codeBuf) { pieces.push({ text: '__JS__', line: lineOf(i), lit: false }); codeBuf = false; } };
    const unescape = s => s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r?\n|[\s\S])/g, (m, e) => {
        if (e[0] === 'u') return String.fromCodePoint(parseInt(e.replace(/[u{}]/g, ''), 16));
        if (e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
        if (/^\r?\n$/.test(e)) return '';
        return { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0' }[e] ?? e;
    });
    function pushLit(text, line) {
        const lines = text.split('\n');
        lines.forEach((l, k) => pieces.push({ text: l + (k < lines.length - 1 ? '\n' : ''), line: line + k, lit: true }));
    }
    while (i < end) {
        const ch = src[i];
        if (ch === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? end : e; continue; }
        if (ch === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? end : e + 2; continue; }
        if (ch === '"' || ch === "'") {
            flushCode();
            const s = i; const e = skipString(src, i);
            pushLit(unescape(src.slice(s + 1, src[e - 1] === ch ? e - 1 : e)), lineOf(s));
            i = e; continue;
        }
        if (ch === '`') {
            flushCode();
            let j = i + 1, buf = '', bufLine = lineOf(j);
            while (j < end) {
                const c = src[j];
                if (c === '\\') { buf += unescape(src.slice(j, j + 2)); j += 2; continue; }
                if (c === '`') { j++; break; }
                if (c === '$' && src[j + 1] === '{') {
                    pushLit(buf, bufLine); buf = '';
                    let d = 0; let k = j + 1;
                    for (; k < end; k++) {
                        const cc = src[k];
                        if (cc === '"' || cc === "'" || cc === '`') { k = skipString(src, k) - 1; continue; }
                        if (cc === '{') d++; else if (cc === '}') { d--; if (d === 0) break; }
                    }
                    pieces.push({ text: '__JS__', line: lineOf(j), lit: false });
                    j = k + 1; bufLine = lineOf(j); continue;
                }
                buf += c; j++;
            }
            pushLit(buf, bufLine);
            i = j; continue;
        }
        if (/[\s+,()[\]]/.test(ch)) { i++; continue; }
        codeBuf = true; i++;
    }
    flushCode();
    return pieces;
}
function piecesToSource(pieces) {
    let text = ''; const bounds = [];
    for (const p of pieces) { bounds.push({ start: text.length, line: p.line }); text += p.text; }
    const lineOf = off => {
        let lo = 0, hi = bounds.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (bounds[mid].start <= off) lo = mid; else hi = mid - 1; }
        return bounds.length ? bounds[lo].line : 1;
    };
    return { text, lineOf, allLiteral: pieces.every(p => p.lit) };
}
// end of a JS statement: the ';' at depth 0, or a depth-0 '}' / EOF; capped.
function jsStatementEnd(src, i, cap) {
    const limit = Math.min(src.length, i + (cap || 6000));
    let d = 0;
    while (i < limit) {
        const ch = src[i];
        if (ch === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? limit : e; continue; }
        if (ch === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? limit : e + 2; continue; }
        if (ch === '"' || ch === "'") { i = skipString(src, i); continue; }
        if (ch === '`') {
            i++;
            while (i < limit && src[i] !== '`') { if (src[i] === '\\') i++; i++; }
            i++; continue;
        }
        if (ch === '(' || ch === '[' || ch === '{') d++;
        else if (ch === ')' || ch === ']') d--;
        else if (ch === '}') { if (d === 0) return i; d--; }
        else if (ch === ';' && d <= 0) return i;
        i++;
    }
    return limit;
}

function stylesheetOrder(indexHtml) {
    const out = []; const re = /<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/g; let m;
    while ((m = re.exec(indexHtml))) out.push(m[1]);
    return out;
}
// Every js/*.js index.html references: <script src> tags AND the quoted paths in
// its deferred loader array (index.html ~1744, `var scripts = ['js/04a-…', …]`).
function scriptRefs(indexHtml) {
    const out = new Set(); let m;
    const re1 = /<script[^>]*src=["']([^"']+)["']/g;
    while ((m = re1.exec(indexHtml))) out.add(m[1]);
    const re2 = /['"](js\/[\w.-]+\.js)['"]/g;
    while ((m = re2.exec(indexHtml))) out.add(m[1]);
    return out;
}

// Inline <style> blocks and style="" attributes in an HTML file.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'param', 'keygen']);
function scanHtml(html, lineOf) {
    const styleBlocks = [], styleAttrs = [], stack = [];
    let i = 0; const n = html.length;
    const attrRe = /([^\s"'=<>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    while (i < n) {
        const lt = html.indexOf('<', i);
        if (lt < 0) break;
        if (html.startsWith('<!--', lt)) { const e = html.indexOf('-->', lt + 4); i = e < 0 ? n : e + 3; continue; }
        if (html[lt + 1] === '!' || html[lt + 1] === '?') { const e = html.indexOf('>', lt); i = e < 0 ? n : e + 1; continue; }
        if (html[lt + 1] === '/') {
            const e = html.indexOf('>', lt); const name = html.slice(lt + 2, e).trim().toLowerCase();
            for (let k = stack.length - 1; k >= 0; k--) if (stack[k].tag === name) { stack.length = k; break; }
            i = e < 0 ? n : e + 1; continue;
        }
        // opening tag: find '>' outside quotes
        let j = lt + 1, q = null;
        while (j < n) { const c = html[j]; if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '>') break; j++; }
        const tagText = html.slice(lt + 1, j);
        const nm = /^([a-zA-Z][\w:-]*)/.exec(tagText);
        if (!nm) { i = j + 1; continue; }
        const tag = nm[1].toLowerCase();
        const selfClose = /\/\s*$/.test(tagText);
        const attrs = {}; attrRe.lastIndex = 0; let am;
        const attrText = tagText.slice(nm[0].length).replace(/\/\s*$/, '');
        while ((am = attrRe.exec(attrText))) attrs[am[1].toLowerCase()] = am[2] ?? am[3] ?? am[4] ?? '';
        const el = { tag, id: attrs.id || '', cls: (attrs.class || '').trim().split(/\s+/)[0] || '', line: lineOf(lt) };
        if (attrs.style != null) {
            const bodyIdx = stack.findIndex(s => s.tag === 'body');
            const chain = stack.concat([el]);
            const top = bodyIdx >= 0 ? chain[bodyIdx + 1] : chain[0];
            const label = e => e ? (e.id ? '#' + e.id : e.cls ? '.' + e.cls : '<' + e.tag + '>') : '';
            let near = ''; for (let k = chain.length - 1; k >= 0; k--) if (chain[k].id) { near = '#' + chain[k].id; break; }
            styleAttrs.push({ line: el.line, tag, id: el.id, cls: el.cls, surface: label(top), nearestId: near, style: attrs.style, hidden: attrs.hidden != null });
        }
        i = j + 1;
        if (tag === 'script' || tag === 'style') {
            const close = html.toLowerCase().indexOf('</' + tag, i);
            const body = html.slice(i, close < 0 ? n : close);
            if (tag === 'style') styleBlocks.push({ line: lineOf(i), offset: i, text: body, attrs });
            i = close < 0 ? n : close;
            continue;
        }
        if (!selfClose && !VOID.has(tag)) stack.push(el);
    }
    return { styleBlocks, styleAttrs };
}

// ─── main ────────────────────────────────────────────────────────────────────

function main() {
    const indexHtml = read('index.html');
    const indexLineOf = lineIndexer(indexHtml);
    const cssOrder = stylesheetOrder(indexHtml);
    const jsLoaded = scriptRefs(indexHtml);
    const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).sort();

    let head = 'unknown';
    try { head = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (_) { /* no git */ }

    const sources = [];   // { file, label, kind, bytes, lines, parsed, order, source }
    const fileOrder = new Map();
    cssOrder.forEach((f, k) => fileOrder.set(f, k));
    fileOrder.set('index.html', cssOrder.length);
    jsFiles.forEach((f, k) => fileOrder.set('js/' + f, cssOrder.length + 1 + k));
    const orderOf = f => fileOrder.has(f) ? fileOrder.get(f) : 10000;

    // 1. stylesheets
    for (const f of cssOrder) {
        if (!exists(f)) { sources.push({ file: f, label: f, kind: 'missing', bytes: 0, lines: 0, parsed: { rules: [], atRules: [], comments: [], declCount: 0, stray: [] } }); continue; }
        const text = read(f);
        sources.push({ file: f, label: f, kind: 'stylesheet', bytes: fs.statSync(path.join(ROOT, f)).size, lines: text.split('\n').length, parsed: parseCss(text, { file: f, lineOf: lineIndexer(text), source: '' }), source: '' });
    }
    // 2. inline <style> blocks + style="" attributes in index.html
    const html = scanHtml(indexHtml, indexLineOf);
    html.styleBlocks.forEach((b, k) => {
        const label = `index.html <style> (line ${b.line})`;
        const src = 'inline <style> index.html:' + b.line;
        sources.push({ file: 'index.html', label, kind: 'inline-style-block', bytes: Buffer.byteLength(b.text), lines: b.text.split('\n').length, parsed: parseCss(b.text, { file: 'index.html', lineOf: off => indexLineOf(b.offset + off), source: src }), source: src, blockLine: b.line });
    });
    // 3. JS-injected blocks
    const INJECTED = [
        { file: 'js/00a-boot.js', id: '#boot-cursor-style', note: 'boot cursor rule; element removed after the title card (stopCursor)', find: src => { const m = /curStyle\.textContent\s*=/.exec(src); return m ? [m.index + m[0].length, jsStatementEnd(src, m.index + m[0].length)] : null; } },
        { file: 'js/32-file-drop.js', id: '(no id) .file-drop-hover', note: 'file-drop hover outline; appended at load, never removed', find: src => { const m = /\bst\.textContent\s*=/.exec(src); return m ? [m.index + m[0].length, jsStatementEnd(src, m.index + m[0].length)] : null; } },
        { file: 'js/16-sam-integration.js', id: '#samModalStyles', note: 'SAM download modal keyframes; added on first modal, never removed', find: src => { const m = /samModalStyles'[\s\S]*?style\.textContent\s*=/.exec(src); return m ? [m.index + m[0].length, jsStatementEnd(src, m.index + m[0].length)] : null; } },
        { file: 'js/47-pen-window.js', id: 'pen window <style>', note: 'whole stylesheet of the pen input window; a SEPARATE document (window.open), not in the app cascade', separate: true, find: src => { const a = /'<style>',/.exec(src); if (!a) return null; const b = /'<\/style>/.exec(src.slice(a.index)); return b ? [a.index + a[0].length, a.index + b.index] : null; } },
    ];
    const injectedSources = [];
    for (const inj of INJECTED) {
        if (!exists(inj.file)) { injectedSources.push({ ...inj, missing: true }); continue; }
        const src = read(inj.file); const lineOf = lineIndexer(src);
        const span = inj.find(src);
        if (!span) { injectedSources.push({ ...inj, missing: true }); continue; }
        const pieces = jsStringPieces(src, span[0], span[1], lineOf);
        const ps = piecesToSource(pieces);
        const label = `${inj.file} injected ${inj.id}`;
        const srcTag = 'injected ' + inj.id + (inj.separate ? ' (separate document)' : '');
        const s = { file: inj.file, label, kind: inj.separate ? 'separate-document' : 'injected', bytes: Buffer.byteLength(ps.text), lines: ps.text.split('\n').length, parsed: parseCss(ps.text, { file: inj.file, lineOf: ps.lineOf, source: srcTag }), source: srcTag, startLine: lineOf(span[0]), endLine: lineOf(span[1]), id: inj.id, note: inj.note, separate: !!inj.separate, placeholders: pieces.filter(p => !p.lit).length };
        sources.push(s); injectedSources.push(s);
    }

    // ── tokens (00-tokens.css) ──
    const tokenSrc = sources.find(s => /00-tokens\.css$/.test(s.file));
    const tokens = new Map(); // name → { value, file, line }
    if (tokenSrc) for (const r of tokenSrc.parsed.rules) for (const d of r.decls) if (d.prop.startsWith('--')) tokens.set(d.prop, { value: d.value, line: d.line, selector: r.selectorText });
    function resolveToken(name, depth) {
        const t = tokens.get(name); if (!t) return null;
        const m = /^var\((--[\w-]+)\)$/.exec(t.value);
        if (m && (depth || 0) < 6) return resolveToken(m[1], (depth || 0) + 1) || t.value;
        return t.value;
    }
    const tokenKeys = new Map(); // category:key → [names]
    const tokenInfo = new Map(); // name → { resolved, category, key }
    for (const [name, t] of tokens) {
        const resolved = resolveToken(name) || t.value;
        let category = null, key = null;
        const col = parseColour(resolved);
        if (col && col.kind !== 'keyword') { category = 'colour'; key = col.key; }
        else if (/^--font-/.test(name)) { category = 'font-family'; key = splitTop(resolved, ',').map(f => unquote(f).toLowerCase()).join(', '); }
        else if (/^--radius-/.test(name)) { category = 'radius'; key = resolved.toLowerCase(); }
        else if (/^--z-/.test(name)) { category = 'z-index'; key = resolved; }
        else if (/^--sp-/.test(name)) { category = 'spacing'; key = resolved.toLowerCase(); }
        tokenInfo.set(name, { resolved, category, key, alias: /^var\(/.test(t.value) ? t.value : '' });
        if (category && key) { const kk = category + ':' + key; if (!tokenKeys.has(kk)) tokenKeys.set(kk, []); tokenKeys.get(kk).push(name); }
    }
    for (const v of tokenKeys.values()) v.sort();

    // ── rows ──
    const rows = []; // { value, prop, file, line, selector, category, context, token, order, kind }
    const stats = { urls: 0, dataUris: 0 };
    const colourKeyOf = new Map(); // raw literal → { key, display, kind }
    function colourOf(tok) { if (!colourKeyOf.has(tok)) colourKeyOf.set(tok, parseColour(tok)); return colourKeyOf.get(tok); }
    function tokenFor(category, value) {
        let key = null;
        if (category === 'colour') { const c = colourOf(value); if (c && c.kind !== 'keyword') key = 'colour:' + c.key; }
        else if (category === 'font-family') key = 'font-family:' + value.toLowerCase();
        else if (category === 'radius') key = 'radius:' + value.toLowerCase();
        else if (category === 'z-index') key = 'z-index:' + value;
        return key && tokenKeys.has(key) ? tokenKeys.get(key).join(' ') : '';
    }
    const CSS_WIDE = /^(inherit|initial|unset|revert|revert-layer|auto|none)$/i;
    function emit(decl, where) {
        // where: { file, line, selector, context, source }
        const push = (category, value) => {
            // CSS-wide keywords are not literals; a value with a JS expression in it (__JS__) is not a value
            if (category !== 'var' && (CSS_WIDE.test(value) || /__JS__/.test(value))) return;
            rows.push({ value, prop: decl.prop, file: where.file, line: where.line, selector: where.selector, category, context: where.context, token: where.file.endsWith('00-tokens.css') ? '' : tokenFor(category, value), order: orderOf(where.file), kind: where.kind });
        };
        extractLiterals(decl.prop, decl.value, push, stats);
        if (decl.important) rows.push({ value: decl.value, prop: decl.prop, file: where.file, line: where.line, selector: where.selector, category: '!important', context: where.context, token: '', order: orderOf(where.file), kind: where.kind });
    }
    for (const s of sources) {
        for (const r of s.parsed.rules) {
            const ctxStr = [s.source, ...r.context].filter(Boolean).join(' > ');
            for (const d of r.decls) emit(d, { file: s.file, line: d.line, selector: r.selectorText, context: ctxStr, kind: s.kind });
        }
    }
    // 4. inline style="" attributes in index.html
    for (const a of html.styleAttrs) {
        const sel = `style= on <${a.tag}${a.id ? '#' + a.id : a.cls ? '.' + a.cls : ''}>`;
        for (const d of parseDeclList(a.style)) emit(d, { file: 'index.html', line: a.line, selector: sel, context: 'inline style= in ' + a.surface, kind: 'inline-attr' });
    }
    // 5. inline style strings in js/*.js
    const jsInline = []; // per file: { file, loaded, styleAttr, cssText, styleProp, setPropCustom, setPropOther, removeProp, literalRows }
    const cpWriters = new Map(); // --name → [file:line]
    const propWriters = new Map(); // prop → [file:line]
    const stylePropCounter = counter();
    for (const f of jsFiles) {
        const file = 'js/' + f; const src = read(file); const lineOf = lineIndexer(src);
        const rec = { file, loaded: jsLoaded.has(file), styleAttr: 0, cssText: 0, styleProp: 0, stylePropLiteral: 0, setPropCustom: 0, setPropOther: 0, removeProp: 0, rowsBefore: rows.length };
        let m;
        const re1 = /style=\\?(["'])([^"']*?)\\?\1/g;
        while ((m = re1.exec(src))) {
            rec.styleAttr++;
            for (const d of parseDeclList(m[2].replace(/\$\{[^}]*\}/g, '__JS__'))) emit(d, { file, line: lineOf(m.index), selector: 'js template style=""', context: 'js:style=', kind: 'js-inline' });
        }
        const re2 = /\.style\.cssText\s*\+?=(?!=)/g;
        while ((m = re2.exec(src))) {
            rec.cssText++;
            const start = m.index + m[0].length, end = jsStatementEnd(src, start);
            const ps = piecesToSource(jsStringPieces(src, start, end, lineOf));
            for (const d of parseDeclList(ps.text)) emit(d, { file, line: lineOf(m.index), selector: 'js .style.cssText', context: 'js:cssText', kind: 'js-inline' });
        }
        const re3 = /\.style\.([A-Za-z]+)\s*[+\-]?=(?![=])/g;
        while ((m = re3.exec(src))) {
            if (m[1] === 'cssText') continue;
            rec.styleProp++;
            stylePropCounter.add(kebab(m[1]));
            const start = m.index + m[0].length, end = jsStatementEnd(src, start);
            const pieces = jsStringPieces(src, start, end, lineOf);
            const ps = piecesToSource(pieces);
            if (pieces.length && ps.allLiteral && ps.text.trim()) {
                rec.stylePropLiteral++;
                emit({ prop: kebab(m[1]), value: normWs(ps.text), important: false }, { file, line: lineOf(m.index), selector: 'js el.style.' + m[1], context: 'js:style.prop', kind: 'js-inline' });
            }
        }
        const re4 = /\.style\.setProperty\(\s*(['"])([^'"]+)\1/g;
        while ((m = re4.exec(src))) {
            const name = m[2]; const loc = file + ':' + lineOf(m.index);
            if (name.startsWith('--')) { rec.setPropCustom++; if (!cpWriters.has(name)) cpWriters.set(name, []); cpWriters.get(name).push(loc); }
            else { rec.setPropOther++; if (!propWriters.has(name)) propWriters.set(name, []); propWriters.get(name).push(loc); }
        }
        const re5 = /\.style\.removeProperty\(/g;
        while ((m = re5.exec(src))) rec.removeProp++;
        rec.literalRows = rows.length - rec.rowsBefore;
        jsInline.push(rec);
    }

    // deterministic order
    const CAT_ORDER = ['colour', 'font-family', 'font-size', 'font-weight', 'radius', 'shadow', 'duration', 'delay', 'easing', 'animation-name', 'z-index', 'var', '!important'];
    const sorted = sortBy(rows, r => r.order, r => r.file, r => r.line, r => r.prop, r => CAT_ORDER.indexOf(r.category), r => r.value, r => r.selector);

    // ── CSV ──
    const csv = ['value,property,file,line,selector,category,context,token'];
    for (const r of sorted) csv.push([r.value, r.prop, r.file, r.line, r.selector, r.category, r.context, r.token].map(csvCell).join(','));
    fs.mkdirSync(path.dirname(OUT_CSV), { recursive: true });
    fs.writeFileSync(OUT_CSV, csv.join('\n') + '\n');

    // ── report ──
    const report = buildReport({ head, cssOrder, sources, injectedSources, html, rows: sorted, jsInline, cpWriters, propWriters, stylePropCounter, tokens, tokenInfo, tokenKeys, stats, colourOf, jsFiles, jsLoaded, orderOf });
    fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
    fs.writeFileSync(OUT_MD, report.text);

    const s = report.summary;
    console.log(`css-audit: ${path.relative(ROOT, OUT_CSV)} (${sorted.length} rows), ${path.relative(ROOT, OUT_MD)}`);
    console.log(`files: ${s.files}  rules: ${s.rules}  declarations: ${s.decls}  selectors: ${s.selectors}`);
    console.log(`literals: ${s.literals}  unique-colours: ${s.uniqueColours}  important: ${s.important}  var-reads: ${s.varReads}`);
    console.log(`media-queries: ${s.media}  keyframes: ${s.keyframes}  custom-properties-declared: ${s.cpDeclared}  js-cp-writers: ${s.cpWriterNames}`);
    console.log(`inline style= in index.html: ${s.inlineAttrs}  js inline styles: style=${s.jsStyleAttr} cssText=${s.jsCssText} style.prop=${s.jsStyleProp}`);
}

// ─── report ──────────────────────────────────────────────────────────────────

function buildReport(A) {
    const { head, cssOrder, sources, injectedSources, html, rows, jsInline, cpWriters, propWriters, stylePropCounter, tokens, tokenInfo, tokenKeys, stats, colourOf, orderOf } = A;
    const L = [];
    const out = s => L.push(s == null ? '' : s);
    const table = (headers, body) => {
        if (!body.length) { out('none'); out(''); return; }
        out('| ' + headers.map(md).join(' | ') + ' |');
        out('|' + headers.map(() => '---').join('|') + '|');
        for (const r of body) out('| ' + r.map(md).join(' | ') + ' |');
        out('');
    };
    const loc = (file, line) => `${file}:${line}`;
    const sheetSources = sources.filter(s => s.kind === 'stylesheet');
    const appSources = sources.filter(s => s.kind !== 'separate-document' && s.kind !== 'missing'); // the app document's cascade
    const allStyleRules = s => s.parsed.rules.filter(r => r.kind === 'style');
    const cssRows = rows.filter(r => r.kind === 'stylesheet' || r.kind === 'inline-style-block' || r.kind === 'injected');
    const sheetRows = rows.filter(r => r.kind === 'stylesheet');
    const LITERAL_CATS = new Set(['colour', 'font-family', 'font-size', 'font-weight', 'radius', 'shadow', 'duration', 'delay', 'easing', 'animation-name', 'z-index']);
    const literalRows = rows.filter(r => LITERAL_CATS.has(r.category));
    const byCat = cat => rows.filter(r => r.category === cat);

    // totals
    let rules = 0, decls = 0, selectors = 0, keyframeSteps = 0, atCount = 0;
    for (const s of sources) {
        rules += s.parsed.rules.filter(r => r.kind === 'style').length;
        keyframeSteps += s.parsed.rules.filter(r => r.kind === 'keyframe').length;
        decls += s.parsed.declCount;
        selectors += allStyleRules(s).reduce((n, r) => n + r.selectors.length, 0);
        atCount += s.parsed.atRules.length;
    }

    out('# C1 — CSS audit, static half');
    out('');
    out(`Generated by \`node prep/scripts/css-audit.js\` at HEAD \`${head}\`. Companion data: \`prep/css-values.csv\` (${rows.length} rows; columns \`value,property,file,line,selector,category,context,token\` — the brief's six first; \`context\` is the enclosing at-rule chain or the inline/injected source, \`token\` lists the \`css/00-tokens.css\` tokens whose value equals that literal). Categories: ${[...LITERAL_CATS].join(', ')}, var, !important. One row per literal occurrence; a colour inside a shadow is one \`colour\` row and part of one \`shadow\` row.`);
    out('');
    out('Scope covered: the 12 stylesheets `index.html` links in load order, every inline `<style>` in `index.html`, the three `<style>` blocks JS injects into the app document, the pen window\'s stylesheet string (a separate document), inline `style=""` attributes in `index.html`, and inline style strings in every `js/*.js` (`style="…"` in templates, `.style.cssText =`, `el.style.x = <string literal>`, `style.setProperty(\'--…\')`). Not covered here (C2, live): rules nothing matches, `window.auditButtons()`, the custom-property writers observed at run time. Not audited, listed in §14: `phone/`, `scripts/copy-sink/`, `interaction-design-concept/`, `Design system breakdown exploration/`.');
    out('');
    out('Parser caveats: hand-written tokeniser, not a validator. `el.style.x = expr` with a non-literal right-hand side is counted but carries no value. `style="…"` inside JS templates with `${…}` placeholders are parsed with `__JS__` in place of the expression. Colour literals are recognised as hex, `rgb()/rgba()/hsl()/hsla()/hwb()/lab()/lch()/oklab()/oklch()/color()`, and CSS named colours (plus `transparent`/`currentColor`, reported separately as keywords) in colour-bearing properties and inside gradients. Comparison with tokens is on the computed sRGB value (hex, rgb, hsl are converted; alpha compared to 3 decimals).');
    out('');

    // ── 1. files ──
    out('## 1. Files, sizes and load order');
    out('');
    out('Load order is read from the `<link rel="stylesheet">` tags in `index.html`; `js/00a-boot.js` runs before them (`index.html:225`). The inline `#photoWarn` `<style>` follows the last link. Byte sizes are on disk (CRLF counted).');
    out('');
    const fileRows = [];
    let totBytes = 0;
    sources.forEach((s, k) => {
        const sr = allStyleRules(s);
        const imp = s.parsed.rules.reduce((n, r) => n + r.decls.filter(d => d.important).length, 0);
        const kf = s.parsed.atRules.filter(a => a.name === 'keyframes').length;
        const mq = s.parsed.atRules.filter(a => a.name === 'media').length;
        const cq = s.parsed.atRules.filter(a => a.name === 'container').length;
        const sup = s.parsed.atRules.filter(a => a.name === 'supports').length;
        if (s.kind === 'stylesheet' || s.kind === 'inline-style-block') totBytes += s.bytes;
        const lines = s.startLine ? `js ${s.startLine}–${s.endLine}` : s.blockLine ? `html ${s.blockLine}–${s.blockLine + s.lines - 1}` : s.lines;
        fileRows.push([k + 1, s.kind === 'stylesheet' ? code(s.file) : code(s.label), s.kind, s.bytes.toLocaleString('en-US'), lines, sr.length, s.parsed.declCount, sr.reduce((n, r) => n + r.selectors.length, 0), imp, `${mq} / ${cq} / ${sup} / ${kf}`]);
    });
    table(['#', 'file', 'kind', 'bytes', 'lines', 'rules', 'decls', 'selectors', '!important', '@media / @container / @supports / @keyframes'], fileRows);
    out(`Totals: ${sources.length} sources (${sheetSources.length} stylesheets, ${sources.filter(s => s.kind === 'inline-style-block').length} inline block, ${injectedSources.filter(s => !s.missing).length} JS strings); **${rules} style rules**, ${keyframeSteps} keyframe steps, **${decls} declarations**, ${selectors} selectors, ${atCount} at-rules; stylesheets + inline block = **${totBytes.toLocaleString('en-US')} bytes**. CSV literal rows: **${literalRows.length}** (${rows.filter(r => r.kind === 'stylesheet').length} from the stylesheets, ${rows.filter(r => r.kind === 'inline-style-block').length} from the inline block, ${rows.filter(r => r.kind === 'injected').length} from injected blocks, ${rows.filter(r => r.kind === 'separate-document').length} from the pen window, ${rows.filter(r => r.kind === 'inline-attr').length} from inline \`style=\` attributes, ${rows.filter(r => r.kind === 'js-inline').length} from JS inline strings; these per-source numbers include var/!important rows).`);
    out('');
    const strays = sources.flatMap(s => s.parsed.stray);
    if (strays.length) {
        out(`Parser leftovers (text the tokeniser could not place; ${strays.length}):`);
        out('');
        table(['where', 'text'], strays.map(s => [loc(s.file, s.line), code(s.text)]));
    }

    // ── 2. colours ──
    out('## 2. Colours');
    out('');
    const colourRows = byCat('colour');
    const colourSheetRows = colourRows.filter(r => r.kind !== 'js-inline' && r.kind !== 'inline-attr' && r.kind !== 'separate-document');
    const keyCount = counter(), keyRaw = new Map(), keyFiles = new Map(), keyDisplay = new Map();
    const keywordCount = counter();
    for (const r of colourSheetRows) {
        const c = colourOf(r.value);
        if (!c) continue;
        if (c.kind === 'keyword') { keywordCount.add(c.display); continue; }
        keyCount.add(c.key);
        keyDisplay.set(c.key, c.display);
        if (!keyRaw.has(c.key)) keyRaw.set(c.key, counter()); keyRaw.get(c.key).add(r.value);
        if (!keyFiles.has(c.key)) keyFiles.set(c.key, counter()); keyFiles.get(c.key).add(r.file);
    }
    const uniqueColours = keyCount.size();
    const rawUnique = new Set(colourSheetRows.map(r => r.value)).size;
    out(`In the app document's stylesheets, inline block and injected blocks: **${colourSheetRows.length} colour literals**, **${uniqueColours} unique** by computed value (${rawUnique} unique spellings), plus ${keywordCount.entries().map(e => `${e[0]} ×${e[1]}`).join(', ') || 'no keywords'}. All sources including JS inline strings and the pen window: ${colourRows.length} literals. Per source:`);
    out('');
    const perFileColour = counter(), perFileUnique = new Map();
    for (const r of colourRows) { const c = colourOf(r.value); if (!c || c.kind === 'keyword') continue; perFileColour.add(r.file); if (!perFileUnique.has(r.file)) perFileUnique.set(r.file, new Set()); perFileUnique.get(r.file).add(c.key); }
    table(['file', 'colour literals', 'unique'], sortBy([...perFileColour.map.keys()], f => orderOf(f), f => f).map(f => [code(f), perFileColour.get(f), perFileUnique.get(f).size]));

    out('### 2a. Top 40 colours by occurrence (stylesheets + inline block + injected)');
    out('');
    table(['#', 'computed', 'count', 'spellings', 'files', 'token with this value'], keyCount.entries().slice(0, 40).map((e, k) => {
        const spell = keyRaw.get(e[0]).entries().map(x => `${x[0]} ×${x[1]}`).join(', ');
        const files = keyFiles.get(e[0]).entries().map(x => `${x[0].replace(/^css\//, '')} ×${x[1]}`).join(', ');
        const tk = tokenKeys.get('colour:' + e[0]);
        return [k + 1, code(keyDisplay.get(e[0])), e[1], truncate(spell, 90), truncate(files, 110), tk ? tk.map(code).join(' ') : ''];
    }));

    // literal vs var in colour-bearing declarations
    let colourDecls = 0, viaVar = 0, viaLiteral = 0, both = 0;
    for (const s of appSources) for (const r of s.parsed.rules) for (const d of r.decls) {
        if (d.prop.startsWith('--') || !COLOUR_PROP.test(d.prop)) continue;
        const hasVar = /var\(--/.test(d.value);
        let hasLit = false;
        extractLiterals(d.prop, d.value, (cat) => { if (cat === 'colour') hasLit = true; }, { urls: 0, dataUris: 0 });
        if (!hasVar && !hasLit) continue;
        colourDecls++;
        if (hasVar && hasLit) both++; else if (hasVar) viaVar++; else viaLiteral++;
    }
    out('### 2b. How many colour declarations already go through `var(--…)`');
    out('');
    out(`Of ${colourDecls} declarations in colour-bearing properties (color, background*, border*, outline*, shadows, fill/stroke, filters; custom-property declarations excluded) in the app document: **${viaVar} use only var()** (${(100 * viaVar / Math.max(1, colourDecls)).toFixed(1)}%), **${viaLiteral} use only literals** (${(100 * viaLiteral / Math.max(1, colourDecls)).toFixed(1)}%), ${both} mix both (a literal fallback or a literal beside a token).`);
    out('');

    // tokens
    out('### 2c. Tokens in `css/00-tokens.css` and their usage');
    out('');
    const varRows = byCat('var');
    const varCount = counter(), varFiles = new Map();
    for (const r of varRows) { varCount.add(r.value); if (!varFiles.has(r.value)) varFiles.set(r.value, counter()); varFiles.get(r.value).add(r.file); }
    const tokRows = [];
    for (const [name, t] of tokens) {
        const info = tokenInfo.get(name);
        const reads = varCount.get(name);
        const files = varFiles.has(name) ? varFiles.get(name).entries().map(x => `${x[0].replace(/^css\//, '').replace(/^js\//, 'js/')} ×${x[1]}`).join(', ') : '';
        const readsOutside = varFiles.has(name) ? varFiles.get(name).entries().filter(x => !/00-tokens\.css$/.test(x[0])).reduce((n, x) => n + x[1], 0) : 0;
        tokRows.push([code(name), code(truncate(t.value, 60)), info.alias ? code(info.resolved) : '', reads, readsOutside, truncate(files, 120)]);
    }
    table(['token', 'value', 'resolves to', 'var() reads', 'reads outside tokens file', 'read in'], tokRows);
    const unread = [...tokens.keys()].filter(n => !varCount.get(n));
    out(`Tokens declared but never read anywhere in scope (${unread.length}): ${unread.map(code).join(', ') || 'none'}.`);
    out('');

    out('### 2d. Literals equal to an existing token\'s value (step-2 easy wins)');
    out('');
    out('Counted outside `css/00-tokens.css`, over every source in scope. A literal equal to a token value can become `var(--token)` with no on-screen change; the `token` column of the CSV marks every such row.');
    out('');
    const winCount = counter(), winFiles = new Map();
    for (const r of rows) if (r.token) { for (const t of r.token.split(' ')) { winCount.add(t); if (!winFiles.has(t)) winFiles.set(t, counter()); winFiles.get(t).add(r.file); } }
    table(['token', 'value', 'literal occurrences', 'already read via var()', 'in'], winCount.entries().map(e => [code(e[0]), code(tokenInfo.get(e[0]).resolved), e[1], varCount.get(e[0]), truncate(winFiles.get(e[0]).entries().map(x => `${x[0].replace(/^css\//, '')} ×${x[1]}`).join(', '), 120)]));
    const winTotal = rows.filter(r => r.token && r.category === 'colour').length;
    out(`Colour literals matching a token: **${winTotal}** of ${colourRows.length}. The rest (${colourRows.length - winTotal}) have no token today and are the raw material for the role-named tokens of CSS prep step 2.`);
    out('');
    const noTok = keyCount.entries().filter(e => !tokenKeys.has('colour:' + e[0]));
    out(`Most frequent colours with NO token (top 25 of ${noTok.length}):`);
    out('');
    table(['computed', 'count', 'spellings', 'files'], noTok.slice(0, 25).map(e => [code(keyDisplay.get(e[0])), e[1], truncate(keyRaw.get(e[0]).entries().map(x => `${x[0]} ×${x[1]}`).join(', '), 90), truncate(keyFiles.get(e[0]).entries().map(x => `${x[0].replace(/^css\//, '')} ×${x[1]}`).join(', '), 100)]));
    out(`url() references: ${stats.urls}, of which data: URIs: ${stats.dataUris} (their contents are not scanned for colours).`);
    out('');

    // ── 3. fonts ──
    out('## 3. Fonts');
    out('');
    const famCount = counter(), famFiles = new Map();
    for (const r of byCat('font-family')) { famCount.add(r.value); if (!famFiles.has(r.value)) famFiles.set(r.value, counter()); famFiles.get(r.value).add(r.file); }
    out('### 3a. Families (literal `font-family` / `font` shorthand entries, one row per family in a list)');
    out('');
    table(['family', 'count', 'in'], famCount.entries().map(e => [code(e[0]), e[1], truncate(famFiles.get(e[0]).entries().map(x => `${x[0].replace(/^css\//, '')} ×${x[1]}`).join(', '), 120)]));
    const fontUiReads = varCount.get('--font-ui'), fontMonoReads = varCount.get('--font-mono');
    const famDecls = [];
    for (const s of sources) for (const r of s.parsed.rules) for (const d of r.decls) if ((d.prop === 'font-family' || d.prop === 'font') && !d.prop.startsWith('--')) famDecls.push({ s, r, d });
    const famViaVar = famDecls.filter(x => /var\(--font-(ui|mono)\)/.test(x.d.value));
    const famLiteral = famDecls.filter(x => !/var\(--font-/.test(x.d.value) && !/^(inherit|initial|unset|revert)$/.test(x.d.value));
    out(`\`--font-ui\` is read ${fontUiReads} times, \`--font-mono\` ${fontMonoReads} times (all files). ${famDecls.length} \`font-family\`/\`font\` declarations in scope: ${famViaVar.length} go through \`var(--font-ui|--font-mono)\`, ${famLiteral.length} set a literal family list (listed below), ${famDecls.length - famViaVar.length - famLiteral.length} are \`inherit\`/other.`);
    out('');
    out('Literal family lists (where `--font-ui` / `--font-mono` are NOT used):');
    out('');
    table(['where', 'selector', 'declaration'], sortBy(famLiteral, x => orderOf(x.s.file), x => x.d.line).map(x => [loc(x.s.file, x.d.line), code(truncate(x.r.selectorText, 70)), code(truncate(x.d.prop + ': ' + x.d.value, 90))]));
    out('### 3b. Sizes');
    out('');
    const sizeCount = counter(); for (const r of byCat('font-size')) sizeCount.add(r.value);
    const sizeVar = counter(); for (const r of varRows) if (/^--font-(xs|sm|md|lg|xl)$/.test(r.value)) sizeVar.add(r.value);
    table(['font-size literal', 'count'], sizeCount.entries().map(e => [code(e[0]), e[1]]));
    out(`Responsive size tokens (declared in \`css/init-responsive.css\` \`:root\`, computed from \`--ui-scale\`) read: ${sizeVar.entries().map(e => `${code(e[0])} ×${e[1]}`).join(', ') || 'none'}.`);
    out('');
    out('### 3c. Weights');
    out('');
    const wCount = counter(); for (const r of byCat('font-weight')) wCount.add(r.value);
    table(['font-weight', 'count'], wCount.entries().map(e => [code(e[0]), e[1]]));

    // ── 4. radii ──
    out('## 4. Radii');
    out('');
    const radCount = counter(), radFiles = new Map();
    for (const r of byCat('radius')) { radCount.add(r.value); if (!radFiles.has(r.value)) radFiles.set(r.value, counter()); radFiles.get(r.value).add(r.file); }
    const radVar = counter(); for (const r of varRows) if (/^--radius-/.test(r.value)) radVar.add(r.value);
    out(`${byCat('radius').length} literal radius values (${radCount.size()} distinct); \`--radius-sm|md|lg\` (all \`0\` since the 2026-08 handoff) are read ${radVar.entries().map(e => `${code(e[0])} ×${e[1]}`).join(', ') || 'never'}.`);
    out('');
    table(['radius', 'count', 'in'], radCount.entries().map(e => [code(e[0]), e[1], truncate(radFiles.get(e[0]).entries().map(x => `${x[0].replace(/^css\//, '')} ×${x[1]}`).join(', '), 120)]));

    // ── 5. shadows ──
    out('## 5. Shadows');
    out('');
    const shCount = counter(), shFiles = new Map();
    for (const r of byCat('shadow')) { shCount.add(r.value); if (!shFiles.has(r.value)) shFiles.set(r.value, counter()); shFiles.get(r.value).add(r.file); }
    const shProps = counter(); for (const r of byCat('shadow')) shProps.add(r.prop);
    out(`${byCat('shadow').length} shadow layers (${shCount.size()} distinct) across ${shProps.entries().map(e => `${code(e[0])} ×${e[1]}`).join(', ')}. Top 30:`);
    out('');
    table(['shadow layer', 'count', 'in'], shCount.entries().slice(0, 30).map(e => [code(truncate(e[0], 80)), e[1], truncate(shFiles.get(e[0]).entries().map(x => `${x[0].replace(/^css\//, '')} ×${x[1]}`).join(', '), 100)]));

    // ── 6. transitions / animations ──
    out('## 6. Transitions and animations');
    out('');
    const durT = counter(), durA = counter(), easT = counter(), easA = counter(), delT = counter(), delA = counter();
    for (const r of byCat('duration')) (r.prop.startsWith('animation') ? durA : durT).add(r.value);
    for (const r of byCat('delay')) (r.prop.startsWith('animation') ? delA : delT).add(r.value);
    for (const r of byCat('easing')) (r.prop.startsWith('animation') ? easA : easT).add(r.value);
    const transProps = counter(), transNone = [];
    for (const s of sources) for (const r of s.parsed.rules) for (const d of r.decls) {
        if (d.prop === 'transition' || d.prop === 'transition-property') {
            for (const layer of splitTop(d.value, ',')) {
                const toks = splitTop(layer, 'ws');
                if (d.prop === 'transition-property') { for (const t of toks) transProps.add(t); continue; }
                if (toks[0] === 'none') { transNone.push(loc(s.file, d.line)); continue; }
                const p = toks.find(t => !TIME_RE.test(t) && !EASING_KW.has(t.toLowerCase()) && !/^(cubic-bezier|steps|linear|var)\(/.test(t));
                if (p) transProps.add(p);
            }
        }
    }
    out('### 6a. Transition durations, delays, easings, properties');
    out('');
    table(['duration', 'count'], durT.entries().map(e => [code(e[0]), e[1]]));
    table(['delay', 'count'], delT.entries().map(e => [code(e[0]), e[1]]));
    table(['easing', 'count'], easT.entries().map(e => [code(truncate(e[0], 60)), e[1]]));
    table(['transitioned property', 'count'], transProps.entries().map(e => [code(e[0]), e[1]]));
    out(`\`transition: none\` appears ${transNone.length} times (${truncate(transNone.join(', '), 400)}).`);
    out('');
    out('### 6b. Animation durations, delays, easings');
    out('');
    table(['duration', 'count'], durA.entries().map(e => [code(e[0]), e[1]]));
    table(['delay', 'count'], delA.entries().map(e => [code(e[0]), e[1]]));
    table(['easing', 'count'], easA.entries().map(e => [code(truncate(e[0], 60)), e[1]]));

    out('### 6c. `@keyframes` and where they run');
    out('');
    out('"Runs" is a static reading of the selectors that reference each animation: `boot` when only splash/entrance selectors use it, `state` when a class or ARIA state toggled by script does, `hover/focus` for interaction pseudo-classes, `JS` when a JS inline style references the name, `unreferenced` when nothing in scope does. C2 confirms at run time which fire at boot.');
    out('');
    const kfNodes = sources.flatMap(s => s.parsed.atRules.filter(a => a.name === 'keyframes').map(a => ({ a, s })));
    const animRefs = new Map(); // name → [{ file, line, selector, kind }]
    for (const r of byCat('animation-name')) { if (!animRefs.has(r.value)) animRefs.set(r.value, []); animRefs.get(r.value).push(r); }
    const kfRows = [];
    for (const { a, s } of sortBy(kfNodes, x => orderOf(x.s.file), x => x.a.line)) {
        const refs = animRefs.get(a.params) || [];
        const sels = refs.map(r => `${r.selector}${r.kind === 'js-inline' ? ' (JS)' : ''} ${r.file.replace(/^css\//, '')}:${r.line}`);
        let runs = 'unreferenced';
        if (refs.length) {
            const txt = refs.map(r => r.selector).join(' ');
            if (refs.some(r => r.kind === 'js-inline')) runs = 'JS';
            else if (/:hover|:focus|:active/.test(txt)) runs = 'hover/focus';
            else if (/splash|ui-enter|\.booting|boot/.test(txt)) runs = 'boot';
            else runs = 'state';
        }
        kfRows.push([code(a.params), loc(s.file, a.line), a.rules.length, refs.length, runs, truncate(sels.join('; '), 160)]);
    }
    table(['@keyframes', 'declared', 'steps', 'references', 'runs', 'referenced by'], kfRows);
    const undeclared = [...animRefs.keys()].filter(n => !kfNodes.some(k => k.a.params === n)).sort();
    out(`Animation names referenced without a \`@keyframes\` in scope: ${undeclared.map(code).join(', ') || 'none'}.`);
    out('');

    // ── 7. !important ──
    out('## 7. `!important`');
    out('');
    const impRows = [];
    for (const s of sources) {
        const comments = s.parsed.comments;
        for (const r of s.parsed.rules) for (const d of r.decls) if (d.important) {
            let reason = '';
            // (a) comment immediately before the declaration, (b) trailing comment on the same line, (c) comment immediately before the rule
            const before = comments.filter(c => c.end <= d.offset).sort((x, y) => y.end - x.end)[0];
            const srcText = s.kind === 'stylesheet' ? null : null; // offsets are into the parsed text; whitespace test via comment/decl adjacency
            if (before && d.offset - before.end <= 40 && before.line >= d.line - 3) reason = before.text;
            if (!reason) { const trailing = comments.find(c => c.start >= d.end && c.line === d.line); if (trailing) reason = trailing.text; }
            if (!reason) { const rb = comments.filter(c => c.end <= r.offset).sort((x, y) => y.end - x.end)[0]; if (rb && r.offset - rb.end <= 40 && rb.line >= r.line - 6) reason = rb.text; }
            impRows.push({ s, r, d, reason: truncate(reason, 160) });
        }
    }
    const impByFile = counter(); for (const x of impRows) impByFile.add(x.s.file);
    out(`**${impRows.length} \`!important\` declarations** in scope: ${sortBy(impByFile.entries(), e => orderOf(e[0])).map(e => `${e[0].replace(/^css\//, '')} ×${e[1]}`).join(', ')}. Inline \`style=\` attributes and JS inline strings in scope: ${rows.filter(r => r.category === '!important' && (r.kind === 'inline-attr' || r.kind === 'js-inline')).length}.`);
    out('');
    out('Inside cascade layers an `!important` declaration in an EARLIER layer beats a later layer\'s normal declarations, so every row here would outrank `@layer theme` unless the theme also uses `!important` or the legacy rule is retired. The "reason" column is the nearest comment (before the declaration, trailing it, or before the rule), when there is one.');
    out('');
    table(['where', 'context', 'selector', 'declaration', 'reason (nearest comment)'], sortBy(impRows, x => orderOf(x.s.file), x => x.d.line).map(x => [loc(x.s.file, x.d.line), truncate([x.s.source, ...x.r.context].filter(Boolean).join(' > '), 50), code(truncate(x.r.selectorText, 70)), code(truncate(x.d.prop + ': ' + x.d.value, 70)), x.reason]));

    // ── 8. specificity ──
    out('## 8. Specificity hot spots');
    out('');
    const selRecs = [];
    for (const s of appSources) for (const r of allStyleRules(s)) for (const sel of r.selectors) {
        const d0 = depth0(sel);
        selRecs.push({ s, r, sel, spec: specificity(sel), comps: compounds(sel).length, hasId: /#/.test(d0), nots: (sel.match(/:not\(/g) || []).length, star: /\*/.test(d0), aria: sel.match(/\[aria-[\w-]+(?:[~|^$*]?=\s*["']?[^"'\]]*["']?)?\]/g) || [], imp: r.decls.some(d => d.important) });
    }
    const specStr = sp => sp.join(',');
    out(`${selRecs.length} selectors in the app document (style rules; keyframe steps excluded).`);
    out('');
    out('### 8a. Top 25 by specificity');
    out('');
    table(['specificity (a,b,c)', 'selector', 'where'], sortBy(selRecs, x => -x.spec[0], x => -x.spec[1], x => -x.spec[2], x => orderOf(x.s.file), x => x.r.line).slice(0, 25).map(x => [specStr(x.spec), code(truncate(x.sel, 100)), loc(x.s.file, x.r.line)]));
    const ids = selRecs.filter(x => x.hasId);
    const idByFile = counter(); for (const x of ids) idByFile.add(x.s.file);
    out(`### 8b. Ids in selectors (${ids.length} selectors; ${sortBy(idByFile.entries(), e => orderOf(e[0])).map(e => `${e[0].replace(/^css\//, '')} ×${e[1]}`).join(', ')})`);
    out('');
    out('Layer order beats specificity, so an id in `legacy` does not by itself outrank `@layer theme`; it matters where a theme rule is unlayered or lands in the same layer, and for any rule the theme keeps rather than replaces. Listed in full because step 4 styles through `data-ui` / ARIA hooks instead.');
    out('');
    const idUsage = counter(); for (const x of ids) for (const m of depth0(x.sel).match(/#[\w-]+/g) || []) idUsage.add(m);
    table(['id', 'selectors using it'], idUsage.entries().map(e => [code(e[0]), e[1]]));
    out('<details><summary>Every selector containing an id</summary>');
    out('');
    table(['where', 'specificity', 'selector'], sortBy(ids, x => orderOf(x.s.file), x => x.r.line).map(x => [loc(x.s.file, x.r.line), specStr(x.spec), code(truncate(x.sel, 110))]));
    out('</details>');
    out('');
    const chains = selRecs.filter(x => x.comps >= 4);
    out(`### 8c. Chains of 4+ compounds (${chains.length})`);
    out('');
    table(['compounds', 'where', 'selector'], sortBy(chains, x => -x.comps, x => orderOf(x.s.file), x => x.r.line).map(x => [x.comps, loc(x.s.file, x.r.line), code(truncate(x.sel, 110))]));
    const nots = selRecs.filter(x => x.nots >= 2);
    out(`### 8d. \`:not()\` stacks (2+ in one selector: ${nots.length}; selectors with any \`:not()\`: ${selRecs.filter(x => x.nots >= 1).length})`);
    out('');
    table([':not()', 'where', 'selector'], sortBy(nots, x => -x.nots, x => orderOf(x.s.file), x => x.r.line).map(x => [x.nots, loc(x.s.file, x.r.line), code(truncate(x.sel, 110))]));
    const stars = selRecs.filter(x => x.star);
    out(`### 8e. Universal \`*\` selectors (${stars.length})`);
    out('');
    table(['where', 'context', 'selector', 'declarations'], sortBy(stars, x => orderOf(x.s.file), x => x.r.line).map(x => [loc(x.s.file, x.r.line), truncate(x.r.context.join(' > '), 40), code(truncate(x.sel, 60)), code(truncate(x.r.decls.map(d => d.prop + ': ' + d.value + (d.important ? ' !important' : '')).join('; '), 90))]));
    const arias = selRecs.filter(x => x.aria.length);
    out(`### 8f. Attribute selectors on ARIA state, already present (${arias.length} selectors)`);
    out('');
    table(['where', 'ARIA attribute(s)', 'selector'], sortBy(arias, x => orderOf(x.s.file), x => x.r.line).map(x => [loc(x.s.file, x.r.line), x.aria.map(code).join(' '), code(truncate(x.sel, 100))]));
    const attrSel = selRecs.filter(x => /\[data-/.test(x.sel));
    const dataAttrs = counter(); for (const x of attrSel) for (const m of x.sel.match(/\[data-[\w-]+/g) || []) dataAttrs.add(m + ']');
    out(`Other attribute hooks CSS already styles through: ${dataAttrs.entries().map(e => `${code(e[0])} ×${e[1]}`).join(', ') || 'none'}. (\`data-ui-key\` is a script contract, see README; \`data-ui\` is unused today${selRecs.some(x => /\[data-ui[=\]]/.test(x.sel)) ? ' — NOT TRUE, see rows above' : ''}.)`);
    out('');
    const fight = selRecs.filter(x => x.imp || x.hasId);
    out(`### 8g. Rules that would fight \`@layer theme\``);
    out('');
    out(`Rules carrying \`!important\` (the real fight: ${selRecs.filter(x => x.imp).length} selectors, see §7) and rules with ids (${ids.length} selectors, §8b; only a fight if the theme rule is unlayered or shares the layer). Union: ${fight.length} selectors.`);
    out('');

    // ── 9. media / container / supports ──
    out('## 9. Media, container and supports queries');
    out('');
    const condNodes = sources.flatMap(s => s.parsed.atRules.filter(a => a.name === 'media' || a.name === 'container' || a.name === 'supports').map(a => ({ a, s })));
    const condSummary = counter(); for (const { a } of condNodes) condSummary.add('@' + a.name + ' ' + a.params);
    table(['query', 'blocks'], condSummary.entries().map(e => [code(e[0]), e[1]]));
    out(`\`prefers-reduced-motion\`: ${condNodes.filter(x => /prefers-reduced-motion/.test(x.a.params)).length} blocks. \`forced-colors\`: ${condNodes.filter(x => /forced-colors/.test(x.a.params)).length} blocks. \`pointer: coarse\`: ${condNodes.filter(x => /pointer:\s*coarse/.test(x.a.params)).length} blocks. \`prefers-color-scheme\`: ${condNodes.filter(x => /prefers-color-scheme/.test(x.a.params)).length}.`);
    out('');
    for (const { a, s } of sortBy(condNodes, x => orderOf(x.s.file), x => x.a.line)) {
        const styleRules = a.rules.filter(r => r.kind === 'style');
        const nDecls = a.rules.reduce((n, r) => n + r.decls.length, 0);
        out(`### ${code('@' + a.name + ' ' + a.params)} — ${loc(s.file, a.line)}${a.context.length ? ' (inside ' + a.context.map(code).join(' ') + ')' : ''}`);
        out('');
        out(`${styleRules.length} rules, ${nDecls} declarations${a.rules.some(r => r.decls.some(d => d.important)) ? ', uses !important' : ''}.`);
        out('');
        table(['line', 'selector', 'declarations'], styleRules.map(r => [r.line, code(truncate(r.selectorText, 80)), code(truncate(r.decls.map(d => d.prop + ': ' + d.value + (d.important ? ' !important' : '')).join('; '), 110))]));
    }

    // ── 10. custom properties ──
    out('## 10. Custom properties');
    out('');
    const cpDecl = new Map(); // name → [{file,line,selector,value}]
    for (const s of sources) for (const r of s.parsed.rules) for (const d of r.decls) if (d.prop.startsWith('--')) { if (!cpDecl.has(d.prop)) cpDecl.set(d.prop, []); cpDecl.get(d.prop).push({ file: s.file, line: d.line, selector: r.selectorText, value: d.value }); }
    const cpRead = new Map(); // name → counter(file)
    for (const r of varRows) { if (!cpRead.has(r.value)) cpRead.set(r.value, counter()); cpRead.get(r.value).add(r.file); }
    const allNames = new Set([...cpDecl.keys(), ...cpRead.keys(), ...cpWriters.keys()]);
    out(`${cpDecl.size} custom properties declared in CSS (${[...cpDecl.values()].reduce((n, v) => n + v.length, 0)} declarations), ${cpRead.size} distinct names read via \`var()\` (${varRows.length} reads), ${cpWriters.size} names written from JS via \`style.setProperty('--…')\` (${[...cpWriters.values()].reduce((n, v) => n + v.length, 0)} call sites). Per-section hue variables \`--sec-h\` / \`--sec-c\`: declared ${(cpDecl.get('--sec-h') || []).map(d => loc(d.file, d.line) + ' ' + code(d.selector)).join(', ')}; read ${cpRead.has('--sec-h') ? cpRead.get('--sec-h').entries().map(e => `${e[0].replace(/^css\//, '')} ×${e[1]}`).join(', ') : 'never'} (\`--sec-h\`) and ${cpRead.has('--sec-c') ? cpRead.get('--sec-c').entries().map(e => `${e[0].replace(/^css\//, '')} ×${e[1]}`).join(', ') : 'never'} (\`--sec-c\`).`);
    out('');
    out('### 10a. Every custom property: declared, read, written from JS');
    out('');
    const cpRows = [];
    for (const name of [...allNames].sort()) {
        const decls = cpDecl.get(name) || [];
        const declWhere = decls.length ? truncate(sortBy(decls, d => orderOf(d.file), d => d.line).map(d => `${d.file.replace(/^css\//, '')}:${d.line} ${d.selector.length > 40 ? d.selector.slice(0, 39) + '…' : d.selector}`).join('; '), 150) : '';
        const reads = cpRead.get(name);
        const w = cpWriters.get(name) || [];
        const flag = !decls.length && !w.length ? 'READ ONLY (neither CSS nor JS sets it)' : !decls.length ? 'JS-only' : !reads && !w.length ? 'never read' : '';
        cpRows.push([code(name), decls.length, declWhere, reads ? reads.entries().reduce((n, e) => n + e[1], 0) : 0, reads ? truncate(reads.entries().map(e => `${e[0].replace(/^css\//, '')} ×${e[1]}`).join(', '), 100) : '', w.length, truncate(w.join(', '), 120), flag]);
    }
    table(['property', 'CSS decls', 'declared at', 'var() reads', 'read in', 'JS writes', 'JS writers (file:line)', 'note'], cpRows);
    out('### 10b. JS writers of custom properties (`style.setProperty(\'--…\')` grep over js/)');
    out('');
    table(['property', 'call sites', 'where'], sortBy([...cpWriters.entries()], e => -e[1].length, e => e[0]).map(e => [code(e[0]), e[1].length, truncate(e[1].join(', '), 400)]));
    out('Root-level writers (on `documentElement`): `--ui-scale` (js/20-mixer-layout.js, on resize and DPR change), `--sidebar-width` (js/20, while dragging the sidebar handle), `--app-height` (js/01-config.js). Everything else writes on an element: `--val`/`--min`/`--max` on range inputs (the slider fill), `--rows`/`--i` on sections (the nav gradient strip), `--peer`/`--mp-peer` (player colour on a tag / face), `--ss-frame-ratio` (ascend-star frame). Which of these fire per frame is C2\'s to observe; statically none sits in a rAF loop by name.');
    out('');
    if (propWriters.size) {
        out('`style.setProperty` on non-custom properties:');
        out('');
        table(['property', 'where'], sortBy([...propWriters.entries()], e => e[0]).map(e => [code(e[0]), truncate(e[1].join(', '), 300)]));
    }

    // ── 11. unlayered / injected ──
    out('## 11. Unlayered and injected styles');
    out('');
    out('Once the app CSS moves into `@layer legacy` (prep step 1), any unlayered stylesheet beats it regardless of specificity. These are the unlayered sources in the app document today:');
    out('');
    const injRows = [];
    for (const s of injectedSources) {
        if (s.missing) { injRows.push([code(s.file), s.id, 'NOT FOUND by this script', '', '', '', s.note]); continue; }
        const sr = allStyleRules(s);
        const imp = s.parsed.rules.reduce((n, r) => n + r.decls.filter(d => d.important).length, 0);
        injRows.push([`${s.file}:${s.startLine}–${s.endLine}`, s.id, s.separate ? 'separate document (not in the app cascade)' : 'unlayered in the app document', sr.length, s.parsed.declCount, imp, s.note + (s.placeholders ? ` (${s.placeholders} JS expressions in the string, shown as __JS__)` : '')]);
    }
    const inlineBlock = sources.filter(s => s.kind === 'inline-style-block');
    for (const s of inlineBlock) injRows.push([`index.html:${s.blockLine}`, '#photoWarn inline <style>', 'unlayered in the app document (after the 12 links)', allStyleRules(s).length, s.parsed.declCount, s.parsed.rules.reduce((n, r) => n + r.decls.filter(d => d.important).length, 0), 'PhotoSafe dialog; first painted frame, deliberately independent of css/; exempt in js/38 auditButtons']);
    table(['where', 'block', 'standing', 'rules', 'decls', '!important', 'note'], injRows);
    out('Rules in the injected blocks:');
    out('');
    for (const s of injectedSources.filter(x => !x.missing)) {
        for (const r of s.parsed.rules) out(`- ${code(s.file + ':' + r.line)} ${code(r.selectorText)} → ${code(truncate(r.decls.map(d => d.prop + ': ' + d.value + (d.important ? ' !important' : '')).join('; '), 140))}`);
    }
    out('');
    out('### 11a. Inline `style=""` attributes in `index.html`, by surface');
    out('');
    out('Surface = the `<body>` child the element sits in (or the element itself when it is one). An inline attribute outranks every stylesheet and every layer; most here are `display:none` initial states that script flips.');
    out('');
    const surf = new Map();
    for (const a of html.styleAttrs) { if (!surf.has(a.surface)) surf.set(a.surface, []); surf.get(a.surface).push(a); }
    const surfRows = [];
    for (const [k, list] of sortBy([...surf.entries()], e => e[1][0].line)) {
        const props = counter(); for (const a of list) for (const d of parseDeclList(a.style)) props.add(d.prop);
        const onlyDisplayNone = list.filter(a => /^\s*display\s*:\s*none\s*;?\s*$/i.test(a.style)).length;
        surfRows.push([code(k), list.length, onlyDisplayNone, truncate(props.entries().map(e => `${e[0]} ×${e[1]}`).join(', '), 120), `${list[0].line}–${list[list.length - 1].line}`]);
    }
    table(['surface', 'style= attrs', 'of which only display:none', 'properties set', 'lines'], surfRows);
    const ctl = html.styleAttrs.filter(a => a.surface === '.controls');
    if (ctl.length) {
        out(`The \`.controls\` panel is the static markup js/20 re-parents at boot (README, "How the UI is built"), so its ${ctl.length} attributes travel with the nodes into the strip and sidebars. By nearest ancestor with an id (the group the node ends up in):`);
        out('');
        const byNear = new Map();
        for (const a of ctl) { const k = a.nearestId || '(no id ancestor inside .controls)'; if (!byNear.has(k)) byNear.set(k, []); byNear.get(k).push(a); }
        table(['nearest id', 'style= attrs', 'elements', 'properties set', 'lines'], sortBy([...byNear.entries()], e => e[1][0].line).map(([k, list]) => {
            const props = counter(); for (const a of list) for (const d of parseDeclList(a.style)) props.add(d.prop);
            const els = counter(); for (const a of list) els.add(a.tag + (a.id ? '#' + a.id : a.cls ? '.' + a.cls : ''));
            return [code(k), list.length, truncate(els.entries().map(e => `${e[0]} ×${e[1]}`).join(', '), 90), truncate(props.entries().map(e => `${e[0]} ×${e[1]}`).join(', '), 90), `${list[0].line}–${list[list.length - 1].line}`];
        }));
    }
    const attrValRows = rows.filter(r => r.kind === 'inline-attr' && LITERAL_CATS.has(r.category));
    out(`Total: **${html.styleAttrs.length} inline style attributes**; ${attrValRows.length} carry a colour/font/radius/shadow/z-index literal:`);
    out('');
    table(['line', 'element', 'surface', 'category', 'property', 'value'], attrValRows.map(r => [r.line, code(r.selector.replace(/^style= on /, '')), r.context.replace(/^inline style= in /, ''), r.category, code(r.prop), code(truncate(r.value, 70))]));

    out('### 11b. Inline style strings in `js/*.js`');
    out('');
    out('Counts are grep-level: `style="` inside template strings, `.style.cssText =` assignments, `el.style.<prop> =` assignments (`literal` = right-hand side is a plain string, so the value is in the CSV), `style.setProperty(\'--…\')`. `referenced` = the path appears in `index.html` (a `<script src>` or the deferred loader array at index.html ~1744); files it does not reference are marked NO. An inline style set from JS outranks every stylesheet and layer; colours set this way cannot be re-themed from CSS.');
    out('');
    const jsRows = jsInline.filter(j => j.styleAttr || j.cssText || j.styleProp || j.setPropCustom || j.setPropOther || j.removeProp);
    table(['file', 'referenced', 'style="…"', '.style.cssText', 'el.style.x =', 'of which literal', "setProperty('--')", 'other setProperty', 'removeProperty', 'CSV rows'], jsRows.map(j => [code(j.file), j.loaded ? 'yes' : 'NO', j.styleAttr, j.cssText, j.styleProp, j.stylePropLiteral, j.setPropCustom, j.setPropOther, j.removeProp, j.literalRows]));
    const notRef = jsInline.filter(j => !j.loaded).map(j => j.file);
    out(`js/ files \`index.html\` does not reference (${notRef.length}): ${notRef.map(code).join(', ') || 'none'}.`);
    out('');
    const jsTot = k => jsInline.reduce((n, j) => n + j[k], 0);
    out(`Totals: style="…" ${jsTot('styleAttr')}, cssText ${jsTot('cssText')}, el.style.x ${jsTot('styleProp')} (${jsTot('stylePropLiteral')} literal), setProperty('--') ${jsTot('setPropCustom')}, other setProperty ${jsTot('setPropOther')}, removeProperty ${jsTot('removeProp')}. Most-assigned \`el.style\` properties: ${stylePropCounter.entries().slice(0, 15).map(e => `${code(e[0])} ×${e[1]}`).join(', ')}.`);
    out('');
    const jsLit = rows.filter(r => r.kind === 'js-inline' && LITERAL_CATS.has(r.category));
    const jsLitCat = counter(); for (const r of jsLit) jsLitCat.add(r.category);
    out(`Literal values carried by JS inline styles: ${jsLit.length} (${jsLitCat.entries().map(e => `${e[0]} ×${e[1]}`).join(', ')}). Colours set from JS (unique by computed value):`);
    out('');
    const jsCol = counter(), jsColWhere = new Map(), jsColDisp = new Map();
    for (const r of jsLit.filter(r => r.category === 'colour')) { const c = colourOf(r.value); if (!c) continue; jsCol.add(c.key); jsColDisp.set(c.key, c.display); if (!jsColWhere.has(c.key)) jsColWhere.set(c.key, counter()); jsColWhere.get(c.key).add(r.file.replace(/^js\//, '')); }
    table(['computed', 'count', 'files', 'token with this value'], jsCol.entries().map(e => [code(jsColDisp.get(e[0])), e[1], truncate(jsColWhere.get(e[0]).entries().map(x => `${x[0]} ×${x[1]}`).join(', '), 100), (tokenKeys.get('colour:' + e[0]) || []).map(code).join(' ')]));
    out('Fonts, radii and shadows set from JS:');
    out('');
    table(['category', 'value', 'count', 'files'], (() => {
        const c = counter(), w = new Map();
        for (const r of jsLit.filter(r => r.category !== 'colour')) { const k = r.category + '\u0000' + r.value; c.add(k); if (!w.has(k)) w.set(k, counter()); w.get(k).add(r.file.replace(/^js\//, '')); }
        return c.entries().map(e => { const [cat, val] = e[0].split('\u0000'); return [cat, code(truncate(val, 70)), e[1], truncate(w.get(e[0]).entries().map(x => `${x[0]} ×${x[1]}`).join(', '), 80)]; });
    })());

    // ── 12. zoom ──
    out('## 12. `zoom: var(--ui-scale)`');
    out('');
    const zoomDecls = [];
    for (const s of sources) for (const r of s.parsed.rules) for (const d of r.decls) if (d.prop === 'zoom') zoomDecls.push({ s, r, d });
    table(['where', 'selector', 'declaration'], sortBy(zoomDecls, x => orderOf(x.s.file), x => x.d.line).map(x => [loc(x.s.file, x.d.line), code(x.r.selectorText), code(x.d.prop + ': ' + x.d.value)]));
    out('`--ui-scale` is written once at boot and again only on `resize` and DPR change (`js/20-mixer-layout.js` `initResponsiveScale`): 1.0 up to 1600 CSS px wide, then `round(min(1.8, 1 + (w - 1600) * 0.00036), 2)`, so 1.12 at 1920, 1.35 at 2560, 1.8 at 3840; 1.15 when DPR ≥ 2 at ≥ 1200 px wide and the width rule gave 1.0. Consequences for the pixel baselines: screenshots at 1920 and 2560 are of a zoomed UI (every px in those elements is 1.12× / 1.35× a style px, text re-rasterised at the zoomed size); `100vh` inside a zoomed subtree still measures the full viewport (see the `.layers-panel` note at `css/init-responsive.css:616`); fixed-position maths in JS converts through `window.UIScale`; the guide/ring overlays that are body-mounted are deliberately NOT zoomed. The theme must not add elements to this list, or remove any, without re-baselining.');
    out('');

    // ── 13. deferred ──
    out('## 13. Deferred to C2 (live)');
    out('');
    out('- Rules nothing matches, per state (`prep/work/css-unmatched.json`).');
    out('- `window.auditButtons()` result. Statically (`js/38-button-audit.js:22–33`) it sanctions colour on buttons from: any rule in `css/01-buttons.css`; any selector containing `btn--destructive` or `btn--record` wherever declared; any selector containing `#photoWarn`; and it reports inline colour on `button, .btn` as its own class of offender. A `@layer theme` stylesheet would be reported by name unless `isSanctioned` learns about it.');
    out('- Custom-property writers observed during boot and a stroke (which of §10b fire, and how often).');
    out('');

    // ── 14. out of scope ──
    out('## 14. Out of scope, listed only');
    out('');
    const oos = ['phone/phone.css', 'phone/index.html', 'scripts/copy-sink/index.html', 'interaction-design-concept/public/styles.css', 'interaction-design-concept/public/index.html', 'Design system breakdown exploration/design_handoff_control_surface/Control Surface Breakdown.dc.html', 'Design system breakdown exploration/design_handoff_control_surface/Control Surface Prototype.dc.html'];
    table(['file', 'bytes', 'why out of scope'], oos.map(f => [code(f), exists(f) ? fs.statSync(path.join(ROOT, f)).size.toLocaleString('en-US') : 'missing', /^phone/.test(f) ? 'pad-only PWA, own stylesheet, not the app document' : /copy-sink/.test(f) ? 'dev tool page' : /interaction-design/.test(f) ? 'concept folder, not shipped' : 'design exploration export, not shipped']));

    const summary = {
        files: sources.length, rules, decls, selectors, literals: literalRows.length, uniqueColours, important: impRows.length, varReads: varRows.length,
        media: condNodes.filter(x => x.a.name === 'media').length, keyframes: kfNodes.length, cpDeclared: cpDecl.size, cpWriterNames: cpWriters.size,
        inlineAttrs: html.styleAttrs.length, jsStyleAttr: jsTot('styleAttr'), jsCssText: jsTot('cssText'), jsStyleProp: jsTot('styleProp'),
    };
    out('## Counts');
    out('');
    out(`files: ${summary.files} · rules: ${rules} · declarations: ${decls} · selectors: ${selectors} · literals: ${summary.literals} · unique-colours: ${uniqueColours} · important: ${summary.important} · var-reads: ${summary.varReads} · media-queries: ${summary.media} · keyframes: ${summary.keyframes} · custom-properties: ${summary.cpDeclared} · inline-style-attrs: ${summary.inlineAttrs}`);
    out('');
    return { text: L.join('\n') + '\n', summary };
}

main();
