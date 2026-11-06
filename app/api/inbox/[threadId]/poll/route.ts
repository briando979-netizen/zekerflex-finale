import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { canAccess, getMessageById, getThread, updatePoll } from "@/lib/messaging/store";
import { isPlatformAdmin } from "@/lib/messaging/contacts";
import { POLL_MAX_OPTIONS } from "@/lib/messaging/poll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Peiling in een gesprek (lib/messaging/poll.ts).
//   POST { messageId, optionIds } → je hele keuze ([] = stem intrekken) → { poll }
//   POST { messageId, sluit: true } → alleen de maker sluit hem; daarna geen stemmen meer
// Altijd de serverversie terug: de browser neemt die over (stemmen van anderen).

const schema = z.union([
  z.object({ messageId: z.string().min(1).max(40), optionIds: z.array(z.string().min(1).max(8)).max(POLL_MAX_OPTIONS) }),
  z.object({ messageId: z.string().min(1).max(40), sluit: z.literal(true) }),
]);

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
    if (!body.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Ongeldige stem" } }, { status: 400 });

    const m = await getMessageById(thread.id, body.data.messageId);
    if (!m || m.kind !== "poll" || !m.poll || m.deleted) throw AppError.notFound("Deze peiling bestaat niet meer");
    let updated;
    if ("sluit" in body.data) {
      if (m.from !== p.userId) throw AppError.forbidden("Alleen wie de peiling maakte, kan hem sluiten.");
      updated = await updatePoll(thread.id, m.id, { sluit: true });
    } else {
      if (m.poll.closedAt) throw AppError.validation("Deze peiling is gesloten.");
      updated = await updatePoll(thread.id, m.id, { userId: p.userId, optionIds: body.data.optionIds });
    }
    if (!updated?.poll) throw AppError.validation("Deze peiling is gesloten.");
    return NextResponse.json({ poll: updated.poll });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
