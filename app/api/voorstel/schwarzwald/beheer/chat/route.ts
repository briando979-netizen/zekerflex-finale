import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { gesprekken, haalGesprek, markeerGelezen, voegBerichtToe, wijsToe, zetStatus } from "@/lib/sitechat/gesprek";
import { voorbeeld } from "@/lib/sitechat/regels";
import { alleAccounts, eisBeheerder, eisZelfdeHerkomst, huidigAccount } from "@/lib/voorstel/schwarzwald-accounts";
import { SCHWARZWALD_KANAAL } from "@/lib/voorstel/schwarzwald-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Websitechat in het beheer: alle gesprekken, meelezen, overnemen (de
// assistent zwijgt dan), antwoorden, teruggeven aan de assistent, sluiten en
// toewijzen aan iemand van het team.
// GET            → lijst + wie je kunt toewijzen
// GET ?id=<id>   → één gesprek (en gelezen)
// POST {actie}   → antwoord | overnemen | teruggeven | sluiten | toewijzen

const K = SCHWARZWALD_KANAAL;

async function team() {
  return (await alleAccounts()).filter((a) => a.rol === "beheerder" && !a.geblokkeerd).map((a) => ({ email: a.email, naam: a.naam }));
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      const g = await haalGesprek(K, id);
      if (!g) throw AppError.notFound("Gesprek niet gevonden.");
      return NextResponse.json({ gesprek: g.ongelezen ? await markeerGelezen(K, id) : g });
    }
    const [lijst, leden, ik] = await Promise.all([gesprekken(K), team(), huidigAccount().catch(() => null)]);
    return NextResponse.json({
      ik: ik?.email ?? "",
      team: leden,
      gesprekken: lijst.map((g) => ({
        id: g.id,
        status: g.status,
        gestart: g.gestart,
        laatst: g.laatst,
        ongelezen: g.ongelezen,
        aantal: g.berichten.length,
        toegewezen: g.toegewezen ?? "",
        account: g.account ?? "",
        pagina: g.pagina ?? "",
        voorbeeld: voorbeeld(g),
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

const ID = z.string().regex(/^[A-Za-z0-9_-]{16,48}$/);
const schema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("antwoord"), id: ID, tekst: z.string().trim().min(1, "Schrijf eerst een bericht.").max(2000) }),
  z.object({ actie: z.literal("overnemen"), id: ID }),
  z.object({ actie: z.literal("teruggeven"), id: ID }),
  z.object({ actie: z.literal("sluiten"), id: ID }),
  z.object({ actie: z.literal("toewijzen"), id: ID, wie: z.string().max(200) }),
]);

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const wie = await eisBeheerder();
    eisZelfdeHerkomst(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation(parsed.error.issues[0]?.message ?? "Ongeldige actie.");
    const d = parsed.data;
    if (!(await haalGesprek(K, d.id))) throw AppError.notFound("Gesprek niet gevonden.");
    const naam = `${wie.naam.split(" ")[0] || wie.naam} (Het Schwarzwald)`;
    if (d.actie === "antwoord") {
      await voegBerichtToe(K, d.id, { rol: "medewerker", tekst: d.tekst, door: naam });
      await zetStatus(K, d.id, "mens");
    } else if (d.actie === "overnemen") {
      await voegBerichtToe(K, d.id, { rol: "systeem", tekst: `${naam} leest mee en neemt het gesprek over.` });
      await zetStatus(K, d.id, "mens");
    } else if (d.actie === "teruggeven") {
      await voegBerichtToe(K, d.id, { rol: "systeem", tekst: "De assistent helpt je weer verder. Je kunt altijd opnieuw om een medewerker vragen." });
      await zetStatus(K, d.id, "ai");
    } else if (d.actie === "sluiten") {
      await voegBerichtToe(K, d.id, { rol: "systeem", tekst: "Dit gesprek is afgesloten. Stel gerust een nieuwe vraag." });
      await zetStatus(K, d.id, "gesloten");
    } else {
      const e = d.wie.trim().toLowerCase();
      if (e && !(await team()).some((t) => t.email === e)) throw AppError.validation("Kies iemand van het team.");
      await wijsToe(K, d.id, e);
    }
    return NextResponse.json({ gesprek: await haalGesprek(K, d.id) });
  } catch (err) {
    return jsonError(err);
  }
}
