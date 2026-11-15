import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { eisBeheer } from "@/lib/horeca/toegang";
import { isDatum, isTijd, urenCsv } from "@/lib/horeca-personeel/planning";
import {
  beoordeelRuil,
  beoordeelVerlof,
  bewaarUur,
  kopieerWeek,
  leesPlanningVan,
  plaatsDienst,
  verwijderDienst,
  verwijderUur,
  wijzigDienst,
} from "@/lib/horeca-personeel/planning-store";
import { leesPersoneelVan } from "@/lib/horeca-personeel/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De planning van het personeel voor de beheerder van de zaak: rooster, ruilverzoeken, verlof en uren. GET geeft alles (de
// planning, de medewerkers en de datum van vandaag in Amsterdam), GET ?uren=JJJJ-MM geeft de uren van die maand als csv.
// POST doet één actie.

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

const id = z.string().min(1).max(40);
const datum = z.string().refine(isDatum, "Kies een geldige datum.");
const tijd = z.string().refine(isTijd, "Vul de tijd in als uu:mm.");
const notitie = z.string().max(300).default("");

const actieSchema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("dienst"), medewerkerId: id.nullable(), datum, van: tijd, tot: tijd, notitie }),
  z.object({ actie: z.literal("dienst-wijzig"), id, medewerkerId: id.nullable().optional(), datum: datum.optional(), van: tijd.optional(), tot: tijd.optional(), notitie: z.string().max(300).optional() }),
  z.object({ actie: z.literal("dienst-weg"), id }),
  z.object({ actie: z.literal("kopieer-week"), van: datum, naar: datum }),
  z.object({ actie: z.literal("ruil"), id, besluit: z.enum(["goedkeuren", "afwijzen"]) }),
  z.object({ actie: z.literal("verlof"), id, besluit: z.enum(["goedkeuren", "afwijzen"]) }),
  z.object({ actie: z.literal("uur"), id: id.optional(), medewerkerId: id, datum, in: tijd, uit: tijd.nullable() }),
  z.object({ actie: z.literal("uur-weg"), id }),
]);

export async function GET(request: Request): Promise<Response> {
  try {
    const { tenantId } = await eisBeheer();
    const [planning, personeel] = await Promise.all([leesPlanningVan(tenantId), leesPersoneelVan(tenantId)]);
    const maand = new URL(request.url).searchParams.get("uren");
    if (maand !== null) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(maand)) throw AppError.validation("Kies een maand als JJJJ-MM.");
      const naam = (mid: string) => personeel.medewerkers.find((m) => m.id === mid)?.naam ?? "";
      return new Response(`﻿${urenCsv(planning, maand, naam)}\r\n`, {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="uren-${maand}.csv"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
      });
    }
    return NextResponse.json({ planning, medewerkers: personeel.medewerkers.filter((m) => m.status !== "uitgenodigd"), vandaag: amsterdamDayKey(new Date()) });
  } catch (err) {
    return fout(err);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    const { tenantId } = await eisBeheer();
    await enforceRateLimit({ name: "horeca-planning", identifier: tenantId, limit: 600, windowSeconds: 3600 });
    const parsed = actieSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation(parsed.error.issues[0]?.message ?? "Dit verzoek klopt niet.");
    const a = parsed.data;
    switch (a.actie) {
      case "dienst": {
        const r = await plaatsDienst(tenantId, { medewerkerId: a.medewerkerId, datum: a.datum, van: a.van, tot: a.tot, notitie: a.notitie });
        return NextResponse.json({ planning: r.planning, waarschuwingen: r.waarschuwingen }, { status: 201 });
      }
      case "dienst-wijzig": {
        const r = await wijzigDienst(tenantId, a.id, { medewerkerId: a.medewerkerId, datum: a.datum, van: a.van, tot: a.tot, notitie: a.notitie });
        return NextResponse.json({ planning: r.planning, waarschuwingen: r.waarschuwingen });
      }
      case "dienst-weg":
        return NextResponse.json({ planning: await verwijderDienst(tenantId, a.id) });
      case "kopieer-week": {
        const r = await kopieerWeek(tenantId, a.van, a.naar);
        return NextResponse.json({ planning: r.planning, aantal: r.aantal });
      }
      case "ruil": {
        const r = await beoordeelRuil(tenantId, a.id, a.besluit);
        return NextResponse.json({ planning: r.planning, waarschuwingen: r.waarschuwingen });
      }
      case "verlof":
        return NextResponse.json({ planning: await beoordeelVerlof(tenantId, a.id, a.besluit) });
      case "uur":
        return NextResponse.json({ planning: await bewaarUur(tenantId, { id: a.id, medewerkerId: a.medewerkerId, datum: a.datum, in: a.in, uit: a.uit }) });
      case "uur-weg":
        return NextResponse.json({ planning: await verwijderUur(tenantId, a.id) });
    }
  } catch (err) {
    return fout(err);
  }
}
