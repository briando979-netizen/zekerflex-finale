import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { werkInBelgieAan, zoekBelgischAdres } from "@/lib/geo/vestiging-belgie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/werkgever/adres-belgie: een werklocatie in België opzoeken bij OpenStreetMap (lib/geo/vestiging-belgie.ts), voor
// de knop "Adres zoeken" in components/werkgever/BelgischAdres.tsx (Locaties, Jouw start, Klus uitzetten en een eenmalige
// locatie bij een klus). Alleen achter de vlag `werk-in-belgie` (standaard uit: 412, geen 403 voor CrowdSec). Het adres staat
// in de body, niet in het adres van de aanvraag, zodat het in geen enkel log komt. Opslaan gaat daarna gewoon via
// POST /api/werkgever/branches of het klusformulier, met de punt die deze route teruggeeft.

const MAX_BODY = 4_096;

const schema = z.object({
  straat: z.string().max(160).default(""),
  postcode: z.string().max(16).default(""),
  plaats: z.string().max(100).default(""),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY) throw AppError.validation("Dit adres is te lang.");
    const principal = await requirePrincipal();
    requireRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");
    if (!(await werkInBelgieAan(principal))) {
      throw new AppError("PRECONDITION_FAILED", "Werklocaties in België staan nog niet aan.", 412, { reden: "belgie-uit" });
    }
    await enforceRateLimit({
      name: "adres-belgie",
      identifier: principal.userId,
      limit: 20,
      windowSeconds: 600,
      message: "Je zocht net al veel adressen op. Probeer het over een paar minuten opnieuw.",
    });
    const b = schema.safeParse(await request.json().catch(() => null));
    if (!b.success) throw AppError.validation("Controleer de ingevulde gegevens.");
    const adres = await zoekBelgischAdres(b.data);
    return NextResponse.json({
      result: { label: adres.label, lat: adres.latitude, lng: adres.longitude, straat: adres.straat, postcode: adres.postalCode, plaats: adres.city },
    });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
