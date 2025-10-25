// Multiplayer functionality using PartyKit

// Multiplayer state
let partySocket = null;
let isMultiplayerEnabled = false;
let connectedClients = 0;
let clientId = null;
let remoteCursors = new Map(); // Map of clientId -> cursor data

// Configuration
const PARTYKIT_HOST = window.location.hostname === 'localhost'
    ? 'localhost:1999'
    : 'YOUR_PARTYKIT_HOST.partykit.dev';
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

            case 'cursor':
                // Receive cursor position from another client
                if (data.clientId !== clientId) {
                    handleRemoteCursor(data);
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

// Send local interaction to other clients
function broadcastSplat(x, y, dx, dy, color) {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN) {
        return;
    }

    partySocket.send(JSON.stringify({
        type: 'splat',
        data: { x, y, dx, dy, color },
        timestamp: Date.now()
    }));
}

// Send cursor position to other clients
function broadcastCursor(x, y) {
    if (!isMultiplayerEnabled || !partySocket || partySocket.readyState !== WebSocket.OPEN) {
        return;
    }

    // Throttle cursor updates (send max every 50ms)
    if (!broadcastCursor.lastSent || Date.now() - broadcastCursor.lastSent > 50) {
        partySocket.send(JSON.stringify({
            type: 'cursor',
            data: { x, y },
            timestamp: Date.now()
        }));
        broadcastCursor.lastSent = Date.now();
    }
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

// Handle splat from remote client
function handleRemoteSplat(data) {
    if (typeof splat === 'function') {
        const { x, y, dx, dy, color } = data.data;
        // Convert normalized coordinates back to canvas coordinates
        const canvasX = x * canvas.width;
        const canvasY = y * canvas.height;
        const canvasDx = dx * canvas.width;
        const canvasDy = dy * canvas.height;

        // Apply the splat with the remote color
        if (color) {
            const oldColor = config.POINTER_COLOR;
            config.POINTER_COLOR = color;
            splat(canvasX, canvasY, canvasDx, canvasDy);
            config.POINTER_COLOR = oldColor;
        } else {
            splat(canvasX, canvasY, canvasDx, canvasDy);
        }
    }
}

// Handle cursor from remote client
function handleRemoteCursor(data) {
    const { x, y } = data.data;
    remoteCursors.set(data.clientId, { x, y, timestamp: data.timestamp });
    updateRemoteCursors();
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

console.log('Multiplayer module loaded. Room:', ROOM_NAME);

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMultiplayerUI);
} else {
    // DOM already loaded
    initMultiplayerUI();
}
