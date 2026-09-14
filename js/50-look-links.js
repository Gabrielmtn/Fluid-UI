// ═══════════════════════════════════════════════════════════════════
// js/50-look-links.js — shared-settings links (2026-09-14).
// LOAD ORDER: after 49-hotkey-binds.js (end of the sync list). It waits for
//   the async chain and the saved-session restore before it applies anything.
// PROVIDES: window.LookLinks = { parse, pending, encode, decode, url,
//   copyCurrent, copySnapshot, applyPayload }
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
//   kaleidoscope, light position and path, brush ramps, material, brush tip,
//   shooting-star origin, oscillator. Only values that differ from the
//   defaults travel (the recipient's applyPresetSnapshotFull fills the rest
//   from the same defaults), deflated and base64url'd: about 900 characters
//   for a curated look. A custom brush-shape IMAGE cannot ride (it is a
//   local file); the tip falls back to its built-in shape.
// What never rides: content (layers, masks, text, recordings), libraries
//   (user palettes), and the recipient's workspace, device and privacy
//   settings — resolutions, fps cap, recording, stats, autoload, PhotoSafe,
//   cursor, borders, focus/stream format, capture-on-hover, audio input,
//   Transparent Background. The apply holds those at the recipient's own
//   values, so the defaults merge cannot reset them either.
// Untrusted input: allowlisted sections, primitive leaves only, strings of
//   at most 64 characters from a safe set, colours must be hex, depth ≤ 3,
//   inflated JSON capped at 64 KB; applyPresetSnapshot then clamps every
//   slider through ParamRegistry and skips ids it does not know.
// Applied once the app is built, over the recipient's saved session and
//   never written into it (withoutPersisting); refused while in a room (a
//   snapshot apply would re-dress everyone's canvas); the URL is cleaned
//   afterwards so a reload does not re-apply it.
// Format: ?look=1.<base64url(deflate-raw(JSON))> ("0." = uncompressed, from
//   a browser without CompressionStream). JSON = the trimmed snapshot, its
//   schema version, and an optional name n (a saved preset's name).
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var PARAM = 'look';
    var WEB_HOME = 'https://swirltogether.com/';
    var PAYLOAD_RE = /^[01]\.[A-Za-z0-9_-]{8,12000}$/;
    var SNAPSHOT_VERSION = 2;           // capturePresetSnapshot's schema
    var MAX_JSON = 65536;               // inflate cap: a link is ~1-2 KB of JSON
    var own = Object.prototype.hasOwnProperty;

    var SECTIONS = ['sliders', 'checkboxes', 'selects', 'colors', 'kaleido', 'paletteIndex',
        'paletteName', 'savedColors', 'armColors', 'lightPos', 'lightShiftPath', 'brushState',
        'material', 'brushTip', 'ssOrigin', 'cosOscillator'];
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

    // ── Snapshot → link ─────────────────────────────────────────────
    function round6(v) { return (typeof v === 'number' && isFinite(v)) ? Number(v.toPrecision(6)) : v; }

    function trim(snap) {
        var reg = (window.ParamRegistry && typeof window.ParamRegistry.defaults === 'function') ? window.ParamRegistry.defaults() : null;
        var base = (typeof window.baselineLookSnapshot === 'function') ? window.baselineLookSnapshot() : null;
        var out = { version: SNAPSHOT_VERSION };
        ['sliders', 'checkboxes', 'selects'].forEach(function (sec) {
            var src = snap[sec] || {}, o = {}, any = false;
            Object.keys(src).forEach(function (k) {
                if (SKIP[sec][k]) return;
                var v = round6(src[k]);
                if (reg && reg[sec] && own.call(reg[sec], k) && round6(reg[sec][k]) === v) return;   // the default: the merge brings it back
                o[k] = v; any = true;
            });
            if (any) out[sec] = o;
        });
        SECTIONS.forEach(function (k) {
            if (k === 'sliders' || k === 'checkboxes' || k === 'selects') return;
            var v = snap[k];
            if (v === undefined || v === null) return;
            if (k === 'brushTip') v = Object.assign({}, v, { shapeId: null });
            if (base && base[k] !== undefined && JSON.stringify(base[k]) === JSON.stringify(v)) return;
            out[k] = v;
        });
        return out;
    }

    function cleanName(s) { return String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40); }

    function encode(snap, name) {
        var body = trim(snap);
        var n = cleanName(name);
        if (n) body.n = n;
        var bytes = new TextEncoder().encode(JSON.stringify(body));
        if (canZip()) {
            return through(bytes, new CompressionStream('deflate-raw')).then(function (z) { return '1.' + b64urlFromBytes(z); });
        }
        return Promise.resolve('0.' + b64urlFromBytes(bytes));
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
            if (!own.call(v, k) || !/^[\w-]{1,48}$/.test(k) || n++ >= 200) continue;
            var y = leaf(v[k], depth + 1);
            if (y !== undefined) o[k] = y;
        }
        return o;
    }
    function sanitize(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
        var out = {};
        SECTIONS.forEach(function (k) {
            if (!own.call(obj, k)) return;
            var v = leaf(obj[k], 0);
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
        if (out.brushTip && typeof out.brushTip === 'object') out.brushTip.shapeId = null;
        out.version = (typeof obj.version === 'number' && isFinite(obj.version)) ? obj.version : SNAPSHOT_VERSION;
        return { snapshot: out, name: (typeof obj.n === 'string') ? cleanName(obj.n) : '' };
    }

    function decode(payload) {
        if (!PAYLOAD_RE.test(String(payload || ''))) return Promise.reject(new Error('not a settings link'));
        var bytes;
        try { bytes = bytesFromB64url(payload.slice(2)); } catch (e) { return Promise.reject(e); }
        var raw;
        if (payload.charAt(0) === '1') {
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
    function urlFor(payload) { return base() + '?' + PARAM + '=' + payload; }
    function url(snap, name) { return encode(snap, name).then(urlFor); }

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

    function copySnapshot(snap, name) {
        if (!snap) { toast('Nothing to share yet.'); return Promise.resolve(false); }
        return url(snap, name).then(function (u) {
            return copyText(u).then(function (ok) {
                if (ok) {
                    toast((cleanName(name) ? '"' + cleanName(name) + '"' : 'These settings') +
                        ' copied as a link. It opens Swirl Together with them — in the browser, or in the desktop app.', 6000);
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

    function copyCurrent() {
        var snap = (typeof window.capturePresetSnapshot === 'function') ? window.capturePresetSnapshot({ lookOnly: true }) : null;
        return copySnapshot(snap, null);
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

    function announce(name, version) {
        var msg = name ? 'Opened "' + name + '" — shared settings. Paint with them.' : 'Opened shared settings — paint with them.';
        if (typeof version === 'number' && version > SNAPSHOT_VERSION) msg += ' (Made with a newer version; a few settings may not carry over.)';
        msg += ' To keep them: Presets → + New Preset.';
        var show = function () { toast(msg, 7000); };
        // The startup fork owns the screen until it is answered; say it after.
        var uv = window.UIVisibility;
        if (uv && typeof uv.forkPending === 'function' && uv.forkPending() && uv.EVENT) {
            document.addEventListener(uv.EVENT, function () { setTimeout(show, 400); }, { once: true });
        } else {
            show();
        }
    }

    function applySnapshot(snap, name, opts) {
        if (typeof window.applyPresetSnapshotFull !== 'function') return false;
        // Never re-dress a live room: the snapshot would reach every peer's
        // canvas through the look mirror, and under a host's lock it would
        // fight it. (06a's room is a script-global lexical binding.)
        var room = null;
        try { room = currentRoom || null; } catch (_) { room = null; }
        if (room) {
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
        withoutPersisting(function () { window.applyPresetSnapshotFull(s); });
        if (typeof window.clearActivePreset === 'function') window.clearActivePreset();
        document.querySelectorAll('.user-preset-btn.active, .mixer-user-preset-btn.active')
            .forEach(function (b) { b.classList.remove('active'); });
        if (window.QualityGovernor) {
            try { (window.QualityGovernor.softReset || window.QualityGovernor.reset)(); } catch (_) {}
        }
        if (!opts || opts.announce !== false) announce(name, snap.version);
        return true;
    }

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
    var pending = parse();

    function roomInHash() {
        var h = window.location.hash;
        return !!(h && h.length > 1 && h !== '#DEFAULT-ROOM');
    }
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

    if (pending) {
        if (roomInHash()) {
            console.log('[look-link] ignoring ?look=: the URL also carries a room code');
            pending = null;
            cleanUrl();
        } else {
            afterSettled(function () {
                var want = pending;
                pending = null;
                if (!want) { cleanUrl(); return; }
                applyPayload(want.payload).then(cleanUrl, cleanUrl);
            });
        }
    }

    // ── "Copy link to these settings" in the Presets popup ──────────
    // The popup's list is re-rendered on every open (renderMixerUserPresets
    // empties it), so the button sits on the panel itself, after the list.
    // A saved preset shares itself from its ⋯ menu (20-mixer-layout).
    function mountCopyButton() {
        var panel = document.querySelector('.mixer-presets-panel');
        if (!panel || panel.querySelector('.look-link-copy')) return;
        var foot = document.createElement('div');
        foot.className = 'look-link-foot';
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'look-link-copy btn--sm';
        b.textContent = 'Copy link to these settings';
        b.title = 'A link that opens Swirl Together with every look setting you have now — colours, brush, fluid, symmetry, finish — in the browser or the desktop app. Their own marks, not your painting.';
        b.addEventListener('click', function (e) { e.stopPropagation(); copyCurrent(); });
        foot.appendChild(b);
        panel.appendChild(foot);
    }
    afterSettled(mountCopyButton);

    window.LookLinks = {
        PARAM: PARAM,
        PAYLOAD_RE: PAYLOAD_RE,
        parse: parse,
        pending: function () { return pending; },
        encode: encode,
        decode: decode,
        url: url,
        copyCurrent: copyCurrent,
        copySnapshot: copySnapshot,
        applyPayload: applyPayload
    };
})();
