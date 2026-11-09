import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { cached } from "@/lib/redis";
import { autocompleteCompanies, isKvkBaseEnabled, searchCompanies } from "@/lib/integrations/kvkbase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ q: z.string().trim().min(2).max(120) });

/** Dezelfde zoekvraag een halve dag onthouden: tijdens het typen raakt niet elke letter de KVK-dienst. */
const ZOEK_CACHE_S = 12 * 3600;

/** De KVK-dienst zit aan zijn limiet of zijn tegoed (lib/integrations/kvkbase.ts, 402/429). */
function isLimiet(err: unknown): boolean {
  return err instanceof Error && /rate limit|quota/i.test(err.message);
}

type Treffer = { kvkNumber: string; name: string; city?: string };

async function zoek(q: string): Promise<Treffer[]> {
  try {
    const hits = await autocompleteCompanies(q);
    return hits.slice(0, 8).map((h) => ({ kvkNumber: h.kvkNumber, name: h.name, ...(h.city ? { city: h.city } : {}) }));
  } catch (err) {
    // bij een limiet niet meteen nog een vraag aan dezelfde dienst: die loopt er ook tegenaan
    if (isLimiet(err)) throw err;
    const hits = await searchCompanies(q);
    return hits.slice(0, 8).map((h) => ({ kvkNumber: h.kvkNumber, name: h.legalName, ...(h.city ? { city: h.city } : {}) }));
  }
}

// GET /api/company/search?q=… — public Handelsregister autocomplete for the
// sign-up form. Returns { configured:false } when no KVKBase key is set, so the
// UI can fall back to a plain name field. Rate-limited: each call proxies to
// the paid KVKBase API.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "company-search",
      identifier: clientIp(request),
      limit: 20,
      windowSeconds: 60,
      message: "Te veel zoekopdrachten — probeer het over een minuut opnieuw.",
    });

    if (!isKvkBaseEnabled()) {
      return NextResponse.json({ configured: false, results: [] });
    }
    const parsed = schema.safeParse({ q: new URL(request.url).searchParams.get("q") ?? "" });
    if (!parsed.success) {
      return NextResponse.json({ configured: true, results: [] });
    }

    const sleutel = `kvk-zoek:${createHash("sha256").update(parsed.data.q.toLowerCase()).digest("hex").slice(0, 32)}`;
    try {
      const results = await cached(sleutel, ZOEK_CACHE_S, () => zoek(parsed.data.q));
      return NextResponse.json({ configured: true, results });
    } catch (err) {
      // even bezet: geen fout voor de bezoeker, het formulier valt terug op zelf invullen
      if (isLimiet(err)) return NextResponse.json({ configured: true, results: [], bezet: true });
      throw err;
    }
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.warn("public company search failed", { error: (err as Error).message });
    return res;
  }
}
