import {
  markSpoken,
  pendingAnnouncements,
  voiceCapabilities,
} from "@/lib/voice/announce";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/voice/stream - Server-Sent Events. Emits unspoken announcements to a
// connected admin client, which speaks them (server Piper audio or the
// browser's local speech synthesis). Auto-closes after ~5 min; EventSource
// reconnects on its own.

const POLL_MS = 2000;
const MAX_LIFETIME_MS = 5 * 60 * 1000;

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const encoder = new TextEncoder();
  const started = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      send("ready", voiceCapabilities());

      while (!request.signal.aborted && Date.now() - started < MAX_LIFETIME_MS) {
        try {
          const pending = await pendingAnnouncements(10);
          if (pending.length > 0) {
            for (const a of pending) {
              send("announcement", {
                id: a.id,
                text: a.text,
                category: a.category,
                priority: a.priority,
                createdAt: a.createdAt.toISOString(),
              });
            }
            await markSpoken(pending.map((a) => a.id));
          } else {
            send("heartbeat", { t: Date.now() });
          }
        } catch {
          send("heartbeat", { t: Date.now() });
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
});
