import { NextResponse } from "next/server";
import { z } from "zod";
import { rateExchange } from "@/lib/learn/store";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/chat/rate { q, a, up } — thumbs on a public-chat answer.
// Matches the exchange by its logged text; filesystem only.
export async function POST(request: Request): Promise<NextResponse> {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  try {
    const n = await redis.incr(`chatrate:rl:${ip}`);
    if (n === 1) await redis.expire(`chatrate:rl:${ip}`, 60);
    if (n > 20) return NextResponse.json({ ok: false }, { status: 429 });
  } catch {
    /* best effort */
  }

  try {
    const { q, a, up } = z
      .object({ q: z.string().min(1).max(1000), a: z.string().min(1).max(2000), up: z.boolean() })
      .parse(await request.json());

    // The learn store keys ratings by exchange id; we look the id up by matching
    // the most recent logged pair with the same question+answer prefix.
    const { readFile } = await import("node:fs/promises");
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const path = join(process.cwd(), "storage", "learn", "public.jsonl");
    if (!existsSync(path)) return NextResponse.json({ ok: true });
    const lines = (await readFile(path, "utf8")).split("\n").filter(Boolean).slice(-400);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const rec = JSON.parse(lines[i]!) as { id: string; q: string; a: string };
        if (rec.q.trim() === q.trim() && rec.a.slice(0, 40) === a.slice(0, 40)) {
          await rateExchange("public", rec.id, up);
          return NextResponse.json({ ok: true });
        }
      } catch {
        /* skip */
      }
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
