// prep/scripts/css-live.js — C2, the live half of the CSS audit
// (prep/briefs/C-css-audit.md section 4). Read-only toward the app: writes
// only under prep/work/.
//
//   node prep/scripts/css-live.js
//
// Boots the web build in its own headless Chrome through the repo driver
// (scripts/test/radial-menu/driver.js boot(): own static server on the repo
// root, scratch profile with PhotoSafe / the startup fork / the first-run hint
// already answered, trusted input over CDP), closed in a finally. Then:
//
//  1. Rules nothing matches. In the live page it walks document.styleSheets
//     (recursing into @media / @supports / @container / @layer / @import and
//     nested rules), strips pseudo-classes and pseudo-elements from every
//     selector (structural ones — :root, :not(), :is(), :where(), :has(),
//     :nth-*, :first/last/only-* — are kept, with their arguments stripped,
//     so counts stay tight; a selector that is invalid after that falls back
//     to stripping everything) and counts querySelectorAll matches per
//     selector in each UI state: boot; every right-sidebar section open
//     (trusted Shift-click on each .section-title, synthetic fallback); the
//     left bar open with its sections open; the left bar folded (the
//     non-persisting Sidebars.left.fold / restore, js/20); the F1 hotkey
//     overlay; the radial menu (E over the canvas); the colour picker popover
//     (click #colorPicker); the Presets popup (click #mixerPresetsTrigger).
//     Lines come from a Node-side scan of the stylesheet files (selector
//     lists normalised the way Chrome serialises them, matched in order).
//  2. Chrome's own rule-usage tracking (CSS.startRuleUsageTracking before a
//     reload, stopped at the end) as a second opinion: which rules Chrome
//     actually applied at least once during the whole session.
//  3. window.auditButtons() (js/38-button-audit.js) at boot and with every
//     section open; the full return value goes to button-audit.json.
//  4. Custom properties at runtime: a hook installed before the app's first
//     script records every style.setProperty('--…') call (name, target,
//     writer file:line, phase: boot / sections / stroke / slider …), and
//     getComputedStyle is polled on :root, #mixer-strip, #sidebar-right, a
//     fader, a section and body before and after a trusted stroke on the
//     canvas and a slider move (an 'input' + 'change' dispatched on #curl,
//     then restored the same way).
//
// Writes:  prep/work/css-unmatched.json          one row per selector, all states
//          prep/work/css/live.md                 the report
//          prep/work/css/button-audit.json       auditButtons() raw output
//          prep/work/css/live-custom-props.json  writers + computed snapshots
//
// No app setter that persists is called (scripts/test/GUIDANCE.md §2b): the
// state changes are trusted clicks and keys on real controls in the scratch
// profile, one input/change dispatch on the real #curl slider, and
// Sidebars.left.fold()/restore(), which js/20 documents as "without keeping".
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { boot, sleep } = require('../../scripts/test/radial-menu/driver');

const ROOT = path.resolve(__dirname, '../..');
const WORK = path.join(ROOT, 'prep', 'work');
const CSS_WORK = path.join(WORK, 'css');
const OUT_JSON = path.join(WORK, 'css-unmatched.json');
const OUT_MD = path.join(CSS_WORK, 'live.md');
const OUT_BTN = path.join(CSS_WORK, 'button-audit.json');
const OUT_PROPS = path.join(CSS_WORK, 'live-custom-props.json');

const problems = [];
function problem(msg) { problems.push(msg); console.log('PROBLEM ' + msg); }
function log(msg) { console.log(msg); }

// ─── Node side: selector normalisation and a line index per stylesheet ──────
// Chrome serialises selectorText its own way ([type="range"] with quotes,
// one space after commas, lower-case element names, no space inside
// parentheses). Both sides are reduced to the same shape before matching.
function normSel(s) {
    return String(s)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\s+/g, ' ').trim()
        .replace(/\s*([>+~,])\s*/g, '$1')
        .replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
        .replace(/\[\s*([^\]=~|^$*\s]+?)\s*([~|^$*]?=)\s*(["']?)(.*?)\3\s*\]/g, '[$1$2$4]')
        .replace(/(^|[^:]):(before|after|first-line|first-letter)\b/g, '$1::$2')
        .toLowerCase();
}

// A small scanner, not a parser: enough to know where every style rule's
// selector list starts. Comments, strings, nested at-rules; @keyframes,
// @font-face, @page, @property and friends are skipped (no selectors).
function indexCss(text) {
    const out = [];
    const stack = [];
    const SKIP = /^(-webkit-)?(keyframes|font-face|page|property|counter-style|font-feature-values|font-palette-values|view-transition)$/;
    let buf = '', bufLine = 1, line = 1, inStr = null, i = 0;
    const n = text.length;
    while (i < n) {
        const c = text[i];
        if (inStr) {
            buf += c;
            if (c === '\\') { buf += text[i + 1] || ''; if (text[i + 1] === '\n') line++; i += 2; continue; }
            if (c === inStr) inStr = null;
            if (c === '\n') line++;
            i++; continue;
        }
        if (c === '/' && text[i + 1] === '*') {
            let e = text.indexOf('*/', i + 2); if (e < 0) e = n;
            for (let k = i; k < e; k++) if (text[k] === '\n') line++;
            i = e + 2; continue;
        }
        if (c === '"' || c === "'") { if (!buf.trim()) bufLine = line; inStr = c; buf += c; i++; continue; }
        if (c === '\n') line++;
        if (c === '{') {
            const pre = buf.trim();
            const top = stack[stack.length - 1];
            const skip = !!(top && top.skip);
            if (pre[0] === '@') {
                const name = pre.slice(1).split(/[\s({]/)[0].toLowerCase();
                stack.push({ at: name, skip: skip || SKIP.test(name) });
            } else {
                if (!skip && pre) out.push({ norm: normSel(pre), raw: pre.replace(/\s+/g, ' '), line: bufLine });
                stack.push({ at: null, skip });
            }
            buf = ''; i++; continue;
        }
        if (c === '}') { stack.pop(); buf = ''; i++; continue; }
        if (c === ';') { buf = ''; i++; continue; }
        if (!buf.trim() && !/\s/.test(c)) bufLine = line;
        buf += c; i++;
    }
    return out;
}

// Where each stylesheet's text lives on disk, and the line offset to add.
// The three JS-injected blocks have a fixed line (the brief's), the inline
// index.html block is scanned from the HTML.
function sourceFor(label) {
    if (/^css\//.test(label)) return { file: label, text: fs.readFileSync(path.join(ROOT, label), 'utf8'), offset: 0 };
    if (/^index\.html/.test(label)) {
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        const open = html.indexOf('<style>');
        const close = html.indexOf('</style>', open);
        if (open < 0 || close < 0) return null;
        const tagLine = html.slice(0, open).split('\n').length;
        return { file: 'index.html', text: html.slice(open + '<style>'.length, close), offset: tagLine - 1 };
    }
    return null;
}

// ─── Page side (installed once per boot; kept as a function for readability) ─
function pageLib() {
    var C = window.__cl = window.__cl || {};
    var KEEP = { root: 1, not: 1, is: 1, where: 1, has: 1, 'nth-child': 1, 'nth-last-child': 1, 'nth-of-type': 1, 'nth-last-of-type': 1,
        'first-child': 1, 'last-child': 1, 'only-child': 1, 'first-of-type': 1, 'last-of-type': 1, 'only-of-type': 1, scope: 1, defined: 1 };
    C.sheetLabel = function (ss, idx) {
        if (ss.href) { try { return decodeURIComponent(new URL(ss.href).pathname.replace(/^\//, '')); } catch (_) { return ss.href; } }
        var node = ss.ownerNode, id = node && node.id;
        var txt = '';
        try { txt = Array.prototype.map.call(ss.cssRules, function (r) { return r.cssText; }).join('\n').slice(0, 600); } catch (_) {}
        if (id === 'samModalStyles') return 'js/16-sam-integration.js:266 (injected <style#samModalStyles>)';
        if (id === 'boot-cursor-style') return 'js/00a-boot.js:366 (injected <style#boot-cursor-style>)';
        if (/file-drop-hover/.test(txt)) return 'js/32-file-drop.js:76 (injected <style>)';
        if (/#photoWarn/.test(txt)) return 'index.html:249 (inline <style>)';
        return 'inline <style>#' + idx + (id ? '#' + id : '') + (node && node.tagName ? ' <' + node.tagName.toLowerCase() + '>' : '');
    };
    // Every style rule, depth first, with the at-rule conditions around it.
    C.rules = function () {
        var out = [];
        var stats = { sheets: 0, styleRules: 0, keyframes: 0, fontFace: 0, otherAt: 0, unreadable: 0, groups: 0 };
        function walk(rules, label, conds, idx) {
            for (var i = 0; i < rules.length; i++) {
                var r = rules[i];
                if (r instanceof CSSStyleRule) {
                    out.push({ sheet: label, i: idx.n++, sel: r.selectorText, conds: conds.slice(), decls: r.style.length });
                    stats.styleRules++;
                    if (r.cssRules && r.cssRules.length) walk(r.cssRules, label, conds.concat(['nested in ' + r.selectorText]), idx);
                } else if (r instanceof CSSImportRule) {
                    try { if (r.styleSheet) walk(r.styleSheet.cssRules, label + ' @import ' + r.href, conds.concat(['@import']), idx); } catch (_) { stats.unreadable++; }
                } else if (r instanceof CSSKeyframesRule) { stats.keyframes++; }
                else if (r instanceof CSSFontFaceRule) { stats.fontFace++; }
                else if (r.cssRules) {
                    stats.groups++;
                    var ct = (r instanceof CSSMediaRule) ? '@media ' + r.media.mediaText
                        : (r instanceof CSSSupportsRule) ? '@supports ' + r.conditionText
                        : (window.CSSContainerRule && r instanceof CSSContainerRule) ? '@container ' + r.conditionText
                        : (window.CSSLayerBlockRule && r instanceof CSSLayerBlockRule) ? '@layer ' + r.name
                        : (r.cssText || '').split('{')[0].trim();
                    walk(r.cssRules, label, conds.concat([ct]), idx);
                } else { stats.otherAt++; }
            }
        }
        var sheets = document.styleSheets;
        for (var s = 0; s < sheets.length; s++) {
            var ss = sheets[s];
            var label = C.sheetLabel(ss, s);
            var rules;
            try { rules = ss.cssRules; } catch (e) { stats.unreadable++; out.push({ sheet: label, error: String(e) }); continue; }
            stats.sheets++;
            walk(rules, label, [], { n: 0 });
        }
        C.lastStats = stats;
        return out;
    };
    C.sheets = function () {
        return Array.prototype.map.call(document.styleSheets, function (ss, i) {
            var n = null; try { n = ss.cssRules.length; } catch (_) {}
            return { label: C.sheetLabel(ss, i), href: ss.href || null, ownerId: ss.ownerNode && ss.ownerNode.id || null, topLevelRules: n, disabled: ss.disabled, media: ss.media && ss.media.mediaText || '' };
        });
    };
    C.condsApply = function (conds) {
        var res = true, unknown = false;
        conds.forEach(function (c) {
            var m;
            if ((m = /^@media (.*)$/.exec(c))) { try { if (!matchMedia(m[1]).matches) res = false; } catch (_) { unknown = true; } }
            else if ((m = /^@supports (.*)$/.exec(c))) { try { if (!CSS.supports(m[1])) res = false; } catch (_) { unknown = true; } }
            else if (/^@container/.test(c)) unknown = true;
        });
        return res === false ? false : (unknown ? null : true);
    };
    // Top-level split on commas (outside strings, brackets and parentheses).
    C.splitTop = function (s) {
        var out = [], depth = 0, inStr = null, cur = '';
        for (var i = 0; i < s.length; i++) {
            var c = s[i];
            if (inStr) { cur += c; if (c === '\\') { cur += s[++i] || ''; continue; } if (c === inStr) inStr = null; continue; }
            if (c === '"' || c === "'") { inStr = c; cur += c; continue; }
            if (c === '\\') { cur += c + (s[++i] || ''); continue; }
            if (c === '(' || c === '[') depth++; else if (c === ')' || c === ']') depth--;
            if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
            cur += c;
        }
        if (cur.trim()) out.push(cur.trim());
        return out;
    };
    // Strip pseudo-classes and pseudo-elements from one complex selector.
    // all=false keeps structural pseudo-classes (their arguments stripped);
    // a compound left with nothing becomes '*' so combinators keep their level.
    C.stripOne = function (sel, all) {
        var out = '', i = 0, depth = 0, inStr = null, n = sel.length, hasContent = false, hadPseudo = false;
        function endCompound() { if (!hasContent && hadPseudo) out += '*'; hasContent = false; hadPseudo = false; }
        while (i < n) {
            var c = sel[i];
            if (inStr) { out += c; hasContent = true; if (c === '\\') { out += sel[i + 1] || ''; i += 2; continue; } if (c === inStr) inStr = null; i++; continue; }
            if (c === '"' || c === "'") { inStr = c; out += c; hasContent = true; i++; continue; }
            if (c === '\\') { out += c + (sel[i + 1] || ''); hasContent = true; i += 2; continue; }
            if (c === '[') { depth++; out += c; hasContent = true; i++; continue; }
            if (c === ']') { depth--; out += c; i++; continue; }
            if (depth === 0 && (c === ' ' || c === '>' || c === '+' || c === '~')) { endCompound(); out += c; i++; continue; }
            if (c === ':' && depth === 0) {
                var j = i + 1, pe = false;
                if (sel[j] === ':') { pe = true; j++; }
                var ns = j;
                while (j < n && /[a-zA-Z0-9_-]/.test(sel[j])) j++;
                var name = sel.slice(ns, j).toLowerCase(), arg = null;
                if (sel[j] === '(') {
                    var d = 1, k = j + 1, s2 = null;
                    while (k < n && d > 0) {
                        var ch = sel[k];
                        if (s2) { if (ch === '\\') k++; else if (ch === s2) s2 = null; }
                        else if (ch === '"' || ch === "'") s2 = ch;
                        else if (ch === '(') d++; else if (ch === ')') d--;
                        k++;
                    }
                    arg = sel.slice(j + 1, k - 1); j = k;
                }
                hadPseudo = true;
                if (!pe && !all && KEEP[name]) {
                    if (arg === null) { out += ':' + name; hasContent = true; }
                    else {
                        var origParts = C.splitTop(arg);
                        var parts = origParts.map(function (p) { return C.stripOne(p, false); });
                        var anyAll = parts.some(function (p) { return !p || p === '*'; });
                        var kept = parts.filter(function (p) { return p && p !== '*'; });
                        // Every rewrite must give a superset of the original.
                        // :is(:hover, .a) could apply to anything hoverable: drop it.
                        // :not(X) with X broadened would NARROW, so a :not() argument
                        // that changed is dropped (":not(.a, .b:hover)" → ":not(.a)").
                        if (name === 'not') {
                            var same = origParts.filter(function (p, q) { return parts[q] === p.replace(/\s+/g, ' ').replace(/\s*([>+~])\s*/g, ' $1 ').trim(); });
                            if (same.length) { out += ':not(' + same.join(', ') + ')'; hasContent = true; }
                        }
                        else if (name === 'is' || name === 'where' || name === 'has') { if (!anyAll && kept.length) { out += ':' + name + '(' + kept.join(', ') + ')'; hasContent = true; } }
                        else { out += ':' + name + '(' + arg + ')'; hasContent = true; }
                    }
                }
                i = j; continue;
            }
            out += c; hasContent = true; i++;
        }
        endCompound();
        return out.replace(/\s+/g, ' ').replace(/\s*([>+~])\s*/g, ' $1 ').trim();
    };
    C.prepare = function (sel) {
        var st = C.stripOne(sel, false), mode = 'structural-kept';
        try { document.querySelectorAll(st); } catch (_) {
            st = C.stripOne(sel, true); mode = 'all-stripped';
            try { document.querySelectorAll(st); } catch (__) { mode = 'invalid'; }
        }
        return { sel: sel, stripped: st, mode: mode, states: {} };
    };
    // Count matches for every selector in the named state. Results live on
    // the page (C.results) and are pulled once at the end.
    C.measure = function (state) {
        var rules = C.rules();
        var R = C.results = C.results || {};
        var order = C.order = C.order || [];
        var stats = { rules: 0, selectors: 0, matched: 0, unmatched: 0, invalid: 0, newRules: 0 };
        rules.forEach(function (r) {
            if (r.error || !r.sel) return;
            stats.rules++;
            var key = r.sheet + '|' + r.i + '|' + r.sel;
            var rec = R[key];
            if (!rec) {
                rec = R[key] = { sheet: r.sheet, i: r.i, sel: r.sel, conds: r.conds, decls: r.decls, firstSeen: state, mediaApplies: C.condsApply(r.conds), selectors: C.splitTop(r.sel).map(C.prepare) };
                order.push(key); stats.newRules++;
            }
            rec.selectors.forEach(function (S) {
                stats.selectors++;
                if (S.mode === 'invalid') { S.states[state] = null; stats.invalid++; return; }
                var m = 0;
                try { m = document.querySelectorAll(S.stripped).length; } catch (_) { m = null; }
                S.states[state] = m;
                if (m) stats.matched++; else stats.unmatched++;
            });
        });
        return stats;
    };
    C.sections = function (side) {
        return Array.prototype.map.call(document.querySelectorAll('#sidebar-' + side + ' .sidebar-section'), function (sec, i) {
            var t = sec.querySelector('.section-title');
            return { i: i, title: t ? t.textContent.trim() : null, collapsed: sec.classList.contains('collapsed'), expanded: t ? t.getAttribute('aria-expanded') : null,
                hidden: sec.hidden || getComputedStyle(sec).display === 'none' };
        });
    };
    C.sectionAt = function (side, i) { return document.querySelectorAll('#sidebar-' + side + ' .sidebar-section')[i]; };
    C.centre = function (el) {
        if (!el) return null;
        try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); } catch (_) { el.scrollIntoView(); }
        var r = el.getBoundingClientRect();
        var vis = !!(el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), visible: vis };
    };
    // Custom properties: every name declared in a stylesheet or an inline
    // style, plus what the setProperty hook saw, plus the known JS writers.
    C.propNames = function () {
        var names = {};
        function fromDecl(st) { for (var k = 0; k < st.length; k++) { var p = st[k]; if (p && p.indexOf('--') === 0) names[p] = 1; } }
        function walk(rules) { for (var i = 0; i < rules.length; i++) { var r = rules[i]; if (r.style) fromDecl(r.style); if (r.cssRules) walk(r.cssRules); } }
        for (var s = 0; s < document.styleSheets.length; s++) { try { walk(document.styleSheets[s].cssRules); } catch (_) {} }
        Array.prototype.forEach.call(document.querySelectorAll('[style]'), function (el) { fromDecl(el.style); });
        var agg = window.__clWriterAgg || {};
        Object.keys(agg).forEach(function (k) { names[agg[k].name] = 1; });
        ['--val', '--min', '--max', '--i', '--rows', '--peer', '--mp-peer', '--ss-frame-ratio', '--app-height', '--ui-scale', '--sidebar-width', '--sec-h', '--sec-c'].forEach(function (n) { names[n] = 1; });
        return Object.keys(names).sort();
    };
    C.targets = function () {
        var strip = document.getElementById('mixer-strip');
        var ch = strip && strip.querySelector('.mixer-channel');
        var curl = document.getElementById('curl');
        var fader = curl && curl.closest('.ch-fader') || (strip && strip.querySelector('.ch-fader'));
        var sec = document.querySelector('#sidebar-right .sidebar-section');
        return { ':root': document.documentElement, 'body': document.body, '#mixer-strip': strip, 'fader channel (first .mixer-channel)': ch, 'fader (.ch-fader of #curl)': fader, '#curl': curl, '#sidebar-right': document.getElementById('sidebar-right'), 'section (first #sidebar-right .sidebar-section)': sec, '#sidebar-left': document.getElementById('sidebar-left') };
    };
    C.snapshot = function () {
        var names = C.propNames(), T = C.targets(), out = {};
        Object.keys(T).forEach(function (k) {
            var el = T[k]; if (!el) { out[k] = null; return; }
            var cs = getComputedStyle(el), o = {};
            names.forEach(function (n) { var v = cs.getPropertyValue(n); if (v !== '') o[n] = v.trim(); });
            out[k] = o;
        });
        return { names: names.length, values: out };
    };
    return 1;
}

// Installed before the app's first script (Page.addScriptToEvaluateOnNewDocument).
function hookSource() {
    try {
        var AGG = window.__clWriterAgg = {};
        window.__clPhase = 'boot';
        var declEl = new WeakMap();
        [window.HTMLElement, window.SVGElement, window.MathMLElement].forEach(function (K) {
            if (!K || !K.prototype) return;
            var d = Object.getOwnPropertyDescriptor(K.prototype, 'style');
            if (!d || !d.get) return;
            Object.defineProperty(K.prototype, 'style', { configurable: true, enumerable: d.enumerable, set: d.set,
                get: function () { var s = d.get.call(this); try { if (s && !declEl.has(s)) declEl.set(s, this); } catch (_) {} return s; } });
        });
        var orig = CSSStyleDeclaration.prototype.setProperty;
        CSSStyleDeclaration.prototype.setProperty = function (name, value) {
            if (typeof name === 'string' && name.indexOf('--') === 0) {
                try {
                    var el = declEl.get(this), sig;
                    if (el) {
                        sig = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '');
                        var cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
                        if (cls.length) sig += '.' + cls.join('.');
                        if (el === document.documentElement) sig = 'html (:root)';
                    } else sig = this.parentRule ? 'rule ' + this.parentRule.selectorText : '(declaration without element)';
                    var frames = (new Error().stack || '').split('\n').slice(2).map(function (l) {
                        var m = /\/((?:js|scripts|prep)\/[^\s):?]+|[^\/\s):?]+\.(?:js|html))(?:\?[^:)]*)?:(\d+):\d+/.exec(l);
                        return m ? m[1] + ':' + m[2] : null;
                    }).filter(Boolean);
                    var writer = frames[0] || '?';
                    var k = window.__clPhase + '|' + name + '|' + sig + '|' + writer;
                    var a = AGG[k];
                    if (!a) a = AGG[k] = { phase: window.__clPhase, name: name, target: sig, writer: writer, stack: frames.slice(0, 4), n: 0, values: [] };
                    a.n++;
                    var v = String(value);
                    if (a.values.length < 3 && a.values.indexOf(v) < 0) a.values.push(v);
                } catch (_) {}
            }
            return orig.apply(this, arguments);
        };
    } catch (e) {}
}

// ─── CDP helpers ─────────────────────────────────────────────────────────────
async function shiftClick(d, x, y) {
    const base = { x, y, pointerType: 'mouse', modifiers: 8 };
    await d.send('Input.dispatchMouseEvent', Object.assign({ type: 'mouseMoved', button: 'none', buttons: 0 }, base));
    await d.send('Input.dispatchMouseEvent', Object.assign({ type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1 }, base));
    await sleep(40);
    await d.send('Input.dispatchMouseEvent', Object.assign({ type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1 }, base));
    await sleep(60);
}
async function pressEscape(d) { await d.tap('Escape', 'Escape', 27); await sleep(200); }
async function waitAnimations(d, ms) {
    const t0 = Date.now(); let n = -1;
    while (Date.now() - t0 < ms) { n = await d.ev('document.getAnimations().length').catch(() => -1); if (n === 0) break; await sleep(200); }
    return n;
}

// Open every collapsed section of one bar with a trusted Shift-click on its
// title (toggleSection(sec, additive=true), js/20:9224), synthetic fallback.
async function openSections(d, side) {
    const list = await d.ev(`window.__cl.sections(${JSON.stringify(side)})`);
    const logRows = [];
    for (const s of list) {
        const row = { side, title: s.title, how: '', ok: false };
        if (!s.collapsed) { row.how = 'already open'; row.ok = true; logRows.push(row); continue; }
        if (s.hidden) { row.how = 'hidden (display:none) — not opened'; logRows.push(row); problem(side + ' section "' + s.title + '" is hidden and was not opened'); continue; }
        await d.ev(`window.__cl.centre(window.__cl.sectionAt(${JSON.stringify(side)}, ${s.i}).querySelector('.section-title'))`);
        await sleep(80);
        const c = await d.ev(`window.__cl.centre(window.__cl.sectionAt(${JSON.stringify(side)}, ${s.i}).querySelector('.section-title'))`);
        if (c && c.visible) { await shiftClick(d, c.x, c.y); row.how = 'trusted Shift-click on .section-title'; } else row.how = 'title not visible; ';
        await sleep(250);
        let exp = await d.ev(`window.__cl.sectionAt(${JSON.stringify(side)}, ${s.i}).querySelector('.section-title').getAttribute('aria-expanded')`);
        if (exp !== 'true') {
            await d.ev(`(function(){ var sec = window.__cl.sectionAt(${JSON.stringify(side)}, ${s.i}); sec.querySelector('.section-header').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true })); return 1; })()`);
            await sleep(250);
            exp = await d.ev(`window.__cl.sectionAt(${JSON.stringify(side)}, ${s.i}).querySelector('.section-title').getAttribute('aria-expanded')`);
            row.how += 'synthetic Shift-click on .section-header (fallback)';
        }
        row.ok = exp === 'true';
        if (!row.ok) problem(side + ' section "' + s.title + '" would not open (aria-expanded=' + exp + ')');
        logRows.push(row);
    }
    await sleep(400);
    return logRows;
}

// ─── report helpers ──────────────────────────────────────────────────────────
const esc = s => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const code = s => '`' + String(s == null ? '' : s).replace(/`/g, 'ˋ') + '`';
function table(head, rows) {
    return ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|'].concat(rows.map(r => '| ' + r.map(esc).join(' | ') + ' |')).join('\n');
}
function fileOf(label) { return label.replace(/ \(.*$/, '').replace(/:\d+$/, ''); }

// A reading hint per unmatched selector, for C3: why it may be unmatched
// here without being dead. Heuristic, by token; the JSON keeps it as `hint`.
const STATE_CLASS = /\.(?:active|is-[a-z0-9-]+|has-[a-z0-9-]+|dragging|collapsed|snap-collapse|open|opened|closed|hidden|shown|show|visible|selected|disabled|loading|busy|recording|playing|paused|frozen|armed|hot|on|off|empty|error|warn|danger|editing|forking|sampling|cp-sampling|layers-dragging|compact-ui|focus-mode|transparent-mode|boot-cursor|boot-fade|booting|ui-enter|ui-settled|web-mode|electron-mode|pw-[a-z-]+|qub-[a-z-]+|raster-active|expanded|pressed|checked|current|highlight|flash|pulse|fade[a-z-]*|enter|leave|exit|done)\b/;
const BOOT_ONLY = /#splash-screen|\.splash-|boot-cursor|boot-fade|\.booting|\.ui-enter|\.ui-settled/;
const LAZY_UI = /^(\.pfi|#paletteExtractHost|\.mask-|\.stamp-|\.sam-|#samModal|\.pen-|\.cp-loupe|\.cp-toast|#custom-titlebar|\.rsb-rail|#mixer-more|\.mixer-more|\.remote-cursor|\.mp-|#mp[A-Z]|\.toast|\.close-ask|\.delete-modal|#deletePaletteModal|\.file-drop|\.recipe|#recipe|\.hk-picker|#hkBindBar|\.hk-bind)/;
// Every class and id token of a selector (outside brackets, parentheses and
// strings), looked up as a bare substring in index.html + js/*.js. A token no
// script or markup ever mentions is the strongest "dead" signal this audit
// can give without reading the code; a hit is not proof of life (the token
// may be in a comment), a miss is not proof of death (string-built names).
let REF_TEXT = null;
function refText() {
    if (REF_TEXT) return REF_TEXT;
    const parts = [fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')];
    fs.readdirSync(path.join(ROOT, 'js')).filter(f => /\.js$/.test(f)).forEach(f => parts.push(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')));
    REF_TEXT = parts.join('\n');
    return REF_TEXT;
}
const REF_CACHE = new Map();
function hasRef(token) {
    if (!REF_CACHE.has(token)) REF_CACHE.set(token, refText().indexOf(token) >= 0);
    return REF_CACHE.get(token);
}
function tokensOf(sel) {
    const out = [];
    let depth = 0, inStr = null;
    for (let i = 0; i < sel.length; i++) {
        const c = sel[i];
        if (inStr) { if (c === '\\') i++; else if (c === inStr) inStr = null; continue; }
        if (c === '"' || c === "'") { inStr = c; continue; }
        if (c === '[' || c === '(') { depth++; continue; }
        if (c === ']' || c === ')') { depth--; continue; }
        if (depth === 0 && (c === '.' || c === '#')) {
            let j = i + 1; while (j < sel.length && /[a-zA-Z0-9_-]/.test(sel[j])) j++;
            if (j > i + 1) out.push(c + sel.slice(i + 1, j));
            i = j - 1;
        }
    }
    return out;
}
function noRefTokens(sel) { return tokensOf(sel).filter(t => !hasRef(t.slice(1))); }
function hintFor(x) {
    const h = [];
    const nr = noRefTokens(x.selector);
    if (nr.length) h.push('no-ref(' + nr.join(',') + ')');
    if (x.mediaApplies === false) h.push('media');
    else if (x.conds.some(c => /^@container/.test(c))) h.push('container');
    if (/\[aria-[a-z]+=|\[disabled\]|\[hidden\]|\[open\]|\[inert\]|\[data-[a-z-]+=/.test(x.selector)) h.push('attr-state');
    if (BOOT_ONLY.test(x.selector)) h.push('boot-only');
    else if (STATE_CLASS.test(x.selector)) h.push('class-state?');
    if (LAZY_UI.test(x.selector.trim()) || /mask-editor|palette-from-image/.test(x.file)) h.push('lazy-ui?');
    return h.join(' ');
}

// ─── main ────────────────────────────────────────────────────────────────────
(async () => {
    fs.mkdirSync(CSS_WORK, { recursive: true });
    const started = new Date();
    let head = '(git unavailable)';
    try { head = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch (_) {}
    log('booting headless Chrome through scripts/test/radial-menu/driver.js ...');
    const d = await boot({ seed: { 'swirlResetHint.v1': '1' } });
    const out = { generated: started.toISOString(), env: {}, states: [], sectionLog: [], sheets: [], ruleStats: null, lineResolution: null, coverage: null, counts: {}, selectors: [], problems: [], pageExceptions: [] };
    let btnBoot = null, btnOpen = null, props = { writers: [], snapshots: {}, diffs: {} }, hookInstalled = false, coverageRaw = null;
    try {
        // Rule-usage tracking and the setProperty hook both have to be in
        // place before the app's first script: enable them, then reload.
        try {
            await d.send('DOM.enable');
            await d.send('CSS.enable');
            await d.send('CSS.startRuleUsageTracking');
            coverageRaw = { started: true };
        } catch (e) { problem('CSS rule-usage tracking could not start: ' + e.message); }
        await d.send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + hookSource.toString() + ')()' });
        log('reloading with the setProperty hook and rule-usage tracking armed ...');
        await d.load();
        hookInstalled = await d.ev('!!window.__clWriterAgg');
        if (!hookInstalled) problem('the setProperty hook did not install (window.__clWriterAgg missing after reload)');
        const anims = await waitAnimations(d, 6000);
        if (anims !== 0) problem('entrance animations still running after 6 s (' + anims + ')');
        await sleep(300);
        await d.ev("window.__clPhase = 'idle'; 1");

        const ver = await d.send('Browser.getVersion');
        const pageEnv = await d.ev(`(function(){ return { innerWidth: innerWidth, innerHeight: innerHeight, dpr: devicePixelRatio, uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim() || null,
            leftFolded: !!(window.Sidebars && window.Sidebars.left && window.Sidebars.left.isCollapsed()), rightFolded: !!(window.Sidebars && window.Sidebars.right && window.Sidebars.right.isCollapsed()), bodyClasses: document.body.className }; })()`);
        out.env = Object.assign({ date: started.toISOString(), headCommit: head, chrome: ver.product, node: process.version, build: 'web build in headless Chrome (driver window 1600x900, scratch profile, reloaded once)' }, pageEnv);
        log('env: ' + ver.product + ', viewport ' + pageEnv.innerWidth + 'x' + pageEnv.innerHeight + ', --ui-scale ' + pageEnv.uiScale + ', HEAD ' + head.slice(0, 7));

        await d.ev('(' + pageLib.toString() + ')()');
        out.sheets = await d.ev('window.__cl.sheets()');
        log('stylesheets: ' + out.sheets.length + ' (' + out.sheets.map(s => s.label.split(' ')[0]).join(', ') + ')');

        const measure = async (name, how, extra) => {
            const stats = await d.ev(`window.__cl.measure(${JSON.stringify(name)})`);
            const rec = Object.assign({ name, how, ok: true }, extra || {}, { stats });
            out.states.push(rec);
            log('state ' + name + ': ' + stats.rules + ' rules, ' + stats.selectors + ' selectors, ' + stats.matched + ' matched, ' + stats.unmatched + ' unmatched, ' + stats.invalid + ' invalid');
            return rec;
        };

        // ── 1. boot ──
        await measure('boot', 'as the app boots (scratch profile defaults: layout Everything, left bar open, Brush open, nothing else)');
        out.ruleStats = await d.ev('window.__cl.lastStats');
        try { btnBoot = await d.ev('window.auditButtons ? window.auditButtons() : null'); } catch (e) { problem('auditButtons() at boot threw: ' + e.message); }

        // ── 2. every right-sidebar section open ──
        await d.ev("window.__clPhase = 'sections'; 1");
        if (pageEnv.rightFolded) problem('right sidebar is folded at 1600 px; sections may not open');
        const rightLog = await openSections(d, 'right');
        out.sectionLog.push(...rightLog);
        const rightOpen = rightLog.filter(r => r.ok).length;
        await measure('right-sections-open', 'every #sidebar-right .sidebar-section opened (trusted Shift-click on .section-title, accordion additive)', { opened: rightOpen + '/' + rightLog.length, ok: rightOpen === rightLog.length });

        // ── 3. left sidebar open (bar + its sections) ──
        let leftNote = 'left bar already open at 1600 px';
        if (pageEnv.leftFolded) {
            const c = await d.ev(`window.__cl.centre(document.querySelector('#sidebar-left .lsb-rail-label'))`);
            if (c) { await d.click(c.x, c.y); await sleep(300); }
            const still = await d.ev('window.Sidebars.left.isCollapsed()');
            leftNote = still ? 'left bar stayed folded after clicking .lsb-rail-label' : 'left bar opened by a trusted click on .lsb-rail-label';
            if (still) problem(leftNote);
        }
        const leftLog = await openSections(d, 'left');
        out.sectionLog.push(...leftLog);
        const leftOpen = leftLog.filter(r => r.ok).length;
        await measure('left-open', 'left bar open with every #sidebar-left .sidebar-section opened (right sections still open); ' + leftNote, { opened: leftOpen + '/' + leftLog.length, ok: leftOpen === leftLog.length });
        try { btnOpen = await d.ev('window.auditButtons ? window.auditButtons() : null'); } catch (e) { problem('auditButtons() with everything open threw: ' + e.message); }

        // ── 3b. left bar folded (the rail): Sidebars.left.fold(true) does not persist (js/20 "without keeping") ──
        try {
            await d.ev('window.Sidebars.left.fold(true); 1');
            await sleep(400);
            const folded = await d.ev('window.Sidebars.left.isCollapsed()');
            await measure('left-folded', 'left bar folded to its rail via window.Sidebars.left.fold(true) (non-persisting), restored with Sidebars.left.restore()', { ok: !!folded });
            if (!folded) problem('left bar did not fold via Sidebars.left.fold(true)');
            await d.ev('window.Sidebars.left.restore(); 1');
            await sleep(400);
            const back = await d.ev('!window.Sidebars.left.isCollapsed()');
            if (!back) problem('left bar did not come back after Sidebars.left.restore()');
        } catch (e) { problem('left-folded state failed: ' + e.message); out.states.push({ name: 'left-folded', ok: false, how: 'Sidebars.left.fold(true)', error: e.message }); }

        // ── 4. F1 overlay ──
        await d.ev("window.__clPhase = 'f1'; 1");
        await d.ev('document.activeElement && document.activeElement.blur(); 1');
        await d.tap('F1', 'F1', 112);
        await sleep(300);
        let f1 = await d.ev(`(function(){ var o = document.getElementById('hotkeyOverlay'); return !!(o && o.style.display === 'flex' && o.getClientRects().length); })()`);
        if (!f1) { await d.ev(`(function(){ var o = document.getElementById('hotkeyOverlay'); if (o) { o.style.display = 'flex'; } return 1; })()`); await sleep(200); f1 = await d.ev(`(function(){ var o = document.getElementById('hotkeyOverlay'); return !!(o && o.getClientRects().length); })()`); problem('F1 did not open #hotkeyOverlay; forced display:flex for the measurement'); }
        await measure('f1-overlay', 'F1 tapped (js/05n toggleHotkeys), #hotkeyOverlay display:flex', { ok: f1 });
        await pressEscape(d);
        const f1Closed = await d.ev(`(function(){ var o = document.getElementById('hotkeyOverlay'); return !(o && o.style.display === 'flex'); })()`);
        if (!f1Closed) { await d.ev(`document.getElementById('hotkeyOverlay').style.display = 'none'; 1`); problem('Escape did not close #hotkeyOverlay; hidden by hand'); }

        // ── 5. radial menu ──
        await d.ev("window.__clPhase = 'radial'; 1");
        const canvas = await d.ev(`(function(){ var c = document.getElementById('canvas'); var r = c.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
        await d.ev('document.activeElement && document.activeElement.blur(); 1');
        await d.move(canvas.x, canvas.y); await sleep(60);
        await d.keyDown('e', 'KeyE', 69, [], 'e'); await sleep(40); await d.keyUp('e', 'KeyE', 69); await sleep(300);
        const radial = await d.ev('!!(window.RadialMenu && window.RadialMenu.isOpen && window.RadialMenu.isOpen())');
        if (!radial) problem('the radial menu did not open on E');
        await measure('radial-menu', 'pointer over the canvas centre, E tapped (js/58), #radialMenu open', { ok: radial });
        await pressEscape(d);
        if (await d.ev('!!(window.RadialMenu && window.RadialMenu.isOpen && window.RadialMenu.isOpen())')) problem('radial menu still open after Escape');

        // ── 6. colour picker popover ──
        await d.ev("window.__clPhase = 'picker'; 1");
        const well = await d.ev(`window.__cl.centre(document.getElementById('colorPicker'))`);
        let picker = false;
        if (well && well.visible) { await d.click(well.x, well.y); await sleep(350); picker = await d.ev(`!!(document.querySelector('.cp-pop') && document.querySelector('.cp-pop').getClientRects().length)`); }
        if (!picker) problem('the colour picker popover (.cp-pop) did not open from #colorPicker');
        await measure('colour-picker', 'trusted click on the top bar colour well #colorPicker (js/64), .cp-pop shown', { ok: picker });
        await pressEscape(d);
        if (await d.ev(`!!(document.querySelector('.cp-pop') && document.querySelector('.cp-pop').getClientRects().length)`)) problem('.cp-pop still shown after Escape');

        // ── 7. presets popup ──
        await d.ev("window.__clPhase = 'presets'; 1");
        const trig = await d.ev(`window.__cl.centre(document.getElementById('mixerPresetsTrigger'))`);
        const presetsShown = `(function(){ var p = document.querySelector('.mixer-presets-panel'); return !!(p && p.style.display !== 'none' && p.getClientRects().length); })()`;
        let presets = false;
        if (trig && trig.visible) { await d.click(trig.x, trig.y); await sleep(350); presets = await d.ev(presetsShown); }
        if (!presets) problem('the Presets popup (.mixer-presets-panel) did not open from #mixerPresetsTrigger');
        await measure('presets-popup', 'trusted click on #mixerPresetsTrigger (js/20), .mixer-presets-panel shown', { ok: presets });
        await pressEscape(d);
        if (await d.ev(presetsShown)) { if (trig) { await d.click(trig.x, trig.y); await sleep(250); } if (await d.ev(presetsShown)) problem('Presets popup still shown after Escape and a second click'); }

        // ── 8. custom properties: writers so far, then stroke and slider ──
        await d.ev("window.__clPhase = 'idle-before-stroke'; 1");
        await sleep(300);
        props.snapshots.before = await d.ev('window.__cl.snapshot()');
        await d.ev("window.__clPhase = 'stroke'; 1");
        const sx = Math.round(canvas.l + canvas.w * 0.35), sy = Math.round(canvas.t + canvas.h * 0.5);
        await d.move(sx, sy); await sleep(30);
        await d.down(sx, sy); await sleep(30);
        for (let k = 1; k <= 24; k++) { await d.move(sx + k * 10, sy + Math.round(Math.sin(k / 4) * 30), 1); await sleep(16); }
        await d.up(sx + 240, sy); await sleep(400);
        props.snapshots.afterStroke = await d.ev('window.__cl.snapshot()');
        await d.ev("window.__clPhase = 'slider'; 1");
        const slid = await d.ev(`(function(){ var el = document.getElementById('curl'); if (!el) return null; var before = el.value; var min = parseFloat(el.min), max = parseFloat(el.max); var target = (parseFloat(before) > (min + max) / 2) ? min + (max - min) * 0.25 : min + (max - min) * 0.75;
            el.value = String(target); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); window.__clCurlBefore = before; return { before: before, after: el.value, min: el.min, max: el.max }; })()`);
        if (!slid) problem('#curl not found for the slider move');
        await sleep(400);
        props.snapshots.afterSlider = await d.ev('window.__cl.snapshot()');
        props.sliderMove = slid;
        await d.ev("window.__clPhase = 'slider-restore'; 1");
        await d.ev(`(function(){ var el = document.getElementById('curl'); if (!el || window.__clCurlBefore == null) return 0; el.value = window.__clCurlBefore; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
        await sleep(300);
        props.writers = await d.ev('(function(){ var a = window.__clWriterAgg || {}; return Object.keys(a).map(function(k){ return a[k]; }); })()');
        props.propNames = await d.ev('window.__cl.propNames()');
        props.hookInstalled = hookInstalled;

        // ── 9. pull the results and stop coverage ──
        const R = await d.ev('(function(){ var o = window.__cl.order.map(function(k){ return window.__cl.results[k]; }); return o; })()');
        out.rawRules = R;
        if (coverageRaw) {
            try {
                const stop = await d.send('CSS.stopRuleUsageTracking');
                const headers = {};
                d.events.filter(m => m.method === 'CSS.styleSheetAdded').forEach(m => { headers[m.params.header.styleSheetId] = m.params.header; });
                const texts = {};
                const used = (stop.ruleUsage || []);
                const ids = [...new Set(used.map(u => u.styleSheetId))];
                for (const id of ids) { try { texts[id] = (await d.send('CSS.getStyleSheetText', { styleSheetId: id })).text; } catch (_) { texts[id] = null; } }
                coverageRaw = { entries: used.length, usedEntries: used.filter(u => u.used).length, sheets: ids.length, headers, texts, used };
            } catch (e) { problem('CSS.stopRuleUsageTracking failed: ' + e.message); coverageRaw = null; }
        }
        out.pageExceptions = d.events.filter(m => m.method === 'Runtime.exceptionThrown').map(m => (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text).slice(0, 20);
        if (out.pageExceptions.length) problem(out.pageExceptions.length + ' page exception(s); first: ' + out.pageExceptions[0].split('\n')[0]);
    } catch (err) {
        problem('run aborted: ' + (err && err.stack || err));
    } finally {
        await d.close();
    }

    // ─── Node side: lines, coverage, flatten ────────────────────────────────
    const stateNames = out.states.map(s => s.name);
    const raw = out.rawRules || [];
    delete out.rawRules;
    const bySheet = new Map();
    raw.forEach(r => { if (!bySheet.has(r.sheet)) bySheet.set(r.sheet, []); bySheet.get(r.sheet).push(r); });
    const lineRes = { resolved: 0, unresolved: 0, perFile: {} };
    for (const [label, rules] of bySheet) {
        const src = sourceFor(label);
        const fixed = /^js\/.*:(\d+)/.exec(label);
        let queues = null;
        if (src) {
            queues = new Map();
            indexCss(src.text).forEach(e => { if (!queues.has(e.norm)) queues.set(e.norm, []); queues.get(e.norm).push(e.line + src.offset); });
        }
        const pf = lineRes.perFile[label] = { resolved: 0, unresolved: 0 };
        rules.forEach(r => {
            let line = null;
            if (fixed) line = parseInt(fixed[1], 10);
            else if (queues) { const q = queues.get(normSel(r.sel)); if (q && q.length) line = q.shift(); }
            r.line = line;
            if (line != null) { pf.resolved++; lineRes.resolved++; } else { pf.unresolved++; lineRes.unresolved++; }
        });
    }
    out.lineResolution = lineRes;

    // Coverage: used ranges per file as lines.
    let usedRanges = null;
    if (coverageRaw && coverageRaw.used) {
        usedRanges = new Map();
        const sheetFile = {};
        for (const id of Object.keys(coverageRaw.texts)) {
            const h = coverageRaw.headers[id] || {};
            const text = coverageRaw.texts[id] || '';
            let file = null, offset = 0;
            if (h.sourceURL && /\/css\//.test(h.sourceURL)) file = decodeURIComponent(new URL(h.sourceURL).pathname.replace(/^\//, ''));
            else if (/#photoWarn/.test(text)) { file = 'index.html'; offset = (h.startLine || 0); }
            else if (/file-drop-hover/.test(text)) file = 'js/32-file-drop.js';
            else if (/boot-cursor/.test(text)) file = 'js/00a-boot.js';
            else if (/samModal|fadeIn/.test(text) && h.isInline) file = 'js/16-sam-integration.js';
            else file = (h.sourceURL || 'inline') + '#' + id;
            sheetFile[id] = { file, offset, length: text.length, isInline: !!h.isInline, startLine: h.startLine };
        }
        const lineAt = (text, off) => { let n = 1; for (let i = 0; i < off && i < text.length; i++) if (text.charCodeAt(i) === 10) n++; return n; };
        const perFile = {};
        coverageRaw.used.forEach(u => {
            const sf = sheetFile[u.styleSheetId]; if (!sf) return;
            const text = coverageRaw.texts[u.styleSheetId] || '';
            const a = lineAt(text, u.startOffset) + sf.offset, b = lineAt(text, u.endOffset) + sf.offset;
            if (!perFile[sf.file]) perFile[sf.file] = { used: 0, unused: 0, ranges: [] };
            perFile[sf.file][u.used ? 'used' : 'unused']++;
            if (u.used) perFile[sf.file].ranges.push([a, b]);
        });
        Object.keys(perFile).forEach(f => usedRanges.set(f, perFile[f].ranges));
        out.coverage = { entries: coverageRaw.entries, usedEntries: coverageRaw.usedEntries, sheets: coverageRaw.sheets, perFile: Object.fromEntries(Object.keys(perFile).map(f => [f, { used: perFile[f].used, unused: perFile[f].unused }])), sheetFile,
            note: 'CSS.startRuleUsageTracking was armed before the reload and stopped after the slider move; an entry is a style rule Chrome applied to at least one element during that span (pseudo-classes included, since this is Chrome\'s own matching). Rules under @media / @container that never applied, and rules for UI never shown, are not used.' };
    }
    const covUsed = (file, line) => {
        if (!usedRanges || line == null) return null;
        const ranges = usedRanges.get(file); if (!ranges) return false;
        return ranges.some(r => line >= r[0] && line <= r[1]);
    };

    // Flatten per selector.
    const flat = [];
    raw.forEach(r => {
        const file = fileOf(r.sheet);
        r.selectors.forEach(S => {
            const states = {}; stateNames.forEach(n => { states[n] = S.states[n] === undefined ? undefined : S.states[n]; });
            const matchedIn = stateNames.filter(n => S.states[n] > 0);
            const row = { file, sheet: r.sheet, line: r.line, rule: r.sel, selector: S.sel, stripped: S.stripped, mode: S.mode, conds: r.conds, mediaApplies: r.mediaApplies, decls: r.decls, firstSeen: r.firstSeen, states, matchedIn, matchedAny: matchedIn.length > 0, ruleApplied: covUsed(file, r.line), hint: '' };
            if (!row.matchedAny) row.hint = hintFor(row);
            flat.push(row);
        });
    });
    flat.sort((a, b) => a.file.localeCompare(b.file) || ((a.line || 1e9) - (b.line || 1e9)) || a.rule.localeCompare(b.rule));
    out.selectors = flat;

    const unmatched = flat.filter(x => !x.matchedAny && x.mode !== 'invalid');
    const invalid = flat.filter(x => x.mode === 'invalid');
    const rulesUnmatched = raw.filter(r => r.selectors.every(S => S.mode !== 'invalid' && !stateNames.some(n => S.states[n] > 0)));
    const firstMatchedIn = {}; stateNames.forEach(n => firstMatchedIn[n] = 0);
    flat.forEach(x => { if (x.matchedIn.length) firstMatchedIn[x.matchedIn[0]]++; });
    out.counts = {
        stylesheets: out.sheets.length,
        rules: raw.length,
        selectors: flat.length,
        selectorsInvalid: invalid.length,
        unmatchedAllStates: unmatched.length,
        rulesUnmatchedAllStates: rulesUnmatched.length,
        unmatchedUnderNonApplyingMedia: unmatched.filter(x => x.mediaApplies === false).length,
        unmatchedUnderContainer: unmatched.filter(x => x.mediaApplies === null && x.conds.some(c => /^@container/.test(c))).length,
        unmatchedNoRef: unmatched.filter(x => /no-ref\(/.test(x.hint)).length,
        unmatchedNoRefRules: new Set(unmatched.filter(x => /no-ref\(/.test(x.hint)).map(x => x.file + '|' + x.line)).size,
        firstMatchedIn,
        coverageUsedRules: usedRanges ? raw.filter(r => covUsed(fileOf(r.sheet), r.line) === true).length : null,
        coverageUnusedRules: usedRanges ? raw.filter(r => covUsed(fileOf(r.sheet), r.line) === false).length : null,
        matchedButNeverApplied: usedRanges ? raw.filter(r => covUsed(fileOf(r.sheet), r.line) === false && r.selectors.some(S => stateNames.some(n => S.states[n] > 0))).length : null,
        buttonAuditOffenders: btnOpen ? (btnOpen.rules.length + btnOpen.inline.length) : null,
        buttonsColoured: btnOpen ? (btnOpen.total - btnOpen.clean) : null,
        writers: props.writers.length
    };
    out.buttonAudit = { boot: btnBoot ? { total: btnBoot.total, clean: btnBoot.clean, rules: btnBoot.rules.length, inline: btnBoot.inline.length } : null, allOpen: btnOpen ? { total: btnOpen.total, clean: btnOpen.clean, rules: btnOpen.rules.length, inline: btnOpen.inline.length } : null };

    // Custom-property diffs.
    function diffSnap(a, b) {
        const outD = {};
        if (!a || !b) return outD;
        Object.keys(b.values).forEach(k => {
            const A = (a.values[k] || {}), B = (b.values[k] || {});
            const ch = [];
            new Set([...Object.keys(A), ...Object.keys(B)]).forEach(n => { if (A[n] !== B[n]) ch.push({ prop: n, before: A[n] === undefined ? null : A[n], after: B[n] === undefined ? null : B[n] }); });
            if (ch.length) outD[k] = ch;
        });
        return outD;
    }
    props.diffs = { stroke: diffSnap(props.snapshots.before, props.snapshots.afterStroke), slider: diffSnap(props.snapshots.afterStroke, props.snapshots.afterSlider) };
    out.problems = problems.slice();

    fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 1));
    fs.writeFileSync(OUT_BTN, JSON.stringify({ generated: out.generated, env: out.env, atBoot: btnBoot, allSectionsOpen: btnOpen }, null, 1));
    fs.writeFileSync(OUT_PROPS, JSON.stringify({ generated: out.generated, env: out.env, hookInstalled, sliderMove: props.sliderMove, propNames: props.propNames, writers: props.writers, snapshots: props.snapshots, diffs: props.diffs }, null, 1));

    // ─── live.md ─────────────────────────────────────────────────────────────
    const L = [];
    const rel = p => path.relative(ROOT, p).replace(/\\/g, '/');
    L.push('# CSS audit — live half (C2): rules nothing matches, the button audit, runtime custom properties');
    L.push('');
    L.push('Generated ' + out.generated + ' by `prep/scripts/css-live.js` at HEAD `' + head.slice(0, 7) + '`, ' + out.env.chrome + ', viewport ' + out.env.innerWidth + '×' + out.env.innerHeight + ' CSS px, `--ui-scale` ' + out.env.uiScale + ', web build in headless Chrome through `scripts/test/radial-menu/driver.js` (scratch profile; the app was reloaded once so the setProperty hook and Chrome\'s rule-usage tracking were in place before its first script). Raw data: `' + rel(OUT_JSON) + '` (one row per selector), `' + rel(OUT_BTN) + '`, `' + rel(OUT_PROPS) + '`.');
    L.push('');
    L.push('Re-run: `node prep/scripts/css-live.js` (about 60–90 s; no dev server, no Electron, nothing installed).');
    L.push('');
    L.push('## Counts');
    L.push('');
    L.push(table(['Count', 'Value'], [
        ['stylesheets enumerated', out.counts.stylesheets],
        ['style rules (CSSStyleRule, all depths)', out.counts.rules],
        ['selectors (rules split on top-level commas)', out.counts.selectors],
        ['selectors unmatched in every state', out.counts.unmatchedAllStates],
        ['… of which under a @media that does not apply at this viewport', out.counts.unmatchedUnderNonApplyingMedia],
        ['… of which under a @container (applicability not evaluated)', out.counts.unmatchedUnderContainer],
        ['… of which carry a class/id token that index.html + js/*.js never mention (strongest dead signal)', out.counts.unmatchedNoRef + ' selectors in ' + out.counts.unmatchedNoRefRules + ' rules'],
        ['rules whose every selector is unmatched in every state', out.counts.rulesUnmatchedAllStates],
        ['selectors invalid even after stripping (not counted)', out.counts.selectorsInvalid],
        ['rules Chrome applied at least once (rule-usage tracking)', out.counts.coverageUsedRules == null ? 'n/a' : out.counts.coverageUsedRules],
        ['rules Chrome never applied (rule-usage tracking)', out.counts.coverageUnusedRules == null ? 'n/a' : out.counts.coverageUnusedRules],
        ['rules matched by querySelectorAll but never applied (pseudo-class / media gated)', out.counts.matchedButNeverApplied == null ? 'n/a' : out.counts.matchedButNeverApplied],
        ['auditButtons() offenders with everything open (legacy rules + inline)', out.counts.buttonAuditOffenders == null ? 'n/a' : out.counts.buttonAuditOffenders],
        ['buttons still coloured by legacy rules (everything open)', out.counts.buttonsColoured == null ? 'n/a' : out.counts.buttonsColoured + ' of ' + btnOpen.total],
        ['distinct style.setProperty(\'--…\') writers observed (phase × name × target × file:line)', out.counts.writers],
        ['selector lines resolved from the source files', lineRes.resolved + ' of ' + (lineRes.resolved + lineRes.unresolved)]
    ]));
    L.push('');
    L.push('## Method and caveats');
    L.push('');
    L.push('- **What "unmatched" means here.** For every `CSSStyleRule` in `document.styleSheets` (recursing into `@media`, `@supports`, `@container`, `@layer`, `@import` and nested rules) each comma-separated selector had its pseudo-classes and pseudo-elements stripped and was passed to `document.querySelectorAll` in each state below. Structural pseudo-classes (`:root`, `:not()`, `:is()`, `:where()`, `:has()`, `:nth-*`, `:first/last/only-*`) were kept with their own arguments stripped, so counts stay tight; an `:is()`/`:where()`/`:has()` whose argument strips to "anything" is dropped (broadening), `:not(:hover)` is dropped. A selector that was invalid after that was stripped of every pseudo (`mode: all-stripped`); still invalid → `mode: invalid`, not counted. A rule is "unmatched" when no element matched in **any** state. A match does not mean the rule ever applied (the state pseudo-class may never be true); Chrome\'s rule-usage column answers that.');
    L.push('- **States are cumulative for the sidebars and transient for the overlays**: sections opened for `right-sections-open` stay open for the later states; the left bar is folded for `left-folded` only, then restored; the F1 overlay, radial menu, colour picker and Presets popup are each opened, measured and closed with Escape.');
    L.push('- **Lazily created UI is legitimately unmatched here**: the pen window (a separate window, js/47), the SAM / Magic Mask modal and its injected `#samModalStyles`, palette-from-image, the mask editor (`css/mask-editor.css`), toasts, the close-ask dialog, the delete-palette modal, the Swirl Together room menu / Invite popover as a room shows them, the More panel (`#mixer-more-panel`, below ~900 px wide), the compact-window layout, the Electron `#custom-titlebar` chrome, `.file-drop-hover`, the boot cursor, drag/drop and recording states. Treat their rows as "not reachable in these states", not as dead CSS.');
    L.push('- **Media and container queries**: `mediaApplies` says whether every enclosing `@media`/`@supports` holds at 1600×900 / DPR 1 (`false` → the rule cannot apply here whatever the DOM: `(pointer: coarse)`, the `max-width` breakpoints, `prefers-reduced-motion`); `@container` conditions are not evaluated (`null`).');
    L.push('- **Lines** come from a Node-side scan of the stylesheet files, matched to Chrome\'s serialised `selectorText` after normalisation, in order; `null` when Chrome\'s serialisation and the source did not line up (' + lineRes.unresolved + ' of ' + (lineRes.resolved + lineRes.unresolved) + '). The three JS-injected sheets carry the brief\'s fixed line; the `index.html` inline block is scanned from the HTML.');
    L.push('- **Rule-usage tracking** (`CSS.startRuleUsageTracking`) was armed before the reload, so boot is covered, and stopped after the slider move. It reports rules Chrome matched during style resolution, including pseudo-class state; it does not know about rules for UI never shown. Where a rule is matched by `querySelectorAll` but never applied, the gate is a pseudo-class, a media/container condition or a selector that only becomes true on interaction.');
    L.push('- **Not covered**: states other than those listed (hover, focus, drag, recording, a room, compact width, Electron), `phone/phone.css` and the other out-of-scope sheets (never loaded by `index.html`), and the pen window\'s stylesheet string (js/47, written into another document).');
    L.push('');
    L.push('## States');
    L.push('');
    L.push(table(['State', 'How', 'OK', 'Rules', 'Selectors', 'Matched', 'Unmatched', 'Invalid', 'Selectors first matched here'],
        out.states.map(s => [s.name, s.how + (s.opened ? ' (' + s.opened + ' sections open)' : ''), s.ok === false ? 'NO' : 'yes', s.stats ? s.stats.rules : '', s.stats ? s.stats.selectors : '', s.stats ? s.stats.matched : '', s.stats ? s.stats.unmatched : '', s.stats ? s.stats.invalid : '', firstMatchedIn[s.name] == null ? '' : firstMatchedIn[s.name]])));
    L.push('');
    L.push('Sections opened (trusted Shift-click unless noted):');
    L.push('');
    L.push(table(['Side', 'Title', 'How', 'Open after'], out.sectionLog.map(r => [r.side, r.title, r.how, r.ok ? 'yes' : 'NO'])));
    L.push('');
    L.push('## Stylesheets seen by the page');
    L.push('');
    L.push(table(['#', 'Sheet (as labelled in the JSON)', 'href', 'Top-level rules', 'Style rules (all depths)', 'Selectors', 'Unmatched in every state', 'Chrome never applied'],
        out.sheets.map((s, i) => {
            const rs = raw.filter(r => r.sheet === s.label);
            const fl = flat.filter(x => x.sheet === s.label);
            const un = fl.filter(x => !x.matchedAny && x.mode !== 'invalid').length;
            const cu = usedRanges ? rs.filter(r => covUsed(fileOf(r.sheet), r.line) === false).length : 'n/a';
            return [i, s.label, s.href ? s.href.replace(/^https?:\/\/[^/]+\//, '') : '(inline)', s.topLevelRules, rs.length, fl.length, un, cu];
        })));
    L.push('');
    if (out.ruleStats) L.push('Rule kinds: ' + out.ruleStats.styleRules + ' style rules, ' + out.ruleStats.keyframes + ' `@keyframes`, ' + out.ruleStats.fontFace + ' `@font-face`, ' + out.ruleStats.groups + ' grouping at-rules (`@media`/`@supports`/`@container`/`@layer`), ' + out.ruleStats.otherAt + ' other at-rules, ' + out.ruleStats.unreadable + ' unreadable sheets.');
    L.push('');
    L.push('## Selectors unmatched in every state, grouped by file');
    L.push('');
    L.push('Columns: line in the source file; the selector (one of the rule\'s comma-separated selectors; the full rule is in the JSON); what was actually queried after stripping (`(same)` when nothing was stripped); the enclosing conditions; **Rule applied**: whether Chrome applied the *rule* at least once in this session (`yes` on an unmatched selector means a sibling selector in the same rule list applied, or the element existed only at boot, e.g. the splash); **Hint**: `media` = the `@media` cannot hold at this viewport, `container` = under `@container` (not evaluated), `attr-state` = carries an ARIA/`data-`/`[disabled]`-style state attribute, `class-state?` = a class token that looks like a state (`.active`, `.is-*`, `.dragging`, `.compact-ui` …), `boot-only` = splash / boot classes, `lazy-ui?` = a surface the states above never show, `no-ref(.x,#y)` = those class/id tokens appear nowhere in `index.html` or `js/*.js` as a substring (the strongest dead signal here; a string-built name could still escape it). Hints are heuristics for reading, not verdicts. **Read with the lazy-UI caveat above.**');
    L.push('');
    const hintCount = {};
    unmatched.forEach(x => { const k = x.hint || '(none)'; hintCount[k] = (hintCount[k] || 0) + 1; });
    const hintGroups = {};
    unmatched.forEach(x => { const ks = x.hint ? x.hint.replace(/no-ref\([^)]*\)/, 'no-ref').split(' ') : ['(none)']; ks.forEach(k => hintGroups[k] = (hintGroups[k] || 0) + 1); });
    L.push('Unmatched selectors by hint (a selector can carry several): ' + Object.keys(hintGroups).sort((a, b) => hintGroups[b] - hintGroups[a]).map(k => code(k) + ' ' + hintGroups[k]).join(', ') + '. The `no-ref` rows are the dead-CSS candidates: no script and no markup mentions the token, and nothing matched in any state. The `(none)` rows are plain classes or ids that *are* mentioned somewhere in `js/` or `index.html` but had no element in these states: lazily built UI, or markup behind a feature flag; B\'s selector contract says which script creates them.');
    L.push('');
    const byFile = new Map();
    unmatched.forEach(x => { if (!byFile.has(x.file)) byFile.set(x.file, []); byFile.get(x.file).push(x); });
    for (const [file, rows] of [...byFile.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        const totalSel = flat.filter(x => x.file === file).length;
        L.push('### ' + file + ' — ' + rows.length + ' of ' + totalSel + ' selectors unmatched');
        L.push('');
        L.push(table(['Line', 'Selector', 'Queried as', 'Conditions', 'Rule applied', 'Hint'],
            rows.map(x => [x.line == null ? '?' : x.line, code(x.selector), x.stripped === x.selector ? '(same)' : code(x.stripped), x.conds.length ? x.conds.map(c => code(c)).join(' ') : '—', x.ruleApplied === null ? '?' : (x.ruleApplied ? 'yes' : 'never'), x.hint || ''])));
        L.push('');
    }
    if (invalid.length) {
        L.push('### Selectors that could not be queried (invalid in Chrome even after stripping)');
        L.push('');
        L.push(table(['File', 'Line', 'Selector', 'Stripped'], invalid.map(x => [x.file, x.line == null ? '?' : x.line, code(x.selector), code(x.stripped)])));
        L.push('');
    }
    // Matched but never applied: a useful hint list for C3 (gated by pseudo-class or media).
    if (usedRanges) {
        const gated = raw.filter(r => covUsed(fileOf(r.sheet), r.line) === false && r.selectors.some(S => stateNames.some(n => S.states[n] > 0)));
        const gatedByFile = {};
        gated.forEach(r => { const f = fileOf(r.sheet); gatedByFile[f] = (gatedByFile[f] || 0) + 1; });
        L.push('## Rules matched by querySelectorAll but never applied by Chrome in this session');
        L.push('');
        L.push('These ' + gated.length + ' rules have an element for their stripped selector but Chrome never applied them: the gate is the stripped pseudo-class (`:hover`, `:focus-visible`, `:active`, `:checked` …), a `@media`/`@container` condition, or an interaction state not exercised. They are **not** candidates for removal; they are the rules whose state the theme must restyle through ARIA/`data-ui` hooks. Per file: ' + Object.keys(gatedByFile).sort().map(f => f + ' ' + gatedByFile[f]).join(', ') + '. The per-rule list is in the JSON (`ruleApplied: false` with a non-empty `matchedIn`).');
        L.push('');
    }
    // Media conditions in use.
    const condCount = {};
    raw.forEach(r => r.conds.forEach(c => { condCount[c] = condCount[c] || { rules: 0, applies: r.mediaApplies }; condCount[c].rules++; }));
    L.push('## Enclosing conditions seen (rules under each, applies at 1600×900)');
    L.push('');
    L.push(table(['Condition', 'Rules', 'Applies here'], Object.keys(condCount).sort().map(c => [code(c), condCount[c].rules, condCount[c].applies === false ? 'no' : (condCount[c].applies === null ? '?' : 'yes')])));
    L.push('');
    L.push('## window.auditButtons() (js/38-button-audit.js)');
    L.push('');
    L.push('The audit walks every `button, .btn` in the DOM and names the stylesheet rules outside `css/01-buttons.css` that colour one (`background*`, `border*`, `color`), exempting `.btn--destructive`, `.btn--record` and `#photoWarn`; inline `style` colours are a second class of offender. Run twice: at boot and with every section open (collapsed sections are still in the DOM, so the two differ only by lazily built controls). Full output: `' + rel(OUT_BTN) + '`.');
    L.push('');
    const btnRow = (name, b) => b ? [name, b.total, b.clean, b.total - b.clean, b.rules.length, b.inline.length] : [name, 'n/a', '', '', '', ''];
    L.push(table(['Run', 'Buttons', 'Clean', 'Coloured by legacy rules', 'Offending rules', 'Inline offenders'], [btnRow('boot', btnBoot), btnRow('every section open', btnOpen)]));
    L.push('');
    if (btnOpen && btnOpen.rules.length) {
        L.push('Offending rules (every section open), most buttons first:');
        L.push('');
        L.push(table(['Sheet | selector', 'Buttons', 'Properties'], btnOpen.rules.map(r => [code(r.rule), r.buttons, r.props])));
        L.push('');
    }
    if (btnOpen && btnOpen.inline.length) {
        L.push('Inline style colours on buttons (these beat every stylesheet):');
        L.push('');
        L.push(table(['Button (id / class / text)', 'Properties'], btnOpen.inline.map(r => [code(r.button), r.props])));
        L.push('');
    }
    if (btnOpen && !btnOpen.rules.length && !btnOpen.inline.length) L.push('Clean: every button reads its colour from the section tokens (no offending rule, no inline colour).'), L.push('');
    L.push('## Custom properties written at runtime');
    L.push('');
    L.push('Two instruments. (a) A hook on `CSSStyleDeclaration.prototype.setProperty`, installed before the app\'s first script, records every `--…` write with its target element and the writer\'s `file:line` (first app frame on the stack), tagged by phase: `boot` (load to splash gone), `idle`, `sections` (opening every section), `f1`, `radial`, `picker`, `presets`, `stroke` (a trusted 24-step drag across the canvas), `slider` (`#curl` set to the far quarter of its range with `input` + `change`), `slider-restore`. (b) `getComputedStyle(el).getPropertyValue(name)` for every custom property name known to the page (declared in any stylesheet or inline style, seen by the hook, or on the known-writer list; ' + (props.propNames ? props.propNames.length : '?') + ' names) on `:root`, `body`, `#mixer-strip`, the first `.mixer-channel`, the `.ch-fader` around `#curl`, `#curl`, `#sidebar-right`, the first right section and `#sidebar-left`, before and after the stroke and the slider move. Hook installed: ' + (hookInstalled ? 'yes' : 'NO') + '. Raw: `' + rel(OUT_PROPS) + '`.');
    L.push('');
    const W = props.writers.slice().sort((a, b) => a.phase.localeCompare(b.phase) || a.name.localeCompare(b.name) || b.n - a.n);
    const phaseOrder = ['boot', 'idle', 'sections', 'f1', 'radial', 'picker', 'presets', 'idle-before-stroke', 'stroke', 'slider', 'slider-restore'];
    const byPhase = {}; W.forEach(w => { (byPhase[w.phase] = byPhase[w.phase] || []).push(w); });
    L.push('### Writers observed (setProperty hook)');
    L.push('');
    L.push(table(['Phase', 'Writes', 'Distinct names', 'Names'], phaseOrder.filter(p => byPhase[p]).map(p => [p, byPhase[p].reduce((a, w) => a + w.n, 0), new Set(byPhase[p].map(w => w.name)).size, [...new Set(byPhase[p].map(w => w.name))].map(code).join(' ')])));
    L.push('');
    // Compact: one row per phase × property × writer; targets are counted and sampled (the JSON has every target).
    const agg = new Map();
    W.forEach(w => { const k = w.phase + '|' + w.name + '|' + w.writer; const a = agg.get(k) || { phase: w.phase, name: w.name, writer: w.writer, n: 0, targets: new Set(), values: new Set() }; a.n += w.n; a.targets.add(w.target); w.values.forEach(v => a.values.add(v)); agg.set(k, a); });
    const aggRows = [...agg.values()].sort((a, b) => phaseOrder.indexOf(a.phase) - phaseOrder.indexOf(b.phase) || a.name.localeCompare(b.name) || b.n - a.n);
    L.push(table(['Phase', 'Property', 'Writer (file:line)', 'Calls', 'Targets', 'Sample targets', 'Sample values'], aggRows.map(a => [a.phase, code(a.name), code(a.writer), a.n, a.targets.size, [...a.targets].slice(0, 3).map(code).join(' ') + (a.targets.size > 3 ? ' …' : ''), [...a.values].slice(0, 3).map(code).join(' ')])));
    L.push('');
    const idleW = W.filter(w => /^(idle|idle-before-stroke)$/.test(w.phase));
    const idleN = idleW.reduce((a, w) => a + w.n, 0);
    if (idleW.length) {
        L.push('**Writes while idle (no interaction): ' + idleN + ' in two idle windows of ~0.3–0.6 s, all from ' + [...new Set(idleW.map(w => w.writer))].map(code).join(', ') + '.** That is `startPerceptualFaderPoll` (js/20-mixer-layout.js:1113–1118): one shared 250 ms `setInterval` that re-seats a perceptual fader thumb (`--val` on the `.ch-perceptual` proxy) only when it disagrees with its canonical slider by more than half a step (`reflect`, js/20:1091–1102). It is a low-rate poll, not a per-frame write, and it writes nothing when the thumbs agree; the one-off writes seen here are thumbs settling after boot. Nothing else writes a custom property without a state change.');
    } else {
        L.push('**No `--…` write happened while the app sat idle** (phases `idle` and `idle-before-stroke` are empty): nothing writes custom properties per frame today.');
    }
    L.push('');
    L.push('### Computed values that changed');
    L.push('');
    const diffRows = (D) => { const rows = []; Object.keys(D).forEach(k => D[k].forEach(c => rows.push([code(k), code(c.prop), c.before == null ? '(unset)' : code(c.before), c.after == null ? '(unset)' : code(c.after)]))); return rows; };
    const sRows = diffRows(props.diffs.stroke || {}), lRows = diffRows(props.diffs.slider || {});
    L.push('After the stroke (' + sRows.length + ' changes):');
    L.push('');
    L.push(sRows.length ? table(['Element', 'Property', 'Before', 'After'], sRows) : 'No computed custom property changed on the polled elements.');
    L.push('');
    L.push('After the slider move on `#curl` (' + (props.sliderMove ? props.sliderMove.before + ' → ' + props.sliderMove.after : 'n/a') + '; ' + lRows.length + ' changes):');
    L.push('');
    L.push(lRows.length ? table(['Element', 'Property', 'Before', 'After'], lRows) : 'No computed custom property changed on the polled elements.');
    L.push('');
    const rootProps = props.snapshots.before && props.snapshots.before.values[':root'] ? Object.keys(props.snapshots.before.values[':root']) : [];
    L.push('Custom properties with a value on `:root` after boot (' + rootProps.length + '): ' + rootProps.map(code).join(' '));
    L.push('');
    L.push('## Problems during the run');
    L.push('');
    L.push(problems.length ? problems.map(p => '- ' + p).join('\n') : '- none');
    L.push('');
    L.push('## Open questions');
    L.push('');
    L.push('- Which of the unmatched rules belong to UI the states above cannot reach (pen window, SAM, mask editor, palette-from-image, compact width, Electron, rooms) and which are dead? Only Gabriel can say per file; this report labels, it does not decide.');
    L.push('- `window.auditButtons()` sanctions `css/01-buttons.css`, `.btn--destructive`, `.btn--record` and `#photoWarn` by name (js/38-button-audit.js:21-31). A `@layer theme` colouring buttons will be reported as an offender unless the audit learns the layer or the theme file name; the CSS plan has to say which.');
    L.push('- The `#fpsCap` select and the Reset-app hint vary between headless runs (see `prep/baseline/dom/NOTES.md`); they do not affect selector matching but may move the button totals by one. Chrome\'s rule-usage count also drifts by a few rules between runs (pointer position, the fader re-seat); `matchedAny` is the deterministic column, `ruleApplied` a hint.');
    L.push('- **Name collision for CSS prep step 5**: the theme plans `--i` (brightness 0–1) per control, but `--i` is already written on every `.sidebar-section` as its row index for the entrance stagger (js/20-mixer-layout.js:2666 and js/43-ui-visibility.js:293, two writers for the same property; see the boot rows above). The theme property needs another name or a scope that cannot inherit from a section; who decides?');
    L.push('- `--i`/`--rows` are written twice at boot by two files (js/20:2665–2666 and js/43:292–293) for the same sections; harmless today, but whichever one the theme hooks into for "the existing code path that runs when state changes" should be named in the inventory.');
    L.push('- Hover, focus, active, drag, recording, room, compact-width and Electron states were not reached: the ' + (out.counts.matchedButNeverApplied == null ? '' : out.counts.matchedButNeverApplied + ' ') + 'matched-but-never-applied rules are exactly the ones a later state pass (or F\'s pressed/checked/expanded/focused/disabled screenshots) would need to cover.');
    L.push('');
    fs.writeFileSync(OUT_MD, L.join('\n'));

    log('wrote ' + rel(OUT_JSON) + ' (' + flat.length + ' selectors, ' + unmatched.length + ' unmatched in every state), ' + rel(OUT_MD) + ', ' + rel(OUT_BTN) + ', ' + rel(OUT_PROPS));
    log('counts: selectors=' + flat.length + ' unmatched-all-states=' + unmatched.length + ' rules=' + raw.length + ' button-audit-offenders=' + out.counts.buttonAuditOffenders + ' writers=' + props.writers.length + ' coverage-unused-rules=' + out.counts.coverageUnusedRules);
    if (problems.length) { log(problems.length + ' problem(s)'); }
})();
