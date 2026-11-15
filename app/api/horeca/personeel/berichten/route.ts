import { after, NextResponse } from "next/server";
import { meldChat } from "@/lib/horeca-personeel/meldingen";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { eisBeheer } from "@/lib/horeca/toegang";
import { berichtenVan, kanaalToegang, plaatsBericht, verwijderBericht } from "@/lib/horeca-personeel/chat";
import { leesPersoneelVan } from "@/lib/horeca-personeel/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De chat van het personeel, voor de beheerder van de zaak: het teamkanaal en het gesprek met elke medewerker, lezen, schrijven
// en een bericht weghalen. Een gesprek met een medewerker die niet (meer) in de lijst staat, bestaat niet.

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

const kanaalSchema = z.string().min(1).max(60);

async function eisKanaal(tenantId: string, kanaal: string): Promise<void> {
  if (!kanaalToegang(kanaal, null)) throw AppError.validation("Dit gesprek bestaat niet.");
  if (kanaal.startsWith("dm-")) {
    const d = await leesPersoneelVan(tenantId);
    if (!d.medewerkers.some((m) => `dm-${m.id}` === kanaal)) throw AppError.notFound("Dit gesprek bestaat niet.");
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { tenantId } = await eisBeheer();
    const kanaal = kanaalSchema.parse(new URL(request.url).searchParams.get("kanaal") ?? "team");
    await eisKanaal(tenantId, kanaal);
    return NextResponse.json({ berichten: (await berichtenVan(tenantId, kanaal)).slice(-100) });
  } catch (err) {
    return fout(err);
  }
}

const postSchema = z.object({ kanaal: kanaalSchema, tekst: z.string().max(2000) });

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    const { p, tenantId } = await eisBeheer();
    await enforceRateLimit({ name: "horeca-berichten", identifier: p.userId, limit: 120, windowSeconds: 600 });
    const parsed = postSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Dit verzoek klopt niet.");
    await eisKanaal(tenantId, parsed.data.kanaal);
    await plaatsBericht(tenantId, parsed.data.kanaal, { id: "beheer", naam: p.fullName }, parsed.data.tekst);
    after(() => meldChat(tenantId, parsed.data.kanaal, { id: "beheer", naam: p.fullName }));
    return NextResponse.json({ berichten: (await berichtenVan(tenantId, parsed.data.kanaal)).slice(-100) }, { status: 201 });
  } catch (err) {
    return fout(err);
  }
}

const weg = z.object({ kanaal: kanaalSchema, id: z.string().min(1).max(40) });

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    const { tenantId } = await eisBeheer();
    const parsed = weg.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Dit verzoek klopt niet.");
    await eisKanaal(tenantId, parsed.data.kanaal);
    await verwijderBericht(tenantId, parsed.data.kanaal, parsed.data.id);
    return NextResponse.json({ berichten: (await berichtenVan(tenantId, parsed.data.kanaal)).slice(-100) });
  } catch (err) {
    return fout(err);
  }
}
