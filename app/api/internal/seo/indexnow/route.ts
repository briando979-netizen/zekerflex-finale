import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { SITE } from "@/lib/seo";
import { pingIndexNow } from "@/lib/seo/indexnow";
import { INDEXNOW_VERSIE_KV, VASTE_PADEN, gemeldeVersie, kiesIndexNowUrls, type GemeldeVersie, type SitemapRegel } from "@/lib/seo/indexnow-keuze";
import { bingDienBatchIn } from "@/lib/seo/bing-webmaster";
import { liveVersie } from "@/lib/bouwer/versie";
import { kvGet, kvSet } from "@/lib/storage/kv";
import sitemap from "@/app/sitemap";
import { alleenFlexwerkAan } from "@/lib/seo/verbergen";
import { verwijderdePaden } from "@/lib/seo/verwijderd";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Dagelijks bij IndexNow (Bing/Yandex) melden wat er te halen valt, zodat het net zo snel geïndexeerd raakt als bij
// Google. No-op zonder INDEXNOW_KEY. Welke URL's (22 nov 2026, lib/seo/indexnow-keuze.ts): na een nieuwe versie de hele
// sitemap, anders de vaste paden plus wat de sitemap de laatste dagen als gewijzigd noemt.

async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  try {
    // plus de pagina's die uit de zoekmachines moeten (lib/seo/verwijderd.ts): opnieuw ophalen = de noindex zien
    const weg = (await alleenFlexwerkAan().catch(() => false)) ? verwijderdePaden() : [];

    // de sitemap één keer: voor IndexNow en voor Bing. Lukt hij niet, dan gaan alleen de vaste paden naar IndexNow.
    let regels: SitemapRegel[] = [];
    let sitemapOk = false;
    try {
      regels = await sitemap();
      sitemapOk = true;
    } catch (err) {
      logger.warn("indexnow sitemap skipped", { error: (err as Error).message });
    }

    const versie = liveVersie()?.sha ?? null;
    const vorige = gemeldeVersie(await kvGet<unknown>(INDEXNOW_VERSIE_KV).catch(() => null));
    const keuze = kiesIndexNowUrls({ versie, vorige, regels, vast: [...VASTE_PADEN, ...weg], basis: SITE.url, nu: new Date() });
    const result = await pingIndexNow(keuze.urls);
    // pas onthouden als de melding gelukt is: zonder sleutel of bij een fout komt de hele sitemap morgen opnieuw
    if (keuze.onthoud && result.ok && sitemapOk) {
      const gemeld: GemeldeVersie = { versie: keuze.onthoud, op: new Date().toISOString(), aantal: result.sent };
      await kvSet(INDEXNOW_VERSIE_KV, gemeld).catch(() => undefined);
    }
    recordCronRun("indexnow", result.ok);

    // Daarnaast een ronde sitemap-URL's rechtstreeks bij Bing indienen (naast IndexNow), binnen het dagquotum en met
    // omloop zodat de hele site langskomt. Faalt stil en doet niets zonder Bing-sleutel (lib/seo/bing-webmaster.ts).
    let bing: { ingediend: number; ok: boolean; reden?: string } = { ingediend: 0, ok: false, reden: "overgeslagen" };
    if (sitemapOk) {
      try {
        bing = await bingDienBatchIn(regels.map((r) => r.url));
      } catch (err) {
        logger.warn("bing submit skipped", { error: (err as Error).message });
      }
    }
    recordCronRun("bing-indienen", bing.ok || bing.reden === "geen sleutel");

    return NextResponse.json({ indexnow: { ...result, soort: keuze.soort }, bing });
  } catch (err) {
    recordCronRun("indexnow", false);
    logger.error("indexnow ping failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "IndexNow failed" } }, { status: 500 });
  }
}

export const GET = handle;
