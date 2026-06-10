// Multiplayer module for community centering exercise
// Uses PartyKit for real-time WebSocket communication

const Multiplayer = (function() {
    let socket = null;
    let clientId = null;
    let myColor = [0.5, 0.5, 1.0];
    let isConnected = false;
    let participantCount = 0;
    let remoteCursors = new Map();
    let onSplatCallback = null;
    let onParticipantsCallback = null;
    let onStatusCallback = null;
    
    // Use existing Fluid-UI PartyKit server (already deployed)
    // This reuses the same infrastructure - just a different room name
    const PARTYKIT_HOST = (function() {
        const host = window.location.host;
        if (/\.partykit\.dev$/.test(host)) return host;
        // Use the existing Fluid-UI multiplayer server
        return 'fluid-ui-multiplayer.gabrielmtn.partykit.dev';
    })();
    
    // Fixed room name for the centering exercise (separate from main Fluid-UI rooms)
    const ROOM_NAME = 'CENTERING';
    
    function connect() {
        if (socket && socket.readyState === WebSocket.OPEN) return;
        
        try {
            const isLocal = PARTYKIT_HOST.startsWith('localhost') || PARTYKIT_HOST.startsWith('127.0.0.1');
            const protocol = isLocal ? 'ws:' : 'wss:';
            const url = `${protocol}//${PARTYKIT_HOST}/parties/fluid/${ROOM_NAME}`;
            
            console.log('[Multiplayer] Connecting to:', url);
            if (onStatusCallback) onStatusCallback('Connecting...');
            
            socket = new WebSocket(url);
            
            socket.addEventListener('open', () => {
                console.log('[Multiplayer] Connected!');
                isConnected = true;
                if (onStatusCallback) onStatusCallback('Connected', true);
            });
            
            socket.addEventListener('message', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    handleMessage(data);
                } catch (e) {
                    console.error('[Multiplayer] Parse error:', e);
                }
            });
            
            socket.addEventListener('close', () => {
                console.log('[Multiplayer] Disconnected');
                isConnected = false;
                if (onStatusCallback) onStatusCallback('Reconnecting...');
                // Auto-reconnect after 2 seconds
                setTimeout(connect, 2000);
            });
            
            socket.addEventListener('error', (error) => {
                console.error('[Multiplayer] Error:', error);
            });
            
        } catch (error) {
            console.error('[Multiplayer] Connection failed:', error);
            if (onStatusCallback) onStatusCallback('Connection failed');
        }
    }
    
    function handleMessage(data) {
        switch (data.type) {
            case 'welcome':
                clientId = data.clientId;
                myColor = data.color || [0.5, 0.5, 1.0];
                participantCount = data.participants || 1;
                console.log('[Multiplayer] Welcome! ID:', clientId, 'Color:', myColor);
                if (onParticipantsCallback) onParticipantsCallback(participantCount);
                break;
                
            case 'participants':
                participantCount = data.count || 0;
                if (onParticipantsCallback) onParticipantsCallback(participantCount);
                break;
                
            case 'splat':
                if (data.clientId !== clientId && data.data) {
                    const { x, y, dx, dy, color } = data.data;
                    if (onSplatCallback) {
                        onSplatCallback(x, y, dx, dy, color || [0.5, 0.5, 1.0]);
                    }
                }
                break;
                
            case 'cursor':
                if (data.clientId !== clientId && data.data) {
                    updateRemoteCursor(data.clientId, data.data.x, data.data.y, data.data.color);
                }
                break;
        }
    }
    
    function updateRemoteCursor(id, x, y, color) {
        remoteCursors.set(id, { x, y, color, timestamp: Date.now() });
        renderRemoteCursors();
    }
    
    function renderRemoteCursors() {
        const container = document.getElementById('cursors');
        if (!container) return;
        
        // Clean up old cursors (>3 seconds)
        const now = Date.now();
        for (const [id, cursor] of remoteCursors.entries()) {
            if (now - cursor.timestamp > 3000) {
                remoteCursors.delete(id);
                const el = document.getElementById(`cursor-${id}`);
                if (el) el.remove();
            }
        }
        
        // Update/create cursor elements
        for (const [id, cursor] of remoteCursors.entries()) {
            let el = document.getElementById(`cursor-${id}`);
            if (!el) {
                el = document.createElement('div');
                el.id = `cursor-${id}`;
                el.className = 'remote-cursor';
                container.appendChild(el);
            }
            
            const color = cursor.color || [0.5, 0.5, 1.0];
            const cssColor = `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`;
            el.style.left = `${cursor.x * 100}%`;
            el.style.top = `${cursor.y * 100}%`;
            el.style.color = cssColor;
            el.style.borderColor = cssColor;
        }
    }
    
    // Throttle sending
    let lastSplatTime = 0;
    let lastCursorTime = 0;
    
    function sendSplat(x, y, dx, dy) {
        if (!isConnected || !socket || socket.readyState !== WebSocket.OPEN) return;
        
        const now = Date.now();
        if (now - lastSplatTime < 25) return; // 40fps max
        lastSplatTime = now;
        
        socket.send(JSON.stringify({
            type: 'splat',
            data: { x, y, dx, dy, color: myColor }
        }));
    }
    
    function sendCursor(x, y) {
        if (!isConnected || !socket || socket.readyState !== WebSocket.OPEN) return;
        
        const now = Date.now();
        if (now - lastCursorTime < 50) return; // 20fps max
        lastCursorTime = now;
        
        socket.send(JSON.stringify({
            type: 'cursor',
            data: { x, y, color: myColor }
        }));
    }
    
    function onSplat(callback) {
        onSplatCallback = callback;
    }
    
    function onParticipants(callback) {
        onParticipantsCallback = callback;
    }
    
    function onStatus(callback) {
        onStatusCallback = callback;
    }
    
    function getMyColor() {
        return myColor;
    }
    
    function getParticipantCount() {
        return participantCount;
    }
    
    return {
        connect,
        sendSplat,
        sendCursor,
        onSplat,
        onParticipants,
        onStatus,
        getMyColor,
        getParticipantCount
    };
})();
