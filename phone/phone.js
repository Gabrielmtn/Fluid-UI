// ═══════════════════════════════════════════════════════════════════
// phone/phone.js — Swirl Together on a phone: a brush for a bigger screen.
//
// A phone does not run the painting. It paints on a computer's canvas, one
// of two ways (the landing offers both; a scanned code already knows which):
//   • AS THE COMPUTER'S MOUSE (2026-09-17): an 8-character code from
//     Paint from your phone → As your mouse. The phone sends its touches
//     over a private link and the computer plays them as its own pointer
//     (js/55-phone-mouse.js), so its own brush, settings and room do the
//     rest. The phone draws nothing but a trail for itself.
//   • AS AN ARTIST: a 6-character room code. The phone joins the room the
//     computer is in and sends its strokes as ordinary room paint, so every
//     canvas in the room — the computer's included — draws them the way it
//     draws anyone's.
// The page is the pad and nothing else: a surface the shape of the
// computer's canvas, as big as the screen allows. Size, colour and the rest
// of the brush are set on the computer, where the controls work better; a
// status chip and a ⋯ menu sit in the corners the pad leaves free. The full
// app stays one link away for someone with no computer to watch.
//
// Phones reach this page from swirltogether.com (index.html sends small
// touch screens here, code and all) and straight from the QR.
//
// THE MOUSE LINK — /parties/fluid/sys-mouse-<CODE>, a plain relay room
//   out  'mouse-hello'  take the mouse (the newest phone wins)
//        'mouse'        {s: [[k, u, v, t], …]}  k 0 press / 1 move / 2 lift,
//                       u v canvas fractions, t ms since the press
//        'mouse-beat', 'mouse-bye', 'mouse-clear', 'mouse-pass'
//   in   'connected', 'client-count', 'mouse-info' (which phone has the
//        mouse, the canvas shape, the colour, and whether a press would
//        paint right now — someone else's turn, a paused canvas)
//
// THE ROOM WIRE — the room protocol of js/06a–06e, nothing new on the canvas side
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
// THE ARTIST'S BRUSH — the computer's (its size too, live), walked the way
//   js/05d0-brush-engine.js walks it, in the computer's canvas pixels as
//   'pad-info' reports them: a dab
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

    // ── Codes: a room's has 6 characters, a computer's mouse link 8 ──
    var ROOM_LEN = 6, LINK_LEN = 8;
    // js/06a-mp-core.js extractRoomCode, for either length: a typed code, or
    // a pasted link (the code is its hash).
    function cleanCode(input) {
        if (!input) return '';
        var s = String(input).trim();
        if (s.indexOf('#') !== -1) s = s.substring(s.lastIndexOf('#') + 1);
        else if (s.indexOf('/') !== -1) s = s.substring(s.lastIndexOf('/') + 1);
        return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LINK_LEN);
    }
    function kindOf(code) {
        return code.length === LINK_LEN ? 'mouse' : (code.length === ROOM_LEN ? 'room' : null);
    }
    function codeFromHash() {
        var h = (location.hash || '').slice(1).toUpperCase();
        return /^(?:[A-Z0-9]{6}|[A-Z0-9]{8})$/.test(h) ? h : null;
    }
    function groupCode(c) { return c && c.length === LINK_LEN ? c.slice(0, 4) + ' ' + c.slice(4) : (c || ''); }

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

    // ═══ The connection: a room, or the computer's mouse link ═══════
    var MAX_RETRY = 6;
    var PING_MS = 20000;
    var BEAT_MS = 5000;                 // the mouse link: "still here", to the computer
    var COMPUTER_SILENT_MS = 12000;     // no word from the computer this long: it is gone
    var HIDDEN_LET_GO_MS = 30000;

    var room = {
        kind: 'room',        // 'room' (an artist) | 'mouse' (the computer's mouse)
        code: null,
        ws: null,
        id: null,            // our connection id
        count: 0,            // connections here, us included
        phase: 'idle',       // idle | connecting | open | retrying | lost | refused
        refusal: null,       // 'locked' | 'full'
        attempts: 0,
        timers: { retry: 0, open: 0, ping: 0, hidden: 0, pass: 0, tick: 0 },
        turns: null,
        spent: false,        // Call and return: our one swirl is down
        passSent: false,
        info: null           // the host's 'pad-info', validated
    };
    // The mouse link's side of things.
    var link = {
        info: null,          // the computer's 'mouse-info', validated
        infoAt: 0,
        active: false,       // this phone has the mouse
        replaced: false,     // another phone took it (only a tap takes it back)
        helloAt: 0
    };
    resetTurns();

    function isMouse() { return room.kind === 'mouse'; }

    function send(obj) {
        var ws = room.ws;
        if (!ws || ws.readyState !== 1) return false;
        try { ws.send(JSON.stringify(obj)); return true; } catch (_) { return false; }
    }

    function resetLink() {
        link.info = null;
        link.infoAt = 0;
        link.active = false;
        link.replaced = false;
        link.helloAt = 0;
    }

    function connect(code) {
        if (room.ws) dropSocket();
        room.kind = kindOf(code) || 'room';
        room.code = code;
        room.id = null;
        room.count = 0;
        room.info = null;
        room.refusal = null;
        room.attempts = 0;
        brush.fromHost = false;
        resetTurns();
        resetLink();
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
        room.id = null;
        // The mouse link needs no device id (a plain relay room keeps none).
        var path = isMouse()
            ? 'sys-mouse-' + encodeURIComponent(room.code)
            : encodeURIComponent(room.code) + '?uid=' + encodeURIComponent(UID) + '&kind=pad';
        var url = (isPlainWsHost(HOST) ? 'ws:' : 'wss:') + '//' + HOST + '/parties/fluid/' + path;
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
        link.active = false;
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

    // `note`: why we are back at the start, said there.
    function leave(note) {
        endStroke(null, true);
        if (isMouse() && link.active) send({ type: 'mouse-bye' });
        dropSocket();
        room.code = null;
        room.phase = 'idle';
        room.id = null;
        room.count = 0;
        room.info = null;
        resetTurns();
        resetLink();
        letSleep();
        closeMenu();
        landingNote(typeof note === 'string' ? note : '');
        try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
        render();
    }

    function startPing() {
        stopPing();
        // A plain relay room swallows 'ping'; the computer listens for beats.
        var beat = isMouse() ? { type: 'mouse-beat' } : { type: 'ping' };
        send(beat);
        room.timers.ping = setInterval(function () { send(beat); }, isMouse() ? BEAT_MS : PING_MS);
    }
    function stopPing() {
        clearInterval(room.timers.ping);
        room.timers.ping = 0;
    }

    function hello() { send({ type: 'pad-hello', data: { v: 1, tag: TAG } }); }

    // Ask for the mouse. `force` is a tap ("Use this phone"); otherwise at
    // most once a second — a second ask inside that is put off, not dropped
    // (the computer may have arrived in between) — and never once another
    // phone has taken it.
    var helloTimer = 0;
    function mouseHello(force) {
        if (!force && link.replaced) return;
        var wait = 1000 - (Date.now() - link.helloAt);
        if (!force && wait > 0) {
            if (!helloTimer) helloTimer = setTimeout(function () {
                helloTimer = 0;
                if (isMouse() && room.phase === 'open' && !link.active) mouseHello(false);
            }, wait);
            return;
        }
        clearTimeout(helloTimer);
        helloTimer = 0;
        if (force) link.replaced = false;
        link.helloAt = Date.now();
        send({ type: 'mouse-hello', data: { v: 1, tag: TAG } });
    }

    function onMessage(raw) {
        var d;
        try { d = JSON.parse(raw); } catch (_) { return; }
        if (!d || typeof d.type !== 'string') return;
        switch (d.type) {
            case 'connected':
                // The mouse link relays anything, so only the first is real.
                if (room.id) return;
                clearTimeout(room.timers.open);
                room.id = String(d.clientId || '');
                room.count = num(d.totalClients, 1, 64, 1);
                room.phase = 'open';
                room.attempts = 0;
                // Fresh socket, fresh rotation: when turns are on, the
                // relay's turn-state follows this message at once.
                resetTurns();
                startPing();
                if (isMouse()) mouseHello(false); else hello();
                keepAwake();
                rememberCode(room.code);
                render();
                break;
            case 'client-count':
                // The relay's own count carries no sender.
                if (typeof d.count === 'number' && !d.clientId) {
                    var n = num(d.count, 1, 64, room.count);
                    if (isMouse()) {
                        // Someone arrived — maybe the computer: ask for the
                        // mouse. Someone left — maybe the computer: it has a
                        // moment to say it is still here (it answers a drop).
                        if (n > room.count) mouseHello(false);
                        else if (n < room.count) {
                            send({ type: 'mouse-beat' });
                            link.infoAt = Math.min(link.infoAt, Date.now() - COMPUTER_SILENT_MS + 2500);
                            setTimeout(render, 2600);
                        }
                    } else if (n > room.count) {
                        // Someone arrived — maybe the computer: say what we are.
                        hello();
                    }
                    room.count = n;
                    render();
                }
                break;
            case 'host-changed':
                if (!isMouse()) hello();
                break;
            case 'pad-info':
                if (!isMouse() && d.clientId && d.clientId !== room.id) applyInfo(d.data);
                break;
            case 'mouse-info':
                if (isMouse() && d.clientId && d.clientId !== room.id) applyMouseInfo(d.data);
                break;
            case 'turn-state':
                // Server-authored only: a relayed copy carries a clientId.
                if (!isMouse() && !d.clientId) applyTurnState(d);
                break;
            case 'clear':
                if (!isMouse() && d.clientId && d.clientId !== room.id) trailClear();
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
    }

    // The computer's word on the mouse link (js/55-phone-mouse.js): who has
    // the mouse, the canvas, the colour, and whether a press would paint.
    function applyMouseInfo(p) {
        if (!p || typeof p !== 'object') return;
        var info = {
            active: (typeof p.active === 'string' && p.active) ? p.active : null,
            w: num(p.w, 64, 16384, 1600),
            h: num(p.h, 64, 16384, 900),
            color: (typeof p.color === 'string' && HEX.test(p.color)) ? p.color.toLowerCase() : null,
            radius: num(p.radius, 0.00001, 0.1, 0.011),
            can: p.can !== false,
            why: (typeof p.why === 'string') ? p.why.slice(0, 140) : '',
            people: Math.round(num(p.people, 0, 99, 0)),
            off: p.off === true,
            turn: null
        };
        if (p.turn && typeof p.turn === 'object') {
            var left = num(p.turn.left, 0, 3600000, 0);
            info.turn = {
                mine: p.turn.mine === true,
                who: (typeof p.turn.who === 'string') ? p.turn.who.slice(0, 32) : '',
                call: p.turn.call === true,
                spent: p.turn.spent === true,
                deadline: left ? Date.now() + left : 0
            };
        }
        // The computer let this phone go (Disconnect on its side): back to
        // the start, with the reason.
        if (info.off && p.forget === true) {
            leave('Your computer disconnected this phone. To connect again, scan the new code on it.');
            return;
        }
        var prev = link.info;
        var wasActive = link.active;
        link.info = info;
        link.infoAt = Date.now();
        link.active = !info.off && !!info.active && info.active === room.id;
        if (link.active) link.replaced = false;
        else if (info.active) {
            // Another phone has the mouse now.
            if (stroke) endStroke(null, true);
            if (wasActive) toast('Another phone took over the mouse.');
            link.replaced = true;
        } else if (!info.off) {
            // Nobody has it (the computer is new here, or let us go for a
            // silence): ask, unless another phone took it from us.
            mouseHello(false);
        }
        if (link.active && !wasActive) {
            buzz([10, 50, 10]);
            hintReset();
        }
        if (!link.active && stroke) endStroke(null, true);
        syncTick();
        render();
        if (!prev || prev.w !== info.w || prev.h !== info.h) layoutPad();
    }

    function computerHere() {
        return room.phase === 'open' && room.count >= 2 && !!link.info && !link.info.off &&
            Date.now() - link.infoAt < COMPUTER_SILENT_MS;
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
        var wasOn = t.on;
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
        // Turns widen the corner chrome (turn text, Pass): the pad may need
        // to move out from under it.
        if (wasOn !== t.on) queueLayout();
    }

    function passTurn() {
        if (isMouse()) {
            var mt = mouseTurn();
            if (mt && mt.mine && !mt.spent) send({ type: 'mouse-pass' });
            return;
        }
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

    // The computer's turn, as a mouse sees it (the computer runs it).
    function mouseTurn() { return (isMouse() && link.info && link.info.turn) || null; }

    function syncTick() {
        var mt = mouseTurn();
        var want = (room.turns && room.turns.on && room.turns.deadline > 0) || !!(mt && mt.deadline > 0);
        if (want && !room.timers.tick) room.timers.tick = setInterval(renderChrome, 500);
        if (!want && room.timers.tick) { clearInterval(room.timers.tick); room.timers.tick = 0; }
    }

    function holderName() {
        var h = room.turns.holder;
        return h ? shortName(h) : 'the next artist';
    }

    // Can a touch paint right now? And if not, what to say.
    function blockReason() {
        if (isMouse()) {
            if (room.phase !== 'open') return 'Not connected to your computer yet.';
            if (link.replaced) return 'Another phone is this computer’s mouse right now.';
            if (!computerHere()) return 'Your computer isn’t connected. On it, choose Paint from your phone.';
            if (!link.active) return 'Connecting to your computer…';
            if (!link.info.can) return link.info.why || 'Your computer can’t take a stroke right now.';
            return null;
        }
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
    var DEFAULT_RADIUS = 0.011;                 // 04a SPLAT_RADIUS, until the computer says
    var PHONE_SMOOTH_MS = 8;                    // a light hand on touch jitter (the desktop default is raw)
    var DAB_FLUSH_MS = 33;                      // js/06d DAB_FLUSH_MS
    var DAB_MAX_PER_MSG = 96;                   // js/06d DAB_MAX_PER_MSG
    var TRAIL_STEP_PX = 1.5;                    // the pad's own trail: one sprite per this much pad travel

    var brush = {
        cycle: 0,            // the next palette colour, when the computer steps through one
        fromHost: false      // this room's palette position has been taken from the computer
    };

    // Whatever describes the computer's canvas on this connection.
    function canvasInfo() { return isMouse() ? link.info : room.info; }

    // The computer's brush size, as it stands now (a stroke keeps the size
    // it started with — metrics() is read at the press).
    function radius() { var i = canvasInfo(); return i ? i.radius : DEFAULT_RADIUS; }

    // A palette carries on from where the computer's stands.
    function adoptHostBrush() {
        var i = room.info;
        if (!i) return;
        brush.fromHost = true;
        brush.cycle = i.colors.length ? i.step % i.colors.length : 0;
    }

    function VW() { var i = canvasInfo(); return i ? i.w : DEFAULT_W; }
    function VH() { var i = canvasInfo(); return i ? i.h : DEFAULT_H; }

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

    // ── The mouse: the computer paints, the phone sends where the finger is ──
    // A finger held still sends nothing, and the computer lets go of a press
    // it has not heard about for a while (a phone that vanished mid-stroke),
    // so a still finger repeats where it is.
    var HOLD_REPEAT_MS = 300;
    function sendSamples(list) {
        if (!list.length) return;
        send({ type: 'mouse', data: { s: list } });
        if (stroke && stroke.mouse) stroke.sentAt = performance.now();
    }
    function holdStill() {
        var s = stroke;
        if (!s || !s.mouse) return;
        var now = performance.now();
        if (now - s.sentAt < HOLD_REPEAT_MS) return;
        sendSamples([[1, r4(s.sx), r4(s.sy), stamp(now)]]);
    }
    function stamp(at) { return Math.max(0, Math.round(at - stroke.t0)); }
    function linkColor() {
        var c = link.info && link.info.color;
        return c ? hexToRgb(c) : [1, 1, 1];
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
        var at = e.timeStamp || performance.now();
        if (isMouse()) {
            // Smoothing works in pad fractions here: the computer walks the
            // stroke, with its own brush.
            stroke = { id: e.pointerId, mouse: true, t0: at, at: at, sx: p.u, sy: p.v, u: p.u, v: p.v, r: radius(),
                       sentAt: 0, hold: setInterval(holdStill, HOLD_REPEAT_MS / 2) };
            sendSamples([[0, r4(p.u), r4(p.v), 0]]);
            trailBegin(linkColor());
            trailAt(p.u, p.v, stroke, true);
        } else {
            var m = metrics();
            strokeBase = strokeColor();
            stroke = { id: e.pointerId, sx: p.x, sy: p.y, lx: p.x, ly: p.y, resid: 0,
                       at: at, walkAt: at, lastEmitAt: at, m: m, u: p.u, v: p.v };
            pressStamp(p, m, strokeBase);
            trailBegin(strokeBase);
            trailAt(p.u, p.v, m, true);
            sendCursor(p.u, p.v, true);
        }
        buzz(8);
        hintDone();
    });

    pad.addEventListener('pointermove', function (e) {
        if (!stroke || e.pointerId !== stroke.id) return;
        var list = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : null;
        if (!list || !list.length) list = [e];
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var ev = list[i];
            var p = padPoint(ev);
            var at = ev.timeStamp || e.timeStamp || performance.now();
            var dt = Math.max(1, at - stroke.at);
            stroke.at = at;
            if (stroke.mouse) {
                var am = 1 - Math.exp(-dt / PHONE_SMOOTH_MS);
                stroke.sx += (p.u - stroke.sx) * am;
                stroke.sy += (p.v - stroke.sy) * am;
                out.push([1, r4(stroke.sx), r4(stroke.sy), stamp(at)]);
                trailAt(stroke.sx, stroke.sy, stroke, false);
            } else {
                // The computer's stabilizer, or a light smoothing of our own
                // for a fingertip's jitter, whichever holds on harder.
                var a = Math.min(stroke.m.alpha, 1 - Math.exp(-dt / PHONE_SMOOTH_MS));
                stroke.sx += (p.x - stroke.sx) * a;
                stroke.sy += (p.y - stroke.sy) * a;
                walkTo(stroke.sx, stroke.sy, at);
            }
            stroke.u = p.u;
            stroke.v = p.v;
        }
        if (stroke.mouse) sendSamples(out);
        else sendCursor(stroke.u, stroke.v, false);
    });

    // abort: the brush was taken or the room went away — drop what is
    // queued (the relay would refuse it) instead of sending it.
    function endStroke(e, abort) {
        if (!stroke) return;
        if (e && e.pointerId !== stroke.id) return;
        var at = (e && e.timeStamp) || performance.now();
        if (e && !abort) {
            var p = padPoint(e);
            if (!stroke.mouse) walkTo(p.x, p.y, at);   // the smoothing lag catches up
            stroke.u = p.u;
            stroke.v = p.v;
        }
        var s = stroke;
        stroke = null;
        padRect = null;
        try { pad.releasePointerCapture(s.id); } catch (_) {}
        if (s.mouse) {
            clearInterval(s.hold);
            // The lift lands where the finger left, past the smoothing.
            if (!abort) send({ type: 'mouse', data: { s: [[2, r4(s.u), r4(s.v), Math.max(0, Math.round(at - s.t0))]] } });
            trailEnd();
            return;
        }
        if (abort) {
            queue.length = 0;
            clearTimeout(flushTimer);
            flushTimer = 0;
        } else {
            flushDabs(true);
            sendCursor(s.u, s.v, true);
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

    // ── The pad's shape: the computer's canvas, as big as the screen allows ──
    var stage = $('stage');
    var chipL = $('chipLeft');
    var chipR = $('chipRight');
    var CHROME_GAP = 8;    // clear space between the corner chrome and the pad

    function visibleRect(el) {
        if (!el || el.hidden) return null;
        var r = el.getBoundingClientRect();
        return (r.width > 0 && r.height > 0) ? r : null;
    }
    function hits(a, b) {
        return !!(a && b) && a.left < b.right + CHROME_GAP && a.right + CHROME_GAP > b.left &&
            a.top < b.bottom + CHROME_GAP && a.bottom + CHROME_GAP > b.top;
    }

    // The pad at the canvas shape, as big as the stage's content box allows,
    // and where the centred stage would put it.
    function fitPad(hintH) {
        var box = stage.getBoundingClientRect();
        var cs = getComputedStyle(stage);
        var pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight);
        var pt = parseFloat(cs.paddingTop), pb = parseFloat(cs.paddingBottom);
        var bw = box.width - pl - pr, bh = box.height - pt - pb - hintH;
        if (bw < 40 || bh < 40) return null;
        var ar = VW() / VH();
        var w = bw, h = w / ar;
        if (h > bh) { h = bh; w = h * ar; }
        w = Math.floor(w);
        h = Math.floor(h);
        var left = box.left + pl + (bw - w) / 2;
        var top = box.top + pt + (bh - h) / 2;
        return { w: w, h: h, rect: { left: left, top: top, right: left + w, bottom: top + h } };
    }

    // First the whole screen. If that puts the pad under the corner chrome
    // (sideways, where the pad takes the full height and the chrome only has
    // the side margins), fit it again below the chrome: the pad never shares
    // its space.
    function layoutPad() {
        if ($('padView').hidden) return;
        var hint = $('rotateHint');
        var vw = window.innerWidth, vh = window.innerHeight;
        // A tall phone and a wide canvas make a letterbox of a pad: say so.
        var wantHint = vh > vw * 1.2 && VW() / VH() > 1.25;
        if (hint.hidden === wantHint) hint.hidden = !wantHint;
        var hintH = hint.hidden ? 0 : hint.offsetHeight + 10;
        stage.style.paddingTop = '';
        var fit = fitPad(hintH);
        if (!fit) return;
        var cl = visibleRect(chipL), cr = visibleRect(chipR);
        if (hits(fit.rect, cl) || hits(fit.rect, cr)) {
            var below = Math.max(cl ? cl.bottom : 0, cr ? cr.bottom : 0) + CHROME_GAP;
            stage.style.paddingTop = Math.ceil(below) + 'px';
            fit = fitPad(hintH) || fit;
        }
        if (pad.offsetWidth !== fit.w || pad.offsetHeight !== fit.h) {
            pad.style.width = fit.w + 'px';
            pad.style.height = fit.h + 'px';
        }
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var tw = Math.round(fit.w * dpr), th = Math.round(fit.h * dpr);
        if (trail.width !== tw || trail.height !== th) {
            trail.width = tw;
            trail.height = th;
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
        // A room travels along; a mouse link means nothing to the full app.
        return '../' + q + (room.code && !isMouse() ? '#' + room.code : '');
    }

    function render() {
        var inRoom = !!room.code;
        $('landing').hidden = inRoom;
        $('padView').hidden = !inRoom;
        $('fullLinkLanding').href = fullAppHref();
        $('fullLinkRoom').href = fullAppHref();
        if (!inRoom) { renderLanding(); return; }
        renderInstall();
        renderChrome();
        renderVeil();
        // The chrome may have changed size; the pad keeps clear of it.
        queueLayout();
    }

    function fmtClock(ms) {
        var s = Math.max(0, Math.round(ms / 1000));
        return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    }

    // Short on purpose: in a sideways phone the chip lives in the margin
    // beside the pad, and a longer line would push the pad down.
    function peopleText() {
        return room.count > 1 ? room.count + ' here' : 'Just you';
    }

    // The corner chrome: who is here or whose turn it is (left), Pass and
    // the menu (right), and in the menu's head the room and which cursor on
    // the big screen is yours.
    function renderChrome() {
        if (isMouse()) { renderMouseChrome(); return; }
        var t = room.turns;
        var open = room.phase === 'open';
        var turns = open && t.on;
        var mine = turns && isMyTurn();
        var main, sub = '';
        if (!open) {
            main = ({ connecting: 'Joining…', retrying: 'Reconnecting…', lost: 'Disconnected',
                refused: room.refusal === 'locked' ? 'Room locked' : 'Room full' })[room.phase] || '';
        } else if (turns) {
            if (mine && room.spent) main = 'Swirl sent';
            else if (mine) main = isCallMode() ? 'Your call' : 'Your turn';
            else main = holderName() + (isCallMode() ? '’s call' : '’s turn');
            if (t.deadline && !(mine && room.spent)) main += ' · ' + fmtClock(t.deadline - Date.now());
            var idx = t.order.indexOf(t.holder);
            var nextId = (idx >= 0 && t.order.length) ? t.order[(idx + 1) % t.order.length] : null;
            sub = (!mine && nextId === room.id) ? 'You’re next' : peopleText();
        } else {
            main = peopleText();
        }
        $('chipMain').textContent = main;
        $('chipSub').textContent = sub;
        chipL.classList.toggle('is-turns', turns);
        chipL.classList.toggle('is-mine', mine && !room.spent);
        var dot = $('meDot');
        var col = (open && room.id) ? colorForClient(room.id) : '';
        dot.style.background = col;
        dot.style.color = col || 'transparent';
        // While turns run, Pass keeps its place (faded out when the brush is
        // elsewhere), so the pad does not move as the brush goes round.
        var pass = $('passBtn');
        pass.hidden = !turns;
        pass.classList.toggle('is-idle', !(mine && !room.spent));
        pass.textContent = isCallMode() ? 'Pass my call' : 'Pass';
        var head = $('menuHead');
        head.textContent = '';
        var b = document.createElement('b');
        b.textContent = 'Room ' + room.code;
        head.appendChild(b);
        if (open && room.id) head.appendChild(document.createTextNode(' · you’re ' + shortName(room.id)));
        $('leaveBtn').textContent = 'Leave the room';
    }

    // The same corners for a mouse: the computer's state, and its turn when
    // its room takes turns (the computer holds the brush, the phone moves it).
    function renderMouseChrome() {
        var open = room.phase === 'open';
        var here = computerHere();
        var info = link.info;
        var mt = (open && here && link.active) ? mouseTurn() : null;
        var main, sub = '';
        if (!open) {
            main = ({ connecting: 'Connecting…', retrying: 'Reconnecting…', lost: 'Disconnected' })[room.phase] || '';
        } else if (link.replaced) {
            main = 'Another phone has it';
        } else if (!here) {
            main = 'Computer away';
        } else if (!link.active) {
            main = 'Connecting…';
        } else if (mt) {
            if (mt.mine && mt.spent) main = 'Swirl sent';
            else if (mt.mine) main = mt.call ? 'Your call' : 'Your turn';
            else main = (mt.who || 'Someone') + (mt.call ? '’s call' : '’s turn');
            if (mt.deadline && !(mt.mine && mt.spent)) main += ' · ' + fmtClock(mt.deadline - Date.now());
        } else {
            // Short: upright, the chip has less than half the width.
            main = 'You’re the mouse';
        }
        if (open && here && link.active && info.people > 1) sub = info.people + ' in the room';
        $('chipMain').textContent = main;
        $('chipSub').textContent = sub;
        chipL.classList.toggle('is-turns', !!mt);
        chipL.classList.toggle('is-mine', !!(mt && mt.mine && !mt.spent));
        // The dot is the colour the next stroke paints.
        var dot = $('meDot');
        var col = (here && info && info.color) || '';
        dot.style.background = col;
        dot.style.color = col || 'transparent';
        var pass = $('passBtn');
        pass.hidden = !mt;
        pass.classList.toggle('is-idle', !(mt && mt.mine && !mt.spent));
        pass.textContent = (mt && mt.call) ? 'Pass my call' : 'Pass';
        var head = $('menuHead');
        head.textContent = '';
        var b = document.createElement('b');
        b.textContent = 'Your computer’s mouse';
        head.appendChild(b);
        head.appendChild(document.createTextNode(' · code ' + groupCode(room.code)));
        $('leaveBtn').textContent = 'Disconnect';
    }

    function veilButton(label, fn, emphasis) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        if (emphasis) b.className = 'btn--emphasis';
        b.addEventListener('click', fn);
        return b;
    }

    function anotherCode() {
        leave();
        setTimeout(function () { try { $('codeInput').focus(); } catch (_) {} }, 50);
    }

    function renderVeil() {
        var veil = $('veil');
        var text = '';
        var soft = false;
        var actions = [];
        if (isMouse()) {
            var mv = mouseVeil();
            text = mv.text;
            soft = mv.soft;
            actions = mv.actions;
        } else {
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

    function mouseVeil() {
        var out = { text: '', soft: false, actions: [] };
        switch (room.phase) {
            case 'connecting':
                out.text = 'Connecting to your computer…';
                return out;
            case 'retrying':
                out.text = 'Reconnecting to your computer…';
                return out;
            case 'lost':
                out.text = 'Lost the connection to your computer.';
                out.actions = [veilButton('Try again', retryNow, true), veilButton('Another code', anotherCode)];
                return out;
        }
        if (room.phase !== 'open') return out;
        if (link.replaced) {
            out.text = 'Another phone is this computer’s mouse right now.';
            out.actions = [veilButton('Use this phone', function () { mouseHello(true); render(); }, true)];
        } else if (!computerHere()) {
            out.text = (link.info && link.info.off)
                ? 'Your computer closed the link. On it, choose Paint from your phone, then As your mouse, to carry on.'
                : 'Waiting for your computer. On it, open Swirl Together, choose Paint from your phone, then As your mouse.';
            out.actions = [veilButton('Another code', anotherCode)];
        } else if (!link.active) {
            out.text = 'Connecting to your computer…';
        } else if (!link.info.can) {
            var mt = mouseTurn();
            out.text = (link.info.why || 'Your computer can’t take a stroke right now.') +
                (mt && !mt.mine ? ' Watch the big screen.' : '');
            out.soft = true;
        }
        return out;
    }

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
        $('confirmText').textContent = !isMouse()
            ? 'Clear the canvas for everyone in the room?'
            : (link.info && link.info.people > 1)
                ? 'Clear the canvas on your computer, and for everyone in its room?'
                : 'Clear the canvas on your computer?';
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
        var sent = isMouse() ? send({ type: 'mouse-clear' }) : send({ type: 'clear', timestamp: Date.now() });
        if (sent) {
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

    // ── The installed app (manifest.webmanifest, sw.js) ─────────────
    // Saved to the home screen, the pad opens full screen and starts at the
    // landing page (no scanned link to open it with), so it offers the room
    // it was in lately. Until then the landing says how to install it: a
    // button where the browser hands us its install prompt (Android), the
    // Share-sheet steps on iOS, the browser menu elsewhere.
    function isInstalled() {
        try {
            return window.matchMedia('(display-mode: fullscreen)').matches ||
                window.matchMedia('(display-mode: standalone)').matches ||
                window.navigator.standalone === true;
        } catch (_) { return false; }
    }
    var IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent || '') ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var IS_TOUCH = (function () {
        try { return window.matchMedia('(pointer: coarse)').matches; } catch (_) { return false; }
    })();

    if ('serviceWorker' in navigator && window.isSecureContext) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('sw.js').catch(function () {});
        });
    }
    // Installed, the page already has the whole screen.
    if (isInstalled()) fsBtn.hidden = true;

    var installPrompt = null;
    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();          // offered on the page instead of the browser's own bar
        installPrompt = e;
        renderInstall();
    });
    window.addEventListener('appinstalled', function () {
        installPrompt = null;
        renderInstall();
        toast('Added. Open Swirl Together from your home screen.');
    });
    function promptInstall() {
        var p = installPrompt;
        closeMenu();
        if (!p) return;
        installPrompt = null;
        try {
            p.prompt();
            p.userChoice.then(renderInstall, renderInstall);
        } catch (_) {}
        renderInstall();
    }
    $('installBtn').addEventListener('click', promptInstall);
    $('installMenuBtn').addEventListener('click', promptInstall);

    function renderInstall() {
        var installed = isInstalled();
        $('installMenuBtn').hidden = installed || !installPrompt;
        var card = $('installCard');
        if (installed || !(IS_TOUCH || IS_IOS || installPrompt)) { card.hidden = true; return; }
        var text = $('installText');
        if (installPrompt) {
            text.innerHTML = 'Keep <b>Swirl Together</b> on your home screen. It opens full screen, ready to paint.';
        } else if (IS_IOS) {
            text.innerHTML = 'Keep it on your home screen: tap <b>Share</b>, then <b>Add to Home Screen</b>. It opens full screen.';
        } else {
            text.innerHTML = 'Keep it on your home screen: in your browser’s menu, choose <b>Add to Home screen</b> or <b>Install app</b>.';
        }
        $('installBtn').hidden = !installPrompt;
        card.hidden = false;
    }

    // What this phone was connected to lately: a room, or a computer.
    var LAST_KEY = 'swirlPad.lastRoom';
    var REJOIN_MS = 12 * 3600 * 1000;
    function rememberCode(code) {
        try { localStorage.setItem(LAST_KEY, JSON.stringify({ code: code, kind: kindOf(code), at: Date.now() })); } catch (_) {}
    }
    function lastCode() {
        try {
            var v = JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
            if (v && typeof v.code === 'string' && /^(?:[A-Z0-9]{6}|[A-Z0-9]{8})$/.test(v.code) &&
                typeof v.at === 'number' && Date.now() - v.at < REJOIN_MS) return v.code;
        } catch (_) {}
        return null;
    }
    $('rejoinBtn').addEventListener('click', function () {
        var code = lastCode();
        if (code) tryJoin(code);
    });

    // ── The landing: two ways to paint ───────────────────────────────
    var WAY_KEY = 'swirlPad.way';
    var way = (function () {
        try { return localStorage.getItem(WAY_KEY) === 'room' ? 'room' : 'mouse'; } catch (_) { return 'mouse'; }
    })();
    function setWay(next, quiet) {
        way = next === 'room' ? 'room' : 'mouse';
        try { localStorage.setItem(WAY_KEY, way); } catch (_) {}
        if (!quiet) { showJoinError(''); renderLanding(); }
    }
    $('wayMouse').addEventListener('click', function () { setWay('mouse'); });
    $('wayRoom').addEventListener('click', function () { setWay('room'); });

    function landingNote(text) {
        var n = $('landingNote');
        n.textContent = text || '';
        n.hidden = !text;
    }

    function renderLanding() {
        var code = lastCode();
        var lastKind = code ? kindOf(code) : null;
        $('rejoinBtn').hidden = !code;
        $('rejoinText').textContent = lastKind === 'mouse' ? 'Reconnect to your computer' : 'Rejoin room';
        $('rejoinCode').textContent = lastKind === 'mouse' ? '' : (code || '');
        var asMouse = way === 'mouse';
        $('wayMouse').setAttribute('aria-pressed', asMouse ? 'true' : 'false');
        $('wayRoom').setAttribute('aria-pressed', asMouse ? 'false' : 'true');
        $('step2').innerHTML = 'Choose <b>Paint from your phone</b>, then <b>' + (asMouse ? 'As your mouse' : 'As an artist') + '</b>.';
        // An app on an iPhone's home screen is not where the camera sends a
        // scanned link (that opens Safari), so there the code is typed.
        var typeIt = IS_IOS && isInstalled();
        $('step3').textContent = typeIt
            ? 'Type the code shown on the screen below.'
            : 'Point this phone’s camera at the code on the screen.';
        $('codeLabel').textContent = typeIt ? (asMouse ? 'Code' : 'Room code') : 'Or type the code';
        codeInput.placeholder = asMouse ? 'KMP4 QX7R' : 'K7P2QX';
        $('joinBtn').textContent = asMouse ? 'Connect' : 'Join';
        renderInstall();
    }

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
        var code = cleanCode(value);
        var kind = kindOf(code);
        if (!kind) {
            showJoinError(way === 'mouse'
                ? 'The code on your computer has 8 letters and numbers.'
                : 'A room code has 6 letters and numbers.');
            return;
        }
        showJoinError('');
        landingNote('');
        // The code decides the way, whichever card was picked.
        setWay(kind, true);
        try { codeInput.blur(); } catch (_) {}
        clearTimeout(autoJoinTimer);
        if (codeFromHash() === code) connect(code);
        else location.hash = code;               // hashchange joins
    }
    $('joinForm').addEventListener('submit', function (e) {
        e.preventDefault();
        tryJoin(codeInput.value);
    });
    // A pasted link works too. A computer's 8-character code connects as
    // soon as it is complete; a 6-character room code waits a moment, in
    // case it is the start of a longer one.
    var autoJoinTimer = 0;
    codeInput.addEventListener('input', function () {
        var raw = codeInput.value;
        var code = cleanCode(raw);
        if (/[#/]/.test(raw)) codeInput.value = code;
        showJoinError('');
        clearTimeout(autoJoinTimer);
        if (code.length === LINK_LEN) { tryJoin(code); return; }
        if (code.length === ROOM_LEN && way === 'room') {
            autoJoinTimer = setTimeout(function () {
                if (cleanCode(codeInput.value) === code) tryJoin(code);
            }, 700);
        }
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
    if (start) { setWay(kindOf(start), true); connect(start); }
    else render();

    // For tests and the curious (nothing in the app reads this).
    window.SwirlPad = {
        state: function () {
            return {
                host: HOST, kind: room.kind, code: room.code, phase: room.phase, refusal: room.refusal, id: room.id,
                count: room.count, turns: JSON.parse(JSON.stringify(room.turns)), spent: room.spent,
                info: room.info, brush: { radius: radius(), colour: colourMode(), cycle: brush.cycle },
                mouse: {
                    active: link.active, replaced: link.replaced, computer: computerHere(),
                    info: link.info ? JSON.parse(JSON.stringify(link.info)) : null
                },
                way: way,
                queued: queue.length, stroking: !!stroke,
                pad: { w: pad.offsetWidth, h: pad.offsetHeight },
                app: {
                    installed: isInstalled(), installable: !!installPrompt,
                    sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
                    lastRoom: lastCode()
                }
            };
        },
        join: function (code) { tryJoin(code); },
        leave: leave,
        metrics: metrics
    };
})();
