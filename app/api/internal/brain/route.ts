import { NextResponse } from "next/server";
import { z } from "zod";
import { answerFromVault, runBrainSweep, writeVaultNote, searchVault } from "@/lib/brain/vault-agent";
import { env } from "@/lib/env";

// POST /api/internal/brain
// Second brain operations: search, answer, write, sweep.

function isAuthorised(req: Request): boolean {
  const s = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  const a = env.CRON_SECRET ?? env.INTERNAL_CRON_TOKEN;
  return Boolean(a && s === a);
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("search"), query: z.string().min(1), topK: z.number().int().min(1).max(20).default(5) }),
  z.object({ action: z.literal("answer"), question: z.string().min(1) }),
  z.object({ action: z.literal("write"), name: z.string().min(1), content: z.string().min(1), folder: z.string().optional() }),
  z.object({ action: z.literal("sweep") }),
]);

export async function POST(req: Request) {
  if (!isAuthorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  switch (body.data.action) {
    case "search": {
      const results = await searchVault(body.data.query, body.data.topK);
      return NextResponse.json({ results: results.map((r) => ({ name: r.note.name, score: r.score, excerpt: r.excerpt, lastModified: r.note.lastModified })) });
    }
    case "answer": {
      const answer = await answerFromVault(body.data.question);
      return NextResponse.json({ answer });
    }
    case "write": {
      const path = await writeVaultNote(body.data.name, body.data.content, body.data.folder);
      return NextResponse.json({ path, written: true });
    }
    case "sweep": {
      const result = await runBrainSweep();
      return NextResponse.json(result);
    }
  }
}
