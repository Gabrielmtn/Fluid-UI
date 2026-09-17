// ═══════════════════════════════════════════════════════════════════
// js/55-phone-mouse.js — a phone as THIS computer's mouse (2026-09-17).
// LOAD ORDER: plain <script> after 54-phone-pads.js (the dialog there drives
//   it). Reads the room client (06a PARTYKIT_HOST, 06c turn state, 06e …)
//   only at event time, through guarded accessors, like 54.
// PROVIDES: window.PhoneMouse = { start, stop, isOn, code, url, status,
//   idleStop, __state }
//
// The second way to paint from a phone. In 54 a phone joins a room as an
// artist of its own. Here it is an input device for this canvas, like the
// mouse or the Pen Input Window (js/47): its touches are re-issued on
// #canvas as synthetic PointerEvents, so the brush engine, button roles,
// symmetry, recording, replay and a room all take them for this computer's
// own strokes. Nothing on the phone decides how the paint looks, and a room
// never sees the phone at all.
//
// THE LINK — a private pass-through room on the same relay:
//   /parties/fluid/sys-mouse-<CODE>, CODE = 8 characters (a room code has 6,
//   which is how the phone page tells the two apart). sys- rooms are the
//   relay's plain broadcast kind (party/index.ts): no host, no cap, no
//   turns, nothing stored. So the relay needs no change, and a relayed
//   message still carries the sender's connection id, stamped by the relay.
//   The code lives as long as this window's session (sessionStorage): a
//   reload reopens the same link, and the phone finds its way back.
//   phone → computer   'mouse-hello' {tag}   take the mouse (the newest phone wins)
//                      'mouse' {s: [[k, u, v, t], …]}   k 0 press / 1 move / 2 lift,
//                          u v canvas fractions, t ms since the press
//                      'mouse-beat', 'mouse-bye', 'mouse-clear', 'mouse-pass'
//   computer → phones  'mouse-info' {active, w, h, color, radius, can, why,
//                          turn, people, since}   on a hello, on a change,
//                          and every 5 s while a phone is here
//
// PACING: the phone sends a message a frame and the network bunches them.
//   Each sample plays at its press time + its own t + a small buffer, so the
//   brush engine gets samples spread over frames the way a mouse delivers
//   them — the slow-movement floor lays at most one dab a frame, so a
//   bunched slow stroke would come out lighter under a solid colour.
//
// TRAPS (the Pen Input Window's, see js/47)
//   • setPointerCapture(syntheticId) throws; 05d wraps it, so a synthetic
//     stroke simply rides without capture.
//   • 05d hard-aborts a stroke when this window blurs. Somebody on the couch
//     never touches the computer, but a blur can still come (a notification
//     taking focus), so a capturing blur guard protects a live phone stroke.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var canvas = document.getElementById('canvas');
    if (!canvas) return;

    var CODE_KEY = 'swirlPhoneMouse.code';     // sessionStorage: this window's link code
    var ON_KEY = 'swirlPhoneMouse.on';          // …the link was open (a reload reopens it)
    var PAIRED_KEY = 'swirlPhoneMouse.paired';  // …a phone has used it
    var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{8}$/;
    var PTR_ID = 7001;              // synthetic pointerId (the Pen Input Window uses 5000+)
    var PLAY_DELAY_MS = 40;         // jitter buffer for the phone's samples
    var LATE_REBASE_MS = 60;        // a sample later than this pushes the buffer back
    var STALL_MS = 1500;            // a press with no word from the phone this long is let go
    var TICK_MS = 500;              // stall watch + what the phone shows, re-checked
    var BEAT_MS = 5000;             // "still here" to the phone
    var PHONE_SILENT_MS = 15000;    // no word from the phone this long: it is gone
    var RING_LINGER_MS = 2500;      // the brush ring stays where the finger lifted
    var IDLE_STOP_MS = 60000;       // a link no phone ever used closes this long after the dialog does

    // ── The room client, read at event time ─────────────────────────
    function relayHost() { try { return PARTYKIT_HOST; } catch (_) { return 'swirltogether.com'; } }
    function plainWs(h) {
        try { return isPlainWsHost(h); }
        catch (_) { return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/.test(h); }
    }
    function paused() { try { return !!isPaused; } catch (_) { return false; } }
    function roomPeople() {
        try { return (isMultiplayerEnabled && currentRoom) ? Math.max(1, connectedClients | 0) : 0; } catch (_) { return 0; }
    }
    function nameOf(id) {
        try { if (typeof shortName === 'function') return shortName(id); } catch (_) {}
        return 'Artist-' + String(id).replace(/[^a-zA-Z0-9]/g, '').slice(-2).toUpperCase();
    }
    function announce(text) {
        try { if (typeof showTurnToast === 'function') { showTurnToast(text); return; } } catch (_) {}
        console.log('[phone mouse] ' + text);
    }
    function turnInfo() {
        try {
            if (!turnsOn) return null;
            var mine = !!turnHolderId && turnHolderId === clientId;
            return {
                mine: mine,
                who: turnHolderId ? nameOf(turnHolderId) : '',
                call: turnModeLocal === 'stroke',
                left: turnDeadlineLocal ? Math.max(0, Math.round(turnDeadlineLocal - Date.now())) : 0,
                spent: mine && !!_oneSwirlSpent
            };
        } catch (_) { return null; }
    }

    // Why a press would not paint right now, in the phone's words.
    function blockReason() {
        if (window.__mpTurnBlocked) {
            var t = turnInfo();
            if (t && t.mine && t.spent) return 'Your swirl is down. The brush is moving on.';
            if (t && t.who) return 'It’s ' + t.who + '’s ' + (t.call ? 'call' : 'turn') + '.';
            return 'Waiting for the next painter.';
        }
        if (paused()) return 'The canvas is paused on your computer.';
        return null;
    }

    // ── The link ────────────────────────────────────────────────────
    var link = {
        on: false,
        code: null,
        since: 0,          // when this page opened the link (the older computer keeps a shared code)
        ws: null,
        id: null,          // our connection id in the link room
        count: 0,          // connections in the link room, us included
        phase: 'off',      // off | connecting | open | retrying
        attempts: 0
    };
    var timers = { retry: 0, open: 0, tick: 0, idle: 0 };
    var phone = null;      // the phone that has the mouse: { id, tag, seen }
    var greeted = {};      // phone tags already announced this session
    var lastInfoKey = '';
    var lastInfoAt = 0;
    var listeners = [];

    function newCode() {
        var a = new Uint8Array(8), s = '';
        try { crypto.getRandomValues(a); }
        catch (_) { for (var i = 0; i < 8; i++) a[i] = Math.floor(Math.random() * 256); }
        for (var j = 0; j < 8; j++) s += ALPHABET[a[j] % 32];   // 32 divides 256: uniform
        return s;
    }
    function ss(fn) { try { return fn(window.sessionStorage); } catch (_) { return null; } }
    function storedCode() {
        var c = ss(function (s) { return s.getItem(CODE_KEY); });
        return CODE_RE.test(c || '') ? c : null;
    }
    function store() {
        ss(function (s) {
            if (link.code) s.setItem(CODE_KEY, link.code);
            if (link.on) s.setItem(ON_KEY, '1'); else s.removeItem(ON_KEY);
        });
    }
    function wasPaired() { return ss(function (s) { return s.getItem(PAIRED_KEY) === '1'; }) === true; }
    function markPaired(on) { ss(function (s) { if (on) s.setItem(PAIRED_KEY, '1'); else s.removeItem(PAIRED_KEY); }); }

    function changed() {
        for (var i = 0; i < listeners.length; i++) { try { listeners[i](); } catch (_) {} }
    }

    function socketOpen() { return !!link.ws && link.ws.readyState === 1 && !!link.id; }
    function send(obj) {
        var ws = link.ws;
        if (!ws || ws.readyState !== 1) return false;
        try { ws.send(JSON.stringify(obj)); return true; } catch (_) { return false; }
    }

    function start() {
        clearTimeout(timers.idle);
        timers.idle = 0;
        if (link.on) return link.code;
        link.on = true;
        link.since = Date.now();
        link.code = link.code || storedCode() || newCode();
        store();
        openSocket();
        clearInterval(timers.tick);
        timers.tick = setInterval(tick, TICK_MS);
        changed();
        return link.code;
    }

    // Close the link. A phone still on it hears the computer is gone and
    // waits, and the same code opens it again this session — unless
    // `forget` (Disconnect the phone): then the next link gets a new code,
    // and that phone has to be shown the new one.
    function stop(forget) {
        clearTimeout(timers.idle);
        timers.idle = 0;
        if (link.on) {
            release();
            if (socketOpen()) send({ type: 'mouse-info', data: Object.assign(buildInfo(), { active: null, off: true, forget: forget === true }) });
            phone = null;
            link.on = false;
            link.phase = 'off';
            clearInterval(timers.tick);
            timers.tick = 0;
            dropSocket();
        }
        markPaired(false);
        if (forget === true) {
            link.code = null;
            ss(function (s) { s.removeItem(CODE_KEY); });
        }
        store();
        changed();
    }

    // The dialog closed. A link no phone has used yet is not kept open for
    // nothing — but not at once either: a phone may be on its way in.
    function idleStop() {
        clearTimeout(timers.idle);
        timers.idle = 0;
        if (!link.on || phone || wasPaired()) return;
        timers.idle = setTimeout(function () {
            timers.idle = 0;
            if (link.on && !phone && !wasPaired()) stop();
        }, IDLE_STOP_MS);
    }

    function openSocket() {
        clearTimeout(timers.retry);
        timers.retry = 0;
        if (!link.on) return;
        var host = relayHost();
        // No device id on this URL: a sys- room has no use for it, and it is
        // a locked room's re-admission key elsewhere.
        var url = (plainWs(host) ? 'ws:' : 'wss:') + '//' + host + '/parties/fluid/sys-mouse-' + link.code;
        link.phase = link.attempts ? 'retrying' : 'connecting';
        link.id = null;
        var ws;
        try { ws = new WebSocket(url); }
        catch (_) { scheduleRetry(); return; }
        link.ws = ws;
        ws.addEventListener('message', function (ev) { if (ws === link.ws) onMessage(ev.data); });
        ws.addEventListener('close', function () { if (ws === link.ws) onClose(); });
        ws.addEventListener('error', function () {});
        clearTimeout(timers.open);
        timers.open = setTimeout(function () {
            if (ws === link.ws && ws.readyState !== 1) { try { ws.close(); } catch (_) {} }
        }, 8000);
        changed();
    }

    // Our socket is let go of first and closed after, so its late events
    // can never touch the link.
    function dropSocket() {
        var ws = link.ws;
        link.ws = null;
        link.id = null;
        link.count = 0;
        clearTimeout(timers.open);
        clearTimeout(timers.retry);
        timers.retry = 0;
        if (ws) { try { ws.close(1000); } catch (_) {} }
    }

    function onClose() {
        link.ws = null;
        link.id = null;
        link.count = 0;
        release();
        phone = null;
        scheduleRetry();
        changed();
    }

    function scheduleRetry() {
        if (!link.on) return;
        link.attempts++;
        var base = Math.min(1000 * Math.pow(2, Math.min(link.attempts, 5) - 1), 15000);
        link.phase = 'retrying';
        timers.retry = setTimeout(openSocket, base / 2 + Math.random() * base / 2);
    }

    // Another computer on the same code (a duplicated browser tab carries
    // its session along): the one that opened it later takes a new code.
    function rekey() {
        release();
        phone = null;
        link.code = newCode();
        link.since = Date.now();
        markPaired(false);
        store();
        dropSocket();
        link.attempts = 0;
        openSocket();
        changed();
    }

    function num(v, lo, hi, dflt) {
        return (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : dflt;
    }

    function onMessage(raw) {
        var d;
        try { d = JSON.parse(raw); } catch (_) { return; }
        if (!d || typeof d.type !== 'string') return;
        // The relay stamps every relayed message with its sender; only its
        // own messages ('connected' names us) come any other way.
        var from = (typeof d.clientId === 'string' && d.clientId) ? d.clientId : null;
        switch (d.type) {
            case 'connected':
                if (link.id) return;          // a sys- room relays anything: only the first one is real
                clearTimeout(timers.open);
                link.id = from || '';
                link.count = num(d.totalClients, 1, 999, 1);
                link.phase = 'open';
                link.attempts = 0;
                lastInfoKey = '';
                sendInfo(true);               // a phone already waiting hears we are here
                changed();
                return;
            case 'client-count':
                if (from || typeof d.count !== 'number') return;
                var n = num(d.count, 1, 999, link.count);
                var fell = n < link.count;
                link.count = n;
                if (n < 2 && phone) dropPhone();
                // Someone left: if it was the phone, it no longer beats.
                else if (fell && phone) phone.seen = Math.min(phone.seen, Date.now() - PHONE_SILENT_MS + 4000);
                changed();
                return;
            case 'mouse-info':
                if (!from || from === link.id || !d.data || typeof d.data.since !== 'number') return;
                if (d.data.since < link.since || (d.data.since === link.since && from < String(link.id))) rekey();
                return;
            case 'mouse-hello':
                onHello(from, d.data);
                return;
        }
        if (!phone || from !== phone.id) return;
        phone.seen = Date.now();
        switch (d.type) {
            case 'mouse': onSamples(d.data); break;
            case 'mouse-bye': dropPhone(); break;
            case 'mouse-clear':
                if (typeof window.clearCanvas === 'function') window.clearCanvas();
                sendInfo(true);
                break;
            case 'mouse-pass':
                try { if (turnsOn && turnHolderId === clientId && typeof passTurn === 'function') passTurn(); } catch (_) {}
                break;
        }
    }

    function onHello(from, data) {
        if (!from || from === link.id) return;
        var p = (data && typeof data === 'object') ? data : {};
        var tag = (typeof p.tag === 'string' && /^[a-z0-9]{1,16}$/.test(p.tag)) ? p.tag : from;
        // The newest phone takes the mouse (the same phone back on a new
        // connection, or a second one the owner picked up). Whatever the
        // old connection was pressing is let go first.
        if (phone && phone.id !== from) release();
        phone = { id: from, tag: tag, seen: Date.now() };
        markPaired(true);
        clearTimeout(timers.idle);
        timers.idle = 0;
        if (!greeted[tag]) {
            greeted[tag] = true;
            announce('📱 Your phone is now your mouse. Paint on it and watch here.');
        }
        sendInfo(true);
        changed();
    }

    function dropPhone() {
        if (!phone) return;
        release();
        phone = null;
        sendInfo(true);
        changed();
    }

    function tick() {
        var now = Date.now();
        if (phone && now - phone.seen > PHONE_SILENT_MS) dropPhone();
        if (play.down && !play.q.length && performance.now() - play.lastMsgAt > STALL_MS) release();
        // Whoever else is on the link hears from us: the phone with the
        // mouse, and one waiting for its turn to ask (it asks when it hears
        // nobody has it).
        if (link.count < 2) return;
        sendInfo(now - lastInfoAt > BEAT_MS);
    }

    // ── What the phone shows ────────────────────────────────────────
    function paintHex() {
        // The colour about to be painted: the main picker is the app's live
        // next-colour preview (31's brush ring reads it the same way).
        var cp = document.getElementById('colorPicker');
        return (cp && /^#[0-9a-f]{6}$/i.test(cp.value)) ? cp.value.toLowerCase() : null;
    }
    function buildInfo() {
        var cfg = window.config || {};
        var why = blockReason();
        return {
            v: 1,
            active: phone ? phone.id : null,
            since: link.since,
            w: canvas.width,
            h: canvas.height,
            color: paintHex(),
            radius: (typeof cfg.SPLAT_RADIUS === 'number') ? +cfg.SPLAT_RADIUS.toFixed(6) : 0.011,
            can: !why,
            why: why || '',
            turn: turnInfo(),
            people: roomPeople()
        };
    }
    function sendInfo(force) {
        if (!socketOpen()) return false;
        var info = buildInfo();
        // The turn clock ticks every call; the phone counts it down itself.
        var key = JSON.stringify(Object.assign({}, info, { turn: info.turn && Object.assign({}, info.turn, { left: 0 }) }));
        if (!force && key === lastInfoKey) return false;
        lastInfoKey = key;
        lastInfoAt = Date.now();
        return send({ type: 'mouse-info', data: info });
    }

    // ── The phone's touches, played into the canvas ─────────────────
    var COALESCED_OK = (function () {
        try {
            var d = document.createElement('div'), n = -1;
            d.addEventListener('pointermove', function (e) { n = e.getCoalescedEvents().length; });
            var c = new PointerEvent('pointermove', { clientX: 1, clientY: 1 });
            d.dispatchEvent(new PointerEvent('pointermove', { coalescedEvents: [c], clientX: 1, clientY: 1 }));
            return n === 1;
        } catch (_) { return false; }
    })();

    var play = {
        q: [],             // samples waiting for their moment: { k, u, v, at }
        base: 0,           // performance.now() of the press, plus the buffer
        down: false,       // the phone's finger is down (as far as this canvas knows)
        last: null,        // the last sample played
        lastMsgAt: 0,
        raf: 0,
        timer: 0
    };

    function frac(v) { return (typeof v === 'number' && isFinite(v)) ? Math.max(-0.25, Math.min(1.25, v)) : null; }

    function onSamples(data) {
        var s = (data && Array.isArray(data.s)) ? data.s : null;
        if (!s) return;
        var now = performance.now();
        play.lastMsgAt = now;
        for (var i = 0; i < s.length && i < 512; i++) {
            var e = s[i];
            if (!Array.isArray(e) || e.length < 4) continue;
            var k = e[0], u = frac(e[1]), v = frac(e[2]), t = e[3];
            if ((k !== 0 && k !== 1 && k !== 2) || u === null || v === null || typeof t !== 'number' || !isFinite(t)) continue;
            if (k === 0) play.base = now + PLAY_DELAY_MS - t;
            var at = play.base + t;
            // Running late (a slow hop): push the rest of the stroke back
            // with it, so it keeps its pace instead of arriving in lumps.
            if (at < now - LATE_REBASE_MS) { play.base += now - at; at = now; }
            play.q.push({ k: k, u: u, v: v, at: at });
        }
        pump();
    }

    function pump() {
        var now = performance.now();
        var moves = [];
        while (play.q.length && play.q[0].at <= now + 1) {
            var e = play.q.shift();
            if (e.k === 1) { moves.push(e); continue; }
            if (moves.length) { moveTo(moves); moves = []; }
            if (e.k === 0) pressAt(e); else liftAt(e);
        }
        if (moves.length) moveTo(moves);
        if (!play.q.length) return;
        // A frame at a time while the window draws; the timer keeps a stroke
        // going where frames stop (a hidden or covered window).
        if (!play.raf) play.raf = requestAnimationFrame(function () { play.raf = 0; pump(); });
        if (!play.timer) {
            play.timer = setTimeout(function () { play.timer = 0; pump(); },
                Math.max(0, play.q[0].at - performance.now()) + 50);
        }
    }

    function point(u, v) {
        var r = canvas.getBoundingClientRect();
        return { x: r.left + u * r.width, y: r.top + v * r.height };
    }
    function fire(type, pt, buttons, button, coalesced) {
        var init = {
            bubbles: true, cancelable: true, composed: true, view: window,
            clientX: pt.x, clientY: pt.y,
            screenX: pt.x + (window.screenX || 0), screenY: pt.y + (window.screenY || 0),
            button: button, buttons: buttons,
            pointerId: PTR_ID, pointerType: 'mouse', isPrimary: true,
            width: 1, height: 1, pressure: buttons ? 0.5 : 0
        };
        if (coalesced) init.coalescedEvents = coalesced;
        try { canvas.dispatchEvent(new PointerEvent(type, init)); }
        catch (e) { console.warn('[phone mouse] dispatch failed', e); }
    }

    function pressAt(e) {
        if (play.down) liftAt(play.last || e);   // a lift that never came
        takeRing();
        var pt = point(e.u, e.v);
        // The ring jumps to the finger, then the press (a phone has no hover).
        fire('pointermove', pt, 0, -1);
        fire('pointerdown', pt, 1, 0);
        play.down = true;
        play.last = e;
        // Refused (someone else's turn, a paused canvas, the mouse already
        // mid-stroke): the phone should know why at once.
        if (window.__paintPointerId !== PTR_ID) sendInfo(true);
    }

    function moveTo(list) {
        var buttons = play.down ? 1 : 0;
        var pts = list.map(function (e) { return point(e.u, e.v); });
        if (COALESCED_OK && pts.length > 1) {
            var co = pts.map(function (pt) {
                return new PointerEvent('pointermove', { clientX: pt.x, clientY: pt.y, pointerId: PTR_ID,
                    pointerType: 'mouse', buttons: buttons, isPrimary: true, pressure: buttons ? 0.5 : 0 });
            });
            fire('pointermove', pts[pts.length - 1], buttons, -1, co);
        } else {
            for (var i = 0; i < pts.length; i++) fire('pointermove', pts[i], buttons, -1);
        }
        play.last = list[list.length - 1];
    }

    function liftAt(e) {
        if (!play.down) return;
        play.down = false;
        play.last = e;
        fire('pointerup', point(e.u, e.v), 0, 0);
        lingerRing();
        // The palette moves on at the lift: the phone's next trail colour.
        setTimeout(function () { sendInfo(false); }, 300);
    }

    // Let go now: a phone that left, went quiet, or lost the mouse.
    function release() {
        play.q.length = 0;
        if (play.down) liftAt(play.last || { u: 0.5, v: 0.5 });
    }

    // While a phone stroke is live, a blur of this window must not reach
    // 05d's hard abort (capture phase runs first).
    window.addEventListener('blur', function (e) {
        if (play.down && window.__paintPointerId === PTR_ID) e.stopImmediatePropagation();
    }, true);
    document.addEventListener('visibilitychange', function () { if (play.q.length) pump(); });

    // ── The brush ring follows the phone ────────────────────────────
    var ringTimer = 0;
    var ringPrev = null;
    function takeRing() {
        clearTimeout(ringTimer);
        ringTimer = 0;
        var bc = window.__brushCursor;
        if (!bc || typeof bc.setOwner !== 'function') return;
        var cur = (typeof bc.owner === 'function') ? bc.owner() : null;
        if (cur === PTR_ID) return;
        ringPrev = cur;
        bc.setOwner(PTR_ID);
    }
    function lingerRing() {
        clearTimeout(ringTimer);
        ringTimer = setTimeout(function () {
            ringTimer = 0;
            if (play.down) return;
            var bc = window.__brushCursor;
            if (!bc || typeof bc.owner !== 'function' || bc.owner() !== PTR_ID) return;
            try { canvas.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false, pointerId: PTR_ID, pointerType: 'mouse' })); } catch (_) {}
            bc.setOwner(ringPrev);
            ringPrev = null;
        }, RING_LINGER_MS);
    }

    // ── Out ─────────────────────────────────────────────────────────
    function url() {
        if (!link.code) return null;
        var base = (window.PhonePads && typeof PhonePads.padBase === 'function') ? PhonePads.padBase() : 'https://swirltogether.com/';
        return base + 'phone/#' + link.code;
    }
    function status() {
        return { on: link.on, phase: link.phase, code: link.code, phone: !!phone, open: socketOpen() };
    }

    // A reload reopens the link this page had open, with the same code, once
    // the room client (and so the relay's address) has loaded.
    (function resume() {
        if (ss(function (s) { return s.getItem(ON_KEY); }) !== '1') return;
        var go = function () { start(); idleStop(); };
        if (window.__scriptsReady) go();
        else document.addEventListener('fluidui:scripts-ready', go, { once: true });
    })();

    window.addEventListener('pagehide', function () {
        // The phone hears the computer leave now, not at the socket timeout.
        if (link.ws) { try { link.ws.close(1000); } catch (_) {} }
    });

    window.PhoneMouse = {
        start: start,
        stop: stop,
        idleStop: idleStop,
        isOn: function () { return link.on; },
        hasPhone: function () { return !!phone; },
        code: function () { return link.code; },
        url: url,
        status: status,
        onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
        sendInfo: sendInfo,
        __state: function () {
            return {
                on: link.on, phase: link.phase, code: link.code, id: link.id, count: link.count,
                since: link.since, phone: phone ? { id: phone.id, tag: phone.tag, seenMs: Date.now() - phone.seen } : null,
                down: play.down, queued: play.q.length, coalescedOK: COALESCED_OK,
                idleStop: !!timers.idle, paired: wasPaired(), info: buildInfo(), url: url()
            };
        }
    };
})();
