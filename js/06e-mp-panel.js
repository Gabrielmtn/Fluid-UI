// ================================================================
// 06e-mp-panel.js — Swirl Together client: the room panel + init.
// Remote cursors, connection status, the connected / disconnected views,
// the invite display (Code / QR / Hide), copy, the control listeners, the
// window.* exposes other modules call, and the init that runs last.
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
    updateMultiplayerStatus('Finding a stranger…');
    ['roomDisplay', 'shareHint', 'copyRoomBtn', 'lockRoomBtn', 'lockBadge'].forEach(function(id) { setShown(id, false); });
}

function showConnecting() {
    setShown('mpDisconnected', false);
    setShown('mpConnected', true);
    var dot = document.getElementById('connectionDot');
    if (dot) dot.className = 'mp-dot mp-dot-connecting';
    updateMultiplayerStatus(isStrangerRoom() ? 'Finding a stranger…' : 'Connecting…');
    setShown('roomDisplay', !isStrangerRoom());
    if (!isStrangerRoom()) renderShareMode();
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
        updateMultiplayerStatus(alone ? 'Waiting for a stranger…' : 'Swirling with a stranger');
        // Waiting alone is NOT the same as swirling together, so the dot goes
        // amber while alone. It only ever reads "alone" before anyone arrives
        // now — a partner LEAVING ends the room outright (strangerPartnerLeft).
        var dot = document.getElementById('connectionDot');
        if (dot) dot.className = alone ? 'mp-dot mp-dot-connecting' : 'mp-dot mp-dot-connected';
        if (alone) {
            if (strangerWasPaired) {
                // They left, so the pairing is over (see strangerPartnerLeft).
                // Return: the rest of this pass would be dressing a room we
                // are no longer in.
                strangerPartnerLeft();
                return;
            }
            // Nobody has arrived yet — that is not a departure. Hold our
            // matchmaking slot while we wait, and drop it (with the lobby pin
            // socket that holds it open) the moment someone pairs with us.
            if (!strangerKeepAlive) startStrangerKeepAlive();
        } else {
            strangerWasPaired = true;
            stopStrangerKeepAlive();
            closeMatchmaking();
        }
    } else {
        stopStrangerKeepAlive();
        updateMultiplayerStatus(roomLocked ? 'Room locked' : 'Connected');
    }

    // Room code / share / copy: private rooms only (you can't invite to a 1:1 pairing).
    setShown('roomDisplay', !stranger);
    setShown('shareHint', !stranger);
    setShown('copyRoomBtn', !stranger);
    // Through renderShareMode, never straight to textContent: a direct write
    // would unmask a room the user deliberately hid.
    if (!stranger) renderShareMode();

    // Lock toggle: only the host of a private room sees it.
    var lockBtn = document.getElementById('lockRoomBtn');
    if (lockBtn) {
        var canLock = !stranger && isHost;
        lockBtn.style.display = canLock ? '' : 'none';
        lockBtn.textContent = roomLocked ? 'Unlock room' : 'Lock room';
    }
    // Settings lock (13.5): any host can lock look settings (incl. stranger
    // rooms) — hidden while turns run, which supersede it.
    var sLockBtn = document.getElementById('settingsLockBtn');
    if (sLockBtn) {
        sLockBtn.style.display = (isHost && !turnsOn) ? '' : 'none';
        sLockBtn.textContent = settingsLockOn ? 'Unlock settings' : 'Lock settings';
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
    if (el) el.textContent = connectedClients + (connectedClients === 1 ? ' artist' : ' artists');
}

// `notice` marks an outcome that is not a failure (a stranger leaving) so it
// does not arrive dressed as one — same slot, neutral colour.
function showMpError(msg, notice) {
    var el = document.getElementById('mpError');
    if (el) {
        el.textContent = msg;
        el.classList.toggle('mp-notice', !!notice);
        el.style.display = '';
    }
}
function hideMpError() {
    var el = document.getElementById('mpError');
    if (el) el.style.display = 'none';
}

// ── Sharing a room: code, QR, or hidden ────────────────────
// A room code on screen is a live invitation to anyone who can read it. That
// is exactly what you want at a table and exactly what you do not want on a
// stream, so how a room is shared is a choice, not a constant:
//
//   code    the six characters, to read out or type
//   qr      a scannable link, for a phone in the same room
//   hidden  nothing on screen — Copy still works, so the code can go into a
//           DM without ever being visible to a viewer
//
// The choice persists: someone who streams sets it once and should not have
// to remember again next session. Written straight to localStorage rather
// than through the settings snapshot, because a privacy choice has to survive
// a settings clear and must not wait for a Save.
var SHARE_MODE_KEY = 'swirlShareMode';
var shareMode = (function () {
    try {
        var v = localStorage.getItem(SHARE_MODE_KEY);
        return (v === 'qr' || v === 'hidden') ? v : 'code';
    } catch (_) { return 'code'; }
})();

// The link a scanned QR opens. On the web that is this origin; the desktop
// build runs from file://, which no phone can follow, so it falls back to the
// deployed host the relay already lives on.
function roomJoinUrl() {
    if (!currentRoom) return '';
    var base = (location.protocol === 'http:' || location.protocol === 'https:')
        ? location.origin + location.pathname.replace(/[^/]*$/, '')
        : 'https://' + PARTYKIT_HOST + '/';
    return base + '#' + currentRoom;
}

function setShareMode(mode) {
    shareMode = mode;
    try { localStorage.setItem(SHARE_MODE_KEY, mode); } catch (_) {}
    renderShareMode();
}

function renderShareMode() {
    var codeEl = document.getElementById('roomName');
    if (!codeEl) return;
    var qrEl = document.getElementById('roomQr');
    var hintEl = document.getElementById('shareHint');
    var copyEl = document.getElementById('copyRoomBtn');

    var ids = { code: 'shareModeCode', qr: 'shareModeQr', hidden: 'shareModeHidden' };
    Object.keys(ids).forEach(function (k) {
        var b = document.getElementById(ids[k]);
        if (b) b.setAttribute('aria-pressed', String(k === shareMode));
    });

    // QR falls back to the code rather than to an empty white box if the
    // encoder failed to load or the link outgrew the symbol.
    var qrOk = false;
    if (shareMode === 'qr' && qrEl && window.QRCode && currentRoom) {
        var svg = window.QRCode.svg(roomJoinUrl(), { margin: 3 });
        if (svg) { qrEl.innerHTML = svg; qrOk = true; }
    }
    var mode = (shareMode === 'qr' && !qrOk) ? 'code' : shareMode;

    codeEl.textContent = mode === 'hidden' ? '●●●●●●' : (currentRoom || '------');
    codeEl.classList.toggle('mp-code-hidden', mode === 'hidden');
    codeEl.style.display = mode === 'qr' ? 'none' : '';
    if (qrEl) {
        qrEl.style.display = mode === 'qr' ? '' : 'none';
        // Emptied, not just hidden. Hide mode exists so the code is not on
        // screen; leaving a rendered symbol behind display:none would put it
        // one stray style override away from being visible again.
        if (mode !== 'qr') qrEl.innerHTML = '';
    }

    if (hintEl) {
        hintEl.textContent =
            mode === 'qr'     ? 'Point a phone camera at this to join.' :
            mode === 'hidden' ? 'Hidden — safe to show on a stream. Copy still works.' :
                                'Send this code to a friend so they can join.';
    }
    if (copyEl) copyEl.textContent = mode === 'qr' ? 'Copy link' : 'Copy code';
}

// The room-wide controls hide as a group when nothing inside them applies, so
// a guest is never left looking at an empty labelled box.
function syncHostBlock() {
    var block = document.getElementById('mpHostBlock');
    if (!block) return;
    var any = ['lockRoomBtn', 'settingsLockBtn', 'turnsBtn', 'callReturnBtn', 'turnLengthRow'].some(function (id) {
        var el = document.getElementById(id);
        return el && el.style.display !== 'none';
    });
    block.style.display = any ? '' : 'none';
}

// Copy the invite. What gets copied follows the share mode: the code in
// Code and Hide, the full link in QR. Hide is the case that matters — the
// code reaches the clipboard without ever being drawn on screen.
function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
}
function copyRoomCode(fromCreate) {
    if (!currentRoom) return;
    var asLink = shareMode === 'qr';
    var text = asLink ? roomJoinUrl() : currentRoom;
    var idle = asLink ? 'Copy link' : 'Copy code';
    var flash = function () {
        var btn = document.getElementById('copyRoomBtn');
        if (!btn) return;
        btn.textContent = fromCreate ? 'Copied — send it to a friend' : 'Copied';
        setTimeout(function () { btn.textContent = idle; }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(flash).catch(function () { fallbackCopy(text); flash(); });
    } else {
        fallbackCopy(text); flash();
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

    // Code / QR / Hide. Re-rendered rather than toggled so the QR is only
    // ever built when it is about to be looked at.
    [['shareModeCode', 'code'], ['shareModeQr', 'qr'], ['shareModeHidden', 'hidden']].forEach(function (pair) {
        var b = document.getElementById(pair[0]);
        if (b) b.addEventListener('click', function () { setShareMode(pair[1]); });
    });
    renderShareMode();

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
    if (strangerBtn) strangerBtn.addEventListener('click', swirlWithStranger);

    var lockBtn = document.getElementById('lockRoomBtn');
    if (lockBtn) lockBtn.addEventListener('click', toggleLock);

    var sLockBtn = document.getElementById('settingsLockBtn');
    if (sLockBtn) sLockBtn.addEventListener('click', toggleSettingsLock);

    var turnsBtn = document.getElementById('turnsBtn');
    if (turnsBtn) turnsBtn.addEventListener('click', toggleTurns);

    var turnPassBtn = document.getElementById('turnPassBtn');
    if (turnPassBtn) turnPassBtn.addEventListener('click', passTurn);

    var callReturnBtn = document.getElementById('callReturnBtn');
    if (callReturnBtn) callReturnBtn.addEventListener('click', toggleCallReturn);

    var turnLength = document.getElementById('turnLength');
    if (turnLength) {
        turnLength.addEventListener('input', renderTurnLengthValue);
        turnLength.addEventListener('change', function () {
            // Host changing the length mid-round applies it immediately
            // (restarts the current turn's clock server-side). Only the timed
            // rhythm has a length; call and return ignores it.
            if (turnsOn && turnModeLocal === 'timer' && myRole === 'host' &&
                partySocket && partySocket.readyState === WebSocket.OPEN) {
                partySocket.send(JSON.stringify({
                    type: 'turns', on: true, seconds: turnTimerSeconds(), mode: 'timer'
                }));
            }
        });
        renderTurnLengthValue();
    }

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
window.swirlWithStranger = swirlWithStranger;
window.toggleLock = toggleLock;
window.toggleTurns = toggleTurns;
window.toggleCallReturn = toggleCallReturn;
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
