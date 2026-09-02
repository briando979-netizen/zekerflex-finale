import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { redis } from "@/lib/redis";
import { canAccess, getThread, postMessage } from "@/lib/messaging/store";
import { isPlatformAdmin } from "@/lib/messaging/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// WebRTC signaling for 1-on-1 calls / screen-share. Polling only — signals go
// through Redis lists with a short TTL. Media is peer-to-peer (never touches
// the server).
//   call:<threadId>:active          -> callId of the ringing/live call (EX 90)
//   call:<threadId>:<callId>:sig    -> RPUSH'd JSON signal frames (EX 180)
// ---------------------------------------------------------------------------

const TTL_SIG = 180;
const TTL_ACTIVE = 90;

const sigKey = (t: string, c: string) => `call:${t}:${c}:sig`;
const activeKey = (t: string) => `call:${t}:active`;
const metaKey = (t: string, c: string) => `call:${t}:${c}:meta`;

const postSchema = z.object({
  callId: z.string().min(6).max(40),
  type: z.enum(["ring", "offer", "answer", "candidate", "accept", "decline", "end"]),
  mode: z.enum(["audio", "video", "screen"]).optional(),
  data: z.unknown().optional(),
});

async function guard(threadId: string, userId: string) {
  const admin = await isPlatformAdmin(userId);
  const thread = await getThread(threadId);
  if (!thread || !canAccess(thread, userId, admin) || thread.kind === "group") {
    throw AppError.notFound("Gesprek niet gevonden");
  }
  return thread;
}

// POST — publish a signaling frame.
export async function POST(
  request: Request,
  { params }: { params: { threadId: string } },
): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const thread = await guard(params.threadId, p.userId);
    const body = postSchema.parse(
      await request.json().catch(() => {
        throw AppError.validation("Body must be JSON");
      }),
    );

    const frame = JSON.stringify({
      from: p.userId,
      type: body.type,
      mode: body.mode ?? null,
      data: body.data ?? null,
      at: new Date().toISOString(),
    });

    const k = sigKey(params.threadId, body.callId);
    await redis.rpush(k, frame);
    await redis.expire(k, TTL_SIG);

    if (body.type === "ring" || body.type === "offer") {
      await redis.set(activeKey(params.threadId), body.callId, "EX", TTL_ACTIVE);
      await redis.set(metaKey(params.threadId, body.callId), JSON.stringify({ mode: body.mode ?? "audio", caller: p.userId }), "EX", TTL_SIG);
    } else if (body.type === "accept") {
      await redis.expire(activeKey(params.threadId), TTL_ACTIVE);
    } else if (body.type === "end" || body.type === "decline") {
      const cur = await redis.get(activeKey(params.threadId));
      if (cur === body.callId) await redis.del(activeKey(params.threadId));
      // log the call in the transcript (only the caller writes the "ended" line)
      const meta = await redis.get(metaKey(params.threadId, body.callId));
      const parsed = meta ? (JSON.parse(meta) as { mode: string; caller: string }) : null;
      if (parsed && parsed.caller === p.userId) {
        const durRaw = (body.data as { durationSec?: number } | null)?.durationSec;
        await postMessage(thread.id, p.userId, "", "call", {
          call: {
            mode: (parsed.mode as "audio" | "video" | "screen") ?? "audio",
            status: body.type === "decline" ? "declined" : durRaw ? "ended" : "missed",
            ...(durRaw ? { durationSec: Math.round(durRaw) } : {}),
          },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// GET ?callId=&since= — poll for signaling frames from the other party.
export async function GET(
  request: Request,
  { params }: { params: { threadId: string } },
): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await guard(params.threadId, p.userId);
    const url = new URL(request.url);
    const callId = url.searchParams.get("callId");
    const since = Number(url.searchParams.get("since") ?? "0") || 0;

    const active = await redis.get(activeKey(params.threadId));
    let meta: { mode: string; caller: string } | null = null;
    if (active) {
      const raw = await redis.get(metaKey(params.threadId, active));
      meta = raw ? (JSON.parse(raw) as { mode: string; caller: string }) : null;
    }

    let signals: { seq: number; from: string; type: string; mode: string | null; data: unknown; at: string }[] = [];
    if (callId) {
      const frames = await redis.lrange(sigKey(params.threadId, callId), since, -1);
      signals = frames
        .map((f, i) => {
          try {
            return { seq: since + i, ...(JSON.parse(f) as Record<string, unknown>) } as (typeof signals)[number];
          } catch {
            return null;
          }
        })
        .filter((s): s is (typeof signals)[number] => Boolean(s) && s!.from !== p.userId);
    }

    return NextResponse.json({
      active: active ?? null,
      incoming: active && meta && meta.caller !== p.userId ? { callId: active, mode: meta.mode } : null,
      signals,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
