// prep/baseline/scripts/a11y.js — F3 baseline: axe-core over every surface of
// the shipping UI, plus the hand-written role / name / state / keyboard list of
// every control, for the Walnut & Copper prep (prep/briefs/F-baselines.md, F3).
// This script decides nothing and changes nothing outside prep/.
//
//   node prep/baseline/scripts/a11y.js            capture -> prep/baseline/a11y/
//   node prep/baseline/scripts/a11y.js --check    re-capture into prep/work/a11y-check/
//                                                 and diff against the baseline:
//                                                 exit 1 on any NEW axe violation
//                                                 (rule + target) or any change of a
//                                                 control's role, name or state
//
// Boots the web build in its own headless Chrome through the repo driver
// (scripts/test/radial-menu/driver.js: own static server, scratch profile with
// PhotoSafe / the startup fork / the first-run hint already answered), opens
// everything the way F0 (prep/scripts/dom-dump.js) does — left bar unfolded,
// every sidebar section Shift-clicked open with trusted input — then:
//
//   1. injects the vendored axe-core (prep/baseline/vendor/axe.min.js) and runs
//      axe.run(document, { resultTypes: ['violations', 'incomplete'] }) with the
//      default rule set (no runOnly, so WCAG 2.x A/AA plus axe best practices)
//      over the page with everything open;
//   2. opens each overlay / popover in turn — the F1 hotkey sheet, the E radial
//      menu, the colour picker popover, the Presets panel, the arm-tip menu —
//      runs axe over the whole document again with it open, records the
//      violations that are new against the main run, and closes it (Escape);
//   3. enumerates every interactive element (the F0 selector, verbatim) with
//      role and name from the CDP accessibility tree (Accessibility.getFullAXTree
//      joined on backendDOMNodeId, page-side fallback when a node is ignored),
//      and, in capture mode, derives controls-a11y from prep/baseline/dom/
//      controls.json + lazy-*.json (the F0 record), cross-checking the live
//      computation against it; the keyboard pattern per control is a static
//      table keyed on tag / type / role / class with the handler's file:line.
//
// Nothing here calls an app setter that persists (GUIDANCE.md §2b): the only
// state changes are trusted clicks and keys on real controls inside the scratch
// profile, which the driver deletes on close. One Chrome, closed in finally.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { boot, sleep } = require('../../../scripts/test/radial-menu/driver');

const ROOT = path.resolve(__dirname, '../../..');
const BASE_DIR = path.join(ROOT, 'prep', 'baseline', 'a11y');
const DOM_DIR = path.join(ROOT, 'prep', 'baseline', 'dom');
const AXE_PATH = path.join(ROOT, 'prep', 'baseline', 'vendor', 'axe.min.js');
const CHECK = process.argv.includes('--check');
const OUT_DIR = CHECK ? path.join(ROOT, 'prep', 'work', 'a11y-check') : BASE_DIR;

// The F0 selector, verbatim, plus the three container classes.
const SEL = 'button, input, select, textarea, a[href], [role], [tabindex], [contenteditable], summary, label, .section-title, .mixer-channel, .sidebar-section';

const problems = [];
function problem(msg) { problems.push(msg); console.log('PROBLEM ' + msg); }
function log(msg) { console.log(msg); }

// ─── page-side library ───────────────────────────────────────────────────────
// The F0 record logic (prep/scripts/dom-dump.js PAGE_LIB), trimmed to what the
// a11y list needs, plus a stable CSS selector per element and the axe slimmer.
const PAGE_LIB = `(function () {
    var D = window.__a11y = window.__a11y || {};
    D.SEL = ${JSON.stringify(SEL)};
    D.mainSet = new WeakSet();
    D.visible = function (el) {
        if (!el || !el.getClientRects || !el.getClientRects().length) return false;
        return getComputedStyle(el).visibility !== 'hidden';
    };
    D.text = function (el, max) {
        var t = (el && el.textContent || '').replace(/\\s+/g, ' ').trim();
        return t.length > max ? t.slice(0, max) + '\\u2026' : t;
    };
    D.surfaceOf = function (el) {
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
    D.sectionTitle = function (sec) { var t = sec.querySelector('.section-title'); return t ? D.text(t, 60) : null; };
    D.channelLabel = function (ch) {
        if (ch.dataset.uiLabel) return ch.dataset.uiLabel;
        var l = ch.querySelector('.ch-label');
        if (l && !l.querySelector('select')) { var t = D.text(l, 60); if (t) return t; }
        return ch.dataset.uiKey || ch.getAttribute('aria-label') || ch.title || null;
    };
    D.sectionOf = function (el) {
        var sec = el.closest('.sidebar-section');
        if (sec) return D.sectionTitle(sec);
        var ch = el.closest('.mixer-channel');
        if (ch) return D.channelLabel(ch);
        return null;
    };
    D.implicitRole = function (el) {
        var t = el.tagName.toLowerCase();
        if (t === 'button') return 'button';
        if (t === 'a') return el.hasAttribute('href') ? 'link' : 'generic';
        if (t === 'select') return (el.multiple || el.size > 1) ? 'listbox' : 'combobox';
        if (t === 'textarea') return 'textbox';
        if (t === 'summary') return 'DisclosureTriangle';
        if (t === 'label') return 'LabelText';
        if (/^h[1-6]$/.test(t)) return 'heading';
        if (t === 'img') return 'img';
        if (t === 'input') {
            var ty = (el.getAttribute('type') || 'text').toLowerCase();
            var map = { checkbox: 'checkbox', radio: 'radio', range: 'slider', number: 'spinbutton', color: 'ColorWell',
                search: 'searchbox', file: 'button', submit: 'button', reset: 'button', button: 'button', image: 'button',
                hidden: 'none', email: 'textbox', url: 'textbox', tel: 'textbox', password: 'textbox', text: 'textbox' };
            return map[ty] || 'textbox';
        }
        return 'generic';
    };
    D.fallbackName = function (el) {
        var lb = el.getAttribute('aria-labelledby');
        if (lb) {
            var parts = lb.split(/\\s+/).map(function (id) { var e = document.getElementById(id); return e ? D.text(e, 120) : ''; }).filter(Boolean);
            if (parts.length) return parts.join(' ');
        }
        var al = el.getAttribute('aria-label');
        if (al && al.trim()) return al.trim();
        if (el.classList.contains('sidebar-section')) return D.sectionTitle(el) || '';
        if (el.classList.contains('mixer-channel')) return D.channelLabel(el) || '';
        var t = el.tagName.toLowerCase();
        if (t === 'input' || t === 'select' || t === 'textarea') {
            if (el.id) { var lf = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (lf) return D.text(lf, 120); }
            var w = el.closest('label'); if (w) return D.text(w, 120);
            if (el.placeholder) return el.placeholder;
            if (el.title) return el.title;
            return '';
        }
        var txt = D.text(el, 120);
        if (txt) return txt;
        var img = el.querySelector('img[alt]');
        if (img && img.alt) return img.alt;
        return el.title || '';
    };
    // A selector that names the element without its state: #id when unique,
    // else tag.firstStableClass:nth-of-type up to the nearest unique id.
    var STATE_CLASS = /^(active|collapsed|open|latched|selected|checked|disabled|holding|menu-open|editing|show|hidden|sel|on|off|is-.*|has-.*|cp-open|folded|ui-enter.*|playing|recording|armed|pressed|dragging|focus.*|hover.*)$/;
    D.stableClass = function (el) {
        var cs = (el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean);
        for (var i = 0; i < cs.length; i++) if (!STATE_CLASS.test(cs[i])) return cs[i];
        return null;
    };
    D.uniqueId = function (el) { return !!(el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1); };
    // A non-state class that only this element carries (body-mounted popups
    // such as .cp-pop or .mixer-presets-panel have one), so the path need not
    // count body's children.
    D.uniqueClass = function (el) {
        var cs = (el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean);
        for (var i = 0; i < cs.length; i++) if (!STATE_CLASS.test(cs[i]) && document.getElementsByClassName(cs[i]).length === 1) return cs[i];
        return null;
    };
    D.cssPath = function (el) {
        var parts = [];
        var cur = el;
        while (cur && cur !== document.body && cur.nodeType === 1) {
            if (D.uniqueId(cur)) { parts.unshift('#' + CSS.escape(cur.id)); return parts.join(' > '); }
            var tag = cur.tagName.toLowerCase();
            var uc = D.uniqueClass(cur);
            if (uc) { parts.unshift(tag + '.' + CSS.escape(uc)); return parts.join(' > '); }
            var seg = tag;
            var cls = D.stableClass(cur);
            if (cls) seg += '.' + CSS.escape(cls);
            var p = cur.parentElement;
            if (p) {
                var same = Array.prototype.filter.call(p.children, function (s) { return s.tagName === cur.tagName; });
                if (same.length > 1) seg += ':nth-of-type(' + (same.indexOf(cur) + 1) + ')';
            }
            parts.unshift(seg);
            cur = p;
        }
        return 'body > ' + parts.join(' > ');
    };
    D.record = function (el, i) {
        var tag = el.tagName.toLowerCase();
        var aria = {};
        Array.prototype.forEach.call(el.attributes, function (a) { if (a.name.indexOf('aria-') === 0) aria[a.name] = a.value; });
        var rec = {
            order: i,
            surface: D.surfaceOf(el),
            section: D.sectionOf(el),
            tag: tag,
            type: (tag === 'input' || tag === 'button') ? (el.getAttribute('type') || (tag === 'input' ? 'text' : 'submit')).toLowerCase() : null,
            id: el.id || null,
            classes: (el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean),
            selector: D.cssPath(el),
            role: null, name: null, nameSource: null,
            roleAttr: el.getAttribute('role'),
            roleFallback: D.implicitRole(el),
            nameFallback: D.fallbackName(el),
            aria: aria,
            tabIndex: el.tabIndex,
            tabIndexAttr: el.getAttribute('tabindex'),
            hiddenAttr: el.hidden,
            inAriaHidden: !!el.closest('[aria-hidden="true"]'),
            visibleNow: D.visible(el),
            text: D.text(el, 80)
        };
        if (tag === 'input' || tag === 'select' || tag === 'textarea') {
            rec.disabled = !!el.disabled;
            rec.readOnly = !!el.readOnly;
            if (tag === 'input' && (el.type === 'checkbox' || el.type === 'radio')) rec.checked = el.checked;
        }
        if (tag === 'button') rec.disabled = !!el.disabled;
        if (aria['aria-disabled'] === 'true') rec.disabled = true;
        if (el.isContentEditable) rec.contentEditable = true;
        if (tag === 'label') rec.htmlFor = el.getAttribute('for');
        return rec;
    };
    D.list = function (rootSel) {
        var root = rootSel ? document.querySelector(rootSel) : document;
        if (!root) return null;
        var list = Array.prototype.slice.call(root.querySelectorAll(D.SEL));
        var rootIncluded = false;
        if (rootSel && root.matches && root.matches(D.SEL)) { list.unshift(root); rootIncluded = true; }
        return { els: list, rootIncluded: rootIncluded };
    };
    D.collect = function (rootSel) {
        var L = D.list(rootSel);
        if (!L) return null;
        return { rootIncluded: L.rootIncluded, records: L.els.map(function (el, i) { return D.record(el, i); }) };
    };
    D.sectionEls = function () {
        return Array.prototype.slice.call(document.querySelectorAll('#sidebar-left .sidebar-section'))
            .concat(Array.prototype.slice.call(document.querySelectorAll('#sidebar-right .sidebar-section')));
    };
    D.sectionAt = function (i) { return D.sectionEls()[i]; };
    D.sections = function () {
        return D.sectionEls().map(function (sec, i) {
            var t = sec.querySelector('.section-title');
            return { domOrder: i, side: sec.closest('#sidebar-left') ? 'left' : 'right', title: D.sectionTitle(sec),
                collapsed: sec.classList.contains('collapsed'), ariaExpanded: t ? t.getAttribute('aria-expanded') : null,
                displayNone: getComputedStyle(sec).display === 'none', hiddenAttr: sec.hidden, titleVisible: t ? D.visible(t) : false };
        });
    };
    // axe results, slimmed for JSON: no element refs, html cut to 240 chars.
    D.slimRule = function (r) {
        return { id: r.id, impact: r.impact || null, tags: r.tags, description: r.description, help: r.help, helpUrl: r.helpUrl,
            nodes: (r.nodes || []).map(function (n) {
                var checks = [].concat(n.any || [], n.all || [], n.none || []).map(function (c) { return c.id + ': ' + c.message; });
                return { target: n.target, html: (n.html || '').slice(0, 240), impact: n.impact || null, failureSummary: n.failureSummary || null, checks: checks };
            }) };
    };
    D.runAxe = function () {
        var t0 = performance.now();
        return window.axe.run(document, { resultTypes: ['violations', 'incomplete'], elementRef: false }).then(function (r) {
            return {
                ms: Math.round(performance.now() - t0),
                testEngine: r.testEngine, testRunner: r.testRunner, testEnvironment: r.testEnvironment, timestamp: r.timestamp, url: r.url,
                toolOptions: r.toolOptions,
                violations: r.violations.map(D.slimRule),
                incomplete: r.incomplete.map(D.slimRule),
                passes: r.passes.map(function (x) { return x.id; }),
                inapplicable: r.inapplicable.map(function (x) { return x.id; })
            };
        });
    };
    return 1;
})()`;

// ─── CDP helpers (as in F0) ──────────────────────────────────────────────────
function attrsOf(node) {
    const o = {};
    const a = node.attributes || [];
    for (let i = 0; i + 1 < a.length; i += 2) o[a[i]] = a[i + 1];
    return o;
}

async function domList(d, rootSel, rootIncluded) {
    const doc = await d.send('DOM.getDocument', { depth: -1, pierce: true });
    const byNode = new Map();
    (function walk(n) {
        byNode.set(n.nodeId, n);
        (n.children || []).forEach(walk);
        (n.shadowRoots || []).forEach(walk);
        if (n.contentDocument) walk(n.contentDocument);
        if (n.templateContent) walk(n.templateContent);
    })(doc.root);
    let scopeId = doc.root.nodeId;
    const ids = [];
    if (rootSel) {
        const q = await d.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: rootSel });
        if (!q.nodeId) return null;
        scopeId = q.nodeId;
        if (rootIncluded) ids.push(scopeId);
    }
    const qa = await d.send('DOM.querySelectorAll', { nodeId: scopeId, selector: SEL });
    qa.nodeIds.forEach(id => ids.push(id));
    const out = [];
    for (const id of ids) {
        let n = byNode.get(id);
        if (!n) { try { n = (await d.send('DOM.describeNode', { nodeId: id })).node; } catch (_) { n = null; } }
        out.push(n ? { backendId: n.backendNodeId, tag: String(n.nodeName).toLowerCase(), id: attrsOf(n).id || '' } : null);
    }
    return out;
}

async function axTree(d) {
    const r = await d.send('Accessibility.getFullAXTree', {});
    const map = new Map();
    for (const n of r.nodes || []) {
        if (n.backendDOMNodeId == null) continue;
        const prev = map.get(n.backendDOMNodeId);
        if (!prev || (prev.ignored && !n.ignored)) map.set(n.backendDOMNodeId, n);
    }
    return { map, total: (r.nodes || []).length };
}

// Page records + DOM list + AX tree -> records with role / name filled in.
async function dumpSet(d, rootSel, label) {
    const page = await d.ev(`window.__a11y.collect(${JSON.stringify(rootSel || null)})`);
    if (!page) return { records: [], note: 'root not found: ' + rootSel };
    const records = page.records;
    let dom = null;
    try { dom = await domList(d, rootSel, page.rootIncluded); } catch (e) { problem(label + ': DOM.getDocument/querySelectorAll failed (' + e.message + ')'); }
    let aligned = !!dom && dom.length === records.length;
    if (dom && !aligned) problem(label + ': page list has ' + records.length + ' elements, CDP list has ' + dom.length);
    if (aligned) {
        for (let i = 0; i < records.length; i++) {
            const n = dom[i];
            if (!n || n.tag !== records[i].tag || (n.id || '') !== (records[i].id || '')) {
                problem(label + ': page/CDP lists diverge at index ' + i); aligned = false; break;
            }
        }
    }
    let ax = null;
    if (aligned) { try { ax = await axTree(d); } catch (e) { problem(label + ': Accessibility.getFullAXTree failed (' + e.message + ')'); } }
    const stats = { cdp: 0, ignored: 0, noAxNode: 0, fallback: 0 };
    for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        const n = aligned && ax ? ax.map.get(dom[i].backendId) : null;
        if (n && !n.ignored) {
            rec.role = n.role ? n.role.value : null;
            rec.name = n.name ? n.name.value : '';
            rec.nameSource = 'cdp';
            stats.cdp++;
        } else {
            rec.role = rec.roleAttr || rec.roleFallback;
            rec.name = rec.nameFallback;
            rec.nameSource = n ? 'fallback:ignored' : (aligned && ax ? 'fallback:no-ax-node' : 'fallback:unmapped');
            if (n) stats.ignored++; else if (aligned && ax) stats.noAxNode++; else stats.fallback++;
        }
        delete rec.roleFallback; delete rec.nameFallback;
    }
    return { records, stats, axTotal: ax ? ax.total : null, aligned };
}

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
        var r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), visible: window.__a11y.visible(el) }; })()`);
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

async function pressEscape(d) { await d.tap('Escape', 'Escape', 27); await sleep(250); }

// Open the left bar if folded, Shift-click every collapsed section (F0's road).
async function openEverything(d, out) {
    const env = out.env;
    out.sections = await d.ev('window.__a11y.sections()');
    if (env.leftFolded) {
        const r = await centreOf(d, `document.querySelector('#sidebar-left .lsb-rail-label')`);
        if (r) { await d.click(r.x, r.y); await sleep(300); }
        const still = await d.ev('window.Sidebars.left.isCollapsed()');
        if (still) problem('left sidebar stayed folded after clicking its rail label');
    }
    for (const s of out.sections) {
        if (!s.collapsed) continue;
        if (s.displayNone || s.hiddenAttr) { problem('section "' + s.title + '" is hidden at boot and was not opened'); continue; }
        await centreOf(d, `window.__a11y.sectionAt(${s.domOrder}).querySelector('.section-title')`);
        await sleep(80);
        const r2 = await centreOf(d, `window.__a11y.sectionAt(${s.domOrder}).querySelector('.section-title')`);
        if (r2 && r2.visible) await shiftClick(d, r2.x, r2.y);
        await sleep(250);
        let exp = await d.ev(`window.__a11y.sectionAt(${s.domOrder}).querySelector('.section-title').getAttribute('aria-expanded')`);
        if (exp !== 'true') {
            await d.ev(`(function(){ var sec = window.__a11y.sectionAt(${s.domOrder}); sec.querySelector('.section-header').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true })); return 1; })()`);
            await sleep(250);
            exp = await d.ev(`window.__a11y.sectionAt(${s.domOrder}).querySelector('.section-title').getAttribute('aria-expanded')`);
            problem('section "' + s.title + '" needed the synthetic Shift-click fallback (aria-expanded now ' + exp + ')');
        }
    }
    await sleep(500);
    const after = await d.ev('window.__a11y.sections()');
    out.allSectionsOpen = after.every(s => s.ariaExpanded === 'true' && !s.collapsed);
    if (!out.allSectionsOpen) problem('not every section is open: ' + after.filter(s => s.ariaExpanded !== 'true').map(s => s.title).join(', '));
    // Scroll both bars back to the top, instantly (css/21-sidebar.css:43 smooth scroll).
    await d.ev(`(function(){ ['#sidebar-left', '#sidebar-right'].forEach(function (s) { var bar = document.querySelector(s); if (!bar) return;
        [bar].concat(Array.prototype.slice.call(bar.querySelectorAll('*'))).forEach(function (el) { if (el.scrollTop > 0) { var prev = el.style.scrollBehavior; el.style.scrollBehavior = 'auto'; el.scrollTop = 0; el.style.scrollBehavior = prev; } }); }); return 1; })()`);
    await sleep(400);
    log('sections open: ' + after.filter(s => s.ariaExpanded === 'true').length + '/' + after.length);
}

// ─── the hand-written keyboard table ─────────────────────────────────────────
// One pattern per kind of control, with the handler that implements it. The
// id is what the controls table carries; the legend is written once.
const KEYS = {
    K00: ['orphan markup', 'Never rendered: the static .controls panel from index.html that js/20-mixer-layout.js does not re-parent stays in the DOM with display:none (prep/baseline/dom/NOTES.md, surface overlay:.controls). No keyboard road, none intended.'],
    K01: ['container', 'Container, not focusable (.sidebar-section, .mixer-channel, role=group, role=radiogroup); its controls carry the keyboard.'],
    K02: ['live region / message', 'role=status, role=alert, role=note: announced, not interactive.'],
    K03: ['label', 'Native <label>: not focusable; a click forwards to its control (for= or wrapping).'],
    K10: ['native button', 'Native <button>: Enter and Space activate (click).'],
    K11: ['native toggle button', 'Native <button> with aria-pressed: Enter / Space toggle; aria-pressed follows the class (24 writers in js/, e.g. js/20-mixer-layout.js buildColorChannel).'],
    K12: ['button that opens a popup', 'Native <button> with aria-haspopup / aria-expanded: Enter / Space open the panel; opened from the keyboard, focus moves into it, Tab out closes it, Esc closes it, focus returns to the button (DialogFocus.popup, js/00b-dialog-focus.js:190-231; Presets js/20-mixer-layout.js:2243; Invite / room menu js/06e-mp-panel.js:807; More js/46-strip-more.js:215).'],
    K13: ['quality-bar list button', 'button.qub-dd-btn[aria-haspopup=listbox]: Enter / Space toggle the list, ArrowUp / ArrowDown open it, Esc closes it (js/20-mixer-layout.js:2867-2881); the list is K3A.'],
    K14: ['skip-menu button', '.skip-menu-option: Space / Enter move focus into the region, the arrows jump to the region they point at, Home / End, Esc puts focus back where it came from; other keys never reach the hotkeys (js/66-skip-menu.js:252-278).'],
    K15: ['arm tip square', 'button.arm-tip-btn[aria-haspopup=menu]: Enter / Space open the arm-tip menu (js/20-mixer-layout.js:8901-8914); focus lands on the active option (798); Esc closes and returns focus to the square (694-701). The menu is K55.'],
    K16: ['sidebar fold tab', 'button.lsb-toggle / .rsb-toggle with aria-expanded: Enter / Space fold or unfold the bar (js/20-mixer-layout.js:2406, 2545).'],
    K20: ['native slider', 'input[type=range]: ArrowLeft / ArrowDown and ArrowRight / ArrowUp move at least 1% of the travel, Shift+arrow 10%, snapped to the slider\'s step (js/67-slider-keys.js:24-60); PageUp / PageDown, Home and End are the browser\'s.'],
    K21: ['native checkbox', 'input[type=checkbox] (role=switch included): Space toggles; its label forwards clicks.'],
    K22: ['parked canonical input', 'input / select with aria-hidden="true" and tabindex="-1": the state holder behind a proxy, out of the Tab order (strip colour chips: #randomColor / #stepPalette / #colorGate, js/20-mixer-layout.js buildColorChannel; quality bar selects: js/20-mixer-layout.js:2820-2822; #mutationScope). The keyboard reaches the proxy, not this element.'],
    K23: ['native radio', 'input[type=radio]: arrows move within the group, Space selects.'],
    K24: ['native spinbutton', 'input[type=number]: ArrowUp / ArrowDown step, typed digits, Enter commits.'],
    K25: ['native text field', 'input[type=text] / <textarea>: typing; app hotkeys are suspended while it has focus (js/01a-param-registry.js isTypingTarget).'],
    K26: ['colour well', 'input[type=color]: a click (Enter / Space on the focused well) is intercepted in the capture phase and opens the shared picker popover instead of the OS dialog (js/64-colour-picker.js:720-729 → openFor 612). The popover is K3D / K52-K54.'],
    K27: ['native file button', 'input[type=file]: Enter / Space open the OS file picker.'],
    K28: ['native select', '<select>: ArrowUp / ArrowDown change the value, Alt+ArrowDown / Enter / Space open the list, type-ahead.'],
    K29: ['native link', '<a href>: Enter follows it.'],
    K2A: ['native disclosure', '<summary>: Enter / Space toggle the <details>.'],
    K30: ['section title', 'span.section-title[role=button][tabindex=0]: Enter / Space toggle the section, with Shift additive so the accordion keeps the others open (js/20-mixer-layout.js:9326-9339); aria-expanded follows the .collapsed class and the title catches focus when its section folds under it (9340-9351).'],
    K31: ['Ignite latch', '.ch-ignite-lock[role=button][tabindex=0]: Enter / Space toggle the latch (js/20-mixer-layout.js:1488-1497); aria-pressed follows .latched (1498-1501).'],
    K32: ['palette combobox', '#paletteSelect[role=combobox][tabindex=0]: Enter / Space / ArrowDown / ArrowUp open the palette listbox (js/01-config.js:456-462); in the list ArrowDown / ArrowUp / Home / End move, Enter / Space choose (618-621), Esc closes, Tab closes and walks on (544-558); Menu key / right-click open rename / duplicate / delete (463-466).'],
    K33: ['palette chip (roving)', '.palette-chip[role=button]: one chip in the Tab order (roving tabindex, js/01-config.js:945-948); ArrowLeft / ArrowRight / ArrowUp / ArrowDown, Home, End move along the row, Enter / Space paint with it (949-969); Menu key / Shift+F10 open the chip menu (contextmenu, 906-910).'],
    K34: ['effect preview thumb', 'span.fx-thumb[role=img][tabindex=0]: focus shows the effect card, blur hides it; Enter / Space click the effect\'s checkbox (js/20-mixer-layout.js:4441-4451). A focusable role=img that acts as a button (see Open questions).'],
    K35: ['dither pattern pad', 'canvas#ditherPad[role=application][tabindex=0]: the arrows move the cursor square (wrapping), Space / Enter flip it (js/68-dither.js:322-337); the aria-label says so.'],
    K36: ['paint-type radio', 'button[role=radio] in .brush-mode-row[role=radiogroup]: ArrowLeft / ArrowRight / ArrowUp / ArrowDown move the choice and focus (js/20-mixer-layout.js:5737-5749); Enter / Space are the native click; ~ steps the type too (js/59-brush-type-key.js:95).'],
    K37: ['arm colour radio', 'button[role=radio].arm-mode-btn in .arm-mode-wrap[role=radiogroup]: the native click sets the mode (js/20-mixer-layout.js:9000-9018); no arrow-key handler on this radiogroup (8889-8891), so every radio is its own Tab stop (see Open questions).'],
    K38: ['arm Pressure (checkbox button)', 'button[role=checkbox].arm-push-btn: Enter / Space toggle (native click); aria-checked is written by paintRow (js/20-mixer-layout.js:8926-8930, 8935+).'],
    K39: ['room menu item', 'button[role=menuitem | menuitemcheckbox] inside #mpRoomMenu[role=menu]: native button; the menu is a popup (js/06e-mp-panel.js:807), Esc closes it (onRoomPopKey 847-851); no arrow-key movement (DialogFocus.menu is not used here).'],
    K3A: ['quality-bar listbox', 'div.qub-dd-list[role=listbox]: opened from its button (K13); inside, ArrowDown / ArrowUp / Home / End move among the options (tabindex -1), Enter / Space pick, Esc closes, Tab walks on and closes (js/20-mixer-layout.js:2883-2899; DialogFocus.popup 2857).'],
    K3B: ['PhotoSafe dialog', '#photoWarn[role=dialog][aria-modal]: its own trap — Tab / Shift+Tab cycle checkbox → Learn more → Exit → Continue and every other key is stopped (index.html:486-500 keyGuard); focus starts on the title (411) and is pulled back if it leaves (505).'],
    K3C: ['held dialog', 'role=dialog held by DialogFocus.hold: focus moves in, Tab / Shift+Tab cycle inside, Esc closes, focus returns to the opener after a keyboard close (js/00b-dialog-focus.js:60-80, 103-188). The F1 hotkey sheet: js/05n-hotkeys-init.js:41-51, toggled by F1 or Shift+? (444-447).'],
    K3D: ['popup panel', 'Popup via DialogFocus.popup: focus moves in when opened from the keyboard, Tab out closes, Esc closes, focus back to the trigger (js/00b-dialog-focus.js:190-231). Invite: js/06e-mp-panel.js:807; Presets: js/20-mixer-layout.js:2243; colour picker: js/64-colour-picker.js:642 + Esc 695-700.'],
    K3E: ['focus target', 'tabindex="-1" heading: a focus target only (the PhotoSafe dialog focuses it on open, index.html:411).'],
    K3F: ['cue-editor canvas', 'canvas.ace-canvas[tabindex=0][data-owns-keys]: while focused it owns Delete, the arrows, Space and 1-8 (js/40b-audio-cue-editor.js:739-753, onKey 458); its aria-label is empty (see Open questions).'],
    K40: ['generic focusable', 'An element with tabindex and no role: focusable, keys per its own handler (none found).'],
    K50: ['radial menu', '#radialMenu[role=menu]: pointer-driven — hold or tap E (or the bound mouse button) to open, move over an item, release or click to pick; Esc or E close it, any other key closes it (js/58-radial-menu.js:804-818); the wheel adjusts a slider item (789-800). Nothing in it is focusable.'],
    K51: ['radial item', '.radial-label[role=menuitem]: no tabindex, picked by pointer (K50).'],
    K52: ['picker track', '.cp-track[role=slider][tabindex=0]: ArrowRight / ArrowUp + step, ArrowLeft / ArrowDown − step, Shift ×10, Home / End (js/64-colour-picker.js:307-318); the value is committed on keyup.'],
    K53: ['picker number', 'input.cp-num: Enter applies, Esc reverts, change applies (js/64-colour-picker.js:325-329).'],
    K54: ['picker chip', '.cp-chip[role=button][tabindex=0]: Enter / Space pick the colour (js/64-colour-picker.js:440-442 recents, 582-584 palette).'],
    K55: ['arm tip menu', '.arm-tip-menu[role=menu]: focus moves to the active option on open (js/20-mixer-layout.js:798); Esc closes and returns focus to the square (694-701); the options are native buttons; no arrow-key movement (role=menu set by hand, DialogFocus.menu not used — see Open questions).'],
    K56: ['preset button', 'button.mixer-preset-btn / .mixer-user-preset-btn inside the Presets panel (K3D): Enter / Space apply the preset; the panel focuses the active one when opened from the keyboard (js/20-mixer-layout.js:2243-2250); the ⋯ menu is a DialogFocus.menu (1936: arrows, Home, End).']
};

function keyOf(x) {
    const cls = x.classes || [];
    const has = c => cls.indexOf(c) >= 0;
    const aria = x.aria || {};
    const role = x.roleAttr;
    if (x.surface === 'overlay:.controls') return 'K00';
    if (has('sidebar-section') || has('mixer-channel')) return 'K01';
    if (x.tag === 'label') return 'K03';
    if (x.tag === 'h1' || /^h[1-6]$/.test(x.tag)) return 'K3E';
    if (role === 'dialog') {
        if (x.id === 'photoWarn') return 'K3B';
        if (x.id === 'mpInvitePop' || has('cp-pop')) return 'K3D';
        return 'K3C';
    }
    if (role === 'menu') {
        if (x.id === 'radialMenu') return 'K50';
        if (has('arm-tip-menu')) return 'K55';
        return 'K3D';
    }
    if (role === 'menuitem' && has('radial-label')) return 'K51';
    if (role === 'menuitem' || role === 'menuitemcheckbox') return 'K39';
    if (role === 'listbox') return 'K3A';
    if (role === 'status' || role === 'alert' || role === 'note') return 'K02';
    if (role === 'group' || role === 'radiogroup') return 'K01';
    if (role === 'combobox' && x.tag !== 'select') return 'K32';
    if (role === 'slider' && x.tag !== 'input') return 'K52';
    if (role === 'application') return 'K35';
    if (role === 'img' && has('fx-thumb')) return 'K34';
    if (role === 'button' && x.tag !== 'button') {
        if (has('section-title')) return 'K30';
        if (has('ch-ignite-lock')) return 'K31';
        if (has('palette-chip')) return 'K33';
        if (has('cp-chip')) return 'K54';
        return 'K10';
    }
    if (x.tag === 'button') {
        if (role === 'radio') return has('arm-mode-btn') ? 'K37' : 'K36';
        if (role === 'checkbox') return 'K38';
        if (has('skip-menu-option')) return 'K14';
        if (has('arm-tip-btn')) return 'K15';
        if (has('qub-dd-btn')) return 'K13';
        if (has('lsb-toggle') || has('rsb-toggle')) return 'K16';
        if (has('mixer-preset-btn') || has('mixer-user-preset-btn')) return 'K56';
        if (aria['aria-haspopup']) return 'K12';
        if (aria['aria-pressed'] !== undefined) return 'K11';
        return 'K10';
    }
    if (x.tag === 'input') {
        if (aria['aria-hidden'] === 'true' || (x.tabIndexAttr === '-1' && x.inAriaHidden)) return 'K22';
        if (has('cp-num')) return 'K53';
        switch (x.type) {
            case 'range': return 'K20';
            case 'checkbox': return 'K21';
            case 'radio': return 'K23';
            case 'number': return 'K24';
            case 'color': return 'K26';
            case 'file': return 'K27';
            default: return 'K25';
        }
    }
    if (x.tag === 'select') return (aria['aria-hidden'] === 'true' || x.tabIndexAttr === '-1') ? 'K22' : 'K28';
    if (x.tag === 'textarea') return 'K25';
    if (x.tag === 'a') return 'K29';
    if (x.tag === 'summary') return 'K2A';
    if (x.tag === 'canvas' && has('ace-canvas')) return 'K3F';
    if (x.tabIndexAttr != null) return 'K40';
    return 'K01';
}

// The state a reskin must keep: ARIA state attributes, native checked /
// disabled / readOnly / hidden, and whether the element is focusable.
const STATE_ARIA = ['aria-pressed', 'aria-checked', 'aria-expanded', 'aria-disabled', 'aria-selected', 'aria-current', 'aria-hidden',
    'aria-haspopup', 'aria-modal', 'aria-live', 'aria-busy', 'aria-invalid', 'aria-required', 'aria-readonly', 'aria-multiselectable', 'aria-orientation', 'aria-sort', 'aria-level'];
function stateOf(rec) {
    const s = {};
    const aria = rec.aria || {};
    for (const k of STATE_ARIA) if (aria[k] !== undefined) s[k] = aria[k];
    if (rec.checked !== undefined) s.checked = rec.checked;
    if (rec.disabled) s.disabled = true;
    if (rec.readOnly) s.readOnly = true;
    if (rec.hiddenAttr) s.hidden = true;
    if (rec.tabIndexAttr != null) s.tabindex = rec.tabIndexAttr;
    s.focusable = typeof rec.tabIndex === 'number' ? rec.tabIndex >= 0 && !rec.disabled : null;
    return s;
}
function stateStr(s) { return Object.keys(s).filter(k => k !== 'focusable').map(k => k.replace(/^aria-/, '') + '=' + s[k]).join(' ') + (s.focusable ? ' [focusable]' : ''); }

// A row of the list from a record (F0's or the live one), with the live
// selector when the live list lines up with it.
function rowOf(rec, selector) {
    return {
        order: rec.order,
        surface: rec.surface,
        section: rec.section,
        selector: selector || rec.selector || (rec.id ? '#' + rec.id : rec.tag + (rec.classes && rec.classes.length ? '.' + rec.classes[0] : '')),
        tag: rec.tag,
        type: rec.type || null,
        id: rec.id || null,
        classes: rec.classes || [],
        role: rec.role,
        roleAttr: rec.roleAttr || null,
        name: rec.name,
        nameSource: rec.nameSource,
        state: stateOf(rec),
        keyboard: keyOf(rec),
        visibleNow: rec.visibleNow
    };
}

// ─── markdown ────────────────────────────────────────────────────────────────
const esc = s => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ').replace(/`/g, '\'');
const cut = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
function countBy(list, fn) {
    const m = new Map();
    list.forEach(x => { const k = fn(x); m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()];
}
function tally(rows, head) {
    return ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|'].concat(rows.map(r => '| ' + r.map(esc).join(' | ') + ' |')).join('\n');
}
function envTable(env) {
    return tally(Object.entries(env).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v]), ['Fact', 'Value']);
}
const nodeKey = (ruleId, n) => ruleId + ' @ ' + (Array.isArray(n.target) ? n.target.map(t => Array.isArray(t) ? t.join(' >>> ') : t).join(' | ') : String(n.target));
function violationKeys(run) {
    const s = new Set();
    (run.violations || []).forEach(r => r.nodes.forEach(n => s.add(nodeKey(r.id, n))));
    return s;
}
function nodesCount(rules) { return (rules || []).reduce((a, r) => a + r.nodes.length, 0); }

function writeAxeMarkdown(out) {
    const L = [];
    const main = out.runs[0];
    L.push('# axe-core report — the shipping UI, every surface');
    L.push('');
    L.push('Generated ' + out.generated + ' by `prep/baseline/scripts/a11y.js` (F3). Machine copy: `axe.json`. Engine: axe-core ' + out.axeVersion + ' (`prep/baseline/vendor/axe.min.js`, MPL-2.0), default rule set (no `runOnly`: WCAG 2.0/2.1/2.2 A and AA rules plus axe best-practice rules; every rule\'s tags are listed so the two can be told apart), `resultTypes: [violations, incomplete]`, run over `document` with the left bar open and all ' + out.sections.length + ' sidebar sections expanded, then once more with each overlay / popover open. Notes and caveats: `NOTES.md`.');
    L.push('');
    L.push('## Environment');
    L.push('');
    L.push(envTable(out.env));
    L.push('');
    L.push('## Runs');
    L.push('');
    L.push(tally(out.runs.map(r => [r.name, r.state, r.opened === null ? 'n/a' : (r.opened ? 'yes' : 'NO'), r.closed === null ? 'n/a' : (r.closed ? 'yes' : 'NO'),
        r.result ? r.result.violations.length + ' / ' + nodesCount(r.result.violations) : 'not run',
        r.result ? r.result.incomplete.length + ' / ' + nodesCount(r.result.incomplete) : '',
        r.result ? r.result.passes.length : '', r.result ? r.result.inapplicable.length : '',
        r.name === main.name ? '—' : (r.result ? r.deltaVsMain.violations.length + ' new / ' + r.deltaVsMain.resolved.length + ' gone' : ''),
        r.result ? r.result.ms + ' ms' : '']),
        ['Run', 'State', 'Opened', 'Closed', 'Violations (rules / nodes)', 'Incomplete (rules / nodes)', 'Rules passed', 'Inapplicable', 'Violation nodes vs main', 'axe time']));
    L.push('');
    L.push('"Violation nodes vs main": violation (rule + target) pairs present with the overlay open that the main run did not have, and main-run pairs that disappeared while it was open (an overlay\'s scrim hiding the page, for instance). Full node lists for every run are in `axe.json`.');
    L.push('');
    L.push('## Violations with everything open (main run), grouped by rule');
    L.push('');
    if (!main.result) L.push('(the main run did not produce a result)');
    else if (!main.result.violations.length) L.push('No violations.');
    else {
        L.push(tally(main.result.violations.map(r => [r.id, r.impact, r.nodes.length, r.tags.filter(t => /^wcag|^best-practice/.test(t)).join(' '), r.help]), ['Rule', 'Impact', 'Nodes', 'Tags', 'Help']));
        L.push('');
        for (const r of main.result.violations) {
            L.push('### `' + r.id + '` — ' + r.impact + ' — ' + r.help);
            L.push('');
            L.push(r.description + ' ([rule](' + r.helpUrl + ')). Tags: ' + r.tags.join(', ') + '.');
            L.push('');
            L.push(tally(r.nodes.map((n, i) => [i + 1, nodeKey('', n).slice(3), cut(n.html, 140), cut((n.failureSummary || '').replace(/^Fix (any|all) of the following:\s*/, ''), 160)]), ['#', 'Target', 'HTML', 'Failure summary']));
            L.push('');
        }
    }
    L.push('## Overlays and popovers: violations not in the main run');
    L.push('');
    for (const r of out.runs.slice(1)) {
        L.push('### ' + r.name + ' — ' + r.state);
        L.push('');
        L.push('Opened by: ' + r.how + '. ' + (r.opened ? 'Open' : 'DID NOT OPEN') + (r.result ? '; ' + r.result.violations.length + ' violation rules / ' + nodesCount(r.result.violations) + ' nodes in the whole document with it open.' : '.') + (r.note ? ' ' + r.note : ''));
        L.push('');
        if (!r.result) { L.push('(no axe result)'); L.push(''); continue; }
        if (!r.deltaVsMain.violations.length) L.push('No new violation nodes.');
        else L.push(tally(r.deltaVsMain.violations.map(k => { const [rule, tgt] = k.split(' @ '); const rr = r.result.violations.find(v => v.id === rule); const nn = rr && rr.nodes.find(n => nodeKey(rule, n) === k); return [rule, rr ? rr.impact : '', tgt, nn ? cut(nn.html, 140) : '', nn ? cut((nn.failureSummary || '').replace(/^Fix (any|all) of the following:\s*/, ''), 160) : '']; }), ['Rule', 'Impact', 'Target', 'HTML', 'Failure summary']));
        if (r.deltaVsMain.resolved.length) { L.push(''); L.push('Main-run violation nodes absent while it was open: ' + r.deltaVsMain.resolved.length + ' (' + r.deltaVsMain.resolved.slice(0, 5).map(k => '`' + k + '`').join(', ') + (r.deltaVsMain.resolved.length > 5 ? ', …' : '') + ').'); }
        L.push('');
    }
    L.push('## Incomplete (axe could not decide; needs a human), main run, grouped by rule');
    L.push('');
    if (main.result && main.result.incomplete.length) {
        L.push(tally(main.result.incomplete.map(r => [r.id, r.impact, r.nodes.length, r.tags.filter(t => /^wcag|^best-practice/.test(t)).join(' '), r.help]), ['Rule', 'Impact', 'Nodes', 'Tags', 'Help']));
        L.push('');
        for (const r of main.result.incomplete) {
            L.push('### `' + r.id + '` (incomplete) — ' + r.help);
            L.push('');
            const show = r.nodes.slice(0, 25);
            L.push(tally(show.map((n, i) => [i + 1, nodeKey('', n).slice(3), cut(n.html, 120), cut(n.checks.join('; '), 160)]), ['#', 'Target', 'HTML', 'Check messages']));
            if (r.nodes.length > show.length) L.push('\n… ' + (r.nodes.length - show.length) + ' more nodes in `axe.json`.');
            L.push('');
        }
    } else L.push(main.result ? 'None.' : '(no result)');
    L.push('');
    L.push('## Rules that passed (main run)');
    L.push('');
    L.push(main.result ? main.result.passes.map(x => '`' + x + '`').join(', ') : '(no result)');
    L.push('');
    L.push('## Rules inapplicable to this page (main run)');
    L.push('');
    L.push(main.result ? main.result.inapplicable.map(x => '`' + x + '`').join(', ') : '(no result)');
    L.push('');
    if (out.problems.length) { L.push('## Problems during the run'); L.push(''); out.problems.forEach(p => L.push('- ' + p)); L.push(''); }
    return L.join('\n');
}

function writeControlsMarkdown(out) {
    const L = [];
    const c = out.controls;
    L.push('# Controls — role, name, state and keyboard pattern of every control');
    L.push('');
    L.push('Generated ' + out.generated + ' by `prep/baseline/scripts/a11y.js` (F3). Machine copy: `controls-a11y.json` (what `--check` diffs). Derived from `prep/baseline/dom/controls.json` (F0: ' + (out.source.controlsGenerated || '?') + ', ' + out.source.controlsCount + ' controls) and its `lazy-*.json`; selectors come from the live boot of this run, which was cross-checked against the F0 record (' + out.crossCheck.compared + ' compared, ' + out.crossCheck.differences.length + ' differences' + (out.crossCheck.differences.length ? ', listed at the end' : '') + '). Role and name are the CDP accessibility tree\'s (`nameSource` c) or the page-side fallback for nodes the tree ignores or does not build (f: `display:none` content, labels folded into their control, containers). The keyboard pattern is a hand-written table keyed on element / role / class with the handler\'s file:line; it says what the code does today, not what it should do. Notes: `NOTES.md`.');
    L.push('');
    L.push('## Environment');
    L.push('');
    L.push(envTable(out.env));
    L.push('');
    L.push('## Counts');
    L.push('');
    L.push('- controls: **' + c.length + '** in the main dump (' + c.filter(x => x.nameSource === 'cdp').length + ' role/name from the AX tree, ' + c.filter(x => x.nameSource !== 'cdp').length + ' fallback); lazily built UI: ' + Object.entries(out.lazy).map(([k, v]) => k + ' ' + v.controls.length).join(', '));
    L.push('- rendered with everything open (`visibleNow`): ' + c.filter(x => x.visibleNow).length + '; not rendered (conditional sub-blocks, hidden overlays, orphans): ' + c.filter(x => !x.visibleNow).length);
    L.push('- focusable (computed tabIndex ≥ 0, not disabled): ' + c.filter(x => x.state.focusable).length + '; with an explicit tabindex attribute: ' + c.filter(x => x.state.tabindex !== undefined).length);
    L.push('- with an explicit `role=`: ' + c.filter(x => x.roleAttr).length + ' (' + countBy(c.filter(x => x.roleAttr), x => x.roleAttr).map(([k, v]) => k + ' ' + v).join(', ') + ')');
    L.push('- with a state attribute: aria-pressed ' + c.filter(x => x.state['aria-pressed'] !== undefined).length + ', aria-checked ' + c.filter(x => x.state['aria-checked'] !== undefined).length + ', aria-expanded ' + c.filter(x => x.state['aria-expanded'] !== undefined).length + ', aria-disabled ' + c.filter(x => x.state['aria-disabled'] !== undefined).length + ', aria-haspopup ' + c.filter(x => x.state['aria-haspopup'] !== undefined).length + ', aria-hidden ' + c.filter(x => x.state['aria-hidden'] !== undefined).length + ', native checked ' + c.filter(x => x.state.checked !== undefined).length + ', native disabled ' + c.filter(x => x.state.disabled).length);
    L.push('- empty accessible name: ' + c.filter(x => !x.name && x.state.focusable && !['K01', 'K02', 'K00'].includes(x.keyboard)).length + ' focusable controls (listed under Open questions in NOTES.md)');
    L.push('');
    L.push('### Per role');
    L.push('');
    L.push(tally(countBy(c, x => x.role || '(none)').sort((a, b) => b[1] - a[1]), ['Role', 'Controls']));
    L.push('');
    L.push('### Per keyboard pattern');
    L.push('');
    L.push(tally(countBy(c, x => x.keyboard).sort((a, b) => a[0] < b[0] ? -1 : 1).map(([k, v]) => [k, KEYS[k][0], v]), ['Pattern', 'Kind', 'Controls']));
    L.push('');
    L.push('## Keyboard patterns (legend)');
    L.push('');
    L.push('Native means the browser\'s own handling for that element; custom means a handler in the app, cited by file:line.');
    L.push('');
    L.push(tally(Object.entries(KEYS).map(([k, v]) => [k, v[0], v[1]]), ['Id', 'Kind', 'Keys and handler']));
    L.push('');
    L.push('## All controls (document order, everything open)');
    L.push('');
    L.push('Columns: order (F0 index); surface; section; selector (live, state classes dropped); role (CDP AX tree role or implicit; `[r]` = explicit role attribute); name (c = AX tree, f = fallback); state (ARIA state attributes without the `aria-` prefix, native checked/disabled/readOnly/hidden, tabindex attribute, `[focusable]` when the computed tabIndex ≥ 0); keys (pattern id, see the legend); R = rendered with everything open.');
    L.push('');
    const head = ['#', 'Surface', 'Section', 'Selector', 'Role', 'Name', 'State', 'Keys', 'R'];
    L.push('| ' + head.join(' | ') + ' |');
    L.push('|' + head.map(() => '---').join('|') + '|');
    for (const x of c) {
        L.push('| ' + [x.order, x.surface, cut(x.section, 24), cut(x.selector, 70), (x.role || '') + (x.roleAttr ? ' [r]' : ''), cut(x.name, 48) + (x.nameSource === 'cdp' ? ' (c)' : ' (f)'), cut(stateStr(x.state), 70), x.keyboard, x.visibleNow ? 'Y' : 'N'].map(esc).join(' | ') + ' |');
    }
    L.push('');
    L.push('## Lazily built UI');
    L.push('');
    for (const [name, z] of Object.entries(out.lazy)) {
        L.push('### ' + name + ' (`' + z.root + '`, ' + z.controls.length + ' controls; ' + z.how + ')');
        L.push('');
        if (!z.controls.length) { L.push('(not opened in this run)'); L.push(''); continue; }
        L.push('| ' + head.join(' | ') + ' |');
        L.push('|' + head.map(() => '---').join('|') + '|');
        for (const x of z.controls) L.push('| ' + [x.order, x.surface, cut(x.section, 24), cut(x.selector, 70), (x.role || '') + (x.roleAttr ? ' [r]' : ''), cut(x.name, 48) + (x.nameSource === 'cdp' ? ' (c)' : ' (f)'), cut(stateStr(x.state), 70), x.keyboard, x.visibleNow ? 'Y' : 'N'].map(esc).join(' | ') + ' |');
        L.push('');
    }
    if (out.crossCheck.differences.length) {
        L.push('## Live boot vs the F0 record');
        L.push('');
        L.push('The live enumeration of this run disagreed with `prep/baseline/dom/controls.json` here (the saved list keeps the F0 values; `--check` will report these until one of the two is re-captured):');
        L.push('');
        out.crossCheck.differences.slice(0, 100).forEach(x => L.push('- ' + x));
        L.push('');
    }
    if (out.problems.length) { L.push('## Problems during the run'); L.push(''); out.problems.forEach(p => L.push('- ' + p)); L.push(''); }
    return L.join('\n');
}

// ─── --check projection ──────────────────────────────────────────────────────
function projectRow(x) { return { selector: x.selector, role: x.role, name: x.name, state: x.state, keyboard: x.keyboard }; }
function diffRows(label, a, b, outDiffs) {
    if (a.length !== b.length) outDiffs.push(label + ': ' + a.length + ' -> ' + b.length + ' controls');
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
        const pa = projectRow(a[i]), pb = projectRow(b[i]);
        const where = label + '[' + i + '] ' + (a[i].selector || '');
        if (pa.selector !== pb.selector) outDiffs.push(where + ': selector ' + JSON.stringify(pa.selector) + ' -> ' + JSON.stringify(pb.selector));
        if (pa.role !== pb.role) outDiffs.push(where + ': role ' + JSON.stringify(pa.role) + ' -> ' + JSON.stringify(pb.role));
        if (pa.name !== pb.name) outDiffs.push(where + ': name ' + JSON.stringify(pa.name) + ' -> ' + JSON.stringify(pb.name));
        if (JSON.stringify(pa.state) !== JSON.stringify(pb.state)) outDiffs.push(where + ': state ' + JSON.stringify(pa.state) + ' -> ' + JSON.stringify(pb.state));
        if (pa.keyboard !== pb.keyboard) outDiffs.push(where + ': keyboard ' + pa.keyboard + ' -> ' + pb.keyboard);
    }
}

// ─── main ────────────────────────────────────────────────────────────────────
(async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const started = new Date();
    let head = null;
    try { head = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch (_) { head = '(git unavailable)'; }
    if (!fs.existsSync(AXE_PATH)) { console.log('axe-core not vendored at ' + AXE_PATH + ' (npm pack axe-core, extract axe.min.js + LICENSE)'); process.exit(1); }
    const axeSrc = fs.readFileSync(AXE_PATH, 'utf8');

    log('booting headless Chrome through scripts/test/radial-menu/driver.js ...');
    // Same scratch-profile seed as F0: the one-time Reset-app note (js/60) is
    // answered, so it cannot appear mid-run.
    const d = await boot({ seed: { 'swirlResetHint.v1': '1' } });
    const out = { generated: started.toISOString(), env: {}, axeVersion: null, sections: [], allSectionsOpen: false, runs: [], problems: [] };
    const ctl = { generated: started.toISOString(), env: {}, source: {}, crossCheck: { compared: 0, differences: [] }, controls: [], lazy: {}, problems: [] };
    let live = null;           // live main-dump records
    const liveLazy = {};       // name -> records
    try {
        const anims = await waitAnimations(d, 5000);
        if (anims !== 0) problem('entrance animations still running after 5 s (getAnimations().length = ' + anims + ')');
        await sleep(300);

        const ver = await d.send('Browser.getVersion');
        const pageEnv = await d.ev(`(function(){ return { innerWidth: innerWidth, innerHeight: innerHeight, dpr: devicePixelRatio,
            uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim() || null, url: location.href,
            bodyClasses: document.body.className, leftFolded: !!(window.Sidebars && window.Sidebars.left && window.Sidebars.left.isCollapsed()),
            rightFolded: !!(window.Sidebars && window.Sidebars.right && window.Sidebars.right.isCollapsed()),
            hiddenUiKeys: Array.prototype.slice.call(document.querySelectorAll('[data-ui-key]')).filter(function(e){ return getComputedStyle(e).display === 'none'; }).map(function(e){ return e.dataset.uiKey; }) }; })()`);
        out.env = Object.assign({ date: started.toISOString(), headCommit: head, chrome: ver.product, userAgent: ver.userAgent, protocol: ver.protocolVersion, node: process.version,
            build: 'web build in headless Chrome (driver window 1600x900, scratch profile)', selector: SEL }, pageEnv);
        log('env: ' + ver.product + ', viewport ' + pageEnv.innerWidth + 'x' + pageEnv.innerHeight + ' @' + pageEnv.dpr + ', --ui-scale ' + pageEnv.uiScale + ', HEAD ' + head.slice(0, 7));

        await d.ev(PAGE_LIB);
        await openEverything(d, out);
        await d.send('DOM.enable');
        await d.send('Accessibility.enable');

        // The live main dump (selectors + a cross-check of role/name/state).
        const main = await dumpSet(d, null, 'main dump');
        live = main.records;
        log('live dump: ' + live.length + ' controls (AX tree ' + main.axTotal + ' nodes; cdp ' + main.stats.cdp + ', ignored ' + main.stats.ignored + ', no node ' + main.stats.noAxNode + ')');

        // axe: inject, version, main run.
        await d.ev(axeSrc + '\n;1');
        out.axeVersion = await d.ev('window.axe && window.axe.version');
        out.env.axeVersion = out.axeVersion;
        log('axe-core ' + out.axeVersion + ' injected; running over the document with everything open ...');
        const mainRun = { name: 'everything-open', state: 'left bar open, all ' + out.sections.length + ' sections expanded, no overlay', how: 'boot + Shift-click every section title', opened: null, closed: null, note: null, result: null, deltaVsMain: { violations: [], resolved: [] } };
        try { mainRun.result = await d.ev('window.__a11y.runAxe()'); } catch (e) { problem('axe main run failed: ' + e.message); }
        if (mainRun.result) log('  main: ' + mainRun.result.violations.length + ' violation rules / ' + nodesCount(mainRun.result.violations) + ' nodes, ' + mainRun.result.incomplete.length + ' incomplete rules / ' + nodesCount(mainRun.result.incomplete) + ' nodes, ' + mainRun.result.passes.length + ' passed, ' + mainRun.result.ms + ' ms');
        out.runs.push(mainRun);
        const mainKeys = mainRun.result ? violationKeys(mainRun.result) : new Set();

        // Overlays and popovers, one at a time: open, dump its controls, axe, close.
        const canvas = await d.ev(`(function(){ var c = document.getElementById('canvas') || document.querySelector('#canvas-area canvas'); var r = c.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
        const overlays = [
            {
                name: 'hotkey-overlay', lazyName: null, root: '#hotkeyOverlay', state: 'F1 hotkey sheet open (DialogFocus.hold)', how: 'trusted F1 key (js/05n-hotkeys-init.js:444-447)',
                open: async () => { await d.ev('document.activeElement && document.activeElement.blur(), 1'); await d.tap('F1', 'F1', 112); await sleep(300); },
                isOpen: `(function(){ var o = document.getElementById('hotkeyOverlay'); return !!(o && o.style.display === 'flex' && o.getClientRects().length); })()`,
                fallbackOpen: async () => { await d.ev('window.toggleHotkeys && window.toggleHotkeys(), 1'); await sleep(300); return 'F1 did not open it; opened with window.toggleHotkeys()'; },
                close: async () => { await pressEscape(d); }
            },
            {
                name: 'radial-menu', lazyName: 'radial-menu', root: '#radialMenu', state: 'E radial menu open over the canvas', how: 'pointer over the canvas centre, tap E (as F0)',
                open: async () => { await d.ev('document.activeElement && document.activeElement.blur(), 1'); await d.move(canvas.x, canvas.y); await sleep(60); await d.keyDown('e', 'KeyE', 69, [], 'e'); await sleep(40); await d.keyUp('e', 'KeyE', 69); await sleep(300); },
                isOpen: `!!(window.RadialMenu && window.RadialMenu.isOpen && window.RadialMenu.isOpen())`,
                close: async () => { await pressEscape(d); }
            },
            {
                name: 'colour-picker', lazyName: 'colour-picker', root: '.cp-pop', state: 'colour picker popover open from the top bar well', how: 'trusted click on #colorPicker (as F0)',
                open: async () => { const r = await centreOf(d, `document.getElementById('colorPicker')`); if (!r || !r.visible) throw new Error('#colorPicker not visible'); await d.click(r.x, r.y); await sleep(350); },
                isOpen: `!!(document.querySelector('.cp-pop') && document.querySelector('.cp-pop').getClientRects().length)`,
                close: async () => { await pressEscape(d); }
            },
            {
                name: 'presets-popup', lazyName: 'presets-popup', root: '.mixer-presets-panel', state: 'Presets panel open', how: 'trusted click on #mixerPresetsTrigger (as F0)',
                open: async () => { const r = await centreOf(d, `document.getElementById('mixerPresetsTrigger')`); if (!r || !r.visible) throw new Error('#mixerPresetsTrigger not visible'); await d.click(r.x, r.y); await sleep(350); },
                isOpen: `(function(){ var p = document.querySelector('.mixer-presets-panel'); return !!(p && p.style.display !== 'none' && p.getClientRects().length); })()`,
                close: async () => {
                    await pressEscape(d);
                    const still = await d.ev(`(function(){ var p = document.querySelector('.mixer-presets-panel'); return !!(p && p.style.display !== 'none' && p.getClientRects().length); })()`);
                    if (still) { const r = await centreOf(d, `document.getElementById('mixerPresetsTrigger')`); await d.click(r.x, r.y); await sleep(250); return 'Escape did not close it (opened by mouse, focus outside); closed by clicking the trigger again'; }
                    return null;
                }
            },
            {
                name: 'arm-tip-menu', lazyName: 'arm-tip-menu', root: '.arm-tip-menu', state: 'arm 1 tip menu open (extra, not in the brief\'s list)', how: 'trusted click on the first #sidebar-left .arm-tip-btn (as F0)',
                open: async () => { const r = await centreOf(d, `document.querySelector('#sidebar-left .arm-tip-btn')`); if (!r || !r.visible) throw new Error('.arm-tip-btn not visible'); await d.click(r.x, r.y); await sleep(350); },
                isOpen: `!!document.querySelector('.arm-tip-menu')`,
                close: async () => {
                    await pressEscape(d);
                    const still = await d.ev(`!!document.querySelector('.arm-tip-menu')`);
                    if (still) { const r = await centreOf(d, `document.querySelector('#sidebar-left .arm-tip-btn')`); await d.click(r.x, r.y); await sleep(250); return 'Escape did not close it; closed by clicking the square again'; }
                    return null;
                }
            }
        ];
        for (const z of overlays) {
            const run = { name: z.name, state: z.state, how: z.how, root: z.root, opened: false, closed: false, note: null, result: null, deltaVsMain: { violations: [], resolved: [] } };
            try {
                await z.open();
                run.opened = !!(await d.ev(z.isOpen));
                if (!run.opened && z.fallbackOpen) { run.note = await z.fallbackOpen(); run.opened = !!(await d.ev(z.isOpen)); }
                if (!run.opened) problem(z.name + ' did not open (' + z.how + ')');
                else {
                    if (z.lazyName) {
                        const set = await dumpSet(d, z.root, z.name);
                        liveLazy[z.lazyName] = { root: z.root, how: z.how, records: set.records };
                    }
                    try { run.result = await d.ev('window.__a11y.runAxe()'); } catch (e) { problem('axe run with ' + z.name + ' open failed: ' + e.message); }
                    if (run.result) {
                        const keys = violationKeys(run.result);
                        run.deltaVsMain.violations = [...keys].filter(k => !mainKeys.has(k));
                        run.deltaVsMain.resolved = [...mainKeys].filter(k => !keys.has(k));
                        log('  ' + z.name + ': open; ' + run.result.violations.length + ' rules / ' + nodesCount(run.result.violations) + ' nodes, ' + run.deltaVsMain.violations.length + ' new vs main, ' + run.result.ms + ' ms');
                    }
                }
            } catch (e) { problem(z.name + ': ' + (e.message || e)); }
            try {
                const note = await z.close();
                if (note) run.note = (run.note ? run.note + '; ' : '') + note;
                run.closed = !(await d.ev(z.isOpen));
                if (!run.closed) problem(z.name + ' is still open after Escape');
            } catch (e) { problem(z.name + ' close: ' + (e.message || e)); }
            await sleep(150);
            out.runs.push(run);
        }

        out.pageExceptions = d.events.filter(m => m.method === 'Runtime.exceptionThrown').map(m => (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text).slice(0, 20);
        if (out.pageExceptions.length) problem(out.pageExceptions.length + ' page exception(s) during the run; first: ' + out.pageExceptions[0].split('\n')[0]);
    } catch (err) {
        problem('run aborted: ' + (err && err.stack || err));
    } finally {
        await d.close();
    }

    // ── controls-a11y: derive from the F0 record (capture) or the live boot (check)
    ctl.env = out.env;
    const f0Path = path.join(DOM_DIR, 'controls.json');
    let f0 = null;
    if (fs.existsSync(f0Path)) { try { f0 = JSON.parse(fs.readFileSync(f0Path, 'utf8')); } catch (e) { problem('could not read ' + f0Path + ': ' + e.message); } }
    else problem('F0 record missing: ' + f0Path + ' (run prep/scripts/dom-dump.js first); the list is derived from the live boot alone');
    ctl.source = { controls: f0 ? path.relative(ROOT, f0Path) : null, controlsGenerated: f0 ? f0.generated : null, controlsHead: f0 && f0.env ? f0.env.headCommit : null, controlsCount: f0 ? f0.controls.length : 0 };

    function derive(f0Records, liveRecords, label) {
        // Index-aligned when the two lists have the same length and agree on tag/id.
        const rows = [];
        let aligned = !!(f0Records && liveRecords && f0Records.length === liveRecords.length);
        if (aligned) for (let i = 0; i < f0Records.length; i++) { const a = f0Records[i], b = liveRecords[i]; if (a.tag !== b.tag || (a.id || null) !== (b.id || null)) { aligned = false; break; } }
        if (f0Records && liveRecords && !aligned) problem(label + ': the F0 record (' + f0Records.length + ') and the live boot (' + liveRecords.length + ') do not line up; selectors fall back to #id / tag.class and the cross-check is skipped');
        if (CHECK || !f0Records) {
            // The check recomputes everything from the fresh boot.
            (liveRecords || []).forEach(r => rows.push(rowOf(r, r.selector)));
            return rows;
        }
        f0Records.forEach((r, i) => {
            const lv = aligned ? liveRecords[i] : null;
            const row = rowOf(r, lv ? lv.selector : null);
            rows.push(row);
            if (lv) {
                ctl.crossCheck.compared++;
                const lr = rowOf(lv, lv.selector);
                const where = label + '[' + i + '] ' + row.selector;
                if (lr.role !== row.role) ctl.crossCheck.differences.push(where + ': role F0 ' + JSON.stringify(row.role) + ' vs live ' + JSON.stringify(lr.role));
                if (lr.name !== row.name) ctl.crossCheck.differences.push(where + ': name F0 ' + JSON.stringify(row.name) + ' vs live ' + JSON.stringify(lr.name));
                if (JSON.stringify(lr.state) !== JSON.stringify(row.state)) ctl.crossCheck.differences.push(where + ': state F0 ' + JSON.stringify(row.state) + ' vs live ' + JSON.stringify(lr.state));
            }
        });
        return rows;
    }
    ctl.controls = derive(f0 ? f0.controls : null, live, 'controls');
    const LAZY = ['radial-menu', 'colour-picker', 'presets-popup', 'arm-tip-menu'];
    for (const name of LAZY) {
        const lp = path.join(DOM_DIR, 'lazy-' + name + '.json');
        let lz = null;
        if (fs.existsSync(lp)) { try { lz = JSON.parse(fs.readFileSync(lp, 'utf8')); } catch (_) { lz = null; } }
        const lv = liveLazy[name] || null;
        ctl.lazy[name] = { root: (lz && lz.root) || (lv && lv.root) || null, how: (lz && lz.how) || (lv && lv.how) || null, controls: derive(lz ? lz.controls : null, lv ? lv.records : null, 'lazy:' + name) };
    }
    if (ctl.crossCheck.differences.length) problem('live boot vs F0 record: ' + ctl.crossCheck.differences.length + ' difference(s); first: ' + ctl.crossCheck.differences[0]);
    else if (!CHECK && f0) log('cross-check: live role/name/state agree with the F0 record for all ' + ctl.crossCheck.compared + ' compared controls');

    out.problems = problems.slice();
    ctl.problems = problems.slice();
    ctl.keyboardPatterns = Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [k, { kind: v[0], keys: v[1] }]));
    fs.writeFileSync(path.join(OUT_DIR, 'axe.json'), JSON.stringify(out, null, 1));
    fs.writeFileSync(path.join(OUT_DIR, 'axe.md'), writeAxeMarkdown(out));
    fs.writeFileSync(path.join(OUT_DIR, 'controls-a11y.json'), JSON.stringify(ctl, null, 1));
    fs.writeFileSync(path.join(OUT_DIR, 'controls-a11y.md'), writeControlsMarkdown(ctl));
    log('wrote ' + path.relative(ROOT, OUT_DIR) + '/{axe.json, axe.md, controls-a11y.json, controls-a11y.md} (' + ctl.controls.length + ' controls, ' + out.runs.length + ' axe runs)');

    if (CHECK) {
        const diffs = [];
        const info = [];
        const baseAxePath = path.join(BASE_DIR, 'axe.json');
        const baseCtlPath = path.join(BASE_DIR, 'controls-a11y.json');
        if (!fs.existsSync(baseAxePath) || !fs.existsSync(baseCtlPath)) { console.log('CHECK: no baseline in ' + path.relative(ROOT, BASE_DIR)); process.exit(1); }
        const baseAxe = JSON.parse(fs.readFileSync(baseAxePath, 'utf8'));
        const baseCtl = JSON.parse(fs.readFileSync(baseCtlPath, 'utf8'));
        // Gate 1: no new axe violation (rule + target) in any run; resolved ones are information.
        for (const run of out.runs) {
            const b = baseAxe.runs.find(r => r.name === run.name);
            if (!b) { diffs.push('axe run ' + run.name + ': not in the baseline'); continue; }
            if (!run.result || !b.result) { if (!run.result && b.result) diffs.push('axe run ' + run.name + ': produced no result (baseline had one)'); continue; }
            if (!run.opened && b.opened) diffs.push('axe run ' + run.name + ': did not open (it did in the baseline)');
            const bk = violationKeys(b.result), nk = violationKeys(run.result);
            [...nk].filter(k => !bk.has(k)).forEach(k => diffs.push('axe run ' + run.name + ': NEW violation ' + k));
            [...bk].filter(k => !nk.has(k)).forEach(k => info.push('axe run ' + run.name + ': violation no longer reported ' + k));
            const bi = nodesCount(b.result.incomplete), ni = nodesCount(run.result.incomplete);
            if (bi !== ni) info.push('axe run ' + run.name + ': incomplete nodes ' + bi + ' -> ' + ni + ' (not gated)');
        }
        // Gate 2: every control's role, name and state (and the pattern that
        // follows from them) is what the saved list says.
        diffRows('controls', baseCtl.controls, ctl.controls, diffs);
        for (const name of LAZY) {
            const a = (baseCtl.lazy[name] || {}).controls || [], b = (ctl.lazy[name] || {}).controls || [];
            diffRows('lazy:' + name, a, b, diffs);
        }
        info.forEach(x => console.log('  info: ' + x));
        if (diffs.length) {
            console.log('CHECK FAIL: ' + diffs.length + ' difference(s) against ' + path.relative(ROOT, BASE_DIR));
            diffs.slice(0, 80).forEach(x => console.log('  ' + x));
            if (diffs.length > 80) console.log('  ... ' + (diffs.length - 80) + ' more');
            fs.writeFileSync(path.join(OUT_DIR, 'check-result.json'), JSON.stringify({ date: new Date().toISOString(), pass: false, diffs, info }, null, 1));
            process.exit(1);
        }
        const totalV = out.runs.reduce((a, r) => a + (r.result ? nodesCount(r.result.violations) : 0), 0);
        console.log('CHECK PASS: no new axe violation across ' + out.runs.length + ' runs (' + totalV + ' baseline violation nodes still the same set or fewer), ' + ctl.controls.length + ' controls + ' + LAZY.map(n => (ctl.lazy[n].controls || []).length).reduce((a, b) => a + b, 0) + ' lazy controls with identical role / name / state / keyboard pattern' + (info.length ? ' (' + info.length + ' informational change(s) above)' : ''));
        fs.writeFileSync(path.join(OUT_DIR, 'check-result.json'), JSON.stringify({ date: new Date().toISOString(), pass: true, diffs: [], info }, null, 1));
    }
    // A capture with problems still exits 0: the problems are data for NOTES.md.
    process.exit(0);
})();
