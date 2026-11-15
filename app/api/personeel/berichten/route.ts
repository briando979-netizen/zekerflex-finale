import { after, NextResponse } from "next/server";
import { meldChat } from "@/lib/horeca-personeel/meldingen";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { medewerkerContext } from "@/lib/horeca-personeel/context";
import { KANAAL_TEAM, berichtenVan, dmKanaal, kanaalToegang, plaatsBericht } from "@/lib/horeca-personeel/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De chat van een medewerker (app/personeel): het teamkanaal en het eigen gesprek met de beheerder. Alleen als zijn dashboard het
// onderdeel "berichten" heeft. "beheer" in het verzoek is zijn eigen gesprek; een kanaal van een ander kan hij nooit kiezen.

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

async function eisBerichten() {
  const c = await medewerkerContext();
  if (!c) throw AppError.unauthenticated();
  if (!c.dashboard.blokken.includes("berichten")) throw AppError.forbidden("Dit onderdeel staat niet op jouw dashboard.");
  return c;
}

const kanaalVan = (k: string | null, medewerkerId: string): string => (k === "beheer" ? dmKanaal(medewerkerId) : KANAAL_TEAM);

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const c = await eisBerichten();
    const kanaal = kanaalVan(new URL(request.url).searchParams.get("kanaal"), c.medewerker.id);
    if (!kanaalToegang(kanaal, c.medewerker.id)) throw AppError.forbidden("Geen toegang tot dit gesprek.");
    const lijst = await berichtenVan(c.tenantId, kanaal);
    return NextResponse.json({ berichten: lijst.slice(-100), ik: c.medewerker.id });
  } catch (err) {
    return fout(err);
  }
}

const postSchema = z.object({ kanaal: z.enum(["team", "beheer"]), tekst: z.string().max(2000) });

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    const c = await eisBerichten();
    await enforceRateLimit({ name: "personeel-berichten", identifier: c.userId, limit: 60, windowSeconds: 600 });
    const parsed = postSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Dit verzoek klopt niet.");
    const kanaal = kanaalVan(parsed.data.kanaal, c.medewerker.id);
    if (!kanaalToegang(kanaal, c.medewerker.id)) throw AppError.forbidden("Geen toegang tot dit gesprek.");
    await plaatsBericht(c.tenantId, kanaal, { id: c.medewerker.id, naam: c.naam }, parsed.data.tekst);
    after(() => meldChat(c.tenantId, kanaal, { id: c.medewerker.id, naam: c.naam }));
    return NextResponse.json({ berichten: (await berichtenVan(c.tenantId, kanaal)).slice(-100), ik: c.medewerker.id }, { status: 201 });
  } catch (err) {
    return fout(err);
  }
}
