/**
 * Standalone WebSocket relay server for Swirl Together multiplayer.
 * Replaces PartyKit for local development.
 * 
 * Usage:  node server-relay.js
 * Runs on port 1999 (same as PartyKit dev default).
 */

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = parseInt(process.env.PORT || '1999', 10);

// Room -> Set<ws>
const rooms = new Map();

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Swirl Together — Relay Server\n');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    // Extract room from URL: /parties/fluid/{roomCode}
    const match = (req.url || '').match(/\/parties\/fluid\/([A-Za-z0-9_-]+)/);
    const roomCode = match ? match[1].toUpperCase() : 'DEFAULT';

    // Generate a unique client ID
    const clientId = 'c_' + Math.random().toString(36).substring(2, 10);

    // Join room
    if (!rooms.has(roomCode)) rooms.set(roomCode, new Set());
    const room = rooms.get(roomCode);
    room.add(ws);

    ws._clientId = clientId;
    ws._room = roomCode;

    console.log(`[${roomCode}] Client ${clientId} connected (${room.size} total)`);

    // Send welcome
    ws.send(JSON.stringify({
        type: 'connected',
        clientId: clientId,
        totalClients: room.size,
        timestamp: Date.now()
    }));

    // Broadcast updated count to all in room
    broadcastToRoom(roomCode, JSON.stringify({
        type: 'client-count',
        count: room.size,
        timestamp: Date.now()
    }));

    // Handle messages
    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw.toString());
            if (!data.clientId) data.clientId = clientId;
            if (!data.timestamp) data.timestamp = Date.now();

            // Broadcast to all OTHER clients in the room
            const msg = JSON.stringify(data);
            for (const client of room) {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(msg);
                }
            }
        } catch (err) {
            console.error('Bad message:', err.message);
        }
    });

    // Handle disconnect
    ws.on('close', () => {
        room.delete(ws);
        console.log(`[${roomCode}] Client ${clientId} disconnected (${room.size} remaining)`);

        if (room.size === 0) {
            rooms.delete(roomCode);
        } else {
            broadcastToRoom(roomCode, JSON.stringify({
                type: 'client-count',
                count: room.size,
                timestamp: Date.now()
            }));
        }
    });

    ws.on('error', (err) => {
        console.error(`[${roomCode}] Client ${clientId} error:`, err.message);
    });
});

function broadcastToRoom(roomCode, msg) {
    const room = rooms.get(roomCode);
    if (!room) return;
    for (const client of room) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    }
}

server.listen(PORT, () => {
    console.log(`\n🎨 Swirl Together relay server running on ws://localhost:${PORT}`);
    console.log(`   Rooms are created on-demand via /parties/fluid/{ROOM_CODE}\n`);
});
