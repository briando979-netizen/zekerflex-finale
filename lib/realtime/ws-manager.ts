import { Server as HTTPServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { EventEmitter } from "events";

interface Connection {
  id: string;
  userId: string;
  socket: WebSocket;
  subscriptions: Set<string>;
  lastHeartbeat: number;
  metadata: Record<string, unknown>;
}

export class WSManager extends EventEmitter {
  private wss: WebSocketServer;
  private connections = new Map<string, Connection>();
  private rooms = new Map<string, Set<string>>();
  private messageQueue = new Map<string, unknown[]>();
  private heartbeatInterval: NodeJS.Timer | null = null;

  constructor(server: HTTPServer) {
    super();
    this.wss = new WebSocketServer({ server, path: "/api/ws" });
    this.setupHandlers();
  }

  private setupHandlers() {
    this.wss.on("connection", (socket: WebSocket, req) => {
      const connId = `conn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const userId = this.extractUserId(req);

      if (!userId) {
        socket.close(1008, "Unauthorized");
        return;
      }

      const conn: Connection = {
        id: connId,
        userId,
        socket,
        subscriptions: new Set(),
        lastHeartbeat: Date.now(),
        metadata: {},
      };

      this.connections.set(connId, conn);
      this.emit("connection", conn);

      socket.on("message", (data) => this.handleMessage(connId, data));
      socket.on("close", () => this.handleClose(connId));
      socket.on("error", (err) => this.handleError(connId, err));

      // Send queued messages
      const queued = this.messageQueue.get(userId);
      if (queued?.length) {
        queued.forEach((msg) => socket.send(JSON.stringify(msg)));
        this.messageQueue.delete(userId);
      }
    });

    this.startHeartbeat();
  }

  private handleMessage(connId: string, data: Buffer) {
    const conn = this.connections.get(connId);
    if (!conn) return;

    try {
      const msg = JSON.parse(data.toString());
      conn.lastHeartbeat = Date.now();

      if (msg.type === "subscribe") {
        conn.subscriptions.add(msg.room);
        if (!this.rooms.has(msg.room)) this.rooms.set(msg.room, new Set());
        this.rooms.get(msg.room)?.add(connId);
        this.emit("subscribe", { userId: conn.userId, room: msg.room });
      } else if (msg.type === "unsubscribe") {
        conn.subscriptions.delete(msg.room);
        this.rooms.get(msg.room)?.delete(connId);
      } else if (msg.type === "message") {
        this.emit("message", { userId: conn.userId, ...msg });
      } else if (msg.type === "ping") {
        conn.socket.send(JSON.stringify({ type: "pong" }));
      }
    } catch (err) {
      console.error("Message parse error:", err);
    }
  }

  private handleClose(connId: string) {
    const conn = this.connections.get(connId);
    if (!conn) return;

    conn.subscriptions.forEach((room) => {
      this.rooms.get(room)?.delete(connId);
    });
    this.connections.delete(connId);
    this.emit("disconnect", conn);
  }

  private handleError(connId: string, err: Error) {
    console.error(`WS error on ${connId}:`, err);
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      this.connections.forEach((conn) => {
        if (now - conn.lastHeartbeat > 30000) {
          conn.socket.terminate();
        } else {
          conn.socket.send(JSON.stringify({ type: "ping" }));
        }
      });
    }, 10000);
  }

  broadcast(room: string, message: unknown) {
    const connIds = this.rooms.get(room);
    if (!connIds?.size) return;

    const data = JSON.stringify(message);
    connIds.forEach((connId) => {
      const conn = this.connections.get(connId);
      if (conn?.socket.readyState === WebSocket.OPEN) {
        conn.socket.send(data);
      }
    });
  }

  send(userId: string, message: unknown) {
    const conns = Array.from(this.connections.values()).filter((c) => c.userId === userId);
    const data = JSON.stringify(message);

    conns.forEach((conn) => {
      if (conn.socket.readyState === WebSocket.OPEN) {
        conn.socket.send(data);
      }
    });

    // Queue if no active connection
    if (!conns.some((c) => c.socket.readyState === WebSocket.OPEN)) {
      const queue = this.messageQueue.get(userId) ?? [];
      queue.push(message);
      if (queue.length > 100) queue.shift(); // Prevent memory bloat
      this.messageQueue.set(userId, queue);
    }
  }

  sendToRoom(room: string, message: unknown) {
    this.broadcast(room, message);
  }

  private extractUserId(req: any): string | null {
    try {
      const token = req.headers["authorization"]?.split(" ")[1];
      if (!token) return null;
      // Verify token and extract userId (simplified)
      return Buffer.from(token, "base64").toString().split(":")[0];
    } catch {
      return null;
    }
  }

  close() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.wss.close();
  }

  getStats() {
    return {
      connections: this.connections.size,
      rooms: this.rooms.size,
      messageQueue: this.messageQueue.size,
    };
  }
}
