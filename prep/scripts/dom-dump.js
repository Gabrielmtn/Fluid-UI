// prep/scripts/dom-dump.js — F0 baseline: the live DOM of every interactive
// element, with its computed role and accessible name, for the Walnut & Copper
// prep (prep/briefs/F-baselines.md, F0). Workstreams A, F3 and F4 read the
// output; this script decides nothing and changes nothing outside prep/.
//
//   node prep/scripts/dom-dump.js            capture -> prep/baseline/dom/
//   node prep/scripts/dom-dump.js --check    re-capture into prep/work/dom-check/
//                                            and diff against the baseline
//                                            (exit 1 on any difference)
//
// Boots the web build in its own headless Chrome through the repo driver
// (scripts/test/radial-menu/driver.js: own static server, scratch profile with
// PhotoSafe / the startup fork / the first-run hint already answered), waits
// for the splash and the entrance animations, snapshots what is visible at
// boot, opens the left bar if it is folded, Shift-clicks every sidebar section
// title (trusted input, so the accordion keeps them all open), then enumerates
// every interactive element. Roles and names come from the CDP Accessibility
// tree (Accessibility.getFullAXTree), joined to the elements through
// backendDOMNodeId (DOM.getDocument + DOM.querySelectorAll, same selector,
// same document order); a page-side computation stands in when the AX tree
// ignores a node. Finally the lazily built UI (radial menu, colour picker
// popover, presets popup, arm-tip menu) is opened, dumped and closed with
// Escape, one file each.
//
// Nothing here calls an app setter that persists (GUIDANCE.md §2b): the only
// state changes are trusted clicks on real controls inside the scratch
// profile, which the driver deletes on close.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { boot, sleep } = require('../../scripts/test/radial-menu/driver');

const ROOT = path.resolve(__dirname, '../..');
const BASE_DIR = path.join(ROOT, 'prep', 'baseline', 'dom');
const CHECK = process.argv.includes('--check');
const OUT_DIR = CHECK ? path.join(ROOT, 'prep', 'work', 'dom-check') : BASE_DIR;

// The brief's selector, verbatim, plus the three container classes.
const SEL = 'button, input, select, textarea, a[href], [role], [tabindex], [contenteditable], summary, label, .section-title, .mixer-channel, .sidebar-section';

const problems = [];
function problem(msg) { problems.push(msg); console.log('PROBLEM ' + msg); }
function log(msg) { console.log(msg); }

// ─── page-side library (installed once per boot) ────────────────────────────
// Kept as a string so the file reads top to bottom; `SEL` is injected.
const PAGE_LIB = `(function () {
    var D = window.__dd = window.__dd || {};
    D.SEL = ${JSON.stringify(SEL)};
    D.bootVis = new WeakMap();     // element -> visible at boot
    D.bootSet = new WeakSet();     // present in the DOM at boot
    D.mainSet = new WeakSet();     // present when the main dump ran
    D.visible = function (el) {
        if (!el || !el.getClientRects || !el.getClientRects().length) return false;
        return getComputedStyle(el).visibility !== 'hidden';
    };
    D.text = function (el, max) {
        var t = (el && el.textContent || '').replace(/\\s+/g, ' ').trim();
        return t.length > max ? t.slice(0, max) + '\\u2026' : t;
    };
    D.sig = function (el) {
        var s = el.tagName.toLowerCase();
        if (el.id) s += '#' + el.id;
        var c = (el.getAttribute('class') || '').trim();
        if (c) s += '.' + c.split(/\\s+/).slice(0, 4).join('.');
        return s;
    };
    D.snapshotBoot = function () {
        var n = 0;
        Array.prototype.forEach.call(document.querySelectorAll(D.SEL), function (el) {
            D.bootVis.set(el, D.visible(el)); D.bootSet.add(el); n++;
        });
        return n;
    };
    D.markMain = function () {
        var n = 0;
        Array.prototype.forEach.call(document.querySelectorAll(D.SEL), function (el) { D.mainSet.add(el); n++; });
        return n;
    };
    D.surfaceOf = function (el) {
        var s = el.closest('#mixer-strip, #sidebar-left, #sidebar-right, #canvas-area, #custom-titlebar');
        if (s) return { surface: s.id === 'custom-titlebar' ? 'titlebar' : s.id, root: s };
        var top = el;
        while (top.parentElement && top.parentElement !== document.body) top = top.parentElement;
        if (top === document.body || !top.parentElement) return { surface: 'body', root: document.body };
        if (top.id === 'main-area') return { surface: 'main-area', root: top };
        if (top.id) return { surface: 'overlay:' + top.id, root: top };
        var c = (top.getAttribute('class') || '').trim().split(/\\s+/)[0];
        return { surface: c ? 'overlay:.' + c : 'body', root: top };
    };
    D.sectionTitle = function (sec) { var t = sec.querySelector('.section-title'); return t ? D.text(t, 60) : null; };
    // The channel's visible label: data-ui-label when js/20 set one (the
    // Material channel's label IS the material <select>, whose text would be
    // every option), else the .ch-label text, else the data-ui-key.
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
    D.record = function (el, i) {
        var sf = D.surfaceOf(el);
        var tag = el.tagName.toLowerCase();
        var aria = {}, data = {};
        Array.prototype.forEach.call(el.attributes, function (a) {
            if (a.name.indexOf('aria-') === 0) aria[a.name] = a.value;
            else if (a.name.indexOf('data-') === 0) data[a.name.slice(5)] = a.value;
        });
        var r = el.getBoundingClientRect();
        var chain = [];
        var p = el.parentElement;
        while (p && p !== sf.root && p !== document.body) { chain.push(D.sig(p)); p = p.parentElement; }
        if (p && p === sf.root && sf.root !== document.body) chain.push(D.sig(sf.root));
        var labelFor = null;
        if (el.id) { var lf = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (lf) labelFor = D.text(lf, 120); }
        var labelledBy = null;
        var lb = el.getAttribute('aria-labelledby');
        if (lb) labelledBy = lb.split(/\\s+/).map(function (id) { var e = document.getElementById(id); return e ? D.text(e, 120) : '(missing #' + id + ')'; }).join(' ');
        var wrap = tag !== 'label' ? el.closest('label') : null;
        var isContainer = el.classList.contains('sidebar-section') || el.classList.contains('mixer-channel');
        var rec = {
            order: i,
            surface: sf.surface,
            section: D.sectionOf(el),
            tag: tag,
            type: (tag === 'input' || tag === 'button') ? (el.getAttribute('type') || (tag === 'input' ? 'text' : 'submit')).toLowerCase() : null,
            id: el.id || null,
            classes: (el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean),
            role: null, name: null, nameSource: null,
            roleAttr: el.getAttribute('role'),
            roleFallback: D.implicitRole(el),
            nameFallback: D.fallbackName(el),
            aria: aria,
            dataAttrs: data,
            tabIndex: el.tabIndex,
            tabIndexAttr: el.getAttribute('tabindex'),
            labelFor: labelFor,
            labelledBy: labelledBy,
            wrappingLabel: wrap ? D.text(wrap, 120) : null,
            title: el.getAttribute('title') || null,
            text: isContainer ? null : D.text(el, 80),
            visibleAtBoot: D.bootVis.has(el) ? D.bootVis.get(el) : null,
            presentAtBoot: D.bootSet.has(el),
            visibleNow: D.visible(el),
            hiddenAttr: el.hidden,
            inAriaHidden: !!el.closest('[aria-hidden="true"]'),
            rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
            parentChain: chain
        };
        if (tag === 'a') rec.href = el.getAttribute('href');
        if (tag === 'label') rec.htmlFor = el.getAttribute('for');
        if (tag === 'input' || tag === 'select' || tag === 'textarea') {
            rec.value = el.value;
            rec.nameAttr = el.getAttribute('name');
            rec.placeholder = el.getAttribute('placeholder');
            rec.disabled = !!el.disabled;
            rec.readOnly = !!el.readOnly;
            if (tag === 'input' && (el.type === 'checkbox' || el.type === 'radio')) rec.checked = el.checked;
            if (tag === 'input' && (el.type === 'range' || el.type === 'number')) { rec.min = el.min; rec.max = el.max; rec.step = el.step; }
            if (tag === 'select') {
                rec.options = el.options.length;
                rec.selectedText = el.selectedOptions[0] ? D.text(el.selectedOptions[0], 60) : null;
            }
        }
        if (tag === 'button') rec.disabled = !!el.disabled;
        if (aria['aria-disabled'] === 'true') rec.disabled = true;
        if (el.isContentEditable) rec.contentEditable = true;
        if (el.classList.contains('sidebar-section')) {
            rec.sectionMeta = { title: D.sectionTitle(el), group: el.dataset.group || null, collapsed: el.classList.contains('collapsed') };
        }
        if (el.classList.contains('mixer-channel')) {
            rec.channelMeta = { label: D.channelLabel(el), uiKey: el.dataset.uiKey || null, uiLabel: el.dataset.uiLabel || null };
        }
        return rec;
    };
    // The list the dump enumerates: SEL under root in document order, the root
    // itself first when it matches. The CDP side runs the same query, so the
    // two lists line up index for index.
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
    // Elements matching SEL that were not there when the main dump ran.
    D.collectNew = function () {
        var out = [];
        Array.prototype.forEach.call(document.querySelectorAll(D.SEL), function (el, i) { if (!D.mainSet.has(el)) out.push(D.record(el, i)); });
        return out;
    };
    D.sectionEls = function () {
        var L = Array.prototype.slice.call(document.querySelectorAll('#sidebar-left .sidebar-section'));
        var R = Array.prototype.slice.call(document.querySelectorAll('#sidebar-right .sidebar-section'));
        return L.concat(R);
    };
    D.sectionAt = function (i) { return D.sectionEls()[i]; };
    D.sections = function () {
        return D.sectionEls().map(function (sec, i) {
            var t = sec.querySelector('.section-title');
            return {
                domOrder: i,
                side: sec.closest('#sidebar-left') ? 'left' : 'right',
                title: D.sectionTitle(sec),
                group: sec.dataset.group || null,
                uiKey: sec.dataset.uiKey || null,
                collapsed: sec.classList.contains('collapsed'),
                ariaExpanded: t ? t.getAttribute('aria-expanded') : null,
                displayNone: getComputedStyle(sec).display === 'none',
                hiddenAttr: sec.hidden,
                titleVisible: t ? D.visible(t) : false
            };
        });
    };
    D.overlays = function () {
        var sel = '[role="dialog"], [role="alertdialog"], [aria-modal], [role="menu"], [role="status"], [role="alert"], [aria-live], ' +
            '#hotkeyOverlay, #photoWarn, #splash-screen, #deletePaletteModal, [class*="modal"], [class*="toast"], [class*="popup"], ' +
            '[class$="-pop"], [class*="-pop "], .brush-shape-menu, #recDrawer, #mixer-more-panel, #radialMenu';
        var seen = new Set();
        return Array.prototype.slice.call(document.querySelectorAll(sel)).filter(function (el) { if (seen.has(el)) return false; seen.add(el); return true; }).map(function (el) {
            var withId = el.parentElement ? el.parentElement.closest('[id]') : null;
            return {
                id: el.id || null,
                tag: el.tagName.toLowerCase(),
                classes: (el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean),
                role: el.getAttribute('role'),
                ariaModal: el.getAttribute('aria-modal'),
                ariaLive: el.getAttribute('aria-live'),
                ariaLabel: el.getAttribute('aria-label'),
                hiddenAttr: el.hidden,
                display: getComputedStyle(el).display,
                visibleAtBoot: D.visible(el),
                surface: D.surfaceOf(el).surface,
                parentId: withId ? withId.id : null,
                text: D.text(el, 60)
            };
        });
    };
    return 1;
})()`;

// ─── CDP helpers ─────────────────────────────────────────────────────────────
function attrsOf(node) {
    const o = {};
    const a = node.attributes || [];
    for (let i = 0; i + 1 < a.length; i += 2) o[a[i]] = a[i + 1];
    return o;
}

// The DOM-domain view of the same list: backendNodeIds in document order for
// SEL under rootSel (root first when the page says it matched).
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

// Page records + DOM list + AX tree -> records with role/name filled in.
async function dumpSet(d, rootSel, label) {
    const page = await d.ev(`window.__dd.collect(${JSON.stringify(rootSel || null)})`);
    if (!page) return { records: [], note: 'root not found: ' + rootSel };
    const records = page.records;
    let dom = null;
    try { dom = await domList(d, rootSel, page.rootIncluded); } catch (e) { problem(label + ': DOM.getDocument/querySelectorAll failed (' + e.message + '); roles and names fall back to the page-side computation'); }
    let aligned = !!dom && dom.length === records.length;
    if (dom && !aligned) problem(label + ': page list has ' + records.length + ' elements, CDP list has ' + dom.length + '; roles and names fall back to the page-side computation');
    if (aligned) {
        for (let i = 0; i < records.length; i++) {
            const n = dom[i];
            if (!n || n.tag !== records[i].tag || (n.id || '') !== (records[i].id || '')) {
                problem(label + ': page/CDP lists diverge at index ' + i + ' (' + records[i].tag + '#' + records[i].id + ' vs ' + (n ? n.tag + '#' + n.id : 'null') + '); falling back to page-side roles/names');
                aligned = false; break;
            }
        }
    }
    let ax = null;
    if (aligned) {
        try { ax = await axTree(d); } catch (e) { problem(label + ': Accessibility.getFullAXTree failed (' + e.message + ')'); }
    }
    const stats = { cdp: 0, ignored: 0, noAxNode: 0, fallback: 0 };
    for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        const n = aligned && ax ? ax.map.get(dom[i].backendId) : null;
        if (n && !n.ignored) {
            rec.role = n.role ? n.role.value : null;
            rec.name = n.name ? n.name.value : '';
            rec.nameSource = 'cdp';
            stats.cdp++;
            // Keep the useful AX properties (expanded, pressed, checked, disabled, focusable...).
            if (n.properties && n.properties.length) {
                const p = {};
                n.properties.forEach(pr => { if (pr.value && pr.value.value !== undefined) p[pr.name] = pr.value.value; });
                rec.axProps = p;
            }
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

// A record that never met the AX tree (collectNew): page-side role and name.
function finishFallback(rec) {
    rec.role = rec.roleAttr || rec.roleFallback;
    rec.name = rec.nameFallback;
    rec.nameSource = 'fallback:not-mapped';
    delete rec.roleFallback; delete rec.nameFallback;
    return rec;
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
    // expr evaluates to an element; scroll it into view (instantly) and return its centre.
    return d.ev(`(function(){ var el = ${expr}; if (!el) return null; try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); } catch (_) { el.scrollIntoView(); }
        var r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), visible: window.__dd.visible(el) }; })()`);
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

async function pressEscape(d) { await d.tap('Escape', 'Escape', 27); await sleep(200); }

// ─── markdown ────────────────────────────────────────────────────────────────
const esc = s => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const cut = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
function countBy(list, fn) {
    const m = new Map();
    list.forEach(x => { const k = fn(x); m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()];
}
function tally(rows, head) {
    return ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|'].concat(rows.map(r => '| ' + r.map(esc).join(' | ') + ' |')).join('\n');
}

function writeMarkdown(out) {
    const c = out.controls;
    const L = [];
    L.push('# DOM dump — every interactive element of the shipping UI');
    L.push('');
    L.push('Generated ' + out.generated + ' by `prep/scripts/dom-dump.js` (F0). Machine copy: `controls.json`; lazily built UI in `lazy-*.json`. Notes and caveats: `NOTES.md`.');
    L.push('');
    L.push('## Environment');
    L.push('');
    L.push(tally(Object.entries(out.env).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v]), ['Fact', 'Value']));
    L.push('');
    L.push('## Counts');
    L.push('');
    L.push('- controls: **' + c.length + '** (' + c.filter(x => x.nameSource === 'cdp').length + ' with role/name from the CDP accessibility tree, ' + c.filter(x => x.nameSource !== 'cdp').length + ' from the page-side fallback)');
    L.push('- sections: **' + out.sections.length + '** (' + out.sections.filter(s => s.side === 'left').length + ' left, ' + out.sections.filter(s => s.side === 'right').length + ' right); all open for the dump: ' + (out.allSectionsOpen ? 'yes' : 'NO, see NOTES.md'));
    L.push('- visible at boot: ' + c.filter(x => x.visibleAtBoot === true).length + '; hidden at boot: ' + c.filter(x => x.visibleAtBoot === false).length + '; created after boot (by opening): ' + c.filter(x => x.visibleAtBoot === null).length);
    L.push('- overlays present in the DOM at boot: ' + out.overlaysAtBoot.length);
    L.push('');
    L.push('### Per surface');
    L.push('');
    L.push(tally(countBy(c, x => x.surface).sort((a, b) => b[1] - a[1]), ['Surface', 'Controls']));
    L.push('');
    L.push('### Per role');
    L.push('');
    L.push(tally(countBy(c, x => x.role || '(none)').sort((a, b) => b[1] - a[1]), ['Role', 'Controls']));
    L.push('');
    L.push('### Per element');
    L.push('');
    L.push(tally(countBy(c, x => x.tag + (x.type && x.tag === 'input' ? '[' + x.type + ']' : '')).sort((a, b) => b[1] - a[1]), ['Element', 'Controls']));
    L.push('');
    L.push('### Per section (controls inside each `.sidebar-section` / `.mixer-channel`, the container itself included)');
    L.push('');
    L.push(tally(countBy(c, x => (x.section == null ? '(none)' : x.surface + ' › ' + x.section)), ['Surface › section', 'Controls']));
    L.push('');
    L.push('## Sections (DOM order, left sidebar first)');
    L.push('');
    L.push(tally(out.sections.map(s => [s.domOrder, s.side, s.title, s.group, s.uiKey, s.collapsed ? 'collapsed' : 'open', s.ariaExpanded, s.displayNone ? 'display:none' : (s.titleVisible ? 'visible' : 'not visible'), (out.sectionOpenLog.find(o => o.domOrder === s.domOrder) || {}).action || '', (out.sectionOpenLog.find(o => o.domOrder === s.domOrder) || {}).ok ? 'open' : 'NOT open']),
        ['#', 'Side', 'Title', 'data-group', 'data-ui-key', 'At boot', 'aria-expanded at boot', 'Visibility at boot', 'How opened', 'After']));
    L.push('');
    L.push('## Overlays, dialogs and live regions in the DOM at boot');
    L.push('');
    L.push(tally(out.overlaysAtBoot.map(o => [o.id ? '#' + o.id : '', o.tag, o.classes.join(' '), o.role || '', o.ariaModal || '', o.ariaLive || '', o.hiddenAttr ? 'hidden' : '', o.display, o.visibleAtBoot ? 'yes' : 'no', o.surface, cut(o.text, 40)]),
        ['id', 'tag', 'classes', 'role', 'aria-modal', 'aria-live', 'hidden attr', 'display', 'visible at boot', 'surface', 'text']));
    L.push('');
    L.push('## Lazily built UI (one file each)');
    L.push('');
    L.push(tally(out.lazy.map(z => [z.name, z.file, z.opened ? 'yes' : 'NO', z.how, z.root, z.count, z.outsideRoot, z.closed ? 'yes' : 'NO', z.rootInDomAfterClose === null ? '?' : (z.rootInDomAfterClose ? 'stays (hidden)' : 'removed')]), ['Name', 'File', 'Opened', 'How', 'Root', 'Controls in root', 'New elements outside root', 'Closed', 'Root after close']));
    L.push('');
    L.push('## All controls (document order)');
    L.push('');
    L.push('Columns: order; surface; section; element (tag[type]); id; classes (first three); role; name (source: c = CDP AX tree, f = page fallback); aria-* (k=v); value / checked; tabindex; visible at boot (Y/N, – = created later).');
    L.push('');
    const head = ['#', 'Surface', 'Section', 'Element', 'id', 'Classes', 'Role', 'Name', 'aria-*', 'Value', 'tabindex', 'Boot'];
    L.push('| ' + head.join(' | ') + ' |');
    L.push('|' + head.map(() => '---').join('|') + '|');
    for (const x of c) {
        const cls = x.classes.slice(0, 3).join(' ') + (x.classes.length > 3 ? ' +' + (x.classes.length - 3) : '');
        const aria = Object.entries(x.aria).map(([k, v]) => k.replace(/^aria-/, '') + '=' + cut(v, 24)).join(' ');
        let val = '';
        if (x.checked !== undefined) val = x.checked ? 'checked' : 'unchecked';
        else if (x.value !== undefined) val = cut(x.value, 24);
        if (x.disabled) val += (val ? ' ' : '') + 'disabled';
        const boot = x.visibleAtBoot === null ? '–' : (x.visibleAtBoot ? 'Y' : 'N');
        L.push('| ' + [x.order, x.surface, cut(x.section, 24), x.tag + (x.tag === 'input' ? '[' + x.type + ']' : ''), x.id ? '#' + x.id : '', cut(cls, 40), x.role, cut(x.name, 40) + (x.nameSource === 'cdp' ? ' (c)' : ' (f)'), cut(aria, 60), val, x.tabIndexAttr == null ? '' : x.tabIndexAttr, boot].map(esc).join(' | ') + ' |');
    }
    L.push('');
    return L.join('\n');
}

// ─── --check projection ──────────────────────────────────────────────────────
// What a re-run must reproduce: everything except the environment line, the
// AX property bag, the value of colour wells (the brush colour can start
// Random) and the FPS Limit select's options and value, which follow the
// display refresh rate the app measures at boot (js/05j-update-loop.js
// displayHz; 144 Hz in one headless run, 120 Hz in the next). Rects ARE
// compared: with both bars scrolled to the top they were identical across runs.
function projectControl(x) {
    const o = Object.assign({}, x);
    delete o.axProps;
    if (o.tag === 'input' && o.type === 'color') delete o.value;
    if (o.id === 'fpsCap') { delete o.value; delete o.text; delete o.selectedText; }
    return o;
}
function project(json) {
    return {
        sections: json.sections.map(s => Object.assign({}, s)),
        overlaysAtBoot: json.overlaysAtBoot,
        allSectionsOpen: json.allSectionsOpen,
        controls: json.controls.map(projectControl),
        lazy: (json.lazy || []).map(z => ({ name: z.name, opened: z.opened, count: z.count, outsideRoot: z.outsideRoot }))
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
    // Scratch-profile seed on top of the driver's own (PhotoSafe, startup fork,
    // first-run hint): the one-time Reset-app note (js/60-reset-app.js:54,
    // shown ~4 s after a quiet boot for 30 s) would otherwise be in or out of
    // the dump depending on timing.
    const d = await boot({ seed: { 'swirlResetHint.v1': '1' } });
    const out = { generated: started.toISOString(), env: {}, counts: {}, sections: [], sectionOpenLog: [], allSectionsOpen: false, overlaysAtBoot: [], controls: [], lazy: [], problems: [], pageExceptions: [] };
    try {
        const anims = await waitAnimations(d, 5000);
        if (anims !== 0) problem('entrance animations still running after 5 s (getAnimations().length = ' + anims + ')');
        await sleep(300);

        // Environment facts.
        const ver = await d.send('Browser.getVersion');
        const pageEnv = await d.ev(`(function(){ var u = window.UIVisibility || {}; var cur = null; try { cur = typeof u.current === 'function' ? u.current() : (typeof u.mode === 'function' ? u.mode() : null); } catch (_) {}
            return { innerWidth: innerWidth, innerHeight: innerHeight, dpr: devicePixelRatio, uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim() || null,
                url: location.href, layoutChoice: (function(){ try { return localStorage.getItem('ui.layoutChoice') || (window.settingsManager && window.settingsManager.get && window.settingsManager.get('ui.layoutChoice', null)) || null; } catch (_) { return null; } })(),
                uiVisibilityState: cur, hiddenUiKeys: Array.prototype.slice.call(document.querySelectorAll('[data-ui-key]')).filter(function(e){ return getComputedStyle(e).display === 'none'; }).map(function(e){ return e.dataset.uiKey; }),
                titlebarPresent: !!document.getElementById('custom-titlebar'), titlebarVisible: !!(document.getElementById('custom-titlebar') && document.getElementById('custom-titlebar').getClientRects().length),
                bodyClasses: document.body.className, leftFolded: !!(window.Sidebars && window.Sidebars.left && window.Sidebars.left.isCollapsed()), rightFolded: !!(window.Sidebars && window.Sidebars.right && window.Sidebars.right.isCollapsed()) }; })()`);
        out.env = Object.assign({ date: started.toISOString(), headCommit: head, chrome: ver.product, userAgent: ver.userAgent, protocol: ver.protocolVersion, node: process.version, build: 'web build in headless Chrome (driver window 1600x900, scratch profile)', selector: SEL }, pageEnv);
        log('env: ' + ver.product + ', viewport ' + pageEnv.innerWidth + 'x' + pageEnv.innerHeight + ' @' + pageEnv.dpr + ', --ui-scale ' + pageEnv.uiScale + ', HEAD ' + head.slice(0, 7));

        // Page library, boot snapshot, sections and overlays as they are at boot.
        await d.ev(PAGE_LIB);
        const nBoot = await d.ev('window.__dd.snapshotBoot()');
        out.sections = await d.ev('window.__dd.sections()');
        out.overlaysAtBoot = await d.ev('window.__dd.overlays()');
        log('at boot: ' + nBoot + ' matching elements, ' + out.sections.length + ' sections (' + out.sections.filter(s => s.collapsed).length + ' collapsed), ' + out.overlaysAtBoot.length + ' overlays/live regions');
        if (out.sections.filter(s => s.side === 'left').length === 0) problem('no .sidebar-section found under #sidebar-left');
        if (out.sections.filter(s => s.side === 'right').length === 0) problem('no .sidebar-section found under #sidebar-right');

        // Left bar folded? Open it with its rail button (a real click).
        if (pageEnv.leftFolded) {
            const r = await centreOf(d, `document.querySelector('#sidebar-left .lsb-rail-label')`);
            if (r) { await d.click(r.x, r.y); await sleep(300); }
            const still = await d.ev('window.Sidebars.left.isCollapsed()');
            out.sectionOpenLog.push({ domOrder: -1, title: '(left sidebar)', action: 'folded at boot; clicked .lsb-rail-label', ok: !still });
            if (still) problem('left sidebar stayed folded after clicking its rail label');
        }
        if (pageEnv.rightFolded) problem('right sidebar is folded at 1600 px wide (compact mode?); sections may not open');

        // Open every section: Shift-click the title (trusted), verify aria-expanded.
        for (const s of out.sections) {
            const entry = { domOrder: s.domOrder, side: s.side, title: s.title, action: '', ok: false };
            if (!s.collapsed) { entry.action = 'already open at boot'; entry.ok = true; out.sectionOpenLog.push(entry); continue; }
            if (s.displayNone || s.hiddenAttr) { entry.action = 'hidden (display:none / hidden attr) — not opened'; out.sectionOpenLog.push(entry); problem('section "' + s.title + '" is hidden at boot and was not opened'); continue; }
            const r = await centreOf(d, `window.__dd.sectionAt(${s.domOrder}).querySelector('.section-title')`);
            await sleep(80);
            const r2 = await centreOf(d, `window.__dd.sectionAt(${s.domOrder}).querySelector('.section-title')`);
            let how = 'trusted Shift-click on .section-title';
            if (r2 && r2.visible) await shiftClick(d, r2.x, r2.y); else how = 'title not visible; ';
            await sleep(250);
            let exp = await d.ev(`window.__dd.sectionAt(${s.domOrder}).querySelector('.section-title').getAttribute('aria-expanded')`);
            if (exp !== 'true') {
                await d.ev(`(function(){ var sec = window.__dd.sectionAt(${s.domOrder}); sec.querySelector('.section-header').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true })); return 1; })()`);
                await sleep(250);
                exp = await d.ev(`window.__dd.sectionAt(${s.domOrder}).querySelector('.section-title').getAttribute('aria-expanded')`);
                how += 'synthetic Shift-click on .section-header (the trusted click did not open it)';
            }
            entry.action = how; entry.ok = exp === 'true';
            if (!entry.ok) problem('section "' + s.title + '" (' + s.side + ') would not open (aria-expanded=' + exp + ')');
            out.sectionOpenLog.push(entry);
            void r;
        }
        await sleep(500);
        const after = await d.ev('window.__dd.sections()');
        out.allSectionsOpen = after.every(s => s.ariaExpanded === 'true' && !s.collapsed);
        after.forEach(s => { const e = out.sectionOpenLog.find(o => o.domOrder === s.domOrder); if (e) { e.ariaExpandedAfter = s.ariaExpanded; e.ok = e.ok && s.ariaExpanded === 'true'; } });
        log('sections open: ' + after.filter(s => s.ariaExpanded === 'true').length + '/' + after.length + (out.allSectionsOpen ? ' (all)' : ' (NOT all)'));
        if (!out.allSectionsOpen) problem('not every section reports aria-expanded="true" after opening: ' + after.filter(s => s.ariaExpanded !== 'true').map(s => s.title).join(', '));
        // Scroll both bars (whichever element inside them scrolls) back to the
        // top, so rects are measured from a known scroll position: opening
        // the last section leaves the bar scrolled to it, and where exactly
        // drifted by 46 px between two runs.
        // Instant, not smooth (css scroll-behavior would animate the reset and
        // the dump could measure mid-flight).
        const scrolled = await d.ev(`(function(){ var out = []; ['#sidebar-left', '#sidebar-right'].forEach(function (s) { var bar = document.querySelector(s); if (!bar) return;
            [bar].concat(Array.prototype.slice.call(bar.querySelectorAll('*'))).forEach(function (el) { if (el.scrollTop > 0) { out.push(window.__dd.sig(el) + ' scrollTop=' + el.scrollTop);
                var prev = el.style.scrollBehavior; el.style.scrollBehavior = 'auto'; el.scrollTop = 0; el.style.scrollBehavior = prev; } }); }); return out; })()`);
        await sleep(400);
        const still = await d.ev(`(function(){ var out = []; ['#sidebar-left', '#sidebar-right'].forEach(function (s) { var bar = document.querySelector(s); if (!bar) return;
            [bar].concat(Array.prototype.slice.call(bar.querySelectorAll('*'))).forEach(function (el) { if (el.scrollTop > 0) out.push(window.__dd.sig(el) + ' scrollTop=' + el.scrollTop); }); }); return out; })()`);
        out.scrollReset = { reset: scrolled, stillScrolled: still };
        if (still.length) problem('a sidebar scroller did not return to the top before the dump: ' + still.join(', '));

        // The main dump.
        await d.send('DOM.enable');
        await d.send('Accessibility.enable');
        const main = await dumpSet(d, null, 'main dump');
        out.controls = main.records;
        out.counts = {
            controls: out.controls.length,
            sections: out.sections.length,
            axTreeNodes: main.axTotal,
            nameSource: main.stats,
            perSurface: Object.fromEntries(countBy(out.controls, x => x.surface)),
            perRole: Object.fromEntries(countBy(out.controls, x => x.role || '(none)')),
            perSection: Object.fromEntries(countBy(out.controls, x => x.section == null ? '(none)' : x.surface + ' > ' + x.section))
        };
        await d.ev('window.__dd.markMain()');
        log('main dump: ' + out.controls.length + ' controls; role/name from CDP for ' + main.stats.cdp + ', fallback for ' + (out.controls.length - main.stats.cdp) + ' (AX tree ' + main.axTotal + ' nodes)');

        // Lazily built UI.
        const canvas = await d.ev(`(function(){ var c = document.getElementById('canvas') || document.querySelector('#canvas-area canvas'); var r = c.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
        const lazies = [
            {
                name: 'radial-menu', root: '#radialMenu', how: 'pointer over the canvas centre, tap E',
                open: async () => { await d.ev('document.activeElement && document.activeElement.blur(), 1'); await d.move(canvas.x, canvas.y); await sleep(60); await d.keyDown('e', 'KeyE', 69, [], 'e'); await sleep(40); await d.keyUp('e', 'KeyE', 69); await sleep(250); },
                isOpen: `!!(window.RadialMenu && window.RadialMenu.isOpen && window.RadialMenu.isOpen())`,
                close: async () => { await pressEscape(d); }
            },
            {
                name: 'colour-picker', root: '.cp-pop', how: 'trusted click on the top bar colour well #colorPicker',
                open: async () => { const r = await centreOf(d, `document.getElementById('colorPicker')`); if (!r || !r.visible) throw new Error('#colorPicker not visible'); await d.click(r.x, r.y); await sleep(300); },
                isOpen: `!!(document.querySelector('.cp-pop') && document.querySelector('.cp-pop').getClientRects().length)`,
                close: async () => { await pressEscape(d); }
            },
            {
                name: 'presets-popup', root: '.mixer-presets-panel', how: 'trusted click on #mixerPresetsTrigger',
                open: async () => { const r = await centreOf(d, `document.getElementById('mixerPresetsTrigger')`); if (!r || !r.visible) throw new Error('#mixerPresetsTrigger not visible'); await d.click(r.x, r.y); await sleep(300); },
                isOpen: `(function(){ var p = document.querySelector('.mixer-presets-panel'); return !!(p && p.style.display !== 'none' && p.getClientRects().length); })()`,
                close: async () => {
                    await pressEscape(d);
                    const still = await d.ev(`(function(){ var p = document.querySelector('.mixer-presets-panel'); return !!(p && p.style.display !== 'none' && p.getClientRects().length); })()`);
                    if (still) { const r = await centreOf(d, `document.getElementById('mixerPresetsTrigger')`); await d.click(r.x, r.y); await sleep(250); return 'Escape did not close it (opened by mouse, focus outside); closed by clicking the trigger again'; }
                    return null;
                }
            },
            {
                name: 'arm-tip-menu', root: '.arm-tip-menu', how: 'trusted click on the first .arm-tip-btn in the Multi-Brush section',
                open: async () => { const r = await centreOf(d, `document.querySelector('#sidebar-left .arm-tip-btn')`); if (!r || !r.visible) throw new Error('.arm-tip-btn not visible'); await d.click(r.x, r.y); await sleep(300); },
                isOpen: `!!document.querySelector('.arm-tip-menu')`,
                close: async () => {
                    await pressEscape(d);
                    const still = await d.ev(`!!document.querySelector('.arm-tip-menu')`);
                    if (still) { const r = await centreOf(d, `document.querySelector('#sidebar-left .arm-tip-btn')`); await d.click(r.x, r.y); await sleep(250); return 'Escape did not close it; closed by clicking the square again'; }
                    return null;
                }
            }
        ];
        for (const z of lazies) {
            const file = 'lazy-' + z.name + '.json';
            const rec = { name: z.name, generated: out.generated, env: out.env, root: z.root, how: z.how, opened: false, closed: false, count: 0, outsideRoot: 0, controls: [], newOutsideRoot: [], problems: [], file };
            try {
                await z.open();
                rec.opened = !!(await d.ev(z.isOpen));
                if (!rec.opened) { rec.problems.push('did not open (' + z.how + ')'); problem(z.name + ' did not open (' + z.how + ')'); }
                else {
                    const set = await dumpSet(d, z.root, z.name);
                    rec.controls = set.records; rec.count = set.records.length; rec.stats = set.stats;
                    if (set.note) rec.problems.push(set.note);
                    // Elements that appeared with the popup but live outside its root
                    // (body-mounted helpers such as a loupe or a note).
                    const fresh = await d.ev('window.__dd.collectNew()');
                    const token = z.root.slice(1);
                    const inRoot = x => (z.root[0] === '#' ? x.id === token : x.classes.indexOf(token) >= 0) || (x.parentChain || []).some(p => p.indexOf(token) >= 0);
                    rec.newOutsideRoot = fresh.filter(x => !inRoot(x)).map(finishFallback);
                    rec.outsideRoot = rec.newOutsideRoot.length;
                    log(z.name + ': open, ' + rec.count + ' controls in ' + z.root + ', ' + rec.outsideRoot + ' new elements outside it');
                }
            } catch (e) { rec.problems.push(String(e.message || e)); problem(z.name + ': ' + (e.message || e)); }
            try {
                const note = await z.close();
                if (note) rec.problems.push(note);
                rec.closed = !(await d.ev(z.isOpen));
                if (!rec.closed) { rec.problems.push('still open after Escape'); problem(z.name + ' is still open after Escape'); }
            } catch (e) { rec.problems.push('close: ' + (e.message || e)); }
            await sleep(150);
            // Does the popup's root outlive it (kept hidden) or go away?
            rec.rootInDomAfterClose = await d.ev(`!!document.querySelector(${JSON.stringify(z.root)})`).catch(() => null);
            // Whatever this popup left in the DOM is not "new" for the next one.
            await d.ev('window.__dd.markMain()');
            fs.writeFileSync(path.join(OUT_DIR, file), JSON.stringify(rec, null, 1));
            out.lazy.push({ name: z.name, file, opened: rec.opened, how: z.how, root: z.root, count: rec.count, outsideRoot: rec.outsideRoot, closed: rec.closed, rootInDomAfterClose: rec.rootInDomAfterClose, problems: rec.problems });
        }

        out.pageExceptions = d.events.filter(m => m.method === 'Runtime.exceptionThrown').map(m => (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text).slice(0, 20);
        if (out.pageExceptions.length) problem(out.pageExceptions.length + ' page exception(s) during the run; first: ' + out.pageExceptions[0].split('\n')[0]);
    } catch (err) {
        problem('run aborted: ' + (err && err.stack || err));
    } finally {
        await d.close();
    }
    out.problems = problems.slice();
    fs.writeFileSync(path.join(OUT_DIR, 'controls.json'), JSON.stringify(out, null, 1));
    fs.writeFileSync(path.join(OUT_DIR, 'controls.md'), writeMarkdown(out));
    log('wrote ' + path.relative(ROOT, path.join(OUT_DIR, 'controls.json')) + ' (' + out.controls.length + ' controls, ' + out.sections.length + ' sections) and controls.md');
    log('sections: ' + out.sections.map(s => s.title).join(' | '));

    if (CHECK) {
        const basePath = path.join(BASE_DIR, 'controls.json');
        if (!fs.existsSync(basePath)) { console.log('CHECK: no baseline at ' + basePath); process.exit(1); }
        const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
        const diffs = [];
        diff(project(base), project(out), 'controls.json', diffs);
        for (const z of out.lazy) {
            const bp = path.join(BASE_DIR, z.file);
            if (!fs.existsSync(bp)) { diffs.push(z.file + ': missing in baseline'); continue; }
            const bz = JSON.parse(fs.readFileSync(bp, 'utf8'));
            const nz = JSON.parse(fs.readFileSync(path.join(OUT_DIR, z.file), 'utf8'));
            diff({ opened: bz.opened, controls: bz.controls.map(projectControl) }, { opened: nz.opened, controls: nz.controls.map(projectControl) }, z.file, diffs);
        }
        if (diffs.length) {
            console.log('CHECK FAIL: ' + diffs.length + ' difference(s) against ' + path.relative(ROOT, BASE_DIR));
            diffs.slice(0, 60).forEach(x => console.log('  ' + x));
            if (diffs.length > 60) console.log('  ... ' + (diffs.length - 60) + ' more');
            process.exit(1);
        }
        console.log('CHECK PASS: ' + out.controls.length + ' controls, ' + out.sections.length + ' sections, ' + out.lazy.length + ' lazy dumps identical to the baseline (env, colour-well values and the #fpsCap options excluded; rects included)');
    }
    // A capture with problems still exits 0: the problems are data for NOTES.md.
    process.exit(0);
})();
