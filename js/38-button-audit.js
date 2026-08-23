// Button-system audit — the acceptance test for css/01-buttons.css.
//
// The unification only holds if no stylesheet outranks the element selector in
// 01-buttons.css. That is invisible by eye (a legacy grey button in a blue
// panel looks like a token bug, not a specificity bug), so this walks the live
// DOM and names the offenders.
//
// Console:
//   auditButtons()            → summary + offending rules, grouped
//   auditButtons({all:true})  → every button, including the clean ones
//
// Dev-only: costs nothing until called.
(function () {
    'use strict';

    var COLOUR_PROPS = ['background', 'background-color', 'background-image',
                        'border', 'border-color', 'border-top-color', 'border-right-color',
                        'border-bottom-color', 'border-left-color', 'color'];

    // Rules that are ALLOWED to colour a button.
    function isSanctioned(href, selector) {
        if (/01-buttons\.css/.test(href || '')) return true;
        // Reserved classes may be declared anywhere, but only these two.
        if (/btn--destructive|btn--record/.test(selector)) return true;
        // The PhotoSafe warning is deliberately exempt: it is the FIRST frame,
        // painted before css/ has loaded, so it cannot depend on the token
        // sheet — and its blue/caution-yellow Continue states carry the
        // protection state itself, which is the reserved test. See
        // js/PhotoSafe + the inline <style> in index.html.
        return /#photoWarn/.test(selector);
    }

    function rulesFor(el) {
        var hits = [];
        function walk(rules, src, cond) {
            for (var i = 0; i < rules.length; i++) {
                var r = rules[i];
                if (r.selectorText) {
                    var matched = false;
                    try { matched = el.matches(r.selectorText); } catch (_) { continue; }
                    if (!matched) continue;
                    var set = [];
                    for (var j = 0; j < COLOUR_PROPS.length; j++) {
                        var v = r.style.getPropertyValue(COLOUR_PROPS[j]);
                        if (v) set.push(COLOUR_PROPS[j]);
                    }
                    if (set.length && !isSanctioned(src, r.selectorText)) {
                        hits.push({ src: src, sel: r.selectorText, props: set, cond: cond || '' });
                    }
                } else if (r.cssRules) {
                    walk(r.cssRules, src, r.conditionText || (r.media && r.media.mediaText) || cond);
                }
            }
        }
        var sheets = document.styleSheets;
        for (var s = 0; s < sheets.length; s++) {
            try { walk(sheets[s].cssRules, (sheets[s].href || 'inline').split('/').pop()); } catch (_) {}
        }
        return hits;
    }

    // An inline style attribute beats every stylesheet, so it is its own class
    // of offender — and the one a CSS grep will never find.
    function inlineColour(el) {
        var out = [];
        for (var i = 0; i < COLOUR_PROPS.length; i++) {
            if (el.style.getPropertyValue(COLOUR_PROPS[i])) out.push(COLOUR_PROPS[i]);
        }
        return out;
    }

    window.auditButtons = function (opts) {
        opts = opts || {};
        var els = document.querySelectorAll('button, .btn');
        var byRule = {};       // "sheet | selector" → count
        var inlineOffenders = [];
        var clean = 0;

        els.forEach(function (el) {
            var inl = inlineColour(el);
            var hits = rulesFor(el);
            if (inl.length) {
                inlineOffenders.push({
                    el: el,
                    id: el.id || el.className || el.textContent.trim().slice(0, 24),
                    props: inl.join(',')
                });
            }
            if (!hits.length && !inl.length) { clean++; return; }
            hits.forEach(function (h) {
                var k = h.src + (h.cond ? ' @' + h.cond : '') + '  |  ' + h.sel;
                if (!byRule[k]) byRule[k] = { n: 0, props: {} };
                byRule[k].n++;
                h.props.forEach(function (p) { byRule[k].props[p] = 1; });
            });
        });

        var ruleList = Object.keys(byRule).map(function (k) {
            return { rule: k, buttons: byRule[k].n, props: Object.keys(byRule[k].props).join(',') };
        }).sort(function (a, b) { return b.buttons - a.buttons; });

        console.log('%c── Button audit ──', 'font-weight:bold');
        console.log(els.length + ' buttons in the DOM · ' + clean + ' clean · ' +
                    (els.length - clean) + ' still coloured by legacy rules');
        if (ruleList.length) {
            console.log('\nLegacy CSS rules to strip (' + ruleList.length + '):');
            console.table(ruleList);
        }
        if (inlineOffenders.length) {
            console.log('\nInline style colours (' + inlineOffenders.length + ') — these beat every stylesheet:');
            console.table(inlineOffenders.map(function (o) { return { button: o.id, props: o.props }; }));
        }
        if (!ruleList.length && !inlineOffenders.length) {
            console.log('%cClean — every button reads its colour from the section tokens.', 'color:#3fb950');
        }

        // Machine-readable, for the harness.
        return {
            total: els.length,
            clean: clean,
            rules: ruleList,
            inline: inlineOffenders.map(function (o) { return { button: o.id, props: o.props }; })
        };
    };

    // Which tint is a given button actually inheriting? Answers "why is this
    // one grey" when the audit says the CSS is clean — the button is outside
    // any [data-group] panel and fell back to the :root system tint.
    window.auditButtonTint = function (sel) {
        var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
        if (!el) return 'not found';
        var cs = getComputedStyle(el);
        var panel = el.closest('[data-group]');
        return {
            h: cs.getPropertyValue('--sec-h').trim(),
            c: cs.getPropertyValue('--sec-c').trim(),
            panel: panel ? panel.dataset.group : '(none — :root fallback)',
            background: cs.backgroundColor,
            border: cs.borderColor,
            color: cs.color
        };
    };
})();
