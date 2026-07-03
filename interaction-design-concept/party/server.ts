import type * as Party from "partykit/server";

interface Interaction {
  type: 'splat' | 'cursor' | 'join' | 'leave';
  clientId: string;
  timestamp: number;
  data?: {
    x?: number;
    y?: number;
    dx?: number;
    dy?: number;
    color?: number[];
    name?: string;
  };
}

export default class CenteringRoom implements Party.Server {
  constructor(readonly room: Party.Room) {}
  
  connections: Map<string, { name: string; color: number[] }> = new Map();
  
  // Generate a random pastel color for each participant
  generateColor(): number[] {
    const hue = Math.random();
    const sat = 0.6 + Math.random() * 0.2;
    const light = 0.6 + Math.random() * 0.2;
    // HSL to RGB
    const c = (1 - Math.abs(2 * light - 1)) * sat;
    const x = c * (1 - Math.abs((hue * 6) % 2 - 1));
    const m = light - c / 2;
    let r = 0, g = 0, b = 0;
    if (hue < 1/6) { r = c; g = x; }
    else if (hue < 2/6) { r = x; g = c; }
    else if (hue < 3/6) { g = c; b = x; }
    else if (hue < 4/6) { g = x; b = c; }
    else if (hue < 5/6) { r = x; b = c; }
    else { r = c; b = x; }
    return [r + m, g + m, b + m];
  }
  
  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const color = this.generateColor();
    this.connections.set(conn.id, { name: `User ${this.connections.size + 1}`, color });
    
    // Send welcome with assigned color and participant count
    conn.send(JSON.stringify({
      type: 'welcome',
      clientId: conn.id,
      color,
      participants: this.connections.size,
      timestamp: Date.now()
    }));
    
    // Broadcast updated participant count
    this.broadcastParticipants();
    
    console.log(`[Centering] ${conn.id} joined. Total: ${this.connections.size}`);
  }
  
  onMessage(message: string, sender: Party.Connection) {
    try {
      const data = JSON.parse(message) as Interaction;
      data.clientId = sender.id;
      data.timestamp = Date.now();
      
      // Add sender's color to splat messages
      if (data.type === 'splat') {
        const info = this.connections.get(sender.id);
        if (info && data.data) {
          data.data.color = info.color;
        }
      }
      
      // Broadcast to all OTHER clients
      this.room.broadcast(JSON.stringify(data), [sender.id]);
      
    } catch (error) {
      console.error('[Centering] Message error:', error);
    }
  }
  
  onClose(conn: Party.Connection) {
    this.connections.delete(conn.id);
    this.broadcastParticipants();
    console.log(`[Centering] ${conn.id} left. Total: ${this.connections.size}`);
  }
  
  onError(conn: Party.Connection, error: Error) {
    console.error(`[Centering] Error for ${conn.id}:`, error);
  }
  
  broadcastParticipants() {
    this.room.broadcast(JSON.stringify({
      type: 'participants',
      count: this.connections.size,
      timestamp: Date.now()
    }));
  }
}

CenteringRoom satisfies Party.Worker;
