import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonBegrensd } from "@/lib/http/body-grens";
import { jsonError } from "@/lib/http/errors";
import { gesprekken, haalGesprek, markeerGelezen, voegBerichtToe, zetStatus } from "@/lib/sitechat/gesprek";
import { voorbeeld } from "@/lib/sitechat/regels";
import { CONTACT } from "@/lib/voorstel/smileyapp";
import { eisToegang } from "@/lib/voorstel/smileyapp-accounts";
import { SMILEYAPP_KANAAL } from "@/lib/voorstel/smileyapp-chat";
import { smileyPoort } from "@/lib/voorstel/smileyapp-poort";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De websitechat in het SmileyApp-beheer: alle gesprekken van het kanaal
// "smileyapp", meelezen, als medewerker antwoorden (de assistent zwijgt dan),
// teruggeven aan de assistent en sluiten. Voor iedereen van het team.
// GET            → de lijst met het laatste bericht van de bezoeker
// GET ?id=<id>   → één gesprek (en gelezen)
// POST {actie}   → antwoord | overnemen | teruggeven | sluiten

const K = SMILEYAPP_KANAAL;
const ID = z.string().regex(/^[A-Za-z0-9_-]{16,48}$/);

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await smileyPoort(request);
    await eisToegang();
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      const g = ID.safeParse(id).success ? await haalGesprek(K, id) : null;
      if (!g) throw AppError.notFound("Gesprek niet gevonden.");
      return NextResponse.json({ gesprek: g.ongelezen ? await markeerGelezen(K, id) : g }, { headers: { "Cache-Control": "no-store" } });
    }
    const lijst = await gesprekken(K);
    return NextResponse.json(
      {
        gesprekken: lijst.map((g) => ({
          id: g.id,
          status: g.status,
          laatst: g.laatst,
          ongelezen: g.ongelezen,
          aantal: g.berichten.length,
          pagina: g.pagina ?? "",
          voorbeeld: voorbeeld(g),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return jsonError(err);
  }
}

const schema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("antwoord"), id: ID, tekst: z.string().trim().min(1, "Schrijf eerst een bericht.").max(2000) }),
  z.object({ actie: z.literal("overnemen"), id: ID }),
  z.object({ actie: z.literal("teruggeven"), id: ID }),
  z.object({ actie: z.literal("sluiten"), id: ID }),
]);

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await smileyPoort(request, { json: true });
    const ik = await eisToegang();
    const gelezen = await jsonBegrensd(request, 8_000);
    const parsed = schema.safeParse(gelezen.ok ? gelezen.waarde : null);
    if (!parsed.success) throw AppError.validation(parsed.error.issues[0]?.message ?? "Ongeldige actie.");
    const d = parsed.data;
    if (!(await haalGesprek(K, d.id))) throw AppError.notFound("Gesprek niet gevonden.");
    const naam = `${ik.naam.split(" ")[0] || ik.naam} (${CONTACT.naam})`;
    if (d.actie === "antwoord") {
      await voegBerichtToe(K, d.id, { rol: "medewerker", tekst: d.tekst, door: naam });
      await zetStatus(K, d.id, "mens");
    } else if (d.actie === "overnemen") {
      await voegBerichtToe(K, d.id, { rol: "systeem", tekst: `${naam} leest mee en neemt het gesprek over.` });
      await zetStatus(K, d.id, "mens");
    } else if (d.actie === "teruggeven") {
      await voegBerichtToe(K, d.id, { rol: "systeem", tekst: "De AI-assistent helpt je weer verder. Je kunt altijd opnieuw om een medewerker vragen." });
      await zetStatus(K, d.id, "ai");
    } else {
      await voegBerichtToe(K, d.id, { rol: "systeem", tekst: "Dit gesprek is afgesloten. Stel gerust een nieuwe vraag." });
      await zetStatus(K, d.id, "gesloten");
    }
    return NextResponse.json({ gesprek: await haalGesprek(K, d.id) });
  } catch (err) {
    return jsonError(err);
  }
}
