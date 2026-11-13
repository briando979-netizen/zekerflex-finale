import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { ensureDirectThread, listThreadsForUser, postMessage } from "@/lib/messaging/store";
import { listContacts } from "@/lib/messaging/contact-book";
import { blockedBetween } from "@/lib/messaging/thread-prefs";
import { notifyNewMessage } from "@/lib/messaging/notify";
import { enforceRateLimit } from "@/lib/rate-limit";
import { RONDZEND_MAX } from "@/lib/messaging/rondzenden";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  userIds: z.array(z.string().min(1).max(40)).min(1).max(RONDZEND_MAX),
  text: z.string().trim().min(1).max(4000),
});

// POST /api/inbox/rondzenden — één bericht apart naar meerdere mensen (zoals de verzendlijst van WhatsApp): ieder krijgt
// het in jullie eigen gesprek, en een antwoord blijft daar. Alleen naar je bewaarde contacten en mensen met wie je al
// een gesprek hebt (zo kun je niemand bestoken die je niet kent); geblokkeerd (in een van beide richtingen) slaat over.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const input = schema.parse(
      await request.json().catch(() => {
        throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
      }),
    );
    await enforceRateLimit({
      name: "chat-rondzenden",
      identifier: p.userId,
      limit: 5,
      windowSeconds: 3600,
      message: "Je hebt net al een paar keer rondgezonden. Probeer het over een uur opnieuw.",
    });
    const [contacten, gesprekken] = await Promise.all([listContacts(p.userId), listThreadsForUser(p.userId, false)]);
    const mag = new Set<string>([
      ...contacten.map((c) => c.userId),
      ...gesprekken.filter((t) => t.kind === "direct").flatMap((t) => t.participants),
    ]);
    mag.delete(p.userId);

    let verstuurd = 0;
    let overgeslagen = 0;
    for (const uid of [...new Set(input.userIds)]) {
      if (!mag.has(uid) || (await blockedBetween(p.userId, uid))) {
        overgeslagen++;
        continue;
      }
      const thread = await ensureDirectThread(p.userId, uid);
      const msg = await postMessage(thread.id, p.userId, input.text, "text");
      after(() => notifyNewMessage(thread, msg));
      verstuurd++;
    }
    return NextResponse.json({ verstuurd, overgeslagen }, { status: verstuurd ? 201 : 200 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
