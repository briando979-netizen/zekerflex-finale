import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { eisZelfdeHerkomst } from "@/lib/rijschool/accounts";
import { lees, proeflesSchema } from "@/lib/rijschool/schema";
import { publiekeRijschool } from "@/lib/rijschool/toegang";
import { boekProefles, PROEFLES_VOORAF_MIN, vrijVoor } from "@/lib/rijschool/store";
import { isDatum, komendeDagen } from "@/lib/rijschool/planning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

// GET /api/rijschool/site/<slug>/proefles — de dagen en instructeurs;
// ?datum=2026-11-04 — de vrije begintijden per instructeur op die dag.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "rijschool-proefles-tijden", identifier: clientIp(request), limit: 120, windowSeconds: 600 });
    const r = await publiekeRijschool((await params).slug);
    if (!r.proeflesOnline) throw AppError.precondition("Deze rijschool plant proeflessen nu niet online.");
    const instructeurs = await prisma.rijschoolInstructeur.findMany({
      where: { rijschoolId: r.id, actief: true },
      select: { id: true, naam: true, beschikbaarheid: true },
      orderBy: { createdAt: "asc" },
    });
    const nu = new Date();
    const datum = new URL(request.url).searchParams.get("datum");
    if (!datum) {
      return NextResponse.json({ dagen: komendeDagen(nu, 21), lesMinuten: r.lesMinuten, instructeurs: instructeurs.map(({ id, naam }) => ({ id, naam })) });
    }
    if (!isDatum(datum) || !komendeDagen(nu, 21).includes(datum)) throw AppError.validation("Kies een dag in de komende drie weken.");
    const tijden = await Promise.all(
      instructeurs.map(async (i) => ({
        instructeurId: i.id,
        naam: i.naam,
        tijden: (await vrijVoor(r, i, datum, r.lesMinuten, nu, PROEFLES_VOORAF_MIN)).map((d) => d.toISOString()),
      })),
    );
    return NextResponse.json({ datum, tijden });
  } catch (err) {
    return fout(err);
  }
}

// POST — boek een proefles; maakt (als dat nog niet bestaat) een aanmelding van de leerling aan.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    eisZelfdeHerkomst(request);
    await enforceRateLimit({
      name: "rijschool-proefles-boek",
      identifier: clientIp(request),
      limit: 5,
      windowSeconds: 3600,
      message: "Je hebt al een paar keer geboekt. Bel of mail de rijschool als het niet lukt.",
    });
    const r = await publiekeRijschool((await params).slug);
    const input = lees(proeflesSchema, await request.json().catch(() => ({})));
    const { les } = await boekProefles(r, { ...input, start: new Date(input.start) });
    return NextResponse.json({ ok: true, start: les.start.toISOString(), eind: les.eind.toISOString() }, { status: 201 });
  } catch (err) {
    return fout(err);
  }
}
