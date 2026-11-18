import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { cjZoek } from "@/lib/shop/cj/cj-client";
import { naarEngelsZoekwoord } from "@/lib/shop/cj/zoekwoord";
import { leesCjInstellingen } from "@/lib/shop/cj/importeer";
import { leesBeleidOpgeslagen } from "@/lib/shop/winkel-ai";
import { prijsUitInkoop, tariefVoor } from "@/lib/shop/winkel-ai-core";
import { koersDatumTekst, naarEuroCents } from "@/lib/integrations/wisselkoers";
import { ecbKoersen } from "@/lib/integrations/wisselkoers-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const schema = z.object({
  q: z.string().trim().max(80).default(""),
  pagina: z.number().int().min(1).max(200).default(1),
  land: z.string().trim().max(2).optional(),
});

// POST /api/admin/shop-ai/cj/zoek — zoeken in de catalogus van CJ (50 punten per keer), met per treffer
// de inkoop in euro's (ECB-dagkoers) en de verkoopprijs die de marge zou geven. Slaat niets op.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  await enforceRateLimit({ name: "shop-cj-zoek", identifier: principal.userId, limit: 120, windowSeconds: 3600, message: "Even rustig aan met zoeken bij CJ; probeer het zo opnieuw." });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Typ een zoekwoord (hooguit 80 tekens).");
  const [instel, beleid, koersen] = await Promise.all([leesCjInstellingen(), leesBeleidOpgeslagen(), ecbKoersen().catch(() => null)]);
  const land = parsed.data.land !== undefined ? parsed.data.land : instel.land;
  // de catalogus is Engels; "speelgoed" wordt "toys" (lib/shop/cj/zoekwoord.ts), Engels blijft Engels
  const zoek = naarEngelsZoekwoord(parsed.data.q);
  const r = await cjZoek({ q: zoek.q, pagina: parsed.data.pagina, land: land || undefined });
  const marge = instel.margePct ?? beleid.margePct;
  const producten = r.treffers.map((t) => {
    const inkoopCents = koersen ? naarEuroCents(t.inkoopUsdCents, "USD", koersen) : null;
    const prijs = inkoopCents !== null ? prijsUitInkoop(inkoopCents + instel.verzendCents, marge, tariefVoor(t.naamEn)) : null;
    return { ...t, inkoopCents, prijsCents: prijs?.prijsCents ?? null };
  });
  return NextResponse.json({ producten, totaal: r.totaal, pagina: r.pagina, gezochtOp: zoek.q, vertaald: zoek.vertaald, land, margePct: marge, verzendCents: instel.verzendCents, koersDatum: koersen ? koersDatumTekst(koersen.datum) : null });
});
