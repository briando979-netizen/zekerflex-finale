import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { aanzettenSchema, beheerActieSchema, lees, type BeheerActie } from "@/lib/rijschool/schema";
import { beheerContext, eisBeheer } from "@/lib/rijschool/toegang";
import { companyDefaults } from "@/lib/sites/access";
import {
  bevestigLes,
  corrigeerTegoed,
  eigenInstructeur,
  eigenLeerling,
  maakRijschool,
  meldAnnulering,
  nodigUit,
  planLes,
  registreerBetaling,
  zetLesStatus,
} from "@/lib/rijschool/store";
import { beheerWeergave, lessenIn } from "@/lib/rijschool/weergave";
import { isDatum, moment } from "@/lib/rijschool/planning";
import type { Rijschool } from "@prisma/client";
import { stuurGeslaagd, zetAutomail } from "@/lib/rijschool/automailer";
import { gesprekMet, markeerGelezen, stuurBericht } from "@/lib/rijschool/berichten";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

// "2026-11-03" → een moment rond 12:00 UTC, zodat de datum in elke tijdzone gelijk blijft
const alleenDatum = (d: string) => (d ? new Date(`${d}T12:00:00Z`) : null);

// GET /api/rijschool/beheer — alles voor het beheer, of (nog niet aan) wat we al weten.
// ?van=2026-11-03&dagen=7 — de lessen in die periode, voor de agenda.
// ?berichten=<leerlingId> — het gesprek met die leerling.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { p, tenantId, rijschool } = await beheerContext();
    if (!rijschool) {
      const d = await companyDefaults(tenantId, p);
      return NextResponse.json({ aan: false, voorstel: { naam: d.naam, plaats: d.plaats, telefoon: d.telefoon, email: d.email } });
    }
    const url = new URL(request.url);
    const metLeerling = url.searchParams.get("berichten");
    if (metLeerling) {
      const l = await eigenLeerling(rijschool, metLeerling);
      return NextResponse.json({ berichten: await gesprekMet(l.id) });
    }
    const van = url.searchParams.get("van");
    if (van) {
      if (!isDatum(van)) throw AppError.validation("Kies een datum.");
      const dagen = Math.min(Math.max(Number(url.searchParams.get("dagen") ?? 7) || 7, 1), 42);
      const begin = moment(van, "00:00");
      return NextResponse.json({ lessen: await lessenIn(rijschool, begin, new Date(begin.getTime() + dagen * 86_400_000 + 3_600_000)) });
    }
    return NextResponse.json({ aan: true, ...(await beheerWeergave(rijschool)) });
  } catch (err) {
    return fout(err);
  }
}

// POST — zet het rijschool-pakket aan.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { p, tenantId } = await beheerContext();
    const input = lees(aanzettenSchema, await request.json().catch(() => ({})));
    const r = await maakRijschool(tenantId, { naam: p.fullName, email: p.email }, input);
    return NextResponse.json({ aan: true, ...(await beheerWeergave(r)) }, { status: 201 });
  } catch (err) {
    return fout(err);
  }
}

// PATCH — één wijziging (instellingen, website, instructeur, auto, pakket, leerling, les, betaling, …).
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const { p, rijschool } = await eisBeheer();
    const actie = lees(beheerActieSchema, await request.json().catch(() => ({})));
    const extra = await voerUit(rijschool, actie, p.fullName);
    const bij = await prisma.rijschool.findUniqueOrThrow({ where: { id: rijschool.id } });
    return NextResponse.json({ aan: true, ...extra, ...(await beheerWeergave(bij)) });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return fout(AppError.conflict("Dit e-mailadres is al in gebruik bij deze rijschool."));
    }
    return fout(err);
  }
}

async function voerUit(r: Rijschool, a: BeheerActie, door: string): Promise<Record<string, unknown>> {
  switch (a.actie) {
    case "instellingen":
      await prisma.rijschool.update({ where: { id: r.id }, data: a.data });
      return {};
    case "website":
      await prisma.rijschool.update({ where: { id: r.id }, data: { website: a.data } });
      return {};
    case "instructeur": {
      const { werktijden, ...rest } = a.data;
      const data = { ...rest, beschikbaarheid: werktijden };
      if (a.id) await prisma.rijschoolInstructeur.update({ where: { id: (await eigenInstructeur(r, a.id)).id }, data });
      else await prisma.rijschoolInstructeur.create({ data: { ...data, rijschoolId: r.id } });
      return {};
    }
    case "voertuig":
      if (a.id) {
        const v = await prisma.rijschoolVoertuig.findFirst({ where: { id: a.id, rijschoolId: r.id }, select: { id: true } });
        if (!v) throw AppError.notFound("Auto niet gevonden.");
        await prisma.rijschoolVoertuig.update({ where: { id: v.id }, data: a.data });
      } else {
        await prisma.rijschoolVoertuig.create({ data: { ...a.data, rijschoolId: r.id } });
      }
      return {};
    case "voertuigWeg":
      await prisma.rijschoolVoertuig.deleteMany({ where: { id: a.id, rijschoolId: r.id } });
      return {};
    case "product":
      if (a.id) {
        const pr = await prisma.rijschoolProduct.findFirst({ where: { id: a.id, rijschoolId: r.id }, select: { id: true } });
        if (!pr) throw AppError.notFound("Pakket niet gevonden.");
        await prisma.rijschoolProduct.update({ where: { id: pr.id }, data: a.data });
      } else {
        await prisma.rijschoolProduct.create({ data: { ...a.data, rijschoolId: r.id } });
      }
      return {};
    case "productWeg":
      await prisma.rijschoolProduct.deleteMany({ where: { id: a.id, rijschoolId: r.id } });
      return {};
    case "leerling": {
      if (a.data.instructeurId) await eigenInstructeur(r, a.data.instructeurId);
      const data = { ...a.data, geboortedatum: alleenDatum(a.data.geboortedatum), examenDatum: alleenDatum(a.data.examenDatum) };
      if (a.id) {
        const voor = await eigenLeerling(r, a.id);
        const bij = await prisma.rijschoolLeerling.update({ where: { id: voor.id }, data });
        // net geslaagd: de felicitatie van de automailer (als die aanstaat)
        if (bij.status === "GESLAAGD" && voor.status !== "GESLAAGD") return { geslaagdGemaild: await stuurGeslaagd(r, bij) };
        return {};
      }
      const nieuw = await prisma.rijschoolLeerling.create({ data: { ...data, rijschoolId: r.id } });
      return { nieuweLeerlingId: nieuw.id };
    }
    case "uitnodigen":
      return { verstuurd: await nodigUit(r, a.soort, a.id) };
    case "les": {
      const start = moment(a.data.datum, a.data.tijd);
      const les = await planLes(
        r,
        {
          instructeurId: a.data.instructeurId,
          leerlingId: a.data.leerlingId,
          voertuigId: a.data.voertuigId,
          soort: a.data.soort,
          start,
          eind: new Date(start.getTime() + a.data.duurMin * 60_000),
          ophaaladres: a.data.ophaaladres,
        },
        a.id,
      );
      if (a.mail) await bevestigLes(r, les);
      return { lesId: les.id };
    }
    case "lesStatus": {
      const les = await zetLesStatus(r, a.id, a.status, door);
      if (a.status === "GEANNULEERD" && a.mail) await meldAnnulering(r, les, "de rijschool");
      return {};
    }
    case "betaling":
      await registreerBetaling(r, a.data, door);
      return {};
    case "correctie":
      await corrigeerTegoed(r, a.data, door);
      return {};
    case "automail":
      await zetAutomail(r.id, a.id, a.aan);
      return {};
    case "bericht": {
      const l = await eigenLeerling(r, a.leerlingId);
      await enforceRateLimit({ name: "rijschool-bericht-school", identifier: r.id, limit: 120, windowSeconds: 600 });
      const bericht = await stuurBericht(r, l, { leerling: false, afzender: door }, a.tekst);
      // wie antwoordt, heeft het gesprek gelezen
      await markeerGelezen(l.id, false);
      return { bericht };
    }
    case "berichtGelezen":
      await markeerGelezen((await eigenLeerling(r, a.leerlingId)).id, false);
      return {};
  }
}
