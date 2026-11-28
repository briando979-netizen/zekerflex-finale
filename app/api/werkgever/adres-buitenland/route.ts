import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { werklocatieLandenVoor, zoekBuitenlandsAdres } from "@/lib/geo/vestiging-buitenland";
import { isGesanctioneerdLand, SANCTIE_MELDING } from "@/lib/geo/vestiging-land";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/werkgever/adres-buitenland: een werklocatie buiten Nederland opzoeken bij OpenStreetMap
// (lib/geo/vestiging-buitenland.ts), voor de knop "Adres zoeken" in components/werkgever/BuitenlandAdres.tsx (Locaties, Jouw
// start, Klus uitzetten en een eenmalige locatie bij een klus). Alleen voor een land dat de vlaggen toestaan: `werk-in-belgie`
// (België) of `werk-in-buitenland` (elk land), beide standaard uit; anders 412, geen 403 (CrowdSec). Het adres staat in de
// body, niet in het adres van de aanvraag, zodat het in geen enkel log komt. Opslaan gaat daarna gewoon via
// POST /api/werkgever/branches of het klusformulier, met de punt die deze route teruggeeft.

const MAX_BODY = 4_096;

const schema = z.object({
  land: z.string().max(2).default(""),
  straat: z.string().max(160).default(""),
  postcode: z.string().max(16).default(""),
  plaats: z.string().max(100).default(""),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY) throw AppError.validation("Dit adres is te lang.");
    const principal = await requirePrincipal();
    requireRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");
    const b = schema.safeParse(await request.json().catch(() => null));
    if (!b.success) throw AppError.validation("Controleer de ingevulde gegevens.");
    // zonder land: een tabblad van vóór 28 nov 2026 (toen alleen België), via /api/werkgever/adres-belgie
    const land = b.data.land.trim().toUpperCase() || "BE";
    // landen met zware sancties: de eigen melding, nooit "staat nog niet aan"
    if (isGesanctioneerdLand(land)) throw AppError.validation(SANCTIE_MELDING, { reden: "buitenland-sanctie" });
    const landen = await werklocatieLandenVoor(principal);
    if (land === "NL" || !landen.includes(land)) {
      throw new AppError("PRECONDITION_FAILED", "Werklocaties in dit land staan nog niet aan.", 412, { reden: "buitenland-uit" });
    }
    await enforceRateLimit({
      name: "adres-buitenland",
      identifier: principal.userId,
      limit: 20,
      windowSeconds: 600,
      message: "Je zocht net al veel adressen op. Probeer het over een paar minuten opnieuw.",
    });
    const adres = await zoekBuitenlandsAdres({ ...b.data, land });
    return NextResponse.json({
      result: { label: adres.label, lat: adres.latitude, lng: adres.longitude, straat: adres.straat, postcode: adres.postalCode, plaats: adres.city },
    });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
