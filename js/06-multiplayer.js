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
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 5;

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

// Create a new room
function createRoom() {
    const code = generateRoomCode();
    connectToRoom(code);
}

// Join an existing room by code
function joinRoom(code) {
    if (!code || typeof code !== 'string') return showMpError('Enter a room code');
    code = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 3) return showMpError('Code too short');
    connectToRoom(code);
}

// Core connect logic
function connectToRoom(roomCode) {
    if (partySocket && partySocket.readyState === WebSocket.OPEN) {
        disconnectMultiplayer();
    }
    hideMpError();
    currentRoom = roomCode;
    reconnectAttempts = 0;

    // Update URL hash
    history.replaceState(null, '', '#' + roomCode);

    doConnect();
}

function doConnect() {
    if (!currentRoom) return;
    try {
        const isLocal = PARTYKIT_HOST.startsWith('localhost') || PARTYKIT_HOST.startsWith('127.0.0.1');
        const protocol = isLocal ? 'ws:' : 'wss:';
        const url = `${protocol}//${PARTYKIT_HOST}/parties/fluid/${currentRoom}`;
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
                    showMpError('Server unreachable. Deploy with: npx partykit deploy');
                    currentRoom = null;
                    showDisconnectedUI();
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
    currentRoom = null;
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
                updateMultiplayerStatus('Connected');
                updateUsersDisplay();
                break;

            case 'client-count':
                connectedClients = data.count;
                updateMultiplayerStatus('Connected');
                updateUsersDisplay();
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
                // Another client applied a preset
                if (data.clientId !== clientId && typeof applyPreset === 'function') {
                    applyPreset(data.data.preset);
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
    // Auto-reconnect if we still have a room
    if (currentRoom && reconnectAttempts < MAX_RECONNECT) {
        reconnectAttempts++;
        var delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 8000);
        updateMultiplayerStatus('Reconnecting (' + reconnectAttempts + ')...');
        reconnectTimer = setTimeout(doConnect, delay);
    } else if (currentRoom) {
        showMpError('Connection lost. Try again.');
        currentRoom = null;
        showDisconnectedUI();
    }
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

    partySocket.send(JSON.stringify({
        type: 'splat',
        data: { x, y, dx, dy, color, mult, radius },
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
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN) {
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
            
            if (lastPos && lastPos.x !== undefined && lastPos.y !== undefined) {
                const distX = canvasX - lastPos.x;
                const distY = canvasY - lastPos.y;
                const distance = Math.sqrt(distX * distX + distY * distY);
                
                if (distance > 1) {
                    const steps = Math.min(Math.floor(distance / 2), 30);
                    
                    for (let i = 1; i <= steps; i++) {
                        const t = i / (steps + 1);
                        const interpX = lastPos.x + distX * t;
                        const interpY = lastPos.y + distY * t;
                        
                        if (typeof window.applyMultiSplatWith === 'function') {
                            window.applyMultiSplatWith(interpX, interpY, canvasDx, canvasDy, color || [1,0,0], mult || 1, normalizedRadius);
                        } else {
                            splat(interpX, interpY, canvasDx, canvasDy, color || [1,0,0]);
                        }
                    }
                }
            }
            
            if (typeof window.applyMultiSplatWith === 'function') {
                window.applyMultiSplatWith(canvasX, canvasY, canvasDx, canvasDy, color || [1,0,0], mult || 1, normalizedRadius);
            } else {
                splat(canvasX, canvasY, canvasDx, canvasDy, color || [1,0,0]);
            }
            
            remoteLastPositions.set(data.clientId, { x: canvasX, y: canvasY });
        } finally {
            isProcessingRemoteEvent = false;
        }
    }
}

// Broadcast a full stroke (array of normalized events)
function broadcastReplayStroke(events) {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN) {
        return;
    }
    partySocket.send(JSON.stringify({
        type: 'stroke',
        data: { events },
        timestamp: Date.now()
    }));
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

// Update remote cursor display
function updateRemoteCursors() {
    // Remove old cursors (older than 5 seconds)
    const now = Date.now();
    for (const [id, cursor] of remoteCursors.entries()) {
        if (now - cursor.timestamp > 5000) {
            remoteCursors.delete(id);
        }
    }

    // Clear existing remote cursors
    clearRemoteCursors();

    // Create cursor elements for each remote client
    for (const [id, cursor] of remoteCursors.entries()) {
        let cursorEl = document.getElementById(`remote-cursor-${id}`);
        if (!cursorEl) {
            cursorEl = document.createElement('div');
            cursorEl.id = `remote-cursor-${id}`;
            cursorEl.className = 'remote-cursor';
            cursorEl.style.position = 'absolute';
            cursorEl.style.width = '12px';
            cursorEl.style.height = '12px';
            cursorEl.style.borderRadius = '50%';
            cursorEl.style.border = '2px solid rgba(255, 255, 255, 0.8)';
            cursorEl.style.backgroundColor = 'rgba(100, 200, 255, 0.5)';
            cursorEl.style.pointerEvents = 'none';
            cursorEl.style.zIndex = '1000';
            cursorEl.style.transform = 'translate(-50%, -50%)';
            cursorEl.style.transition = 'left 0.05s, top 0.05s';
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
function showConnecting() {
    var dc = document.getElementById('mpDisconnected');
    var cn = document.getElementById('mpConnected');
    if (dc) dc.style.display = 'none';
    if (cn) {
        cn.style.display = '';
        updateMultiplayerStatus('Connecting...');
        var dot = document.getElementById('connectionDot');
        if (dot) { dot.className = 'mp-dot mp-dot-connecting'; }
    }
    var roomEl = document.getElementById('roomName');
    if (roomEl) roomEl.textContent = currentRoom || '------';
}

function showConnectedUI() {
    var dc = document.getElementById('mpDisconnected');
    var cn = document.getElementById('mpConnected');
    if (dc) dc.style.display = 'none';
    if (cn) cn.style.display = '';
    var dot = document.getElementById('connectionDot');
    if (dot) { dot.className = 'mp-dot mp-dot-connected'; }
    var roomEl = document.getElementById('roomName');
    if (roomEl) roomEl.textContent = currentRoom || '------';
    updateMultiplayerStatus('Connected');
    updateUsersDisplay();
}

function showDisconnectedUI() {
    var dc = document.getElementById('mpDisconnected');
    var cn = document.getElementById('mpConnected');
    if (dc) dc.style.display = '';
    if (cn) cn.style.display = 'none';
    var toggle = document.getElementById('multiplayerToggle');
    if (toggle) toggle.checked = false;
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

// Copy room URL to clipboard
function copyRoomUrl() {
    if (!currentRoom) return;
    var url = window.location.origin + window.location.pathname + '#' + currentRoom;
    navigator.clipboard.writeText(url).then(function() {
        var btn = document.getElementById('copyRoomBtn');
        if (btn) {
            btn.textContent = '✓ Copied!';
            setTimeout(function() { btn.textContent = '📋 Copy Link'; }, 2000);
        }
    }).catch(function(err) {
        // Fallback: select + copy
        var ta = document.createElement('textarea');
        ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch(_) {}
        document.body.removeChild(ta);
        var btn = document.getElementById('copyRoomBtn');
        if (btn) { btn.textContent = '✓ Copied!'; setTimeout(function() { btn.textContent = '📋 Copy Link'; }, 2000); }
    });
}

// Initialize multiplayer UI + auto-join from hash
function initMultiplayerUI() {
    // Wire up buttons
    var createBtn = document.getElementById('createRoomBtn');
    if (createBtn) createBtn.addEventListener('click', createRoom);

    var joinBtn = document.getElementById('joinRoomBtn');
    var joinInput = document.getElementById('joinRoomInput');
    if (joinBtn) joinBtn.addEventListener('click', function() { joinRoom(joinInput ? joinInput.value : ''); });
    if (joinInput) joinInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') joinRoom(joinInput.value); });

    var copyBtn = document.getElementById('copyRoomBtn');
    if (copyBtn) copyBtn.addEventListener('click', copyRoomUrl);

    var discBtn = document.getElementById('disconnectBtn');
    if (discBtn) discBtn.addEventListener('click', disconnectMultiplayer);

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
window.copyRoomUrl = copyRoomUrl;
window.disconnectMultiplayer = disconnectMultiplayer;

console.log('Multiplayer module loaded. PartyKit host:', PARTYKIT_HOST);

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMultiplayerUI);
} else {
    initMultiplayerUI();
}
