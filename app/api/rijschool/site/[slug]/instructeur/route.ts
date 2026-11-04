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
import { onlineBetalenAan, startIdeal } from "@/lib/rijschool/betalen";
import { eigenAdres } from "@/lib/rijschool/domein";
import { leesRoute, routeWeergave, voegRouteToe } from "@/lib/rijschool/lesroute";
import { gesprekMet, markeerGelezen, stuurBericht } from "@/lib/rijschool/berichten";
import type { Rijschool, RijschoolInstructeur } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

/** Een leerling van deze instructeur: aan hem gekoppeld, of hij gaf haar les. Alleen met die leerlingen voert hij gesprekken. */
async function mijnLeerling(r: Pick<Rijschool, "id">, i: Pick<RijschoolInstructeur, "id">, leerlingId: string) {
  const l = await prisma.rijschoolLeerling.findFirst({ where: { id: leerlingId, rijschoolId: r.id, OR: [{ instructeurId: i.id }, { lessen: { some: { instructeurId: i.id } } }] } });
  if (!l) throw AppError.forbidden("Dit is niet jouw leerling.");
  return l;
}

const datumUit = (s: string | null) => {
  if (s === null) return amsterdamDayKey(new Date());
  if (!isDatum(s)) throw AppError.validation("Kies een datum.");
  return s;
};

// GET /api/rijschool/site/<slug>/instructeur?datum=2026-11-04 — de lesdag van de ingelogde instructeur.
// ?vrij=2026-11-05&duur=60 — eigen vrije tijden, om de volgende les te plannen.
// ?berichten=<leerlingId> — het gesprek met een eigen leerling.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    const r = await siteRijschool((await params).slug);
    const i = await eisInstructeur(r);
    const url = new URL(request.url);
    const metLeerling = url.searchParams.get("berichten");
    if (metLeerling) return NextResponse.json({ berichten: await gesprekMet((await mijnLeerling(r, i, metLeerling)).id) });
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

// POST — tijdens en na de les: starten, leskaart invullen, afronden, volgende les plannen, betaling in de auto;
// en berichten met je eigen leerlingen.
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
      case "route": {
        // alleen tijdens (of net na) de eigen les; klein antwoord, dit gaat elke halve minuut
        const les = await eigen(a.lesId);
        if (!les.gestartOm && les.status !== "VOLTOOID") throw AppError.precondition("Start eerst de les; pas dan wordt de route opgenomen.");
        const route = voegRouteToe(leesRoute(les.route), a.punten, les);
        await prisma.rijschoolLes.update({ where: { id: les.id }, data: { route: route as unknown as Prisma.InputJsonValue } });
        return NextResponse.json({ ok: true, meters: routeWeergave(route)?.meters ?? 0 });
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
      case "bericht": {
        const l = await mijnLeerling(r, i, a.leerlingId);
        await enforceRateLimit({ name: "rijschool-bericht-instructeur", identifier: i.id, limit: 60, windowSeconds: 600 });
        await stuurBericht(r, l, { leerling: false, afzender: i.naam }, a.tekst);
        // wie antwoordt, heeft het gesprek gelezen
        await markeerGelezen(l.id, false);
        break;
      }
      case "berichtGelezen":
        await markeerGelezen((await mijnLeerling(r, i, a.leerlingId)).id, false);
        break;
      case "ideal": {
        const l = await eigenLeerling(r, a.leerlingId);
        if (!(await onlineBetalenAan(r))) throw AppError.precondition("Online betalen staat nog niet aan bij je rijschool.");
        // een pakket tegen de pakketprijs; een los bedrag wordt eerst een openstaande betaling
        // (die de leerling ook later in de app kan betalen)
        const wat = a.productId
          ? { productId: a.productId, ookVerborgen: true }
          : { betalingId: (await prisma.rijschoolBetaling.create({ data: { rijschoolId: r.id, leerlingId: l.id, omschrijving: a.omschrijving, bedragCent: a.bedragCent, status: "OPEN" } })).id };
        // de leerling betaalt op zijn eigen telefoon: terug naar het hoofdadres van de rijschool
        return NextResponse.json({ url: await startIdeal(r, l, wat, "/leerling", await eigenAdres(r.id)) });
      }
    }
    return NextResponse.json(await instructeurWeergave(r, i, datum));
  } catch (err) {
    return fout(err);
  }
}
