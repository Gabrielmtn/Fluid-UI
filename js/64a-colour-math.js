// ═══════════════════════════════════════════════════════════════════
// 64a-colour-math.js — colour conversions shared by the colour picker
// (64-colour-picker.js) and palette-from-image (65-palette-from-image.js).
//
// PROVIDES: window.ColourMath (also module.exports, so Node tests can load it)
//
// OKLab / OKLCH after Björn Ottosson (bottosson.github.io/posts/oklab).
// OKLCH is the picker's default space because equal steps LOOK equal: an
// HSL lightness of 50 is near-black for blue and glaring for yellow, an
// OKLCH lightness of 0.6 reads the same for both.
//
// Units: rgb channels 0-1 (sRGB, gamma-encoded) unless a name says 255;
// L 0-1, C 0-~0.37, H degrees 0-360; HSL h degrees, s and l 0-1.
// ═══════════════════════════════════════════════════════════════════
(function (root) {
    'use strict';

    function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

    function hexToRgb(hex) {
        var h = String(hex || '').trim().replace(/^#/, '');
        if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
        if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
        return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
    }
    function rgbToHex(rgb) {
        var out = '#';
        for (var i = 0; i < 3; i++) {
            var v = Math.round(clamp01(rgb[i]) * 255);
            out += (v < 16 ? '0' : '') + v.toString(16);
        }
        return out.toUpperCase();
    }
    // '#abc', 'abc', '#AABBCC' → '#AABBCC'; anything else → null
    function normalizeHex(hex) {
        var rgb = hexToRgb(hex);
        return rgb ? rgbToHex(rgb) : null;
    }

    function toLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    function toGamma(c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }

    function rgbToOklab(rgb) {
        var r = toLinear(rgb[0]), g = toLinear(rgb[1]), b = toLinear(rgb[2]);
        var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
        var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
        var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
        return [
            0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
        ];
    }
    // Unclamped: a result outside 0-1 is out of the sRGB gamut.
    function oklabToRgbRaw(lab) {
        var L = lab[0], a = lab[1], b = lab[2];
        var l = L + 0.3963377774 * a + 0.2158037573 * b;
        var m = L - 0.1055613458 * a - 0.0638541728 * b;
        var s = L - 0.0894841775 * a - 1.2914855480 * b;
        l = l * l * l; m = m * m * m; s = s * s * s;
        var r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
        var g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
        var bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
        return [toGammaSigned(r), toGammaSigned(g), toGammaSigned(bb)];
    }
    function toGammaSigned(c) { return c < 0 ? -toGamma(-c) : toGamma(c); }

    function oklabToOklch(lab) {
        var C = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]);
        var H = Math.atan2(lab[2], lab[1]) * 180 / Math.PI;
        if (H < 0) H += 360;
        return [lab[0], C, H];
    }
    function oklchToOklab(lch) {
        var h = lch[2] * Math.PI / 180;
        return [lch[0], lch[1] * Math.cos(h), lch[1] * Math.sin(h)];
    }
    function rgbToOklch(rgb) { return oklabToOklch(rgbToOklab(rgb)); }
    function oklchToRgbRaw(lch) { return oklabToRgbRaw(oklchToOklab(lch)); }

    var EPS = 1e-4;
    function inGamut(rgb) {
        return rgb[0] >= -EPS && rgb[0] <= 1 + EPS && rgb[1] >= -EPS && rgb[1] <= 1 + EPS && rgb[2] >= -EPS && rgb[2] <= 1 + EPS;
    }
    function oklchInGamut(lch) { return inGamut(oklchToRgbRaw(lch)); }

    // CSS Color 4's idea, simplified: keep lightness and hue, lower chroma
    // until the colour fits sRGB. Returns the mapped [L, C, H].
    function gamutMapOklch(lch) {
        var L = Math.max(0, Math.min(1, lch[0]));
        if (L <= 0) return [0, 0, lch[2]];
        if (L >= 1) return [1, 0, lch[2]];
        if (oklchInGamut([L, lch[1], lch[2]])) return [L, lch[1], lch[2]];
        var lo = 0, hi = lch[1];
        for (var i = 0; i < 22; i++) {
            var mid = (lo + hi) / 2;
            if (oklchInGamut([L, mid, lch[2]])) lo = mid; else hi = mid;
        }
        return [L, lo, lch[2]];
    }
    function oklchToHex(lch) {
        var mapped = gamutMapOklch(lch);
        return rgbToHex(oklchToRgbRaw(mapped).map(clamp01));
    }
    function hexToOklch(hex) {
        var rgb = hexToRgb(hex);
        return rgb ? rgbToOklch(rgb) : null;
    }

    function rgbToHsl(rgb) {
        var r = rgb[0], g = rgb[1], b = rgb[2];
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var l = (max + min) / 2, h = 0, s = 0, d = max - min;
        if (d > 1e-9) {
            s = d / (1 - Math.abs(2 * l - 1));
            if (max === r) h = ((g - b) / d) % 6;
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60;
            if (h < 0) h += 360;
        }
        return [h, clamp01(s), clamp01(l)];
    }
    function hslToRgb(hsl) {
        var h = ((hsl[0] % 360) + 360) % 360, s = clamp01(hsl[1]), l = clamp01(hsl[2]);
        var c = (1 - Math.abs(2 * l - 1)) * s;
        var x = c * (1 - Math.abs((h / 60) % 2 - 1));
        var m = l - c / 2, r, g, b;
        if (h < 60) { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        return [r + m, g + m, b + m];
    }

    // Perceived difference (ΔE OK). About 0.02 is the smallest step most
    // people notice.
    function deltaE(hexA, hexB) {
        var a = hexToRgb(hexA), b = hexToRgb(hexB);
        if (!a || !b) return Infinity;
        var p = rgbToOklab(a), q = rgbToOklab(b);
        return Math.sqrt((p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]) + (p[2] - q[2]) * (p[2] - q[2]));
    }

    // Black or white, whichever reads on this background.
    function inkFor(hex) {
        var lch = hexToOklch(hex);
        return lch && lch[0] > 0.66 ? '#0A0B0E' : '#F2F3F5';
    }

    var ColourMath = {
        clamp01: clamp01,
        hexToRgb: hexToRgb, rgbToHex: rgbToHex, normalizeHex: normalizeHex,
        rgbToOklab: rgbToOklab, oklabToRgbRaw: oklabToRgbRaw,
        oklabToOklch: oklabToOklch, oklchToOklab: oklchToOklab,
        rgbToOklch: rgbToOklch, oklchToRgbRaw: oklchToRgbRaw,
        inGamut: inGamut, oklchInGamut: oklchInGamut, gamutMapOklch: gamutMapOklch,
        oklchToHex: oklchToHex, hexToOklch: hexToOklch,
        rgbToHsl: rgbToHsl, hslToRgb: hslToRgb,
        deltaE: deltaE, inkFor: inkFor
    };
    root.ColourMath = ColourMath;
    if (typeof module !== 'undefined' && module.exports) module.exports = ColourMath;
})(typeof window !== 'undefined' ? window : globalThis);
