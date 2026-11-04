import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { canAccess, getMessages, getThread, type ChatMessage } from "@/lib/messaging/store";
import { isPlatformAdmin } from "@/lib/messaging/contacts";
import { bewaardPerThread, geldigeBewaard, leesBewaard, uittreksel, zetBewaard } from "@/lib/messaging/bewaard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Berichten bewaren met een ster (lib/messaging/bewaard.ts).
//   GET  → { bewaard: BewaardBericht[] (nieuwste eerst), perThread: { [threadId]: messageId[] } }
//          alleen wat nog bestaat en waar je nog toegang toe hebt
//   POST { threadId, messageId, aan } → { bewaard: BewaardBericht | null, perThread }
//          aan=true bewaart (opnieuw bovenaan), aan=false haalt weg

async function berichtenVan(threadIds: string[], userId: string, admin: boolean): Promise<Map<string, Map<string, ChatMessage> | null>> {
  const out = new Map<string, Map<string, ChatMessage> | null>();
  for (const id of threadIds) {
    const t = await getThread(id);
    if (!t || !canAccess(t, userId, admin)) {
      out.set(id, null);
      continue;
    }
    out.set(id, new Map((await getMessages(id, 5000)).map((m) => [m.id, m])));
  }
  return out;
}

export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const admin = await isPlatformAdmin(p.userId);
    const lijst = await leesBewaard(p.userId);
    const geldig = geldigeBewaard(lijst, await berichtenVan([...new Set(lijst.map((b) => b.threadId))], p.userId, admin));
    return NextResponse.json({ bewaard: geldig, perThread: bewaardPerThread(geldig) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const schema = z.object({ threadId: z.string().min(1).max(80), messageId: z.string().min(1).max(40), aan: z.boolean() });

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const admin = await isPlatformAdmin(p.userId);
    const body = schema.safeParse(await req.json().catch(() => ({})));
    if (!body.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Ongeldig verzoek" } }, { status: 400 });
    const { threadId, messageId, aan } = body.data;
    const thread = await getThread(threadId);
    if (!thread || !canAccess(thread, p.userId, admin)) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Gesprek niet gevonden" } }, { status: 404 });
    }
    // the thread's own id (an old merged duplicate's link resolves to the main thread)
    const m = (await getMessages(thread.id, 5000)).find((x) => x.id === messageId);
    if (aan && (!m || m.deleted)) throw AppError.notFound("Dit bericht bestaat niet meer");
    const item = { threadId: thread.id, messageId, excerpt: m ? uittreksel(m) : "", kind: m?.kind ?? "text", from: m?.from ?? "", at: m?.at ?? new Date().toISOString() };
    const lijst = await zetBewaard(p.userId, item, aan);
    return NextResponse.json({ bewaard: aan ? (lijst[0] ?? null) : null, perThread: bewaardPerThread(lijst) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
