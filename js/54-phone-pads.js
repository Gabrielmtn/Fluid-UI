// ═══════════════════════════════════════════════════════════════════
// js/54-phone-pads.js — Paint from your phone: the computer's end (2026-09-16).
// LOAD ORDER: plain <script> after 53-idle-vram.js. What it reads from the
//   room client (06a–06e: currentRoom, partySocket, clientId, myRole,
//   roomLocked, shareMode, connectToRoom …) are script-global bindings that
//   exist only once the async chain has loaded, so every read goes through a
//   guarded accessor and runs at event time, never at load.
// PROVIDES: window.PhonePads = { open, close, isPad, count, padUrl, padBase,
//   onHello, onLeft, onRoom, sendInfo, refresh, __state }
//
// A phone does not run the painting. It opens phone/ (swirltogether.com
// sends small touch screens there) and paints one of two ways, picked in
// the dialog here (2026-09-17):
//   • AS YOUR MOUSE (js/55-phone-mouse.js): the phone drives this canvas's
//     own brush, over a private link. No room, and every setting is this
//     computer's. The default: most people reaching for a phone want this.
//   • AS AN ARTIST (this file): the phone joins the room this canvas is in
//     and sends its strokes as ordinary room paint — so this canvas, and
//     every other one in the room, draws them the way it draws anyone's
//     (06d). A party's way in: every phone that scans is its own painter.
// This file is the computer's side of the artist path, and the door to both:
//   • the door: "Paint from your phone" under Swirl Together, and the dialog
//     with the QR a phone scans (the artist tab starts a room when there is
//     none);
//   • who is a phone: pads say so ('pad-hello'), their cursors here read
//     "📱 Artist-XX", and the dialog counts them;
//   • what a phone paints with: THIS canvas's brush. The host answers each
//     hello with 'pad-info' — the canvas size (dab velocities are canvas
//     pixels), the flow model (Cap Colour decides how strong a dab is), how
//     the brush walks its dabs, and the brush itself (size, tip, arms, how it
//     picks colours) — and again whenever any of that changes while a phone
//     is in the room. Colour is the computer's on purpose: a peer's dab is
//     coloured by the RECEIVING canvas's arm settings (05g resolveArmColor),
//     so a solid-colour brush here repaints whatever colour a phone chose.
//     The relay never makes a phone the host (party/index.ts), so the host
//     is a canvas whenever one is here.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var WATCH_MS = 1500;           // how often the host re-checks what a phone paints with
    var PUBLIC_SITE = 'https://swirltogether.com/';

    // ── The room client, read at event time ─────────────────────────
    function roomCode() { try { return currentRoom || null; } catch (_) { return null; } }
    function selfId() { try { return clientId || null; } catch (_) { return null; } }
    function amHost() { try { return myRole === 'host'; } catch (_) { return false; } }
    function isLocked() { try { return !!roomLocked; } catch (_) { return false; } }
    function codeHidden() { try { return shareMode === 'hidden'; } catch (_) { return false; } }
    function inStrangerRoom() { try { return typeof isStrangerRoom === 'function' && isStrangerRoom(); } catch (_) { return false; } }
    function socketOpen() {
        try { return !!partySocket && partySocket.readyState === WebSocket.OPEN; } catch (_) { return false; }
    }
    function sendRaw(obj) {
        try {
            if (partySocket && partySocket.readyState === WebSocket.OPEN) {
                partySocket.send(JSON.stringify(obj));
                return true;
            }
        } catch (_) {}
        return false;
    }
    function nameOf(id) {
        try { if (typeof shortName === 'function') return shortName(id); } catch (_) {}
        return 'Artist-' + String(id).replace(/[^a-zA-Z0-9]/g, '').slice(-2).toUpperCase();
    }
    function announce(text) {
        try { if (typeof showTurnToast === 'function') { showTurnToast(text); return; } } catch (_) {}
        console.log('[phone] ' + text);
    }

    // ── Where a phone goes ──────────────────────────────────────────
    // This origin when a phone can reach it (the live site, or a LAN dev
    // server); the public site from the desktop build and from localhost.
    function padBase() {
        var real = /^https?:$/.test(location.protocol) && !!location.host &&
            !/^(localhost|127\.|\[?::1)/.test(location.hostname);
        return real ? location.origin + location.pathname.replace(/[^/]*$/, '') : PUBLIC_SITE;
    }
    function padUrl(code) { return padBase() + 'phone/#' + code; }
    function siteLabel() { return padBase().replace(/^https?:\/\//, '').replace(/\/$/, ''); }
    function mouse() { return window.PhoneMouse || null; }

    // ── Which connections are phones ────────────────────────────────
    var pads = new Map();      // connection id → { tag, at }
    var greeted = new Set();   // phone tags already announced in this room (a reconnect is not news)
    var padRoom = null;        // the room the two above describe

    function syncRoom() {
        var r = roomCode();
        if (r === padRoom) return;
        padRoom = r;
        pads.clear();
        greeted.clear();
        lastInfo = '';
        stopWatch();
    }

    function isPad(id) { return pads.has(id); }

    function onHello(data) {
        var id = data && data.clientId;
        if (typeof id !== 'string' || !id || id === selfId()) return;
        syncRoom();
        var d = (data.data && typeof data.data === 'object') ? data.data : {};
        var tag = (typeof d.tag === 'string' && /^[a-z0-9]{1,16}$/.test(d.tag)) ? d.tag : id;
        var fresh = !pads.has(id);
        pads.set(id, { tag: tag, at: Date.now() });
        if (fresh && !greeted.has(tag)) {
            greeted.add(tag);
            announce('📱 ' + nameOf(id) + ' joined from a phone. Their strokes land here.');
        }
        if (amHost()) sendInfo(true);
        startWatch();
        syncButtons();
        renderModal();
    }

    function onLeft(id) {
        if (!pads.delete(id)) return;
        if (!pads.size) stopWatch();
        syncButtons();
        renderModal();
    }

    // The room changed under us. 'connected' is a fresh socket: phones that
    // left while we were away never told us, and those still here say hello
    // again when they see the count rise — so the list starts over.
    function onRoom(kind) {
        syncRoom();
        if (kind === 'connected') { pads.clear(); lastInfo = ''; stopWatch(); }
        if (pads.size && amHost()) sendInfo(true);
        syncButtons();
        renderModal();
    }

    // ── What a phone paints with ────────────────────────────────────
    var lastInfo = '';
    var watchTimer = 0;
    var isHex = function (c) { return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c); };

    function buildInfo() {
        var cfg = window.config || {};
        var cv = document.getElementById('canvas');
        var a0 = (window.multiArmColors || [])[0] || null;
        var mode = a0 ? a0.mode : 'fixed';
        if (mode !== 'random' && mode !== 'step') mode = 'fixed';
        var colors = [];
        try { if (typeof getStepColorList === 'function') colors = getStepColorList() || []; } catch (_) {}
        colors = colors.filter(isHex).slice(0, 16).map(function (c) { return c.toLowerCase(); });
        var picker = document.getElementById('colorPicker');
        var mult = 1;
        try { mult = Math.max(1, Math.min(8, Math.round(animationMultiplier) || 1)); } catch (_) {}
        var info = {
            v: 1,
            w: cv ? cv.width : 0,
            h: cv ? cv.height : 0,
            gate: !!cfg.COLOR_GATE,
            flow: (typeof cfg.BRUSH_FLOW === 'number') ? +cfg.BRUSH_FLOW.toFixed(3) : 1,
            radius: (typeof cfg.SPLAT_RADIUS === 'number') ? +cfg.SPLAT_RADIUS.toFixed(6) : 0.011,
            mult: mult,
            sym: cfg.SYMMETRY_MODE || 'radial',
            tip: cfg.BRUSH_TIP | 0,
            colors: colors,
            color: (picker && isHex(picker.value)) ? picker.value.toLowerCase() : null,
            mode: mode
        };
        // How this canvas lays a stroke (05d0): the phone walks its dabs the
        // same way, so a phone stroke is as dense — and so as dark — as one
        // painted here. Density matters twice over: a dab's dye share is
        // honoured for a handed colour, but a fixed-colour arm paints every
        // dab at full strength, so there darkness IS the dab count.
        var spFrac = (typeof cfg.BRUSH_SPACING === 'number') ? cfg.BRUSH_SPACING : 0.001;
        var tcCap = (typeof cfg.BRUSH_TIME_COMP === 'number') ? cfg.BRUSH_TIME_COMP : 4;
        var ts = window.timeScale;
        info.spFrac = +spFrac.toFixed(4);
        info.spMin = (typeof cfg.BRUSH_SPACING_MIN_PX === 'number') ? cfg.BRUSH_SPACING_MIN_PX : 1;
        info.ref = (typeof cfg.BRUSH_SPACING_REF === 'number') ? cfg.BRUSH_SPACING_REF : 0.35;
        info.tc = (tcCap > 1 && typeof ts === 'number' && ts > 0 && ts < 1) ? +Math.min(tcCap, 1 / ts).toFixed(3) : 1;
        info.floor = (cfg.BRUSH_DAB_FLOOR !== false &&
            spFrac <= ((typeof cfg.BRUSH_DAB_FLOOR_MAX_SPACING === 'number') ? cfg.BRUSH_DAB_FLOOR_MAX_SPACING : 0.001))
            ? ((typeof cfg.BRUSH_DAB_FLOOR_RATE === 'number') ? cfg.BRUSH_DAB_FLOOR_RATE : 125) : 0;
        info.stab = (typeof cfg.BRUSH_STABILIZER === 'number') ? +cfg.BRUSH_STABILIZER.toFixed(3) : 0;
        info.budget = (typeof cfg.BRUSH_DAB_BUDGET === 'number') ? cfg.BRUSH_DAB_BUDGET : 4000;
        // Where this canvas's palette stands, so a phone in Palette mode
        // carries on from the next colour rather than from the first.
        try { if (typeof paletteStepIndex === 'number') info.step = paletteStepIndex; } catch (_) {}
        if (cfg.BRUSH_ANGLE) info.angle = +(+cfg.BRUSH_ANGLE).toFixed(1);
        // Push (velocity only) and per-arm push are part of the brush, as on
        // the dab wire (06d brushWireFields): a phone stroke should do what
        // this brush does.
        if (cfg.BRUSH_VELOCITY_ONLY) {
            info.push = cfg.BRUSH_VEL_MODE || 'smudge';
            info.pushS = +(+((typeof cfg.BRUSH_VEL_STRENGTH === 'number') ? cfg.BRUSH_VEL_STRENGTH : 1)).toFixed(2);
        }
        var ap = (typeof window.armPushMask === 'function') ? window.armPushMask() : 0;
        if (ap) info.ap = ap;
        return info;
    }

    function sendInfo(force) {
        if (!pads.size || !amHost() || !socketOpen()) return false;
        var info = buildInfo();
        // The palette position moves with every stroke painted here; it only
        // matters when a phone first joins, so it does not count as a change.
        var json = JSON.stringify(Object.assign({}, info, { step: undefined }));
        if (!force && json === lastInfo) return false;
        lastInfo = json;
        return sendRaw({ type: 'pad-info', data: info, timestamp: Date.now() });
    }

    function startWatch() {
        if (watchTimer || !pads.size) return;
        watchTimer = setInterval(function () {
            if (!pads.size) { stopWatch(); return; }
            sendInfo(false);
        }, WATCH_MS);
    }
    function stopWatch() {
        if (watchTimer) { clearInterval(watchTimer); watchTimer = 0; }
    }

    // ── The door, in Swirl Together ─────────────────────────────────
    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    function mountButtons() {
        var disc = document.getElementById('mpDisconnected');
        if (disc && !document.getElementById('phonePadBtn')) {
            var before = document.getElementById('mpError');
            var btn = el('button', 'mp-btn-primary btn--emphasis', 'Paint from your phone');
            btn.id = 'phonePadBtn';
            btn.type = 'button';
            btn.title = 'Show a code your phone can scan: it becomes this canvas’s mouse, or an artist in your room. Nothing to install.';
            btn.addEventListener('click', function () { open(); });
            var nodes = [
                el('div', 'mp-or', 'or'),
                btn,
                el('div', 'mp-sub', 'Use your phone as this canvas’s mouse, or let phones join as artists. Scan a code, paint on the phone, watch it here. Nothing to install.')
            ];
            nodes.forEach(function (n) {
                if (before && before.parentNode === disc) disc.insertBefore(n, before);
                else disc.appendChild(n);
            });
        }
        var invite = document.getElementById('roomDisplay');
        if (invite && !document.getElementById('phonePadRoomBtn')) {
            var b2 = el('button', 'mp-btn-share mp-btn-phone', 'Paint from your phone');
            b2.id = 'phonePadRoomBtn';
            b2.type = 'button';
            b2.title = 'Show a code your phone can scan: it becomes this canvas’s mouse, or an artist in this room.';
            b2.addEventListener('click', function () { open(); });
            invite.appendChild(b2);
        }
        syncButtons();
    }

    function syncButtons() {
        var pm = mouse();
        var mouseOn = !!(pm && pm.hasPhone());
        var b1 = document.getElementById('phonePadBtn');
        if (b1) b1.textContent = mouseOn ? 'Paint from your phone · connected' : 'Paint from your phone';
        var b = document.getElementById('phonePadRoomBtn');
        if (!b) return;
        // Every room: a stranger pairing has no seat for a phone artist, but
        // the phone can still be this canvas's mouse.
        b.hidden = !roomCode();
        var parts = [];
        if (mouseOn) parts.push('your mouse');
        if (pads.size) parts.push(pads.size + (pads.size === 1 ? ' artist' : ' artists'));
        b.textContent = 'Paint from your phone' + (parts.length ? ' · ' + parts.join(', ') : '');
    }

    // ── The dialog ──────────────────────────────────────────────────
    var WAY_KEY = 'fluidui.phoneWay';
    var modal = null, els = null, keyHandler = null, renderTimer = 0;
    var revealed = false, qrKey = '', way = 'mouse';

    function savedWay() {
        try { return localStorage.getItem(WAY_KEY) === 'artist' ? 'artist' : 'mouse'; } catch (_) { return 'mouse'; }
    }

    function build() {
        if (modal) return;
        var m = el('div', 'delete-modal phone-pad-modal');
        m.id = 'phonePadModal';
        m.dataset.group = 'core';   // button tint (css/01-buttons.css)
        m.setAttribute('role', 'dialog');
        m.setAttribute('aria-modal', 'true');
        m.setAttribute('aria-labelledby', 'phonePadTitle');
        m.innerHTML =
            '<div class="delete-modal-content">' +
                '<div class="delete-modal-title" id="phonePadTitle">Paint from your phone</div>' +
                '<div class="phone-pad-ways" role="group" aria-label="How the phone paints">' +
                    '<button type="button" id="phonePadWayMouse" aria-pressed="true">As your mouse</button>' +
                    '<button type="button" id="phonePadWayArtist" aria-pressed="false">As an artist</button>' +
                '</div>' +
                '<div class="delete-modal-message" id="phonePadMsg"></div>' +
                '<div class="phone-pad-body" id="phonePadBody">' +
                    '<div class="phone-pad-qr" id="phonePadQr"></div>' +
                    '<div class="phone-pad-side">' +
                        '<div class="phone-pad-alt" id="phonePadAlt"></div>' +
                        '<div class="phone-pad-code" id="phonePadCode"></div>' +
                        '<button type="button" class="phone-pad-reveal" id="phonePadReveal">Show the code</button>' +
                    '</div>' +
                '</div>' +
                '<div class="phone-pad-status" id="phonePadStatus" role="status" aria-live="polite"></div>' +
                '<div class="phone-pad-note" id="phonePadNote" hidden></div>' +
                '<div class="delete-modal-actions">' +
                    '<button type="button" id="phonePadStop" hidden>Disconnect the phone</button>' +
                    '<button type="button" id="phonePadUnlock" hidden>Unlock the room</button>' +
                    '<button type="button" id="phonePadDone" class="btn--emphasis">Done</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(m);
        modal = m;
        els = {
            wayMouse: m.querySelector('#phonePadWayMouse'),
            wayArtist: m.querySelector('#phonePadWayArtist'),
            msg: m.querySelector('#phonePadMsg'),
            body: m.querySelector('#phonePadBody'),
            qr: m.querySelector('#phonePadQr'),
            alt: m.querySelector('#phonePadAlt'),
            code: m.querySelector('#phonePadCode'),
            reveal: m.querySelector('#phonePadReveal'),
            status: m.querySelector('#phonePadStatus'),
            note: m.querySelector('#phonePadNote'),
            stop: m.querySelector('#phonePadStop'),
            unlock: m.querySelector('#phonePadUnlock'),
            done: m.querySelector('#phonePadDone')
        };
        els.wayMouse.addEventListener('click', function () { setWay('mouse'); });
        els.wayArtist.addEventListener('click', function () { setWay('artist'); });
        els.done.addEventListener('click', close);
        els.reveal.addEventListener('click', function () { revealed = true; renderModal(); });
        els.stop.addEventListener('click', function () {
            // The phone is sent away, and the link starts over on a new code
            // (the dialog is still here to show it): the phone that was here
            // cannot walk back in.
            var pm = mouse();
            if (pm) { pm.stop(true); pm.start(); }
            qrKey = '';
            renderModal();
        });
        els.unlock.addEventListener('click', function () {
            if (amHost() && isLocked() && typeof window.toggleLock === 'function') window.toggleLock();
        });
        // A click on the scrim closes it: nothing here is a question.
        m.addEventListener('click', function (e) { if (e.target === m) close(); });
    }

    function isOpen() { return !!modal && modal.classList.contains('show'); }

    // Switch the dialog between the two ways. Each starts what it needs:
    // the mouse its link, the artist way a room (unless there is one).
    function setWay(next) {
        way = next === 'artist' ? 'artist' : 'mouse';
        try { localStorage.setItem(WAY_KEY, way); } catch (_) {}
        revealed = false;
        qrKey = '';
        if (way === 'mouse') {
            var pm = mouse();
            if (pm) pm.start();
        } else if (!roomCode() && !inStrangerRoom()) {
            // createRoom() minus its clipboard copy: the phone scans, nobody pastes.
            try { connectToRoom(generateRoomCode()); }
            catch (e) { console.warn('[phone] could not start a room', e); }
        }
        renderModal();
    }

    function groupCode(c) { return c && c.length === 8 ? c.slice(0, 4) + ' ' + c.slice(4) : c; }

    function renderModal() {
        if (!isOpen()) return;
        var asMouse = way === 'mouse';
        els.wayMouse.setAttribute('aria-pressed', asMouse ? 'true' : 'false');
        els.wayArtist.setAttribute('aria-pressed', asMouse ? 'false' : 'true');
        els.msg.textContent = asMouse
            ? 'Scan this with your phone’s camera. The phone becomes this computer’s mouse: it moves the brush here, with every setting you’ve made. Nothing to install.'
            : 'Scan this with a phone’s camera to paint in this room as an artist of its own, beside you. Every phone that scans it joins. Nothing to install.';

        var pm = mouse();
        var ms = pm ? pm.status() : { on: false, phase: 'off', code: null, phone: false, open: false };
        var stranger = !asMouse && inStrangerRoom();
        var code = asMouse ? ms.code : (stranger ? null : roomCode());
        var url = !code ? '' : (asMouse ? pm.url() : padUrl(code));
        // Hide (the room panel's share mode) keeps the code off a stream;
        // the dialog honours it until asked.
        var hidden = codeHidden() && !revealed;
        var key = url + '|' + hidden;
        if (key !== qrKey) {
            qrKey = key;
            var svg = (url && !hidden && window.QRCode) ? window.QRCode.svg(url, { margin: 2 }) : '';
            els.qr.innerHTML = svg || '';
            els.qr.setAttribute('aria-label', !svg ? 'QR code hidden'
                : asMouse ? 'QR code: opens the phone as this computer’s mouse' : 'QR code: opens the phone brush for this room');
        }
        els.body.hidden = stranger;
        els.qr.classList.toggle('is-hidden', hidden || !url);
        els.alt.textContent = 'No camera? Open ' + siteLabel() + ' on the phone and enter';
        els.code.textContent = code ? (hidden ? (asMouse ? '●●●● ●●●●' : '●●●●●●') : groupCode(code)) : (asMouse ? '···· ····' : '······');
        els.reveal.hidden = !hidden || stranger;

        var note = '';
        var status = '';
        var liveStatus = false;
        if (asMouse) {
            status =
                !ms.on ? 'Opening a link for your phone…' :
                ms.phone ? '📱 Your phone is your mouse. Paint on it and watch here.' :
                ms.open ? 'Waiting for your phone…' :
                ms.phase === 'retrying' ? 'Reconnecting…' :
                'Opening a link for your phone…';
            liveStatus = ms.phone;
        } else if (stranger) {
            note = 'A stranger swirl has two seats, and both are taken, so no phone can join it as an artist. Your phone can still be your mouse.';
        } else {
            var live = socketOpen() && !!selfId();
            var n = pads.size;
            status =
                !code ? 'Starting a room…' :
                !live ? 'Opening the room…' :
                n === 1 ? '📱 A phone is connected. Paint on it and watch here.' :
                n > 1 ? '📱 ' + n + ' phones are connected. Paint on them and watch here.' :
                'Waiting for a phone…';
            liveStatus = live && n > 0;
            if (live && isLocked()) {
                note = amHost()
                    ? 'This room is locked, so a new phone can’t join. Unlock it first.'
                    : 'This room is locked, so a new phone can’t join. Ask the host to unlock it.';
            }
        }
        els.status.hidden = !status;
        els.status.textContent = status;
        els.status.classList.toggle('is-live', liveStatus);
        els.note.hidden = !note;
        els.note.textContent = note;
        els.unlock.hidden = !(!asMouse && !stranger && socketOpen() && isLocked() && amHost());
        els.stop.hidden = !(asMouse && ms.phone);
    }

    function refresh() {
        syncButtons();
        renderModal();
    }

    var openWhenReady = false;
    function open(which) {
        // The room client (06a–06e) arrives in the async chain after this
        // file, and the button exists before it does: a click that beats it
        // (a slow connection) opens the dialog once it lands instead of
        // failing halfway into starting a room.
        if (!window.__scriptsReady) {
            if (!openWhenReady) {
                openWhenReady = true;
                document.addEventListener('fluidui:scripts-ready', function () {
                    openWhenReady = false;
                    open(which);
                }, { once: true });
            }
            return false;
        }
        build();
        modal.classList.add('show');
        // The app's hotkeys listen on document; nothing typed here reaches
        // them (the same guard as 51's question).
        if (!keyHandler) {
            keyHandler = function (e) {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
                if (e.key !== 'Tab') e.stopPropagation();
            };
            document.addEventListener('keydown', keyHandler, true);
        }
        setWay(which === 'artist' || which === 'mouse' ? which : savedWay());
        clearInterval(renderTimer);
        renderTimer = setInterval(renderModal, 500);
        try { els.done.focus({ preventScroll: true }); } catch (_) {}
        syncButtons();
        return true;
    }

    function close() {
        clearInterval(renderTimer);
        renderTimer = 0;
        if (keyHandler) { document.removeEventListener('keydown', keyHandler, true); keyHandler = null; }
        if (modal) modal.classList.remove('show');
        // A link no phone ever used does not stay open for nothing.
        var pm = mouse();
        if (pm) pm.idleStop();
    }

    function init() {
        mountButtons();
        var pm = mouse();
        if (pm) pm.onChange(refresh);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.PhonePads = {
        open: open,
        close: close,
        isOpen: isOpen,
        isPad: isPad,
        count: function () { return pads.size; },
        padUrl: padUrl,
        padBase: padBase,
        way: function () { return way; },
        onHello: onHello,
        onLeft: onLeft,
        onRoom: onRoom,
        sendInfo: sendInfo,
        refresh: refresh,
        __state: function () {
            return {
                room: padRoom, pads: Array.from(pads.keys()), greeted: greeted.size,
                watching: !!watchTimer, host: amHost(), lastInfo: lastInfo ? JSON.parse(lastInfo) : null,
                url: roomCode() ? padUrl(roomCode()) : null, way: way
            };
        }
    };
})();
