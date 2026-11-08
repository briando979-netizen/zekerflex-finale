import { NextRequest } from "next/server";
import { WSManager } from "@/lib/realtime/ws-manager";
import { createServer } from "http";

let wsManager: WSManager | null = null;

export async function GET(req: NextRequest) {
  // Initialize WebSocket manager if not already done
  if (!wsManager) {
    const server = createServer();
    wsManager = new WSManager(server);

    wsManager.on("connection", (conn) => {
      console.log(`User ${conn.userId} connected`);
    });

    wsManager.on("message", (msg) => {
      if (msg.room) {
        wsManager?.broadcast(msg.room, msg);
      }
    });

    wsManager.on("disconnect", (conn) => {
      console.log(`User ${conn.userId} disconnected`);
    });

    server.listen(process.env.WS_PORT || 3001);
  }

  return new Response(
    JSON.stringify({
      status: "WebSocket server running",
      stats: wsManager.getStats(),
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
