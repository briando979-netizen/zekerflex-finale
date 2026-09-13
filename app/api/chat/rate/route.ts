import { NextResponse } from "next/server";
import { z } from "zod";
import { findExchangeIdByText, rateExchange } from "@/lib/learn/store";
import { fixedWindow } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/chat/rate { q, a, up } — thumbs on a public-chat answer.
// Matches the exchange by its logged text.
export async function POST(request: Request): Promise<NextResponse> {
  const gate = await fixedWindow(`rl:chat-rate:${clientIp(request)}`, 20, 60);
  if (!gate.ok) return NextResponse.json({ ok: false }, { status: 429 });

  try {
    const { q, a, up } = z
      .object({ q: z.string().min(1).max(1000), a: z.string().min(1).max(2000), up: z.boolean() })
      .parse(await request.json());

    const id = await findExchangeIdByText("public", q, a);
    if (id) await rateExchange("public", id, up);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
