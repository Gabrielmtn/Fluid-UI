// QR code generator — byte mode, versions 1–6, error-correction level M.
//
// Written because the app had a PLACEHOLDER: 23-branding-overlays.js drew a
// white box reading "SCAN" with the URL under it, which no camera has ever
// resolved. Both the branding overlay and the Swirl Together room panel need a
// real, scannable code, and neither can reach a CDN (the desktop build runs
// from file://), so it lives here.
//
// Scope is deliberate. Version 6-M holds 106 bytes; the longest thing this app
// encodes is a room link of roughly 60 characters. Capping at 6 means the
// symbol never needs the version-information blocks that versions 7+ carry,
// which removes the fiddliest part of the spec with no loss to any caller.
//
//   window.QRCode.svg(text, {size, margin, dark, light})  → SVG string
//   window.QRCode.matrix(text)                            → boolean[][]
//   window.QRCode.selfTest()                              → {pass, ...}
//
// Reference: ISO/IEC 18004. Structure follows the conventional formulation
// (finder/timing/alignment, zigzag placement, 8 candidate masks scored by the
// four penalty rules).
(function () {
    'use strict';

    // ── GF(256), primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D) ──
    function gmul(x, y) {
        var z = 0;
        for (var i = 7; i >= 0; i--) {
            z = (z << 1) ^ ((z >>> 7) * 0x11D);
            z ^= ((y >>> i) & 1) * x;
        }
        return z & 0xFF;
    }

    // Divisor polynomial for `degree` error-correction codewords.
    function rsDivisor(degree) {
        var result = [];
        for (var i = 0; i < degree - 1; i++) result.push(0);
        result.push(1);
        var root = 1;
        for (i = 0; i < degree; i++) {
            for (var j = 0; j < result.length; j++) {
                result[j] = gmul(result[j], root);
                if (j + 1 < result.length) result[j] ^= result[j + 1];
            }
            root = gmul(root, 0x02);
        }
        return result;
    }

    function rsRemainder(data, divisor) {
        var result = divisor.map(function () { return 0; });
        for (var k = 0; k < data.length; k++) {
            var factor = data[k] ^ result.shift();
            result.push(0);
            for (var i = 0; i < divisor.length; i++) result[i] ^= gmul(divisor[i], factor);
        }
        return result;
    }

    // ── Version tables, error-correction level M only ──
    // [ total data codewords, EC codewords per block, number of blocks ]
    var VERSION = {
        1: { data:  16, ecPerBlock: 10, blocks: 1 },
        2: { data:  28, ecPerBlock: 16, blocks: 1 },
        3: { data:  44, ecPerBlock: 26, blocks: 1 },
        4: { data:  64, ecPerBlock: 18, blocks: 2 },
        5: { data:  86, ecPerBlock: 24, blocks: 2 },
        6: { data: 108, ecPerBlock: 16, blocks: 4 }
    };
    var MAX_VERSION = 6;
    var ECL_FORMAT_BITS = 0x00; // level M

    function pickVersion(byteLen) {
        for (var v = 1; v <= MAX_VERSION; v++) {
            // 4 bits mode + 8 bits length + payload, rounded up to codewords.
            if (byteLen + 2 <= VERSION[v].data) return v;
        }
        return -1;
    }

    // ── Encode text → interleaved codewords ──
    function toUtf8(str) {
        var out = [];
        // encodeURIComponent is the shortest correct route to UTF-8 bytes that
        // works identically in Electron and every browser this ships to.
        var esc = encodeURIComponent(str);
        for (var i = 0; i < esc.length; i++) {
            if (esc[i] === '%') { out.push(parseInt(esc.substr(i + 1, 2), 16)); i += 2; }
            else out.push(esc.charCodeAt(i));
        }
        return out;
    }

    function buildCodewords(bytes, version) {
        var spec = VERSION[version];
        var bits = [];
        function push(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }

        push(0x4, 4);              // byte mode
        push(bytes.length, 8);     // character count (8 bits for versions 1–9)
        for (var i = 0; i < bytes.length; i++) push(bytes[i], 8);

        var capacityBits = spec.data * 8;
        push(0, Math.min(4, capacityBits - bits.length));   // terminator
        while (bits.length % 8 !== 0) bits.push(0);          // pad to a byte

        var data = [];
        for (i = 0; i < bits.length; i += 8) {
            var b = 0;
            for (var j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
            data.push(b);
        }
        // Alternating pad codewords fill the remainder.
        for (var pad = 0xEC; data.length < spec.data; pad ^= 0xEC ^ 0x11) data.push(pad);

        // Split into blocks, append EC to each, then interleave.
        var divisor = rsDivisor(spec.ecPerBlock);
        var numBlocks = spec.blocks;
        var shortLen = Math.floor(spec.data / numBlocks);
        var numLong = spec.data % numBlocks;       // blocks carrying one extra
        var blocks = [], ecBlocks = [], off = 0;
        for (i = 0; i < numBlocks; i++) {
            var len = shortLen + (i >= numBlocks - numLong ? 1 : 0);
            var blk = data.slice(off, off + len);
            off += len;
            blocks.push(blk);
            ecBlocks.push(rsRemainder(blk, divisor));
        }

        var out = [];
        var maxLen = shortLen + (numLong > 0 ? 1 : 0);
        for (i = 0; i < maxLen; i++) {
            for (j = 0; j < numBlocks; j++) if (i < blocks[j].length) out.push(blocks[j][i]);
        }
        for (i = 0; i < spec.ecPerBlock; i++) {
            for (j = 0; j < numBlocks; j++) out.push(ecBlocks[j][i]);
        }
        return out;
    }

    // ── Symbol construction ──
    function makeSymbol(codewords, version) {
        var size = version * 4 + 17;
        var modules = [], isFn = [];
        for (var y = 0; y < size; y++) {
            modules.push(new Array(size).fill(false));
            isFn.push(new Array(size).fill(false));
        }
        function setFn(x, y, dark) {
            if (x < 0 || y < 0 || x >= size || y >= size) return;
            modules[y][x] = dark; isFn[y][x] = true;
        }

        // Timing patterns.
        for (var i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }

        // Finder patterns + their separators.
        [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (p) {
            for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
                var d = Math.max(Math.abs(dx), Math.abs(dy));
                setFn(p[0] + dx, p[1] + dy, d !== 2 && d !== 4);
            }
        });

        // Alignment pattern. Versions 2–6 have exactly one, at (size-7, size-7).
        if (version >= 2) {
            var a = size - 7, dy, dx;
            for (dy = -2; dy <= 2; dy++) for (dx = -2; dx <= 2; dx++) {
                setFn(a + dx, a + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
            }
        }

        function drawFormat(mask) {
            var data = (ECL_FORMAT_BITS << 3) | mask;      // 5 bits
            var rem = data;
            for (var k = 0; k < 10; k++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
            var bits = ((data << 10) | rem) ^ 0x5412;      // BCH(15,5) + spec mask
            function bit(n) { return ((bits >>> n) & 1) !== 0; }
            for (k = 0; k <= 5; k++) setFn(8, k, bit(k));
            setFn(8, 7, bit(6)); setFn(8, 8, bit(7)); setFn(7, 8, bit(8));
            for (k = 9; k < 15; k++) setFn(14 - k, 8, bit(k));
            for (k = 0; k < 8; k++) setFn(size - 1 - k, 8, bit(k));
            for (k = 8; k < 15; k++) setFn(8, size - 15 + k, bit(k));
            setFn(8, size - 8, true);                      // always dark
        }
        drawFormat(0); // reserve the areas; rewritten once the mask is chosen

        // Zigzag data placement, skipping function modules.
        var bitIdx = 0, total = codewords.length * 8, y;
        for (var right = size - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;                    // the vertical timing column
            for (var vert = 0; vert < size; vert++) {
                for (var j = 0; j < 2; j++) {
                    var x = right - j;
                    var upward = ((right + 1) & 2) === 0;
                    y = upward ? size - 1 - vert : vert;
                    if (!isFn[y][x] && bitIdx < total) {
                        modules[y][x] = ((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) !== 0;
                        bitIdx++;
                    }
                }
            }
        }

        function maskFn(m, x, y) {
            switch (m) {
                case 0: return (x + y) % 2 === 0;
                case 1: return y % 2 === 0;
                case 2: return x % 3 === 0;
                case 3: return (x + y) % 3 === 0;
                case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
                case 5: return (x * y) % 2 + (x * y) % 3 === 0;
                case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
                default: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
            }
        }
        function applyMask(m) {
            for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) {
                if (!isFn[yy][xx] && maskFn(m, xx, yy)) modules[yy][xx] = !modules[yy][xx];
            }
        }

        // Choose the mask that scores lowest on the four penalty rules. A bad
        // mask is still a valid symbol, but scanners lock on far less reliably.
        var best = 0, bestScore = Infinity;
        for (var m = 0; m < 8; m++) {
            applyMask(m); drawFormat(m);
            var s = penalty(modules, size);
            if (s < bestScore) { bestScore = s; best = m; }
            applyMask(m); // undo (XOR is its own inverse)
        }
        applyMask(best); drawFormat(best);
        return { modules: modules, size: size, mask: best, version: version };
    }

    function penalty(m, size) {
        var score = 0, x, y, i;

        // Rule 1 — runs of five or more same-coloured modules.
        function runs(get) {
            for (var a = 0; a < size; a++) {
                var run = 1;
                for (var b = 1; b < size; b++) {
                    if (get(a, b) === get(a, b - 1)) {
                        run++;
                        if (run === 5) score += 3; else if (run > 5) score += 1;
                    } else run = 1;
                }
            }
        }
        runs(function (r, c) { return m[r][c]; });
        runs(function (c, r) { return m[r][c]; });

        // Rule 2 — 2x2 blocks of one colour.
        for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) {
            var v = m[y][x];
            if (v === m[y][x + 1] && v === m[y + 1][x] && v === m[y + 1][x + 1]) score += 3;
        }

        // Rule 3 — finder-like 1:1:3:1:1 sequences with four light modules
        // beside them, which is what makes a scanner mistake data for a corner.
        var PAT = [true, false, true, true, true, false, true, false, false, false, false];
        function hasPat(get, a, b, rev) {
            for (var k = 0; k < 11; k++) {
                var want = rev ? PAT[10 - k] : PAT[k];
                if (get(a, b + k) !== want) return false;
            }
            return true;
        }
        for (y = 0; y < size; y++) for (x = 0; x <= size - 11; x++) {
            if (hasPat(function (r, c) { return m[r][c]; }, y, x, false)) score += 40;
            if (hasPat(function (r, c) { return m[r][c]; }, y, x, true)) score += 40;
        }
        for (x = 0; x < size; x++) for (y = 0; y <= size - 11; y++) {
            if (hasPat(function (c, r) { return m[r][c]; }, x, y, false)) score += 40;
            if (hasPat(function (c, r) { return m[r][c]; }, x, y, true)) score += 40;
        }

        // Rule 4 — deviation from a 50/50 dark ratio.
        var dark = 0;
        for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (m[y][x]) dark++;
        var pct = dark * 100 / (size * size);
        score += Math.floor(Math.abs(pct - 50) / 5) * 10;
        return score;
    }

    // ── Public API ──
    function matrix(text) {
        var bytes = toUtf8(String(text));
        var version = pickVersion(bytes.length);
        if (version < 0) return null;   // too long for version 6-M
        return makeSymbol(buildCodewords(bytes, version), version);
    }

    // One <path> for every dark module. Scanners need the quiet zone, so the
    // default margin is the spec's 4 modules — do not trim it to save pixels.
    function svg(text, opts) {
        opts = opts || {};
        var sym = matrix(text);
        if (!sym) return '';
        var margin = opts.margin == null ? 4 : opts.margin;
        var dim = sym.size + margin * 2;
        var d = '';
        for (var y = 0; y < sym.size; y++) {
            for (var x = 0; x < sym.size; x++) {
                if (sym.modules[y][x]) d += 'M' + (x + margin) + ',' + (y + margin) + 'h1v1h-1z';
            }
        }
        var px = opts.size ? ' width="' + opts.size + '" height="' + opts.size + '"' : '';
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim + '"' + px +
               ' shape-rendering="crispEdges" role="img" aria-label="QR code">' +
               '<rect width="' + dim + '" height="' + dim + '" fill="' + (opts.light || '#fff') + '"/>' +
               '<path d="' + d + '" fill="' + (opts.dark || '#000') + '"/></svg>';
    }

    // ── Self-test ──
    // The encoder has no decoder to check it against, so this asserts the
    // pieces that are independently knowable: the published format-info
    // strings, that RS parity actually divides out, and that reading the data
    // region back out of a finished symbol returns the codewords that went in.
    function selfTest() {
        var fails = [];

        // 1. Format information against the published table (level M).
        var KNOWN_M = ['101010000010010', '101000100100101', '101111001111100', '101101101001011',
                       '100010111111001', '100000011001110', '100111110010111', '100101010100000'];
        for (var mask = 0; mask < 8; mask++) {
            var data = (0x00 << 3) | mask, rem = data;
            for (var k = 0; k < 10; k++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
            var bits = ((data << 10) | rem) ^ 0x5412;
            var s = bits.toString(2).padStart(15, '0');
            if (s !== KNOWN_M[mask]) fails.push('format mask ' + mask + ': ' + s + ' != ' + KNOWN_M[mask]);
        }

        // 2. Reed–Solomon: message followed by its parity must divide cleanly.
        var div = rsDivisor(10);
        var msg = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
        var parity = rsRemainder(msg, div);
        var check = rsRemainder(msg.concat(parity), div);
        if (check.some(function (b) { return b !== 0; })) fails.push('RS parity does not divide out');

        // 3. Round-trip: rebuild a symbol, then read the data region back.
        var text = 'https://example.com/#ABC123';
        var bytes = toUtf8(text);
        var version = pickVersion(bytes.length);
        var cw = buildCodewords(bytes, version);
        var sym = makeSymbol(cw, version);
        var size = sym.size;
        // Re-derive which modules are function modules, then un-mask and read.
        var probe = makeSymbol(cw.map(function () { return 0; }), version);
        void probe;
        var read = readBack(sym, cw.length);
        var same = read.length === cw.length && read.every(function (b, i) { return b === cw[i]; });
        if (!same) fails.push('data placement round-trip mismatch');

        // 4. Structure: finder centres dark, timing alternating.
        if (!sym.modules[3][3] || !sym.modules[3][size - 4] || !sym.modules[size - 4][3]) {
            fails.push('finder centres not dark');
        }
        for (var i = 8; i < size - 8; i++) {
            if (sym.modules[6][i] !== (i % 2 === 0)) { fails.push('timing row broken at ' + i); break; }
        }

        return { pass: fails.length === 0, failures: fails, version: sym.version, mask: sym.mask, size: sym.size };
    }

    // Inverse of the placement step: un-mask and walk the same zigzag.
    function readBack(sym, codewordCount) {
        var size = sym.size, version = sym.version;
        var isFn = [];
        for (var y = 0; y < size; y++) isFn.push(new Array(size).fill(false));
        function mark(x, y) { if (x >= 0 && y >= 0 && x < size && y < size) isFn[y][x] = true; }
        for (var i = 0; i < size; i++) { mark(6, i); mark(i, 6); }
        [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (p) {
            for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) mark(p[0] + dx, p[1] + dy);
        });
        if (version >= 2) {
            var a = size - 7, dy, dx;
            for (dy = -2; dy <= 2; dy++) for (dx = -2; dx <= 2; dx++) mark(a + dx, a + dy);
        }
        for (i = 0; i <= 8; i++) { mark(8, i); mark(i, 8); }
        for (i = 0; i < 8; i++) { mark(size - 1 - i, 8); mark(8, size - 1 - i); }

        function maskFn(m, x, y) {
            switch (m) {
                case 0: return (x + y) % 2 === 0;
                case 1: return y % 2 === 0;
                case 2: return x % 3 === 0;
                case 3: return (x + y) % 3 === 0;
                case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
                case 5: return (x * y) % 2 + (x * y) % 3 === 0;
                case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
                default: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
            }
        }
        var out = [], cur = 0, n = 0, y;
        for (var right = size - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;
            for (var vert = 0; vert < size; vert++) {
                for (var j = 0; j < 2; j++) {
                    var x = right - j;
                    var upward = ((right + 1) & 2) === 0;
                    y = upward ? size - 1 - vert : vert;
                    if (isFn[y][x] || out.length >= codewordCount) continue;
                    var bit = sym.modules[y][x];
                    if (maskFn(sym.mask, x, y)) bit = !bit;
                    cur = (cur << 1) | (bit ? 1 : 0);
                    if (++n === 8) { out.push(cur); cur = 0; n = 0; }
                }
            }
        }
        return out;
    }

    window.QRCode = { svg: svg, matrix: matrix, selfTest: selfTest, maxBytes: VERSION[MAX_VERSION].data - 2 };
})();
