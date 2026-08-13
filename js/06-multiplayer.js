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
var STRANGER_KEEPALIVE_MS = 45000; // comfortably inside the server's 60s TTL

function stopStrangerKeepAlive() {
    if (strangerKeepAlive) { clearInterval(strangerKeepAlive); strangerKeepAlive = null; }
}

function startStrangerKeepAlive() {
    stopStrangerKeepAlive();
    strangerKeepAlive = setInterval(function () {
        // Only while genuinely alone in a stranger room.
        if (!isStrangerRoom() || connectedClients >= 2 || !partySocket || partySocket.readyState !== WebSocket.OPEN) {
            stopStrangerKeepAlive();
            return;
        }
        var mine = currentRoom;
        try {
            var isLocal = PARTYKIT_HOST.startsWith('localhost') || PARTYKIT_HOST.startsWith('127.0.0.1');
            var proto = isLocal ? 'ws' : 'wss';
            var ws = new WebSocket(proto + '://' + PARTYKIT_HOST + '/parties/lobby/main?uid=' + encodeURIComponent(DEVICE_UID));
            var done = false;
            var bail = setTimeout(function () { if (!done) { done = true; try { ws.close(); } catch (_) {} } }, 8000);
            ws.addEventListener('open', function () {
                ws.send(JSON.stringify({ type: 'matchmake', uid: DEVICE_UID }));
            });
            ws.addEventListener('message', function (ev) {
                if (done) return;
                var d; try { d = JSON.parse(ev.data); } catch (_) { return; }
                if (d.type !== 'matched') return;      // 'One moment…' throttle: just retry next tick
                done = true; clearTimeout(bail);
                try { ws.close(); } catch (_) {}
                // Still alone, and the lobby put someone else's room forward → join them.
                if (d.roomId && d.roomId !== mine && isStrangerRoom() && connectedClients < 2) {
                    stopStrangerKeepAlive();
                    connectToRoom(d.roomId);
                }
            });
            ws.addEventListener('error', function () { done = true; clearTimeout(bail); });
        } catch (_) { /* transient network — try again next tick */ }
    }, STRANGER_KEEPALIVE_MS);
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
    // lookOnly: skips layer/mask/branding/recording serialization — those do
    // GPU readbacks + dataURL encodes, far too heavy for mirror re-broadcasts
    try { full = window.capturePresetSnapshot({ lookOnly: true }); } catch (_) { return null; }
    if (!full) return null;
    // 2026-08-06: the lock used to send ONLY sliders/checkboxes/selects (+arm
    // colors, which the guest sanitizer then stripped as nested objects) —
    // background color, palette, kaleidoscope, lighting and stroke dynamics
    // all silently dropped, so a locked guest looked noticeably different
    // from the host. Mirror every look section applyPresetSnapshot knows.
    var snap = {
        version: full.version,
        sliders: {},
        checkboxes: {},
        selects: {},
        colors: full.colors || null,
        kaleido: full.kaleido || null,
        paletteIndex: (typeof full.paletteIndex === 'number') ? full.paletteIndex : null,
        paletteName: full.paletteName || null,
        savedColors: full.savedColors || null,
        userPalettes: full.userPalettes || null,
        lightPos: full.lightPos || null,
        lightShiftPath: full.lightShiftPath || null,
        brushState: full.brushState || null,
        ssOrigin: full.ssOrigin || null,
        armColors: full.armColors || null
    };
    Object.keys(full.sliders || {}).forEach(function (k) {
        if (MP_PERF_LOCAL_KEYS.indexOf(k) === -1) snap.sliders[k] = full.sliders[k];
    });
    Object.keys(full.selects || {}).forEach(function (k) {
        if (MP_PERF_LOCAL_KEYS.indexOf(k) === -1) snap.selects[k] = full.selects[k];
    });
    Object.keys(full.checkboxes || {}).forEach(function (k) {
        if (MP_PERF_LOCAL_KEYS.indexOf(k) === -1) snap.checkboxes[k] = full.checkboxes[k];
    });
    return snap;
}

var settingsLockLastSent = ''; // last snapshot JSON the host broadcast (poll diff gate)
function broadcastSettingsLock() {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    var msg = { type: 'settings-lock', locked: settingsLockOn, timestamp: Date.now() };
    if (settingsLockOn) {
        var snap = captureLookSnapshot();
        // Diff gate records the PRE-shed JSON (the poll compares fresh
        // unshedded captures against this — post-shed it would never match
        // an oversize snapshot and the poll would re-send every tick).
        try { settingsLockLastSent = JSON.stringify(snap || null); } catch (_) { settingsLockLastSent = ''; }
        // Relay caps messages at 16KB — shed bulky optional sections before
        // sending, or the whole lock update silently never arrives.
        if (snap) {
            try {
                ['userPalettes', 'savedColors', 'lightShiftPath'].forEach(function (k) {
                    if (JSON.stringify(snap).length > 14000) delete snap[k];
                });
            } catch (_) {}
        }
        msg.snapshot = snap;
    }
    partySocket.send(JSON.stringify(msg));
}

// Take-turns twin of broadcastSettingsLock: the current painter's look rides a
// 'turn-look' message (the relay only forwards it from the turn holder).
function broadcastTurnLook() {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    var snap = captureLookSnapshot();
    // Same pre-shed diff gate as the settings lock (shared with the poll).
    try { settingsLockLastSent = JSON.stringify(snap || null); } catch (_) { settingsLockLastSent = ''; }
    if (snap) {
        try {
            ['userPalettes', 'savedColors', 'lightShiftPath'].forEach(function (k) {
                if (JSON.stringify(snap).length > 14000) delete snap[k];
            });
        } catch (_) {}
    }
    partySocket.send(JSON.stringify({ type: 'turn-look', snapshot: snap, timestamp: Date.now() }));
}

// The look mirror serves two features: the 13.5 host settings lock, and
// take-turns mode (the current painter's look mirrors to every watcher).
// Exactly one can be live at a time — turns supersede the host lock.
function mirrorActive() {
    if (turnsOn) return isMyTurn() ? 'turn' : null;
    return settingsLockOn ? 'lock' : null;
}
function broadcastLookMirror() {
    var m = mirrorActive();
    if (m === 'lock') broadcastSettingsLock();
    else if (m === 'turn') broadcastTurnLook();
}
// While mirroring, live edits re-broadcast (debounced) so the watching side
// tracks them — "mirror every look-affecting setting"
function hostLockMirrorHandler() {
    if (!mirrorActive()) return;
    if (settingsLockDebounce) clearTimeout(settingsLockDebounce);
    settingsLockDebounce = setTimeout(broadcastLookMirror, 400);
}
var settingsLockPoll = null;
function installHostLockMirror() {
    if (hostMirrorInstalled) return;
    document.addEventListener('input', hostLockMirrorHandler, true);
    document.addEventListener('change', hostLockMirrorHandler, true);
    // Catch-all poll (2026-08-06): plenty of look changes never fire
    // input/change — palette swatch clicks, preset loads, light-source
    // drags, kaleido buttons, Mutate. Diff-gated so a quiet host sends
    // nothing; captureLookSnapshot is the cheap lookOnly capture.
    settingsLockPoll = setInterval(function () {
        if (!mirrorActive()) return;
        var j;
        try { j = JSON.stringify(captureLookSnapshot() || null); } catch (_) { return; }
        if (j !== settingsLockLastSent) hostLockMirrorHandler();
    }, 2000);
    hostMirrorInstalled = true;
}
function removeHostLockMirror() {
    if (!hostMirrorInstalled) return;
    document.removeEventListener('input', hostLockMirrorHandler, true);
    document.removeEventListener('change', hostLockMirrorHandler, true);
    hostMirrorInstalled = false;
    if (settingsLockDebounce) { clearTimeout(settingsLockDebounce); settingsLockDebounce = null; }
    if (settingsLockPoll) { clearInterval(settingsLockPoll); settingsLockPoll = null; }
}
// Install/remove the mirror to match whichever feature currently needs it.
function syncLookMirror() {
    if (mirrorActive()) installHostLockMirror(); else removeHostLockMirror();
}

function toggleSettingsLock() {
    settingsLockOn = !settingsLockOn;
    broadcastSettingsLock();
    syncLookMirror();
    updateConnectedView();
}

// A settings-lock snapshot arrives from an untrusted peer (the relay forwards
// unrecognized messages verbatim and only gates type:"lock" on host). The
// feature only needs the LOOK — sliders/checkboxes/selects/colors — so strip
// everything that carries file data or names, which would otherwise reach the
// layer/mask/recording/path panels and their innerHTML templates.
// Key names must match capturePresetSnapshot's real output (2026-08-06: the
// old list said 'brush'/'lightSource'/'lightShift', which exist nowhere in
// the preset — those sections could never arrive even if sent).
var LOCK_SNAPSHOT_ALLOW = ['sliders', 'checkboxes', 'selects', 'colors', 'savedColors',
    'paletteIndex', 'paletteName', 'armColors', 'brushState', 'lightPos',
    'lightShiftPath', 'kaleido', 'userPalettes', 'ssOrigin'];
// Bounded recursive clean: primitives-only leaves (no data: URLs, strings
// capped), depth ≤ 3 so armColors [{mode,color}], lightShiftPath waypoints
// and userPalettes [{name, colors: [...]}] survive — the old one-level rule
// stripped every array-of-objects section to empty.
function cleanLockValue(v, depth) {
    var t = typeof v;
    if (v === null || t === 'number' || t === 'boolean') return v;
    if (t === 'string') return (v.length <= 64 && !/^data:/i.test(v)) ? v : undefined;
    if (t !== 'object' || depth >= 3) return undefined;
    var clean = Array.isArray(v) ? [] : {};
    Object.keys(v).forEach(function (kk) {
        var vv = cleanLockValue(v[kk], depth + 1);
        if (vv === undefined) return;
        if (Array.isArray(clean)) clean.push(vv); else clean[kk] = vv;
    });
    return clean;
}
function sanitizeLockSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    var out = {};
    LOCK_SNAPSHOT_ALLOW.forEach(function (k) {
        if (!(k in snapshot)) return;
        var v = cleanLockValue(snapshot[k], 0);
        if (v !== undefined) out[k] = v;
    });
    // Relay caps messages at 16KB — shed the bulkiest optional sections
    // rather than letting the whole snapshot fail to arrive.
    try {
        ['userPalettes', 'savedColors', 'lightShiftPath'].forEach(function (k) {
            if (JSON.stringify(out).length > 14000) delete out[k];
        });
    } catch (_) {}
    return out;
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
        applyRemoteLookSnapshot(snapshot);
    } else if (banner) {
        banner.remove();
    }
}

// Sanitize + apply a look snapshot from an untrusted peer (settings lock or
// take-turns mirror — both ride the same capture/sanitize/apply pipeline).
function applyRemoteLookSnapshot(snapshot) {
    var safeSnap = sanitizeLockSnapshot(snapshot);
    if (safeSnap && typeof window.applyPresetSnapshot === 'function') {
        isProcessingRemoteEvent = true;
        window.__mpApplyingRemote = true;
        try { window.applyPresetSnapshot(safeSnap); }
        catch (e) { console.warn('look mirror: snapshot apply failed', e); }
        finally { isProcessingRemoteEvent = false; window.__mpApplyingRemote = false; }
    }
}

function resetSettingsLock() {
    settingsLockOn = false;
    syncLookMirror(); // keeps the turn mirror alive if we're the current painter
    setSettingsLockedByHost(false, null);
}

// ── Take-turns mode ─────────────────────────────────────────────────
// No points, no timer — the brush just passes around the room. While it's not
// your turn, painting/clear are gated (05d/04f read __mpTurnBlocked), your look
// settings are driven by the painter (same __mpSettingsLocked gate as 13.5),
// and the painter's edits arrive as 'turn-look' snapshots. When the brush
// reaches you, you inherit the canvas and settings as they stand — like
// picking up the brush at a shared easel.
function isMyTurn() { return turnsOn && !!turnHolderId && turnHolderId === clientId; }

// Re-derive the two gates from the current turn state (also called after code
// paths that clear __mpSettingsLocked wholesale, e.g. a host promotion).
function syncTurnGates() {
    if (turnsOn) {
        window.__mpTurnBlocked = !isMyTurn();
        window.__mpSettingsLocked = !isMyTurn();
    } else {
        window.__mpTurnBlocked = false;
        // The watcher gate dies with the mode. Any pre-turns 13.5 host lock
        // was already superseded when turns switched on (the relay refuses
        // 'settings-lock' while turns run), so nothing legitimate is cleared
        // — without this, a watcher's settings stayed locked forever after
        // the host turned turns off.
        window.__mpSettingsLocked = false;
    }
}

function applyTurnState(wasMyTurn) {
    if (turnsOn) {
        // Turns supersede the 13.5 settings lock on both ends: the host's lock
        // intent drops (the relay refuses 'settings-lock' while turns run) and
        // any guest-side locked banner/gate is replaced by the turn state.
        settingsLockOn = false;
        setSettingsLockedByHost(false, null);
    }
    // The brush was taken from us mid-stroke (a host Skip or a pass racing
    // our drag): end the live stroke NOW. The relay already drops our splats,
    // so anything we kept painting locally would exist on no other canvas.
    if (wasMyTurn && !isMyTurn() && window.pointer && window.pointer.down) {
        try { if (typeof broadcastPointerUp === 'function') broadcastPointerUp(); } catch (_) {}
        window.pointer.down = false;
        window.pointer.moved = false;
        _dabQueue.length = 0;
        if (window.BrushEngine && window.BrushEngine.isActive()) window.BrushEngine.abort();
    }
    syncTurnGates();
    syncLookMirror();
    // Whenever we hold the brush on a rotation update, (re)send our look:
    // gaining the brush snaps every watcher from the previous painter to us,
    // and a join/leave/pass resync catches late joiners who would otherwise
    // keep their own look until our next edit.
    if (isMyTurn()) broadcastTurnLook();
    updateConnectedView();
}

function resetTurnState() {
    turnsOn = false;
    turnHolderId = null;
    turnOrder = [];
    syncTurnGates(); // clears BOTH gates (turnsOn is false)
    syncLookMirror();
    var banner = document.getElementById('mpTurnBanner');
    if (banner) banner.remove();
}

// Fixed banner while turns are running (mirrors the settings-lock banner).
function updateTurnBanner() {
    var banner = document.getElementById('mpTurnBanner');
    if (!turnsOn || !isMultiplayerEnabled) {
        if (banner) banner.remove();
        return;
    }
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'mpTurnBanner';
        banner.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:10002;' +
            'padding:6px 14px;border-radius:8px;background:rgba(15,20,27,0.92);' +
            'font-size:12px;font-weight:600;pointer-events:none;';
        document.body.appendChild(banner);
    }
    if (isMyTurn()) {
        banner.textContent = '🖌 Your turn — everyone sees your settings';
        banner.style.border = '1px solid rgba(63,185,80,0.55)';
        banner.style.color = '#3fb950';
    } else if (turnHolderId) {
        banner.textContent = '👀 ' + shortName(turnHolderId) + ' is painting — your settings mirror theirs';
        banner.style.border = '1px solid rgba(255,178,71,0.5)';
        banner.style.color = '#ffb347';
    } else {
        banner.textContent = '⏳ Waiting for the next painter…';
        banner.style.border = '1px solid rgba(255,178,71,0.5)';
        banner.style.color = '#ffb347';
    }
}

// Panel widgets: the host's Take turns toggle, the rotation status line, and
// the Pass/Skip button (painter passes; host can skip an AFK painter).
function updateTurnUI() {
    updateTurnBanner();
    var isHost = myRole === 'host';
    var tBtn = document.getElementById('turnsBtn');
    if (tBtn) {
        tBtn.style.display = isHost ? '' : 'none';
        tBtn.textContent = turnsOn ? '🔁 Stop taking turns' : '🔁 Take turns';
        tBtn.classList.toggle('active', turnsOn);
    }
    var pBtn = document.getElementById('turnPassBtn');
    if (pBtn) {
        var showPass = turnsOn && (isMyTurn() || isHost);
        pBtn.style.display = showPass ? '' : 'none';
        pBtn.textContent = isMyTurn() ? '➡ Pass turn' : '⏭ Skip turn';
    }
    var tStat = document.getElementById('turnStatus');
    if (tStat) {
        if (!turnsOn) {
            tStat.style.display = 'none';
        } else {
            tStat.style.display = '';
            var n = turnOrder.length;
            var who = isMyTurn() ? '🖌 Your turn' : (turnHolderId ? '🖌 ' + shortName(turnHolderId) + ' painting' : '⏳ Waiting');
            tStat.textContent = who + ' · ' + n + (n === 1 ? ' artist' : ' artists') + ' in rotation';
            tStat.classList.toggle('mp-turn-you', isMyTurn());
        }
    }
}

function toggleTurns() {
    if (!partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    partySocket.send(JSON.stringify({ type: 'turns', on: !turnsOn }));
}

function passTurn() {
    if (!partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    partySocket.send(JSON.stringify({ type: 'turn-pass' }));
}

// Throttled "not your turn" toast, fired from the gated paint/clear paths.
var _turnHintAt = 0;
var _turnHintTimer = null;
window.__mpTurnHint = function () {
    var now = Date.now();
    if (now - _turnHintAt < 1500) return;
    _turnHintAt = now;
    var el = document.getElementById('mpTurnHint');
    if (!el) {
        el = document.createElement('div');
        el.id = 'mpTurnHint';
        el.style.cssText = 'position:fixed;top:44px;left:50%;transform:translateX(-50%);z-index:10002;' +
            'padding:6px 14px;border-radius:8px;background:rgba(15,20,27,0.92);border:1px solid rgba(122,162,255,0.5);' +
            'color:#9db8ff;font-size:12px;font-weight:600;pointer-events:none;transition:opacity 0.3s;';
        document.body.appendChild(el);
    }
    el.textContent = turnHolderId ? ('🖌 It\'s ' + shortName(turnHolderId) + '\'s turn') : '⏳ Waiting for the next painter…';
    el.style.opacity = '1';
    if (_turnHintTimer) clearTimeout(_turnHintTimer);
    _turnHintTimer = setTimeout(function () { el.style.opacity = '0'; }, 1400);
};

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
    stopStrangerKeepAlive();
    _dabQueue.length = 0; // never carry one room's dabs into the next
    currentRoom = null;
    myRole = 'guest';
    roomLocked = false;
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
    // Clear URL hash
    history.replaceState(null, '', window.location.pathname + window.location.search);
    showDisconnectedUI();
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
                connectedClients = data.count;
                updateConnectedView();
                break;

            case 'lock-state':
                roomLocked = !!data.locked;
                updateConnectedView();
                break;

            case 'host-changed':
                myRole = (data.hostId === DEVICE_UID) ? 'host' : 'guest';
                // Promotion to host frees this client from any settings lock —
                // but NOT from the turn gates (a promoted watcher still waits
                // for the brush), so re-derive those after the reset.
                if (myRole === 'host') { resetSettingsLock(); syncTurnGates(); }
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
                // Another client cleared the canvas. clearCanvas() itself calls
                // broadcastClear(), so without this guard every received clear
                // re-broadcasts and the wipe ping-pongs between clients forever
                // (same class of bug as the preset loop below).
                if (data.clientId !== clientId && typeof clearCanvas === 'function') {
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
                applyTurnState(wasMyTurn);
                break;
            }

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
    isMultiplayerEnabled = false;
    clearRemoteCursors();
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

// 1.3 parity fix: broadcast the ACTUAL BrushEngine dab train instead of one
// sampled splat per 33ms. The old path made the peer reconstruct a stroke it
// never saw: it gap-filled positions and divided ONE message's velocity across
// them (stepDx = canvasDx/(steps+1)). Total momentum matched, but vorticity is
// nonlinear in the velocity gradient — many weak impulses curl far less than
// the few strong ones the painter actually applied, so the painter saw
// filaments and the peer saw a diffuse blob.
//
// Two invariants make the peer's simulation identical to the painter's:
//   * position rides normalized (canvases differ in size, the artwork doesn't)
//   * velocity rides ABSOLUTE and is applied verbatim — splat() injects dx
//     straight into the velocity field (05i:122), and that field lives on the
//     sim grid, which is derived from base resolution + aspect, NOT from canvas
//     pixels. Rescaling by the receiver's width (the old dx * canvas.width) was
//     what made window size change the physics.
//
// Dabs accumulate and flush on a timer — batched, never dropped, so no sample
// is lost the way the old 33ms throttle lost them.
var _dabQueue = [];
var _dabFlushAt = 0;
var DAB_FLUSH_MS = 33;
var DAB_MAX_PER_MSG = 96; // ~30 bytes/dab quantized — far under the 16KB relay cap

function queueDab(xNorm, yNorm, dxAbs, dyAbs, radius) {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN || isProcessingRemoteEvent) return;
    _dabQueue.push([
        +xNorm.toFixed(4), +yNorm.toFixed(4),
        +dxAbs.toFixed(3), +dyAbs.toFixed(3),
        +(radius || 0).toFixed(5)
    ]);
    if (_dabQueue.length >= DAB_MAX_PER_MSG) flushDabs(null, 1, true);
}

function flushDabs(color, mult, force) {
    if (!_dabQueue.length) return;
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN || isProcessingRemoteEvent) {
        _dabQueue.length = 0;
        return;
    }
    var now = Date.now();
    if (!force && now - _dabFlushAt < DAB_FLUSH_MS) return;
    _dabFlushAt = now;
    var dabs = _dabQueue.splice(0, DAB_MAX_PER_MSG);
    var last = dabs[dabs.length - 1];
    // Legacy fields mirror the final dab in the OLD wire units (normalized
    // velocity), so a client running the previous build still renders this
    // stroke through its existing path instead of seeing nothing.
    partySocket.send(JSON.stringify({
        type: 'splat',
        data: {
            x: last[0], y: last[1],
            dx: +(last[2] / Math.max(1, canvas.width)).toFixed(5),
            dy: +(last[3] / Math.max(1, canvas.height)).toFixed(5),
            color: color || window.__mpLastDabColor || [1, 0, 0],
            mult: mult || 1,
            radius: last[4] || undefined,
            dabs: dabs
        },
        timestamp: now
    }));
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
    // Push the stroke's tail dabs before the peer is told the stroke ended,
    // or the last sub-flush-interval dabs would be stranded in the queue.
    flushDabs(window.__mpLastDabColor, 1, true);

    console.log('[Multiplayer] Broadcasting pointer-up');
    partySocket.send(JSON.stringify({
        type: 'pointer-up',
        timestamp: Date.now()
    }));
}

// Send clear event
function broadcastClear() {
    // isProcessingRemoteEvent: never echo a clear we are applying on behalf of
    // a peer (matches broadcastSplat/broadcastPreset — this one was missing it).
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN || isProcessingRemoteEvent) {
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
            // 1.3 parity path: the sender's real dab train. Each dab is applied
            // with ITS OWN full velocity, verbatim — no gap-fill invention and
            // no dividing one message's momentum across guessed positions. This
            // is what makes the peer's curl match the painter's.
            const dabs = data.data.dabs;
            if (Array.isArray(dabs) && dabs.length) {
                for (let i = 0; i < dabs.length; i++) {
                    const d = dabs[i];
                    const px = d[0] * canvas.width;
                    const py = d[1] * canvas.height;
                    const r = (typeof d[4] === 'number' && d[4] > 0) ? d[4] : normalizedRadius;
                    if (typeof window.applyMultiSplatWith === 'function') {
                        window.applyMultiSplatWith(px, py, d[2], d[3], color || [1, 0, 0], mult || 1, r);
                    } else {
                        splat(px, py, d[2], d[3], color || [1, 0, 0]);
                    }
                }
                const lastD = dabs[dabs.length - 1];
                remoteLastPositions.set(data.clientId, { x: lastD[0] * canvas.width, y: lastD[1] * canvas.height });
                return;
            }

            // Legacy path — a peer on the previous build, or the press stamp.
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
        var alone = connectedClients < 2;
        updateMultiplayerStatus(alone ? '🎲 Waiting for a stranger…' : '🎨 Painting with a stranger');
        // Hold our matchmaking slot while alone; drop it the moment we pair.
        if (alone) { if (!strangerKeepAlive) startStrangerKeepAlive(); }
        else stopStrangerKeepAlive();
    } else {
        stopStrangerKeepAlive();
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
    // Settings lock (13.5): any host can lock look settings (incl. stranger
    // rooms) — hidden while turns run, which supersede it.
    var sLockBtn = document.getElementById('settingsLockBtn');
    if (sLockBtn) {
        sLockBtn.style.display = (isHost && !turnsOn) ? '' : 'none';
        sLockBtn.textContent = settingsLockOn ? '🎛 Unlock settings' : '🎛 Lock settings';
        sLockBtn.classList.toggle('active', settingsLockOn);
    }
    // Locked badge: non-host members see why no one else can join.
    setShown('lockBadge', !stranger && roomLocked && !isHost);

    updateTurnUI();
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

    var turnsBtn = document.getElementById('turnsBtn');
    if (turnsBtn) turnsBtn.addEventListener('click', toggleTurns);

    var turnPassBtn = document.getElementById('turnPassBtn');
    if (turnPassBtn) turnPassBtn.addEventListener('click', passTurn);

    // Auto-join if URL has room hash
    var hashRoom = getRoomFromHash();
    if (hashRoom && hashRoom !== 'DEFAULT-ROOM') {
        connectToRoom(hashRoom);
    }
}

// Expose globals
window.isProcessingRemoteEvent = function() { return isProcessingRemoteEvent; };
window.broadcastSplat = broadcastSplat;
window.queueDab = queueDab;       // 1.3: faithful dab-train broadcast (05j drain)
window.flushDabs = flushDabs;
window.broadcastCursor = broadcastCursor;
window.broadcastPointerUp = broadcastPointerUp;
window.broadcastClear = broadcastClear;
window.broadcastPreset = broadcastPreset;
window.broadcastReplayStroke = broadcastReplayStroke;
window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.paintWithStranger = paintWithStranger;
window.toggleLock = toggleLock;
window.toggleTurns = toggleTurns;
window.passTurn = passTurn;
window.copyRoomCode = copyRoomCode;
window.disconnectMultiplayer = disconnectMultiplayer;

console.log('Multiplayer module loaded. PartyKit host:', PARTYKIT_HOST);

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMultiplayerUI);
} else {
    initMultiplayerUI();
}
