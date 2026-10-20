import { NextResponse } from "next/server";
import { z } from "zod";
import { answer, verifyCompanion } from "@/lib/companion";
import { enforceRateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({ text: z.string().trim().min(1).max(1000) });

// POST /api/companion/ask — the owner's desktop Jarvis (deploy/jarvis-desktop).
// Auth: personal token "Bearer zfj_…" (Admin → Jarvis → Laptop-Jarvis koppelen).
export async function POST(request: Request): Promise<NextResponse> {
  const owner = await verifyCompanion(request);
  if (!owner) return NextResponse.json({ error: { message: "Ongeldige of ingetrokken Jarvis-sleutel" } }, { status: 401 });
  try {
    await enforceRateLimit({ name: "companion", identifier: owner.userId, limit: 60, windowSeconds: 60, message: "Even rustig aan — te veel vragen per minuut." });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: { message: err.message } }, { status: 429 });
    throw err;
  }
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: { message: "Stuur { text }" } }, { status: 400 });
  return NextResponse.json(await answer(body.data.text, owner));
}
