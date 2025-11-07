// Multiplayer functionality using PartyKit

// Multiplayer state
let partySocket = null;
let isMultiplayerEnabled = false;
let connectedClients = 0;
let clientId = null;
let remoteCursors = new Map();
let isProcessingRemoteEvent = false;
let remoteLastPositions = new Map();

// Configuration
// If running on localhost, PartyKit server is always on port 1999
// regardless of which port the static files are served from
const PARTYKIT_HOST = (function() {
    if (window.PARTYKIT_HOST && typeof window.PARTYKIT_HOST === 'string') return window.PARTYKIT_HOST;
    const host = window.location.host;
    const hn = window.location.hostname;
    if (hn === 'localhost' || hn === '127.0.0.1') return 'localhost:1999';
    if (/\.partykit\.dev$/.test(host)) return host;
    return 'fluid-ui-multiplayer.gabrielmtn.partykit.dev';
})();
const ROOM_NAME = window.location.hash ? window.location.hash.substring(1) : 'default-room';

// Initialize multiplayer
function initMultiplayer() {
    if (!document.getElementById('multiplayerToggle')?.checked) {
        disconnectMultiplayer();
        return;
    }

    if (partySocket && partySocket.readyState === WebSocket.OPEN) {
        console.log('Already connected to multiplayer');
        return;
    }

    try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${PARTYKIT_HOST}/parties/fluid/${ROOM_NAME}`;

        console.log('Connecting to PartyKit:', url);
        partySocket = new WebSocket(url);

        partySocket.addEventListener('open', onMultiplayerOpen);
        partySocket.addEventListener('message', onMultiplayerMessage);
        partySocket.addEventListener('close', onMultiplayerClose);
        partySocket.addEventListener('error', onMultiplayerError);

    } catch (error) {
        console.error('Error connecting to multiplayer:', error);
        updateMultiplayerStatus('Error connecting');
    }
}

function disconnectMultiplayer() {
    if (partySocket) {
        partySocket.close();
        partySocket = null;
    }
    isMultiplayerEnabled = false;
    connectedClients = 0;
    remoteCursors.clear();
    updateMultiplayerStatus('Disconnected');
    clearRemoteCursors();
}

function onMultiplayerOpen(event) {
    console.log('Connected to multiplayer!');
    isMultiplayerEnabled = true;
    updateMultiplayerStatus('Connected');
}

function onMultiplayerMessage(event) {
    try {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'connected':
                clientId = data.clientId;
                connectedClients = data.totalClients;
                updateMultiplayerStatus(`Connected (${connectedClients} ${connectedClients === 1 ? 'user' : 'users'})`);
                break;

            case 'client-count':
                connectedClients = data.count;
                updateMultiplayerStatus(`Connected (${connectedClients} ${connectedClients === 1 ? 'user' : 'users'})`);
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
    updateMultiplayerStatus('Disconnected');
    clearRemoteCursors();
}

function onMultiplayerError(error) {
    console.error('Multiplayer error:', error);
    updateMultiplayerStatus('Connection error');
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

// Copy room URL to clipboard
function copyRoomUrl() {
    const url = `${window.location.origin}${window.location.pathname}#${ROOM_NAME}`;
    navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById('copyRoomBtn');
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = '✓ Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        }
    }).catch(err => {
        console.error('Failed to copy URL:', err);
    });
}

// Initialize multiplayer UI
function initMultiplayerUI() {
    // Update room name display
    const roomNameEl = document.getElementById('roomName');
    if (roomNameEl) {
        roomNameEl.textContent = ROOM_NAME;
    }
}

window.isProcessingRemoteEvent = function() { return isProcessingRemoteEvent; };
window.broadcastSplat = broadcastSplat;
window.broadcastCursor = broadcastCursor;
window.broadcastPointerUp = broadcastPointerUp;
window.broadcastClear = broadcastClear;
window.broadcastPreset = broadcastPreset;
window.broadcastReplayStroke = broadcastReplayStroke;

console.log('Multiplayer module loaded. Room:', ROOM_NAME);

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMultiplayerUI);
} else {
    // DOM already loaded
    initMultiplayerUI();
}
