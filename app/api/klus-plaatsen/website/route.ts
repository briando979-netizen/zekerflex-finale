import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { enforceRateLimit, privateRateLimitIdentifier } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { recordServerEvent } from "@/lib/analytics/track";
import { FetchError, fetchPage, fetchResource, type FetchedPage } from "@/lib/website-check/fetch";
import { normalizeInput } from "@/lib/website-check/run";
import { clipSentences, extractBusiness } from "@/lib/website-check/proposal";
import { cleanImage } from "@/lib/media/clean-image";
import { CITIES } from "@/lib/seo-cities";
import { cityFromText, cleanBedrijf, guessTemplate, iconHref, isHex, pageSummary, type WebsiteKlus } from "@/lib/klusconcept/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const schema = z.object({ url: z.string().trim().min(3).max(500) });

/** The logo as our own small WebP (img-src 'self'): never the company's address, never SVG. */
async function logoDataUrl(src: string | null): Promise<string | null> {
  if (!src) return null;
  try {
    const res = await fetchResource(src, { maxBytes: 3_000_000, timeoutMs: 6_000, maxRedirects: 3 });
    if (res.status !== 200 || res.truncated) return null;
    const type = (res.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
    if (!type.startsWith("image/") || type === "image/svg+xml") return null;
    const img = await cleanImage(res.data, 192);
    return `data:image/webp;base64,${img.bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

// POST /api/klus-plaatsen/website — /klus-plaatsen leest de openbare voorpagina
// van een bedrijf (één verzoek, plus het logo) en vult daarmee de klus in.
// Niets wordt bewaard. Per bezoeker en in totaal begrensd, alleen openbare
// adressen (lib/website-check/fetch.ts), zodat dit nooit een manier wordt om
// anderen te bestoken of ons eigen netwerk te bereiken.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "klus-website",
      identifier: privateRateLimitIdentifier(clientIp(request)),
      limit: 8,
      windowSeconds: 600,
      message: "Je hebt net een paar websites laten lezen. Probeer het over tien minuten opnieuw, of vul je klus zelf in.",
    });
    await enforceRateLimit({
      name: "klus-website-day",
      identifier: "all",
      limit: 300,
      windowSeconds: 86_400,
      message: "Het is vandaag erg druk. Vul je klus zelf in, of probeer het morgen opnieuw.",
    });

    const json = await request.json().catch(() => {
      throw AppError.validation("Ongeldig verzoek.");
    });
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw AppError.validation("Vul het adres van je website in.");
    const raw = parsed.data.url;
    const url = normalizeInput(raw);

    let page: FetchedPage;
    try {
      page = await fetchPage(url, { timeoutMs: 10_000 });
    } catch (err) {
      // wie "https://" niet typte en een site zonder certificaat heeft: probeer http
      if (err instanceof FetchError && (err.code === "NETWORK" || err.code === "TIMEOUT" || err.code === "TLS") && !/^https?:\/\//i.test(raw)) {
        page = await fetchPage(url.replace(/^https:/, "http:"), { timeoutMs: 10_000 });
      } else {
        throw err;
      }
    }
    if (page.status >= 400) throw new FetchError(`Je website gaf foutcode ${page.status} terug. Kijk of het adres klopt.`, "NETWORK");
    if (!/html/i.test(page.headers["content-type"] ?? "html")) throw new FetchError("Op dit adres staat geen webpagina. Vul het adres van je website in.", "INVALID_URL");

    const html = page.body;
    const facts = extractBusiness(html, page.finalUrl);
    const summary = pageSummary(html);
    const intro = facts.intro && !/cookie/i.test(facts.intro) ? facts.intro : null;
    const tekst = [summary.description ?? "", intro ?? ""].join(" ");
    const host = new URL(page.finalUrl).hostname.replace(/^www\./, "");

    const result: WebsiteKlus = {
      host,
      bedrijf: cleanBedrijf(facts.naam),
      plaats: facts.plaats ?? cityFromText(`${summary.title} ${tekst}`, CITIES.map((c) => c.name)),
      templateKey: guessTemplate({ title: summary.title, koppen: facts.koppen, tekst }),
      over: (() => {
        const s = intro ?? summary.description;
        return s && s.length >= 30 ? clipSentences(s, 240) : null;
      })(),
      kleur: isHex(facts.kleur) ? facts.kleur.toUpperCase() : null,
      logo: await logoDataUrl(facts.logo ?? iconHref(html, page.finalUrl)),
    };
    void recordServerEvent({ path: "/klus-plaatsen", label: "klus-website", meta: { host, functie: result.templateKey ?? "geen" } });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    if (err instanceof FetchError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 422 });
    }
    const res = jsonError(err);
    if (res.status >= 500) logger.error("klus website read failed", { error: (err as Error).message });
    return res;
  }
}
