// MP4 writer for the video export (2026-10-04, user test 3).
//
// MediaRecorder's MP4 is a FRAGMENTED file: an empty moov (duration 0, no
// sample table) followed by moof/mdat pairs, every frame stamped with the wall
// clock. Editors such as VideoProc refuse it, the stream is labelled H.264
// level 3.1 whatever its size and rate, and a 60 fps ask reads back as 59.67.
// This writes the plain kind instead, for H.264 from WebCodecs' VideoEncoder:
//   ftyp, free + mdat (every frame's bytes, in order), moov (the full sample
//   table, written last), every frame exactly 1/fps long, the level that the
//   size and rate actually need.
// No dependencies, like the GIF encoder in 24-video-export.js. The exporter
// decides where the bytes go (a Blob in memory, or a file on the desktop); this
// only lays them out:
//   var mux = Mp4Writer.create({ width, height, fps });
//   head = mux.head()                    — write first; patched at the end
//   mux.config(description, colorSpace)  — from the first chunk's metadata
//   mux.sample(byteLength, isKey, timestampUs) per chunk, then write its bytes
//   tail = mux.moov(); p = mux.mdatPatch() — write tail last, p.bytes at p.at
// defragment() at the bottom does the other half: MediaRecorder's own MP4
// (still used for a take with sound) made plain in place.
(function () {
    'use strict';

    // ── Bytes ───────────────────────────────────────────────────────
    function concat(parts) {
        var n = 0, i;
        for (i = 0; i < parts.length; i++) n += parts[i].length;
        var out = new Uint8Array(n), at = 0;
        for (i = 0; i < parts.length; i++) { out.set(parts[i], at); at += parts[i].length; }
        return out;
    }
    function u8(v) { return new Uint8Array([v & 255]); }
    function u16(v) { return new Uint8Array([(v >>> 8) & 255, v & 255]); }
    function u32(v) { return new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]); }
    function u64(v) {   // exact up to 2^53, far past any recording
        var hi = Math.floor(v / 4294967296), lo = v - hi * 4294967296;
        return concat([u32(hi), u32(lo)]);
    }
    function ascii(s) {
        var out = new Uint8Array(s.length);
        for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 255;
        return out;
    }
    function zeros(n) { return new Uint8Array(n); }
    function box(type, parts) { var body = concat(parts || []); return concat([u32(8 + body.length), ascii(type), body]); }
    function fullBox(type, version, flags, parts) {
        return box(type, [u8(version), u8(flags >>> 16), u16(flags & 65535)].concat(parts || []));
    }
    var MATRIX = [65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824].map(u32);   // identity, 16.16 / 2.30
    var NAME = 'Swirl Together';   // the sample entry's compressorname (31 bytes at most)
    function copyBytes(d) {
        if (d instanceof ArrayBuffer) return new Uint8Array(d.slice(0));
        if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
        return null;
    }

    // ── Levels ──────────────────────────────────────────────────────
    // H.264 Table A-1: [level_idc, MaxMBPS, MaxFS, MaxBR in kbit/s (Main)].
    // High profile may run 1.25x MaxBR. The smallest level that fits the size,
    // the rate and the bitrate is the honest label; a decoder sizes its buffers
    // from it, and 3.1 for a 1080p60 stream is a lie a hardware decoder can trip on.
    var LEVELS = [
        [31, 108000, 3600, 14000], [32, 216000, 5120, 20000],
        [40, 245760, 8192, 20000], [41, 245760, 8192, 50000], [42, 522240, 8704, 50000],
        [50, 589824, 22080, 135000], [51, 983040, 36864, 240000], [52, 2073600, 36864, 240000],
        [60, 4177920, 139264, 240000], [61, 8355840, 139264, 480000], [62, 16711680, 139264, 800000]
    ];
    // Candidate codec strings, the honest level first, then every level above
    // it (an encoder that refuses one level may take the next).
    function codecCandidates(width, height, fps, bitrate) {
        var mbW = Math.ceil(width / 16), mbH = Math.ceil(height / 16);
        var fs = mbW * mbH, mbps = fs * fps, side = Math.max(mbW, mbH);
        var out = [];
        for (var i = 0; i < LEVELS.length; i++) {
            var L = LEVELS[i];
            if (!out.length && (L[1] < mbps || L[2] < fs || Math.sqrt(L[2] * 8) < side || L[3] * 1250 < bitrate)) continue;
            out.push('avc1.6400' + ('0' + L[0].toString(16)).slice(-2));
        }
        return out;
    }

    // The bitrate a picture this size and rate gets: 0.12 bits a pixel a
    // frame (1080p60 ≈ 15 Mbit/s, 4K60 ≈ 60), never under the exporter's own
    // setting. Fine swirls are expensive to keep; MediaRecorder ran 16-18
    // Mbit/s on Gabriel's exports.
    function bitrateFor(width, height, fps, floor) {
        return Math.max(floor || 0, Math.round(width * height * fps * 0.12));
    }

    // The first H.264 config this browser can encode at this size, or null
    // (no WebCodecs, or no H.264 encoder: the exporter keeps MediaRecorder).
    async function pickConfig(width, height, fps, bitrateFloor) {
        if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
        var bitrate = bitrateFor(width, height, fps, bitrateFloor);
        var codecs = codecCandidates(width, height, fps, bitrate);
        for (var i = 0; i < codecs.length; i++) {
            var cfg = {
                codec: codecs[i], width: width, height: height,
                bitrate: bitrate, framerate: fps, bitrateMode: 'variable',
                latencyMode: 'quality', avc: { format: 'avc' }
            };
            try {
                var s = await VideoEncoder.isConfigSupported(cfg);
                if (s && s.supported) return s.config || cfg;
            } catch (_) {}
        }
        return null;
    }

    // ── Colour ──────────────────────────────────────────────────────
    // WebCodecs names → ISO/IEC 23091-2 code points, for the colr box. A file
    // without it leaves an editor to guess BT.601 vs BT.709 and full vs
    // limited range, and a wrong guess shifts every colour of the painting.
    var PRIMARIES = { bt709: 1, bt470bg: 5, smpte170m: 6, bt2020: 9, smpte432: 12 };
    var TRANSFER = { bt709: 1, smpte170m: 6, linear: 8, 'iec61966-2-1': 13, pq: 16, hlg: 18 };
    var MATRIXCO = { rgb: 0, bt709: 1, bt470bg: 5, smpte170m: 6, 'bt2020-ncl': 9 };
    function colrBox(cs) {
        if (!cs) return null;
        var p = PRIMARIES[cs.primaries], t = TRANSFER[cs.transfer], m = MATRIXCO[cs.matrix];
        if (p == null || t == null || m == null) return null;
        return box('colr', [ascii('nclx'), u16(p), u16(t), u16(m), u8(cs.fullRange ? 128 : 0)]);
    }

    // ── The writer ──────────────────────────────────────────────────
    function create(opts) {
        var width = opts.width, height = opts.height, fps = opts.fps;
        // Track ticks: 90 kHz when the frame divides it (24/25/30/50/60/120),
        // else fps × 1000 — every frame lasts a whole number of ticks either way.
        var timescale = (90000 % fps === 0) ? 90000 : fps * 1000;
        var delta = timescale / fps;
        var description = null, colorSpace = null;
        var sizes = [], keys = [], order = [];   // per sample, decode order
        var dataBytes = 0;

        var ftyp = box('ftyp', [ascii('isom'), u32(512), ascii('isom'), ascii('iso2'), ascii('avc1'), ascii('mp41')]);
        // free + mdat: 16 bytes of header. Under 4 GB the free box stays and the
        // mdat gets a 32-bit size; past it, the 16 bytes become one mdat header
        // with a 64-bit size (the layout ffmpeg uses, so both kinds open anywhere).
        var HEAD_LEN = ftyp.length + 16;

        function head() {
            return concat([ftyp, u32(8), ascii('free'), u32(0), ascii('mdat')]);
        }
        function config(desc, cs) {
            if (desc && !description) description = copyBytes(desc);
            if (cs && !colorSpace) colorSpace = cs;
        }
        function sample(byteLength, isKey, timestampUs) {
            sizes.push(byteLength);
            keys.push(!!isKey);
            order.push(Math.round(timestampUs * fps / 1e6));   // presentation slot
            dataBytes += byteLength;
        }
        function mdatPatch() {
            if (8 + dataBytes <= 0xFFFFFFFF) return { at: ftyp.length + 8, bytes: u32(8 + dataBytes) };
            return { at: ftyp.length, bytes: concat([u32(1), ascii('mdat'), u64(16 + dataBytes)]) };
        }

        function moov() {
            if (!description) throw new Error('no H.264 configuration came out of the encoder');
            var n = sizes.length;
            var now = Math.floor(Date.now() / 1000) + 2082844800;   // seconds since 1904
            var mediaTicks = n * delta;
            var movieMs = Math.round(n * 1000 / fps);

            // Decode order vs presentation order. Chrome's encoders send no
            // B-frames today, so slot k arrives k-th and there is nothing to
            // say; if one ever reorders, ctts carries each frame's offset and
            // the edit list starts playback at the first presented frame.
            var shift = 0, reordered = false, i;
            for (i = 0; i < n; i++) {
                if (order[i] !== i) reordered = true;
                if (i - order[i] > shift) shift = i - order[i];
            }

            var sampleEntry = box('avc1', [
                zeros(6), u16(1),                          // reserved, data_reference_index
                zeros(16),                                 // pre_defined, reserved
                u16(width), u16(height),
                u32(0x00480000), u32(0x00480000),          // 72 dpi
                zeros(4), u16(1),                          // reserved, frame_count
                concat([u8(NAME.length), ascii(NAME), zeros(31 - NAME.length)]),   // compressorname, 32 bytes
                u16(0x18), u16(0xFFFF),                    // depth, pre_defined -1
                box('avcC', [description]),
                colrBox(colorSpace) || new Uint8Array(0),
                box('pasp', [u32(1), u32(1)])
            ]);

            var stts = fullBox('stts', 0, 0, [u32(1), u32(n), u32(delta)]);
            var keyNums = [];
            for (i = 0; i < n; i++) if (keys[i]) keyNums.push(u32(i + 1));
            var stss = keyNums.length < n ? fullBox('stss', 0, 0, [u32(keyNums.length)].concat(keyNums)) : null;
            var ctts = null;
            if (reordered) {
                var offs = [];
                for (i = 0; i < n; i++) offs.push(u32(1), u32((order[i] - i + shift) * delta));
                ctts = fullBox('ctts', 0, 0, [u32(n)].concat(offs));
            }
            var stsc = fullBox('stsc', 0, 0, [u32(1), u32(1), u32(1), u32(1)]);   // one sample per chunk
            var stsz = fullBox('stsz', 0, 0, [u32(0), u32(n)].concat(sizes.map(u32)));
            var offsets = [], at = HEAD_LEN, wide = HEAD_LEN + dataBytes > 0xFFFFFFFF;
            for (i = 0; i < n; i++) { offsets.push(wide ? u64(at) : u32(at)); at += sizes[i]; }
            var stco = fullBox(wide ? 'co64' : 'stco', 0, 0, [u32(n)].concat(offsets));

            var stbl = box('stbl', [fullBox('stsd', 0, 0, [u32(1), sampleEntry]), stts]
                .concat(stss ? [stss] : [], ctts ? [ctts] : [], [stsc, stsz, stco]));
            var minf = box('minf', [
                fullBox('vmhd', 0, 1, [u16(0), u16(0), u16(0), u16(0)]),
                box('dinf', [fullBox('dref', 0, 0, [u32(1), fullBox('url ', 0, 1, [])])]),
                stbl
            ]);
            var mdia = box('mdia', [
                fullBox('mdhd', 0, 0, [u32(now), u32(now), u32(timescale), u32(mediaTicks), u16(0x55C4), u16(0)]),   // 'und'
                fullBox('hdlr', 0, 0, [u32(0), ascii('vide'), zeros(12), ascii('VideoHandler'), u8(0)]),
                minf
            ]);
            var edts = shift ? box('edts', [fullBox('elst', 0, 0, [u32(1), u32(movieMs), u32(shift * delta), u16(1), u16(0)])]) : null;
            var trak = box('trak', [
                fullBox('tkhd', 0, 3, [u32(now), u32(now), u32(1), u32(0), u32(movieMs),
                    zeros(8), u16(0), u16(0), u16(0), u16(0)].concat(MATRIX, [u32(width * 65536), u32(height * 65536)]))
            ].concat(edts ? [edts] : [], [mdia]));
            var mvhd = fullBox('mvhd', 0, 0, [u32(now), u32(now), u32(1000), u32(movieMs),
                u32(0x00010000), u16(0x0100), zeros(10)].concat(MATRIX, [zeros(24), u32(2)]));
            return box('moov', [mvhd, trak]);
        }

        return {
            head: head, config: config, sample: sample, moov: moov, mdatPatch: mdatPatch,
            get frames() { return sizes.length; },
            get bytes() { return dataBytes; }
        };
    }

    // ── Fragmented → plain, in place (MediaRecorder's MP4) ──────────
    // A take with sound still goes through MediaRecorder, whose MP4 is the
    // fragmented kind (see the top). Rather than copy every frame into a new
    // file, this reads the fragment tables (moof: tfhd, tfdt, trun) and
    // returns what turns the file into the plain kind where it lies: patches
    // that rename the old moov and every moof to 'free' (same size, so every
    // frame stays put) and a new moov to append, its sample tables pointing
    // into the mdats already there. Each track keeps MediaRecorder's own
    // timestamps, so the sound stays where it was against the picture; a
    // track that started late gets an empty edit for the wait.
    //   read(pos, len) → Promise<Uint8Array>; size = the file's length.
    // Resolves { patches: [{ at, bytes }], tail } or null: not fragmented, or
    // a layout this doesn't know, and the caller leaves the file as it is.
    function kids(u, start, end) {
        var out = [], p = start, dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
        while (p + 8 <= end) {
            var len = dv.getUint32(p), hdr = 8;
            if (len === 1) { len = dv.getUint32(p + 8) * 4294967296 + dv.getUint32(p + 12); hdr = 16; }
            else if (len === 0) len = end - p;
            if (len < hdr || p + len > end) break;
            out.push({ type: String.fromCharCode(u[p + 4], u[p + 5], u[p + 6], u[p + 7]), at: p, body: p + hdr, end: p + len });
            p += len;
        }
        return out;
    }
    function kid(u, b, type) {
        var all = kids(u, b.body, b.end);
        for (var i = 0; i < all.length; i++) if (all[i].type === type) return all[i];
        return null;
    }
    // A copied tkhd or mdhd with its duration field set.
    function withDuration(bytes, kind, value) {
        var b = bytes.slice(), dv = new DataView(b.buffer), v = b[8];
        var off = 8 + (kind === 'tkhd' ? (v === 1 ? 28 : 20) : (v === 1 ? 24 : 16));
        if (v === 1) { dv.setUint32(off, Math.floor(value / 4294967296)); dv.setUint32(off + 4, value >>> 0); }
        else dv.setUint32(off, Math.min(value, 0xFFFFFFFF));
        return b;
    }

    async function defragment(read, size) {
        // Top-level boxes: headers only.
        var top = [], pos = 0, i;
        while (pos + 8 <= size) {
            var h = await read(pos, Math.min(16, size - pos));
            var hv = new DataView(h.buffer, h.byteOffset, h.byteLength);
            var len = hv.getUint32(0), hdr = 8;
            if (len === 1) { if (h.length < 16) return null; len = hv.getUint32(8) * 4294967296 + hv.getUint32(12); hdr = 16; }
            else if (len === 0) return null;   // runs to the end: nothing can follow it
            if (len < hdr || pos + len > size) return null;
            top.push({ type: String.fromCharCode(h[4], h[5], h[6], h[7]), pos: pos, len: len, hdr: hdr });
            pos += len;
        }
        if (pos !== size) return null;
        var moovBox = null, moofs = [];
        for (i = 0; i < top.length; i++) {
            if (top[i].type === 'moov') moovBox = top[i];
            if (top[i].type === 'moof') moofs.push(top[i]);
        }
        if (!moovBox || !moofs.length) return null;

        // The tracks, from the old moov: the boxes that carry over as they are.
        var mu = await read(moovBox.pos, moovBox.len);
        var mdv = new DataView(mu.buffer, mu.byteOffset, mu.byteLength);
        var root = { body: moovBox.hdr, end: moovBox.len };
        var tracks = {}, ids = [];
        kids(mu, root.body, root.end).forEach(function (b) {
            if (b.type !== 'trak') return;
            var tkhd = kid(mu, b, 'tkhd'), mdia = kid(mu, b, 'mdia');
            var mdhd = mdia && kid(mu, mdia, 'mdhd'), hdlr = mdia && kid(mu, mdia, 'hdlr'), minf = mdia && kid(mu, mdia, 'minf');
            var stbl = minf && kid(mu, minf, 'stbl'), dinf = minf && kid(mu, minf, 'dinf');
            var mhd = minf && (kid(mu, minf, 'vmhd') || kid(mu, minf, 'smhd') || kid(mu, minf, 'nmhd'));
            var stsd = stbl && kid(mu, stbl, 'stsd');
            if (!tkhd || !mdhd || !hdlr || !dinf || !mhd || !stsd) return;
            var id = mdv.getUint32(tkhd.body + (mu[tkhd.body] === 1 ? 20 : 12));
            tracks[id] = {
                timescale: mdv.getUint32(mdhd.body + (mu[mdhd.body] === 1 ? 20 : 12)),
                tkhd: mu.slice(tkhd.at, tkhd.end), mdhd: mu.slice(mdhd.at, mdhd.end), hdlr: mu.slice(hdlr.at, hdlr.end),
                mhd: mu.slice(mhd.at, mhd.end), dinf: mu.slice(dinf.at, dinf.end), stsd: mu.slice(stsd.at, stsd.end),
                trex: { dur: 0, size: 0, flags: 0 }, samples: [], start: null, dts: 0
            };
            ids.push(id);
        });
        var mvex = kid(mu, root, 'mvex');
        if (mvex) kids(mu, mvex.body, mvex.end).forEach(function (t) {
            var tr = t.type === 'trex' && tracks[mdv.getUint32(t.body + 4)];
            if (tr) tr.trex = { dur: mdv.getUint32(t.body + 12), size: mdv.getUint32(t.body + 16), flags: mdv.getUint32(t.body + 20) };
        });
        if (!ids.length) return null;

        // Every fragment's samples, in file order per track.
        for (var mi = 0; mi < moofs.length; mi++) {
            var mf = moofs[mi];
            var u = await read(mf.pos, mf.len);
            var dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
            var prevEnd = mf.pos;
            var trafs = kids(u, mf.hdr, mf.len).filter(function (k) { return k.type === 'traf'; });
            for (var ti = 0; ti < trafs.length; ti++) {
                var tf = trafs[ti], tfhd = kid(u, tf, 'tfhd');
                if (!tfhd) return null;
                var ff = dv.getUint32(tfhd.body) & 0xFFFFFF, q = tfhd.body + 4;
                var tr = tracks[dv.getUint32(q)];
                if (!tr) return null;
                q += 4;
                var base = (ff & 0x20000) || ti === 0 ? mf.pos : prevEnd;
                var dDur = tr.trex.dur, dSize = tr.trex.size, dFlags = tr.trex.flags;
                if (ff & 0x1) { base = dv.getUint32(q) * 4294967296 + dv.getUint32(q + 4); q += 8; }
                if (ff & 0x2) q += 4;                       // sample_description_index: one entry here
                if (ff & 0x8) { dDur = dv.getUint32(q); q += 4; }
                if (ff & 0x10) { dSize = dv.getUint32(q); q += 4; }
                if (ff & 0x20) { dFlags = dv.getUint32(q); q += 4; }
                var tfdt = kid(u, tf, 'tfdt');
                if (tfdt) {
                    var bt = u[tfdt.body] === 1 ? dv.getUint32(tfdt.body + 4) * 4294967296 + dv.getUint32(tfdt.body + 8)
                                                : dv.getUint32(tfdt.body + 4);
                    if (tr.start === null) { tr.start = bt; tr.dts = bt; }
                    else if (bt !== tr.dts && tr.samples.length) {
                        // A gap (or overlap) between fragments lands on the frame before it.
                        var last = tr.samples[tr.samples.length - 1];
                        last.dur = Math.max(1, last.dur + bt - tr.dts);
                        tr.dts = bt;
                    }
                }
                if (tr.start === null) tr.start = 0;
                var dataPos = base;
                var runs = kids(u, tf.body, tf.end).filter(function (k) { return k.type === 'trun'; });
                for (var ri = 0; ri < runs.length; ri++) {
                    var rn = runs[ri], vf = dv.getUint32(rn.body), rv = vf >>> 24, rf = vf & 0xFFFFFF;
                    var n = dv.getUint32(rn.body + 4), p = rn.body + 8, firstFlags = null;
                    if (rf & 0x1) { dataPos = base + dv.getInt32(p); p += 4; }
                    if (rf & 0x4) { firstFlags = dv.getUint32(p); p += 4; }
                    for (var si = 0; si < n; si++) {
                        var sDur = dDur, sSize = dSize, sFlags = (si === 0 && firstFlags !== null) ? firstFlags : dFlags, cto = 0;
                        if (rf & 0x100) { sDur = dv.getUint32(p); p += 4; }
                        if (rf & 0x200) { sSize = dv.getUint32(p); p += 4; }
                        if (rf & 0x400) { sFlags = dv.getUint32(p); p += 4; }
                        if (rf & 0x800) { cto = rv === 1 ? dv.getInt32(p) : dv.getUint32(p); p += 4; }
                        if (p > rn.end || dataPos + sSize > size) return null;
                        tr.samples.push({ at: dataPos, size: sSize, dur: sDur, sync: !((sFlags >>> 16) & 1), cto: cto });
                        dataPos += sSize;
                        tr.dts += sDur;
                    }
                }
                prevEnd = dataPos;
            }
        }

        // The new moov: movie time in ms, each track's own media time.
        var traks = [], endMs = 0, nextId = 1;
        ids.forEach(function (id) {
            var tr = tracks[id], s = tr.samples, n = s.length, k;
            if (!n) return;
            var mediaDur = 0, stts = [], ctts = [], anyCto = false, negative = false, syncs = [], wide = false;
            for (k = 0; k < n; k++) {
                mediaDur += s[k].dur;
                if (stts.length && stts[stts.length - 1][1] === s[k].dur) stts[stts.length - 1][0]++; else stts.push([1, s[k].dur]);
                if (ctts.length && ctts[ctts.length - 1][1] === s[k].cto) ctts[ctts.length - 1][0]++; else ctts.push([1, s[k].cto]);
                if (s[k].cto) anyCto = true;
                if (s[k].cto < 0) negative = true;
                if (s[k].sync) syncs.push(u32(k + 1));
                if (s[k].at > 0xFFFFFFFF) wide = true;
            }
            var startMs = Math.round(tr.start * 1000 / tr.timescale), durMs = Math.round(mediaDur * 1000 / tr.timescale);
            endMs = Math.max(endMs, startMs + durMs);
            nextId = Math.max(nextId, id + 1);
            var pairs = function (list) {
                var out = [u32(list.length)];
                list.forEach(function (e) { out.push(u32(e[0]), u32(e[1] >>> 0)); });
                return out;
            };
            var stbl = box('stbl', [tr.stsd, fullBox('stts', 0, 0, pairs(stts))]
                .concat(syncs.length < n ? [fullBox('stss', 0, 0, [u32(syncs.length)].concat(syncs))] : [])
                .concat(anyCto ? [fullBox('ctts', negative ? 1 : 0, 0, pairs(ctts))] : [])
                .concat([
                    fullBox('stsc', 0, 0, [u32(1), u32(1), u32(1), u32(1)]),   // one sample per chunk
                    fullBox('stsz', 0, 0, [u32(0), u32(n)].concat(s.map(function (x) { return u32(x.size); }))),
                    fullBox(wide ? 'co64' : 'stco', 0, 0, [u32(n)].concat(s.map(function (x) { return wide ? u64(x.at) : u32(x.at); })))
                ]));
            var edts = tr.start > 0 ? box('edts', [fullBox('elst', 0, 0, [u32(2),
                u32(startMs), u32(0xFFFFFFFF), u16(1), u16(0),   // the wait: an empty edit
                u32(durMs), u32(0), u16(1), u16(0)])]) : null;
            traks.push(box('trak', [withDuration(tr.tkhd, 'tkhd', startMs + durMs)].concat(edts ? [edts] : [], [
                box('mdia', [withDuration(tr.mdhd, 'mdhd', mediaDur), tr.hdlr, box('minf', [tr.mhd, tr.dinf, stbl])])
            ])));
        });
        if (!traks.length) return null;
        var now = Math.floor(Date.now() / 1000) + 2082844800;
        var mvhd = fullBox('mvhd', 0, 0, [u32(now), u32(now), u32(1000), u32(endMs),
            u32(0x00010000), u16(0x0100), zeros(10)].concat(MATRIX, [zeros(24), u32(nextId)]));
        var FREE = ascii('free');
        var patches = [{ at: moovBox.pos + 4, bytes: FREE }];
        top.forEach(function (b) { if (b.type === 'moof' || b.type === 'mfra') patches.push({ at: b.pos + 4, bytes: FREE }); });
        return { patches: patches, tail: box('moov', [mvhd].concat(traks)) };
    }

    window.Mp4Writer = {
        create: create,
        pickConfig: pickConfig,
        bitrateFor: bitrateFor,
        codecCandidates: codecCandidates,
        defragment: defragment
    };
})();
