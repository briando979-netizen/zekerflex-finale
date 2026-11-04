import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { withUsage } from "@/lib/ops/usage";
import { chatAntwoord } from "@/lib/sitechat/antwoord";
import { haalGesprek, voegBerichtToe, zetStatus } from "@/lib/sitechat/gesprek";
import { CONTACT, activiteit } from "@/lib/voorstel/schwarzwald";
import { eisZelfdeHerkomst, huidigAccount } from "@/lib/voorstel/schwarzwald-accounts";
import { zoekBoekingOpNummer } from "@/lib/voorstel/schwarzwald-boekingen";
import { SCHWARZWALD_KANAAL, schwarzwaldKennis } from "@/lib/voorstel/schwarzwald-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Chat op de Schwarzwald-site (openbaar onder /api/voorstel/schwarzwald).
// POST {id, berichten}          → antwoord van de assistent (tekststroom)
// POST {id, actie: "mens"}      → de gast vraagt om een medewerker
// POST {id, actie: "geboekt"}   → een reservering uit de chat komt als melding in het gesprek

const ID = z.string().regex(/^[A-Za-z0-9_-]{16,48}$/);
const schema = z.union([
  z.object({
    id: ID,
    pagina: z.string().max(200).optional(),
    berichten: z
      .array(z.object({ rol: z.enum(["gast", "ai"]), tekst: z.string().trim().min(1).max(1500) }))
      .min(1)
      .max(12),
  }),
  z.object({ id: ID, actie: z.literal("mens"), pagina: z.string().max(200).optional() }),
  z.object({ id: ID, actie: z.literal("geboekt"), boeking: z.string().regex(/^[0-9A-F]{8}$/) }),
]);

const dag = (datum: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${datum}T12:00:00Z`));

async function handlePOST(request: Request): Promise<Response> {
  try {
    eisZelfdeHerkomst(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Ongeldig chatbericht.");
    const d = parsed.data;
    const account = (await huidigAccount().catch(() => null))?.email;

    if ("berichten" in d) {
      return chatAntwoord({ kanaal: SCHWARZWALD_KANAAL, id: d.id, berichten: d.berichten, pagina: d.pagina, account, ip: clientIp(request) }, schwarzwaldKennis);
    }
    if (d.actie === "mens") {
      const g = await haalGesprek(SCHWARZWALD_KANAAL, d.id);
      if (g?.status === "mens") return NextResponse.json({ ok: true, status: g.status });
      await voegBerichtToe(
        SCHWARZWALD_KANAAL,
        d.id,
        { rol: "systeem", tekst: `Je hebt om een medewerker gevraagd. Iemand van ons team leest zo mee en antwoordt hier. Haast? Bel ${CONTACT.telefoon}.` },
        { pagina: d.pagina, account },
      );
      await zetStatus(SCHWARZWALD_KANAAL, d.id, "wacht");
      return NextResponse.json({ ok: true, status: "wacht" });
    }
    // geboekt: alleen een melding met wat er echt in de agenda staat
    const b = await zoekBoekingOpNummer(d.boeking);
    if (!b) throw AppError.notFound("Reservering niet gevonden.");
    await voegBerichtToe(
      SCHWARZWALD_KANAAL,
      d.id,
      { rol: "systeem", tekst: `Gereserveerd via de chat: ${activiteit(b.activiteit)?.naam ?? b.activiteit} op ${dag(b.datum)} om ${b.tijd}, ${b.personen} personen (nummer ${b.id}).` },
      { account },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}

export const POST = withUsage("website-chat-schwarzwald", handlePOST);
