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

// "Paint with a stranger": ask the lobby to pair us 1:1 with another seeker,
// then connect to whatever room it hands back (a pub- room).
function paintWithStranger() {
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
var strangerWasPaired = false; // so a partner's departure is ANNOUNCED, not silent
// First tick fires EARLY (~8-13s) so two seekers whose initial matchmakes
// double-minted (the lobby's waiting pointer was lost between their requests)
// converge within seconds instead of a 45s tick; later ticks stay comfortably
// inside the server's 60s TTL. Both delays are jittered to break the
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
        // (Replies land in the paintWithStranger handler: waiting:true refreshes
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
// brushEraser/sketchVisible are sketch/mask *workflow* state, not look —
// mirroring them let a painter's snapshot silently rewrite the watcher's
// saved eraser/paint-layer prefs (pCheckbox persists on 'change').
var MP_PERF_LOCAL_KEYS = [
    'visualResolution', 'physicsResolution', 'fpsCap',
    'recMode', 'recPlaybackSpeed', 'statsToggle', 'autoloadSettings',
    'brushEraser', 'sketchVisible'
];

// A freehand light-shift path stores one full-precision point per ~2px of
// drag — ~117 bytes each, so a normal path is ~12KB on its own and pushed the
// whole snapshot past the shed threshold below. The path was then deleted
// SILENTLY, and a watcher ran with Light Shift "enabled" but no path at all:
// their overexposed whites stayed white while the host's took the path's
// colours. That asymmetry is what "theirs looked more blown out" was.
//
// A mirror doesn't need every sample — resample to at most MIRROR_PATH_POINTS
// (keeping both endpoints) and round to 1 decimal. ~4KB, comfortably inside
// the budget. Presets keep the full-fidelity path: only this mirror copy is
// compacted, and the wire shape is unchanged so old clients still apply it.
var MIRROR_PATH_POINTS = 64;
function compactLightShiftPath(path) {
    if (!path || !path.length) return path || null;
    var r1 = function (v) { return (typeof v === 'number') ? Math.round(v * 10) / 10 : v; };
    var src = path;
    if (src.length > MIRROR_PATH_POINTS) {
        var out = [];
        var step = (src.length - 1) / (MIRROR_PATH_POINTS - 1);
        var prevIdx = 0;
        for (var i = 0; i < MIRROR_PATH_POINTS; i++) {
            var idx = Math.round(i * step);
            var pt = src[idx];
            // A Shift-gap (a jump in the path) must survive resampling: if any
            // dropped point between the last kept one and this one was a jump,
            // this one inherits it, or the mirror draws a line across the gap.
            if (i > 0 && pt && typeof pt === 'object' && !pt.gap) {
                for (var j = prevIdx + 1; j < idx; j++) {
                    if (src[j] && src[j].gap) {
                        pt = { x: pt.x, y: pt.y, hue: pt.hue, saturation: pt.saturation,
                               lightness: pt.lightness, gap: true };
                        break;
                    }
                }
            }
            prevIdx = idx;
            out.push(pt);
        }
        src = out;
    }
    return src.map(function (p) {
        if (!p || typeof p !== 'object') return p;
        var q = { x: r1(p.x), y: r1(p.y), hue: r1(p.hue),
                  saturation: r1(p.saturation), lightness: r1(p.lightness) };
        if (p.gap) q.gap = true; // the jumps are part of the look
        return q;
    });
}

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
        lightShiftPath: compactLightShiftPath(full.lightShiftPath),
        brushState: full.brushState || null,
        material: full.material || null,
        brushTip: full.brushTip || null,
        // Oscillators animate look params — without them a watcher saw only
        // the 2s poll's choppy sampled values instead of the animation itself.
        cosOscillator: full.cosOscillator ||
            ((window.cosOscillator && window.cosOscillator.getState) ? window.cosOscillator.getState() : null),
        // Transport is MIRROR-ONLY state (deliberately not part of presets —
        // loading a preset should never pause you). A painter's pause or
        // freeze is part of the performance, so the audience gets it too.
        transport: {
            paused: (typeof isPaused !== 'undefined') ? !!isPaused : false,
            frozen: !!window.__fluidFrozen
        },
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

// The relay SILENTLY drops messages over 16KB — for a user with a big saved-
// color/palette library the whole look snapshot vanished on every send, so a
// watcher got per-dab paint properties (they ride the stroke messages) but no
// slider/setting changes at all: "density didn't carry" was this. Sanitize on
// the SENDER (the receiver strips long strings/data URLs anyway, so they are
// pure wasted bytes), then shed bulky optional sections, then as a last
// resort send the core look alone — a partial mirror always beats a silent
// total drop.
function fitLookSnapshot(snap) {
    if (!snap) return null;
    var out = sanitizeLockSnapshot(snap) || {};
    var SHED = ['userPalettes', 'savedColors', 'lightShiftPath', 'ssOrigin', 'brushState'];
    for (var i = 0; i < SHED.length; i++) {
        try { if (JSON.stringify(out).length <= 14000) break; } catch (_) { break; }
        // Shedding used to be completely silent, which is why a dropped
        // lightShiftPath took a user test to find. Say what went overboard.
        if (out[SHED[i]] != null) console.warn('[mp] look snapshot over budget — dropping ' + SHED[i]);
        delete out[SHED[i]];
    }
    var len = 0;
    try { len = JSON.stringify(out).length; } catch (_) {}
    if (len > 15000) {
        console.warn('[mp] look snapshot still ' + len + 'B after shedding — sending core look only');
        out = { sliders: out.sliders, checkboxes: out.checkboxes, selects: out.selects,
                colors: out.colors, kaleido: out.kaleido, paletteIndex: out.paletteIndex,
                material: out.material, cosOscillator: out.cosOscillator,
                transport: out.transport, armColors: out.armColors };
    }
    return out;
}
function broadcastSettingsLock() {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    var msg = { type: 'settings-lock', locked: settingsLockOn, timestamp: Date.now() };
    if (settingsLockOn) {
        var snap = captureLookSnapshot();
        // Diff gate records the PRE-fit JSON (the poll compares fresh
        // unshedded captures against this — post-fit it would never match
        // an oversize snapshot and the poll would re-send every tick).
        try { settingsLockLastSent = JSON.stringify(snap || null); } catch (_) { settingsLockLastSent = ''; }
        msg.snapshot = fitLookSnapshot(snap);
    }
    partySocket.send(JSON.stringify(msg));
}

// Take-turns twin of broadcastSettingsLock: the current painter's look rides a
// 'turn-look' message (the relay only forwards it from the turn holder).
function broadcastTurnLook() {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    var snap = captureLookSnapshot();
    // Same pre-fit diff gate as the settings lock (shared with the poll).
    try { settingsLockLastSent = JSON.stringify(snap || null); } catch (_) { settingsLockLastSent = ''; }
    partySocket.send(JSON.stringify({ type: 'turn-look', snapshot: fitLookSnapshot(snap), timestamp: Date.now() }));
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
    'lightShiftPath', 'kaleido', 'userPalettes', 'ssOrigin', 'material',
    'brushTip', 'cosOscillator', 'transport'];
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
        // Transport parity (mirror-only; applyPresetSnapshot ignores it): the
        // painter pausing or freezing the fluid is part of the performance.
        try {
            var t = safeSnap.transport;
            if (t) {
                if (typeof t.paused === 'boolean' && typeof isPaused !== 'undefined' &&
                    !!isPaused !== t.paused && typeof window.togglePause === 'function') {
                    window.togglePause();
                }
                if (typeof t.frozen === 'boolean' && !!window.__fluidFrozen !== t.frozen &&
                    typeof window.toggleFreeze === 'function') {
                    window.toggleFreeze();
                }
            }
        } catch (e) { /* best-effort */ }
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
    // Any authoritative rotation update settles an outstanding invite —
    // an accept arrives as turn-state, not as a separate result message.
    clearInviteWait();
    dismissTurnInvitePrompt();
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
    turnMsLocal = 0;
    turnDeadlineLocal = 0;
    clearInviteWait();
    dismissTurnInvitePrompt();
    stopTurnTick();
    syncTurnGates(); // clears BOTH gates (turnsOn is false)
    syncLookMirror();
    var banner = document.getElementById('mpTurnBanner'); // legacy top-center banner
    if (banner) banner.remove();
    var chip = document.getElementById('mpTurnChip');
    if (chip) chip.remove();
    var wheel = document.getElementById('turnWheel');
    if (wheel) { wheel.style.display = 'none'; wheel.innerHTML = ''; }
    _wheelKey = '';
}

// ── Turn countdown ──────────────────────────────────────────────────
// The server owns the clock (its alarm auto-passes the brush); clients only
// RENDER the remaining time from the skew-adjusted deadline.
var turnTickTimer = null;

function fmtRemaining() {
    if (!turnDeadlineLocal) return '';
    var s = Math.max(0, Math.round((turnDeadlineLocal - Date.now()) / 1000));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
}

function stopTurnTick() {
    if (turnTickTimer) { clearInterval(turnTickTimer); turnTickTimer = null; }
}

function ensureTurnTick() {
    if (turnTickTimer) return;
    turnTickTimer = setInterval(function () {
        if (!turnsOn || !turnDeadlineLocal) { stopTurnTick(); return; }
        updateTurnChip();
        updateTurnStatusLine();
        var clock = document.getElementById('turnWheelClock');
        if (clock) clock.textContent = fmtRemaining();
    }, 500);
}

// Current-artist presence, bubbled onto the screen: a compact chip in the
// quality underbar (2026-08-15 user-test — replaces the fixed top-center
// banner, so turn state lives in exactly two places: the queue in the panel
// and this chip). The "settings mirror" explanation moved into the tooltip.
function updateTurnChip() {
    var legacy = document.getElementById('mpTurnBanner');
    if (legacy) legacy.remove();
    var chip = document.getElementById('mpTurnChip');
    if (!turnsOn || !isMultiplayerEnabled) {
        if (chip) chip.remove();
        return;
    }
    // Underbar lookup at CALL time, null-guarded: 06 (deferred loader) and
    // the underbar build (DCL+800ms+rAF) race in both directions. When the
    // bar is missing OR hidden (mobile/short-window media queries hide
    // #quality-underbar entirely), the chip floats fixed top-center on
    // <body> instead — the old banner's spot — so turn state is never
    // invisible; the placement is re-evaluated on every render/tick.
    var bar = document.getElementById('quality-underbar');
    var barVisible = false;
    if (bar) { try { barVisible = getComputedStyle(bar).display !== 'none'; } catch (_) {} }
    var wantParent = barVisible ? bar : document.body;
    if (!chip) {
        chip = document.createElement('button');
        chip.id = 'mpTurnChip';
        chip.type = 'button';
        chip.addEventListener('click', function () {
            // Bring the rotation into view. On mobile the sidebar is a
            // closed drawer — open it first; and the Multiplayer section
            // collapses to zero height, so expand it or the scroll lands
            // on nothing visible.
            var controls = document.getElementById('sidebar-right');
            if (document.body.classList.contains('mobile-mode') && controls &&
                !controls.classList.contains('visible')) {
                var mt = document.getElementById('mobileMenuToggle');
                if (mt) mt.click(); else controls.classList.add('visible');
            }
            var t = document.getElementById('turnWheel') || document.getElementById('turnsBtn');
            if (!t) return;
            var sec = t.closest ? t.closest('.sidebar-section') : null;
            if (sec) sec.classList.remove('collapsed');
            if (t.scrollIntoView) {
                try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
                catch (_) { t.scrollIntoView(); }
            }
        });
    }
    if (chip.parentElement !== wantParent) wantParent.appendChild(chip);
    chip.classList.toggle('floating', !barVisible);
    var t = fmtRemaining();
    var clock = t ? ' · ' + t : '';
    if (isMyTurn()) {
        chip.textContent = '🖌 Your turn' + clock;
        chip.title = 'Your turn — everyone sees your settings. Click to open the rotation.';
        chip.classList.add('you');
    } else if (turnHolderId) {
        chip.textContent = '🖌 ' + shortName(turnHolderId) + clock;
        chip.title = shortName(turnHolderId) + ' is painting — your settings mirror theirs. Click to open the rotation.';
        chip.classList.remove('you');
    } else {
        chip.textContent = '⏳ Next painter…';
        chip.title = 'Waiting for the next painter. Click to open the rotation.';
        chip.classList.remove('you');
    }
}

// ── Rotation display ────────────────────────────────────────────────
// A plain ordered queue (2026-08-15 user-test — replaces the SVG wheel and
// its arrows): "Now" is the active painter, then Next / 2nd / 3rd… in exact
// pass order. Rows render from a generic {kind:'artist'|'phase'} list so a
// future prepare-phase row slots in without another rewrite. Dot colors
// match the artists' remote-cursor colors; your own row says "(you)".
var _wheelKey = '';

function turnPosLabel(i) {
    if (i === 0) return 'Now';
    if (i === 1) return 'Next';
    return i + (i === 2 ? 'nd' : i === 3 ? 'rd' : 'th');
}

function turnQueueRow(item, posText, isNow) {
    var row = document.createElement('div');
    row.className = 'mp-turn-qrow' + (isNow ? ' now' : '');
    var pos = document.createElement('span');
    pos.className = 'mp-turn-qpos';
    pos.textContent = posText;
    row.appendChild(pos);
    if (item.kind === 'artist' && item.id) {
        var dot = document.createElement('span');
        dot.className = 'mp-turn-qdot';
        dot.style.background = colorForClient(item.id);
        row.appendChild(dot);
        var name = document.createElement('span');
        name.className = 'mp-turn-qname' + (item.id === clientId ? ' you' : '');
        name.textContent = shortName(item.id) + (item.id === clientId ? ' (you)' : '');
        row.appendChild(name);
        if (isNow) {
            var brush = document.createElement('span');
            brush.className = 'mp-turn-qbrush';
            brush.textContent = '🖌';
            row.appendChild(brush);
        }
    } else {
        var ph = document.createElement('span');
        ph.className = 'mp-turn-qname mp-turn-qwait';
        ph.textContent = item.label || 'waiting…';
        row.appendChild(ph);
    }
    if (isNow) {
        // Keeps the id contract with ensureTurnTick — the 500ms tick only
        // rewrites this node's text; rotation changes rebuild the list.
        var clock = document.createElement('span');
        clock.id = 'turnWheelClock';
        clock.className = 'mp-turn-qclock' + (isMyTurn() ? ' you' : '');
        clock.textContent = fmtRemaining();
        row.appendChild(clock);
    }
    return row;
}

function renderTurnWheel() {
    var host = document.getElementById('turnWheel');
    if (!host) return;
    if (!turnsOn || !isMultiplayerEnabled) {
        host.style.display = 'none';
        if (host.innerHTML) host.innerHTML = '';
        _wheelKey = '';
        return;
    }
    host.style.display = '';
    var ids = turnOrder.slice();
    if (!ids.length && turnHolderId) ids = [turnHolderId];
    var key = ids.join('|') + '#' + (turnHolderId || '') + '#' + (clientId || '') + '#' + (turnDeadlineLocal ? 1 : 0);
    if (key === _wheelKey) {
        // Rotation unchanged — the tick only refreshes the clock text.
        return;
    }
    _wheelKey = key;

    var holder = (turnHolderId && ids.indexOf(turnHolderId) !== -1) ? turnHolderId : null;
    var hIdx = holder ? ids.indexOf(holder) : -1;
    // Waiters in the order the brush will reach them
    var waiters = hIdx === -1 ? ids.slice()
        : ids.slice(hIdx + 1).concat(ids.slice(0, hIdx));

    // Generic row items: artists today; a 'phase' row (prepare etc.) later.
    var items = [];
    items.push(holder ? { kind: 'artist', id: holder }
                      : { kind: 'phase', label: 'waiting for a painter…' });
    for (var i = 0; i < waiters.length; i++) items.push({ kind: 'artist', id: waiters[i] });

    host.innerHTML = '';
    var list = document.createElement('div');
    list.className = 'mp-turn-queue';
    for (var j = 0; j < items.length; j++) {
        list.appendChild(turnQueueRow(items[j], turnPosLabel(j), j === 0));
    }
    host.appendChild(list);
    if (ids.length <= 1) {
        var hint = document.createElement('div');
        hint.className = 'mp-turn-qhint';
        hint.textContent = 'waiting for another artist…';
        host.appendChild(hint);
    }
}

// Countdown + rotation-size line under the wheel (refreshed by the tick).
function updateTurnStatusLine() {
    var tStat = document.getElementById('turnStatus');
    if (!tStat) return;
    if (!turnsOn) {
        tStat.style.display = 'none';
        return;
    }
    tStat.style.display = '';
    var n = turnOrder.length;
    var t = fmtRemaining();
    var who = isMyTurn() ? '🖌 Your turn' : (turnHolderId ? '🖌 ' + shortName(turnHolderId) + ' painting' : '⏳ Waiting');
    tStat.textContent = who + (t ? ' · ⏱ ' + t : '') + ' · ' + n + (n === 1 ? ' artist' : ' artists');
    tStat.classList.toggle('mp-turn-you', isMyTurn());
}

// Panel widgets: the host's Take turns toggle + turn-length picker, the
// rotation wheel, the countdown line, and the Pass/Skip button (painter
// passes; host can skip an AFK painter).
function updateTurnUI() {
    updateTurnChip();
    var isHost = myRole === 'host';
    // Stranger pairs have no meaningful host, so both painters drive turns:
    // either may ask (consent flow) and either may stop.
    var pair = isStrangerRoom();
    var canDrive = isHost || pair;
    var tBtn = document.getElementById('turnsBtn');
    if (tBtn) {
        // Non-drivers see the control too, disabled — hiding it outright made
        // the whole feature invisible to everyone but the host, who then had
        // to explain it exists. Once turns are running the wheel/banner/status
        // carry the state, so the dead button steps out of the way.
        var showBtn = canDrive || !turnsOn;
        tBtn.style.display = showBtn ? '' : 'none';
        tBtn.disabled = !canDrive || invitePending;
        if (invitePending) {
            tBtn.textContent = '⏳ Waiting for their answer…';
            tBtn.title = 'Your partner has been asked to take turns';
        } else if (!canDrive) {
            tBtn.textContent = '🔁 Take turns · host only';
            tBtn.title = 'Only the room host can start taking turns';
        } else if (turnsOn) {
            tBtn.textContent = '🔁 Stop taking turns';
            tBtn.title = 'Go back to painting at the same time';
        } else {
            tBtn.textContent = pair ? '🔁 Ask to take turns' : '🔁 Take turns';
            tBtn.title = pair
                ? 'Ask your partner to take turns — nothing changes unless they agree'
                : "Take turns painting — one artist at a time while everyone else watches with the painter's settings mirrored live";
        }
        tBtn.classList.toggle('active', turnsOn);
        tBtn.classList.toggle('mp-btn-muted', !canDrive || invitePending);
    }
    var tSel = document.getElementById('turnTimerSel');
    // The asker picks the length (it rides along in the invite), so both
    // members of a pair get the picker.
    if (tSel) tSel.style.display = (canDrive && !turnsOn) || (isHost && turnsOn) ? '' : 'none';
    var pBtn = document.getElementById('turnPassBtn');
    if (pBtn) {
        // Skipping SOMEONE ELSE's turn is a host power, and a stranger pair has
        // no real host — so in a pair you may only pass your own turn.
        var showPass = turnsOn && (isMyTurn() || (isHost && !pair));
        pBtn.style.display = showPass ? '' : 'none';
        pBtn.textContent = isMyTurn() ? '➡ Pass turn' : '⏭ Skip turn';
    }
    renderTurnWheel();
    updateTurnStatusLine();
    if (turnsOn && turnDeadlineLocal) ensureTurnTick(); else stopTurnTick();
}

function turnTimerSeconds() {
    var sel = document.getElementById('turnTimerSel');
    var v = sel ? parseInt(sel.value, 10) : 60;
    return isNaN(v) ? 60 : v;
}

// ── Stranger-pair consent ───────────────────────────────────────────
// A stranger room has no real host — "host" is just whoever connected first —
// so either painter may propose taking turns and the other agrees or doesn't.
// Nothing changes on either canvas until they agree.
var invitePending = false;      // we asked; waiting on their answer
var inviteTimeout = null;
var inviteAckTimeout = null;
var INVITE_WAIT_MS = 30000;     // matches the relay's invite TTL
var INVITE_ACK_MS = 4000;       // server ack must beat this

function clearInviteWait() {
    invitePending = false;
    if (inviteTimeout) { clearTimeout(inviteTimeout); inviteTimeout = null; }
    if (inviteAckTimeout) { clearTimeout(inviteAckTimeout); inviteAckTimeout = null; }
}

function sendTurnInvite() {
    if (!partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    if (invitePending || turnsOn) return;
    invitePending = true;
    partySocket.send(JSON.stringify({ type: 'turn-invite', seconds: turnTimerSeconds() }));
    // A relay that predates turn invites has no handler for the message and
    // simply rebroadcasts it, so nothing ever comes back. Without this probe
    // that is indistinguishable from a partner who is ignoring you — you just
    // wait 30s for "no answer". The ack turns it into a real explanation.
    inviteAckTimeout = setTimeout(function () {
        if (!invitePending) return;
        clearInviteWait();
        showTurnToast('⚠ This room\'s server is too old for turn invites — it needs a relay update.');
        updateTurnUI();
    }, INVITE_ACK_MS);
    inviteTimeout = setTimeout(function () {
        if (!invitePending) return;
        clearInviteWait();
        showTurnToast('⏳ No answer — they may not be at the keyboard.');
        updateTurnUI();
    }, INVITE_WAIT_MS);
    updateTurnUI();
}

function answerTurnInvite(accept) {
    dismissTurnInvitePrompt();
    if (!partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    partySocket.send(JSON.stringify({ type: 'turn-invite-response', accept: !!accept }));
}

function dismissTurnInvitePrompt() {
    var el = document.getElementById('mpTurnInvite');
    if (el) el.remove();
}

// The partner asked us. Accept/Decline, shown near the turn banner so the
// whole turn conversation happens in one place on screen.
function showTurnInvitePrompt(fromId, seconds) {
    dismissTurnInvitePrompt();
    var el = document.createElement('div');
    el.id = 'mpTurnInvite';
    el.className = 'mp-turn-invite';
    var who = fromId ? shortName(fromId) : 'Your partner';
    var len = (typeof seconds === 'number' && seconds > 0)
        ? (seconds >= 60 ? (seconds / 60) + ' min' : seconds + ' sec') + ' each'
        : 'no timer';
    var msg = document.createElement('span');
    msg.textContent = '🔁 ' + who + ' wants to take turns painting (' + len + ')';
    var yes = document.createElement('button');
    yes.className = 'mp-invite-yes';
    yes.textContent = 'Take turns';
    yes.addEventListener('click', function () { answerTurnInvite(true); });
    var no = document.createElement('button');
    no.className = 'mp-invite-no';
    no.textContent = 'No thanks';
    no.addEventListener('click', function () { answerTurnInvite(false); });
    el.appendChild(msg);
    el.appendChild(yes);
    el.appendChild(no);
    document.body.appendChild(el);
    // Expire in step with the relay's TTL so a stale prompt can't linger and
    // answer an invite the server has already forgotten.
    setTimeout(function () {
        var still = document.getElementById('mpTurnInvite');
        if (still === el) el.remove();
    }, INVITE_WAIT_MS);
}

// Brief, non-blocking feedback for invite outcomes.
function showTurnToast(text) {
    var el = document.getElementById('mpTurnToast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'mpTurnToast';
        el.className = 'mp-turn-toast';
        document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
    if (showTurnToast._t) clearTimeout(showTurnToast._t);
    showTurnToast._t = setTimeout(function () { el.style.opacity = '0'; }, 2600);
}

function toggleTurns() {
    if (!partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    // Starting turns in a stranger pair needs the partner's yes; stopping
    // never does, and neither does anything in a hosted private room.
    if (isStrangerRoom() && !turnsOn) {
        sendTurnInvite();
        return;
    }
    partySocket.send(JSON.stringify({ type: 'turns', on: !turnsOn, seconds: turnTimerSeconds() }));
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
                if (!turnsOn) showTurnInvitePrompt(data.from, data.seconds);
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
                        showTurnToast('⚠ Both windows share one device id — open the other in a different browser or a private window.');
                    } else if (data.reason === 'alone') {
                        showTurnToast('⏳ Nobody else in the room yet.');
                    } else {
                        showTurnToast('🙅 ' + (data.by ? shortName(data.by) : 'They') + ' would rather keep painting together');
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

// ── Custom brush shapes over the wire (2026-08-21) ───────────────────────
// A stamp is a ≤128px PNG (measured 5-21KB across a real library), so it is
// cheap enough to publish ONCE per room and then reference by id on every
// dab — rather than the old behaviour, where a peer's shaped stroke printed
// as a plain built-in tip because "its bitmap can't ride the wire".
//
// Two ids per shape: the shape's own id, and `rev`, a content hash. replace()
// re-stamps a shape IN PLACE keeping its id (33-brush-shapes), so without the
// rev a peer would keep painting with the version it cached first.
const SHAPE_CHUNK_CHARS = 11000; // + envelope: comfortably under the 16KB cap
const SHAPE_MAX_CHUNKS = 32;     // ≈350KB — far above any ≤128px stamp
var _shapePublished = new Map(); // id → rev already sent on THIS socket

// A fresh socket is a fresh audience: whatever we published to the last room
// says nothing about what this one has.
function resetPublishedShapes() {
    _shapePublished.clear();
}

// Publish the active shape's bitmap unless this socket already sent that exact
// version. Called immediately BEFORE the dabs that reference it — messages are
// ordered on one socket, so the definition always lands first and there is no
// window where a peer sees the id without the art.
function publishShape(id) {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN) return null;
    const BS = window.BrushShapes;
    if (!BS || typeof BS.exportShape !== 'function') return null;
    if (!id) return null;
    const e = BS.exportShape(id);
    if (!e) return null;                          // stale selection, nothing to send
    if (_shapePublished.get(id) === e.rev) return e.rev; // peers already have it
    const url = e.dataURL || '';
    const total = Math.ceil(url.length / SHAPE_CHUNK_CHARS) || 1;
    if (total > SHAPE_MAX_CHUNKS) return null;    // absurd stamp: leave peers on the tip
    for (let i = 0; i < total; i++) {
        partySocket.send(JSON.stringify({
            type: 'brush-shape',
            data: {
                id: e.id, rev: e.rev, name: e.name, seq: i, total,
                part: url.slice(i * SHAPE_CHUNK_CHARS, (i + 1) * SHAPE_CHUNK_CHARS)
            },
            timestamp: Date.now()
        }));
    }
    _shapePublished.set(id, e.rev);
    return e.rev;
}

function publishActiveShape() {
    return publishShape((window.config && window.config.BRUSH_SHAPE_ID) || null);
}

// The painter's footprint, stamped on the dabs about to go out. `tip`/`angle`
// are the built-in stamp — peers used to render remote dabs with their OWN
// tip in free paint (only the settings-lock/turn-look mirror carried the
// painter's), so these close that gap too. `shape` rides only when its bitmap
// has been published.
function brushWireFields() {
    const cfg = window.config || {};
    const f = { tip: (cfg.BRUSH_TIP | 0) || 0 };
    if (cfg.BRUSH_ANGLE) f.angle = +(+cfg.BRUSH_ANGLE).toFixed(1);
    const rev = publishActiveShape();
    if (rev) { f.shape = cfg.BRUSH_SHAPE_ID; f.rev = rev; }
    return f;
}

// Reassembly of chunked shape definitions, keyed so two peers sending
// different shapes — or the same shape at different revs — never interleave.
const shapeChunkBuffers = new Map(); // clientId|id|rev → {parts, received, total, at}
function handleBrushShape(data) {
    const d = data.data || {};
    if (typeof d.id !== 'string' || typeof d.part !== 'string') return;
    if (typeof d.seq !== 'number' || typeof d.total !== 'number') return;
    if (d.total < 1 || d.total > SHAPE_MAX_CHUNKS || d.seq < 0 || d.seq >= d.total) return;
    if (d.part.length > SHAPE_CHUNK_CHARS) return;
    const BS = window.BrushShapes;
    if (!BS || typeof BS.putPeer !== 'function') return;

    const now = Date.now();
    for (const [k, v] of shapeChunkBuffers) {
        if (now - v.at > 20000) shapeChunkBuffers.delete(k); // abandoned transfer
    }
    const key = data.clientId + '|' + d.id + '|' + d.rev;
    let buf = shapeChunkBuffers.get(key);
    if (!buf) {
        if (shapeChunkBuffers.size >= 8) return;  // too many in flight — drop the newcomer
        buf = { parts: new Array(d.total), received: 0, total: d.total, at: now };
        shapeChunkBuffers.set(key, buf);
    }
    if (buf.total !== d.total) return;
    if (buf.parts[d.seq] === undefined) {
        buf.parts[d.seq] = d.part;
        buf.received++;
    }
    if (buf.received !== buf.total) return;
    shapeChunkBuffers.delete(key);
    // putPeer validates the assembled string (PNG dataURL, size, count) before
    // it ever reaches an <img> — the relay vouches for nothing.
    try { BS.putPeer(d.id, buf.parts.join(''), d.rev); } catch (_) {}
}

// ── Colliders over the wire (2026-08-21) ─────────────────────────────────
// Until now a wall was invisible to everyone but the person who placed it —
// and because the obstacle field feeds vorticity, pressure and advection
// every frame, that was not just a missing decoration: the two simulations
// silently DIVERGED. The same shared stroke curled around a wall on one
// screen and straight through empty space on the other.
//
// What travels is the coverage map, not the source picture. Physics never
// resolves finer than the sim grid (512 long side on desktop), so a photo-
// derived wall that is megabytes on disk crosses as a few KB and still
// produces the same obstacle. Each client rasterizes it into its own
// obstacle field at its own resolution — visually equivalent walls, locally
// consistent physics, which is the achievable target when peers run
// different sim resolutions and aspect ratios.
const COLLIDER_WIRE_MAX = 512;   // matches the desktop sim grid's long side
const COLLIDER_CHUNK_CHARS = 11000;
const COLLIDER_MAX_CHUNKS = 32;  // ≈350KB of coverage PNG
var _colliderPublished = new Map(); // our layer index → rev last sent
var peerColliders = new Map();      // "ownerId|theirIndex" → our local layer index

function resetPublishedColliders() {
    _colliderPublished.clear();
}

// Send every wall we own. Used when someone joins: unlike a brush shape,
// which the next stroke would republish anyway, a wall that was placed
// before they arrived has no natural trigger to resend it — so a late
// joiner would sit in a room whose obstacles they cannot see and whose
// physics they cannot reproduce.
function republishColliders() {
    if (!window.layers || !isMultiplayerEnabled) return;
    window.layers.forEach(function (l) {
        if (l && l.isCollision && !l.__peerOwner) {
            try { publishCollider(l.index); } catch (_) {}
        }
    });
}

// Coverage map → opaque grayscale PNG. Grayscale-with-opaque-alpha, NOT
// white-with-alpha: a canvas stores alpha premultiplied, so coverage put in
// the alpha channel comes back quantized, while a value in RGB round-trips
// exactly.
function coverageToPng(depth) {
    const sw = depth.width, sh = depth.height;
    const scale = Math.min(1, COLLIDER_WIRE_MAX / Math.max(sw, sh));
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));
    const src = document.createElement('canvas');
    src.width = sw; src.height = sh;
    const sctx = src.getContext('2d');
    const img = sctx.createImageData(sw, sh);
    for (let i = 0, p = 0; i < depth.data.length; i++, p += 4) {
        const v = depth.data[i];
        img.data[p] = v; img.data[p + 1] = v; img.data[p + 2] = v; img.data[p + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);
    if (dw === sw && dh === sh) return { png: src.toDataURL('image/png'), w: dw, h: dh };
    const out = document.createElement('canvas');
    out.width = dw; out.height = dh;
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.drawImage(src, 0, 0, dw, dh);
    return { png: out.toDataURL('image/png'), w: dw, h: dh };
}

// The inverse, on the receiving side.
function pngToCoverage(dataURL, w, h) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function () {
            try {
                const c = document.createElement('canvas');
                c.width = img.naturalWidth || w; c.height = img.naturalHeight || h;
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const d = ctx.getImageData(0, 0, c.width, c.height).data;
                const out = new Uint8Array(c.width * c.height);
                for (let i = 0, p = 0; i < out.length; i++, p += 4) out[i] = d[p];
                resolve({ data: out, width: c.width, height: c.height });
            } catch (_) { resolve(null); }
        };
        img.onerror = function () { resolve(null); };
        img.src = dataURL;
    });
}

// Everything a peer needs to reproduce one wall. Geometry rides NORMALIZED
// (fractions of the sender's canvas box) because layer.x/y are CSS pixels of
// a box whose size differs per client — the same reason splat positions are
// normalized.
function serializeCollider(layerIndex) {
    const cl = window.collisionLayers;
    if (!cl || typeof cl.depthOf !== 'function' || !window.layers) return null;
    const layer = window.layers.find(l => l.index === layerIndex);
    if (!layer || !layer.isCollision) return null;
    const depth = cl.depthOf(layerIndex);
    if (!depth) return null;                 // live source-bound: GPU-only, skip
    const enc = coverageToPng(depth);
    if (!enc || !enc.png) return null;
    const box = document.getElementById('canvas-wrapper') || (window.canvas || {});
    const bw = box.clientWidth || (window.canvas && canvas.width) || 1;
    const bh = box.clientHeight || (window.canvas && canvas.height) || 1;
    return {
        lid: layerIndex,
        w: enc.w, h: enc.h, png: enc.png,
        thr: (typeof depth.threshold === 'number') ? depth.threshold : 128,
        inv: !!depth.invert,
        mode: layer.collisionMode || 'block',
        str: (typeof layer.collisionStrength === 'number') ? layer.collisionStrength : 0.9,
        x: +((layer.x || 0) / bw).toFixed(4),
        y: +((layer.y || 0) / bh).toFixed(4),
        sx: +(layer.scaleX || 1).toFixed(4),
        sy: +(layer.scaleY || 1).toFixed(4),
        rot: +(layer.rotation || 0).toFixed(2),
        vis: layer.visible !== false,
        // addCollisionLayer prefixes its own 🧱, so send the bare name or the
        // wall arrives on the peer titled "🧱 🧱 Bar Wall".
        name: String(layer.title || 'Collision').replace(/^\s*🧱\s*/, '').slice(0, 40)
    };
}

// Cheap content hash so an unchanged wall is never re-sent — updateObstacle
// runs on every slider nudge and on a 120ms cadence while a live collider
// tracks a stroke, and each resend is a multi-KB chunked transfer.
function colliderRev(meta) {
    const s = meta.png.length + '|' + meta.w + 'x' + meta.h + '|' + meta.thr + '|' + meta.inv +
              '|' + meta.mode + '|' + meta.str + '|' + meta.x + ',' + meta.y +
              '|' + meta.sx + ',' + meta.sy + '|' + meta.rot + '|' + meta.vis;
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
    // Fold in a sample of the bitmap so a redrawn mask of identical length
    // still reads as a change.
    for (let i = 0; i < meta.png.length; i += 997) { h ^= meta.png.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h.toString(36);
}

function publishCollider(layerIndex) {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    if (isProcessingRemoteEvent) return;               // never echo a peer's wall back
    if (isPeerCollider(layerIndex)) return;            // ...including later edits to it
    const meta = serializeCollider(layerIndex);
    if (!meta) return;
    const rev = colliderRev(meta);
    if (_colliderPublished.get(layerIndex) === rev) return;
    const total = Math.ceil(meta.png.length / COLLIDER_CHUNK_CHARS) || 1;
    if (total > COLLIDER_MAX_CHUNKS) {
        console.warn('[Multiplayer] Collider too large to share (' + total + ' chunks) — kept local');
        return;
    }
    for (let i = 0; i < total; i++) {
        const part = meta.png.slice(i * COLLIDER_CHUNK_CHARS, (i + 1) * COLLIDER_CHUNK_CHARS);
        const d = Object.assign({}, meta, { rev, seq: i, total, part });
        delete d.png;                                   // the bitmap rides as `part`
        partySocket.send(JSON.stringify({ type: 'collider-add', data: d, timestamp: Date.now() }));
    }
    _colliderPublished.set(layerIndex, rev);
}

function broadcastColliderRemove(layerIndex) {
    _colliderPublished.delete(layerIndex);
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN) return;
    if (isProcessingRemoteEvent || isPeerCollider(layerIndex)) return;
    partySocket.send(JSON.stringify({
        type: 'collider-remove', data: { lid: layerIndex }, timestamp: Date.now()
    }));
}

function isPeerCollider(layerIndex) {
    for (const v of peerColliders.values()) if (v === layerIndex) return true;
    return false;
}

// Reassembly + apply for an incoming wall.
const colliderChunkBuffers = new Map(); // clientId|lid|rev → {parts, received, total, meta, at}
function handleColliderAdd(data) {
    const d = data.data || {};
    if (typeof d.lid !== 'number' || typeof d.part !== 'string') return;
    if (typeof d.seq !== 'number' || typeof d.total !== 'number') return;
    if (d.total < 1 || d.total > COLLIDER_MAX_CHUNKS || d.seq < 0 || d.seq >= d.total) return;
    if (d.part.length > COLLIDER_CHUNK_CHARS) return;
    if (!(d.w > 0 && d.h > 0 && d.w <= 2048 && d.h <= 2048)) return;

    const now = Date.now();
    for (const [k, v] of colliderChunkBuffers) {
        if (now - v.at > 20000) colliderChunkBuffers.delete(k);
    }
    const key = data.clientId + '|' + d.lid + '|' + d.rev;
    let buf = colliderChunkBuffers.get(key);
    if (!buf) {
        if (colliderChunkBuffers.size >= 8) return;
        buf = { parts: new Array(d.total), received: 0, total: d.total, meta: d, at: now };
        colliderChunkBuffers.set(key, buf);
    }
    if (buf.total !== d.total) return;
    if (buf.parts[d.seq] === undefined) { buf.parts[d.seq] = d.part; buf.received++; }
    if (buf.received !== buf.total) return;
    colliderChunkBuffers.delete(key);

    const png = buf.parts.join('');
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(png)) return;
    applyPeerCollider(data.clientId, buf.meta, png);
}

function applyPeerCollider(ownerId, meta, png) {
    const cl = window.collisionLayers;
    if (!cl || typeof cl.addFromDepth !== 'function') return;
    pngToCoverage(png, meta.w, meta.h).then(depth => {
        if (!depth) return;
        const key = ownerId + '|' + meta.lid;
        const box = document.getElementById('canvas-wrapper') || (window.canvas || {});
        const bw = box.clientWidth || (window.canvas && canvas.width) || 1;
        const bh = box.clientHeight || (window.canvas && canvas.height) || 1;
        // Replace rather than stack: a peer nudging a slider republishes the
        // same wall, and without this every edit would leave another copy of
        // it standing in the room.
        removePeerCollider(key);
        // isProcessingRemoteEvent keeps addCollisionLayer's publish hook from
        // bouncing this straight back to the sender.
        const wasRemote = isProcessingRemoteEvent;
        isProcessingRemoteEvent = true;
        let idx = null;
        try {
            idx = cl.addFromDepth(depth, {
                name: meta.name || 'Collision',
                visible: meta.vis !== false,
                threshold: (typeof meta.thr === 'number') ? meta.thr : 128,
                x: (meta.x || 0) * bw, y: (meta.y || 0) * bh,
                scaleX: meta.sx || 1, scaleY: meta.sy || 1, rotation: meta.rot || 0
            });
        } finally {
            isProcessingRemoteEvent = wasRemote;
        }
        if (idx == null) return;
        const layer = window.layers && window.layers.find(l => l.index === idx);
        if (layer) {
            layer.collisionMode = meta.mode || 'block';
            if (typeof meta.str === 'number') layer.collisionStrength = meta.str;
            layer.__peerOwner = ownerId;   // marks it for cleanup when they leave
        }
        peerColliders.set(key, idx);
        try { cl.updateObstacleFromLayers(); } catch (_) {}
        if (typeof window.renderLayers === 'function') window.renderLayers();
    });
}

function removePeerCollider(key) {
    const idx = peerColliders.get(key);
    if (idx == null) return;
    peerColliders.delete(key);
    const wasRemote = isProcessingRemoteEvent;
    isProcessingRemoteEvent = true;
    try {
        if (typeof window.deleteLayer === 'function') window.deleteLayer(idx);
    } catch (_) {} finally {
        isProcessingRemoteEvent = wasRemote;
    }
}

function handleColliderRemove(data) {
    const d = data.data || {};
    if (typeof d.lid !== 'number') return;
    removePeerCollider(data.clientId + '|' + d.lid);
    try { if (window.collisionLayers) window.collisionLayers.updateObstacleFromLayers(); } catch (_) {}
}

// Walls belong to the room. Leaving it takes everyone else's with us, or the
// user paints alone against obstacles they never placed and cannot explain.
function dropPeerColliders() {
    for (const key of Array.from(peerColliders.keys())) removePeerCollider(key);
    colliderChunkBuffers.clear();
    try { if (window.collisionLayers) window.collisionLayers.updateObstacleFromLayers(); } catch (_) {}
}

// Everything the room lent us: peer stamps and peer walls. Called from BOTH
// exit paths — onMultiplayerClose for a dropped socket, and
// disconnectMultiplayer for a deliberate leave. The deliberate one nulls
// partySocket before the close event arrives, so onMultiplayerClose bails out
// of it by design; without this call, leaving a room stranded a stranger's
// wall in the user's simulation with nothing on screen to explain it.
function dropPeerAssets() {
    try {
        if (window.BrushShapes && typeof window.BrushShapes.dropPeers === 'function') {
            window.BrushShapes.dropPeers();
        }
    } catch (_) {}
    shapeChunkBuffers.clear();
    _shapePublished.clear();
    _colliderPublished.clear();
    try { dropPeerColliders(); } catch (_) {}
}

// down=true marks a stroke-opening press stamp so the receiver starts a fresh
// segment instead of interpolating from the previous stroke's end.
function broadcastSplat(x, y, dx, dy, color, mult, radius, down) {
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

    // Publishes the stamp bitmap first if the room has not seen it (see
    // brushWireFields) — so this press stamp's `shape` id always resolves.
    const brush = brushWireFields();

    partySocket.send(JSON.stringify({
        type: 'splat',
        // sym (2026-08-16 fidelity audit): the painter's symmetry layout
        // decides WHERE the arms land; without it peers applied dabs under
        // their OWN mode and the paint landed elsewhere. Additive field —
        // old receivers ignore it.
        data: Object.assign({ x, y, dx, dy, color, mult, radius: effRadius,
                sym: (window.config && window.config.SYMMETRY_MODE) || 'radial',
                down: !!down }, brush),
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
    // Arm count is stamped per message, so a forced flush must carry the real
    // multiplier — hardcoding 1 here collapsed dense strokes to a single arm on
    // every peer. Read the lexical binding, not window.animationMultiplier:
    // 04e-anim-portal assigns the former without mirroring the latter.
    if (_dabQueue.length >= DAB_MAX_PER_MSG) flushDabs(null, currentArmMult(), true);
}

function currentArmMult() {
    return (typeof animationMultiplier === 'number') ? animationMultiplier : 1;
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
    // Footprint for this batch. A stroke paints with one shape, so this rides
    // per MESSAGE like color/mult/sym rather than per dab (~25 bytes, against
    // ~30 bytes for a single dab).
    var brush = brushWireFields();
    // Legacy fields mirror the final dab in the OLD wire units (normalized
    // velocity), so a client running the previous build still renders this
    // stroke through its existing path instead of seeing nothing.
    partySocket.send(JSON.stringify({
        type: 'splat',
        data: Object.assign({
            x: last[0], y: last[1],
            dx: +(last[2] / Math.max(1, canvas.width)).toFixed(5),
            dy: +(last[3] / Math.max(1, canvas.height)).toFixed(5),
            color: color || window.__mpLastDabColor || [1, 0, 0],
            mult: mult || 1,
            radius: last[4] || undefined,
            // Painter's arm layout — see broadcastSplat's sym note.
            sym: (window.config && window.config.SYMMETRY_MODE) || 'radial',
            dabs: dabs
        }, brush),
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
    flushDabs(window.__mpLastDabColor, currentArmMult(), true);

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
        // ── Footprint: paint these dabs with the brush the SENDER used ──
        // Historically this was a flat "suppress custom stamps" (the bitmap
        // could not ride the wire), which left peers printing the viewer's own
        // tip. Now the sender publishes the stamp and names it per message, so
        // pin their footprint for the dab loop and restore it after — the same
        // pin-then-restore processReplay uses for recorded strokes (05d).
        //
        // __remoteStroke still guards the fallback: a shape we have NOT got
        // (definition still in flight, or dropped) suppresses stamps entirely
        // rather than printing the stroke in whatever shape this client has
        // selected. Peer dabs are never held waiting for an upload — a pinned
        // peer id is not in the local library, so stampPending() has nothing
        // to wait for and the dab falls through to the built-in tip.
        const _rd = data.data || {};
        let _pinShape = false, _pinTip = false, _pinAng = false;
        let _shapePrev, _tipPrev, _angPrev;
        if (window.config) {
            if (typeof _rd.shape === 'string' && window.BrushShapes
                && typeof window.BrushShapes.peerReady === 'function'
                && window.BrushShapes.peerReady(_rd.shape)) {
                _pinShape = true;
                _shapePrev = window.config.BRUSH_SHAPE_ID;
                window.config.BRUSH_SHAPE_ID = _rd.shape;
            }
            if (typeof _rd.tip === 'number') {
                _pinTip = true;
                _tipPrev = window.config.BRUSH_TIP;
                window.config.BRUSH_TIP = _rd.tip | 0;
            }
            if (typeof _rd.angle === 'number' && isFinite(_rd.angle)) {
                _pinAng = true;
                _angPrev = window.config.BRUSH_ANGLE;
                window.config.BRUSH_ANGLE = _rd.angle;
            }
        }
        window.__remoteStroke = !_pinShape;
        // Apply the SENDER's symmetry layout when the message carries it
        // (2026-08-16 fidelity audit: a mirrorX painter measured as radial on
        // the peer — the arms are positions, not styling). Unknown strings
        // old senders omit the field and keep the viewer's own mode, as before.
        // The value is COERCED through the registry before it touches config: a
        // peer on a cached bundle can still send a retired mode ('spiral'), and
        // writing that raw let the 2s mirror poll re-persist and re-broadcast it
        // — the same way a retired arm-colour mode came back from the dead once.
        var _symPrev = null;
        if (data.data && typeof data.data.sym === 'string' && window.config) {
            var _sym = data.data.sym;
            try {
                if (window.ParamRegistry && window.ParamRegistry.coerceSelect) {
                    _sym = window.ParamRegistry.coerceSelect('symmetryMode', _sym) || 'radial';
                }
            } catch (_) {}
            if (_sym !== window.config.SYMMETRY_MODE) {
                _symPrev = window.config.SYMMETRY_MODE;
                window.config.SYMMETRY_MODE = _sym;
            }
        }
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
            // A press stamp OPENS a stroke, so it must never gap-fill from
            // wherever the last one ended: measured (2026-08-16 audit) as 8
            // phantom dabs painting a straight line from the end of the
            // previous stroke to the start of the next. pointer-up clears the
            // position, but the release TAIL now streams dabs after it and
            // re-seeds it, so the flag is what makes this reliable.
            if (data.data.down) remoteLastPositions.delete(data.clientId);
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
            window.__remoteStroke = false;
            if (_symPrev !== null) window.config.SYMMETRY_MODE = _symPrev;
            // Restore on explicit flags, not on "was it null": BRUSH_SHAPE_ID
            // is legitimately null whenever the viewer has no shape selected,
            // and a null-sentinel check would leave the PEER's id active on
            // this client — their shape would quietly become the local brush.
            if (_pinShape) window.config.BRUSH_SHAPE_ID = _shapePrev;
            if (_pinTip) window.config.BRUSH_TIP = _tipPrev;
            if (_pinAng) window.config.BRUSH_ANGLE = _angPrev;
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
    // Publish every stamp this stroke references before the events that name
    // them: a replay can span shapes the painter switched between, and the
    // one selected NOW may not be any of them.
    const shapeIds = [];
    (events || []).forEach(ev => {
        if (typeof ev.shape === 'string' && ev.shape && shapeIds.indexOf(ev.shape) < 0) {
            shapeIds.push(ev.shape);
        }
    });
    const shapeRevs = {};
    shapeIds.forEach(id => { const r = publishShape(id); if (r) shapeRevs[id] = r; });

    const q = (events || []).map(ev => {
        const o = {
            t: Math.round(ev.t || 0),
            x: +(+ev.x || 0).toFixed(4),
            y: +(+ev.y || 0).toFixed(4),
            dx: +(+ev.dx || 0).toFixed(4),
            dy: +(+ev.dy || 0).toFixed(4),
            color: (ev.color || [1, 1, 1]).map(c => +(+c).toFixed(3)),
            mult: ev.mult || 1,
            radius: +(+ev.radius || 0.01).toFixed(5)
        };
        // The footprint the dab was painted with. Dropping these here was why
        // a broadcast replay of a shaped stroke came out gaussian on peers
        // even though the events carried the shape locally (05d).
        if (typeof ev.tip === 'number') o.tip = ev.tip | 0;
        if (ev.shape && shapeRevs[ev.shape]) o.shape = ev.shape;
        return o;
    });
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
        // Waiting alone is NOT the same as painting together: show the amber
        // dot while alone, and SAY it when a partner leaves. This used to
        // slide back silently — green dot, connected panel — which read as
        // "still connected" while you kept painting for nobody.
        var dot = document.getElementById('connectionDot');
        if (dot) dot.className = alone ? 'mp-dot mp-dot-connecting' : 'mp-dot mp-dot-connected';
        if (alone) {
            if (strangerWasPaired) {
                strangerWasPaired = false;
                showTurnToast('🚪 Your painting partner left — looking for a new stranger…');
            }
            // Hold our matchmaking slot while alone; drop it (and the lobby
            // pin socket that holds it open) the moment we pair.
            if (!strangerKeepAlive) startStrangerKeepAlive();
        } else {
            strangerWasPaired = true;
            stopStrangerKeepAlive();
            closeMatchmaking();
        }
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
    // Wrapped: registering the function directly would pass the MouseEvent
    // as the rememberRoom param — a deliberate Disconnect is a clean exit
    // and must NOT offer Reconnect or overwrite lastRoom.
    if (discBtn) discBtn.addEventListener('click', function () { disconnectMultiplayer(); });

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

    var turnTimerSel = document.getElementById('turnTimerSel');
    if (turnTimerSel) turnTimerSel.addEventListener('change', function () {
        // Host changing the length mid-round applies it immediately
        // (restarts the current turn's clock server-side).
        if (turnsOn && myRole === 'host' && partySocket && partySocket.readyState === WebSocket.OPEN) {
            partySocket.send(JSON.stringify({ type: 'turns', on: true, seconds: turnTimerSeconds() }));
        }
    });

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
// 33-brush-shapes calls this when a shape is picked or re-stamped, so peers
// decode the bitmap before the first dab that references it.
window.publishBrushShape = publishShape;
// 23-depth-collision calls these when a wall is built, changed, or deleted.
window.publishCollider = publishCollider;
window.broadcastColliderRemove = broadcastColliderRemove;
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
