import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { checkChatPin, setChatPin } from "@/lib/messaging/thread-prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.union([
  z.object({ action: z.literal("set"), pin: z.string().max(6), currentPin: z.string().max(6).optional() }),
  z.object({ action: z.literal("check"), pin: z.string().max(6) }),
]);

// POST /api/inbox/pin — set the chat PIN (for "Vergrendel chat") or check it.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({ name: "chat-pin", identifier: p.userId, limit: 10, windowSeconds: 600, message: "Te veel pogingen — probeer het over 10 minuten opnieuw." });
    const body = schema.parse(await request.json().catch(() => ({})));
    if (body.action === "check") return NextResponse.json({ ok: await checkChatPin(p.userId, body.pin) });
    try {
      await setChatPin(p.userId, body.pin, body.currentPin);
    } catch (err) {
      throw AppError.validation((err as Error).message);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
