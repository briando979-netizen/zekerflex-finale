import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { canAccess, disappearCutoff, getMessages, getThread } from "@/lib/messaging/store";
import { isPlatformAdmin, userDirectory } from "@/lib/messaging/contacts";
import { checkChatPin, getChatPrefs, visibleFrom } from "@/lib/messaging/thread-prefs";
import { chatAlsTekst, exportBestandsnaam } from "@/lib/messaging/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/inbox/:id/export — het gesprek als tekstbestand ("Chat exporteren").
// Dezelfde berichten als in de chat zelf: niet wat je zelf wiste, niet wat al
// verdwenen is, en een vergrendelde chat alleen met de chat-pincode.
export async function GET(req: Request, props: { params: Promise<{ threadId: string }> }): Promise<NextResponse> {
  const params = await props.params;
  try {
    const p = await requirePrincipal();
    const admin = await isPlatformAdmin(p.userId);
    const thread = await getThread(params.threadId);
    if (!thread || !canAccess(thread, p.userId, admin)) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Gesprek niet gevonden" } }, { status: 404 });
    }
    const prefs = await getChatPrefs(p.userId);
    if (prefs.locked.includes(thread.id) && !(await checkChatPin(p.userId, req.headers.get("x-chat-pin")))) {
      return NextResponse.json({ error: { code: "LOCKED", message: "Deze chat is vergrendeld." } }, { status: 423 });
    }
    const cut = disappearCutoff(thread);
    const own = visibleFrom(prefs, thread.id);
    const from = own && cut ? (own > cut ? own : cut) : (own ?? cut);
    const messages = (await getMessages(thread.id, 5000)).filter((m) => !from || m.at > from);

    const directory = await userDirectory([...thread.participants, ...messages.map((m) => m.from)]);
    const namen = Object.fromEntries([...directory].map(([id, u]) => [id, u.name]));
    const other = thread.participants.find((u) => u !== p.userId);
    const titel =
      thread.kind === "support"
        ? "ZekerFlex Support"
        : thread.kind === "group"
          ? (thread.meta.title ?? "Community")
          : ((other && namen[other]) ?? "Onbekend");

    const now = new Date();
    return new NextResponse(chatAlsTekst(messages, namen, titel, now), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportBestandsnaam(titel, now)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
