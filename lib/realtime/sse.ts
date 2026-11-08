import { Response } from "next/server";

export interface SSEClient {
  id: string;
  userId: string;
  response: Response;
  encoder: TextEncoder;
}

const sseClients = new Map<string, SSEClient>();
const sseListeners = new Map<string, Set<(data: unknown) => void>>();

export function createSSEResponse(userId: string, clientId: string): Response {
  const encoder = new TextEncoder();
  let responseStarted = false;

  const customResponse = new Response(
    new ReadableStream({
      async start(controller) {
        responseStarted = true;
        const client: SSEClient = { id: clientId, userId, response: customResponse as any, encoder };
        sseClients.set(clientId, client);

        // Send initial connection message
        controller.enqueue(encoder.encode("data: {\"type\":\"connected\"}\n\n"));

        // Send heartbeat
        const heartbeat = setInterval(() => {
          if (!responseStarted) {
            clearInterval(heartbeat);
            return;
          }
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        }, 30000);

        return () => {
          clearInterval(heartbeat);
          sseClients.delete(clientId);
          controller.close();
        };
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Transfer-Encoding": "chunked",
      },
    }
  );

  return customResponse;
}

export function subscribeSseStream(userId: string, listener: (data: unknown) => void) {
  if (!sseListeners.has(userId)) {
    sseListeners.set(userId, new Set());
  }
  sseListeners.get(userId)?.add(listener);
  return () => sseListeners.get(userId)?.delete(listener);
}

export function sendSSE(userId: string, eventType: string, data: unknown) {
  const encoder = new TextEncoder();

  // Send to all SSE clients for this user
  Array.from(sseClients.values())
    .filter((c) => c.userId === userId)
    .forEach((client) => {
      try {
        const formatted = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
        // Note: In real implementation, need access to the controller from the response
        // This is a simplified representation
      } catch (err) {
        console.error("SSE send error:", err);
      }
    });

  // Also notify listeners
  const listeners = sseListeners.get(userId);
  if (listeners) {
    listeners.forEach((l) => l({ type: eventType, data }));
  }
}

export function getSSEStats() {
  return {
    activeConnections: sseClients.size,
    uniqueUsers: new Set(Array.from(sseClients.values()).map((c) => c.userId)).size,
  };
}
