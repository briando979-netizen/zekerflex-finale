import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { eisBeheerder, eisZelfdeHerkomst } from "@/lib/voorstel/schwarzwald-accounts";
import { klantDossier, klanten, verwijderItem, voegItemToe, wijzigKlantkaart, zetTaak } from "@/lib/voorstel/schwarzwald-crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CRM in het beheer.
// GET              → alle klanten (samengevoegd per e-mail)
// GET ?email=      → klantdossier (kaart, reserveringen, aanvragen, tijdlijn)
// PATCH            → klantkaart bijwerken
// POST {actie}     → notitie / taak / bericht toevoegen, taak afvinken, item weg

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    const email = new URL(request.url).searchParams.get("email");
    if (email) return NextResponse.json(await klantDossier(email));
    return NextResponse.json({ klanten: await klanten() });
  } catch (err) {
    return jsonError(err);
  }
}

const kaart = z.object({
  email: z.string().trim().email().max(200),
  naam: z.string().trim().max(120).optional(),
  telefoon: z.string().trim().max(40).optional(),
  bedrijf: z.string().trim().max(160).optional(),
  soort: z.enum(["particulier", "zakelijk"]).optional(),
  status: z.enum(["", "lead", "klant", "vaste-klant", "inactief"]).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  wensen: z.string().trim().max(1000).optional(),
  notitie: z.string().trim().max(5000).optional(),
});

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    eisZelfdeHerkomst(request);
    const parsed = kaart.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Ongeldige klantgegevens.");
    const { email, ...rest } = parsed.data;
    return NextResponse.json({ kaart: await wijzigKlantkaart(email, rest) });
  } catch (err) {
    return jsonError(err);
  }
}

const actie = z.discriminatedUnion("actie", [
  z.object({
    actie: z.literal("toevoegen"),
    email: z.string().trim().email().max(200),
    soort: z.enum(["notitie", "taak", "bericht-team"]),
    tekst: z.string().trim().min(1).max(5000),
    vervalt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  z.object({ actie: z.literal("taak"), email: z.string().trim().email().max(200), id: z.string().max(40), klaar: z.boolean() }),
  z.object({ actie: z.literal("verwijderen"), email: z.string().trim().email().max(200), id: z.string().max(40) }),
]);

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const wie = await eisBeheerder();
    eisZelfdeHerkomst(request);
    const parsed = actie.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Ongeldige actie.");
    const d = parsed.data;
    if (d.actie === "toevoegen") {
      return NextResponse.json({ item: await voegItemToe({ email: d.email, soort: d.soort, tekst: d.tekst, door: wie.naam, ...(d.soort === "taak" && d.vervalt ? { vervalt: d.vervalt } : {}) }) });
    }
    if (d.actie === "taak") return NextResponse.json({ item: await zetTaak(d.email, d.id, d.klaar) });
    await verwijderItem(d.email, d.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
