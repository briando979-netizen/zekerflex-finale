import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { autocompleteCompanies, isKvkBaseEnabled, searchCompanies } from "@/lib/integrations/kvkbase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ q: z.string().trim().min(2).max(120) });

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

    let results: { kvkNumber: string; name: string; city?: string }[] = [];
    try {
      const hits = await autocompleteCompanies(parsed.data.q);
      results = hits.map((h) => ({
        kvkNumber: h.kvkNumber,
        name: h.name,
        ...(h.city ? { city: h.city } : {}),
      }));
    } catch {
      const hits = await searchCompanies(parsed.data.q);
      results = hits.map((h) => ({
        kvkNumber: h.kvkNumber,
        name: h.legalName,
        ...(h.city ? { city: h.city } : {}),
      }));
    }

    return NextResponse.json({ configured: true, results: results.slice(0, 8) });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.warn("public company search failed", { error: (err as Error).message });
    return res;
  }
}
