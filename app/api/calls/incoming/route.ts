import { withUsage } from "@/lib/ops/usage";
import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { redis } from "@/lib/redis";
import { listThreadsForUser } from "@/lib/messaging/store";
import { isPlatformAdmin, userDirectory } from "@/lib/messaging/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/calls/incoming — is someone ringing me in any 1-on-1 thread?
async function handleGET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const admin = await isPlatformAdmin(p.userId);
    const threads = (await listThreadsForUser(p.userId, admin)).filter((t) => t.kind === "direct");

    for (const t of threads) {
      const callId = await redis.get(`call:${t.id}:active`);
      if (!callId) continue;
      const raw = await redis.get(`call:${t.id}:${callId}:meta`);
      const meta = raw ? (JSON.parse(raw) as { mode: string; caller: string }) : null;
      if (meta && meta.caller !== p.userId) {
        const dir = await userDirectory([meta.caller]);
        return NextResponse.json({
          incoming: {
            threadId: t.id,
            callId,
            mode: meta.mode,
            fromUserId: meta.caller,
            fromName: dir.get(meta.caller)?.name ?? "Onbekend",
            fromRole: dir.get(meta.caller)?.role ?? "employer",
          },
        });
      }
    }
    return NextResponse.json({ incoming: null });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export const GET = withUsage("bellen-check (polling)", handleGET);
