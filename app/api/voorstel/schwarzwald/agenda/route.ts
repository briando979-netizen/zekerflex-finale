import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { dagStatus, isDatum, prijsIndicatie, tijdsloten } from "@/lib/voorstel/schwarzwald-agenda";
import { agendaConfig } from "@/lib/voorstel/schwarzwald-instellingen";
import { alleBoekingen, bezetVan, boekingenOp, maakBoeking } from "@/lib/voorstel/schwarzwald-boekingen";
import { eisZelfdeHerkomst, huidigAccount } from "@/lib/voorstel/schwarzwald-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Eigen reserveringsagenda van het Schwarzwald-voorstel (openbaar, zie
// lib/auth/public-routes.ts).
// GET  ?activiteit&personen&maand=YYYY-MM → status per dag
// GET  ?activiteit&personen&datum=YYYY-MM-DD → tijdsloten (zonder aantallen)
// POST → boeking vastleggen (proefboeking, zie schwarzwald-boekingen.ts);
//        ingelogd → gekoppeld aan het account

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const q = new URL(request.url).searchParams;
    const activiteit = q.get("activiteit") ?? "";
    const personen = Number(q.get("personen") ?? "0");
    const cfg = await agendaConfig();
    if (!Object.prototype.hasOwnProperty.call(cfg.regels, activiteit)) throw AppError.validation("Deze activiteit is niet online te boeken.");
    if (!Number.isInteger(personen) || personen < 1 || personen > 500) throw AppError.validation("Ongeldig aantal personen.");
    const vandaag = amsterdamDayKey(new Date());

    const datum = q.get("datum");
    if (datum) {
      if (!isDatum(datum)) throw AppError.validation("Ongeldige datum.");
      const sloten = tijdsloten(activiteit, datum, personen, bezetVan(await boekingenOp(datum)), cfg);
      return NextResponse.json({
        datum,
        status: dagStatus(activiteit, datum, personen, vandaag, [], cfg),
        sloten: sloten.map(({ tijd, status }) => ({ tijd, status })),
        prijs: prijsIndicatie(activiteit, personen, datum, cfg),
      });
    }

    const maand = q.get("maand") ?? "";
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(maand)) throw AppError.validation("Ongeldige maand.");
    const alle = await alleBoekingen();
    const [jaar, mnd] = maand.split("-").map(Number) as [number, number];
    const aantal = new Date(Date.UTC(jaar, mnd, 0)).getUTCDate();
    const dagen = Array.from({ length: aantal }, (_, i) => {
      const d = `${maand}-${String(i + 1).padStart(2, "0")}`;
      return { datum: d, status: dagStatus(activiteit, d, personen, vandaag, bezetVan(alle.filter((b) => b.datum === d)), cfg) };
    });
    return NextResponse.json({ maand, vandaag, dagen });
  } catch (err) {
    return jsonError(err);
  }
}

const schema = z.object({
  activiteit: z.string().max(60),
  datum: z.string().max(10),
  tijd: z.string().max(5),
  personen: z.number().int().min(1).max(500),
  naam: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  telefoon: z.string().trim().min(6).max(40),
  opmerking: z.string().trim().max(1000).default(""),
  akkoord: z.literal(true),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    eisZelfdeHerkomst(request);
    await enforceRateLimit({
      name: "voorstel-schwarzwald-boeking",
      identifier: clientIp(request),
      limit: 5,
      windowSeconds: 600,
      message: "Te veel boekingen achter elkaar. Probeer het later opnieuw.",
    });
    const json = await request.json().catch(() => {
      throw AppError.validation("Body moet JSON zijn");
    });
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw AppError.validation("Controleer je gegevens en zet het vinkje voor akkoord.", parsed.error.flatten());
    const d = parsed.data;
    const account = await huidigAccount();
    const boeking = await maakBoeking(
      {
        activiteit: d.activiteit,
        datum: d.datum,
        tijd: d.tijd,
        personen: d.personen,
        naam: d.naam,
        email: d.email,
        telefoon: d.telefoon,
        opmerking: d.opmerking,
      },
      { account: account?.email, door: "online" },
    );
    return NextResponse.json({
      id: boeking.id,
      activiteit: boeking.activiteit,
      datum: boeking.datum,
      tijd: boeking.tijd,
      personen: boeking.personen,
      prijs: prijsIndicatie(boeking.activiteit, boeking.personen, boeking.datum, await agendaConfig()),
      account: !!boeking.account,
    });
  } catch (err) {
    return jsonError(err);
  }
}
