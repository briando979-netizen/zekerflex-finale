import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { eisInstructeur, eisZelfdeHerkomst } from "@/lib/rijschool/accounts";
import { instructeurActieSchema, lees } from "@/lib/rijschool/schema";
import { siteRijschool } from "@/lib/rijschool/toegang";
import { bevestigLes, eigenLeerling, eigenLes, planLes, registreerBetaling, vrijVoor, zetLesStatus } from "@/lib/rijschool/store";
import { instructeurWeergave } from "@/lib/rijschool/weergave";
import { isDatum, moment } from "@/lib/rijschool/planning";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

const datumUit = (s: string | null) => {
  if (s === null) return amsterdamDayKey(new Date());
  if (!isDatum(s)) throw AppError.validation("Kies een datum.");
  return s;
};

// GET /api/rijschool/site/<slug>/instructeur?datum=2026-11-04 — de lesdag van de ingelogde instructeur.
// ?vrij=2026-11-05&duur=60 — eigen vrije tijden, om de volgende les te plannen.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    const r = await siteRijschool((await params).slug);
    const i = await eisInstructeur(r);
    const url = new URL(request.url);
    const vrij = url.searchParams.get("vrij");
    if (vrij !== null) {
      const duur = Math.min(Math.max(Number(url.searchParams.get("duur") ?? r.lesMinuten) || r.lesMinuten, 15), 300);
      const tijden = await vrijVoor(r, i, datumUit(vrij), duur, new Date(), 0);
      return NextResponse.json({ datum: vrij, tijden: tijden.map((d) => d.toISOString()) });
    }
    return NextResponse.json(await instructeurWeergave(r, i, datumUit(url.searchParams.get("datum"))));
  } catch (err) {
    return fout(err);
  }
}

// POST — tijdens en na de les: starten, leskaart invullen, afronden, volgende les plannen, betaling in de auto.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    eisZelfdeHerkomst(request);
    const r = await siteRijschool((await params).slug);
    const i = await eisInstructeur(r);
    await enforceRateLimit({ name: "rijschool-instructeur", identifier: i.id, limit: 240, windowSeconds: 600 });
    const a = lees(instructeurActieSchema, await request.json().catch(() => ({})));
    const eigen = async (lesId: string) => {
      const les = await eigenLes(r, lesId);
      if (les.instructeurId !== i.id) throw AppError.forbidden("Dit is niet jouw les.");
      return les;
    };
    // de dag die de app laat zien (?datum=), anders vandaag
    let datum = datumUit(new URL(request.url).searchParams.get("datum"));
    switch (a.actie) {
      case "start": {
        const les = await eigen(a.lesId);
        datum = amsterdamDayKey(les.start);
        if (!les.gestartOm) await prisma.rijschoolLes.update({ where: { id: les.id }, data: { gestartOm: new Date() } });
        break;
      }
      case "leskaart": {
        const les = await eigen(a.lesId);
        datum = amsterdamDayKey(les.start);
        await prisma.rijschoolLes.update({
          where: { id: les.id },
          data: { beoordeling: a.beoordeling as unknown as Prisma.InputJsonValue, verslag: a.verslag, huiswerk: a.huiswerk, interneNotitie: a.interneNotitie },
        });
        break;
      }
      case "afronden": {
        const les = await eigen(a.lesId);
        datum = amsterdamDayKey(les.start);
        await zetLesStatus(r, les.id, a.status, i.naam);
        break;
      }
      case "plan": {
        const l = await eigenLeerling(r, a.leerlingId);
        const start = moment(a.datum, a.tijd);
        const les = await planLes(r, {
          instructeurId: i.id,
          leerlingId: l.id,
          voertuigId: a.voertuigId,
          soort: "LES",
          start,
          eind: new Date(start.getTime() + a.duurMin * 60_000),
          ophaaladres: l.adres,
        });
        await bevestigLes(r, les);
        break;
      }
      case "betaling":
        await registreerBetaling(r, a, i.naam);
        break;
    }
    return NextResponse.json(await instructeurWeergave(r, i, datum));
  } catch (err) {
    return fout(err);
  }
}
