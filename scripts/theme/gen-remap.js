// scripts/theme/gen-remap.js — generates css/32-theme-remap.css.
//
// The legacy sheets carry ~1,100 hard-coded colours: blue-black plates, cool
// whites and blue highlights. Rather than restyle each panel by hand, this
// reads the stylesheets as Chrome parsed them (CSSOM: colours come back
// normalised as rgb()/rgba()), and for every declaration that carries one of
// those colours writes a theme rule with the SAME selector, the same @media /
// @supports context and the same value, with only the colours warmed:
//
//   dark, cool or neutral plate  -> walnut glass (same lightness, same alpha)
//   light neutral (text, rims)   -> cream        (same lightness, same alpha)
//   blue / cyan highlight        -> copper       (by lightness, same alpha)
//   anything else (status greens, reds, yellows, purples) -> untouched
//
// Normal declarations go to @layer theme.remap. !important ones go to @layer tokens
// with !important: a later layer cannot beat an earlier layer's !important,
// an earlier one can (cascade-layers rule), and tokens precedes legacy.
//
// Every selector is prefixed with html[data-theme="walnut-copper"], so the
// classic theme is untouched (the screenshot gate proves it).
//
//   node scripts/theme/gen-remap.js            # writes css/32-theme-remap.css
//
// Re-run after editing any legacy sheet. Boots the web build headless through
// the repo's test driver; nothing persists.
'use strict';
const fs = require('fs');
const path = require('path');
const { boot } = require('../test/radial-menu/driver');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'css', '32-theme-remap.css');
const SKIP_FILES = /(00-tokens|01-buttons|slider-styles|3\d-theme[\w-]*)\.css/;
const COLOUR_PROPS = /^(color|background|background-color|background-image|border(-(top|right|bottom|left))?(-color)?|outline(-color)?|box-shadow|text-shadow|fill|stroke|caret-color|text-decoration-color|column-rule-color|-webkit-text-fill-color|accent-color)$/;

const PAGE = String.raw`(function () {
  var out = [];
  function walk(rules, ctx, href) {
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.type === 1) {
        var decls = [];
        for (var j = 0; j < r.style.length; j++) {
          var p = r.style[j];
          decls.push([p, r.style.getPropertyValue(p), r.style.getPropertyPriority(p)]);
        }
        out.push({ href: href, ctx: ctx.slice(), sel: r.selectorText, decls: decls });
      } else if (r.cssRules) {
        var c = null;
        if (r.media) c = '@media ' + r.media.mediaText;
        else if (r.conditionText !== undefined && r.constructor.name === 'CSSSupportsRule') c = '@supports ' + r.conditionText;
        else if (r.constructor.name === 'CSSContainerRule') c = '@container ' + r.containerName + ' ' + r.containerQuery;
        else if (r.constructor.name === 'CSSLayerBlockRule') c = null;   // the layer itself
        else if (r.constructor.name === 'CSSKeyframesRule') continue;
        walk(r.cssRules, c ? ctx.concat([c]) : ctx, href);
      }
    }
  }
  for (var s = 0; s < document.styleSheets.length; s++) {
    var sh = document.styleSheets[s];
    var href = (sh.href || 'inline').split('/').pop();
    try { walk(sh.cssRules, [], href); } catch (e) {}
  }
  return out;
})()`;

// ── colour mapping ──────────────────────────────────────────────────────
const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
function mapRGB(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const v = (r + g + b) / 3;
    const blue = b > r + 30 && b >= g - 10;          // blue / cyan family
    if (blue && sat > 0.25 && max > 70) {
        // highlight -> copper by lightness
        if (v > 150) return [242, 179, 138];          // --cu-hi
        if (v > 80) return [196, 122, 75];            // --cu
        return [120, 64, 34];
    }
    if (sat <= 0.35 || blue) {
        if (v < 70) return [clamp(v * 1.18 + 5), clamp(v * 0.74 + 2), clamp(v * 0.5 + 1)];   // walnut glass
        if (v > 150) return [clamp(v * 0.985), clamp(v * 0.925), clamp(v * 0.85)];          // cream
        return [clamp(v * 1.08 + 4), clamp(v * 0.86), clamp(v * 0.7)];                       // warm mid
    }
    return null;
}
const RGB = /rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*([\d.]+)\s*)?\)/g;
function remapValue(val) {
    let changed = false;
    if (/var\(--sec-|oklch/.test(val)) return null;   // section-tinted: handled by --sec-h below
    const out = val.replace(RGB, (m, r, g, b, a) => {
        const n = mapRGB(+r, +g, +b);
        if (!n) return m;
        changed = true;
        return a !== undefined ? 'rgba(' + n.join(', ') + ', ' + a + ')' : 'rgb(' + n.join(', ') + ')';
    });
    return changed ? out : null;
}

function prefix(sel) {
    return sel.split(/,(?![^(]*\))/).map(s => {
        s = s.trim();
        if (/^html\b/.test(s)) return s.replace(/^html/, 'html[data-theme="walnut-copper"]');
        if (/^:root\b/.test(s)) return s.replace(/^:root/, 'html[data-theme="walnut-copper"]');
        return 'html[data-theme="walnut-copper"] ' + s;
    }).join(',\n');
}

(async () => {
    const d = await boot({ seed: { 'swirlResetHint.v1': '1' } });
    let rules;
    try { rules = await d.ev(PAGE); } finally { await d.close(); }

    const theme = [], important = [];
    let nDecl = 0, files = {};
    for (const r of rules) {
        if (SKIP_FILES.test(r.href) || r.href === 'inline') continue;
        if (!r.sel) continue;
        const norm = [], imp = [];
        for (const [p, v, pri] of r.decls) {
            if (!COLOUR_PROPS.test(p) || p.startsWith('--')) continue;
            const nv = remapValue(v);
            if (!nv) continue;
            (pri === 'important' ? imp : norm).push('    ' + p + ': ' + nv + (pri === 'important' ? ' !important' : '') + ';');
            nDecl++; files[r.href] = (files[r.href] || 0) + 1;
        }
        const wrap = (body) => {
            let block = prefix(r.sel) + ' {\n' + body.join('\n') + '\n}';
            for (let i = r.ctx.length - 1; i >= 0; i--) block = r.ctx[i] + ' {\n' + block.replace(/^/gm, '  ') + '\n}';
            return '/* ' + r.href + ' */\n' + block;
        };
        if (norm.length) theme.push(wrap(norm));
        if (imp.length) important.push(wrap(imp));
    }

    const head = '/* GENERATED by scripts/theme/gen-remap.js — do not edit by hand; re-run it.\n' +
        '   Warms the legacy palette under html[data-theme="walnut-copper"]: dark plates to walnut glass,\n' +
        '   cool whites to cream, blue highlights to copper. ' + nDecl + ' declarations from ' +
        Object.entries(files).map(([f, n]) => f + ' ' + n).join(', ') + '. */\n\n';
    // Nested sub-layer: the hand-designed rules sit directly in @layer theme and
    // always beat theme.remap; theme.remap still beats legacy and keeps the
    // legacy specificity order among its own rules.
    const sec = '@layer theme.remap {\n\n/* Section tints (01-buttons --sec-h/--sec-c) move to the copper hue. */\n' +
        'html[data-theme="walnut-copper"] [data-group],\nhtml[data-theme="walnut-copper"] {\n    --sec-h: 48;\n    --sec-c: 0.07;\n}\n\n' +
        theme.join('\n\n') + '\n\n} /* @layer theme.remap */\n';
    const imp = important.length ? '\n/* !important declarations: only an EARLIER layer can beat legacy !important. */\n@layer tokens {\n\n' + important.join('\n\n') + '\n\n} /* @layer tokens */\n' : '';
    fs.writeFileSync(OUT, head + sec + imp);
    console.log('wrote ' + path.relative(ROOT, OUT) + ': ' + theme.length + ' theme rules, ' + important.length + ' important rules, ' + nDecl + ' declarations');
    console.log(files);
})().catch(e => { console.error(e); process.exit(1); });
