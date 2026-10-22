import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { STARTERS, think } from "@/lib/brain";
import { roleOf } from "@/lib/brain/tools";
import { forget, loadMemory } from "@/lib/brain/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ question: z.string().trim().min(1).max(1500) });

// GET /api/brain — this user's recent conversation + starter questions.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const turns = await loadMemory(p.userId);
    return NextResponse.json({ turns: turns.map(({ role, content }) => ({ role, content })), starters: STARTERS[roleOf(p)] });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/brain — ask the ZekerFlex assistant (reads only; never acts).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({ name: "brain", identifier: p.userId, limit: 60, windowSeconds: 3600, message: "Even rustig aan — probeer het zo weer." });
    const { question } = schema.parse(await request.json().catch(() => ({})));
    return NextResponse.json(await think(p, question));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// DELETE /api/brain — "Vergeet dit gesprek".
export async function DELETE(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await forget(p.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
