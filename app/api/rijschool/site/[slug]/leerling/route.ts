import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { eisLeerling, eisZelfdeHerkomst } from "@/lib/rijschool/accounts";
import { leerlingActieSchema, lees } from "@/lib/rijschool/schema";
import { siteRijschool } from "@/lib/rijschool/toegang";
import { annuleerDoorLeerling, bevestigLes, eigenInstructeur, meldAnnulering, planLes, saldoVan, vrijVoor } from "@/lib/rijschool/store";
import { leerlingWeergave } from "@/lib/rijschool/weergave";
import { isDatum, komendeDagen } from "@/lib/rijschool/planning";
import { bewaarBeste, leesTheorie } from "@/lib/rijschool/theorie";
import { lesduur } from "@/lib/rijschool/tegoed";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { startIdeal } from "@/lib/rijschool/betalen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Zelf plannen kan vanaf zoveel uur van tevoren. */
const ZELF_VOORAF_MIN = 12 * 60;

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

// GET /api/rijschool/site/<slug>/leerling — alles voor de leerling-app.
// ?vrij=2026-11-04 — vrije tijden bij je eigen instructeur (als de rijschool zelf plannen toestaat).
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    const r = await siteRijschool((await params).slug);
    const l = await eisLeerling(r);
    const vrij = new URL(request.url).searchParams.get("vrij");
    if (vrij !== null) {
      if (!r.zelfPlannen || !l.instructeurId) throw AppError.precondition("Zelf plannen staat bij je rijschool niet aan.");
      const nu = new Date();
      if (!isDatum(vrij) || !komendeDagen(nu, 28).includes(vrij)) throw AppError.validation("Kies een dag in de komende vier weken.");
      const i = await eigenInstructeur(r, l.instructeurId);
      return NextResponse.json({ datum: vrij, instructeurId: i.id, tijden: (await vrijVoor(r, i, vrij, r.lesMinuten, nu, ZELF_VOORAF_MIN)).map((d) => d.toISOString()) });
    }
    return NextResponse.json(await leerlingWeergave(r, l));
  } catch (err) {
    return fout(err);
  }
}

// POST — annuleren, zelf een les plannen, een theorieronde bewaren, je gegevens bijwerken
// of online betalen (geeft dan { url } van de betaalpagina terug).
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    eisZelfdeHerkomst(request);
    const r = await siteRijschool((await params).slug);
    const l = await eisLeerling(r);
    await enforceRateLimit({ name: "rijschool-leerling", identifier: l.id, limit: 60, windowSeconds: 600 });
    const a = lees(leerlingActieSchema, await request.json().catch(() => ({})));
    switch (a.actie) {
      case "annuleer": {
        const les = await annuleerDoorLeerling(r, l.id, a.lesId);
        await meldAnnulering(r, les, "jezelf (via de app)");
        break;
      }
      case "plan": {
        if (!r.zelfPlannen || !l.instructeurId || a.instructeurId !== l.instructeurId) throw AppError.precondition("Zelf plannen staat bij je rijschool niet aan.");
        const start = new Date(a.start);
        const i = await eigenInstructeur(r, l.instructeurId);
        const vrij = await vrijVoor(r, i, amsterdamDayKey(start), r.lesMinuten, new Date(), ZELF_VOORAF_MIN);
        if (!vrij.some((d) => d.getTime() === start.getTime())) throw AppError.conflict("Deze tijd is net bezet. Kies een andere tijd.");
        // genoeg tegoed voor alle geplande lessen plus deze
        const gepland = await prisma.rijschoolLes.findMany({ where: { leerlingId: l.id, status: "GEPLAND", soort: { in: ["LES", "TOETS"] } }, select: { start: true, eind: true } });
        const nodig = gepland.reduce((s, x) => s + lesduur(x.start, x.eind), 0) + r.lesMinuten;
        if ((await saldoVan(l.id)) < nodig) throw AppError.precondition("Je tegoed is niet genoeg voor nog een les. Koop een pakket of vraag je rijschool.");
        const les = await planLes(r, {
          instructeurId: i.id,
          leerlingId: l.id,
          voertuigId: null,
          soort: "LES",
          start,
          eind: new Date(start.getTime() + r.lesMinuten * 60_000),
          ophaaladres: l.adres,
        });
        await bevestigLes(r, les);
        break;
      }
      case "theorie": {
        const theorie = bewaarBeste(leesTheorie(l.theorie), a.onderdeel, { goed: Math.min(a.goed, a.totaal), totaal: a.totaal, at: new Date().toISOString() });
        await prisma.rijschoolLeerling.update({ where: { id: l.id }, data: { theorie: theorie as unknown as Prisma.InputJsonValue } });
        break;
      }
      case "profiel":
        await prisma.rijschoolLeerling.update({ where: { id: l.id }, data: { telefoon: a.telefoon, adres: a.adres } });
        break;
      case "betaal": {
        if (!a.productId === !a.betalingId) throw AppError.validation("Kies een pakket of een betaling.");
        await enforceRateLimit({ name: "rijschool-ideal", identifier: l.id, limit: 10, windowSeconds: 600 });
        const wat = a.productId ? { productId: a.productId } : { betalingId: a.betalingId ?? "" };
        return NextResponse.json({ url: await startIdeal(r, l, wat, "/leerling") });
      }
    }
    const bij = await prisma.rijschoolLeerling.findUniqueOrThrow({ where: { id: l.id } });
    return NextResponse.json(await leerlingWeergave(r, bij));
  } catch (err) {
    return fout(err);
  }
}
