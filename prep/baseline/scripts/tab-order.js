// prep/baseline/scripts/tab-order.js — F4 baseline: the keyboard focus order
// of the shipping UI, for the Walnut & Copper prep (prep/briefs/F-baselines.md,
// F4). Reads nothing the user owns, changes nothing outside prep/.
//
//   node prep/baseline/scripts/tab-order.js            capture -> prep/baseline/keyboard/
//   node prep/baseline/scripts/tab-order.js --check    re-capture into prep/work/keyboard-check/
//                                                      and diff the order against the baseline
//                                                      (exit 1 on any difference)
//
// Boots the web build in its own headless Chrome through the repo driver
// (scripts/test/radial-menu/driver.js: own static server, scratch profile with
// PhotoSafe / the startup fork / the first-run hint already answered), opens
// everything the way F0 (prep/scripts/dom-dump.js) does — the left bar if it
// is folded, every sidebar section by a trusted Shift-click on its title —
// clicks the canvas once to settle focus, and then presses Tab (trusted,
// Input.dispatchKeyEvent through the driver's tap) up to MAX_TABS times,
// recording document.activeElement at every stop: a selector, the CDP
// accessibility role and name (Accessibility.getPartialAXTree on the live
// element), surface, section and the skip menu's region. Then Shift+Tab the
// same way from the last stop for the reverse order. It also records what the
// skip menu (js/66-skip-menu.js) does on the first Tab, both straight after
// the canvas click and after Escape, and where each of its four picks lands.
//
// Nothing here calls an app setter that persists (GUIDANCE.md §2b): the only
// state changes are trusted clicks and keys on real controls inside the
// scratch profile, which the driver deletes on close.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { boot, sleep } = require('../../../scripts/test/radial-menu/driver');

const ROOT = path.resolve(__dirname, '../../..');
const BASE_DIR = path.join(ROOT, 'prep', 'baseline', 'keyboard');
const CHECK = process.argv.includes('--check');
const OUT_DIR = CHECK ? path.join(ROOT, 'prep', 'work', 'keyboard-check') : BASE_DIR;
const F0_PATH = path.join(ROOT, 'prep', 'baseline', 'dom', 'controls.json');
const MAX_TABS = 800;
const STUCK_LIMIT = 3;          // the same element after this many Tabs in a row = a trap

// F0's selector, verbatim (prep/scripts/dom-dump.js:40), so `f0Order` indexes
// controls.json the same way.
const F0_SEL = 'button, input, select, textarea, a[href], [role], [tabindex], [contenteditable], summary, label, .section-title, .mixer-channel, .sidebar-section';

const TAB = ['Tab', 'Tab', 9];
const KEYS = {
    esc: ['Escape', 'Escape', 27], enter: ['Enter', 'Enter', 13],
    up: ['ArrowUp', 'ArrowUp', 38], down: ['ArrowDown', 'ArrowDown', 40], left: ['ArrowLeft', 'ArrowLeft', 37], right: ['ArrowRight', 'ArrowRight', 39]
};

const problems = [];
function problem(msg) { problems.push(msg); console.log('PROBLEM ' + msg); }
function log(msg) { console.log(msg); }

// ─── page-side library (installed once per boot) ────────────────────────────
// Kept as a string so the file reads top to bottom. `describe(el)` is called
// through Runtime.callFunctionOn on the live activeElement; `seen` gives each
// element an identity across steps without touching the DOM.
const PAGE_LIB = `(function () {
    var T = window.__to = window.__to || {};
    T.F0_SEL = ${JSON.stringify(F0_SEL)};
    T.seen = [];
    // State classes that would make a selector depend on the moment it was read.
    T.STATE = /^(collapsed|open|opened|active|on|off|sel|selected|checked|pressed|focus|focused|hover|show|shown|hidden|disabled|dragging|is-open|is-active|skip-landed|ui-enter|ui-hidden|playing|recording|live|muted|current)$/;
    // js/66-skip-menu.js REGIONS, same selectors, same keys.
    T.REGIONS = [
        { key: 'left', sel: '#sidebar-left' }, { key: 'top', sel: '#mixer-strip' },
        { key: 'right', sel: '#sidebar-right' }, { key: 'bottom', sel: '#quality-underbar' }
    ];
    T.visible = function (el) {
        if (!el || !el.getClientRects || !el.getClientRects().length) return false;
        return getComputedStyle(el).visibility !== 'hidden';
    };
    T.text = function (el, max) {
        var t = (el && el.textContent || '').replace(/\\s+/g, ' ').trim();
        return t.length > max ? t.slice(0, max) + '\\u2026' : t;
    };
    T.uniqueId = function (el) {
        return !!(el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1);
    };
    T.idClasses = function (el) {
        return (el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).filter(function (c) { return !T.STATE.test(c); });
    };
    // A readable selector: the nearest ancestor with a unique id, then tag +
    // up to two identity classes, with :nth-of-type where same-tag siblings
    // would otherwise collide. 'unique' says whether it matches one element.
    T.selector = function (el) {
        if (T.uniqueId(el)) return { selector: '#' + el.id, unique: true };
        var parts = [], n = el;
        while (n && n.nodeType === 1 && n !== document.body) {
            if (T.uniqueId(n)) { parts.unshift('#' + n.id); break; }
            var seg = n.tagName.toLowerCase();
            var cls = T.idClasses(n).slice(0, 2);
            if (cls.length) seg += '.' + cls.map(function (c) { return CSS.escape(c); }).join('.');
            var p = n.parentElement;
            if (p) {
                var same = Array.prototype.filter.call(p.children, function (c) { return c.tagName === n.tagName; });
                if (same.length > 1) seg += ':nth-of-type(' + (same.indexOf(n) + 1) + ')';
            }
            parts.unshift(seg);
            n = p;
        }
        var s = parts.join(' > ');
        var unique = false;
        try { unique = document.querySelectorAll(s).length === 1 && document.querySelector(s) === el; } catch (_) { unique = false; }
        return { selector: s, unique: unique };
    };
    // A strict path: :nth-child from the nearest unique-id ancestor. Always one element.
    T.path = function (el) {
        var parts = [], n = el;
        while (n && n.nodeType === 1 && n !== document.body) {
            if (T.uniqueId(n)) { parts.unshift('#' + n.id); break; }
            var p = n.parentElement;
            var idx = p ? Array.prototype.indexOf.call(p.children, n) + 1 : 1;
            parts.unshift(n.tagName.toLowerCase() + ':nth-child(' + idx + ')');
            n = p;
        }
        return (parts.length && parts[0][0] === '#' ? '' : 'body > ') + parts.join(' > ');
    };
    // Same surface rule as F0 (prep/scripts/dom-dump.js surfaceOf).
    T.surfaceOf = function (el) {
        var s = el.closest('#mixer-strip, #sidebar-left, #sidebar-right, #canvas-area, #custom-titlebar');
        if (s) return s.id === 'custom-titlebar' ? 'titlebar' : s.id;
        var top = el;
        while (top.parentElement && top.parentElement !== document.body) top = top.parentElement;
        if (top === document.body || !top.parentElement) return 'body';
        if (top.id === 'main-area') return 'main-area';
        if (top.id) return 'overlay:' + top.id;
        var c = (top.getAttribute('class') || '').trim().split(/\\s+/)[0];
        return c ? 'overlay:.' + c : 'body';
    };
    T.sectionTitle = function (sec) { var t = sec.querySelector('.section-title'); return t ? T.text(t, 60) : null; };
    T.channelLabel = function (ch) {
        if (ch.dataset.uiLabel) return ch.dataset.uiLabel;
        var l = ch.querySelector('.ch-label');
        if (l && !l.querySelector('select')) { var t = T.text(l, 60); if (t) return t; }
        return ch.dataset.uiKey || ch.getAttribute('aria-label') || ch.title || null;
    };
    T.sectionOf = function (el) {
        var sec = el.closest('.sidebar-section');
        if (sec) return T.sectionTitle(sec);
        var ch = el.closest('.mixer-channel');
        if (ch) return T.channelLabel(ch);
        return null;
    };
    T.regionOf = function (el) {
        for (var i = 0; i < T.REGIONS.length; i++) if (el.closest(T.REGIONS[i].sel)) return T.REGIONS[i].key;
        return null;
    };
    // Role and name when the AX tree has no usable node (same rules as F0).
    T.implicitRole = function (el) {
        var t = el.tagName.toLowerCase();
        if (t === 'button') return 'button';
        if (t === 'a') return el.hasAttribute('href') ? 'link' : 'generic';
        if (t === 'select') return (el.multiple || el.size > 1) ? 'listbox' : 'combobox';
        if (t === 'textarea') return 'textbox';
        if (t === 'summary') return 'DisclosureTriangle';
        if (t === 'label') return 'LabelText';
        if (/^h[1-6]$/.test(t)) return 'heading';
        if (t === 'input') {
            var ty = (el.getAttribute('type') || 'text').toLowerCase();
            var map = { checkbox: 'checkbox', radio: 'radio', range: 'slider', number: 'spinbutton', color: 'ColorWell', search: 'searchbox', file: 'button', submit: 'button', reset: 'button', button: 'button', image: 'button', hidden: 'none' };
            return map[ty] || 'textbox';
        }
        return 'generic';
    };
    T.fallbackName = function (el) {
        var lb = el.getAttribute('aria-labelledby');
        if (lb) {
            var parts = lb.split(/\\s+/).map(function (id) { var e = document.getElementById(id); return e ? T.text(e, 120) : ''; }).filter(Boolean);
            if (parts.length) return parts.join(' ');
        }
        var al = el.getAttribute('aria-label');
        if (al && al.trim()) return al.trim();
        var t = el.tagName.toLowerCase();
        if (t === 'input' || t === 'select' || t === 'textarea') {
            if (el.id) { var lf = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (lf) return T.text(lf, 120); }
            var w = el.closest('label'); if (w) return T.text(w, 120);
            return el.placeholder || el.title || '';
        }
        return T.text(el, 120) || el.title || '';
    };
    // Where the two bars are scrolled (diagnostic: focus scrolls the bar it
    // lands in, and #sidebar-right has scroll-behavior: smooth, css/21:43).
    T.barScroll = function () {
        var out = {};
        ['#sidebar-left', '#sidebar-right'].forEach(function (s) {
            var bar = document.querySelector(s); if (!bar) return;
            var tops = [bar].concat(Array.prototype.slice.call(bar.querySelectorAll('*'))).filter(function (el) { return el.scrollTop > 0; });
            out[s] = tops.map(function (el) { return (el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0]) + '=' + Math.round(el.scrollTop); });
        });
        return out;
    };
    T.menuState = function () {
        var m = document.getElementById('skipMenu'), a = document.activeElement;
        if (!m) return { built: false };
        var opts = Array.prototype.slice.call(m.querySelectorAll('.skip-menu-option'));
        return {
            built: true,
            open: !!(window.SkipMenu && window.SkipMenu.isOpen()),
            on: a && a.classList && a.classList.contains('skip-menu-option') ? a.dataset.region : null,
            here: (function () { var c = m.querySelector('[aria-current]'); return c ? c.dataset.region : null; })(),
            off: opts.filter(function (b) { return b.getAttribute('aria-disabled') === 'true'; }).map(function (b) { return b.dataset.region; }),
            buttons: opts.map(function (b) { return { region: b.dataset.region, label: b.textContent, ariaDisabled: b.getAttribute('aria-disabled'), tabIndex: b.tabIndex, ariaCurrent: b.getAttribute('aria-current') }; }),
            rect: (function () { var r = m.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })()
        };
    };
    // What js/66 remembers as "where you were": the last focused control that
    // is not one of the skip menu's buttons (js/66-skip-menu.js lastControl).
    // Read before this element updates it, so a landing can be compared with it.
    T.lastNonMenuIdx = -1;
    T.describe = function (el) {
        if (!el || el === document.body || el === document.documentElement) {
            return { body: true, menu: T.menuState(), prevLastNonMenuIdx: T.lastNonMenuIdx };
        }
        var idx = T.seen.indexOf(el), isNew = idx < 0;
        if (isNew) { T.seen.push(el); idx = T.seen.length - 1; }
        var prevLast = T.lastNonMenuIdx;
        if (!el.closest('#skipMenu') && el.tabIndex >= 0) T.lastNonMenuIdx = idx;
        var tag = el.tagName.toLowerCase();
        var sel = T.selector(el);
        var aria = {};
        Array.prototype.forEach.call(el.attributes, function (a) { if (a.name.indexOf('aria-') === 0) aria[a.name] = a.value; });
        var r = el.getBoundingClientRect();
        return {
            body: false,
            seenIndex: idx, isNew: isNew, prevLastNonMenuIdx: prevLast,
            selector: sel.selector, selectorUnique: sel.unique, path: T.path(el),
            tag: tag,
            type: (tag === 'input' || tag === 'button') ? (el.getAttribute('type') || (tag === 'input' ? 'text' : 'submit')).toLowerCase() : null,
            id: el.id || null,
            classes: T.idClasses(el).slice(0, 4),
            roleAttr: el.getAttribute('role'),
            roleFallback: T.implicitRole(el),
            nameFallback: T.fallbackName(el),
            aria: aria,
            tabIndexAttr: el.getAttribute('tabindex'),
            tabIndex: el.tabIndex,
            surface: T.surfaceOf(el),
            section: T.sectionOf(el),
            region: T.regionOf(el),
            text: T.text(el, 40),
            f0Order: Array.prototype.indexOf.call(document.querySelectorAll(T.F0_SEL), el),
            focusVisible: (function () { try { return el.matches(':focus-visible'); } catch (_) { return null; } })(),
            inViewport: r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth,
            rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
            barScroll: T.barScroll(),
            menu: T.menuState()
        };
    };
    // The quality governor's slowdown button (js/08a-quality-governor.js
    // buildSlow / placeSlow) is inserted into #quality-underbar before Reset
    // app when a paint slowdown or a performance rescue lights it, which would
    // add two Tab stops (#slowdownBtn and its Dismiss). The walk never paints,
    // so it should stay unbuilt; read before and after so a slow machine's run
    // explains itself.
    T.slowdown = function () {
        var cell = document.getElementById('slowdownCell');
        var g = null;
        try { g = window.QualityGovernor && window.QualityGovernor.getState ? window.QualityGovernor.getState().slowdown : null; } catch (_) {}
        return { cell: !cell ? 'absent' : (cell.hidden ? 'hidden' : 'shown'), governor: g ? g.shown : null, rescue: g ? !!g.rescue : null, paintLevel: g ? g.paintLevel : null };
    };
    T.sectionEls = function () {
        return Array.prototype.slice.call(document.querySelectorAll('#sidebar-left .sidebar-section'))
            .concat(Array.prototype.slice.call(document.querySelectorAll('#sidebar-right .sidebar-section')));
    };
    T.sectionAt = function (i) { return T.sectionEls()[i]; };
    T.sections = function () {
        return T.sectionEls().map(function (sec, i) {
            var t = sec.querySelector('.section-title');
            return { domOrder: i, side: sec.closest('#sidebar-left') ? 'left' : 'right', title: T.sectionTitle(sec), group: sec.dataset.group || null,
                collapsed: sec.classList.contains('collapsed'), ariaExpanded: t ? t.getAttribute('aria-expanded') : null,
                displayNone: getComputedStyle(sec).display === 'none', hiddenAttr: sec.hidden, titleVisible: t ? T.visible(t) : false };
        });
    };
    return 1;
})()`;

// ─── CDP helpers ─────────────────────────────────────────────────────────────
async function shiftClick(d, x, y) {
    const base = { x, y, pointerType: 'mouse', modifiers: 8 };
    await d.send('Input.dispatchMouseEvent', Object.assign({ type: 'mouseMoved', button: 'none', buttons: 0 }, base));
    await d.send('Input.dispatchMouseEvent', Object.assign({ type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1 }, base));
    await sleep(40);
    await d.send('Input.dispatchMouseEvent', Object.assign({ type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1 }, base));
    await sleep(60);
}

async function centreOf(d, expr) {
    return d.ev(`(function(){ var el = ${expr}; if (!el) return null; try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); } catch (_) { el.scrollIntoView(); }
        var r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), visible: window.__to.visible(el) }; })()`);
}

async function waitAnimations(d, ms) {
    const t0 = Date.now();
    let n = -1;
    while (Date.now() - t0 < ms) {
        n = await d.ev('document.getAnimations().length').catch(() => -1);
        if (n === 0) break;
        await sleep(200);
    }
    return n;
}

// The focused element right now: identity, selector, surface (page side) and
// role + name from the accessibility tree (Accessibility.getPartialAXTree on
// the live object; the page-side fallback when the node is ignored).
async function readActive(d) {
    const r = await d.send('Runtime.evaluate', { expression: 'document.activeElement', returnByValue: false });
    const obj = r.result;
    if (!obj || !obj.objectId) return { body: true, menu: await d.ev('window.__to.menuState()') };
    let info;
    try {
        const rec = await d.send('Runtime.callFunctionOn', { objectId: obj.objectId, functionDeclaration: 'function () { return window.__to.describe(this); }', returnByValue: true });
        info = rec.result.value;
        if (!info.body) {
            let n = null, src = 'fallback:no-ax-node';
            try {
                const ax = await d.send('Accessibility.getPartialAXTree', { objectId: obj.objectId, fetchRelatives: false });
                n = (ax.nodes || []).find(x => !x.ignored) || (ax.nodes || [])[0] || null;
                if (n && n.ignored) { src = 'fallback:ignored'; n = null; }
            } catch (e) { src = 'fallback:error'; }
            if (n) {
                info.role = n.role ? n.role.value : null;
                info.name = n.name ? n.name.value : '';
                info.nameSource = 'cdp';
                const p = {};
                (n.properties || []).forEach(pr => { if (pr.value && pr.value.value !== undefined) p[pr.name] = pr.value.value; });
                info.axProps = p;
            } else {
                info.role = info.roleAttr || info.roleFallback;
                info.name = info.nameFallback;
                info.nameSource = src;
            }
            delete info.roleFallback; delete info.nameFallback;
        }
    } finally {
        await d.send('Runtime.releaseObject', { objectId: obj.objectId }).catch(() => {});
    }
    return info;
}

function stopFrom(info, i) {
    if (info.body) return { i, document: true, selector: '(document: focus left the page)', tag: null, id: null, role: null, name: null, surface: null, section: null, region: null, menuOpen: !!(info.menu && info.menu.open) };
    return {
        i, document: false, seenIndex: info.seenIndex,
        selector: info.selector, selectorUnique: info.selectorUnique, path: info.path,
        tag: info.tag, type: info.type, id: info.id, classes: info.classes,
        role: info.role, name: info.name, nameSource: info.nameSource,
        surface: info.surface, section: info.section, region: info.region,
        tabIndexAttr: info.tabIndexAttr, aria: info.aria, text: info.text,
        f0Order: info.f0Order, focusVisible: info.focusVisible, inViewport: info.inViewport, rect: info.rect, barScroll: info.barScroll,
        menuOpen: !!(info.menu && info.menu.open), menuOn: info.menu ? info.menu.on : null
    };
}

// Why a probe past an end landed where it did (js/66-skip-menu.js is the only
// script that takes a Tab from the document; the rest is the browser's own
// sequential focus navigation).
function readingFor(probe, before, firstStop, lastStop, shift) {
    const key = shift ? 'Shift+Tab' : 'Tab';
    if (probe.body) return 'focus left the page (document.activeElement is body: in a browser tab the next ' + key + ' goes to the browser\'s own toolbar and never reaches the page, so the sequence cannot close by ' + key + ' alone; the desktop app has no toolbar)';
    const fromBody = !!(before && before.body);
    if (fromBody && probe.seenIndex === probe.prevLastNonMenuIdx) return 'js/66 "where you were": with nothing focused, ' + key + ' went back to the last control that had focus (' + probe.selector + '), not round to the other end';
    if (fromBody && probe.menu && probe.menu.open) return 'js/66 open(): with nothing focused and nothing remembered, ' + key + ' opened the skip menu on "' + probe.menu.on + '"';
    if (probe.menu && probe.menu.open) return 'the browser\'s own ' + key + ' into the skip menu, on its "' + probe.menu.on + '" button';
    if (firstStop && probe.seenIndex === firstStop.seenIndex) return 'came round to the first stop';
    if (lastStop && probe.seenIndex === lastStop.seenIndex) return 'came round to the last stop';
    return 'landed on ' + probe.selector;
}

// One Tab (or Shift+Tab) and what it landed on.
async function pressTab(d, shift) {
    await d.tap(TAB[0], TAB[1], TAB[2], shift ? ['shift'] : []);
    await sleep(40);
    return readActive(d);
}
async function pressKey(d, k, text) { await d.tap(KEYS[k][0], KEYS[k][1], KEYS[k][2], [], text); await sleep(120); return readActive(d); }

// Walk in one direction from the current focus until the sequence closes:
// back at the start element, out to the document, stuck, or MAX_TABS.
async function walk(d, shift, label) {
    const stops = [];
    const start = await readActive(d);
    if (start.body) throw new Error(label + ': nothing focused at the start of the walk');
    stops.push(stopFrom(start, 0));
    let last = start, stuck = 0, end = null;
    for (let n = 1; n <= MAX_TABS; n++) {
        const info = await pressTab(d, shift);
        if (info.body) {
            stops.push(stopFrom(info, n));
            end = { why: 'document', at: n, detail: 'focus left the page (document.activeElement is body) after stop ' + (n - 1) };
            break;
        }
        if (info.seenIndex === start.seenIndex) {
            end = { why: 'start', at: n, detail: 'focus came back round to the first stop after ' + (n - 1) + ' further stops' };
            break;
        }
        if (last && !last.body && info.seenIndex === last.seenIndex) {
            stuck++;
            if (stuck >= STUCK_LIMIT) {
                stops.push(stopFrom(info, n));
                end = { why: 'trap', at: n, detail: 'focus stayed on ' + info.selector + ' for ' + STUCK_LIMIT + ' Tabs in a row' };
                break;
            }
        } else stuck = 0;
        if (!info.isNew && info.seenIndex !== start.seenIndex) {
            // A revisit that is not the start: record it, keep going (a cycle
            // inside the page would show as repeated seenIndex values).
            const seenBefore = stops.filter(s => s.seenIndex === info.seenIndex).length;
            if (seenBefore >= 2) {
                stops.push(stopFrom(info, n));
                end = { why: 'cycle', at: n, detail: 'focus is cycling without reaching the first stop (' + info.selector + ' seen 3 times)' };
                break;
            }
        }
        stops.push(stopFrom(info, n));
        last = info;
        if (n % 50 === 0) log('  ' + label + ': ' + n + ' tabs, at ' + info.selector);
    }
    if (!end) end = { why: 'max', at: MAX_TABS, detail: 'stopped at the ' + MAX_TABS + '-Tab cap without closing the sequence' };
    return { stops, end };
}

// ─── markdown ────────────────────────────────────────────────────────────────
const esc = s => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const cut = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
function countBy(list, fn) { const m = new Map(); list.forEach(x => { const k = fn(x); m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()]; }
function tally(rows, head) { return ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|'].concat(rows.map(r => '| ' + r.map(esc).join(' | ') + ' |')).join('\n'); }
const stopLabel = s => s.document ? '(document)' : (s.selector + (s.selectorUnique === false ? ' (not unique)' : ''));

function writeMarkdown(out) {
    const F = out.forward.stops, R = out.reverse.stops;
    const page = F.filter(s => !s.document);
    const L = [];
    L.push('# Keyboard focus order — Tab and Shift+Tab through the whole UI');
    L.push('');
    L.push('Generated ' + out.generated + ' by `prep/baseline/scripts/tab-order.js` (F4). Machine copy: `tab-order.json`. Notes, caveats and the `--check` result: `NOTES.md`.');
    L.push('');
    L.push('## Environment');
    L.push('');
    L.push(tally(Object.entries(out.env).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v]), ['Fact', 'Value']));
    L.push('');
    L.push('## Counts');
    L.push('');
    L.push('- forward (Tab) stops: **' + page.length + '** (' + F.length + ' records including the document marker), ended because: ' + out.forward.end.detail);
    L.push('- reverse (Shift+Tab) stops: **' + R.filter(s => !s.document).length + '**, ended because: ' + out.reverse.end.detail);
    L.push('- forward and reverse agree (reverse read backwards equals forward): **' + (out.symmetry.identical ? 'yes' : 'NO') + '**' + (out.symmetry.identical ? '' : ' — ' + out.symmetry.onlyForward.length + ' stop(s) only forward, ' + out.symmetry.onlyReverse.length + ' only reverse, first divergence at forward index ' + out.symmetry.firstDivergence));
    L.push('- role/name from the CDP accessibility tree: ' + page.filter(s => s.nameSource === 'cdp').length + '; page-side fallback: ' + page.filter(s => s.nameSource !== 'cdp').length);
    L.push('- `:focus-visible` true at: ' + page.filter(s => s.focusVisible === true).length + '/' + page.length + ' stops');
    L.push('- stops whose readable selector is not unique (the strict `path` in the JSON is): ' + page.filter(s => s.selectorUnique === false).length);
    L.push('- sections open for the walk: ' + out.sections.filter(s => s.ariaExpanded === 'true').length + '/' + out.sections.length + (out.allSectionsOpen ? ' (all)' : ' (NOT all, see problems)'));
    L.push('- F0 cross-check (`prep/baseline/dom/controls.json`): ' + (out.f0 ? out.f0.summary : 'controls.json not found, skipped'));
    if (out.slowdown && out.slowdown.beforeWalk) L.push('- governor slowdown button `#slowdownCell` (js/08a, would add underbar stops): before the walk ' + out.slowdown.beforeWalk.cell + ' (governor ' + out.slowdown.beforeWalk.governor + ')' + (out.slowdown.afterPicks ? ', after the picks ' + out.slowdown.afterPicks.cell + ' (governor ' + out.slowdown.afterPicks.governor + ')' : ''));
    L.push('');
    L.push('### Stops per surface (forward)');
    L.push('');
    L.push(tally(countBy(page, s => s.surface).map(([k, v]) => [k, v]), ['Surface', 'Stops']));
    L.push('');
    L.push('### Stops per role (forward)');
    L.push('');
    L.push(tally(countBy(page, s => s.role || '(none)').sort((a, b) => b[1] - a[1]), ['Role', 'Stops']));
    L.push('');
    L.push('### Stops per section (forward, in Tab order)');
    L.push('');
    L.push(tally(countBy(page, s => (s.section == null ? '(none)' : s.surface + ' › ' + s.section)), ['Surface › section', 'Stops']));
    L.push('');
    L.push('## What the skip menu does on the first Tab (js/66-skip-menu.js)');
    L.push('');
    const ft = out.firstTab;
    L.push('1. After the sections were opened by Shift-clicks and the canvas was clicked once: `document.activeElement` was **' + ft.afterCanvasClick.active + '**. The first Tab landed on **' + ft.afterCanvasClick.tab.landed + '** (skip menu open: ' + ft.afterCanvasClick.tab.menuOpen + (ft.afterCanvasClick.tab.menuOn ? ', on "' + ft.afterCanvasClick.tab.menuOn + '"' : '') + '). Reading: ' + ft.afterCanvasClick.reading);
    L.push('2. After Escape (js/66 forgets the remembered control and blurs): `document.activeElement` was **' + ft.afterEscape.active + '**. The first Tab landed on **' + ft.afterEscape.tab.landed + '** (skip menu open: ' + ft.afterEscape.tab.menuOpen + (ft.afterEscape.tab.menuOn ? ', on "' + ft.afterEscape.tab.menuOn + '"' : '') + '). Reading: ' + ft.afterEscape.reading);
    L.push('');
    if (ft.afterEscape.menu && ft.afterEscape.menu.built) {
        L.push('Skip menu buttons when it opened (region, label, aria-disabled, tabindex, aria-current), menu box ' + JSON.stringify(ft.afterEscape.menu.rect) + ':');
        L.push('');
        L.push(tally(ft.afterEscape.menu.buttons.map(b => [b.region, b.label, b.ariaDisabled, b.tabIndex, b.ariaCurrent || '']), ['Region', 'Label', 'aria-disabled', 'tabindex', 'aria-current']));
        L.push('');
    }
    L.push('### Where each skip-menu pick lands (Escape, Tab, arrow to the region, Enter)');
    L.push('');
    L.push(tally(out.picks.map(p => [p.region, p.arrow, p.onBeforeEnter || '', p.landed ? stopLabel(p.landed) : '(document)', p.landed && !p.landed.document ? p.landed.role : '', p.landed && !p.landed.document ? cut(p.landed.name, 50) : '', p.landed && !p.landed.document ? p.landed.surface : '', p.menuOpenAfter ? 'still open' : 'closed', p.landedClass ? 'yes' : 'no']),
        ['Region', 'Arrow', 'Focused option', 'Focus landed on', 'Role', 'Name', 'Surface', 'Menu after', '.skip-landed ring']));
    L.push('');
    L.push('## Past the ends');
    L.push('');
    L.push('- Forward: ' + out.forward.end.detail + '.' + (out.wrap.forward ? ' One more Tab from ' + out.wrap.forward.from + ' landed on **' + out.wrap.forward.landed + '** — ' + out.wrap.forward.reading : ''));
    L.push('- Reverse: ' + out.reverse.end.detail + '.' + (out.wrap.reverse ? ' One more Shift+Tab from ' + out.wrap.reverse.from + ' landed on **' + out.wrap.reverse.landed + '** — ' + out.wrap.reverse.reading + '.' : '') + (out.wrap.reverse2 ? ' One more Shift+Tab from there landed on **' + out.wrap.reverse2.landed + '** — ' + out.wrap.reverse2.reading + '.' : ''));
    L.push('- Reverse walk started from the last forward stop by: ' + out.reverse.startedBy);
    L.push('');
    if (!out.symmetry.identical) {
        L.push('## Forward / reverse differences');
        L.push('');
        L.push('Stops reached only going forward: ' + (out.symmetry.onlyForward.map(s => '`' + stopLabel(s) + '`').join(', ') || 'none'));
        L.push('');
        L.push('Stops reached only going backward: ' + (out.symmetry.onlyReverse.map(s => '`' + stopLabel(s) + '`').join(', ') || 'none'));
        L.push('');
    }
    if (out.f0 && out.f0.unreached.length) {
        L.push('## Focusable in the F0 dump but never reached by Tab');
        L.push('');
        L.push('Controls in `controls.json` that are rendered, enabled, `tabIndex >= 0`, not inside `aria-hidden`, not a label or container, and did not appear in the forward walk. Informational: some are built lazily or sit in popups; none of this is decided here.');
        L.push('');
        L.push(tally(out.f0.unreached.map(u => [u.order, u.surface, cut(u.section, 24), u.tag + (u.type && u.tag === 'input' ? '[' + u.type + ']' : ''), u.id ? '#' + u.id : '', cut(u.classes.join(' '), 40), u.role, cut(u.name, 40), u.tabIndexAttr == null ? '' : u.tabIndexAttr]), ['F0 #', 'Surface', 'Section', 'Element', 'id', 'Classes', 'Role', 'Name', 'tabindex']));
        L.push('');
    }
    if (out.f0 && out.f0.notInF0.length) {
        L.push('## Tab stops that are not in the F0 dump');
        L.push('');
        L.push(tally(out.f0.notInF0.map(s => [s.i, stopLabel(s), s.role, cut(s.name, 40), s.surface]), ['#', 'Selector', 'Role', 'Name', 'Surface']));
        L.push('');
    }
    if (out.problems.length) {
        L.push('## Problems during the run');
        L.push('');
        out.problems.forEach(p => L.push('- ' + p));
        L.push('');
    }
    L.push('## Existing suites that cover keyboard behaviour (run by F6, not here)');
    L.push('');
    L.push(tally([
        ['scripts/test/skip-menu/run.js', 'js/66 skip menu: first Tab opens it, Tab/Shift+Tab/arrows round its four places, Space/Enter pick, section titles take Tab/Enter/Space with aria-expanded, folded controls out of the Tab order, Ctrl+Shift+Tab, Esc, where-you-were after painting, focus kept through fold and focus mode'],
        ['scripts/test/focus-keys/run.js', 'js/05n Space gate + js/20 appConfirm + js/26 LayerTransform: Space presses a keyboard-focused control and freezes after a mouse press; confirm/alert Enter and Space; the folded left rail hands focus to Brush Size'],
        ['scripts/test/bar-keys/run.js', 'js/20 makeQubDropdown: the bottom bar resolution dropdowns as keyboard listboxes, no invisible Tab stops from the hidden native selects, focus rings'],
        ['scripts/test/dialog-focus/run.js', 'js/00b DialogFocus: Reset app, confirm, F1 sheet, palette delete, PhotoSafe take focus, trap Tab, close on Esc, return focus after a keyboard close; skip menu stays shut under them'],
        ['scripts/test/slider-keys/run.js', 'js/67 slider arrow steps (1% / Shift 10%), Home, focus kept, dialogs keep the arrows'],
        ['scripts/test/popup-focus/run.js', 'js/00b popup(): Presets, More, colour popover, room menus take focus from the keyboard, Esc returns to the trigger, Tab out closes, mouse-opened leaves focus alone']
    ], ['Suite', 'What it checks']));
    L.push('');
    L.push('## Forward order (Tab), every stop');
    L.push('');
    L.push('Columns: #; surface; section (`.sidebar-section` title or `.mixer-channel` label); region (js/66: left/top/right/bottom); element (tag[type]); selector (readable; `*` = not unique, see `path` in the JSON); role; name (c = CDP AX tree, f = page fallback); F0 order (`controls.json` index); `:focus-visible`.');
    L.push('');
    const head = ['#', 'Surface', 'Section', 'Region', 'Element', 'Selector', 'Role', 'Name', 'F0 #', 'fv'];
    L.push('| ' + head.join(' | ') + ' |');
    L.push('|' + head.map(() => '---').join('|') + '|');
    for (const s of F) {
        if (s.document) { L.push('| ' + [s.i, '', '', '', '', '(document: focus left the page)', '', '', '', ''].map(esc).join(' | ') + ' |'); continue; }
        L.push('| ' + [s.i, s.surface, cut(s.section, 24), s.region || '', s.tag + (s.tag === 'input' ? '[' + s.type + ']' : ''), cut(s.selector, 70) + (s.selectorUnique === false ? ' *' : ''), s.role, cut(s.name, 48) + (s.nameSource === 'cdp' ? ' (c)' : ' (f)'), s.f0Order >= 0 ? s.f0Order : '', s.focusVisible === true ? 'Y' : (s.focusVisible === false ? 'N' : '?')].map(esc).join(' | ') + ' |');
    }
    L.push('');
    L.push('## Reverse order (Shift+Tab), every stop');
    L.push('');
    L.push('| ' + ['#', 'Surface', 'Section', 'Element', 'Selector', 'Role', 'Name'].join(' | ') + ' |');
    L.push('|---|---|---|---|---|---|---|');
    for (const s of R) {
        if (s.document) { L.push('| ' + [s.i, '', '', '', '(document: focus left the page)', '', ''].map(esc).join(' | ') + ' |'); continue; }
        L.push('| ' + [s.i, s.surface, cut(s.section, 24), s.tag + (s.tag === 'input' ? '[' + s.type + ']' : ''), cut(s.selector, 70) + (s.selectorUnique === false ? ' *' : ''), s.role, cut(s.name, 48)].map(esc).join(' | ') + ' |');
    }
    L.push('');
    return L.join('\n');
}

// ─── --check projection ──────────────────────────────────────────────────────
// What a re-run must reproduce: the order itself (selector, strict path, tag,
// id, role, name, surface, section, region of every stop in both directions),
// how each walk ended, what the first Tab did, where the skip menu's picks
// landed. Not compared: env, rect/inViewport/barScroll (diagnostic: the bars
// scroll as focus moves and #sidebar-right scrolls smoothly), focusVisible (a
// UA heuristic, reported but F3 owns the a11y gate), text, aria state bags,
// F0 indexes.
function projectStop(s) {
    if (s.document) return { document: true };
    return { selector: s.selector, path: s.path, tag: s.tag, type: s.type, id: s.id, role: s.role, name: s.name, surface: s.surface, section: s.section, region: s.region, menuOpen: s.menuOpen };
}
function project(json) {
    const ft = json.firstTab || {};
    const pick = p => ({ region: p.region, onBeforeEnter: p.onBeforeEnter, landed: p.landed ? projectStop(p.landed) : null, menuOpenAfter: p.menuOpenAfter });
    return {
        sectionsOpen: (json.sections || []).map(s => [s.title, s.ariaExpanded]),
        firstTab: {
            afterCanvasClick: ft.afterCanvasClick ? { active: ft.afterCanvasClick.active, landed: ft.afterCanvasClick.tab.landed, menuOpen: ft.afterCanvasClick.tab.menuOpen, menuOn: ft.afterCanvasClick.tab.menuOn } : null,
            afterEscape: ft.afterEscape ? { active: ft.afterEscape.active, landed: ft.afterEscape.tab.landed, menuOpen: ft.afterEscape.tab.menuOpen, menuOn: ft.afterEscape.tab.menuOn, off: ft.afterEscape.menu && ft.afterEscape.menu.off, here: ft.afterEscape.menu && ft.afterEscape.menu.here } : null
        },
        // An aborted run (end null, no stops) projects to nulls and empty
        // lists, so --check reports the difference instead of throwing.
        forward: { end: json.forward && json.forward.end ? json.forward.end.why : null, stops: ((json.forward && json.forward.stops) || []).map(projectStop) },
        reverse: { end: json.reverse && json.reverse.end ? json.reverse.end.why : null, stops: ((json.reverse && json.reverse.stops) || []).map(projectStop) },
        wrap: { forward: json.wrap && json.wrap.forward ? json.wrap.forward.landed : null, reverse: json.wrap && json.wrap.reverse ? json.wrap.reverse.landed : null, reverse2: json.wrap && json.wrap.reverse2 ? json.wrap.reverse2.landed : null },
        picks: (json.picks || []).map(pick)
    };
}
function diff(a, b, pathStr, out) {
    if (out.length > 200) return;
    if (a === b) return;
    if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') { out.push(pathStr + ': ' + JSON.stringify(a) + ' -> ' + JSON.stringify(b)); return; }
    if (Array.isArray(a) !== Array.isArray(b)) { out.push(pathStr + ': type differs'); return; }
    if (Array.isArray(a)) {
        if (a.length !== b.length) out.push(pathStr + ': length ' + a.length + ' -> ' + b.length);
        const n = Math.min(a.length, b.length);
        for (let i = 0; i < n; i++) diff(a[i], b[i], pathStr + '[' + i + ']', out);
        return;
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) diff(a[k], b[k], pathStr + '.' + k, out);
}

// ─── main ────────────────────────────────────────────────────────────────────
(async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const started = new Date();
    let head = null;
    try { head = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch (_) { head = '(git unavailable)'; }
    log('booting headless Chrome through scripts/test/radial-menu/driver.js ...');
    // Same seed as F0: the one-time Reset-app note (js/60-reset-app.js, ~4 s
    // after a quiet boot, 30 s long) would otherwise add a Tab stop or not
    // depending on timing.
    const d = await boot({ seed: { 'swirlResetHint.v1': '1' } });
    const out = { generated: started.toISOString(), env: {}, sections: [], sectionOpenLog: [], allSectionsOpen: false, scrollReset: null, slowdown: null, settle: null, firstTab: null,
        forward: { stops: [], end: null }, reverse: { stops: [], end: null, startedBy: null }, wrap: {}, symmetry: null, picks: [], f0: null, problems: [], pageExceptions: [] };
    try {
        const anims = await waitAnimations(d, 5000);
        if (anims !== 0) problem('entrance animations still running after 5 s (getAnimations().length = ' + anims + ')');
        await sleep(300);

        const ver = await d.send('Browser.getVersion');
        const pageEnv = await d.ev(`(function(){ return { innerWidth: innerWidth, innerHeight: innerHeight, dpr: devicePixelRatio,
            uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim() || null, url: location.href,
            titlebarVisible: !!(document.getElementById('custom-titlebar') && document.getElementById('custom-titlebar').getClientRects().length),
            leftFolded: !!(window.Sidebars && window.Sidebars.left && window.Sidebars.left.isCollapsed()), rightFolded: !!(window.Sidebars && window.Sidebars.right && window.Sidebars.right.isCollapsed()),
            scriptsReady: !!window.__scriptsReady, skipMenuBuilt: !!document.getElementById('skipMenu') }; })()`);
        out.env = Object.assign({ date: started.toISOString(), headCommit: head, chrome: ver.product, userAgent: ver.userAgent, protocol: ver.protocolVersion, node: process.version,
            build: 'web build in headless Chrome (driver window 1600x900, scratch profile)', maxTabs: MAX_TABS, input: 'trusted Input.dispatchKeyEvent (driver tap), Tab = key Tab / code Tab / vk 9, Shift modifier for the reverse walk' }, pageEnv);
        log('env: ' + ver.product + ', viewport ' + pageEnv.innerWidth + 'x' + pageEnv.innerHeight + ' @' + pageEnv.dpr + ', --ui-scale ' + pageEnv.uiScale + ', HEAD ' + head.slice(0, 7));
        if (!pageEnv.scriptsReady) problem('window.__scriptsReady is not set; js/66 ignores Tab until it is');

        await d.ev(PAGE_LIB);
        await d.send('DOM.enable');
        await d.send('Accessibility.enable');

        // ── Open everything, as F0 does ──
        out.sections = await d.ev('window.__to.sections()');
        if (pageEnv.leftFolded) {
            const r = await centreOf(d, `document.querySelector('#sidebar-left .lsb-rail-label')`);
            if (r) { await d.click(r.x, r.y); await sleep(300); }
            const still = await d.ev('window.Sidebars.left.isCollapsed()');
            out.sectionOpenLog.push({ domOrder: -1, title: '(left sidebar)', action: 'folded at boot; clicked .lsb-rail-label', ok: !still });
            if (still) problem('left sidebar stayed folded after clicking its rail label');
        }
        if (pageEnv.rightFolded) problem('right sidebar is folded at 1600 px wide; sections may not open');
        for (const s of out.sections) {
            const entry = { domOrder: s.domOrder, side: s.side, title: s.title, action: '', ok: false };
            if (!s.collapsed) { entry.action = 'already open at boot'; entry.ok = true; out.sectionOpenLog.push(entry); continue; }
            if (s.displayNone || s.hiddenAttr) { entry.action = 'hidden at boot, not opened'; out.sectionOpenLog.push(entry); problem('section "' + s.title + '" is hidden at boot and was not opened'); continue; }
            await centreOf(d, `window.__to.sectionAt(${s.domOrder}).querySelector('.section-title')`);
            await sleep(80);
            const r2 = await centreOf(d, `window.__to.sectionAt(${s.domOrder}).querySelector('.section-title')`);
            let how = 'trusted Shift-click on .section-title';
            if (r2 && r2.visible) await shiftClick(d, r2.x, r2.y); else how = 'title not visible; ';
            await sleep(250);
            let exp = await d.ev(`window.__to.sectionAt(${s.domOrder}).querySelector('.section-title').getAttribute('aria-expanded')`);
            if (exp !== 'true') {
                await d.ev(`(function(){ var sec = window.__to.sectionAt(${s.domOrder}); sec.querySelector('.section-header').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true })); return 1; })()`);
                await sleep(250);
                exp = await d.ev(`window.__to.sectionAt(${s.domOrder}).querySelector('.section-title').getAttribute('aria-expanded')`);
                how += 'synthetic Shift-click on .section-header (the trusted click did not open it)';
            }
            entry.action = how; entry.ok = exp === 'true';
            if (!entry.ok) problem('section "' + s.title + '" (' + s.side + ') would not open (aria-expanded=' + exp + ')');
            out.sectionOpenLog.push(entry);
        }
        await sleep(500);
        out.sections = await d.ev('window.__to.sections()');
        out.allSectionsOpen = out.sections.every(s => s.ariaExpanded === 'true' && !s.collapsed);
        log('sections open: ' + out.sections.filter(s => s.ariaExpanded === 'true').length + '/' + out.sections.length + (out.allSectionsOpen ? ' (all)' : ' (NOT all)'));
        if (!out.allSectionsOpen) problem('not every section reports aria-expanded="true": ' + out.sections.filter(s => s.ariaExpanded !== 'true').map(s => s.title).join(', '));
        // Both bars back to the top, instantly (css/21 scroll-behavior: smooth would animate).
        const scrolled = await d.ev(`(function(){ var out = window.__to.barScroll(); ['#sidebar-left', '#sidebar-right'].forEach(function (s) { var bar = document.querySelector(s); if (!bar) return;
            [bar].concat(Array.prototype.slice.call(bar.querySelectorAll('*'))).forEach(function (el) { if (el.scrollTop > 0) { var prev = el.style.scrollBehavior; el.style.scrollBehavior = 'auto'; el.scrollTop = 0; el.style.scrollBehavior = prev; } }); }); return out; })()`);
        await sleep(400);
        const stillScrolled = await d.ev('window.__to.barScroll()');
        out.scrollReset = { before: scrolled, after: stillScrolled };
        if (Object.values(stillScrolled).some(a => a.length)) problem('a sidebar scroller did not return to the top before the walk: ' + JSON.stringify(stillScrolled));

        out.slowdown = { beforeWalk: await d.ev('window.__to.slowdown()') };
        if (out.slowdown.beforeWalk.cell === 'shown') problem('the governor\'s slowdown button (#slowdownCell) is shown before the walk: it adds Tab stops to the underbar (js/08a-quality-governor.js)');

        // ── Settle focus: one trusted click on the canvas ──
        const canvas = await d.ev(`(function(){ var c = document.getElementById('canvas') || document.querySelector('#canvas-area canvas'); var r = c.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), tabIndex: c.tabIndex, id: c.id }; })()`);
        const beforeClick = await readActive(d);
        await d.click(canvas.x, canvas.y);
        await sleep(300);
        const afterClick = await readActive(d);
        out.settle = { canvas, activeBeforeClick: beforeClick.body ? '(document)' : beforeClick.selector, activeAfterClick: afterClick.body ? '(document)' : afterClick.selector };
        log('settle: before the canvas click focus was on ' + out.settle.activeBeforeClick + ', after it ' + out.settle.activeAfterClick);

        // ── First Tab, twice: straight after the click, then after Escape ──
        const describeLanding = (info) => ({ landed: info.body ? '(document)' : info.selector, role: info.body ? null : info.role, name: info.body ? null : info.name, surface: info.body ? null : info.surface, menuOpen: !!(info.menu && info.menu.open), menuOn: info.menu ? info.menu.on : null, menu: info.menu });
        const t1 = await pressTab(d, false);
        const l1 = describeLanding(t1);
        let reading1;
        if (l1.menuOpen) reading1 = 'the skip menu opened (nothing was remembered as "where you were")';
        else if (!t1.body && beforeClick && !beforeClick.body && t1.seenIndex === beforeClick.seenIndex) reading1 = 'js/66 "where you were": the canvas click took focus off the last control the mouse had focused (the last section title Shift-clicked), and Tab went back to it instead of opening the menu';
        else reading1 = 'Tab walked on natively from ' + out.settle.activeAfterClick;
        out.firstTab = { afterCanvasClick: { active: out.settle.activeAfterClick, tab: l1, reading: reading1 } };
        log('first Tab after the canvas click: ' + l1.landed + ' (menu open ' + l1.menuOpen + ')');
        // Escape: js/66 forgets the remembered control and blurs (unless a dialog or text field has it).
        const e1 = await pressKey(d, 'esc');
        const afterEsc = e1.body ? '(document)' : e1.selector;
        const t2 = await pressTab(d, false);
        const l2 = describeLanding(t2);
        const reading2 = l2.menuOpen ? 'the skip menu opened on "' + l2.menuOn + '" (js/66 open(): Tab with nothing focused and nothing remembered goes to the menu; it is the body\'s first child and the first Tab stop)' : 'the skip menu did NOT open; Tab landed on ' + l2.landed;
        out.firstTab.afterEscape = { active: afterEsc, tab: l2, reading: reading2 };
        log('Escape, then first Tab: ' + l2.landed + ' (menu open ' + l2.menuOpen + ', on ' + l2.menuOn + ', off ' + JSON.stringify(l2.menu && l2.menu.off) + ')');
        if (!l2.menuOpen) problem('the skip menu did not open on Tab after Escape; the forward walk starts from ' + l2.landed + ' instead');

        // ── Forward walk ──
        log('forward walk (Tab) ...');
        const fw = await walk(d, false, 'forward');
        out.forward = fw;
        log('forward: ' + fw.stops.filter(s => !s.document).length + ' stops; ' + fw.end.detail);
        // Past the end: what one more Tab does from wherever the walk ended.
        {
            const lastStop = fw.stops.filter(s => !s.document).slice(-1)[0];
            const before = await readActive(d);
            const probe = await pressTab(d, false);
            const landed = probe.body ? '(document)' : probe.selector;
            const reading = readingFor(probe, before, fw.stops[0], lastStop, false);
            out.wrap.forward = { from: before.body ? '(document)' : before.selector, landed, reading, menuOpen: !!(probe.menu && probe.menu.open) };
            log('one more Tab past the end: ' + landed + ' — ' + reading);
        }

        // ── Reverse walk, from the last forward stop ──
        const lastStop = fw.stops.filter(s => !s.document).slice(-1)[0];
        let cur = await readActive(d);
        if (!cur.body && lastStop && cur.seenIndex === lastStop.seenIndex) out.reverse.startedBy = 'the Tab past the end (js/66) already put focus back on it';
        else {
            await d.ev(`(function(){ var el = window.__to.seen[${lastStop.seenIndex}]; if (el && el.focus) el.focus(); return 1; })()`);
            await sleep(150);
            cur = await readActive(d);
            out.reverse.startedBy = 'script focus() on the last forward stop (focus was on ' + (cur.body ? '(document)' : cur.selector) + ' before)';
            if (cur.body || cur.seenIndex !== lastStop.seenIndex) problem('could not put focus on the last forward stop to start the reverse walk');
        }
        log('reverse walk (Shift+Tab) from ' + (cur.body ? '(document)' : cur.selector) + ' ...');
        const rv = await walk(d, true, 'reverse');
        out.reverse.stops = rv.stops; out.reverse.end = rv.end;
        log('reverse: ' + rv.stops.filter(s => !s.document).length + ' stops; ' + rv.end.detail);
        // Did the reverse walk reach the first forward stop? Then two more
        // Shift+Tabs from wherever it ended (the document, when the browser
        // let focus out past the first stop), each read against js/66's rules.
        const firstStop = fw.stops[0];
        const rvLast = rv.stops.filter(s => !s.document).slice(-1)[0];
        if (rvLast && firstStop && rvLast.seenIndex === firstStop.seenIndex) {
            const b1 = await readActive(d);
            const p1 = await pressTab(d, true);
            out.wrap.reverse = { from: b1.body ? '(document)' : b1.selector, landed: p1.body ? '(document)' : p1.selector, reading: readingFor(p1, b1, firstStop, lastStop, true), menuOpen: !!(p1.menu && p1.menu.open) };
            const p2 = await pressTab(d, true);
            out.wrap.reverse2 = { from: out.wrap.reverse.landed, landed: p2.body ? '(document)' : p2.selector, reading: readingFor(p2, p1, firstStop, lastStop, true), menuOpen: !!(p2.menu && p2.menu.open) };
            log('past the beginning: ' + out.wrap.reverse.landed + ' (' + out.wrap.reverse.reading + ') then ' + out.wrap.reverse2.landed + ' (' + out.wrap.reverse2.reading + ')');
        } else problem('the reverse walk did not come back to the first forward stop (' + (firstStop && firstStop.selector) + '); it ended at ' + (rvLast && rvLast.selector));

        // ── Symmetry ──
        const fKeys = fw.stops.filter(s => !s.document).map(s => s.path);
        const rKeys = rv.stops.filter(s => !s.document).map(s => s.path).slice().reverse();
        const fSet = new Set(fKeys), rSet = new Set(rKeys);
        let firstDiv = -1;
        for (let i = 0; i < Math.max(fKeys.length, rKeys.length); i++) if (fKeys[i] !== rKeys[i]) { firstDiv = i; break; }
        out.symmetry = { identical: firstDiv < 0, firstDivergence: firstDiv,
            onlyForward: fw.stops.filter(s => !s.document && !rSet.has(s.path)), onlyReverse: rv.stops.filter(s => !s.document && !fSet.has(s.path)) };
        log('symmetry: ' + (out.symmetry.identical ? 'reverse equals forward backwards' : 'DIFFERENT (first divergence at forward index ' + firstDiv + ', ' + out.symmetry.onlyForward.length + ' only forward, ' + out.symmetry.onlyReverse.length + ' only reverse)'));

        // ── The skip menu's four picks ──
        const ARROW = { left: 'left', top: 'up', right: 'right', bottom: 'down' };
        for (const region of ['left', 'top', 'right', 'bottom']) {
            const rec = { region, arrow: 'Arrow' + ARROW[region][0].toUpperCase() + ARROW[region].slice(1), onBeforeEnter: null, landed: null, menuOpenAfter: null, landedClass: null };
            try {
                // Off whatever has focus, Esc (forget), Tab (menu on Left), arrow, Enter.
                await d.ev('document.activeElement && document.activeElement.blur && document.activeElement.blur(), 1');
                await pressKey(d, 'esc');
                const m = await pressTab(d, false);
                if (!(m.menu && m.menu.open)) { problem('pick ' + region + ': the menu did not open on Tab'); rec.onBeforeEnter = '(menu did not open)'; out.picks.push(rec); continue; }
                const a = await pressKey(d, ARROW[region]);
                rec.onBeforeEnter = a.menu ? a.menu.on : null;
                const l = await pressKey(d, 'enter', '\r');
                rec.landed = stopFrom(l, 0);
                rec.menuOpenAfter = !!(l.menu && l.menu.open);
                rec.landedClass = await d.ev(`!!document.querySelector('.skip-landed')`);
                log('pick ' + region + ': option "' + rec.onBeforeEnter + '", Enter -> ' + (l.body ? '(document)' : l.selector + ' [' + l.role + ' "' + l.name + '"]'));
            } catch (e) { problem('pick ' + region + ': ' + (e.message || e)); }
            out.picks.push(rec);
        }
        await d.ev('document.activeElement && document.activeElement.blur && document.activeElement.blur(), 1');
        out.slowdown.afterPicks = await d.ev('window.__to.slowdown()');
        if (out.slowdown.afterPicks.cell === 'shown') problem('the governor\'s slowdown button (#slowdownCell) appeared during the run (js/08a-quality-governor.js); the walk may hold extra underbar stops');
        log('governor slowdown button: before the walk ' + out.slowdown.beforeWalk.cell + ' (' + out.slowdown.beforeWalk.governor + '), after the picks ' + out.slowdown.afterPicks.cell + ' (' + out.slowdown.afterPicks.governor + ')');

        // ── Cross-check against F0 ──
        if (fs.existsSync(F0_PATH)) {
            const f0 = JSON.parse(fs.readFileSync(F0_PATH, 'utf8'));
            const reached = new Set(fw.stops.filter(s => !s.document && s.f0Order >= 0).map(s => s.f0Order));
            const mismatches = [];
            fw.stops.filter(s => !s.document && s.f0Order >= 0).forEach(s => {
                const c = f0.controls[s.f0Order];
                if (!c || c.tag !== s.tag || (c.id || null) !== (s.id || null)) mismatches.push({ i: s.i, selector: s.selector, f0Order: s.f0Order, f0: c ? c.tag + '#' + c.id : null });
            });
            const unreached = f0.controls.filter(c => c.tabIndex >= 0 && c.visibleNow && !c.inAriaHidden && !c.disabled && c.tag !== 'label'
                && !c.classes.includes('sidebar-section') && !c.classes.includes('mixer-channel') && !reached.has(c.order))
                .map(c => ({ order: c.order, surface: c.surface, section: c.section, tag: c.tag, type: c.type, id: c.id, classes: c.classes, role: c.role, name: c.name, tabIndexAttr: c.tabIndexAttr }));
            const notInF0 = fw.stops.filter(s => !s.document && s.f0Order < 0);
            out.f0 = { file: path.relative(ROOT, F0_PATH), f0Controls: f0.controls.length, f0Head: f0.env && f0.env.headCommit, mismatches, unreached, notInF0,
                summary: fw.stops.filter(s => !s.document && s.f0Order >= 0).length + ' of ' + fw.stops.filter(s => !s.document).length + ' stops index into controls.json (' + mismatches.length + ' tag/id mismatch' + (mismatches.length === 1 ? '' : 'es') + '); ' + unreached.length + ' rendered, enabled, tabIndex>=0 F0 controls were never reached; ' + notInF0.length + ' stops are not in F0' };
            if (mismatches.length) problem(mismatches.length + ' stop(s) index a different element in controls.json (F0 and F4 DOM differ?): ' + mismatches.slice(0, 5).map(m => m.selector + ' vs ' + m.f0).join(', '));
            log('F0 cross-check: ' + out.f0.summary);
        } else log('F0 controls.json not found; cross-check skipped');

        out.pageExceptions = d.events.filter(m => m.method === 'Runtime.exceptionThrown').map(m => (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text).slice(0, 20);
        if (out.pageExceptions.length) problem(out.pageExceptions.length + ' page exception(s) during the run; first: ' + out.pageExceptions[0].split('\n')[0]);
    } catch (err) {
        problem('run aborted: ' + (err && err.stack || err));
    } finally {
        await d.close();
    }
    out.problems = problems.slice();
    fs.writeFileSync(path.join(OUT_DIR, 'tab-order.json'), JSON.stringify(out, null, 1));
    fs.writeFileSync(path.join(OUT_DIR, 'tab-order.md'), writeMarkdown(out));
    log('wrote ' + path.relative(ROOT, path.join(OUT_DIR, 'tab-order.json')) + ' (' + out.forward.stops.filter(s => !s.document).length + ' forward stops, ' + out.reverse.stops.filter(s => !s.document).length + ' reverse stops) and tab-order.md');

    if (CHECK) {
        const basePath = path.join(BASE_DIR, 'tab-order.json');
        if (!fs.existsSync(basePath)) { console.log('CHECK: no baseline at ' + basePath); process.exit(1); }
        const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
        const diffs = [];
        diff(project(base), project(out), 'tab-order', diffs);
        if (diffs.length) {
            console.log('CHECK FAIL: ' + diffs.length + ' difference(s) against ' + path.relative(ROOT, basePath));
            diffs.slice(0, 60).forEach(x => console.log('  ' + x));
            if (diffs.length > 60) console.log('  ... ' + (diffs.length - 60) + ' more');
            process.exit(1);
        }
        console.log('CHECK PASS: ' + out.forward.stops.filter(s => !s.document).length + ' forward and ' + out.reverse.stops.filter(s => !s.document).length + ' reverse stops, the first-Tab behaviour, the ends and the 4 skip-menu picks identical to the baseline');
    }
    // A capture with problems still exits 0: the problems are data for NOTES.md.
    process.exit(0);
})();
