import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrincipal } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { clientIp } from "@/lib/http/request";
import { logger } from "@/lib/logger";
import { enforceRateLimit, privateRateLimitIdentifier } from "@/lib/rate-limit";
import { GRENZEN, idUitPad, isMeldReden, meldRedenNaam, schoneTekst } from "@/lib/community/regels";
import { meld } from "@/lib/community/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  onderwerp: z.string().max(200),
  reactie: z.string().regex(/^[a-z0-9]{4,32}$/).nullable().default(null),
  reden: z.string().max(40),
  toelichting: z.string().max(2000).default(""),
});

// POST /api/community/melden: een bericht melden (Digital Services Act: een meldknop voor iedereen, ook zonder account).
// Openbaar (lib/auth/public-routes.ts), per IP begrensd. Eén melding per melder per bericht telt; na drie verschillende
// melders is het bericht verborgen tot beheer kijkt (lib/community/regels.ts). De eigenaar krijgt een bericht via de
// melder, zonder naam of tekst. Van het IP bewaren we alleen een hash.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ip = clientIp(request);
    await enforceRateLimit({ name: "community-melden", identifier: ip, limit: 10, windowSeconds: 3600, message: "Je hebt al veel meldingen gedaan. Probeer het later opnieuw, of mail support@zekerflex.com." });
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success || !isMeldReden(parsed.data.reden)) throw AppError.validation("Kies een reden voor je melding.");
    const onderwerpId = idUitPad(parsed.data.onderwerp);
    if (!onderwerpId) throw AppError.notFound("Dit bericht bestaat niet.");
    const p = await getPrincipal().catch(() => null);
    const door = p ? `u:${p.userId}` : `ip:${privateRateLimitIdentifier(`community:${ip}`).slice(0, 24)}`;
    const reden = parsed.data.reden;
    const uitslag = await meld({
      onderwerpId,
      reactieId: parsed.data.reactie,
      door,
      reden,
      toelichting: schoneTekst(parsed.data.toelichting).slice(0, GRENZEN.toelichting),
    });
    if (uitslag.nieuw) {
      const titel = uitslag.verborgen ? "Community: bericht verborgen na meldingen" : `Community: nieuwe melding (${meldRedenNaam(reden).toLowerCase()})`;
      void import("@/lib/ops/melder")
        .then(({ meldGebeurtenis }) => meldGebeurtenis({ soort: "overig", belang: "direct", titel, url: "/admin/community" }))
        .catch(() => undefined);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("community melden mislukt", { error: (err as Error).message });
    return res;
  }
}
