import type * as Party from "partykit/server";

interface FluidInteraction {
  type: 'splat' | 'cursor' | 'clear' | 'preset';
  clientId: string;
  timestamp: number;
  data: any;
}

export default class FluidPartyServer implements Party.Server {
  constructor(readonly room: Party.Room) {}
  
  // Track connected clients
  connections: Map<string, Party.Connection> = new Map();
  
  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    // Store the connection
    this.connections.set(conn.id, conn);
    
    // Send current client count to all clients
    this.broadcastClientCount();
    
    // Send welcome message to new client
    conn.send(JSON.stringify({
      type: 'connected',
      clientId: conn.id,
      timestamp: Date.now(),
      totalClients: this.connections.size
    }));
    
    console.log(`Client ${conn.id} connected. Total clients: ${this.connections.size}`);
  }
  
  onMessage(message: string, sender: Party.Connection) {
    try {
      const data = JSON.parse(message) as FluidInteraction;
      
      // Add sender ID if not present
      if (!data.clientId) {
        data.clientId = sender.id;
      }
      
      // Add timestamp if not present
      if (!data.timestamp) {
        data.timestamp = Date.now();
      }
      
      // Broadcast to all other clients (not the sender)
      this.room.broadcast(
        JSON.stringify(data),
        [sender.id] // exclude sender
      );
      
    } catch (error) {
      console.error('Error processing message:', error);
    }
  }
  
  onClose(conn: Party.Connection) {
    this.connections.delete(conn.id);
    this.broadcastClientCount();
    console.log(`Client ${conn.id} disconnected. Total clients: ${this.connections.size}`);
  }
  
  onError(conn: Party.Connection, error: Error) {
    console.error(`Error for client ${conn.id}:`, error);
  }
  
  // Helper method to broadcast client count
  broadcastClientCount() {
    this.room.broadcast(JSON.stringify({
      type: 'client-count',
      count: this.connections.size,
      timestamp: Date.now()
    }));
  }
}

FluidPartyServer satisfies Party.Worker;
