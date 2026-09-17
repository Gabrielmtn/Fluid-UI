// ═══════════════════════════════════════════════════════════════════
// phone/phone.js — Swirl Together on a phone: a brush for a bigger screen.
//
// A phone does not run the painting. It joins the room a computer is in
// (the QR or code from Swirl Together → Paint from your phone) and sends its
// strokes as ordinary room paint, so every canvas in the room — the
// computer's included — draws them the way it draws anyone's. What is on
// this page is what a phone is good for: a pad the shape of the computer's
// canvas and a size slider. Everything else about the brush is the
// computer's. The full app stays one link away for someone with no
// computer to watch.
//
// Phones reach this page from swirltogether.com (index.html sends small
// touch screens here, room code and all) and straight from the QR.
//
// THE WIRE — the room protocol of js/06a–06e, nothing new on the canvas side
//   out  'splat'       a press stamp (down:true), then dab trains
//                      [x, y, dx, dy, r, share, k, t] (js/06d queueDab):
//                      positions 0..1, velocities in the COMPUTER's canvas
//                      px × 10, the dye share in the computer's flow model
//        'cursor'      where the finger is, so the big screen shows it
//        'pointer-up'  the stroke is over
//        'pad-hello'   "I am a phone"; the host answers with 'pad-info'
//        'turn-pass'   Take turns / Call and return
//        'clear', 'ping'
//   in   'connected', 'client-count', 'host-changed', 'turn-state', 'pad-info'
//   The relay (party/index.ts) never makes a pad (?kind=pad) the host.
//
// THE BRUSH — the computer's, walked the way js/05d0-brush-engine.js walks
//   it, in the computer's canvas pixels as 'pad-info' reports them: a dab
//   every Spacing px of travel (1 px by default), velocity 10 × spacing along
//   the stroke, dye share k = spacing / (REF × brush diameter), the same
//   per-sample dab budget and the same slow-movement floor. Same density as
//   a stroke painted on the computer, and density is darkness there: a
//   solid-colour arm paints every dab at full strength.
//   COLOUR is the computer's too, and not only for consistency: a peer's dab
//   is coloured by the RECEIVING canvas's arm settings (js/05g
//   resolveArmColor), so a solid-colour brush over there repaints whatever
//   colour a phone chose. The phone follows the computer's mode instead —
//   its solid colour, its palette in turn, or a fresh colour each stroke.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };
    var HEX = /^#[0-9a-f]{6}$/i;

    // ── Where the rooms are (js/06a-mp-core.js, same rules) ─────────
    function isPlainWsHost(h) {
        return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/.test(h);
    }
    var HOST = (function () {
        try {
            var o = localStorage.getItem('fluidMultiplayerHost');
            if (o && /^[\w.-]+(:\d+)?$/.test(o.trim())) return o.trim();
        } catch (_) {}
        var h = location.host;
        if (h && !isPlainWsHost(h) && /^https?:$/.test(location.protocol)) return h;
        return 'swirltogether.com';
    })();

    // The pad's own device id, deliberately not the app's fluidDeviceId: the
    // relay keys a member (turn order, a locked room's guest list) by it, and
    // in one browser a pad tab and an app tab would otherwise be one member.
    var UID = (function () {
        var mk = function () { return 'P' + Math.random().toString(36).slice(2, 10).toUpperCase(); };
        try {
            var v = localStorage.getItem('swirlPadId');
            if (!v) { v = mk(); localStorage.setItem('swirlPadId', v); }
            return v;
        } catch (_) { return mk(); }
    })();
    // Same phone across reconnects, without putting the id itself on the
    // wire (a locked room re-admits by it): the computer greets it once.
    var TAG = (function () {
        var h = 7;
        for (var i = 0; i < UID.length; i++) h = (h * 131 + UID.charCodeAt(i)) >>> 0;
        return h.toString(36);
    })();

    // ── Room codes (js/06a-mp-core.js extractRoomCode) ───────────────
    function extractRoomCode(input) {
        if (!input) return '';
        var s = String(input).trim();
        if (s.indexOf('#') !== -1) s = s.substring(s.lastIndexOf('#') + 1);
        else if (s.indexOf('/') !== -1) s = s.substring(s.lastIndexOf('/') + 1);
        return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    }
    function codeFromHash() {
        var h = (location.hash || '').slice(1).toUpperCase();
        return /^[A-Z0-9]{6}$/.test(h) ? h : null;
    }

    // ── Who is who (js/06e-mp-panel.js, same derivation) ─────────────
    function hashId(id) {
        var h = 0, s = String(id);
        for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
        return Math.abs(h);
    }
    function colorForClient(id) { return 'hsl(' + (hashId(id) % 360) + ', 80%, 62%)'; }
    function shortName(id) {
        var s = String(id).replace(/[^a-zA-Z0-9]/g, '');
        return 'Artist-' + (s.slice(-2).toUpperCase() || '??');
    }

    var clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
    var r3 = function (v) { return Math.round(v * 1e3) / 1e3; };
    var r4 = function (v) { return Math.round(v * 1e4) / 1e4; };
    var r5 = function (v) { return Math.round(v * 1e5) / 1e5; };
    function num(v, lo, hi, dflt) {
        return (typeof v === 'number' && isFinite(v)) ? clamp(v, lo, hi) : dflt;
    }

    // ═══ The room ═══════════════════════════════════════════════════
    var MAX_RETRY = 6;
    var PING_MS = 20000;
    var HIDDEN_LET_GO_MS = 30000;

    var room = {
        code: null,
        ws: null,
        id: null,            // our connection id
        count: 0,            // people in the room, us included
        phase: 'idle',       // idle | connecting | open | retrying | lost | refused
        refusal: null,       // 'locked' | 'full'
        attempts: 0,
        timers: { retry: 0, open: 0, ping: 0, hidden: 0, pass: 0, tick: 0 },
        turns: null,
        spent: false,        // Call and return: our one swirl is down
        passSent: false,
        info: null           // the host's 'pad-info', validated
    };
    resetTurns();

    function send(obj) {
        var ws = room.ws;
        if (!ws || ws.readyState !== 1) return false;
        try { ws.send(JSON.stringify(obj)); return true; } catch (_) { return false; }
    }

    function connect(code) {
        if (room.ws) dropSocket();
        room.code = code;
        room.id = null;
        room.count = 0;
        room.info = null;
        room.refusal = null;
        room.attempts = 0;
        brush.fromHost = false;
        resetTurns();
        openSocket();
        hintReset();
        render();
        layoutPad();
    }

    function openSocket() {
        clearTimeout(room.timers.retry);
        room.timers.retry = 0;
        if (!room.code) return;
        room.phase = room.attempts ? 'retrying' : 'connecting';
        var url = (isPlainWsHost(HOST) ? 'ws:' : 'wss:') + '//' + HOST + '/parties/fluid/' +
            encodeURIComponent(room.code) + '?uid=' + encodeURIComponent(UID) + '&kind=pad';
        var ws;
        try { ws = new WebSocket(url); }
        catch (_) { scheduleRetry(); return; }
        room.ws = ws;
        ws.addEventListener('message', function (ev) { if (ws === room.ws) onMessage(ev.data); });
        ws.addEventListener('close', function (ev) { if (ws === room.ws) onClose(ev); });
        ws.addEventListener('error', function () {});
        clearTimeout(room.timers.open);
        room.timers.open = setTimeout(function () {
            if (ws === room.ws && ws.readyState !== 1) { try { ws.close(); } catch (_) {} }
        }, 8000);
    }

    // Our own sockets are let go of first and closed after, so their late
    // events can never touch the room (the relay under wrangler dev never
    // answers a close frame, for one).
    function dropSocket() {
        var ws = room.ws;
        room.ws = null;
        clearTimeout(room.timers.open);
        clearTimeout(room.timers.retry);
        room.timers.retry = 0;
        stopPing();
        if (ws) { try { ws.close(1000); } catch (_) {} }
    }

    function onClose(ev) {
        room.ws = null;
        stopPing();
        endStroke(null, true);
        if (ev && (ev.code === 4001 || ev.code === 4002)) {
            room.phase = 'refused';
            room.refusal = ev.code === 4001 ? 'locked' : 'full';
            letSleep();
            render();
            return;
        }
        scheduleRetry();
    }

    function scheduleRetry() {
        if (!room.code) return;
        // A phone in a pocket retries when it comes back, not on a timer.
        if (document.visibilityState === 'hidden') { room.phase = 'retrying'; render(); return; }
        if (room.attempts >= MAX_RETRY) { room.phase = 'lost'; letSleep(); render(); return; }
        room.attempts++;
        var base = Math.min(1000 * Math.pow(2, room.attempts - 1), 8000);
        room.phase = 'retrying';
        room.timers.retry = setTimeout(openSocket, base / 2 + Math.random() * base / 2);
        render();
    }

    function retryNow() {
        if (!room.code || room.ws) return;
        room.attempts = 0;
        room.refusal = null;
        openSocket();
        render();
    }

    function leave() {
        endStroke(null, true);
        dropSocket();
        room.code = null;
        room.phase = 'idle';
        room.id = null;
        room.count = 0;
        room.info = null;
        resetTurns();
        letSleep();
        closeMenu();
        try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
        render();
    }

    function startPing() {
        stopPing();
        send({ type: 'ping' });
        room.timers.ping = setInterval(function () { send({ type: 'ping' }); }, PING_MS);
    }
    function stopPing() {
        clearInterval(room.timers.ping);
        room.timers.ping = 0;
    }

    function hello() { send({ type: 'pad-hello', data: { v: 1, tag: TAG } }); }

    function onMessage(raw) {
        var d;
        try { d = JSON.parse(raw); } catch (_) { return; }
        if (!d || typeof d.type !== 'string') return;
        switch (d.type) {
            case 'connected':
                clearTimeout(room.timers.open);
                room.id = String(d.clientId || '');
                room.count = num(d.totalClients, 1, 64, 1);
                room.phase = 'open';
                room.attempts = 0;
                // Fresh socket, fresh rotation: when turns are on, the
                // relay's turn-state follows this message at once.
                resetTurns();
                startPing();
                hello();
                keepAwake();
                render();
                break;
            case 'client-count':
                if (typeof d.count === 'number') {
                    // Someone arrived — maybe the computer: say what we are.
                    if (d.count > room.count) hello();
                    room.count = num(d.count, 1, 64, room.count);
                    render();
                }
                break;
            case 'host-changed':
                hello();
                break;
            case 'pad-info':
                if (d.clientId && d.clientId !== room.id) applyInfo(d.data);
                break;
            case 'turn-state':
                // Server-authored only: a relayed copy carries a clientId.
                if (!d.clientId) applyTurnState(d);
                break;
            case 'clear':
                if (d.clientId && d.clientId !== room.id) trailClear();
                break;
        }
    }

    // What the host's canvas is and how it paints (js/54-phone-pads.js).
    // Untrusted like any peer message, so every field is bounded here.
    function applyInfo(p) {
        if (!p || typeof p !== 'object') return;
        var info = {
            w: num(p.w, 64, 16384, 1600),
            h: num(p.h, 64, 16384, 900),
            gate: p.gate === true,
            flow: num(p.flow, 0, 1, 1),
            radius: num(p.radius, 0.00001, 0.1, 0.011),
            mult: Math.round(num(p.mult, 1, 8, 1)),
            sym: (typeof p.sym === 'string' && /^[A-Za-z]{1,24}$/.test(p.sym)) ? p.sym : 'radial',
            tip: Math.round(num(p.tip, 0, 16, 0)),
            angle: num(p.angle, -360, 360, 0),
            push: (typeof p.push === 'string' && /^(smudge|spread|gather|swirl)$/.test(p.push)) ? p.push : null,
            pushS: num(p.pushS, 0, 5, 1),
            ap: (typeof p.ap === 'number' && isFinite(p.ap)) ? (Math.abs(p.ap) | 0) & 0xff : 0,
            colors: (Array.isArray(p.colors) ? p.colors : [])
                .filter(function (c) { return typeof c === 'string' && HEX.test(c); })
                .slice(0, 16)
                .map(function (c) { return c.toLowerCase(); }),
            color: (typeof p.color === 'string' && HEX.test(p.color)) ? p.color.toLowerCase() : null,
            mode: (p.mode === 'random' || p.mode === 'step' || p.mode === 'fixed') ? p.mode : null,
            // How the computer walks a stroke (js/05d0).
            spFrac: num(p.spFrac, 0.0001, 1, 0.001),
            spMin: num(p.spMin, 0.25, 64, 1),
            ref: num(p.ref, 0.001, 4, 0.35),
            tc: num(p.tc, 1, 16, 1),
            floor: num(p.floor, 0, 1000, 125),
            stab: num(p.stab, 0, 1, 0),
            budget: num(p.budget, 200, 20000, 4000),
            step: Math.round(num(p.step, 0, 1e6, 0))
        };
        var prev = room.info;
        room.info = info;
        if (!brush.fromHost) adoptHostBrush();
        if (!prev || prev.w !== info.w || prev.h !== info.h) layoutPad();
        renderColour();
        renderSize();
    }

    // ── Take turns / Call and return (js/06c-mp-turns.js, the phone half) ──
    function resetTurns() {
        room.turns = { on: false, holder: null, order: [], mode: 'timer', deadline: 0 };
        room.spent = false;
        room.passSent = false;
        clearTimeout(room.timers.pass);
        room.timers.pass = 0;
        syncTick();
    }
    function isMyTurn() {
        var t = room.turns;
        return t.on && !!t.holder && t.holder === room.id;
    }
    function isCallMode() { return room.turns.on && room.turns.mode === 'stroke'; }

    function applyTurnState(d) {
        var was = isMyTurn();
        var t = room.turns;
        t.on = !!d.on;
        t.holder = (typeof d.holder === 'string' && d.holder) ? d.holder : null;
        t.order = Array.isArray(d.order) ? d.order.filter(function (x) { return typeof x === 'string'; }) : [];
        t.mode = d.mode === 'stroke' ? 'stroke' : 'timer';
        // No synchronized clocks: the message's own timestamp gives the skew.
        t.deadline = (typeof d.deadline === 'number' && d.deadline > 0 && typeof d.timestamp === 'number')
            ? d.deadline + (Date.now() - d.timestamp) : 0;
        // The brush moved on mid-stroke: the relay drops anything more.
        if (was && !isMyTurn() && stroke) endStroke(null, true);
        // A fresh call opens on the update that answers our pass, and
        // whenever the brush is not ours (06c's rule).
        if (room.passSent || !isMyTurn() || t.mode !== 'stroke') {
            room.spent = false;
            room.passSent = false;
            clearTimeout(room.timers.pass);
            room.timers.pass = 0;
        }
        if (!was && isMyTurn()) {
            buzz([14, 70, 14]);
            toast(isCallMode() ? 'Your call — one swirl' : 'Your turn to paint');
        }
        syncTick();
        render();
    }

    function passTurn() {
        if (!room.turns.on || !isMyTurn()) return;
        if (isCallMode()) { room.spent = true; room.passSent = true; }
        send({ type: 'turn-pass' });
        render();
    }

    // Call and return: the swirl is down, so the brush moves on. The phone
    // has no tail to wait for (06c waits for the desktop's), only the
    // stroke's last message, which is already out.
    function afterSwirl() {
        if (!isCallMode() || !isMyTurn() || room.spent) return;
        room.spent = true;
        render();
        room.timers.pass = setTimeout(function () {
            room.timers.pass = 0;
            if (!isCallMode() || !isMyTurn()) return;
            room.passSent = true;
            send({ type: 'turn-pass' });
        }, 300);
    }

    function syncTick() {
        var want = room.turns && room.turns.on && room.turns.deadline > 0;
        if (want && !room.timers.tick) room.timers.tick = setInterval(renderTurn, 500);
        if (!want && room.timers.tick) { clearInterval(room.timers.tick); room.timers.tick = 0; }
    }

    function holderName() {
        var h = room.turns.holder;
        return h ? shortName(h) : 'the next artist';
    }

    // Can a touch paint right now? And if not, what to say.
    function blockReason() {
        if (room.phase !== 'open') return 'Not connected yet.';
        if (room.count < 2) return 'Nobody else is in the room yet.';
        if (room.turns.on) {
            if (isMyTurn() && room.spent) return 'Your swirl is down — the brush is moving on.';
            if (!isMyTurn()) return 'It’s ' + holderName() + '’s ' + (isCallMode() ? 'call' : 'turn') + '.';
        }
        return null;
    }

    // ═══ The brush ═══════════════════════════════════════════════════
    var DEFAULT_W = 1600, DEFAULT_H = 900;
    var SIZE_MIN = 1, SIZE_MAX = 60;            // the app's Brush Size units (radius × 1000)
    var PHONE_SMOOTH_MS = 8;                    // a light hand on touch jitter (the desktop default is raw)
    var DAB_FLUSH_MS = 33;                      // js/06d DAB_FLUSH_MS
    var DAB_MAX_PER_MSG = 96;                   // js/06d DAB_MAX_PER_MSG
    var TRAIL_STEP_PX = 1.5;                    // the pad's own trail: one sprite per this much pad travel

    var brush = {
        size: 0,             // slider position 0..1 (squared onto SIZE_MIN..SIZE_MAX)
        cycle: 0,            // the next palette colour, when the computer steps through one
        fromHost: false      // this room's computer brush has been taken as the start
    };
    brush.size = valueToSize(11);

    function sizeToValue(p) { p = clamp(p, 0, 1); return SIZE_MIN + (SIZE_MAX - SIZE_MIN) * p * p; }
    function valueToSize(v) { return Math.sqrt(clamp((v - SIZE_MIN) / (SIZE_MAX - SIZE_MIN), 0, 1)); }
    function radius() { return sizeToValue(brush.size) / 1000; }

    // Start each room from the computer's brush size, and carry on its
    // palette from where it stands. A size set here lasts until you leave.
    function adoptHostBrush() {
        var i = room.info;
        if (!i) return;
        brush.fromHost = true;
        brush.size = valueToSize(i.radius * 1000);
        brush.cycle = i.colors.length ? i.step % i.colors.length : 0;
    }

    function VW() { return room.info ? room.info.w : DEFAULT_W; }
    function VH() { return room.info ? room.info.h : DEFAULT_H; }

    // The stroke's constants, taken at the press (05d0 reads config per
    // segment; a phone stroke keeps the brush it started with).
    function metrics() {
        var i = room.info;
        var r = radius();
        var D = Math.max(4, 2 * Math.sqrt(r) * VH());               // 05d0 brushDiameterPx
        var tc = i ? i.tc : 1;                                        // 05d0 timeCompensation
        var S = Math.max(i ? i.spMin : 1, (i ? i.spFrac : 0.001) * D) * tc;   // 05d0 spacingPx
        var stab = i ? i.stab : 0;
        return {
            r: r, D: D, S: S, tc: tc,
            ref: (i ? i.ref : 0.35) * D,
            gate: !!(i && i.gate),
            flow: i ? i.flow : 1,
            floor: i ? i.floor : 125,
            budget: i ? i.budget : 4000,
            alpha: 1 - 0.92 * clamp(stab, 0, 1)                        // 05d0 stabilizer
        };
    }

    // A dab laid at `used` px of spacing: its share of the reference dye
    // (05d0 dabFlowShare), then Flow in the computer's model (05d
    // normalizePaintFlow — linear when additive, in the exponent under
    // Cap Colour, where a dab converges rather than adds).
    function shareOf(m, used) {
        var k = (m.ref > 0 && m.tc > 0) ? Math.min(1, used / (m.tc * m.ref)) : 1;
        var f = clamp(m.flow, 0, 1);
        var share = (k >= 1) ? f : (m.gate ? 1 - Math.pow(1 - f, k) : f * k);
        return { k: k, share: share };
    }

    // The colour an older receiver paints with (06d flushDabs `color`): the
    // additive model bakes the share in, Gate keeps the colour true.
    function baked(base, share, gate) {
        return gate ? base.slice() : [base[0] * share, base[1] * share, base[2] * share];
    }

    function brushFields() {
        var i = room.info;
        var f = { tip: i ? i.tip : 0 };
        if (i && i.angle) f.angle = i.angle;
        if (i && i.push) { f.push = i.push; f.pushS = i.pushS; }
        if (i && i.ap) f.ap = i.ap;
        return f;
    }

    function hexToRgb(hex) {
        return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
    }

    // js/05g generateVibrantColor: saturated, never muddy, and lifted past a
    // luma floor so a deep blue still reads on the dark canvas (higher under
    // Cap Colour, where dye does not build up).
    function vibrant() {
        var hsl = function (h, s, l) {
            var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r, g, b;
            if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; }
            else if (h < 180) { r = 0; g = c; b = x; } else if (h < 240) { r = 0; g = x; b = c; }
            else if (h < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
            return [r + m, g + m, b + m];
        };
        var hue = Math.random() * 360, sat = 0.85 + Math.random() * 0.15, light = 0.5 + Math.random() * 0.15;
        var floor = (room.info && room.info.gate) ? 0.40 : 0.22;
        var rgb = hsl(hue, sat, light);
        while ((0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) < floor && light < 0.82) {
            light += 0.04;
            rgb = hsl(hue, sat, light);
        }
        return rgb;
    }

    // What the computer's brush does with colour, as it stands:
    // 'fixed' (one colour), 'step' (its palette, a colour a stroke) or
    // 'random' (a fresh colour a stroke — also the answer before we know).
    function colourMode() {
        var i = room.info;
        if (!i || !i.mode) return 'random';
        if (i.mode === 'fixed') return i.color ? 'fixed' : 'random';
        if (i.mode === 'step') return i.colors.length ? 'step' : 'random';
        return 'random';
    }

    // The colour for the stroke that is starting (a palette moves on by one).
    function strokeColor() {
        var i = room.info, mode = colourMode();
        if (mode === 'fixed') return hexToRgb(i.color);
        if (mode === 'step') {
            var c = i.colors[brush.cycle % i.colors.length];
            brush.cycle = (brush.cycle + 1) % i.colors.length;
            renderColour();
            return hexToRgb(c);
        }
        return vibrant();
    }

    // ── Strokes ──────────────────────────────────────────────────────
    var pad = $('pad');
    var stroke = null;       // the live stroke (one finger at a time)
    var padRect = null;      // the pad's box, held for the stroke
    var strokeBase = [1, 1, 1];
    var queue = [];          // [{at, d:[x,y,dx,dy,r,share,k]}]
    var flushTimer = 0;
    var lastFlushAt = 0;
    var lastCursorAt = 0;

    // A pointer event → pad fractions (a little past the edge is allowed,
    // like a mouse leaving the canvas mid-stroke) and computer pixels.
    function padPoint(e) {
        var r = padRect || pad.getBoundingClientRect();
        var u = clamp((e.clientX - r.left) / Math.max(1, r.width), -0.1, 1.1);
        var v = clamp((e.clientY - r.top) / Math.max(1, r.height), -0.1, 1.1);
        return { u: u, v: v, x: u * VW(), y: v * VH() };
    }

    function sendCursor(u, v, force) {
        var now = performance.now();
        if (!force && now - lastCursorAt < 50) return;
        lastCursorAt = now;
        send({ type: 'cursor', data: { x: r4(clamp(u, 0, 1)), y: r4(clamp(v, 0, 1)) }, timestamp: Date.now() });
    }

    // The immediate stamp at the press, as 05d lays it: Flow only (no
    // spacing share — it stands alone), through the legacy message path.
    function pressStamp(p, m, base) {
        var i = room.info;
        send({
            type: 'splat',
            data: Object.assign({
                x: r4(p.u), y: r4(p.v), dx: 0, dy: 0,
                color: baked(base, clamp(m.flow, 0, 1), m.gate).map(r4),
                mult: i ? i.mult : 1,
                radius: r5(m.r),
                sym: i ? i.sym : 'radial',
                down: true
            }, brushFields()),
            timestamp: Date.now()
        });
    }

    function queueDab(x, y, vx, vy, m, sh, at) {
        queue.push({ at: at, d: [r4(x / VW()), r4(y / VH()), r3(vx), r3(vy), r5(m.r), r4(sh.share), r3(sh.k)] });
        trailAt(x / VW(), y / VH(), m, false);
        if (queue.length >= DAB_MAX_PER_MSG) flushDabs(true);
        else if (!flushTimer) flushTimer = setTimeout(function () { flushTimer = 0; flushDabs(false); }, DAB_FLUSH_MS);
    }

    function flushDabs(force) {
        if (!queue.length) return;
        var now = performance.now();
        if (!force && now - lastFlushAt < DAB_FLUSH_MS) {
            if (!flushTimer) {
                flushTimer = setTimeout(function () { flushTimer = 0; flushDabs(false); },
                    Math.max(1, DAB_FLUSH_MS - (now - lastFlushAt)));
            }
            return;
        }
        clearTimeout(flushTimer);
        flushTimer = 0;
        lastFlushAt = now;
        var i = room.info;
        var gate = !!(i && i.gate);
        while (queue.length) {
            var batch = queue.splice(0, DAB_MAX_PER_MSG);
            var t0 = batch[0].at, tl = batch[batch.length - 1].at;
            // t: ms since this message's first dab, so the receiver plays
            // the train at the pace it was painted (06d paceBase).
            var dabs = batch.map(function (e) { return e.d.concat([Math.max(0, Math.round(e.at - t0))]); });
            var last = dabs[dabs.length - 1];
            send({
                type: 'splat',
                data: Object.assign({
                    // Legacy fields, in the old units, for an older receiver.
                    x: last[0], y: last[1],
                    dx: r5(last[2] / VW()), dy: r5(last[3] / VH()),
                    color: baked(strokeBase, last[5], gate).map(r4),
                    base: strokeBase.map(r4),
                    mult: i ? i.mult : 1,
                    radius: last[4],
                    sym: i ? i.sym : 'radial',
                    dabs: dabs
                }, brushFields()),
                // The wall-clock moment of this message's LAST dab.
                timestamp: Date.now() - Math.max(0, Math.round(now - tl))
            });
        }
    }

    // 05d0 emitAlong: dabs at absolute-travel multiples of the spacing from
    // the last one toward (x, y), velocity 10 × spacing along the way, with
    // the leftover distance carried to the next sample.
    function walkTo(x, y, at) {
        var s = stroke, m = s.m;
        var dx = x - s.lx, dy = y - s.ly;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1e-6) return;
        var ux = dx / dist, uy = dy / dist;
        // Coalesce under load: never more dabs for one sample than the
        // computer's drain budget allows for the time the sample covers —
        // density yields at speed, coverage does not (05d0).
        var spacing = m.S;
        var dt = clamp(at - s.walkAt, 4, 100);
        s.walkAt = at;
        var segBudget = Math.max(8, Math.round(m.budget * dt / 1000));
        if ((dist + s.resid) / spacing > segBudget) spacing = (dist + s.resid) / segBudget;
        var sh = shareOf(m, spacing);
        var vx = 10 * spacing * ux, vy = 10 * spacing * uy;
        // A leftover longer than this spacing (after a coalesced sample)
        // starts the walk here rather than behind the sample.
        var off = Math.max(0, spacing - s.resid);
        var n = 0, lastOff = 0;
        while (off <= dist) {
            queueDab(s.lx + ux * off, s.ly + uy * off, vx, vy, m, sh, at);
            lastOff = off;
            off += spacing;
            n++;
        }
        s.resid = n ? dist - lastOff : s.resid + dist;
        if (n) s.lastEmitAt = at;
        else floorDab(x, y, ux, uy, m, at);
        s.lx = x;
        s.ly = y;
    }

    // 05d0 emitFloorDab: a slow hand still deposits — a dab for the distance
    // actually travelled, at most `floor` times a second.
    function floorDab(x, y, ux, uy, m, at) {
        var s = stroke;
        if (!(m.floor > 0) || !(s.resid > 0)) return;
        if (at - s.lastEmitAt < 1000 / m.floor) return;
        queueDab(x, y, 10 * s.resid * ux, 10 * s.resid * uy, m, shareOf(m, s.resid), at);
        s.resid = 0;
        s.lastEmitAt = at;
    }

    function explainBlocked(reason) {
        buzz(30);
        toast(reason);
        var v = $('veil');
        if (v && !v.hidden) {
            v.classList.remove('is-pulse');
            void v.offsetWidth;
            v.classList.add('is-pulse');
        }
    }

    pad.addEventListener('pointerdown', function (e) {
        if (stroke) return;                                   // one finger paints
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        closeMenu();
        var why = blockReason();
        if (why) { explainBlocked(why); return; }
        try { pad.setPointerCapture(e.pointerId); } catch (_) {}
        padRect = pad.getBoundingClientRect();
        var p = padPoint(e);
        var m = metrics();
        var at = e.timeStamp || performance.now();
        strokeBase = strokeColor();
        stroke = { id: e.pointerId, sx: p.x, sy: p.y, lx: p.x, ly: p.y, resid: 0,
                   at: at, walkAt: at, lastEmitAt: at, m: m, u: p.u, v: p.v };
        pressStamp(p, m, strokeBase);
        trailBegin(strokeBase);
        trailAt(p.u, p.v, m, true);
        sendCursor(p.u, p.v, true);
        buzz(8);
        hintDone();
    });

    pad.addEventListener('pointermove', function (e) {
        if (!stroke || e.pointerId !== stroke.id) return;
        var list = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : null;
        if (!list || !list.length) list = [e];
        for (var i = 0; i < list.length; i++) {
            var ev = list[i];
            var p = padPoint(ev);
            var at = ev.timeStamp || e.timeStamp || performance.now();
            var dt = Math.max(1, at - stroke.at);
            stroke.at = at;
            // The computer's stabilizer, or a light smoothing of our own
            // for a fingertip's jitter, whichever holds on harder.
            var a = Math.min(stroke.m.alpha, 1 - Math.exp(-dt / PHONE_SMOOTH_MS));
            stroke.sx += (p.x - stroke.sx) * a;
            stroke.sy += (p.y - stroke.sy) * a;
            walkTo(stroke.sx, stroke.sy, at);
            stroke.u = p.u;
            stroke.v = p.v;
        }
        sendCursor(stroke.u, stroke.v, false);
    });

    // abort: the brush was taken or the room went away — drop what is
    // queued (the relay would refuse it) instead of sending it.
    function endStroke(e, abort) {
        if (!stroke) return;
        if (e && e.pointerId !== stroke.id) return;
        if (e && !abort) {
            var p = padPoint(e);
            walkTo(p.x, p.y, e.timeStamp || performance.now());   // the smoothing lag catches up
            stroke.u = p.u;
            stroke.v = p.v;
        }
        var u = stroke.u, v = stroke.v, id = stroke.id;
        stroke = null;
        padRect = null;
        try { pad.releasePointerCapture(id); } catch (_) {}
        if (abort) {
            queue.length = 0;
            clearTimeout(flushTimer);
            flushTimer = 0;
        } else {
            flushDabs(true);
            sendCursor(u, v, true);
        }
        send({ type: 'pointer-up', timestamp: Date.now() });
        trailEnd();
        if (!abort) afterSwirl();
    }

    pad.addEventListener('pointerup', function (e) { endStroke(e, false); });
    // A cancel is how phones often end a touch (the system took it): finish
    // gracefully, the way 05d treats a pen's cancel.
    pad.addEventListener('pointercancel', function (e) { endStroke(e, false); });
    pad.addEventListener('lostpointercapture', function (e) {
        if (stroke && e.pointerId === stroke.id) endStroke(null, false);
    });
    pad.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    // ── The trail: what you just drew, fading, so the pad answers ────
    var trail = $('trail');
    var tctx = trail.getContext('2d');
    var trailSprite = null;
    var trailRaf = 0;
    var trailLastDab = 0;
    var trailLastTick = 0;
    var trailDrawing = false;

    function trailBegin(base) {
        var c = document.createElement('canvas');
        c.width = c.height = 64;
        var g = c.getContext('2d');
        var rgb = base.map(function (v) { return Math.round(clamp(v, 0, 1) * 255); }).join(',');
        var grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(' + rgb + ',0.09)');
        grad.addColorStop(0.5, 'rgba(' + rgb + ',0.045)');
        grad.addColorStop(1, 'rgba(' + rgb + ',0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
        trailSprite = c;
        trailDrawing = true;
        trailLast = null;
    }
    // One sprite per TRAIL_STEP_PX of pad travel, whatever the dab spacing:
    // the computer's 1 px dabs would be several sprites per pad pixel.
    var trailLast = null;
    function trailAt(u, v, m, force) {
        if (!trailSprite || !trail.width) return;
        var x = u * trail.width, y = v * trail.height;
        var step = TRAIL_STEP_PX * (trail.width / Math.max(1, pad.clientWidth));
        if (!force && trailLast && Math.abs(x - trailLast.x) + Math.abs(y - trailLast.y) < step) return;
        trailLast = { x: x, y: y };
        // Most of a gaussian dab's visible dye sits inside ~1.6× its
        // e^-1 radius, which is √radius of the canvas height (05d0).
        var rr = Math.max(3, Math.sqrt(m.r) * trail.height * 1.6);
        tctx.globalCompositeOperation = 'source-over';
        tctx.drawImage(trailSprite, x - rr, y - rr, rr * 2, rr * 2);
        trailLastDab = performance.now();
        if (!trailRaf) { trailLastTick = 0; trailRaf = requestAnimationFrame(trailTick); }
    }
    function trailEnd() { trailDrawing = false; }
    function trailTick(now) {
        trailRaf = 0;
        var dt = trailLastTick ? Math.min(100, now - trailLastTick) : 16;
        trailLastTick = now;
        var idle = now - trailLastDab;
        if (!trailDrawing && idle > 2400) { trailClear(); return; }
        // Slow while drawing (you see the whole stroke), quick once lifted.
        var tau = (trailDrawing || idle < 300) ? 2600 : 650;
        tctx.globalCompositeOperation = 'destination-out';
        tctx.fillStyle = 'rgba(0,0,0,' + (1 - Math.exp(-dt / tau)).toFixed(4) + ')';
        tctx.fillRect(0, 0, trail.width, trail.height);
        trailRaf = requestAnimationFrame(trailTick);
    }
    function trailClear() {
        if (trailRaf) { cancelAnimationFrame(trailRaf); trailRaf = 0; }
        tctx.clearRect(0, 0, trail.width, trail.height);
    }

    // ── The pad's shape: the computer's canvas, as big as fits ───────
    var stage = $('stage');
    var tools = $('tools');
    // The stage holds the pad and the tools: stacked (upright phone), or
    // side by side (sideways, where stage is a row). The pad gets what the
    // tools leave.
    function layoutPad() {
        if ($('padView').hidden) return;
        var box = stage.getBoundingClientRect();
        var cs = getComputedStyle(stage);
        var row = cs.flexDirection === 'row';
        var gap = parseFloat(row ? cs.columnGap : cs.rowGap) || 0;
        var tb = tools.getBoundingClientRect();
        var hint = $('rotateHint');
        var hintH = (hint && !hint.hidden) ? hint.offsetHeight + 10 : 0;
        var bw = box.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (row ? tb.width + gap : 0);
        var bh = box.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - hintH - (row ? 0 : tb.height + gap);
        if (bw < 40 || bh < 40) return;
        var ar = VW() / VH();
        var w = bw, h = w / ar;
        if (h > bh) { h = bh; w = h * ar; }
        w = Math.floor(w);
        h = Math.floor(h);
        if (pad.offsetWidth !== w || pad.offsetHeight !== h) {
            pad.style.width = w + 'px';
            pad.style.height = h + 'px';
        }
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var tw = Math.round(w * dpr), th = Math.round(h * dpr);
        if (trail.width !== tw || trail.height !== th) {
            trail.width = tw;
            trail.height = th;
        }
        // A tall phone and a wide canvas make a letterbox of a pad.
        var wantHint = box.height > box.width * 1.2 && ar > 1.25;
        if (hint && hint.hidden === wantHint) {
            hint.hidden = !wantHint;
            queueLayout();
        }
    }
    // Laid out on the next frame, not inside the observer: resizing the pad
    // (and showing the rotate hint) from the callback is a resize the
    // observer would have to deliver again in the same frame.
    var layoutQueued = 0;
    function queueLayout() {
        if (layoutQueued) return;
        layoutQueued = requestAnimationFrame(function () { layoutQueued = 0; layoutPad(); });
    }
    if (typeof ResizeObserver === 'function') new ResizeObserver(queueLayout).observe(stage);
    window.addEventListener('resize', queueLayout);
    window.addEventListener('orientationchange', function () { setTimeout(queueLayout, 250); });

    // ── First-stroke hint ─────────────────────────────────────────────
    function hintReset() { $('padHint').classList.remove('is-gone'); }
    function hintDone() { $('padHint').classList.add('is-gone'); }

    // ═══ The page ═══════════════════════════════════════════════════
    function fullAppHref() {
        var q = '';
        try {
            var sp = new URLSearchParams(location.search);
            sp.set('full', '1');
            q = '?' + sp.toString();
        } catch (_) { q = '?full=1'; }
        return '../' + q + (room.code ? '#' + room.code : '');
    }

    function render() {
        var inRoom = !!room.code;
        $('landing').hidden = inRoom;
        $('padView').hidden = !inRoom;
        $('fullLinkLanding').href = fullAppHref();
        $('fullLinkRoom').href = fullAppHref();
        if (!inRoom) return;
        renderBar();
        renderTurn();
        renderVeil();
        renderColour();
        renderSize();
    }

    function renderBar() {
        $('barTitle').textContent = 'Room ' + room.code;
        var sub;
        switch (room.phase) {
            case 'open':
                var others = Math.max(0, room.count - 1);
                sub = (others ? others + (others === 1 ? ' other here' : ' others here') : 'Nobody else here yet') +
                    (room.id ? ' · you’re ' + shortName(room.id) : '');
                break;
            case 'connecting': sub = 'Joining…'; break;
            case 'retrying': sub = 'Reconnecting…'; break;
            case 'lost': sub = 'Disconnected'; break;
            case 'refused': sub = room.refusal === 'locked' ? 'Room locked' : 'Room full'; break;
            default: sub = '';
        }
        $('barSub').textContent = sub;
        var dot = $('meDot');
        var col = (room.phase === 'open' && room.id) ? colorForClient(room.id) : '';
        dot.style.background = col;
        dot.style.color = col || 'transparent';
    }

    function fmtClock(ms) {
        var s = Math.max(0, Math.round(ms / 1000));
        return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    }

    function renderTurn() {
        var banner = $('turnBanner');
        var t = room.turns;
        if (!room.code || room.phase !== 'open' || !t.on) { banner.hidden = true; return; }
        var mine = isMyTurn();
        var text;
        if (mine && room.spent) text = 'Swirl sent — the brush is moving on';
        else if (mine) text = isCallMode() ? 'Your call — make one swirl' : 'Your turn';
        else {
            var idx = t.order.indexOf(t.holder);
            var nextId = (idx >= 0 && t.order.length) ? t.order[(idx + 1) % t.order.length] : null;
            text = holderName() + (isCallMode() ? '’s call' : ' is painting') +
                (nextId && nextId === room.id ? ' · you’re next' : '');
        }
        if (t.deadline && !(mine && room.spent)) text += ' · ' + fmtClock(t.deadline - Date.now());
        $('turnText').textContent = text;
        banner.classList.toggle('is-mine', mine && !room.spent);
        $('passBtn').hidden = !(mine && !room.spent);
        $('passBtn').textContent = isCallMode() ? 'Pass my call' : 'Pass';
        banner.hidden = false;
    }

    function veilButton(label, fn, emphasis) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        if (emphasis) b.className = 'btn--emphasis';
        b.addEventListener('click', fn);
        return b;
    }

    function renderVeil() {
        var veil = $('veil');
        var text = '';
        var soft = false;
        var actions = [];
        var anotherCode = function () { leave(); setTimeout(function () { try { $('codeInput').focus(); } catch (_) {} }, 50); };
        switch (room.phase) {
            case 'connecting':
                text = 'Joining room ' + room.code + '…';
                break;
            case 'retrying':
                text = 'Reconnecting to the room…';
                break;
            case 'lost':
                text = 'Lost the connection to the room.';
                actions = [veilButton('Try again', retryNow, true), veilButton('Another code', anotherCode)];
                break;
            case 'refused':
                text = room.refusal === 'locked'
                    ? 'This room is locked. Ask whoever started it to unlock it, then try again.'
                    : 'This room is full.';
                actions = [veilButton('Try again', retryNow, true), veilButton('Another code', anotherCode)];
                break;
            case 'open':
                if (room.count < 2) {
                    text = 'Nobody else is in room ' + room.code + ' yet. Is Swirl Together open on your computer, in this room?';
                    actions = [veilButton('Another code', anotherCode)];
                } else if (room.turns.on && !isMyTurn()) {
                    text = 'Watch the big screen — ' + holderName() + ' has the brush.';
                    soft = true;
                }
                break;
        }
        veil.hidden = !text;
        veil.classList.toggle('is-soft', soft);
        // The first-stroke hint would read through the veil's text.
        $('padHint').style.visibility = text ? 'hidden' : '';
        $('veilText').textContent = text;
        var box = $('veilActions');
        box.textContent = '';
        actions.forEach(function (b) { box.appendChild(b); });
        box.hidden = !actions.length;
    }

    // The colour line: what the next stroke will look like, and why — the
    // computer decides (see strokeColor), so this only reports it.
    var PALETTE_DOTS = 8;
    function renderColour() {
        var dots = $('colourDots');
        var i = room.info, mode = colourMode();
        var key = mode + '|' + (i ? (i.color + '|' + i.colors.join(',')) : '') + '|' + brush.cycle;
        if (dots.dataset.key === key) return;
        dots.dataset.key = key;
        dots.textContent = '';
        var dot = function (bg, cls) {
            var d = document.createElement('span');
            d.className = 'colour-dot' + (cls ? ' ' + cls : '');
            if (bg) d.style.background = bg;
            dots.appendChild(d);
        };
        var text;
        if (mode === 'fixed') {
            dot(i.color);
            text = 'The computer’s colour';
        } else if (mode === 'step') {
            // The next colour first, then the ones after it.
            var n = i.colors.length;
            for (var k = 0; k < Math.min(n, PALETTE_DOTS); k++) {
                dot(i.colors[(brush.cycle + k) % n], k === 0 ? 'is-next' : '');
            }
            text = 'The computer’s palette, a colour a stroke';
        } else {
            dot('', 'is-mix');
            text = i ? 'A new colour every stroke, like the computer' : 'A new colour every stroke';
        }
        $('colourText').textContent = text;
    }

    function fmtSize(v) { return v < 10 ? v.toFixed(1) : String(Math.round(v)); }

    function renderSize() {
        var range = $('sizeRange');
        if (document.activeElement !== range) range.value = String(r3(brush.size));
        $('sizeValue').textContent = fmtSize(sizeToValue(brush.size));
    }

    // While the slider moves, a ring on the pad shows the brush at its
    // real size: the e^-1 footprint, √radius of the canvas height.
    var ringTimer = 0;
    function showSizeRing() {
        var ring = $('sizeRing');
        var d = Math.max(6, 2 * Math.sqrt(radius()) * pad.clientHeight);
        ring.style.width = ring.style.height = d + 'px';
        ring.hidden = false;
        clearTimeout(ringTimer);
        ringTimer = setTimeout(function () { ring.hidden = true; }, 900);
    }
    $('sizeRange').addEventListener('input', function (e) {
        brush.size = clamp(parseFloat(e.target.value) || 0, 0, 1);
        $('sizeValue').textContent = fmtSize(sizeToValue(brush.size));
        showSizeRing();
    });
    $('sizeRange').addEventListener('change', function () { renderSize(); });

    // ── Menu, confirm, toast ─────────────────────────────────────────
    function openMenu() {
        $('moreMenu').hidden = false;
        $('moreBtn').setAttribute('aria-expanded', 'true');
    }
    function closeMenu() {
        $('moreMenu').hidden = true;
        $('moreBtn').setAttribute('aria-expanded', 'false');
    }
    $('moreBtn').addEventListener('click', function (e) {
        e.stopPropagation();
        if ($('moreMenu').hidden) openMenu(); else closeMenu();
    });
    document.addEventListener('click', function (e) {
        if (!$('moreMenu').hidden && !$('moreMenu').contains(e.target)) closeMenu();
    });
    $('leaveBtn').addEventListener('click', function () { leave(); });
    $('clearBtn').addEventListener('click', function () {
        closeMenu();
        var why = blockReason();
        if (why) { toast(why); return; }
        $('confirmSheet').hidden = false;
    });
    $('confirmNo').addEventListener('click', function () { $('confirmSheet').hidden = true; });
    $('confirmSheet').addEventListener('click', function (e) {
        if (e.target === $('confirmSheet')) $('confirmSheet').hidden = true;
    });
    $('confirmYes').addEventListener('click', function () {
        $('confirmSheet').hidden = true;
        var why = blockReason();
        if (why) { toast(why); return; }
        if (send({ type: 'clear', timestamp: Date.now() })) {
            trailClear();
            toast('Canvas cleared');
        }
    });
    $('passBtn').addEventListener('click', passTurn);

    // Full screen, where the browser has it (Android; not iPhone Safari):
    // the pad gets the whole screen, and a wide canvas turns the phone
    // sideways — the orientation lock only holds in full screen.
    var fsBtn = $('fullscreenBtn');
    var canFullscreen = !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
    fsBtn.hidden = !canFullscreen;
    function syncFullscreenLabel() {
        fsBtn.textContent = document.fullscreenElement ? 'Leave full screen' : 'Full screen';
    }
    fsBtn.addEventListener('click', function () {
        closeMenu();
        if (document.fullscreenElement) {
            try { document.exitFullscreen().catch(function () {}); } catch (_) {}
            return;
        }
        try {
            document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(function () {
                if (VW() / VH() > 1.2 && screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock('landscape').catch(function () {});
                }
            }, function () { toast('Full screen is not available here.'); });
        } catch (_) { toast('Full screen is not available here.'); }
    });
    document.addEventListener('fullscreenchange', function () { syncFullscreenLabel(); queueLayout(); });

    var toastTimer = 0;
    function toast(text) {
        var t = $('toast');
        t.textContent = text;
        t.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
    }

    function buzz(pattern) {
        try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {}
    }

    // ── Keep the screen on while painting ────────────────────────────
    var wakeLock = null;
    function keepAwake() {
        if (wakeLock || document.visibilityState !== 'visible') return;
        try {
            if (navigator.wakeLock && navigator.wakeLock.request) {
                navigator.wakeLock.request('screen').then(function (l) {
                    if (!room.code) { l.release(); return; }
                    wakeLock = l;
                    l.addEventListener('release', function () { if (wakeLock === l) wakeLock = null; });
                }, function () {});
            }
        } catch (_) {}
    }
    function letSleep() {
        var l = wakeLock;
        wakeLock = null;
        try { if (l) l.release(); } catch (_) {}
    }

    // ── Joining from the landing page ────────────────────────────────
    var codeInput = $('codeInput');
    function showJoinError(text) {
        var el = $('joinError');
        el.textContent = text || '';
        el.hidden = !text;
    }
    function tryJoin(value) {
        var code = extractRoomCode(value);
        if (code.length !== 6) { showJoinError('A room code is six letters and numbers.'); return; }
        showJoinError('');
        try { codeInput.blur(); } catch (_) {}
        if (codeFromHash() === code) connect(code);
        else location.hash = code;               // hashchange joins
    }
    $('joinForm').addEventListener('submit', function (e) {
        e.preventDefault();
        tryJoin(codeInput.value);
    });
    codeInput.addEventListener('input', function () {
        // A pasted link works too; six characters join by themselves.
        var code = extractRoomCode(codeInput.value);
        if (/[#/]/.test(codeInput.value) || codeInput.value.length > 6) codeInput.value = code;
        showJoinError('');
        if (code.length === 6 && /^[A-Z0-9]{6}$/i.test(codeInput.value)) tryJoin(code);
    });

    window.addEventListener('hashchange', function () {
        var code = codeFromHash();
        if (code && code !== room.code) connect(code);
        else if (!code && room.code) leave();
    });

    // ── Background, foreground, offline ──────────────────────────────
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
            clearTimeout(room.timers.hidden);
            room.timers.hidden = 0;
            if (room.code && !room.ws && room.phase !== 'refused') { room.attempts = 0; openSocket(); render(); }
            if (room.phase === 'open') keepAwake();
            layoutPad();
        } else {
            endStroke(null, false);
            // A phone in a pocket should not keep its seat: let go after a
            // while in the background, and come straight back when shown.
            clearTimeout(room.timers.hidden);
            room.timers.hidden = setTimeout(function () {
                if (document.visibilityState === 'hidden' && room.ws) {
                    dropSocket();
                    room.phase = 'retrying';
                }
            }, HIDDEN_LET_GO_MS);
        }
    });
    window.addEventListener('pagehide', function () { dropSocket(); });
    window.addEventListener('pageshow', function (e) {
        if (e.persisted && room.code && !room.ws) { room.attempts = 0; openSocket(); render(); }
    });
    window.addEventListener('online', function () {
        if (room.code && !room.ws && room.phase !== 'refused') { room.attempts = 0; openSocket(); render(); }
    });
    // iOS pinch-zooms the page from any control, whatever the viewport says.
    ['gesturestart', 'gesturechange'].forEach(function (t) {
        document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false });
    });

    // ── Go ───────────────────────────────────────────────────────────
    var start = codeFromHash();
    if (start) connect(start);
    else render();

    // For tests and the curious (nothing in the app reads this).
    window.SwirlPad = {
        state: function () {
            return {
                host: HOST, code: room.code, phase: room.phase, refusal: room.refusal, id: room.id,
                count: room.count, turns: JSON.parse(JSON.stringify(room.turns)), spent: room.spent,
                info: room.info, brush: { size: brush.size, value: sizeToValue(brush.size), colour: colourMode(), cycle: brush.cycle },
                queued: queue.length, stroking: !!stroke,
                pad: { w: pad.offsetWidth, h: pad.offsetHeight }
            };
        },
        join: function (code) { tryJoin(code); },
        leave: leave,
        metrics: metrics
    };
})();
