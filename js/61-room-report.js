// ═══════════════════════════════════════════════════════════════════
// js/61-room-report.js — "Copy room report": a trace of where strokes
//   landed, sent and received, for the one room bug nobody can reproduce
//   (user test 2026-10-03).
// LOAD ORDER: after the room client (06a–06e) and 60. The hooks it reads
//   are one-liners in 06d / 06e / 05d / 05j that call window.__roomTrace
//   when it exists, so nothing breaks if this file is absent.
// PROVIDES: window.__roomTrace = { note, resize, report, copy }
//
// Two players on the Steam demo saw every stroke crossing between them
// land upside down on the other screen — "I was painting at the bottom of
// the screen, and it was being flipped to the top of his screen" — not
// from the first stroke, but soon after a window resize. Each player's own
// strokes landed under their own cursor. Every path that carries a stroke
// normalises Y top-down at both ends, and 93 two-browser probes (sizes,
// resizes, formats, zoom, resolutions, reloads, replays) never flipped one.
//
// So this records, in a ring buffer, every batch sent and received while
// in a room (dabs, the press stamp, replays, the pointer marker: count and
// the normalised x/y range on the wire, with this canvas's buffer size at
// that moment), and every resize settle. "Copy room report" in the room
// panel copies it as JSON with a snapshot of the state that decides where
// paint lands: canvas buffer / CSS box / drawing buffer, texture sizes,
// Zoom View, Kaleido and Mandala, Multi-Brush layout, a mirror-bound mouse
// button, a stroke lock, the format, the edition. If the flip comes back,
// both players press it and the two reports say which side moved what.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var MAX = 400;
    var CURSOR_EVERY_MS = 250;
    var buf = [];
    var lastCursor = {};      // 'sent' | 'recv:<id>' -> ms
    var t0 = Date.now();

    function r3(v) { return Math.round(v * 1000) / 1000; }
    function shortId(id) { return id == null ? null : String(id).slice(0, 6); }
    function inRoom() {
        try { return typeof isMultiplayerEnabled !== 'undefined' && !!isMultiplayerEnabled; } catch (_) { return false; }
    }

    // points: arrays [x, y, ...] or objects {x, y}, normalised 0..1 (top-down)
    function note(dir, kind, from, points) {
        if (!inRoom() || !points || !points.length) return;
        var now = Date.now();
        if (kind === 'cursor') {
            var key = dir + ':' + (from || '');
            if (lastCursor[key] && now - lastCursor[key] < CURSOR_EVERY_MS) return;
            lastCursor[key] = now;
        }
        var xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity, n = 0;
        for (var i = 0; i < points.length; i++) {
            var p = points[i];
            if (!p) continue;
            var x = Array.isArray(p) ? p[0] : p.x, y = Array.isArray(p) ? p[1] : p.y;
            if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) continue;
            n++;
            if (x < xmin) xmin = x; if (x > xmax) xmax = x;
            if (y < ymin) ymin = y; if (y > ymax) ymax = y;
        }
        if (!n) return;
        var cv = window.canvas || document.getElementById('canvas');
        push({ t: now - t0, dir: dir, kind: kind, from: shortId(from), n: n,
            x: [r3(xmin), r3(xmax)], y: [r3(ymin), r3(ymax)],
            buf: cv ? [cv.width, cv.height] : null });
    }

    function resize(info) {
        if (!inRoom()) return;
        push(Object.assign({ t: Date.now() - t0, dir: 'local', kind: 'resize' }, info || {}));
    }

    function push(e) {
        buf.push(e);
        if (buf.length > MAX) buf.splice(0, buf.length - MAX);
    }

    function safe(fn) { try { return fn(); } catch (_) { return null; } }

    function snapshot() {
        var cv = window.canvas || document.getElementById('canvas');
        var r = cv ? cv.getBoundingClientRect() : null;
        var cfg = window.config || {};
        var BM = window.ButtonModes;
        var ZV = window.ZoomView;
        var scripts = [].map.call(document.querySelectorAll('script[src*="06d-mp-paint-wire"]'), function (s) { return s.getAttribute('src'); });
        return {
            app: {
                title: document.title,
                edition: window.SWIRL_EDITION || null,
                steam: !!window.SWIRL_STEAM,
                electron: !!window.IS_ELECTRON,
                bundle: scripts[0] || null,
                dpr: window.devicePixelRatio,
                window: [window.innerWidth, window.innerHeight],
                screen: [screen.width, screen.height],
                ua: navigator.userAgent
            },
            room: safe(function () {
                return {
                    connected: !!isMultiplayerEnabled,
                    room: currentRoom ? String(currentRoom).slice(0, 12) : null,
                    me: shortId(clientId),
                    role: myRole,
                    people: connectedClients,
                    locked: !!roomLocked,
                    lookLocked: !!window.__mpSettingsLocked,
                    turns: (typeof turnsOn !== 'undefined') ? !!turnsOn : null,
                    turnMode: (typeof turnModeLocal !== 'undefined') ? turnModeLocal : null,
                    holder: (typeof turnHolderId !== 'undefined') ? shortId(turnHolderId) : null
                };
            }),
            canvas: {
                buffer: cv ? [cv.width, cv.height] : null,
                css: r ? [r3(r.width), r3(r.height)] : null,
                at: r ? [r3(r.left), r3(r.top)] : null,
                drawingBuffer: safe(function () { return [gl.drawingBufferWidth, gl.drawingBufferHeight]; }),
                dye: safe(function () { return [dyeTexWidth, dyeTexHeight]; }),
                sim: safe(function () { return [simTexWidth, simTexHeight]; }),
                renderScale: cfg.RENDER_SCALE,
                layerBox: safe(function () { return window.LayerGeometry.box(); }),
                zoomView: ZV ? safe(function () { return { scale: ZV.scale, transform: (document.getElementById('canvas-wrapper') || {}).style ? document.getElementById('canvas-wrapper').style.transform : null }; }) : null
            },
            look: {
                kaleido: !!window.kaleidoEnabled,
                kaleidoMode: safe(function () { return document.getElementById('kaleidoMode').value; }),
                kaleidoSegments: window.kaleidoSegments,
                kaleidoAngle: window.kAngle,
                mandala: safe(function () { return !!document.getElementById('mandalaToggle').checked; }),
                arms: safe(function () { return animationMultiplier; }),
                symmetry: cfg.SYMMETRY_MODE,
                sameAngle: cfg.SYM_SAME_ANGLE,
                faceCenter: cfg.SYM_FACE_CENTER,
                leftButton: BM && BM.side ? safe(function () { return BM.side('left'); }) : null,
                rightButton: BM && BM.side ? safe(function () { return BM.side('right'); }) : null,
                strokeLock: window.StrokeLock && window.StrokeLock.shaping ? safe(function () { return !!window.StrokeLock.shaping(); }) : null,
                gravity: !!cfg.AMBIENT_FORCE,
                brushTarget: cfg.BRUSH_TARGET,
                format: safe(function () { return document.body.className; })
            }
        };
    }

    function report() {
        return JSON.stringify({ v: 1, at: new Date().toISOString(), state: snapshot(), trace: buf.slice() }, null, 1);
    }

    function copy() {
        var text = report();
        function viaElectron() {
            try { require('electron').clipboard.writeText(text); return true; } catch (_) { return false; }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).then(function () { return true; },
                function () { return viaElectron(); });
        }
        return Promise.resolve(viaElectron());
    }

    // The last item of the room panel's ⋯ menu (06e), for host and guest
    // alike. data-stay keeps the menu open after the press, so "Copied" can
    // be read where it was asked for.
    (function mount() {
        var menu = document.getElementById('mpRoomMenu');
        if (!menu) { setTimeout(mount, 500); return; }
        if (document.getElementById('roomReportBtn')) return;
        var b = document.createElement('button');
        b.type = 'button';
        b.id = 'roomReportBtn';
        b.className = 'brush-shape-menu-item mp-room-report';
        b.setAttribute('role', 'menuitem');
        b.setAttribute('data-stay', '');
        b.textContent = 'Copy room report';
        b.title = 'Copies where recent strokes landed, sent and received, with this canvas’s size and settings. ' +
            'If strokes show up in the wrong place for someone, both of you press this and send the two reports.';
        b.addEventListener('click', function () {
            copy().then(function (ok) {
                b.textContent = ok ? 'Copied' : 'Could not copy';
                setTimeout(function () { b.textContent = 'Copy room report'; }, 1600);
            });
        });
        menu.appendChild(b);
    })();

    window.__roomTrace = { note: note, resize: resize, report: report, copy: copy };
})();
