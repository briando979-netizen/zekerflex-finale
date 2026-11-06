import { randomBytes } from "node:crypto";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { logger } from "@/lib/logger";
import { FetchError, fetchPage } from "@/lib/website-check/fetch";
import { extractBusiness } from "@/lib/website-check/proposal";
import { sameSite } from "@/lib/website-check/run";
import { analyseerReviews, type Analyse } from "@/lib/review-scan/analyse";
import { bedrijvenBron } from "@/lib/integrations/osm-plaatsen";
import { bedrijfDetails, concurrentenVan, geenBeoordelingenUitleg, ScanFout, zoekBedrijven, type Kandidaat } from "@/lib/review-scan/places";
import {
  haalbaarDoel,
  inhaalTempo,
  isPlaceId,
  leesInvoer,
  maakVoorstellen,
  positie,
  scoreScan,
  websiteSignalen,
  type Concurrent,
  type Onderdeel,
  type ScanFeiten,
  type ScanInvoer,
  type ScanReview,
  type Voorstel,
  type WebsiteSignalen,
} from "@/lib/review-scan/model";

// ---------------------------------------------------------------------------
// De review-scan uitvoeren: bedrijf vinden (Google-link, website of naam +
// plaats), profiel en reviews ophalen, concurrenten in de buurt, analyse en
// voorstellen, en het rapport bewaren onder een niet te raden id (te delen).
//   KV "review-scan:<id>"              — het rapport
//   KV "review-scan-plaats:<placeId>"  — laatste rapport per bedrijf: binnen een
//                                        dag hetzelfde rapport (scheelt Google-kosten)
// Een rapport bevat openbare bedrijfsgegevens en reviewteksten, geen namen van reviewers.
// ---------------------------------------------------------------------------

export interface ReviewScanRapport {
  id: string;
  at: string;
  placeId: string;
  bedrijf: { naam: string; adres: string; plaats: string | null; mapsUrl: string | null; website: string | null; categorie: string | null };
  rating: number | null;
  aantal: number;
  score: number;
  oordeel: string;
  onderdelen: Onderdeel[];
  positie: { plek: number; van: number } | null;
  concurrenten: Concurrent[];
  doel: { van: number; naar: number; nodig: number } | null;
  inhalen: { naam: string; aantal: number; perMaand: number } | null;
  analyse: Omit<Analyse, "antwoorden">;
  reviews: (ScanReview & { antwoord: string })[];
  voorstellen: Voorstel[];
  website: WebsiteSignalen | null;
  leadId: string | null;
}

export type ScanUitkomst = { soort: "rapport"; rapport: ReviewScanRapport } | { soort: "kies"; kandidaten: Kandidaat[] };

const KEY = (id: string) => `review-scan:${id}`;
const PLAATS_KEY = (placeId: string) => `review-scan-plaats:${placeId}`;
const HERGEBRUIK_MS = 24 * 60 * 60_000;

export const isScanId = (id: string) => /^[a-f0-9]{16}$/.test(id);

async function stil<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

function alsScanFout(err: unknown): never {
  if (err instanceof FetchError) throw new ScanFout(err.message, "ONGELDIG");
  throw err;
}

type Gevonden = { placeId: string; signalen: WebsiteSignalen | null } | { kandidaten: Kandidaat[] };

async function vindBedrijf(inv: ScanInvoer, diepte = 0): Promise<Gevonden> {
  switch (inv.soort) {
    case "placeId":
      return { placeId: inv.placeId, signalen: null };
    case "kort": {
      // korte Google-link (maps.app.goo.gl, g.page …): volg hem tot het echte adres
      const page = await stil(fetchPage(inv.url, { headersOnly: true, timeoutMs: 8_000, maxRedirects: 6 }));
      const verder = page ? leesInvoer(page.finalUrl) : null;
      if (!verder || diepte > 1 || verder.soort === "kort" || verder.soort === "website") {
        throw new ScanFout("Deze Google-link konden we niet openen. Plak de volledige link uit Google Maps, of typ je bedrijfsnaam en plaats.", "ONGELDIG");
      }
      return vindBedrijf(verder, diepte + 1);
    }
    case "maps": {
      if (!inv.naam) throw new ScanFout("In deze link staat geen bedrijfsnaam. Typ je bedrijfsnaam en plaats.", "ONGELDIG");
      const k = await zoekBedrijven(inv.naam, inv.lat !== null && inv.lng !== null ? { lat: inv.lat, lng: inv.lng } : null);
      const eerste = k[0];
      if (!eerste) throw new ScanFout("Dit bedrijf vonden we niet op Google.", "NIET_GEVONDEN");
      return { placeId: eerste.placeId, signalen: null };
    }
    case "website": {
      const page = await fetchPage(inv.url, { timeoutMs: 10_000 }).catch(alsScanFout);
      if (page.status >= 400) throw new ScanFout(`De website gaf foutcode ${page.status}. Kijk of het adres klopt.`, "ONGELDIG");
      const host = new URL(page.finalUrl).hostname;
      const b = extractBusiness(page.body, page.finalUrl);
      const naam = b.naam ?? host.replace(/^www\./, "").split(".")[0] ?? host;
      const signalen = websiteSignalen(page.body);
      const k = await zoekBedrijven([naam, b.plaats].filter(Boolean).join(" "));
      const match = k.find((c) => c.website && sameSite(new URL(c.website).hostname, host));
      if (match) return { placeId: match.placeId, signalen };
      if (k.length === 0) {
        throw new ScanFout("Bij deze website vonden we geen bedrijf op Google. Plak de link uit Google Maps, of typ je bedrijfsnaam en plaats.", "NIET_GEVONDEN");
      }
      return { kandidaten: k.slice(0, 4) };
    }
    case "tekst": {
      if (inv.tekst.length < 3) throw new ScanFout("Typ je bedrijfsnaam en plaats, of plak je Google- of websitelink.", "ONGELDIG");
      const k = await zoekBedrijven(inv.tekst);
      const eerste = k[0];
      if (!eerste) throw new ScanFout("Dit bedrijf vonden we niet op Google. Probeer naam + plaats, of plak de link uit Google Maps.", "NIET_GEVONDEN");
      return k.length === 1 ? { placeId: eerste.placeId, signalen: null } : { kandidaten: k.slice(0, 4) };
    }
  }
}

/** Scan een bedrijf. Bij twijfel (meerdere bedrijven met die naam) komt er een keuzelijst terug. */
export async function runReviewScan(invoer: { tekst?: string | undefined; placeId?: string | undefined }, nu = new Date()): Promise<ScanUitkomst> {
  let gevonden: Gevonden;
  if (invoer.placeId) {
    if (!isPlaceId(invoer.placeId)) throw new ScanFout("Dit bedrijf vonden we niet op Google.", "ONGELDIG");
    gevonden = { placeId: invoer.placeId, signalen: null };
  } else {
    gevonden = await vindBedrijf(leesInvoer(invoer.tekst ?? ""));
  }
  const bron = await bedrijvenBron();
  if ("kandidaten" in gevonden) {
    const eerste = gevonden.kandidaten[0];
    // van onze eigen bron komt geen enkele kandidaat met sterren; zo'n keuzelijst helpt niemand
    if (bron !== "osm" || !eerste) return { soort: "kies", kandidaten: gevonden.kandidaten };
    gevonden = { placeId: eerste.placeId, signalen: null };
  }

  const recent = await kvGet<{ id: string; at: string }>(PLAATS_KEY(gevonden.placeId)).catch(() => null);
  if (recent && nu.getTime() - Date.parse(recent.at) < HERGEBRUIK_MS) {
    const bewaard = await getReviewScan(recent.id);
    if (bewaard) return { soort: "rapport", rapport: bewaard };
  }

  const d = await bedrijfDetails(gevonden.placeId);
  // Zonder sterren en reviews is er geen reviewscore te geven. Dat zeggen we dan
  // ook gewoon, met de naam van het bedrijf erbij; we vullen nooit een cijfer in.
  if (d.bron === "osm") throw new ScanFout(geenBeoordelingenUitleg(d.naam), "GEEN_BEOORDELINGEN");
  const [concurrenten, signalen] = await Promise.all([
    stil(concurrentenVan(d)).then((c) => c ?? []),
    gevonden.signalen
      ? Promise.resolve(gevonden.signalen)
      : d.website
        ? stil(fetchPage(d.website, { timeoutMs: 8_000 })).then((p) => (p && p.status < 400 ? websiteSignalen(p.body) : null))
        : Promise.resolve(null),
  ]);
  const feiten: ScanFeiten = { rating: d.rating, aantal: d.aantal, reviews: d.reviews, profiel: d.profiel, concurrenten, website: signalen };
  const analyse = await analyseerReviews({ bedrijf: d.naam, categorie: d.categorie, rating: d.rating, aantal: d.aantal, reviews: d.reviews });
  const { score, oordeel, onderdelen } = scoreScan(feiten, nu);
  const { antwoorden, ...rest } = analyse;

  const rapport: ReviewScanRapport = {
    id: randomBytes(8).toString("hex"),
    at: nu.toISOString(),
    placeId: d.placeId,
    bedrijf: { naam: d.naam, adres: d.adres, plaats: d.plaats, mapsUrl: d.mapsUrl, website: d.website, categorie: d.categorie },
    rating: d.rating,
    aantal: d.aantal,
    score,
    oordeel,
    onderdelen,
    positie: positie({ rating: d.rating, aantal: d.aantal }, concurrenten),
    concurrenten: [...concurrenten].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.aantal - a.aantal).slice(0, 6),
    doel: haalbaarDoel(d.rating, d.aantal),
    inhalen: inhaalTempo({ rating: d.rating, aantal: d.aantal }, concurrenten),
    analyse: rest,
    reviews: d.reviews.map((r, i) => ({ ...r, antwoord: antwoorden[i] ?? "" })),
    voorstellen: maakVoorstellen(feiten, nu, analyse.themas),
    website: signalen,
    leadId: null,
  };
  await kvSet(KEY(rapport.id), rapport);
  await kvSet(PLAATS_KEY(rapport.placeId), { id: rapport.id, at: rapport.at }).catch(() => undefined);
  logger.info("review-scan klaar", { score, aantal: d.aantal, concurrenten: concurrenten.length, bron: analyse.bron });
  return { soort: "rapport", rapport };
}

export async function getReviewScan(id: string): Promise<ReviewScanRapport | null> {
  if (!isScanId(id)) return null;
  return kvGet<ReviewScanRapport>(KEY(id)).catch(() => null);
}

export async function markScanLead(id: string, leadId: string): Promise<void> {
  const r = await getReviewScan(id);
  if (r) await kvSet(KEY(id), { ...r, leadId });
}
