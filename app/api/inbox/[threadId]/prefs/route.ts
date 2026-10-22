import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { isPlatformAdmin } from "@/lib/messaging/contacts";
import { canAccess, getThread } from "@/lib/messaging/store";
import { applyThreadAction, setBlocked, type ThreadAction } from "@/lib/messaging/thread-prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.union([
  z.object({ action: z.enum(["archive", "unarchive", "lock", "unlock", "favorite", "unfavorite", "unmute", "clear", "delete"]) }),
  z.object({ action: z.literal("mute"), hours: z.number().int().positive().max(24 * 365).nullable() }),
  z.object({ action: z.enum(["list-add", "list-remove"]), list: z.string().trim().min(1).max(30) }),
  z.object({ action: z.enum(["block", "unblock"]) }),
]);

// POST /api/inbox/<threadId>/prefs — archiveren, dempen, vergrendelen,
// favoriet, lijsten, wissen, verwijderen, blokkeren. Only the caller's view.
export async function POST(request: Request, props: { params: Promise<{ threadId: string }> }): Promise<NextResponse> {
  try {
    const { threadId } = await props.params;
    const p = await requirePrincipal();
    const thread = await getThread(threadId);
    if (!thread || !canAccess(thread, p.userId, await isPlatformAdmin(p.userId))) throw AppError.notFound("Gesprek niet gevonden");
    const body = schema.parse(await request.json().catch(() => ({})));
    if (body.action === "block" || body.action === "unblock") {
      if (thread.kind !== "direct") throw AppError.validation("Blokkeren kan alleen in een gesprek met één persoon.");
      const other = thread.participants.find((u) => u !== p.userId);
      if (!other) throw AppError.validation("Geen andere persoon in dit gesprek.");
      await setBlocked(p.userId, other, body.action === "block");
      return NextResponse.json({ ok: true });
    }
    try {
      await applyThreadAction(p.userId, thread.id, body as ThreadAction);
    } catch (err) {
      throw AppError.validation((err as Error).message);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
