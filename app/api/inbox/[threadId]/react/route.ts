import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { canAccess, getThread, reactToMessage } from "@/lib/messaging/store";
import { isPlatformAdmin } from "@/lib/messaging/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Alleen deze emoji's zijn toegestaan — voorkomt dat er willekeurige tekst als
// "reactie" wordt opgeslagen.
const ALLOWED = ["👍", "❤️", "😂", "😮", "🙏", "😢"];

const schema = z.object({ messageId: z.string().min(1).max(40), emoji: z.enum(ALLOWED as [string, ...string[]]) });

// POST /api/inbox/:id/react — toggle één emoji-reactie op een bericht.
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
    if (!body.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Ongeldige reactie" } }, { status: 400 });
    const updated = await reactToMessage(params.threadId, body.data.messageId, p.userId, body.data.emoji);
    if (!updated) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Bericht niet gevonden" } }, { status: 404 });
    return NextResponse.json({ reactions: updated.reactions ?? {} });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
