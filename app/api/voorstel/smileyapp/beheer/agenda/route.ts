import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonBegrensd } from "@/lib/http/body-grens";
import { jsonError } from "@/lib/http/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { eisToegang } from "@/lib/voorstel/smileyapp-accounts";
import { agendaVoorBeheer, annuleerBoeking, haalTijdWeg, zetTijdOpen } from "@/lib/voorstel/smileyapp-agenda";
import { smileyPoort } from "@/lib/voorstel/smileyapp-poort";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De agenda voor demo-afspraken in het SmileyApp-beheer (deel 6a).
// GET                               → alle tijden, met bij een boeking wie hem boekte
// POST {actie: "open", datum, tijd} → een tijd openzetten (Nederlandse tijd, in de toekomst)
// POST {actie: "weg", id}           → een open tijd weghalen
// POST {actie: "annuleer", id}      → een boeking annuleren: de tijd komt weer vrij
// Voor iedereen van het team (beheerder én medewerker) en een ZekerFlex-
// platformbeheerder. Elke methode: eigen site → limiet per IP → sessie. Niet
// ingelogd = 401. De regels staan in lib/voorstel/smileyapp-agenda-regels.ts;
// de server controleert alles opnieuw. Na elke wijziging komt de hele agenda
// van de server terug: het scherm neemt die over.

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await smileyPoort(request);
    await eisToegang();
    return NextResponse.json({ tijden: await agendaVoorBeheer() }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return jsonError(err);
  }
}

const TIJD_ID = z.string().regex(/^\d{12}$/);
const schema = z.discriminatedUnion("actie", [
  // ruime grenzen voor de vorm; of de datum en tijd bestaan en in de toekomst liggen, bepaalt leesMoment
  z.object({ actie: z.literal("open"), datum: z.string().max(10), tijd: z.string().max(5) }),
  z.object({ actie: z.literal("weg"), id: TIJD_ID }),
  z.object({ actie: z.literal("annuleer"), id: TIJD_ID }),
]);

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await smileyPoort(request, { json: true });
    const ik = await eisToegang();
    const gelezen = await jsonBegrensd(request, 2_000);
    const parsed = schema.safeParse(gelezen.ok ? gelezen.waarde : null);
    if (!parsed.success) throw AppError.validation("Controleer je gegevens.");
    const d = parsed.data;
    await enforceRateLimit({ name: "smileyapp-agenda", identifier: ik.id, limit: 300, windowSeconds: 3600, message: "Je hebt dit uur al veel gewijzigd in de agenda. Probeer het later opnieuw." });

    if (d.actie === "open") await zetTijdOpen({ datum: d.datum, tijd: d.tijd }, ik.naam);
    else if (d.actie === "weg") await haalTijdWeg(d.id);
    else await annuleerBoeking(d.id, ik.naam);
    return NextResponse.json({ tijden: await agendaVoorBeheer() });
  } catch (err) {
    return jsonError(err);
  }
}
