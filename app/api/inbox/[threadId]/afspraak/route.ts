import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { canAccess, getMessageById, getThread, postMessage, updateAfspraak } from "@/lib/messaging/store";
import { isPlatformAdmin } from "@/lib/messaging/contacts";
import { notifyAfspraakAfgezegd } from "@/lib/messaging/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Een afspraak in een gesprek (lib/messaging/afspraak.ts), zoals een evenement in WhatsApp.
//   POST { messageId, antwoord: "ja" | "misschien" | "nee" | null } → je antwoord (null = intrekken) → { afspraak }
//   POST { messageId, annuleer: true } → alleen de maker zegt hem af; daarna geen antwoorden meer, en een push aan wie
//   erop rekende (de systeemregel zelf geeft geen push)
// Altijd de serverversie terug: de browser neemt die over (antwoorden van anderen).

const schema = z.union([
  z.object({ messageId: z.string().min(1).max(40), antwoord: z.enum(["ja", "misschien", "nee"]).nullable() }),
  z.object({ messageId: z.string().min(1).max(40), annuleer: z.literal(true) }),
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
    if (!body.success) throw AppError.validation("Ongeldig antwoord");
    const m = await getMessageById(thread.id, body.data.messageId);
    if (!m || m.kind !== "afspraak" || !m.afspraak || m.deleted) throw AppError.notFound("Deze afspraak bestaat niet meer");
    let updated;
    if ("annuleer" in body.data) {
      if (m.from !== p.userId) throw AppError.forbidden("Alleen wie de afspraak maakte, kan hem afzeggen.");
      updated = await updateAfspraak(thread.id, m.id, { annuleer: true });
      // zoals WhatsApp: een regel in het gesprek, zodat iedereen het ziet
      if (updated && !m.afspraak.geannuleerd) {
        await postMessage(thread.id, "system", `${p.fullName} heeft de afspraak "${m.text}" afgezegd.`, "system").catch(() => undefined);
        const afgezegd = updated;
        after(() => notifyAfspraakAfgezegd(thread, afgezegd, p.fullName));
      }
    } else {
      if (m.afspraak.geannuleerd) throw AppError.validation("Deze afspraak is afgezegd.");
      updated = await updateAfspraak(thread.id, m.id, { userId: p.userId, antwoord: body.data.antwoord });
    }
    if (!updated?.afspraak) throw AppError.validation("Deze afspraak is afgezegd.");
    return NextResponse.json({ afspraak: updated.afspraak });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
