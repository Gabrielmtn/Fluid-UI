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
    const host = window.location.host;
    if (/\.partykit\.dev$/.test(host)) return host;
    return 'fluid-ui-multiplayer.gabrielmtn.partykit.dev';
})();

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

// "Paint with a stranger": ask the lobby to pair us 1:1 with another seeker,
// then connect to whatever room it hands back (a pub- room).
function paintWithStranger() {
    // Leave any current room/socket before matchmaking so we never leak one.
    if (partySocket || currentRoom) disconnectMultiplayer();
    hideMpError();
    closeMatchmaking();
    showMatchmaking();
    try {
        const isLocal = PARTYKIT_HOST.startsWith('localhost') || PARTYKIT_HOST.startsWith('127.0.0.1');
        const protocol = isLocal ? 'ws:' : 'wss:';
        const url = `${protocol}//${PARTYKIT_HOST}/parties/lobby/main?uid=${encodeURIComponent(DEVICE_UID)}`;
        matchmakingSocket = new WebSocket(url);
        var settled = false;
        var timeout = setTimeout(function() {
            if (settled) return;
            settled = true; closeMatchmaking();
            showMpError("Couldn't find a match. Try again."); showDisconnectedUI();
        }, 9000);
        matchmakingSocket.addEventListener('open', function() {
            if (matchmakingSocket) matchmakingSocket.send(JSON.stringify({ type: 'matchmake', uid: DEVICE_UID }));
        });
        matchmakingSocket.addEventListener('message', function(ev) {
            var data; try { data = JSON.parse(ev.data); } catch (_) { return; }
            if (data.type === 'matched') {
                settled = true; clearTimeout(timeout); closeMatchmaking();
                connectToRoom(data.roomId);
            } else if (data.type === 'matchmake-error') {
                settled = true; clearTimeout(timeout); closeMatchmaking();
                showMpError(data.message || 'Try again in a moment.'); showDisconnectedUI();
            }
        });
        matchmakingSocket.addEventListener('error', function() {
            if (settled) return;
            settled = true; clearTimeout(timeout); closeMatchmaking();
            showMpError("Couldn't reach matchmaking. Check your connection."); showDisconnectedUI();
        });
    } catch (e) {
        closeMatchmaking();
        showMpError("Couldn't start matchmaking."); showDisconnectedUI();
    }
}

function closeMatchmaking() {
    if (matchmakingSocket) {
        try { matchmakingSocket.close(); } catch (_) {}
        matchmakingSocket = null;
    }
}

// Host-only: toggle the room lock. The server confirms via a 'lock-state' broadcast.
function toggleLock() {
    if (!partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    partySocket.send(JSON.stringify({ type: 'lock', locked: !roomLocked }));
}

// ── 13.5 host settings lock ─────────────────────────────────────────
// Lock = visual parity: locked guests mirror the host's look-affecting
// settings (sliders/checkboxes/selects/arm colors via a filtered preset
// snapshot — the relay caps messages at 16KB so layers/masks/recordings
// never ride along). Performance-tier controls stay LOCAL on every
// client. Guests' local edits are gated at the slider-binding/preset
// choke points via window.__mpSettingsLocked.
var settingsLockOn = false;        // host's intent (host side only)
var settingsLockDebounce = null;
var hostMirrorInstalled = false;
window.__mpSettingsLocked = false; // guest-side gate (read by 05h/04b/12)
window.__mpApplyingRemote = false; // lets the host's snapshot through the gate

// Perf-tier + local-workflow controls that never ride the lock snapshot:
// resolution/governor/fps stay local (the governor's look-preserving
// ladder is the precedent), recording/stats/autoload are per-user UI.
var MP_PERF_LOCAL_KEYS = [
    'visualResolution', 'physicsResolution', 'fpsCap',
    'recMode', 'recPlaybackSpeed', 'statsToggle', 'autoloadSettings'
];

function captureLookSnapshot() {
    if (typeof window.capturePresetSnapshot !== 'function') return null;
    var full;
    try { full = window.capturePresetSnapshot(); } catch (_) { return null; }
    if (!full) return null;
    var snap = {
        version: full.version,
        sliders: full.sliders || {},
        checkboxes: {},
        selects: {},
        armColors: full.armColors || null
    };
    Object.keys(full.selects || {}).forEach(function (k) {
        if (MP_PERF_LOCAL_KEYS.indexOf(k) === -1) snap.selects[k] = full.selects[k];
    });
    Object.keys(full.checkboxes || {}).forEach(function (k) {
        if (MP_PERF_LOCAL_KEYS.indexOf(k) === -1) snap.checkboxes[k] = full.checkboxes[k];
    });
    return snap;
}

function broadcastSettingsLock() {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    var msg = { type: 'settings-lock', locked: settingsLockOn, timestamp: Date.now() };
    if (settingsLockOn) msg.snapshot = captureLookSnapshot();
    partySocket.send(JSON.stringify(msg));
}

// While locked, the host's live edits re-broadcast (debounced) so
// locked guests track them — "mirror every look-affecting setting"
function hostLockMirrorHandler() {
    if (!settingsLockOn) return;
    if (settingsLockDebounce) clearTimeout(settingsLockDebounce);
    settingsLockDebounce = setTimeout(broadcastSettingsLock, 400);
}
function installHostLockMirror() {
    if (hostMirrorInstalled) return;
    document.addEventListener('input', hostLockMirrorHandler, true);
    document.addEventListener('change', hostLockMirrorHandler, true);
    hostMirrorInstalled = true;
}
function removeHostLockMirror() {
    if (!hostMirrorInstalled) return;
    document.removeEventListener('input', hostLockMirrorHandler, true);
    document.removeEventListener('change', hostLockMirrorHandler, true);
    hostMirrorInstalled = false;
    if (settingsLockDebounce) { clearTimeout(settingsLockDebounce); settingsLockDebounce = null; }
}

function toggleSettingsLock() {
    settingsLockOn = !settingsLockOn;
    broadcastSettingsLock();
    if (settingsLockOn) installHostLockMirror(); else removeHostLockMirror();
    updateConnectedView();
}

// Guest side: enter/leave the locked state (banner + gate + mirror apply)
function setSettingsLockedByHost(locked, snapshot) {
    window.__mpSettingsLocked = !!locked;
    var banner = document.getElementById('mpSettingsLockBanner');
    if (locked) {
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'mpSettingsLockBanner';
            banner.textContent = '🔒 Settings locked by host';
            banner.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:10002;' +
                'padding:6px 14px;border-radius:8px;background:rgba(15,20,27,0.92);border:1px solid rgba(255,178,71,0.5);' +
                'color:#ffb347;font-size:12px;font-weight:600;pointer-events:none;';
            document.body.appendChild(banner);
        }
        if (snapshot && typeof window.applyPresetSnapshot === 'function') {
            isProcessingRemoteEvent = true;
            window.__mpApplyingRemote = true;
            try { window.applyPresetSnapshot(snapshot); }
            catch (e) { console.warn('settings-lock: snapshot apply failed', e); }
            finally { isProcessingRemoteEvent = false; window.__mpApplyingRemote = false; }
        }
    } else if (banner) {
        banner.remove();
    }
}

function resetSettingsLock() {
    settingsLockOn = false;
    removeHostLockMirror();
    setSettingsLockedByHost(false, null);
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
    resetSettingsLock();

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
    try {
        const isLocal = PARTYKIT_HOST.startsWith('localhost') || PARTYKIT_HOST.startsWith('127.0.0.1');
        const protocol = isLocal ? 'ws:' : 'wss:';
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

function disconnectMultiplayer() {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    closeMatchmaking();
    currentRoom = null;
    myRole = 'guest';
    roomLocked = false;
    resetSettingsLock();
    if (partySocket) {
        partySocket.close();
        partySocket = null;
    }
    isMultiplayerEnabled = false;
    connectedClients = 0;
    remoteCursors.clear();
    remoteLastPositions.clear();
    clearRemoteCursors();
    // Clear URL hash
    history.replaceState(null, '', window.location.pathname + window.location.search);
    showDisconnectedUI();
}

function onMultiplayerOpen(event) {
    console.log('Connected to multiplayer! Room:', currentRoom);
    if (partySocket && partySocket._connectTimeout) clearTimeout(partySocket._connectTimeout);
    isMultiplayerEnabled = true;
    reconnectAttempts = 0;
    // Sync the hidden toggle
    var toggle = document.getElementById('multiplayerToggle');
    if (toggle) toggle.checked = true;
    showConnectedUI();
}

function onMultiplayerMessage(event) {
    try {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'connected':
                clientId = data.clientId;
                connectedClients = data.totalClients;
                if (data.role) myRole = data.role;
                if (typeof data.locked === 'boolean') roomLocked = data.locked;
                updateConnectedView();
                break;

            case 'client-count':
                connectedClients = data.count;
                updateConnectedView();
                break;

            case 'lock-state':
                roomLocked = !!data.locked;
                updateConnectedView();
                break;

            case 'host-changed':
                myRole = (data.hostId === DEVICE_UID) ? 'host' : 'guest';
                // Promotion to host frees this client from any settings lock
                if (myRole === 'host') resetSettingsLock();
                updateConnectedView();
                break;

            case 'splat':
                // Receive splat from another client
                if (data.clientId !== clientId) {
                    handleRemoteSplat(data);
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
                // Another client cleared the canvas
                if (data.clientId !== clientId && typeof clearCanvas === 'function') {
                    clearCanvas();
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
                if (data.clientId !== clientId && myRole !== 'host') {
                    setSettingsLockedByHost(!!data.locked, data.snapshot || null);
                }
                break;
        }
    } catch (error) {
        console.error('Error handling multiplayer message:', error);
    }
}

function onMultiplayerClose(event) {
    console.log('Disconnected from multiplayer');
    isMultiplayerEnabled = false;
    clearRemoteCursors();
    // Server refused the join (locked room / full room) — don't retry in a loop.
    if (event && (event.code === 4001 || event.code === 4002)) {
        currentRoom = null; lastRoom = null;
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
    showMpError(msg);
    showDisconnectedUI();
    var rc = document.getElementById('reconnectBtn');
    if (rc && lastRoom) rc.style.display = '';
}

function onMultiplayerError(error) {
    console.error('Multiplayer error:', error);
}

function broadcastSplat(x, y, dx, dy, color, mult, radius) {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN || isProcessingRemoteEvent) {
        return;
    }

    const now = Date.now();
    if (broadcastSplat.lastSent && now - broadcastSplat.lastSent < 33) {
        return;
    }

    // 2.3 brush-size sync: broadcast the EFFECTIVE painted radius (splat-in
    // ramp / pressure), not the base config value the callers pass — the paint
    // path publishes it to __lastPaintRadius. Peers then see the size you
    // actually painted, matching the recording/replay fix.
    const effRadius = (typeof window.__lastPaintRadius === 'number' && window.__lastPaintRadius > 0)
        ? window.__lastPaintRadius : radius;

    partySocket.send(JSON.stringify({
        type: 'splat',
        data: { x, y, dx, dy, color, mult, radius: effRadius },
        timestamp: now
    }));
    broadcastSplat.lastSent = now;
}

function broadcastCursor(x, y) {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN || isProcessingRemoteEvent) {
        return;
    }

    if (!broadcastCursor.lastSent || Date.now() - broadcastCursor.lastSent > 50) {
        partySocket.send(JSON.stringify({
            type: 'cursor',
            data: { x, y },
            timestamp: Date.now()
        }));
        broadcastCursor.lastSent = Date.now();
    }
}

function broadcastPointerUp() {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN || isProcessingRemoteEvent) {
        return;
    }

    console.log('[Multiplayer] Broadcasting pointer-up');
    partySocket.send(JSON.stringify({
        type: 'pointer-up',
        timestamp: Date.now()
    }));
}

// Send clear event
function broadcastClear() {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN) {
        return;
    }

    partySocket.send(JSON.stringify({
        type: 'clear',
        timestamp: Date.now()
    }));
}

// Send preset change
function broadcastPreset(presetName) {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN || isProcessingRemoteEvent) {
        return;
    }

    partySocket.send(JSON.stringify({
        type: 'preset',
        data: { preset: presetName },
        timestamp: Date.now()
    }));
}

function handleRemoteSplat(data) {
    if (typeof splat === 'function') {
        const { x, y, dx, dy, color, mult, radius } = data.data;
        const canvasX = x * canvas.width;
        const canvasY = y * canvas.height;
        const canvasDx = dx * canvas.width;
        const canvasDy = dy * canvas.height;
        const normalizedRadius = (typeof radius === 'number' ? radius : undefined);

        if (!handleRemoteSplat._logged) {
            console.log('[Multiplayer] Remote splat settings:', { mult, radius, normalizedRadius, localMult: window.animationMultiplier, localRadius: window.config?.SPLAT_RADIUS });
            handleRemoteSplat._logged = true;
            setTimeout(() => { handleRemoteSplat._logged = false; }, 5000);
        }

        isProcessingRemoteEvent = true;
        try {
            const lastPos = remoteLastPositions.get(data.clientId);
            // Gap-fill between network messages at ~12px spacing (matching how
            // densely local mousemove events deposit dabs), splitting the
            // message's velocity across all dabs so total injected momentum
            // equals what the sender's stroke put in. The old loop splatted
            // every 2px (up to 30 dabs) EACH with full velocity — one message
            // injected ~30x the sender's energy and blew the velocity field
            // into fp16 static around remote strokes.
            let steps = 0;
            let distX = 0, distY = 0;
            if (lastPos && lastPos.x !== undefined && lastPos.y !== undefined) {
                distX = canvasX - lastPos.x;
                distY = canvasY - lastPos.y;
                const distance = Math.sqrt(distX * distX + distY * distY);
                if (distance > 12) {
                    steps = Math.min(Math.floor(distance / 12), 8);
                }
            }
            const stepDx = canvasDx / (steps + 1);
            const stepDy = canvasDy / (steps + 1);
            const applyOne = (px, py) => {
                if (typeof window.applyMultiSplatWith === 'function') {
                    window.applyMultiSplatWith(px, py, stepDx, stepDy, color || [1,0,0], mult || 1, normalizedRadius);
                } else {
                    splat(px, py, stepDx, stepDy, color || [1,0,0]);
                }
            };
            for (let i = 1; i <= steps; i++) {
                const t = i / (steps + 1);
                applyOne(lastPos.x + distX * t, lastPos.y + distY * t);
            }
            applyOne(canvasX, canvasY);
            
            remoteLastPositions.set(data.clientId, { x: canvasX, y: canvasY });
        } finally {
            isProcessingRemoteEvent = false;
        }
    }
}

// Broadcast a full stroke (array of normalized events).
// The party server silently DROPS messages over MAX_MESSAGE_BYTES (16KB,
// party/shared.ts) — which is why replay never reached peers: any decent
// stroke's JSON blows the cap. Quantize the numbers (≈halves the bytes)
// and chunk under the limit; the receiver reassembles by sid/seq (2026-07-13).
const STROKE_CHUNK_EVENTS = 80; // ~90 quantized bytes/event → ~7KB/chunk, wide margin
function broadcastReplayStroke(events) {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN) {
        return;
    }
    const q = (events || []).map(ev => ({
        t: Math.round(ev.t || 0),
        x: +(+ev.x || 0).toFixed(4),
        y: +(+ev.y || 0).toFixed(4),
        dx: +(+ev.dx || 0).toFixed(4),
        dy: +(+ev.dy || 0).toFixed(4),
        color: (ev.color || [1, 1, 1]).map(c => +(+c).toFixed(3)),
        mult: ev.mult || 1,
        radius: +(+ev.radius || 0.01).toFixed(5)
    }));
    if (q.length <= STROKE_CHUNK_EVENTS) {
        partySocket.send(JSON.stringify({ type: 'stroke', data: { events: q }, timestamp: Date.now() }));
        return;
    }
    const sid = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    const total = Math.ceil(q.length / STROKE_CHUNK_EVENTS);
    for (let i = 0; i < total; i++) {
        partySocket.send(JSON.stringify({
            type: 'stroke-chunk',
            data: { sid, seq: i, total, events: q.slice(i * STROKE_CHUNK_EVENTS, (i + 1) * STROKE_CHUNK_EVENTS) },
            timestamp: Date.now()
        }));
    }
}

// Reassembly of chunked stroke replays (see broadcastReplayStroke)
const strokeChunkBuffers = new Map(); // clientId|sid → { chunks, received, total, at }
function handleStrokeChunk(data) {
    const d = data.data || {};
    if (typeof d.seq !== 'number' || typeof d.total !== 'number' || !Array.isArray(d.events)) return;
    if (d.total < 1 || d.total > 64 || d.seq < 0 || d.seq >= d.total) return;
    const key = data.clientId + '|' + d.sid;
    let buf = strokeChunkBuffers.get(key);
    if (!buf) {
        buf = { chunks: new Array(d.total), received: 0, total: d.total, at: Date.now() };
        strokeChunkBuffers.set(key, buf);
    }
    if (!buf.chunks[d.seq]) {
        buf.chunks[d.seq] = d.events;
        buf.received++;
    }
    if (buf.received === buf.total) {
        strokeChunkBuffers.delete(key);
        const all = [].concat.apply([], buf.chunks);
        if (typeof window.scheduleStrokeReplay === 'function') window.scheduleStrokeReplay(all);
    }
    // GC stale partial buffers (peer left mid-stroke)
    const now = Date.now();
    strokeChunkBuffers.forEach((b, k) => { if (now - b.at > 15000) strokeChunkBuffers.delete(k); });
}

function handleRemoteCursor(data) {
    const { x, y } = data.data;
    remoteCursors.set(data.clientId, { x, y, timestamp: data.timestamp });
    updateRemoteCursors();
}

function handleRemotePointerUp(data) {
    console.log('[Multiplayer] Received pointer-up from client:', data.clientId);
    const cursor = remoteCursors.get(data.clientId);
    if (cursor) {
        cursor.pointerDown = false;
    }
    remoteLastPositions.delete(data.clientId);
}

// Stable per-user identity derived from the clientId (no coordination needed)
function hashId(id) {
    var h = 0, s = String(id);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}
function colorForClient(id) {
    return 'hsl(' + (hashId(id) % 360) + ', 80%, 62%)';
}
function shortName(id) {
    var s = String(id).replace(/[^a-zA-Z0-9]/g, '');
    return 'Artist-' + (s.slice(-2).toUpperCase() || '??');
}

// Update remote cursor display
function updateRemoteCursors() {
    // Remove old cursors (older than 5 seconds)
    const now = Date.now();
    for (const [id, cursor] of remoteCursors.entries()) {
        if (now - cursor.timestamp > 5000) {
            remoteCursors.delete(id);
            // A peer that vanished mid-drag never sends pointer-up, so their
            // last-position entry would otherwise outlive them forever.
            remoteLastPositions.delete(id);
        }
    }

    // Clear existing remote cursors
    clearRemoteCursors();

    // Create cursor elements for each remote client (distinct per-user color + label)
    for (const [id, cursor] of remoteCursors.entries()) {
        const col = colorForClient(id);
        let cursorEl = document.getElementById(`remote-cursor-${id}`);
        if (!cursorEl) {
            cursorEl = document.createElement('div');
            cursorEl.id = `remote-cursor-${id}`;
            cursorEl.className = 'remote-cursor';
            cursorEl.style.cssText = 'position:absolute;width:12px;height:12px;border-radius:50%;' +
                'border:2px solid rgba(255,255,255,0.85);pointer-events:none;z-index:1000;' +
                'transform:translate(-50%,-50%);transition:left 0.05s, top 0.05s;';
            cursorEl.style.backgroundColor = col;
            cursorEl.style.boxShadow = '0 0 8px ' + col;
            const label = document.createElement('span');
            label.className = 'remote-cursor-label';
            label.textContent = shortName(id);
            label.style.color = col;
            cursorEl.appendChild(label);
            canvasWrapper.appendChild(cursorEl);
        }

        // Update position (x and y are normalized 0-1)
        cursorEl.style.left = `${cursor.x * 100}%`;
        cursorEl.style.top = `${cursor.y * 100}%`;
    }
}

// Clear all remote cursors
function clearRemoteCursors() {
    const cursors = document.querySelectorAll('.remote-cursor');
    cursors.forEach(cursor => cursor.remove());
}

// Update multiplayer status in UI
function updateMultiplayerStatus(status) {
    const statusEl = document.getElementById('multiplayerStatus');
    if (statusEl) {
        statusEl.textContent = status;
    }
}

// ─── UI helpers ───
function setShown(id, shown) {
    var el = document.getElementById(id);
    if (el) el.style.display = shown ? '' : 'none';
}

// Shown while the lobby is pairing us with a stranger (before we have a room).
function showMatchmaking() {
    setShown('mpDisconnected', false);
    setShown('mpConnected', true);
    var dot = document.getElementById('connectionDot');
    if (dot) dot.className = 'mp-dot mp-dot-connecting';
    updateMultiplayerStatus('🎲 Finding a stranger…');
    ['roomDisplay', 'shareHint', 'copyRoomBtn', 'lockRoomBtn', 'lockBadge'].forEach(function(id) { setShown(id, false); });
}

function showConnecting() {
    setShown('mpDisconnected', false);
    setShown('mpConnected', true);
    var dot = document.getElementById('connectionDot');
    if (dot) dot.className = 'mp-dot mp-dot-connecting';
    updateMultiplayerStatus(isStrangerRoom() ? '🎲 Finding a stranger…' : 'Connecting…');
    setShown('roomDisplay', !isStrangerRoom());
    var roomEl = document.getElementById('roomName');
    if (roomEl && !isStrangerRoom()) roomEl.textContent = currentRoom || '------';
}

function showConnectedUI() {
    setShown('mpDisconnected', false);
    setShown('mpConnected', true);
    var dot = document.getElementById('connectionDot');
    if (dot) dot.className = 'mp-dot mp-dot-connected';
    updateConnectedView();
}

// Single source of truth for the connected panel: adapts to room kind (stranger
// vs private), participant count, host role, and lock state.
function updateConnectedView() {
    var stranger = isStrangerRoom();
    var isHost = myRole === 'host';

    if (stranger) {
        updateMultiplayerStatus(connectedClients < 2 ? '🎲 Waiting for a stranger…' : '🎨 Painting with a stranger');
    } else {
        updateMultiplayerStatus(roomLocked ? '🔒 Room locked' : 'Connected');
    }

    // Room code / share / copy: private rooms only (you can't invite to a 1:1 pairing).
    setShown('roomDisplay', !stranger);
    setShown('shareHint', !stranger);
    setShown('copyRoomBtn', !stranger);
    var roomEl = document.getElementById('roomName');
    if (roomEl && !stranger) roomEl.textContent = currentRoom || '------';

    // Lock toggle: only the host of a private room sees it.
    var lockBtn = document.getElementById('lockRoomBtn');
    if (lockBtn) {
        var canLock = !stranger && isHost;
        lockBtn.style.display = canLock ? '' : 'none';
        lockBtn.textContent = roomLocked ? '🔓 Unlock room' : '🔒 Lock room';
    }
    // Settings lock (13.5): any host can lock look settings (incl. stranger rooms).
    var sLockBtn = document.getElementById('settingsLockBtn');
    if (sLockBtn) {
        sLockBtn.style.display = isHost ? '' : 'none';
        sLockBtn.textContent = settingsLockOn ? '🎛 Unlock settings' : '🎛 Lock settings';
        sLockBtn.classList.toggle('active', settingsLockOn);
    }
    // Locked badge: non-host members see why no one else can join.
    setShown('lockBadge', !stranger && roomLocked && !isHost);

    updateUsersDisplay();
}

function showDisconnectedUI() {
    var dc = document.getElementById('mpDisconnected');
    var cn = document.getElementById('mpConnected');
    if (dc) dc.style.display = '';
    if (cn) cn.style.display = 'none';
    var toggle = document.getElementById('multiplayerToggle');
    if (toggle) toggle.checked = false;
    // Reconnect button only appears after a give-up (giveUpConnection re-shows it)
    var rc = document.getElementById('reconnectBtn');
    if (rc) rc.style.display = 'none';
}

function updateUsersDisplay() {
    var el = document.getElementById('connectedUsers');
    if (el) el.textContent = connectedClients + (connectedClients === 1 ? ' user' : ' users');
}

function showMpError(msg) {
    var el = document.getElementById('mpError');
    if (el) { el.textContent = msg; el.style.display = ''; }
}
function hideMpError() {
    var el = document.getElementById('mpError');
    if (el) el.style.display = 'none';
}

// Copy just the room # to the clipboard (the only thing a friend needs).
function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
}
function copyRoomCode(fromCreate) {
    if (!currentRoom) return;
    var code = currentRoom;
    var flash = function () {
        var btn = document.getElementById('copyRoomBtn');
        if (!btn) return;
        btn.textContent = fromCreate ? '✓ Copied — send it!' : '✓ Copied!';
        setTimeout(function () { btn.textContent = '📋 Copy #'; }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(flash).catch(function () { fallbackCopy(code); flash(); });
    } else {
        fallbackCopy(code); flash();
    }
}

// Initialize multiplayer UI + auto-join from hash
function initMultiplayerUI() {
    // Wire up buttons
    var createBtn = document.getElementById('createRoomBtn');
    if (createBtn) createBtn.addEventListener('click', createRoom);

    var joinBtn = document.getElementById('joinRoomBtn');
    var joinInput = document.getElementById('joinRoomInput');
    if (joinBtn) joinBtn.addEventListener('click', function() { joinRoom(joinInput ? joinInput.value : ''); });
    if (joinInput) {
        // Type or paste a # (or a link/hash) → clean it and auto-join the moment
        // it's a full 6-char code. No separate Join click needed.
        joinInput.addEventListener('input', function() {
            var room = extractRoomCode(joinInput.value);
            if (joinInput.value !== room) joinInput.value = room;
            if (room.length === 6 && room !== currentRoom) joinRoom(room);
        });
        joinInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') joinRoom(joinInput.value); });
        joinInput.addEventListener('focus', function() { joinInput.select(); });
    }

    var copyBtn = document.getElementById('copyRoomBtn');
    if (copyBtn) copyBtn.addEventListener('click', function() { copyRoomCode(false); });

    var reconnectBtn = document.getElementById('reconnectBtn');
    if (reconnectBtn) reconnectBtn.addEventListener('click', function() {
        if (!lastRoom) return;
        reconnectBtn.style.display = 'none';
        hideMpError();
        connectToRoom(lastRoom);
    });

    var discBtn = document.getElementById('disconnectBtn');
    if (discBtn) discBtn.addEventListener('click', disconnectMultiplayer);

    var strangerBtn = document.getElementById('strangerBtn');
    if (strangerBtn) strangerBtn.addEventListener('click', paintWithStranger);

    var lockBtn = document.getElementById('lockRoomBtn');
    if (lockBtn) lockBtn.addEventListener('click', toggleLock);

    var sLockBtn = document.getElementById('settingsLockBtn');
    if (sLockBtn) sLockBtn.addEventListener('click', toggleSettingsLock);

    // Auto-join if URL has room hash
    var hashRoom = getRoomFromHash();
    if (hashRoom && hashRoom !== 'DEFAULT-ROOM') {
        connectToRoom(hashRoom);
    }
}

// Expose globals
window.isProcessingRemoteEvent = function() { return isProcessingRemoteEvent; };
window.broadcastSplat = broadcastSplat;
window.broadcastCursor = broadcastCursor;
window.broadcastPointerUp = broadcastPointerUp;
window.broadcastClear = broadcastClear;
window.broadcastPreset = broadcastPreset;
window.broadcastReplayStroke = broadcastReplayStroke;
window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.paintWithStranger = paintWithStranger;
window.toggleLock = toggleLock;
window.copyRoomCode = copyRoomCode;
window.disconnectMultiplayer = disconnectMultiplayer;

console.log('Multiplayer module loaded. PartyKit host:', PARTYKIT_HOST);

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMultiplayerUI);
} else {
    initMultiplayerUI();
}
