// ═══════════════════════════════════════════════════════════════════
// js/50-look-links.js — shared-settings links (2026-09-14).
// LOAD ORDER: after 49-hotkey-binds.js (end of the sync list). It waits for
//   the async chain and the saved-session restore before it applies anything.
// PROVIDES: window.LookLinks = { parse, pending, holdsJoin, encode,
//   encodeWithStats, decode, pack, unpack, url, urlFor, capture, copyCurrent,
//   copySnapshot, applyPayload }
// USED BY: 06e (Swirl Together: Link to current settings, Room link +
//   current settings, and the held auto-join), 20 (a saved preset's Copy link), 51.
//
// A link that carries a whole look — every look setting on screen, or a
// saved preset — and rebuilds it exactly where it is opened: in the browser
// (https://swirltogether.com/?look=…), or in the desktop app, handed off by
// the web page or opened directly (swirltogether://look/…, see
// js/51-open-in-desktop.js). It is not a link to a painting: the marks, the
// fluid already on the canvas and the time are the recipient's own.
//
// What rides: the look sections of capturePresetSnapshot({lookOnly}) —
//   sliders, switches, selects, colours, palette, swatch tray, arm colours,
//   kaleidoscope, light position and path, brush ramps and On Move /
//   Constant (so Spacing or Interval lands on a brush using it), material, brush tip,
//   shooting-star origin, oscillator — plus gravity (on, and which way),
//   which a room shares but a preset never carried. Only values that differ
//   from the defaults travel (the recipient's applyPresetSnapshotFull fills
//   the rest from the same defaults). A custom brush-shape IMAGE cannot ride
//   (it is a local file); the tip falls back to its built-in shape.
// What never rides: content (layers, masks, text, recordings), libraries
//   (user palettes), and the recipient's workspace, device and privacy
//   settings — resolutions, fps cap, recording, stats, autoload, PhotoSafe,
//   cursor, borders, focus/stream format, capture-on-hover, audio input,
//   Transparent Background. The apply holds those at the recipient's own
//   values, so the defaults merge cannot reset them either.
// Untrusted input: allowlisted sections, primitive leaves only, strings of
//   at most 64 characters from a safe set, colours must be hex, depth ≤ 3,
//   decoded data capped at 64 KB; applyPresetSnapshot then clamps every
//   slider through ParamRegistry and skips ids it does not know.
// Applied once the app is built, over the recipient's saved session and
//   never written into it (withoutPersisting); refused while in a room (a
//   snapshot apply would re-dress everyone's canvas); the URL is cleaned
//   afterwards so a reload does not re-apply it.
// With a room (2026-10-07, Swirl Together → Invite → Room link +
//   current settings): ?look=…#CODE. 06e holds its auto-join, the settings go on
//   first, and then the room is joined. A room that is still going hands
//   over its shared settings on arrival as usual (your brush stays the
//   link's: a room never shares brushes); one that has closed, or is
//   locked, still leaves you on the settings.
// Formats (?look=<digit>.<base64url>):
//   2.  packed (2026-10-07, below): tagged binary, deflated when shorter.
//       ~300 characters for the shipped defaults, where 1. took ~870.
//   1.  deflate-raw(JSON).  0.  plain JSON (no CompressionStream).
//   The body is the same in all three: the trimmed snapshot, b = the
//   defaults generation it was trimmed against (12's LOOK_BASELINE_GEN;
//   absent = 1), an optional name n (a saved preset's), and its schema
//   version (absent = 2).
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var PARAM = 'look';
    var WEB_HOME = 'https://swirltogether.com/';
    var PAYLOAD_RE = /^[012]\.[A-Za-z0-9_-]{2,12000}$/;
    var SNAPSHOT_VERSION = 2;           // capturePresetSnapshot's schema
    var MAX_JSON = 65536;               // inflate cap: a link is ~1-2 KB of JSON
    // A whole link stays inside one chat message (Discord's is 2000
    // characters). Only a long freehand light path can push a look past it,
    // and that is thinned to fit (see the path codec).
    var LINK_BUDGET = 1900;
    var MAX_PATH = 4096;                // light-path points a link may carry
    var own = Object.prototype.hasOwnProperty;

    var SECTIONS = ['sliders', 'checkboxes', 'selects', 'colors', 'kaleido', 'paletteIndex',
        'paletteName', 'savedColors', 'armColors', 'lightPos', 'lightShiftPath', 'brushState',
        'material', 'brushTip', 'ssOrigin', 'cosOscillator', 'gravity'];
    // Never in a link: 12's machine/workflow keys (BASELINE_SKIP) and the
    // recipient's workspace, device and privacy settings.
    var SKIP = {
        sliders: {},
        checkboxes: { autoloadSettings: 1, preserveFluidOpacity: 1, photoSafeToggle: 1, statsToggle: 1,
            cursorToggle: 1, showCanvasHandles: 1, lockCanvasBorders: 1, hoverCaptureToggle: 1,
            detachCaptureToggle: 1, audioReactToggle: 1, focusModeToggle: 1, streamFormatLock: 1,
            transparentMode: 1, governorToggle: 1 },
        selects: { visualResolution: 1, physicsResolution: 1, fpsCap: 1, recMode: 1,
            recPlaybackSpeed: 1, audioMode: 1, audioReactSource: 1 }
    };

    // ── Bytes ───────────────────────────────────────────────────────
    function b64urlFromBytes(bytes) {
        var s = '';
        for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function bytesFromB64url(str) {
        var s = str.replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) s += '=';
        var bin = atob(s), out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    function canZip() {
        try { new CompressionStream('deflate-raw'); new DecompressionStream('deflate-raw'); return true; }
        catch (_) { return false; }
    }
    // Pipe bytes through a (de)compression stream; `cap` aborts an inflate
    // that runs past it, so a crafted link cannot balloon in memory.
    function through(bytes, stream, cap) {
        var reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
        var chunks = [], total = 0;
        function pump() {
            return reader.read().then(function (r) {
                if (r.done) {
                    var out = new Uint8Array(total), o = 0;
                    chunks.forEach(function (c) { out.set(c, o); o += c.length; });
                    return out;
                }
                total += r.value.length;
                if (cap && total > cap) { try { reader.cancel(); } catch (_) {} throw new Error('link data too large'); }
                chunks.push(r.value);
                return pump();
            });
        }
        return pump();
    }

    // ── The packed format (2.) ──────────────────────────────────────
    // 1. deflated the JSON, so every link still spelled out every key
    // ("densityDissipation":0.99,…) and even the shipped defaults came to
    // ~870 characters. 2. writes the same object as tagged binary:
    //   - keys and common strings as their place in KEYS / STRS (one byte),
    //     anything not listed by name;
    //   - numbers as the shortest exact decimal (six significant digits, as
    //     1. kept), mantissa and decimal count in one varint;
    //   - colours as three bytes; objects of only numbers / only switches /
    //     only words without a tag per value (switches one bit each);
    //   - the light-shift path as small steps between points (a freehand
    //     path is a point every ~2 px, ~117 bytes each as JSON).
    // The decoder rebuilds the very object the JSON would have been, so
    // sanitize() and the apply below it are the same for every format.
    //
    // KEYS and STRS are APPEND-ONLY. A link stores an entry's POSITION:
    // reorder or remove one and every link already sent reads a different
    // setting. A setting missing from them still rides, by name (a few
    // bytes more), so adding one here is an optimisation, never a fix.
    // The first 127 entries cost one byte, the rest two.
    var KEYS = [
        // sections
        'b', 'n', 'sliders', 'checkboxes', 'selects', 'colors', 'kaleido', 'paletteIndex',
        'paletteName', 'savedColors', 'armColors', 'lightPos', 'lightShiftPath', 'brushState',
        'material', 'brushTip', 'ssOrigin', 'gravity',
        // inside them
        'background', 'brush', 'mode', 'segments', 'angle', 'twist', 'zoom', 'blend', 'animate',
        'x', 'y', 'enabled', 'replayMode', 'replayTimePeriod', 'splatInMode', 'splatOutMode',
        'splatInDist', 'splatOutDist', 'splatInMs', 'splatOutMs', 'amount', 'shape', 'tip',
        'shapeId', 'xPct', 'yPct', 'color', 'stepIndex', 'push', 'on',
        // sliders
        'densityDissipation', 'velocityDissipation', 'pressureDissipation', 'pressureIteration',
        'wetInfluence', 'wetDrying', 'ridges', 'overflowBand', 'breathStrength', 'velocityInfluence',
        'curl', 'velocityCap', 'grainCleanup', 'sharpness', 'viscosity', 'symmetryHold', 'colorBlend',
        'brushSize', 'multiplier', 'timeScale', 'canvasOpacity', 'kSpinSpeed', 'kTwist', 'kZoom',
        'kBlend', 'kAngle', 'kaleidoSegments', 'lightSpeed', 'lightIntensity', 'lightAmbient',
        'lightShiftSpeed', 'lightShiftThreshold', 'lightShiftIntensity', 'lightShiftSaturation',
        'vibrance', 'glowIntensity', 'glowThreshold', 'scatterAmount', 'scatterReach',
        'audioSensitivity', 'audioBeatThreshold', 'brushStabilizer', 'brushSteady', 'brushSpacing',
        'brushHardness', 'brushFlow', 'brushDabInterval', 'brushJitter', 'brushTipTexture',
        'shadingIntensity', 'shadeRelief', 'shadeGloss',
        // switches
        'randomColor', 'stepPalette', 'colorGate', 'kaleidoToggle', 'kAnimateRot', 'enableLighting',
        'enableLightShift', 'macCormackToggle', 'multigridToggle', 'glowToggle', 'overflowToggle',
        'breathingToggle', 'breathCueToggle', 'breathFadeToggle', 'scatterToggle',
        'scatterBlockToggle', 'arMapAutoSplat', 'arMapSize', 'arMapKaleido', 'arMapColor',
        'symmetrySameAngle', 'symmetryFaceCenter', 'displayShadingToggle',
        // menus
        'kaleidoMode', 'symmetryMode', 'lightMode', 'scatterSource', 'breathPattern',
        'breathColorMode', 'lightShiftMode', 'shadeFormResolution',
        // rarely anywhere but their defaults, or written by the path codec
        'mgCycles', 'mgPre', 'mgPost', 'mgCoarse', 'mgRelax', 'captureDimming', 'version',
        'cosOscillator', 'hue', 'saturation', 'lightness', 'gap',
        // 2026-10-07: the brush's On Move / Constant mode (brushState)
        'splatMode'
    ];
    var STRS = [
        'instant', 'linear', 'easing', 'time', 'stroke', 'main', 'random', 'step', 'fixed',
        'fluid', 'acrylic', 'clay', 'radial', 'mirrorX', 'mirrorY', 'mirrorQuad', 'rake',
        'manual', 'light', 'brush', 'relaxed', 'box', '478', 'same', 'cycle', 'breath',
        'replace', 'tint', 'overlay', 'multiply', 'screen', 'add',
        '0', '1', '2', '3', '4', '5', '2048', '1024', '512', '256', '128',
        'Mountain Majesty', 'Forest Serenity', 'Sunset Dreams', 'Ocean Waves',
        'move', 'constant'
    ];
    function indexOf(list) {
        var m = Object.create(null);
        list.forEach(function (s, i) { if (!(s in m)) m[s] = i; });
        return m;
    }
    var KEY_AT = indexOf(KEYS), STR_AT = indexOf(STRS);

    // One byte ahead of each value says what follows. A reader that meets
    // a tag it does not know stops: the link is from a newer format.
    var T_NULL = 0, T_FALSE = 1, T_TRUE = 2, T_F64 = 3, T_NUM = 4, T_STR = 5, T_HEX = 6,
        T_HEXU = 7, T_ARR = 8, T_OBJ = 9, T_NUMS = 10, T_BOOLS = 11, T_WORDS = 12, T_PATH = 13;
    var POW10 = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8];
    var HEX_LO = /^#[0-9a-f]{6}$/, HEX_UP = /^#[0-9A-F]{6}$/;
    var BAD_KEY = /^(__proto__|constructor|prototype)$/;

    function Writer() { this.b = []; }
    Writer.prototype.byte = function (v) { this.b.push(v & 255); };
    // Unsigned varint, 7 bits a byte. Arithmetic rather than bit ops, so
    // values past 2^31 survive.
    Writer.prototype.uint = function (n) {
        while (n >= 128) { this.b.push((n % 128) + 128); n = Math.floor(n / 128); }
        this.b.push(n);
    };
    Writer.prototype.sint = function (n) { this.uint(n < 0 ? -2 * n - 1 : 2 * n); };
    Writer.prototype.f64 = function (v) {
        var dv = new DataView(new ArrayBuffer(8));
        dv.setFloat64(0, v);
        for (var i = 0; i < 8; i++) this.b.push(dv.getUint8(i));
    };
    Writer.prototype.text = function (s) {
        var u = new TextEncoder().encode(s);
        this.uint(u.length);
        for (var i = 0; i < u.length; i++) this.b.push(u[i]);
    };
    // The shortest exact decimal: zigzag(mantissa) * 10 + decimals, so 0.5
    // is one byte and 0.993 two. Rounded to six significant digits first,
    // as the 1. format kept them; m / 10^d then reads back as exactly that
    // double. d = 9 escapes to a raw float64 (never seen in practice).
    Writer.prototype.num = function (v) {
        var r = Number(v.toPrecision(6));
        for (var d = 0; d <= 8; d++) {
            var m = Math.round(r * POW10[d]);
            if (Math.abs(m) > 4e14) break;          // zigzag * 10 + d stays under 2^53
            if (m / POW10[d] === r) { this.uint((m < 0 ? -2 * m - 1 : 2 * m) * 10 + d); return; }
        }
        this.uint(9);
        this.f64(v);
    };
    Writer.prototype.key = function (k) {
        if (k in KEY_AT) this.uint(KEY_AT[k] + 1);
        else { this.uint(0); this.text(k); }
    };
    Writer.prototype.word = function (s) {
        if (s in STR_AT) this.uint(STR_AT[s] + 1);
        else { this.uint(0); this.text(s); }
    };
    Writer.prototype.rgb = function (hex) {
        var n = parseInt(hex.slice(1), 16);
        this.b.push((n >> 16) & 255, (n >> 8) & 255, n & 255);
    };

    function Reader(bytes) { this.b = bytes; this.i = 0; }
    Reader.prototype.byte = function () {
        if (this.i >= this.b.length) throw new Error('link data cut short');
        return this.b[this.i++];
    };
    Reader.prototype.uint = function () {
        var n = 0, mul = 1;
        for (var k = 0; k < 8; k++) {
            var c = this.byte();
            n += (c & 127) * mul;
            if (c < 128) return n;
            mul *= 128;
        }
        throw new Error('bad number in link');
    };
    Reader.prototype.sint = function () { var z = this.uint(); return (z % 2 === 0) ? z / 2 : -(z + 1) / 2; };
    // A count of things to come, each at least `min` bytes long: anything
    // claiming more than the bytes left is a broken or hostile link.
    Reader.prototype.count = function (min) {
        var n = this.uint();
        if (n * (min || 1) > this.b.length - this.i) throw new Error('link data cut short');
        return n;
    };
    Reader.prototype.f64 = function () {
        if (this.i + 8 > this.b.length) throw new Error('link data cut short');
        var dv = new DataView(this.b.buffer, this.b.byteOffset + this.i, 8);
        this.i += 8;
        return dv.getFloat64(0);
    };
    Reader.prototype.text = function () {
        var n = this.count(1);
        if (n > 256) throw new Error('text in link too long');
        var s = new TextDecoder().decode(this.b.subarray(this.i, this.i + n));
        this.i += n;
        return s;
    };
    Reader.prototype.num = function () {
        var z = this.uint(), d = z % 10;
        if (d === 9) return this.f64();
        var zz = (z - d) / 10;
        return ((zz % 2 === 0) ? zz / 2 : -(zz + 1) / 2) / POW10[d];
    };
    // An index past the end of the list is from a newer build: null, and
    // the caller drops whatever it was attached to.
    Reader.prototype.key = function () { var c = this.uint(); return c === 0 ? this.text() : (KEYS[c - 1] === undefined ? null : KEYS[c - 1]); };
    Reader.prototype.word = function () { var c = this.uint(); return c === 0 ? this.text() : (STRS[c - 1] === undefined ? null : STRS[c - 1]); };
    Reader.prototype.rgb = function (upper) {
        var n = this.byte() * 65536 + this.byte() * 256 + this.byte();
        var s = '#' + ('00000' + n.toString(16)).slice(-6);
        return upper ? s.toUpperCase() : s;
    };

    // ── The light-shift path ──
    // 14 stores a point per ~2 px of drag: {x, y} on the picker and the
    // {hue, saturation, lightness} read off it. On the picker hue and
    // saturation are straight lines in x and y (hue = x·360/S, saturation
    // = 100 − y·100/S for the picker's size S), so a path that still sits
    // on them stores S once and only x and y per point, as steps in tenths
    // of a pixel: two bytes a point. Playback steps through the points by
    // INDEX, so a path thinned to fit LINK_BUDGET keeps its original count
    // and the reader spreads the kept points back over it: the light cycles
    // at the speed it was drawn at.
    var PATH_KEYS = { x: 1, y: 1, hue: 1, saturation: 1, lightness: 1, gap: 1 };
    function isLightPath(a) {
        if (!a.length) return false;
        for (var i = 0; i < a.length; i++) {
            var p = a[i];
            if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
            for (var k in p) if (own.call(p, k) && !PATH_KEYS[k]) return false;
            if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.hue) || !isFinite(p.saturation) ||
                !isFinite(p.lightness) || typeof p.x !== 'number' || typeof p.y !== 'number' ||
                typeof p.hue !== 'number' || typeof p.saturation !== 'number' ||
                typeof p.lightness !== 'number') return false;
            if (p.gap !== undefined && p.gap !== true) return false;
        }
        return true;
    }
    // The picker size the hue and saturation were read against, or null
    // when they are not plain readings of x and y (a path from a mutation).
    function pathScale(pts) {
        var S = null, i;
        for (i = 0; i < pts.length; i++) if (pts[i].hue > 1) { S = pts[i].x * 360 / pts[i].hue; break; }
        if (!(S > 1) || !isFinite(S)) return null;
        S = Number(S.toPrecision(6));
        for (i = 0; i < pts.length; i++) {
            if (Math.abs(pts[i].hue - pts[i].x * 360 / S) > 0.05) return null;
            if (Math.abs(pts[i].saturation - (100 - pts[i].y * 100 / S)) > 0.05) return null;
        }
        return S;
    }
    // Every `step`-th point by index, both ends kept; a jump (gap) between
    // two kept points stays a jump (the room's compactLightShiftPath rule).
    function thinPath(src, keep) {
        if (src.length <= keep) return src;
        var out = [], step = (src.length - 1) / (keep - 1), prev = 0;
        for (var i = 0; i < keep; i++) {
            var idx = Math.round(i * step), pt = src[idx];
            if (i > 0 && !pt.gap) {
                for (var j = prev + 1; j < idx; j++) {
                    if (src[j].gap) { pt = Object.assign({}, pt, { gap: true }); break; }
                }
            }
            prev = idx;
            out.push(pt);
        }
        return out;
    }
    function writePath(w, src, keep) {
        var pts = thinPath(src, keep);
        var S = pathScale(pts);
        var L = pts[0].lightness, constL = true;
        for (var c = 1; c < pts.length; c++) if (pts[c].lightness !== L) { constL = false; break; }
        w.uint(pts.length);
        w.uint(src.length - pts.length);            // points thinned away (0 = all here)
        w.byte((S ? 1 : 0) | (constL ? 2 : 0));
        if (S) w.num(S);
        if (constL) w.num(L);
        var px = 0, py = 0, ph = 0, ps = 0, pl = 0, gaps = [];
        pts.forEach(function (p, i) {
            var X = Math.round(p.x * 10), Y = Math.round(p.y * 10);
            w.sint(X - px); w.sint(Y - py); px = X; py = Y;
            if (!S) {
                var H = Math.round(p.hue * 10), Sa = Math.round(p.saturation * 10);
                w.sint(H - ph); w.sint(Sa - ps); ph = H; ps = Sa;
            }
            if (!constL) { var Lq = Math.round(p.lightness * 10); w.sint(Lq - pl); pl = Lq; }
            if (p.gap) gaps.push(i);
        });
        w.uint(gaps.length);
        var last = 0;
        gaps.forEach(function (g) { w.uint(g - last); last = g; });
    }
    function readPath(r) {
        var n = r.count(2), extra = r.uint(), flags = r.byte();
        if (n < 1 || n > MAX_PATH || n + extra > MAX_PATH) throw new Error('light path in link too long');
        var S = (flags & 1) ? r.num() : null;
        var L = (flags & 2) ? r.num() : null;
        if (S !== null && !(S > 1 && S < 1e5)) throw new Error('bad light path in link');
        var pts = [], px = 0, py = 0, ph = 0, ps = 0, pl = 0;
        for (var i = 0; i < n; i++) {
            px += r.sint(); py += r.sint();
            var p = { x: px / 10, y: py / 10, hue: 0, saturation: 0, lightness: 0 };
            if (S !== null) {
                p.hue = p.x * 360 / S;
                p.saturation = 100 - p.y * 100 / S;
            } else {
                ph += r.sint(); ps += r.sint();
                p.hue = ph / 10; p.saturation = ps / 10;
            }
            if (L !== null) p.lightness = L;
            else { pl += r.sint(); p.lightness = pl / 10; }
            pts.push(p);
        }
        var g = r.count(1), at = 0;
        for (var j = 0; j < g; j++) {
            at += r.uint();
            if (at < n) pts[at].gap = true;
        }
        return extra ? spreadPath(pts, n + extra, S) : pts;
    }
    // Spread `pts` back over `total` points by index. Between two kept
    // points the light moves in a straight line across the picker (hue read
    // off x, as drawn) or, for a path off the picker's lines, round the
    // shorter way; into a jump it holds, then lands, as 14 plays it.
    function spreadPath(pts, total, S) {
        var n = pts.length;
        if (n < 2) return pts;
        var out = [], prevJ = 0;
        for (var i = 0; i < total; i++) {
            var pos = i * (n - 1) / (total - 1), j = Math.min(n - 2, Math.floor(pos)), f = pos - j;
            var a = pts[j], b = pts[j + 1], p;
            if (f >= 1 - 1e-9) { p = Object.assign({}, b); f = 0; j++; }
            else if (b.gap || f <= 1e-9) p = { x: a.x, y: a.y, hue: a.hue, saturation: a.saturation, lightness: a.lightness };
            else {
                p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, hue: 0,
                    saturation: a.saturation + (b.saturation - a.saturation) * f,
                    lightness: a.lightness + (b.lightness - a.lightness) * f };
                if (S !== null) p.hue = p.x * 360 / S;
                else {
                    var h1 = a.hue, h2 = b.hue;
                    if (Math.abs(h2 - h1) > 180) { if (h2 > h1) h1 += 360; else h2 += 360; }
                    p.hue = (h1 + (h2 - h1) * f) % 360;
                }
            }
            delete p.gap;
            // The jump lands on the first spread point at or past a kept gap.
            for (var k = prevJ + 1; k <= j && i > 0; k++) if (pts[k].gap) { p.gap = true; break; }
            if (i > 0) prevJ = Math.max(prevJ, j);
            out.push(p);
        }
        return out;
    }

    function writeVal(w, v, ctx) {
        if (v === null || v === undefined || (typeof v === 'number' && !isFinite(v))) { w.byte(T_NULL); return; }
        if (v === false) { w.byte(T_FALSE); return; }
        if (v === true) { w.byte(T_TRUE); return; }
        if (typeof v === 'number') { w.byte(T_NUM); w.num(v); return; }
        if (typeof v === 'string') {
            if (HEX_LO.test(v)) { w.byte(T_HEX); w.rgb(v); return; }
            if (HEX_UP.test(v)) { w.byte(T_HEXU); w.rgb(v); return; }
            w.byte(T_STR); w.word(v); return;
        }
        if (Array.isArray(v)) {
            if (isLightPath(v)) { w.byte(T_PATH); writePath(w, v, ctx.pathKeep); return; }
            w.byte(T_ARR); w.uint(v.length);
            v.forEach(function (x) { writeVal(w, x, ctx); });
            return;
        }
        if (typeof v !== 'object') { w.byte(T_NULL); return; }
        var keys = Object.keys(v).filter(function (k) { return v[k] !== undefined; });
        var all = function (test) { return keys.length > 0 && keys.every(function (k) { return test(v[k]); }); };
        if (all(function (x) { return typeof x === 'number' && isFinite(x); })) {
            w.byte(T_NUMS); w.uint(keys.length);
            keys.forEach(function (k) { w.key(k); w.num(v[k]); });
        } else if (all(function (x) { return typeof x === 'boolean'; })) {
            w.byte(T_BOOLS); w.uint(keys.length);
            keys.forEach(function (k) { w.key(k); });
            for (var i = 0; i < keys.length; i += 8) {
                var bits = 0;
                for (var j = 0; j < 8 && i + j < keys.length; j++) if (v[keys[i + j]]) bits |= 1 << j;
                w.byte(bits);
            }
        } else if (all(function (x) { return typeof x === 'string' && !HEX_LO.test(x) && !HEX_UP.test(x); })) {
            w.byte(T_WORDS); w.uint(keys.length);
            keys.forEach(function (k) { w.key(k); w.word(v[k]); });
        } else {
            w.byte(T_OBJ); w.uint(keys.length);
            keys.forEach(function (k) { w.key(k); writeVal(w, v[k], ctx); });
        }
    }

    // Untrusted: every count is checked against the bytes left, nesting is
    // capped, and keys that would reach a prototype are dropped. undefined
    // = a value this build cannot read (a newer dictionary entry); the
    // container leaves it out.
    function readVal(r, depth) {
        if (depth > 5) throw new Error('link data nested too deep');
        var t = r.byte(), n, i, k, x, o;
        var put = function (key, val) { if (key !== null && !BAD_KEY.test(key) && val !== undefined && val !== null) o[key] = val; };
        switch (t) {
            case T_NULL: return null;
            case T_FALSE: return false;
            case T_TRUE: return true;
            case T_F64: return r.f64();
            case T_NUM: return r.num();
            case T_STR: x = r.word(); return x === null ? undefined : x;
            case T_HEX: return r.rgb(false);
            case T_HEXU: return r.rgb(true);
            case T_PATH: return readPath(r);
            case T_ARR:
                n = r.count(1); x = [];
                for (i = 0; i < n; i++) { var it = readVal(r, depth + 1); if (it !== undefined) x.push(it); }
                return x;
            case T_OBJ:
                n = r.count(2); o = {};
                for (i = 0; i < n; i++) { k = r.key(); x = readVal(r, depth + 1); if (k !== null && !BAD_KEY.test(k) && x !== undefined) o[k] = x; }
                return o;
            case T_NUMS:
                n = r.count(2); o = {};
                for (i = 0; i < n; i++) { k = r.key(); put(k, r.num()); }
                return o;
            case T_WORDS:
                n = r.count(2); o = {};
                for (i = 0; i < n; i++) { k = r.key(); put(k, r.word()); }
                return o;
            case T_BOOLS:
                n = r.count(1); o = {};
                var names = [];
                for (i = 0; i < n; i++) names.push(r.key());
                for (i = 0; i < n; i += 8) {
                    var bits = r.byte();
                    for (var j = 0; j < 8 && i + j < n; j++) put(names[i + j], !!(bits & (1 << j)));
                }
                return o;
            default:
                throw new Error('this link was made by a newer version');
        }
    }

    function pack(body, pathKeep) {
        var w = new Writer();
        writeVal(w, body, { pathKeep: pathKeep || MAX_PATH });
        return new Uint8Array(w.b);
    }
    function unpack(bytes) {
        var r = new Reader(bytes);
        var v = readVal(r, 0);
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('no settings in the link');
        return v;
    }

    // ── Snapshot → link ─────────────────────────────────────────────
    function round6(v) { return (typeof v === 'number' && isFinite(v)) ? Number(v.toPrecision(6)) : v; }

    function trim(snap) {
        var reg = (window.ParamRegistry && typeof window.ParamRegistry.defaults === 'function') ? window.ParamRegistry.defaults() : null;
        var base = (typeof window.baselineLookSnapshot === 'function') ? window.baselineLookSnapshot() : null;
        // A value is left out only when it sits on the default in EVERY
        // generation: a recipient still filling from the old defaults (the
        // shipped demo, an unrefreshed web tab, an older desktop build) has
        // no `b` to read, so anything whose default moved always rides.
        var legacy = window.LEGACY_LOOK_BASELINE || null;
        var legacySame = function (sec, k, v) {
            if (!legacy || !legacy[sec] || !own.call(legacy[sec], k)) return true;
            return round6(legacy[sec][k]) === v;
        };
        // b: the defaults generation the link was trimmed against (12's
        // LOOK_BASELINE_GEN). The recipient fills what the link leaves out from
        // that generation, so a link made before a defaults change still lands
        // exactly; a link without it is from before the field existed (gen 1).
        var out = { version: SNAPSHOT_VERSION, b: (typeof window.LOOK_BASELINE_GEN === 'number') ? window.LOOK_BASELINE_GEN : 2 };
        ['sliders', 'checkboxes', 'selects'].forEach(function (sec) {
            var src = snap[sec] || {}, o = {}, any = false;
            Object.keys(src).forEach(function (k) {
                if (SKIP[sec][k]) return;
                var v = round6(src[k]);
                if (reg && reg[sec] && own.call(reg[sec], k) && round6(reg[sec][k]) === v && legacySame(sec, k, v)) return;   // the default: the merge brings it back
                o[k] = v; any = true;
            });
            if (any) out[sec] = o;
        });
        SECTIONS.forEach(function (k) {
            if (k === 'sliders' || k === 'checkboxes' || k === 'selects') return;
            var v = snap[k];
            if (v === undefined || v === null) return;
            if (k === 'brushTip') v = Object.assign({}, v, { shapeId: null });
            if (base && base[k] !== undefined && JSON.stringify(base[k]) === JSON.stringify(v) &&
                (!legacy || legacy[k] === undefined || JSON.stringify(legacy[k]) === JSON.stringify(v))) return;
            out[k] = v;
        });
        return out;
    }

    function cleanName(s) { return String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40); }

    // The look on screen, as a link carries it: the preset capture plus
    // gravity, which lives outside the registry (20's aim pad) and so was
    // never in a preset. Off rides as just "off": the aim does not show.
    function capture() {
        var snap = (typeof window.capturePresetSnapshot === 'function') ? window.capturePresetSnapshot({ lookOnly: true }) : null;
        if (!snap) return null;
        var c = window.config;
        if (c) {
            snap.gravity = c.AMBIENT_FORCE
                ? { on: true, x: Number(c.AMBIENT_FORCE_X) || 0, y: Number(c.AMBIENT_FORCE_Y) || 0 }
                : { on: false };
        }
        return snap;
    }

    // How many look settings a link reproduces: every switch, slider and
    // menu it covers plus each part of the other sections (a list counts
    // once). The ones it leaves out sit on the defaults, which the
    // recipient's apply fills in, so all of them land.
    function countSettings(snap) {
        var n = 0;
        ['sliders', 'checkboxes', 'selects'].forEach(function (sec) {
            Object.keys(snap[sec] || {}).forEach(function (k) { if (!SKIP[sec][k]) n++; });
        });
        SECTIONS.forEach(function (k) {
            if (k === 'sliders' || k === 'checkboxes' || k === 'selects' || k === 'paletteName') return;
            var v = snap[k];
            if (v === undefined || v === null || (Array.isArray(v) && !v.length)) return;
            if (typeof v !== 'object' || Array.isArray(v)) { n++; return; }
            Object.keys(v).forEach(function (kk) { if (kk !== 'shapeId' && v[kk] !== null && v[kk] !== undefined) n++; });
        });
        return n;
    }

    function packed(body, pathKeep, zip) {
        var bytes = pack(body, pathKeep);
        var frame = function (flag, b) {
            var out = new Uint8Array(b.length + 1);
            out[0] = flag; out.set(b, 1);
            return '2.' + b64urlFromBytes(out);
        };
        if (!zip) return Promise.resolve(frame(0, bytes));
        return through(bytes, new CompressionStream('deflate-raw')).then(function (z) {
            return (z.length < bytes.length) ? frame(1, z) : frame(0, bytes);
        });
    }

    // opts.room: the link also joins that room (the base URL's length is
    // budgeted for). Resolves to { payload, stats }: how many settings it
    // carries, its length, and how far a long light path was thinned.
    function encodeWithStats(snap, name, opts) {
        var body = trim(snap);
        var n = cleanName(name);
        if (n) body.n = n;
        if (body.version === SNAPSHOT_VERSION) delete body.version;   // the reader's default
        var zip = canZip();
        var room = opts && opts.room ? String(opts.room) : '';
        var budget = LINK_BUDGET - urlFor('', room).length;
        var path = Array.isArray(body.lightShiftPath) ? body.lightShiftPath : null;
        var stats = { settings: countSettings(snap), pathPoints: path ? path.length : 0, pathKept: path ? path.length : 0 };
        var attempt = function (keep) {
            return packed(body, keep, zip).then(function (p) {
                // Only a long freehand light path can push a look past one
                // chat message; thin it (the reader spreads it back) until
                // the link fits, down to 32 points.
                if (p.length <= budget || !path || keep <= 32 || !isLightPath(path)) {
                    stats.pathKept = path ? Math.min(path.length, keep) : 0;
                    stats.chars = p.length;
                    return { payload: p, stats: stats };
                }
                var next = Math.max(32, Math.min(keep, path.length) * Math.min(0.9, budget / p.length) | 0);
                return attempt(next);
            });
        };
        return attempt(MAX_PATH);
    }
    function encode(snap, name, opts) {
        return encodeWithStats(snap, name, opts).then(function (r) { return r.payload; });
    }

    // ── Link → snapshot (untrusted) ─────────────────────────────────
    var HEX = /^#[0-9a-fA-F]{3,8}$/;
    var SAFE = /^[\w .#:,()%+\-]{0,64}$/;
    function leaf(v, depth) {
        if (v === null || typeof v === 'boolean') return v;
        if (typeof v === 'number') return isFinite(v) ? v : undefined;
        if (typeof v === 'string') return (SAFE.test(v) && !/^\s*(data|javascript):/i.test(v)) ? v : undefined;
        if (typeof v !== 'object' || depth >= 3) return undefined;
        if (Array.isArray(v)) {
            var a = [];
            for (var i = 0; i < v.length && i < 64; i++) { var x = leaf(v[i], depth + 1); if (x !== undefined) a.push(x); }
            return a;
        }
        var o = {}, n = 0;
        for (var k in v) {
            if (!own.call(v, k) || !/^[\w-]{1,48}$/.test(k) || BAD_KEY.test(k) || n++ >= 200) continue;
            var y = leaf(v[k], depth + 1);
            if (y !== undefined) o[k] = y;
        }
        return o;
    }
    function clampNum(v, lo, hi) { return (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : null; }
    // The light path has its own rule: it is the one list that runs long
    // (leaf()'s 64 would cut a freehand path short), and 14 draws and plays
    // every point.
    function cleanPath(v) {
        if (!Array.isArray(v)) return undefined;
        var out = [];
        for (var i = 0; i < v.length && out.length < MAX_PATH; i++) {
            var p = v[i];
            if (!p || typeof p !== 'object') continue;
            var q = { x: clampNum(p.x, 0, 4096), y: clampNum(p.y, 0, 4096), hue: clampNum(p.hue, 0, 360),
                saturation: clampNum(p.saturation, 0, 100), lightness: clampNum(p.lightness, 0, 100) };
            if (q.x === null || q.y === null || q.hue === null || q.saturation === null || q.lightness === null) continue;
            if (p.gap === true) q.gap = true;
            out.push(q);
        }
        return out;
    }
    function sanitize(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
        var out = {};
        SECTIONS.forEach(function (k) {
            if (!own.call(obj, k)) return;
            var v = (k === 'lightShiftPath') ? cleanPath(obj[k]) : leaf(obj[k], 0);
            if (v !== undefined) out[k] = v;
        });
        ['sliders', 'checkboxes', 'selects'].forEach(function (sec) {
            var src = out[sec];
            if (!src || typeof src !== 'object' || Array.isArray(src)) { delete out[sec]; return; }
            var o = {};
            Object.keys(src).forEach(function (k) {
                if (SKIP[sec][k]) return;
                var v = src[k];
                if ((sec === 'sliders' && typeof v === 'number') ||
                    (sec === 'checkboxes' && typeof v === 'boolean') ||
                    (sec === 'selects' && typeof v === 'string')) o[k] = v;
            });
            out[sec] = o;
        });
        if (out.colors && typeof out.colors === 'object' && !Array.isArray(out.colors)) {
            Object.keys(out.colors).forEach(function (k) { if (typeof out.colors[k] !== 'string' || !HEX.test(out.colors[k])) delete out.colors[k]; });
        } else delete out.colors;
        if (own.call(out, 'savedColors')) {
            if (Array.isArray(out.savedColors)) out.savedColors = out.savedColors.filter(function (c) { return typeof c === 'string' && HEX.test(c); }).slice(0, 32);
            else delete out.savedColors;
        }
        if (own.call(out, 'armColors')) {
            if (Array.isArray(out.armColors)) {
                out.armColors = out.armColors.slice(0, 8).map(function (a) {
                    a = (a && typeof a === 'object') ? a : {};
                    return {
                        mode: (typeof a.mode === 'string' && /^[a-z]{1,16}$/.test(a.mode)) ? a.mode : 'main',
                        color: (typeof a.color === 'string' && HEX.test(a.color)) ? a.color : '#ffffff',
                        stepIndex: (typeof a.stepIndex === 'number') ? Math.max(0, Math.min(64, a.stepIndex | 0)) : 0,
                        push: !!a.push
                    };
                });
            } else delete out.armColors;
        }
        if (own.call(out, 'paletteIndex')) {
            if (typeof out.paletteIndex === 'number') out.paletteIndex = Math.max(0, Math.min(999, out.paletteIndex | 0));
            else delete out.paletteIndex;
        }
        if (own.call(out, 'gravity')) {
            var g = out.gravity;
            if (g && typeof g === 'object' && typeof g.on === 'boolean') {
                out.gravity = g.on ? { on: true, x: clampNum(g.x, -1, 1) || 0, y: clampNum(g.y, -1, 1) || 0 } : { on: false };
            } else delete out.gravity;
        }
        if (out.brushTip && typeof out.brushTip === 'object') out.brushTip.shapeId = null;
        out.version = (typeof obj.version === 'number' && isFinite(obj.version)) ? obj.version : SNAPSHOT_VERSION;
        out.baseline = (typeof obj.b === 'number' && isFinite(obj.b)) ? Math.max(1, Math.min(999, obj.b | 0)) : 1;
        return { snapshot: out, name: (typeof obj.n === 'string') ? cleanName(obj.n) : '' };
    }

    function decode(payload) {
        if (!PAYLOAD_RE.test(String(payload || ''))) return Promise.reject(new Error('not a settings link'));
        var bytes;
        try { bytes = bytesFromB64url(payload.slice(2)); } catch (e) { return Promise.reject(e); }
        var kind = payload.charAt(0);
        if (kind === '2') {
            if (!bytes.length) return Promise.reject(new Error('no settings in the link'));
            var flag = bytes[0], body = bytes.subarray(1);
            if (flag & ~1) return Promise.reject(new Error('this link was made by a newer version'));
            var raw2;
            if (flag & 1) {
                if (!canZip()) return Promise.reject(new Error('this browser cannot read compressed links'));
                raw2 = through(body, new DecompressionStream('deflate-raw'), MAX_JSON);
            } else {
                raw2 = (body.length > MAX_JSON) ? Promise.reject(new Error('link data too large')) : Promise.resolve(body);
            }
            return raw2.then(function (b) {
                var r = sanitize(unpack(b));
                if (!r) throw new Error('no settings in the link');
                return r;
            });
        }
        var raw;
        if (kind === '1') {
            if (!canZip()) return Promise.reject(new Error('this browser cannot read compressed links'));
            raw = through(bytes, new DecompressionStream('deflate-raw'), MAX_JSON);
        } else {
            raw = (bytes.length > MAX_JSON) ? Promise.reject(new Error('link data too large')) : Promise.resolve(bytes);
        }
        return raw.then(function (b) {
            var r = sanitize(JSON.parse(new TextDecoder().decode(b)));
            if (!r) throw new Error('no settings in the link');
            return r;
        });
    }

    // ── URLs and the clipboard ──────────────────────────────────────
    // Same rule as the room invite link (06e roomJoinUrl): this origin on
    // http(s); the desktop build runs from file://, so it hands out the
    // deployed site — whose page offers the desktop hand-off to anyone who
    // has the app.
    function base() {
        if (location.protocol === 'http:' || location.protocol === 'https:') {
            return location.origin + location.pathname.replace(/[^/]*$/, '');
        }
        return WEB_HOME;
    }
    function urlFor(payload, room) { return base() + '?' + PARAM + '=' + payload + (room ? '#' + room : ''); }
    function url(snap, name, opts) { return encode(snap, name, opts).then(function (p) { return urlFor(p, opts && opts.room); }); }

    var toastEl = null, toastTimer = 0;
    function toast(msg, ms) {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.id = 'look-toast';
            toastEl.setAttribute('role', 'status');
            toastEl.style.cssText = 'position:fixed;bottom:64px;left:50%;transform:translateX(-50%);' +
                'max-width:min(560px,92vw);padding:10px 18px;border-radius:8px;font-size:13px;line-height:1.4;' +
                'z-index:99999;color:#e6edf3;pointer-events:none;display:none;text-align:center;' +
                'background:rgba(13,17,23,0.95);border:1px solid #58a6ff;';
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = msg;
        toastEl.style.display = 'block';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.style.display = 'none'; }, ms || 4000);
    }

    function copyText(text) {
        function fallback() {
            try {
                var ta = document.createElement('textarea');
                ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta); ta.select();
                var ok = document.execCommand('copy');
                document.body.removeChild(ta);
                return !!ok;
            } catch (_) { return false; }
        }
        return new Promise(function (resolve) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(function () { resolve(true); }, function () { resolve(fallback()); });
            } else {
                resolve(fallback());
            }
        });
    }

    // opts.room: an invite that carries the settings too (06e's Invite
    // popover). Resolves true when the link reached the clipboard.
    function copySnapshot(snap, name, opts) {
        if (!snap) { toast('Nothing to share yet.'); return Promise.resolve(false); }
        var room = opts && opts.room;
        return encodeWithStats(snap, name, opts).then(function (r) {
            var u = urlFor(r.payload, room), st = r.stats;
            return copyText(u).then(function (ok) {
                if (ok) {
                    var what = cleanName(name)
                        ? 'a link to "' + cleanName(name) + '" (' + u.length + ' characters)'
                        : 'a link to your current settings: all ' + st.settings + ' of them, in ' + u.length + ' characters';
                    var thin = (st.pathKept < st.pathPoints) ? ' The light-shift path was smoothed to fit one chat message.' : '';
                    toast(room
                        ? 'Copied the room link with your current settings: all ' + st.settings + ' of them, in ' + u.length + ' characters. It joins this room, and if the room has closed by then, the settings still open.' + thin
                        : 'Copied ' + what + '. It opens Swirl Together with them, in the browser or the desktop app.' + thin, 7000);
                } else if (typeof window.appConfirm === 'function') {
                    window.appConfirm({ title: 'Copy this link', message: u, confirmLabel: 'Done', cancelLabel: null, danger: false });
                } else {
                    toast('Could not reach the clipboard. The link is ' + u, 12000);
                }
                return ok;
            });
        }).catch(function (e) {
            console.warn('[look-link] could not build the link:', e && e.message);
            toast('Could not build a link for these settings.', 5000);
            return false;
        });
    }

    function copyCurrent(opts) {
        return copySnapshot(capture(), null, opts);
    }

    // ── Apply ───────────────────────────────────────────────────────
    // Two layers keep the recipient's saved session out of it. The flag
    // (window.__lookLinkApplying) holds off the write-throughs that are
    // known — the tray, arm colours, brush tip, splat ramps, the palette
    // pick (12, 20, 01). The storage transaction underneath is the
    // backstop for any it does not know: every localStorage key is
    // snapshotted before the apply and put back after it. The apply is
    // synchronous, so nothing else writes in between; the settingsManager
    // cache may briefly disagree with storage, but storage is what the next
    // launch reads, which is the point.
    function withoutPersisting(fn) {
        var snap = null;
        try {
            snap = {};
            for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); snap[k] = localStorage.getItem(k); }
        } catch (_) { snap = null; }
        window.__lookLinkApplying = true;
        try { fn(); }
        finally { window.__lookLinkApplying = false; }
        if (!snap) return;
        try {
            var restored = [], seen = {};
            for (var key in snap) {
                seen[key] = 1;
                if (localStorage.getItem(key) !== snap[key]) { localStorage.setItem(key, snap[key]); restored.push(key); }
            }
            var created = [];
            for (var j = 0; j < localStorage.length; j++) { var kk = localStorage.key(j); if (!seen[kk]) created.push(kk); }
            created.forEach(function (kk) { localStorage.removeItem(kk); });
            if (restored.length || created.length) {
                console.info('[look-link] applied without touching the saved session; storage put back for: ' +
                    restored.join(', ') + (created.length ? '; removed: ' + created.join(', ') : ''));
            }
        } catch (_) {}
    }

    // Gravity (switch and aim) through 20's pad, the way a room applies it
    // (06b applyLookSections). Off keeps the recipient's aim: it does not
    // show, and it is where their pad sits when they switch it back on.
    function applyGravity(g) {
        var c = window.config;
        if (!g || typeof g.on !== 'boolean' || !c) return;
        var x = g.on ? (Number(g.x) || 0) : (Number(c.AMBIENT_FORCE_X) || 0);
        var y = g.on ? (Number(g.y) || 0) : (Number(c.AMBIENT_FORCE_Y) || 0);
        if (!!c.AMBIENT_FORCE === g.on && c.AMBIENT_FORCE_X === x && c.AMBIENT_FORCE_Y === y) return;
        if (typeof window.setGravityField === 'function') window.setGravityField(g.on, x, y);
        else { c.AMBIENT_FORCE = g.on; c.AMBIENT_FORCE_X = x; c.AMBIENT_FORCE_Y = y; }
    }

    function announce(name, version, room) {
        var msg = name ? 'Opened "' + name + '", shared settings. Paint with them.' : 'Opened shared settings. Paint with them.';
        if (room) msg = (name ? '"' + name + '" is on. ' : 'Shared settings on. ') + 'Joining the room…';
        if (typeof version === 'number' && version > SNAPSHOT_VERSION) msg += ' (Made with a newer version; a few settings may not carry over.)';
        if (!room) msg += ' To keep them: Presets → + New Preset.';
        var show = function () { toast(msg, 7000); };
        // The startup fork owns the screen until it is answered; say it after.
        var uv = window.UIVisibility;
        if (uv && typeof uv.forkPending === 'function' && uv.forkPending() && uv.EVENT) {
            document.addEventListener(uv.EVENT, function () { setTimeout(show, 400); }, { once: true });
        } else {
            show();
        }
    }

    // 06a's room is a script-global lexical binding, not on window.
    function roomNow() { try { return currentRoom || null; } catch (_) { return null; } }

    function applySnapshot(snap, name, opts) {
        if (typeof window.applyPresetSnapshotFull !== 'function') return false;
        // Never re-dress a live room: the snapshot would reach every peer's
        // canvas through the look mirror, and under a host's lock it would
        // fight it.
        if (roomNow()) {
            toast('You are in a room, so the shared settings were not applied. Leave the room to try them.', 6000);
            return false;
        }
        var s = JSON.parse(JSON.stringify(snap));
        // Hold the recipient's workspace settings at their own values: the
        // defaults merge would otherwise reset any the registry baselines.
        var reg = (window.ParamRegistry && typeof window.ParamRegistry.defaults === 'function') ? window.ParamRegistry.defaults() : null;
        ['checkboxes', 'selects'].forEach(function (sec) {
            Object.keys(SKIP[sec]).forEach(function (id) {
                if (!reg || !reg[sec] || !own.call(reg[sec], id)) return;   // not baselined: left alone already
                var el = document.getElementById(id);
                if (!el) return;
                s[sec] = s[sec] || {};
                s[sec][id] = (sec === 'checkboxes') ? !!el.checked : el.value;
            });
        });
        withoutPersisting(function () {
            window.applyPresetSnapshotFull(s);
            applyGravity(s.gravity);
        });
        if (typeof window.clearActivePreset === 'function') window.clearActivePreset();
        document.querySelectorAll('.user-preset-btn.active, .mixer-user-preset-btn.active')
            .forEach(function (b) { b.classList.remove('active'); });
        // ...and the Presets button stops naming the preset you were on (20).
        if (typeof window.setCurrentPreset === 'function') window.setCurrentPreset(null);
        if (window.QualityGovernor) {
            try { (window.QualityGovernor.softReset || window.QualityGovernor.reset)(); } catch (_) {}
        }
        if (!opts || opts.announce !== false) announce(name, snap.version, opts && opts.room);
        return true;
    }

    // opts.room: the settings are on their way into that room (a link with
    // settings), which only changes what the toast says.
    function applyPayload(payload, opts) {
        return decode(payload).then(function (r) {
            return applySnapshot(r.snapshot, r.name, opts);
        }).catch(function (e) {
            console.warn('[look-link] could not read the link:', e && e.message);
            toast('Could not read the settings in that link.', 6000);
            return false;
        });
    }

    // ── Startup: a ?look= in this page's URL ────────────────────────
    function parse(search) {
        var s = (search == null) ? window.location.search : String(search);
        if (!s || s.length < 2) return null;
        var params;
        try { params = new URLSearchParams(s.charAt(0) === '?' ? s.slice(1) : s); } catch (_) { return null; }
        var p = (params.get(PARAM) || '').trim();
        return PAYLOAD_RE.test(p) ? { payload: p } : null;
    }
    // A private room code (#ABC123), the kind a link with settings carries.
    // Stranger rooms (pub-…) never sit in the hash, and DEFAULT-ROOM is not
    // an invitation.
    function roomCodeInHash() {
        var h = (window.location.hash || '').slice(1).toUpperCase();
        return /^[A-Z0-9]{6}$/.test(h) ? h : null;
    }
    function roomInHash() {
        var h = window.location.hash;
        return !!(h && h.length > 1 && h !== '#DEFAULT-ROOM');
    }
    // 06e asks this before its auto-join: a link with settings joins here,
    // after they are on. Read off the URL alone (any ?look=, valid or not),
    // the same test 06e falls back to, so the two agree whichever loads
    // first; a look that will not decode still joins.
    function linkHoldsJoin() {
        return !!roomCodeInHash() && /(?:^\?|&)look=/.test(window.location.search || '');
    }
    var heldRoom = linkHoldsJoin() ? roomCodeInHash() : null;
    var pending = parse();
    if (pending && heldRoom) pending.room = heldRoom;

    function cleanUrl() {
        try {
            var u = new URL(window.location.href);
            u.searchParams.delete(PARAM);
            var q = u.searchParams.toString();
            history.replaceState(null, '', u.pathname + (q ? '?' + q : '') + u.hash);
        } catch (_) {}
    }

    // Runs fn once the app has settled: the async chain is in and the saved
    // session applied (12's autoload runs synchronously on the same
    // fluidui:scripts-ready, so __scriptsReady implies it), AND the strip +
    // sidebar are built (20 builds on a later rAF; a link opened in a
    // background tab waits for visibility, and so does this — settings
    // applied before the build would be half undone by the build's own
    // restore of saved arms and ramps). The tail delay clears 21's 300 ms
    // format restore.
    function afterSettled(fn) {
        var tries = 0;
        var poll = function () {
            var built = !!window.__scriptsReady && !!document.getElementById('mixer-strip');
            if (built || tries++ > 1200) { setTimeout(fn, 350); return; }
            setTimeout(poll, 100);
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poll);
        else poll();
    }

    // The held join: only into a room nobody has entered since (a link
    // clicked in the panel meanwhile wins), and never a leave-and-rejoin.
    function joinHeld(code) {
        if (!code || roomNow()) return;
        if (typeof window.joinRoom === 'function') window.joinRoom(code);
    }

    if (pending || heldRoom) {
        if (pending && !heldRoom && roomInHash()) {
            console.log('[look-link] ignoring ?look=: the URL also carries a room it cannot join from here');
            pending = null;
            cleanUrl();
        } else {
            afterSettled(function () {
                var want = pending;
                pending = null;
                var room = heldRoom;
                heldRoom = null;
                var done = function () { cleanUrl(); joinHeld(room); };
                if (!want) { done(); return; }
                applyPayload(want.payload, { room: room }).then(done, done);
            });
        }
    }

    // ── "Link to current settings" in the Presets popup ─────────────
    // The popup's list is re-rendered on every open (renderMixerUserPresets
    // empties it), so the button sits on the panel itself, after the list.
    // A saved preset shares itself from its ⋯ menu (20-mixer-layout).
    // Swirl Together has its own two (06e: Link to current settings, and
    // Room link + current settings in a room's Invite).
    function mountCopyButton() {
        var panel = document.querySelector('.mixer-presets-panel');
        if (!panel || panel.querySelector('.look-link-copy')) return;
        var foot = document.createElement('div');
        foot.className = 'look-link-foot';
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'look-link-copy btn--sm';
        b.textContent = 'Link to current settings';
        b.title = 'Copies a link to your current settings: colours, brush, fluid, symmetry, light, gravity and finish. It opens Swirl Together with them, in the browser or the desktop app. It shares your settings, not your painting.';
        b.addEventListener('click', function (e) { e.stopPropagation(); copyCurrent(); });
        foot.appendChild(b);
        panel.appendChild(foot);
    }
    afterSettled(mountCopyButton);

    window.LookLinks = {
        PARAM: PARAM,
        PAYLOAD_RE: PAYLOAD_RE,
        LINK_BUDGET: LINK_BUDGET,
        parse: parse,
        pending: function () { return pending; },
        holdsJoin: function () { return !!heldRoom; },
        encode: encode,
        encodeWithStats: encodeWithStats,
        decode: decode,
        pack: pack,
        unpack: unpack,
        url: url,
        urlFor: urlFor,
        capture: capture,
        copyCurrent: copyCurrent,
        copySnapshot: copySnapshot,
        applyPayload: applyPayload
    };
})();
