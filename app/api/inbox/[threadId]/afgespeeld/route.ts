import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { canAccess, getThread, markeerAfgespeeld } from "@/lib/messaging/store";
import { isPlatformAdmin } from "@/lib/messaging/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ messageId: z.string().min(1).max(64) });

// POST /api/inbox/:id/afgespeeld — een spraakbericht van een ander is afgespeeld (15 nov 2026). De afzender ziet dan de blauwe
// microfoon, zoals bij WhatsApp; wie leesbevestigingen uit heeft, geeft en ziet die niet (de regel zit in GET /api/inbox/:id).
export async function POST(req: Request, props: { params: Promise<{ threadId: string }> }): Promise<NextResponse> {
  const params = await props.params;
  try {
    const p = await requirePrincipal();
    const admin = await isPlatformAdmin(p.userId);
    const thread = await getThread(params.threadId);
    if (!thread || !canAccess(thread, p.userId, admin)) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Gesprek niet gevonden" } }, { status: 404 });
    }
    const body = schema.safeParse(await req.json().catch(() => ({})));
    if (!body.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Ongeldig bericht" } }, { status: 400 });
    const m = await markeerAfgespeeld(params.threadId, body.data.messageId, p.userId);
    // niets te doen (eigen bericht, geen spraakbericht, weg) is geen fout: de speler hoeft er niets mee
    return NextResponse.json({ ok: true, afgevinkt: Boolean(m) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
