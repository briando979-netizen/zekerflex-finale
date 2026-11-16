import { kvGet, kvSet } from "@/lib/storage/kv";
import { sealSecret, openSecret } from "@/lib/security/sealed-secret";
import { SITE } from "@/lib/seo";

// ---------------------------------------------------------------------------
// Bing Webmaster API (16 nov 2026): naast IndexNow onze pagina's rechtstreeks bij
// Bing indienen voor snel crawlen, en de index-/verkeersstand aflezen. IndexNow
// meldt alleen nieuwe/gewijzigde pagina's; dit werkt de hele sitemap bij, elke dag
// een stukje (het dagquotum is laag en groeit vanzelf). ChatGPT en Copilot zoeken
// via de index van Bing, dus dit helpt ook daar.
//
// De sleutel komt uit Beheer (KV, verzegeld) of uit de omgeving (BING_WEBMASTER_KEY);
// zonder sleutel doet alles hieronder niets. De sleutel wordt nooit afgedrukt of
// gelogd. De API kan alleen URL's indienen en cijfers lezen voor deze ene site; hij
// kan geen geld of accounts raken.
// ---------------------------------------------------------------------------

const KV_KEY = "bing:webmaster-key";
const KV_CURSOR = "bing:indien-cursor";
const DOEL = "bing-webmaster";
const BASE = "https://ssl.bing.com/webmaster/api.svc/json";
/** Bing neemt hooguit zoveel URL's per aanroep; het dagquotum is apart (en meestal lager). */
const MAX_PER_AANROEP = 450;

/** De Bing-sleutel: eerst uit Beheer (KV, verzegeld), anders uit de omgeving. Null = niet ingesteld. */
export async function bingWebmasterKey(): Promise<string | null> {
  try {
    const sealed = await kvGet<string>(KV_KEY);
    if (sealed) return openSecret(sealed, DOEL);
  } catch {
    /* onleesbaar (sleutel gewisseld) of opslag weg → val terug op de omgeving */
  }
  return process.env.BING_WEBMASTER_KEY?.trim() || null;
}

/** Bewaar de sleutel verzegeld in Beheer (lege tekst = wissen). */
export async function setBingWebmasterKey(plain: string): Promise<void> {
  const k = plain.trim();
  await kvSet(KV_KEY, k ? sealSecret(k, DOEL) : null);
}

/** Is er een sleutel (zonder hem te tonen)? Voor Beheer → Alles gratis en de owner-todo. */
export async function bingWebmasterIngesteld(): Promise<boolean> {
  return (await bingWebmasterKey()) !== null;
}

interface BingAntwoord {
  status: number;
  d?: unknown;
}

async function bingGet(fn: string, key: string): Promise<BingAntwoord> {
  const res = await fetch(`${BASE}/${fn}?apikey=${key}&siteUrl=${encodeURIComponent(SITE.url + "/")}`, {
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await res.json().catch(() => ({}))) as { d?: unknown };
  return { status: res.status, d: j.d };
}

/** Hoeveel URL's mogen we vandaag nog indienen? Null = onbekend (sleutel of API weg). */
export async function bingDagquotum(key: string): Promise<number | null> {
  try {
    const r = await bingGet("GetUrlSubmissionQuota", key);
    const dag = (r.d as { DailyQuota?: number } | undefined)?.DailyQuota;
    return typeof dag === "number" ? dag : null;
  } catch {
    return null;
  }
}

/**
 * Welke URL's deze ronde naar Bing gaan: vanaf de cursor, hooguit `max`, met omloop zodat na een paar dagen alles
 * langs is geweest. Puur en getest (tests/bing-webmaster.test.ts). `urls` hoort stabiel gesorteerd te zijn.
 */
export function kiesIndienBatch(urls: string[], cursor: number, max: number): { batch: string[]; volgende: number } {
  if (urls.length === 0 || max <= 0) return { batch: [], volgende: 0 };
  const start = ((cursor % urls.length) + urls.length) % urls.length;
  const n = Math.min(max, urls.length);
  const batch: string[] = [];
  for (let i = 0; i < n; i += 1) batch.push(urls[(start + i) % urls.length]!);
  return { batch, volgende: (start + n) % urls.length };
}

/**
 * Dien een ronde sitemap-URL's bij Bing in (binnen het dagquotum), vanaf de bewaarde cursor. Best effort: faalt stil,
 * logt of drukt de sleutel nooit af. Geeft terug hoeveel er ingediend zijn.
 */
export async function bingDienBatchIn(alleUrls: string[]): Promise<{ ingediend: number; ok: boolean; reden?: string }> {
  const key = await bingWebmasterKey();
  if (!key) return { ingediend: 0, ok: false, reden: "geen sleutel" };
  const urls = [...new Set(alleUrls)].filter((u) => u.startsWith("https://")).sort(stabiel);
  if (urls.length === 0) return { ingediend: 0, ok: false, reden: "geen urls" };
  const quotum = await bingDagquotum(key);
  if (quotum !== null && quotum <= 0) return { ingediend: 0, ok: true, reden: "quotum op voor vandaag" };
  const max = Math.min(quotum ?? MAX_PER_AANROEP, MAX_PER_AANROEP);
  const cursor = (await kvGet<number>(KV_CURSOR).catch(() => 0)) ?? 0;
  const { batch, volgende } = kiesIndienBatch(urls, cursor, max);
  if (batch.length === 0) return { ingediend: 0, ok: true };
  try {
    const res = await fetch(`${BASE}/SubmitUrlBatch?apikey=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ siteUrl: SITE.url + "/", urlList: batch }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ingediend: 0, ok: false, reden: `HTTP ${res.status}` };
    await kvSet(KV_CURSOR, volgende).catch(() => undefined);
    return { ingediend: batch.length, ok: true };
  } catch (err) {
    return { ingediend: 0, ok: false, reden: (err as Error).name };
  }
}

/** Een stabiele volgorde: ondiepe (belangrijkste) pagina's eerst, dan op lengte en naam. */
function stabiel(a: string, b: string): number {
  const diepte = (u: string) => {
    try {
      return new URL(u).pathname.split("/").filter(Boolean).length;
    } catch {
      return 99;
    }
  };
  return diepte(a) - diepte(b) || a.length - b.length || a.localeCompare(b);
}
