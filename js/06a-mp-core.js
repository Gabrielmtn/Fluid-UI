// ================================================================
// 06a-mp-core.js — Swirl Together client: transport, lifecycle, lobby, message dispatch.
// State globals, the device id and relay host, room codes, stranger
// matchmaking and its keep-alive, the socket lifecycle (connect, reconnect,
// give up, disconnect), the heartbeat, and onMultiplayerMessage — the
// dispatch switch that hands each message to a handler in 06b–06e.
//
// The multiplayer client was one 3,600-line file until 2026-09-11. It is now
// five classic scripts, loaded in this order by index.html's async chain.
// They share the global lexical scope: a function or top-level variable
// declared in an earlier file is visible to every later one, and every
// cross-file call happens at runtime (a socket message, a click, a frame),
// so only the load order matters — nothing here runs at load time except
// the init at the tail of 06e.
//   06a-mp-core.js        transport, lifecycle, lobby, message dispatch
//   06b-mp-look.js        settings lock + look snapshots and mirroring
//   06c-mp-turns.js       take turns / call and return
//   06d-mp-paint-wire.js  dabs, cursors, brush shapes, colliders, replay strokes
//   06e-mp-panel.js       the room panel, remote cursors, init (runs last)
// ================================================================

// Multiplayer functionality using PartyKit

// Multiplayer state
let partySocket = null;
let isMultiplayerEnabled = false;
let connectedClients = 0;
let clientId = null;
let remoteCursors = new Map();
let isProcessingRemoteEvent = false;
let remoteLastPositions = new Map();
let currentRoom = null;
let lastRoom = null; // remembered after a connection gives up, for the Reconnect button
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 5;
let matchmakingSocket = null;
let myRole = 'guest';     // 'host' | 'guest' in a managed room
let roomLocked = false;   // current room's server-confirmed lock state

// ── Take-turns mode (server-confirmed via 'turn-state' broadcasts) ──
// One member paints at a time; everyone else watches with the painter's look
// settings mirrored live. The server keys turns by stable uid but talks to
// clients in connection ids (same ids every relayed message already carries).
var turnsOn = false;        // room-wide flag
var turnHolderId = null;    // connection id of the current painter (null = none)
var turnOrder = [];         // connection ids in rotation order
var turnMsLocal = 0;        // turn length from the server (0 = no timer)
var turnDeadlineLocal = 0;  // local-clock time the turn auto-passes (0 = none)
var turnModeLocal = 'timer'; // 'timer' | 'stroke' ("Call and return": one swirl each)
window.__mpTurnBlocked = false; // paint gate (read by 05d pointer/touch + 04f clear)

// Stable per-device id (opaque, localStorage). Used to re-admit a dropped
// member into a locked room and to throttle matchmaking. NOT a security token.
const DEVICE_UID = (function() {
    try {
        const k = 'fluidDeviceId';
        let v = localStorage.getItem(k);
        if (!v) { v = Math.random().toString(36).slice(2, 10).toUpperCase(); localStorage.setItem(k, v); }
        return v;
    } catch (_) { return 'anon-' + Math.random().toString(36).slice(2, 8).toUpperCase(); }
})();

// Matchmade "stranger" rooms use a pub- prefix the lobby mints; private/code
// rooms are bare 6-char codes.
function isStrangerRoom() { return !!currentRoom && currentRoom.indexOf('pub-') === 0; }

// Configuration
// Always use the deployed PartyKit server. Override with window.PARTYKIT_HOST
// or set to 'localhost:1999' for local relay dev.
const PARTYKIT_HOST = (function() {
    if (window.PARTYKIT_HOST && typeof window.PARTYKIT_HOST === 'string') return window.PARTYKIT_HOST;
    // Persisted override — lets a relay migration reach shipped desktop builds
    // without a client patch (set from the console:
    //   localStorage.fluidMultiplayerHost = 'new-relay.example.com'
    // remove the key to return to the default). Raw localStorage on purpose:
    // the override must be settable before any settingsManager namespace
    // exists and must survive a settings clear.
    try {
        const o = localStorage.getItem('fluidMultiplayerHost');
        if (o && /^[\w.-]+(:\d+)?$/.test(o.trim())) return o.trim();
    } catch (_) {}
    // The web build is served from the same origin as its relay (partykit.json
    // "serve"), whether that origin is the hosted partykit.dev name or our own
    // domain on our own Cloudflare account. Any real (non-local, non-file)
    // origin is therefore its own relay. Only the desktop app, which loads
    // from file://, needs the hard-coded fallback.
    const host = window.location.host;
    if (host && !isPlainWsHost(host) && /^https?:$/.test(window.location.protocol)) return host;
    return 'swirltogether.com';
})();

// ws:// for local/LAN dev relays (no TLS there); wss:// for real deploys.
// Covers localhost, loopback, and RFC1918 LAN addresses so another device on
// the same network (phone/tablet) can point at a `partykit dev` relay via
// the host override.
function isPlainWsHost(h) {
    return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/.test(h);
}

// Generate a random 6-character room code
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O, 1/I
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

// Get room code from URL hash
function getRoomFromHash() {
    const h = window.location.hash;
    if (h && h.length > 1) return h.substring(1).toUpperCase();
    return null;
}

// Pull a 6-char room # out of a typed code OR a pasted link/hash.
function extractRoomCode(input) {
    if (!input) return '';
    var s = String(input).trim();
    if (s.indexOf('#') !== -1) s = s.substring(s.lastIndexOf('#') + 1);
    else if (s.indexOf('/') !== -1) s = s.substring(s.lastIndexOf('/') + 1);
    return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

// Create a new room, connect, and copy the # so the host can paste it to a friend.
function createRoom() {
    const code = generateRoomCode();
    connectToRoom(code);
    copyRoomCode(true);
}

// Join an existing room by # (accepts a typed code or a pasted link/hash)
function joinRoom(code) {
    var room = extractRoomCode(code);
    if (!room) return showMpError('Enter a room #');
    if (room.length < 6) return showMpError('Room # is 6 characters');
    connectToRoom(room);
}

// "Swirl With a Stranger": ask the lobby to pair us 1:1 with another seeker,
// then connect to whatever room it hands back (a pub- room). A pairing lasts
// exactly as long as both people stay — see strangerPartnerLeft.
function swirlWithStranger() {
    // Leave any current room/socket before matchmaking so we never leak one.
    if (partySocket || currentRoom) disconnectMultiplayer();
    hideMpError();
    closeMatchmaking();
    showMatchmaking();
    var settled = false;
    var attempts = 0;
    var MAX_MATCHMAKE_ATTEMPTS = 4;
    // Overall window covers the first try plus up to three throttle retries.
    var timeout = setTimeout(function() {
        if (settled) return;
        settled = true; closeMatchmaking();
        showMpError("Couldn't find a match. Try again."); showDisconnectedUI();
    }, 16000);
    var tryMatchmake = function() {
        if (settled) return;
        attempts++;
        try {
            const protocol = isPlainWsHost(PARTYKIT_HOST) ? 'ws:' : 'wss:';
            const url = `${protocol}//${PARTYKIT_HOST}/parties/lobby/main?uid=${encodeURIComponent(DEVICE_UID)}`;
            var ws = new WebSocket(url);
            matchmakingSocket = ws;
            ws.addEventListener('open', function() {
                ws.send(JSON.stringify({ type: 'matchmake', uid: DEVICE_UID }));
            });
            ws.addEventListener('message', function(ev) {
                if (ws !== matchmakingSocket) return;
                var data; try { data = JSON.parse(ev.data); } catch (_) { return; }
                if (data.type === 'matched') {
                    if (!settled) {
                        settled = true; clearTimeout(timeout);
                        // waiting:false → paired into another seeker's room; the
                        // lobby is done with us. waiting:true → we ARE the waiting
                        // slot: keep this socket OPEN — a live connection pins the
                        // lobby (its pointer can't be lost to an idle eviction,
                        // the exact hole that let two seekers mint separate rooms
                        // and miss each other), and closing it is how the lobby
                        // knows the waiter left. The keep-alive rides it too.
                        if (data.waiting === false) closeMatchmaking();
                        connectToRoom(data.roomId);
                    } else if (data.waiting === false && data.roomId && data.roomId !== currentRoom &&
                               isStrangerRoom() && connectedClients < 2) {
                        // A keep-alive on the pin was paired into another lone
                        // waiter's room — go join them.
                        closeMatchmaking();
                        stopStrangerKeepAlive();
                        connectToRoom(data.roomId);
                    }
                    return;
                }
                if (data.type === 'matchmake-error') {
                    if (settled) return; // a pinned keep-alive hit the throttle — harmless
                    // The lobby throttles matchmakes per device id ("One
                    // moment…"). Two tabs in one browser SHARE that id, so the
                    // second tab's click lands inside the 3s window routinely —
                    // retry past the throttle instead of failing the flow.
                    if (/one moment/i.test(data.message || '') && attempts < MAX_MATCHMAKE_ATTEMPTS) {
                        closeMatchmaking();
                        matchmakeRetryTimer = setTimeout(tryMatchmake, 3300);
                        return;
                    }
                    settled = true; clearTimeout(timeout); closeMatchmaking();
                    showMpError(data.message || 'Try again in a moment.'); showDisconnectedUI();
                }
            });
            ws.addEventListener('error', function() {
                if (settled || ws !== matchmakingSocket) return;
                settled = true; clearTimeout(timeout); closeMatchmaking();
                showMpError("Couldn't reach matchmaking. Check your connection."); showDisconnectedUI();
            });
        } catch (e) {
            if (settled) return;
            settled = true; clearTimeout(timeout); closeMatchmaking();
            showMpError("Couldn't start matchmaking."); showDisconnectedUI();
        }
    };
    tryMatchmake();
}

var matchmakeRetryTimer = null;
function closeMatchmaking() {
    if (matchmakeRetryTimer) { clearTimeout(matchmakeRetryTimer); matchmakeRetryTimer = null; }
    if (matchmakingSocket) {
        try { matchmakingSocket.close(); } catch (_) {}
        matchmakingSocket = null;
    }
}

// bfcache: a page restored from the back/forward cache resumes with DEAD
// sockets but LIVE timers — a pending matchmake retry or stranger keep-alive
// would fire into the stale state and wander the client into a phantom pub-
// room (joined out of nowhere, then dropped). Come back clean instead.
window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    closeMatchmaking();
    stopStrangerKeepAlive();
    if (partySocket || currentRoom) disconnectMultiplayer();
});

// ── Stranger keep-alive ──────────────────────────────────────────────
// A lone seeker sits in its minted pub- room with the lobby socket closed.
// The lobby drops its waiting pointer after WAIT_TTL_MS, so before this the
// waiter was stranded: at 60s the pointer expired while they were still in the
// room, the next seeker minted a DIFFERENT room, and the two never met — both
// showing "Waiting for a stranger…" forever. Re-announcing inside the TTL keeps
// the slot alive; the server recognises our uid and refreshes instead of
// pairing us with ourselves. If it hands back a different room, someone else
// was already waiting and we go to them.
var strangerKeepAlive = null;
var strangerWasPaired = false; // tells a partner's DEPARTURE from a waiter nobody has reached yet
// First tick fires EARLY (~8-13s) so two seekers whose initial matchmakes
// double-minted (the lobby's waiting pointer was lost between their requests)
// converge within seconds instead of a 45s tick; later ticks stay comfortably
// inside the server's 150s TTL even when a hidden tab's throttling makes one
// run late. Both delays are jittered to break the
// phase-lock of two waiters who started matchmaking simultaneously.
function strangerKeepAliveDelay(first) {
    return first ? 8000 + Math.random() * 5000 : 40000 + Math.random() * 10000;
}

function stopStrangerKeepAlive() {
    if (strangerKeepAlive) { clearTimeout(strangerKeepAlive); strangerKeepAlive = null; }
}

function startStrangerKeepAlive() {
    stopStrangerKeepAlive();
    scheduleStrangerKeepAlive(true);
}

function scheduleStrangerKeepAlive(first) {
    strangerKeepAlive = setTimeout(function () {
        // Only while genuinely alone in a stranger room.
        if (!isStrangerRoom() || connectedClients >= 2 || !partySocket || partySocket.readyState !== WebSocket.OPEN) {
            stopStrangerKeepAlive();
            return;
        }
        var mine = currentRoom;
        // Normal path: the waiting pin socket is open — refresh our slot on it.
        // (Replies land in the swirlWithStranger handler: waiting:true refreshes
        // are ignored there; a waiting:false pairing makes us hop to the room.)
        if (matchmakingSocket && matchmakingSocket.readyState === WebSocket.OPEN) {
            try { matchmakingSocket.send(JSON.stringify({ type: 'matchmake', uid: DEVICE_UID, holding: mine })); } catch (_) {}
            scheduleStrangerKeepAlive(false);
            return;
        }
        // Fallback (pin died — network blip): a short-lived socket re-registers.
        try {
            var proto = isPlainWsHost(PARTYKIT_HOST) ? 'ws' : 'wss';
            var ws = new WebSocket(proto + '://' + PARTYKIT_HOST + '/parties/lobby/main?uid=' + encodeURIComponent(DEVICE_UID));
            var done = false;
            var bail = setTimeout(function () { if (!done) { done = true; try { ws.close(); } catch (_) {} } }, 8000);
            ws.addEventListener('open', function () {
                // `holding` names the room we already wait in: a lobby that
                // lost its pointer re-adopts THIS room instead of minting a
                // fresh one (which stranded phase-locked waiters in an
                // endless hop-chase through each other's abandoned rooms).
                ws.send(JSON.stringify({ type: 'matchmake', uid: DEVICE_UID, holding: mine }));
            });
            ws.addEventListener('message', function (ev) {
                if (done) return;
                var d; try { d = JSON.parse(ev.data); } catch (_) { return; }
                if (d.type !== 'matched') return;      // 'One moment…' throttle: just retry next tick
                done = true; clearTimeout(bail);
                try { ws.close(); } catch (_) {}
                // Still alone, and the lobby put someone else's room forward → join them.
                // (Against the holding-aware relay a waiting:true reply always
                // names OUR room, so this hop only fires on a real pairing.)
                if (d.roomId && d.roomId !== mine && isStrangerRoom() && connectedClients < 2) {
                    stopStrangerKeepAlive();
                    connectToRoom(d.roomId);
                    return;
                }
            });
            ws.addEventListener('error', function () { done = true; clearTimeout(bail); });
        } catch (_) { /* transient network — try again next tick */ }
        scheduleStrangerKeepAlive(false);
    }, strangerKeepAliveDelay(first));
}

// A stranger pairing is exactly two people, and it ends when either of them
// goes. Before this, a survivor slid silently back into the lobby queue —
// still "connected", still painting, on a canvas with nobody on the other end,
// and liable to be teleported into a third party's room mid-stroke. Leaving
// the room is the honest reading of what just happened: the swirl you were in
// is over, and the next one is something you ask for.
function strangerPartnerLeft() {
    // disconnectMultiplayer owns the whole teardown — socket, room, lobby pin,
    // keep-alive, turn gates, strangerWasPaired — and lands us back on the
    // "not in a room" panel with no Reconnect button (there is nothing to
    // reconnect TO: the room's other seat is empty and the lobby has let it go).
    disconnectMultiplayer();
    showMpError('Your partner left, so the swirl ended. Swirl With a Stranger again to meet someone new.', true);
}

// Host-only: toggle the room lock. The server confirms via a 'lock-state' broadcast.
function toggleLock() {
    if (!partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    partySocket.send(JSON.stringify({ type: 'lock', locked: !roomLocked }));
}


// Core connect logic
function connectToRoom(roomCode) {
    // Tear down any existing socket (OPEN *or* still CONNECTING) so we never leak one.
    if (partySocket) {
        disconnectMultiplayer();
    }
    hideMpError();
    currentRoom = roomCode;
    reconnectAttempts = 0;
    myRole = 'guest';
    roomLocked = false;
    strangerWasPaired = false;
    resetSettingsLock();
    resetTurnState();

    // Stranger rooms are ephemeral — keep them out of the shareable URL hash;
    // private/code rooms stay in the hash so a #CODE deep-link auto-joins.
    if (roomCode.indexOf('pub-') === 0) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
    } else {
        history.replaceState(null, '', '#' + roomCode);
    }

    doConnect();
}

function doConnect() {
    if (!currentRoom) return;
    // Never stack sockets: a reconnect timer (or a stale socket's close event)
    // can fire after a newer socket was already opened — e.g. joining a new
    // room while the previous connection was still CONNECTING. The overwritten
    // socket used to stay alive server-side with its handlers attached, so the
    // tab processed every broadcast twice and the relay saw two connections
    // per device (which take-turns, keyed to connection ids, cannot tolerate).
    if (partySocket) {
        try { partySocket.close(); } catch (_) {}
        partySocket = null;
    }
    try {
        const protocol = isPlainWsHost(PARTYKIT_HOST) ? 'ws:' : 'wss:';
        const url = `${protocol}//${PARTYKIT_HOST}/parties/fluid/${currentRoom}?uid=${encodeURIComponent(DEVICE_UID)}`;
        console.log('Connecting to PartyKit:', url);
        showConnecting();
        partySocket = new WebSocket(url);
        partySocket.addEventListener('open', onMultiplayerOpen);
        partySocket.addEventListener('message', onMultiplayerMessage);
        partySocket.addEventListener('close', onMultiplayerClose);
        partySocket.addEventListener('error', onMultiplayerError);
        // Timeout if connection doesn't open within 8s
        partySocket._connectTimeout = setTimeout(function() {
            if (partySocket && partySocket.readyState !== WebSocket.OPEN) {
                console.warn('Connection timed out');
                partySocket.close();
                if (reconnectAttempts >= MAX_RECONNECT) {
                    giveUpConnection("Couldn't reach the room. Check your connection and try again.");
                }
            }
        }, 8000);
    } catch (error) {
        console.error('Error connecting to multiplayer:', error);
        showMpError('Connection failed');
        showDisconnectedUI();
    }
}

// Keep legacy function working
function initMultiplayer() {
    const toggle = document.getElementById('multiplayerToggle');
    if (toggle && !toggle.checked) {
        disconnectMultiplayer();
        return;
    }
    if (!currentRoom) createRoom();
}

// rememberRoom: keep the room for the Reconnect button (used by the record
// drawer's Multiplayer toggle so a misclick-leave isn't a one-way door).
// Default callers leave lastRoom alone — a deliberate panel disconnect
// stays a clean exit.
function disconnectMultiplayer(rememberRoom) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    stopPing();
    closeMatchmaking();
    stopStrangerKeepAlive();
    _dabQueue.length = 0; // never carry one room's dabs into the next
    if (rememberRoom && currentRoom) lastRoom = currentRoom;
    currentRoom = null;
    myRole = 'guest';
    roomLocked = false;
    strangerWasPaired = false;
    resetSettingsLock();
    resetTurnState();
    if (partySocket) {
        partySocket.close();
        partySocket = null;
    }
    isMultiplayerEnabled = false;
    connectedClients = 0;
    remoteCursors.clear();
    remoteLastPositions.clear();
    clearRemoteCursors();
    dropPeerAssets();
    // Clear URL hash
    history.replaceState(null, '', window.location.pathname + window.location.search);
    showDisconnectedUI();
    // showDisconnectedUI hides the Reconnect button; re-show it when this
    // disconnect asked to keep the door open (same pattern as giveUpConnection).
    if (rememberRoom && lastRoom) {
        var rc = document.getElementById('reconnectBtn');
        if (rc) rc.style.display = '';
    }
}

// ── Liveness heartbeat ──────────────────────────────────────────────
// The relay reaps connections that have pinged before and then gone silent
// (~65s). Without this, a peer that died without a close frame (sleeping
// laptop, crash, dropped network) haunted the room for minutes: it held the
// cap-2 stranger slot, kept the survivor's count at 2 ("still connected"),
// and could capture the turn rotation. Old clients never ping and are never
// reaped, so mixed rooms stay safe; a live client wrongly reaped (e.g. on
// wake from sleep) gets close code 4003, which takes the normal reconnect
// path.
var PING_MS = 20000;
var pingTimer = null;
function sendPing() {
    if (partySocket && partySocket.readyState === WebSocket.OPEN) {
        try { partySocket.send(JSON.stringify({ type: 'ping' })); } catch (_) {}
    }
}
function startPing() {
    stopPing();
    sendPing(); // mark this connection reap-eligible immediately
    pingTimer = setInterval(sendPing, PING_MS);
}
function stopPing() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
}

// Stale-socket guard: every handler ignores events from a socket that is no
// longer THE socket (replaced by a newer connect). Without this, an orphaned
// socket's events keep mutating module state — its 'close' schedules a bogus
// reconnect (stacking connections) and its messages double-apply.
function isCurrentSocket(event) {
    return !!event && !!partySocket && event.target === partySocket;
}

function onMultiplayerOpen(event) {
    if (!isCurrentSocket(event)) return;
    console.log('Connected to multiplayer! Room:', currentRoom);
    if (partySocket && partySocket._connectTimeout) clearTimeout(partySocket._connectTimeout);
    isMultiplayerEnabled = true;
    reconnectAttempts = 0;
    // Fresh socket, fresh audience: republish our stamp to whoever is here
    // now rather than assuming the last room's members carried over.
    resetPublishedShapes();
    resetPublishedColliders();
    // Walls we already have are ours to contribute to the room we just
    // joined; a moment's delay lets the layer system finish waking up.
    setTimeout(function () { try { republishColliders(); } catch (_) {} }, 1200);
    startPing();
    // Sync the hidden toggle
    var toggle = document.getElementById('multiplayerToggle');
    if (toggle) toggle.checked = true;
    showConnectedUI();
}

function onMultiplayerMessage(event) {
    if (!isCurrentSocket(event)) return;
    try {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'connected':
                clientId = data.clientId;
                connectedClients = data.totalClients;
                if (data.role) myRole = data.role;
                if (typeof data.locked === 'boolean') roomLocked = data.locked;
                // Fresh socket = fresh room state. An auto-reconnect (doConnect)
                // can land in a room whose turns/lock were switched off while we
                // were away — and the server only announces turn-state when
                // turns are ON — so stale gates must not survive the socket.
                // When turns ARE on, the authoritative turn-state follows this
                // message immediately and rebuilds everything. (Host-side
                // settingsLockOn intent is deliberately left alone.)
                resetTurnState();
                setSettingsLockedByHost(false, null);
                updateConnectedView();
                break;

            case 'client-count':
                // Someone new arrived, and they hold none of the stamps we
                // published to the people already here. Clearing the ledger
                // makes the next stroke republish — one ≤21KB message, versus
                // a newcomer seeing every shaped stroke as a plain tip for as
                // long as they stay in the room.
                if (typeof data.count === 'number' && data.count > connectedClients) {
                    resetPublishedShapes();
                    // Same for walls — but a newcomer has no way to ask for
                    // them, and nothing else would ever resend, so push them
                    // now rather than waiting for an edit that may never come.
                    resetPublishedColliders();
                    republishColliders();
                }
                connectedClients = data.count;
                updateConnectedView();
                break;

            case 'lock-state':
                roomLocked = !!data.locked;
                updateConnectedView();
                break;

            case 'host-changed':
                // hostId is a CONNECTION id now, not a uid — see the relay note
                // in party/index.ts. It used to be the uid, which meant every
                // host handover broadcast the promoted member's re-admission
                // key (and, while they hold the role, the credential the relay
                // grants host on) to the whole room. DEVICE_UID stays accepted
                // as a fallback purely so a client that lands on a relay from
                // before that change still learns it was promoted; it grants
                // nothing on its own, since the relay decides the real role.
                myRole = (data.hostId === clientId || data.hostId === DEVICE_UID) ? 'host' : 'guest';
                // Promotion to host frees this client from any settings lock —
                // but NOT from the turn gates (a promoted watcher still waits
                // for the brush), so re-derive those after the reset.
                if (myRole === 'host') { resetSettingsLock(); syncTurnGates(); }
                updateConnectedView();
                break;

            case 'splat':
                // Receive splat from another client. Queued, not applied here —
                // 05j drains it under the frame's dab budget (see the inbound
                // budget note above enqueueRemoteSplat).
                if (data.clientId !== clientId) {
                    enqueueRemoteSplat(data);
                }
                break;

            case 'brush-shape':
                // A peer's custom stamp bitmap, so their shaped strokes print
                // as the shape they painted with instead of a built-in tip.
                if (data.clientId !== clientId) {
                    handleBrushShape(data);
                }
                break;

            case 'collider-add':
                // A peer's wall: their coverage map, rasterized into our own
                // obstacle field so the fluid deflects the same way here.
                if (data.clientId !== clientId) {
                    handleColliderAdd(data);
                }
                break;

            case 'collider-remove':
                if (data.clientId !== clientId) {
                    handleColliderRemove(data);
                }
                break;

            case 'stroke':
                // Receive full stroke replay from another client
                if (data.clientId !== clientId && Array.isArray(data.data?.events)) {
                    if (typeof window.scheduleStrokeReplay === 'function') {
                        window.scheduleStrokeReplay(data.data.events);
                    }
                }
                break;

            case 'stroke-chunk':
                // Large stroke split under the relay's 16KB message cap
                if (data.clientId !== clientId) {
                    handleStrokeChunk(data);
                }
                break;

            case 'cursor':
                if (data.clientId !== clientId) {
                    handleRemoteCursor(data);
                }
                break;

            case 'pointer-up':
                if (data.clientId !== clientId) {
                    handleRemotePointerUp(data);
                }
                break;

            case 'clear':
                // Another client cleared the canvas. clearCanvas() itself calls
                // broadcastClear(), so without this guard every received clear
                // re-broadcasts and the wipe ping-pongs between clients forever
                // (same class of bug as the preset loop below).
                if (data.clientId !== clientId && typeof clearCanvas === 'function') {
                    window.__mpFlushInbound(); // queued dabs predate the wipe
                    isProcessingRemoteEvent = true;
                    window.__mpApplyingRemote = true;
                    try { clearCanvas(); }
                    finally { isProcessingRemoteEvent = false; window.__mpApplyingRemote = false; }
                }
                break;

            case 'preset':
                // Another client applied a preset. applyPreset() itself calls
                // broadcastPreset(), so without this guard the preset ping-pongs
                // between clients forever (the "settings jumping around" bug). Mark
                // it as a remote event so broadcastPreset() skips the re-send.
                if (data.clientId !== clientId && typeof applyPreset === 'function') {
                    isProcessingRemoteEvent = true;
                    window.__mpApplyingRemote = true;
                    try { applyPreset(data.data.preset); }
                    finally { isProcessingRemoteEvent = false; window.__mpApplyingRemote = false; }
                }
                break;

            case 'settings-lock':
                // Host locked/unlocked look settings (13.5). Hosts never
                // gate themselves — only guests enter the locked state.
                // While turns run the relay refuses these; ignore any that
                // slip through (e.g. sent just before turns switched on).
                if (data.clientId !== clientId && myRole !== 'host' && !turnsOn) {
                    setSettingsLockedByHost(!!data.locked, data.snapshot || null);
                }
                break;

            case 'turn-state': {
                // Server-confirmed rotation update (host toggled turns, a pass,
                // a join/leave, or a reconnect changed a connection id).
                // Server-authored broadcasts never carry a clientId; the relay
                // stamps one onto every client-relayed message — so a clientId
                // here means a forged copy from a peer (the new relay drops
                // those, but the previously deployed relay forwards anything).
                if (data.clientId) break;
                var wasMyTurn = isMyTurn();
                turnsOn = !!data.on;
                turnHolderId = (typeof data.holder === 'string' && data.holder) ? data.holder : null;
                turnOrder = Array.isArray(data.order)
                    ? data.order.filter(function (x) { return typeof x === 'string'; })
                    : [];
                turnMsLocal = (typeof data.turnMs === 'number' && data.turnMs > 0) ? data.turnMs : 0;
                // A relay too old to know about "One swirl each" simply omits
                // mode; those rooms fall back to a timer-less rotation, which
                // is what its `seconds: 0` companion already asked for.
                turnModeLocal = data.mode === 'stroke' ? 'stroke' : 'timer';
                // The countdown needs no synchronized clocks: the message's
                // server timestamp gives us the skew to shift the deadline
                // onto the local clock.
                turnDeadlineLocal = (typeof data.deadline === 'number' && data.deadline > 0 &&
                    typeof data.timestamp === 'number')
                    ? data.deadline + (Date.now() - data.timestamp)
                    : 0;
                applyTurnState(wasMyTurn);
                break;
            }

            case 'turn-invite-offer':
                // Partner proposed taking turns (stranger pairs only). Server-
                // authored: the relay never forwards a client-sent copy.
                if (!turnsOn) showTurnInvitePrompt(data.from, data.seconds, data.mode);
                break;

            case 'turn-invite-sent':
                // Relay accepted the invite and delivered it — stop the
                // old-relay probe, keep waiting for the human.
                if (inviteAckTimeout) { clearTimeout(inviteAckTimeout); inviteAckTimeout = null; }
                break;

            case 'turn-invite-result':
                // Only sent when it did NOT start — an accept arrives as turn-state.
                if (!data.accepted) {
                    clearInviteWait();
                    if (data.reason === 'same-device') {
                        showTurnToast('Both windows share one device id — open the other in a different browser or a private window.');
                    } else if (data.reason === 'alone') {
                        showTurnToast('Nobody else in the room yet.');
                    } else {
                        showTurnToast((data.by ? shortName(data.by) : 'They') + ' would rather keep painting together');
                    }
                    updateTurnUI();
                }
                break;

            case 'turn-look':
                // The current painter's look snapshot. The relay only forwards
                // these from the turn holder; the holder check here just guards
                // against reordered stragglers from a previous painter.
                if (turnsOn && !isMyTurn() && data.clientId === turnHolderId) {
                    applyRemoteLookSnapshot(data.snapshot || null);
                }
                break;
        }
    } catch (error) {
        console.error('Error handling multiplayer message:', error);
    }
}

function onMultiplayerClose(event) {
    // A socket we already replaced (or nulled in disconnectMultiplayer)
    // closing later must not touch state or schedule a reconnect.
    if (event && event.target && event.target !== partySocket) return;
    console.log('Disconnected from multiplayer');
    stopPing();
    isMultiplayerEnabled = false;
    clearRemoteCursors();
    // Peer stamps are room-scoped: their ids mean nothing outside it, and
    // holding GL textures for people who are gone is pure leak. An auto-
    // reconnect below simply re-receives what it needs on the next stroke.
    dropPeerAssets();
    // Server refused the join (locked room / full room) — don't retry in a loop.
    if (event && (event.code === 4001 || event.code === 4002)) {
        currentRoom = null; lastRoom = null;
        resetSettingsLock();
        resetTurnState(); // never leave turn gates on a client with no room
        history.replaceState(null, '', window.location.pathname + window.location.search);
        showMpError(event.code === 4001
            ? 'This room is locked — ask the host for an invite.'
            : 'That room is full.');
        showDisconnectedUI();
        return;
    }
    // Auto-reconnect if we still have a room
    if (currentRoom && reconnectAttempts < MAX_RECONNECT) {
        reconnectAttempts++;
        // Full jitter so clients don't reconnect in lockstep after a server blip.
        var base = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 8000);
        var delay = base / 2 + Math.random() * base / 2;
        updateMultiplayerStatus('Reconnecting (' + reconnectAttempts + ')...');
        reconnectTimer = setTimeout(doConnect, delay);
    } else if (currentRoom) {
        giveUpConnection('Lost connection to the room.');
    }
}

// Stop trying, remember the room, and offer a one-tap Reconnect.
function giveUpConnection(msg) {
    lastRoom = currentRoom;
    currentRoom = null;
    closeMatchmaking(); // drop any waiting pin — we're no longer in that room
    stopStrangerKeepAlive();
    // A watcher whose connection died must not stay gated (or banner-ed)
    // offline — they're back to painting alone now.
    resetSettingsLock();
    resetTurnState();
    showMpError(msg);
    showDisconnectedUI();
    var rc = document.getElementById('reconnectBtn');
    if (rc && lastRoom) rc.style.display = '';
}

function onMultiplayerError(error) {
    if (error && error.target && partySocket && error.target !== partySocket) return;
    console.error('Multiplayer error:', error);
}
