import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { emailHash } from "@/lib/auth/email-hash";
import { normaliseerEmail } from "@/lib/shop/voorraadmelding";
import { meldAanVoorVoorraad } from "@/lib/shop/voorraadmelding-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/shop/voorraadmelding — "Laat me weten als hij er weer is" bij een uitverkochte maat of kleur
// (lib/shop/voorraadmelding.ts). Openbaar (de shop kent geen account), begrensd per IP en per adres (de bevestigingsmail
// gaat hooguit 5 keer per dag naar hetzelfde adres); een onbekende maat geeft 404, geen 403 (CrowdSec). Het e-mailadres
// komt in geen log; de limiet per adres gebruikt een hash.

const schema = z.object({
  variantId: z.string().min(1).max(40),
  email: z.string().max(200),
  taal: z.enum(["nl", "en"]).optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "shop-voorraadmelding",
      identifier: clientIp(req),
      limit: 10,
      windowSeconds: 3600,
      message: "Te veel aanvragen vanaf dit adres, probeer het later opnieuw.",
    });
    const d = schema.safeParse(await req.json().catch(() => null));
    if (!d.success) throw AppError.validation("Vul een geldig e-mailadres in.");
    const email = normaliseerEmail(d.data.email);
    if (!email) throw AppError.validation("Vul een geldig e-mailadres in.");
    await enforceRateLimit({
      name: "shop-voorraadmelding-adres",
      identifier: emailHash(email),
      limit: 5,
      windowSeconds: 86_400,
      message: "Er gingen vandaag al genoeg mails naar dit adres. Probeer het morgen opnieuw.",
    });
    const uitslag = await meldAanVoorVoorraad(d.data.variantId, email, d.data.taal ?? "nl");
    if (uitslag === "onbekend") throw AppError.notFound("Dit product bestaat niet (meer).");
    return NextResponse.json({ uitslag });
  } catch (error) {
    return jsonError(error);
  }
}
