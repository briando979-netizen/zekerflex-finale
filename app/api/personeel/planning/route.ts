import { after, NextResponse } from "next/server";
import { meldBeheerders } from "@/lib/horeca-personeel/meldingen";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { medewerkerContext, type MedewerkerContext } from "@/lib/horeca-personeel/context";
import type { Blok } from "@/lib/horeca-personeel/model";
import { isDatum } from "@/lib/horeca-personeel/planning";
import {
  biedDienstAan,
  klokIn,
  klokUit,
  leesPlanningVan,
  meldNietBeschikbaar,
  neemOpenDienst,
  neemRuilAan,
  trekRuilIn,
  trekVerlofIn,
  verwijderNietBeschikbaar,
  vraagVerlof,
} from "@/lib/horeca-personeel/planning-store";
import { planningVoorMedewerker } from "@/lib/horeca-personeel/planning-view";
import { leesPersoneelVan } from "@/lib/horeca-personeel/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De planning voor een medewerker (app/personeel): zijn eigen diensten, open diensten en aanbiedingen, niet-beschikbaar, ruilen,
// verlof en uren. Elke actie hoort bij een onderdeel van zijn dashboard (rooster, verlof of uren); het id van de medewerker komt
// uit zijn sessie, nooit uit het verzoek.

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

async function eis(blok: Blok[]): Promise<MedewerkerContext> {
  const c = await medewerkerContext();
  if (!c) throw AppError.unauthenticated();
  if (!blok.some((b) => c.dashboard.blokken.includes(b))) throw AppError.forbidden("Dit onderdeel staat niet op jouw dashboard.");
  return c;
}

async function antwoord(c: MedewerkerContext, extra: Record<string, unknown> = {}): Promise<NextResponse> {
  const [p, d] = await Promise.all([leesPlanningVan(c.tenantId), leesPersoneelVan(c.tenantId)]);
  return NextResponse.json({ ...planningVoorMedewerker(p, d, c.medewerker.id, amsterdamDayKey(new Date())), ...extra });
}

export async function GET(): Promise<NextResponse> {
  try {
    return await antwoord(await eis(["rooster", "verlof", "uren"]));
  } catch (err) {
    return fout(err);
  }
}

const id = z.string().min(1).max(40);
const datum = z.string().refine(isDatum, "Kies een geldige datum.");
const actieSchema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("niet-beschikbaar"), datum, notitie: z.string().max(300).default("") }),
  z.object({ actie: z.literal("niet-beschikbaar-weg"), id }),
  z.object({ actie: z.literal("aanbieden"), dienstId: id, naar: id.nullable().default(null) }),
  z.object({ actie: z.literal("aannemen"), ruilId: id }),
  z.object({ actie: z.literal("open-nemen"), dienstId: id }),
  z.object({ actie: z.literal("ruil-intrekken"), ruilId: id }),
  z.object({ actie: z.literal("verlof-aanvragen"), van: datum, tot: datum, reden: z.string().max(300).default("") }),
  z.object({ actie: z.literal("verlof-intrekken"), id }),
  z.object({ actie: z.literal("klok-in") }),
  z.object({ actie: z.literal("klok-uit") }),
]);

const BLOK_VAN: Record<z.infer<typeof actieSchema>["actie"], Blok> = {
  "niet-beschikbaar": "rooster",
  "niet-beschikbaar-weg": "rooster",
  aanbieden: "rooster",
  aannemen: "rooster",
  "open-nemen": "rooster",
  "ruil-intrekken": "rooster",
  "verlof-aanvragen": "verlof",
  "verlof-intrekken": "verlof",
  "klok-in": "uren",
  "klok-uit": "uren",
};

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    const parsed = actieSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation(parsed.error.issues[0]?.message ?? "Dit verzoek klopt niet.");
    const a = parsed.data;
    const c = await eis([BLOK_VAN[a.actie]]);
    await enforceRateLimit({ name: "personeel-planning", identifier: c.userId, limit: 200, windowSeconds: 3600 });
    const t = c.tenantId;
    const m = c.medewerker.id;
    switch (a.actie) {
      case "niet-beschikbaar":
        await meldNietBeschikbaar(t, m, { datum: a.datum, notitie: a.notitie });
        break;
      case "niet-beschikbaar-weg":
        await verwijderNietBeschikbaar(t, m, a.id);
        break;
      case "aanbieden":
        await biedDienstAan(t, m, a.dienstId, a.naar);
        break;
      case "aannemen":
        await neemRuilAan(t, m, a.ruilId);
        after(() => meldBeheerders(t, `${c.naam} wil een dienst overnemen`, "ruil-wacht"));
        break;
      case "open-nemen":
        await neemOpenDienst(t, m, a.dienstId);
        after(() => meldBeheerders(t, `${c.naam} wil een open dienst nemen`, "ruil-wacht"));
        break;
      case "ruil-intrekken":
        await trekRuilIn(t, m, a.ruilId);
        break;
      case "verlof-aanvragen":
        await vraagVerlof(t, m, { van: a.van, tot: a.tot, reden: a.reden });
        after(() => meldBeheerders(t, `${c.naam} vraagt verlof aan`, "verlof-wacht"));
        break;
      case "verlof-intrekken":
        await trekVerlofIn(t, m, a.id);
        break;
      case "klok-in":
        await klokIn(t, m);
        break;
      case "klok-uit":
        await klokUit(t, m);
        break;
    }
    return await antwoord(c);
  } catch (err) {
    return fout(err);
  }
}
