// ---------------------------------------------------------------------------
// Review-scan: hoe staat een bedrijf er op Google voor, en wat kan beter?
// Het bedrijf vult zijn Google-link, website of naam + plaats in; de scan
// (lib/review-scan/run.ts) haalt via Google Places de score, het aantal
// reviews, de reviews die Google toont, het profiel en de concurrenten in de
// buurt op. Dit bestand is het model: puur, zonder netwerk, zodat de score en
// de voorstellen te testen en uit te leggen zijn.
//
// Eerlijk over wat we weten: Google geeft via Places hooguit 5 reviews (de
// "meest relevante"), niet of het bedrijf al reageerde, en de score afgerond
// op één decimaal. Het model zegt dat ook zo, en adviseert nooit iets wat niet
// mag (alleen tevreden klanten naar Google sturen, reviews kopen).
// ---------------------------------------------------------------------------

// --- invoer ----------------------------------------------------------------------

export type ScanInvoer =
  | { soort: "placeId"; placeId: string }
  | { soort: "maps"; naam: string | null; lat: number | null; lng: number | null }
  | { soort: "kort"; url: string }
  | { soort: "website"; url: string }
  | { soort: "tekst"; tekst: string };

/** Een Google place id zoals Places ze geeft ("ChIJ…"); in een link ook andere vormen. */
export const isPlaceId = (s: string) => /^[A-Za-z0-9_-]{20,300}$/.test(s);

const KORT = /^(g\.page|g\.co|goo\.gl|maps\.app\.goo\.gl)$/i;
const GOOGLE = /^((www|maps|search)\.)?google\.(com|nl|be|de)$/i;

/** Wat iemand intypte: een Google-link, een website, of een naam met plaats. */
export function leesInvoer(raw: string): ScanInvoer {
  const s = raw.trim().slice(0, 500);
  if (/^ChIJ[A-Za-z0-9_-]{16,}$/.test(s)) return { soort: "placeId", placeId: s };
  const lijktAdres = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || (!/\s/.test(s) && /\.[a-z]{2,}(\/|$)/i.test(s));
  if (!lijktAdres) return { soort: "tekst", tekst: s.replace(/\s+/g, " ") };
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return { soort: "tekst", tekst: s };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { soort: "tekst", tekst: s };
  // een korte link kan via Googles toestemmingspagina lopen; het echte adres staat in "continue"
  const verder = /^consent\.google\./i.test(u.hostname) ? u.searchParams.get("continue") : null;
  if (verder && !/^consent\.google\./i.test(safeHost(verder))) return leesInvoer(verder);
  if (KORT.test(u.hostname)) return { soort: "kort", url: `https://${u.hostname}${u.pathname}${u.search}` };
  if (GOOGLE.test(u.hostname)) {
    const pid = u.searchParams.get("placeid") ?? u.searchParams.get("place_id") ?? u.searchParams.get("query_place_id");
    if (pid && isPlaceId(pid)) return { soort: "placeId", placeId: pid };
    const plaats = /\/maps\/place\/([^/]+)/.exec(u.pathname);
    const coord = /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/.exec(u.pathname);
    const q = u.searchParams.get("q") ?? u.searchParams.get("query");
    const naam = plaats?.[1] ? safeDecode(plaats[1]).replace(/\+/g, " ").trim() : q ? q.trim() : null;
    if (naam || coord) return { soort: "maps", naam: naam || null, lat: coord ? Number(coord[1]) : null, lng: coord ? Number(coord[2]) : null };
    return { soort: "tekst", tekst: s };
  }
  return { soort: "website", url: u.toString() };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function safeHost(s: string): string {
  try {
    return new URL(s).hostname;
  } catch {
    return "";
  }
}

/** Wat de website van het bedrijf met reviews doet (alleen de HTML van de homepage). */
export function websiteSignalen(html: string): WebsiteSignalen {
  const zonderScripts = html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  return {
    reviewsOpSite: /review|beoordeling|klantervaring|ervaringen van|kiyoh|klantenvertellen|trustpilot|★|sterren/i.test(zonderScripts.replace(/<[^>]+>/g, " ")),
    reviewLink: /g\.page\/r\/|search\.google\.[a-z.]+\/local\/writereview|writereview\?placeid=/i.test(html),
    ratingSchema: /"aggregateRating"\s*:/i.test(html),
  };
}

// --- feiten ------------------------------------------------------------------------

export interface ScanReview {
  rating: number;
  tekst: string;
  /** ISO-tijd van plaatsen, als Google die geeft */
  geplaatst: string | null;
  /** "3 weken geleden", zoals Google het zegt */
  wanneer: string | null;
}

export interface Concurrent {
  naam: string;
  rating: number | null;
  aantal: number;
  mapsUrl: string | null;
}

export interface Profiel {
  telefoon: boolean;
  website: boolean;
  openingstijden: boolean;
  /** Places geeft hooguit 10 foto's terug; 10 betekent "10 of meer" */
  fotos: number;
  status: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | null;
}

export interface WebsiteSignalen {
  /** de website noemt reviews of beoordelingen */
  reviewsOpSite: boolean;
  /** de website heeft een link om een Google-review te schrijven */
  reviewLink: boolean;
  /** de website heeft gestructureerde gegevens met een beoordeling (sterren in Google) */
  ratingSchema: boolean;
}

export interface ScanFeiten {
  rating: number | null;
  aantal: number;
  reviews: ScanReview[];
  profiel: Profiel;
  concurrenten: Concurrent[];
  website: WebsiteSignalen | null;
}

// --- score -----------------------------------------------------------------------

export type OnderdeelId = "beoordeling" | "aantal" | "actueel" | "profiel" | "concurrentie";

export interface Onderdeel {
  id: OnderdeelId;
  label: string;
  punten: number;
  max: number;
  uitleg: string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
export const cijfer = (n: number) => n.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Gewogen score: weinig reviews tellen minder zwaar (zoals klanten het ook lezen). */
const PRIOR = 4.2;
const GEWICHT = 10;
export function gewogen(rating: number | null, aantal: number): number {
  if (rating === null || aantal <= 0) return 0;
  return (PRIOR * GEWICHT + rating * aantal) / (aantal + GEWICHT);
}

/** Plek tussen de concurrenten in de buurt (1 = beste), op de gewogen score. */
export function positie(eigen: { rating: number | null; aantal: number }, concurrenten: readonly Concurrent[]): { plek: number; van: number } | null {
  if (concurrenten.length === 0) return null;
  const mijn = gewogen(eigen.rating, eigen.aantal);
  const beter = concurrenten.filter((c) => gewogen(c.rating, c.aantal) > mijn).length;
  return { plek: beter + 1, van: concurrenten.length + 1 };
}

/** Dagen sinds de recentste review die Google toont, of null. */
export function dagenSindsLaatste(reviews: readonly ScanReview[], nu: Date): number | null {
  const tijden = reviews.map((r) => (r.geplaatst ? Date.parse(r.geplaatst) : NaN)).filter((t) => Number.isFinite(t));
  if (tijden.length === 0) return null;
  return Math.max(0, Math.floor((nu.getTime() - Math.max(...tijden)) / 86_400_000));
}

export function scoreScan(f: ScanFeiten, nu: Date): { score: number; oordeel: string; onderdelen: Onderdeel[] } {
  const onderdelen: Onderdeel[] = [];
  const rating = f.rating;
  onderdelen.push({
    id: "beoordeling",
    label: "Beoordeling",
    max: 30,
    punten: rating === null ? 0 : Math.round(clamp((rating - 3.5) / (4.8 - 3.5)) * 30),
    uitleg: rating === null ? "Nog geen beoordeling op Google." : `${cijfer(rating)} van 5 sterren. Vanaf 4,8 haal je alle punten.`,
  });
  onderdelen.push({
    id: "aantal",
    label: "Aantal reviews",
    max: 20,
    punten: Math.round(clamp(Math.log10(f.aantal + 1) / Math.log10(251)) * 20),
    uitleg: `${f.aantal} ${f.aantal === 1 ? "review" : "reviews"}. Meer reviews maken je score betrouwbaarder voor klanten.`,
  });
  const dagen = dagenSindsLaatste(f.reviews, nu);
  onderdelen.push({
    id: "actueel",
    label: "Recente reviews",
    max: 15,
    punten: dagen === null ? 0 : dagen <= 14 ? 15 : dagen <= 30 ? 12 : dagen <= 90 ? 8 : dagen <= 180 ? 4 : 0,
    uitleg:
      dagen === null
        ? "Google toont geen recente reviews."
        : `De recentste review die Google toont is ${dagen <= 1 ? "van de afgelopen dag" : `${dagen} dagen oud`}.`,
  });
  const p = f.profiel;
  const profielPunten = (p.telefoon ? 4 : 0) + (p.website ? 4 : 0) + (p.openingstijden ? 5 : 0) + (p.fotos >= 10 ? 5 : p.fotos >= 5 ? 3 : p.fotos >= 1 ? 1 : 0) + (p.status === "OPERATIONAL" ? 2 : 0);
  const mist = [!p.telefoon && "telefoonnummer", !p.website && "website", !p.openingstijden && "openingstijden", p.fotos < 10 && "foto's"].filter(Boolean) as string[];
  onderdelen.push({
    id: "profiel",
    label: "Bedrijfsprofiel",
    max: 20,
    punten: profielPunten,
    uitleg: mist.length ? `Nog aan te vullen: ${mist.join(", ")}.` : "Je profiel is compleet.",
  });
  const pos = positie({ rating, aantal: f.aantal }, f.concurrenten);
  if (pos) {
    onderdelen.push({
      id: "concurrentie",
      label: "Tegenover de buurt",
      max: 15,
      punten: Math.round((1 - (pos.plek - 1) / Math.max(1, pos.van - 1)) * 15),
      uitleg: `Plek ${pos.plek} van ${pos.van} vergelijkbare bedrijven in de buurt.`,
    });
  }
  // zonder concurrenten telt dat onderdeel niet mee: schaal naar 100
  const max = onderdelen.reduce((s, o) => s + o.max, 0);
  const score = Math.round((onderdelen.reduce((s, o) => s + o.punten, 0) / max) * 100);
  const oordeel = score >= 85 ? "Uitstekend" : score >= 70 ? "Goed" : score >= 50 ? "Kan beter" : "Werk aan de winkel";
  return { score, oordeel, onderdelen };
}

// --- doelen ----------------------------------------------------------------------

/** Hoeveel nieuwe vijfsterrenreviews er nodig zijn om van rating naar doel te gaan (afgerond omhoog). */
export function reviewsNodig(rating: number, aantal: number, doel: number): number {
  if (doel >= 5 || rating >= doel) return 0;
  return Math.max(1, Math.ceil((doel * aantal - rating * aantal) / (5 - doel) - 1e-9));
}

/** Een haalbaar volgend doel: een paar tienden omhoog, nooit boven 4,8. Null als je daar al zit. */
export function volgendDoel(rating: number | null): number | null {
  if (rating === null || rating >= 4.8) return null;
  return Math.min(4.8, r1(rating + (rating < 4.5 ? 0.3 : 0.1)));
}

/** De concurrent met de meeste reviews en een minstens zo goede score: hoeveel per maand om hem in een half jaar in te halen. */
export function inhaalTempo(eigen: { rating: number | null; aantal: number }, concurrenten: readonly Concurrent[]): { naam: string; aantal: number; perMaand: number } | null {
  const sterk = concurrenten.filter((c) => c.aantal > eigen.aantal && (c.rating ?? 0) >= (eigen.rating ?? 0) - 0.3).sort((a, b) => b.aantal - a.aantal)[0];
  if (!sterk) return null;
  return { naam: sterk.naam, aantal: sterk.aantal, perMaand: Math.ceil((sterk.aantal - eigen.aantal) / 6) };
}

// --- wat klanten zeggen (regels; de AI-analyse doet dit beter als hij er is) ---------

export interface Thema {
  id: string;
  label: string;
  positief: number;
  negatief: number;
}

const THEMAS: { id: string; label: string; woorden: string[] }[] = [
  { id: "service", label: "Service en personeel", woorden: ["vriendelijk", "behulpzaam", "personeel", "bediening", "service", "klantvriendelijk", "onvriendelijk", "chagrijn", "onbeleefd", "aardig", "medewerker", "eigenaar", "geholpen"] },
  { id: "snelheid", label: "Snelheid en wachttijd", woorden: ["wacht", "snel", "traag", "lang duren", "duurde lang", "op tijd", "te laat", "vertraging", "meteen"] },
  { id: "prijs", label: "Prijs", woorden: ["prijs", "duur", "goedkoop", "betaalbaar", "waar voor je geld", "te veel betaald", "kosten", "tarief"] },
  { id: "kwaliteit", label: "Kwaliteit", woorden: ["kwaliteit", "lekker", "vers", "goed werk", "netjes", "vakkundig", "slordig", "kapot", "smaak", "perfect", "professioneel"] },
  { id: "contact", label: "Bereikbaarheid en afspraken", woorden: ["bereikbaar", "terugbel", "telefoon", "mail", "reactie", "afspraak", "communicatie", "contact", "nooit gereageerd"] },
  { id: "sfeer", label: "Sfeer en netheid", woorden: ["schoon", "vies", "sfeer", "gezellig", "rommel", "hygiën", "rustig", "druk", "lawaai"] },
  { id: "locatie", label: "Locatie en parkeren", woorden: ["parkeren", "parkeer", "locatie", "makkelijk te vinden", "ligging"] },
];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Welke onderwerpen komen terug, en in positieve (4–5) of negatieve (1–2) reviews. */
export function themasUitReviews(reviews: readonly ScanReview[]): Thema[] {
  const uit: Thema[] = [];
  for (const t of THEMAS) {
    let positief = 0;
    let negatief = 0;
    for (const r of reviews) {
      const tekst = norm(r.tekst);
      if (!t.woorden.some((w) => tekst.includes(norm(w)))) continue;
      if (r.rating >= 4) positief++;
      else if (r.rating <= 2) negatief++;
    }
    if (positief || negatief) uit.push({ id: t.id, label: t.label, positief, negatief });
  }
  return uit.sort((a, b) => b.negatief - a.negatief || b.positief - a.positief);
}

/** Een net antwoord op een review als er geen AI is: bedanken, en bij kritiek het gesprek buiten Google aanbieden. */
export function antwoordSjabloon(r: Pick<ScanReview, "rating">, bedrijf: string): string {
  const groet = `Groet, het team van ${bedrijf}`;
  if (r.rating >= 4) return `Dank je wel voor je mooie review! Fijn om te horen dat je tevreden bent. Graag tot de volgende keer. ${groet}`;
  if (r.rating === 3) return `Dank je voor je review en je eerlijke feedback. We horen graag wat we beter kunnen doen, dus neem gerust contact met ons op. ${groet}`;
  return `Wat vervelend dat je ervaring niet goed was, en dank dat je het laat weten. We willen dit graag rechtzetten. Wil je contact met ons opnemen, zodat we samen kunnen kijken wat er misging? ${groet}`;
}

// --- voorstellen -----------------------------------------------------------------

export type Impact = "hoog" | "middel" | "laag";
/** Wat het scherm als knop toont; het adres hangt af van waar de scan draait (openbaar of in de werkgeversomgeving). */
export type VoorstelActie = "verzoeken" | "antwoorden" | "profiel" | "website";

export interface Voorstel {
  id: string;
  titel: string;
  uitleg: string;
  impact: Impact;
  actie?: VoorstelActie | undefined;
}

const IMPACT_VOLGORDE: Record<Impact, number> = { hoog: 0, middel: 1, laag: 2 };

export function maakVoorstellen(f: ScanFeiten, nu: Date, themas: readonly Thema[] = themasUitReviews(f.reviews)): Voorstel[] {
  const v: Voorstel[] = [];
  const p = f.profiel;
  if (p.status === "CLOSED_PERMANENTLY" || p.status === "CLOSED_TEMPORARILY") {
    v.push({
      id: "status",
      titel: p.status === "CLOSED_PERMANENTLY" ? "Google toont je bedrijf als definitief gesloten" : "Google toont je bedrijf als tijdelijk gesloten",
      uitleg: "Klanten slaan je dan over. Klopt dat niet? Pas de status direct aan in je Google-bedrijfsprofiel.",
      impact: "hoog",
      actie: "profiel",
    });
  }
  const mediaan = f.concurrenten.length ? [...f.concurrenten].map((c) => c.aantal).sort((a, b) => a - b)[Math.floor(f.concurrenten.length / 2)] ?? 0 : 0;
  if (f.aantal < 50 || f.aantal < mediaan) {
    v.push({
      id: "meer-reviews",
      titel: "Vraag elke klant om een review",
      uitleg: `Je hebt ${f.aantal} ${f.aantal === 1 ? "review" : "reviews"}${mediaan > f.aantal ? `, bedrijven in de buurt gemiddeld ${mediaan}` : ""}. De meeste tevreden klanten schrijven pas iets als je het vraagt. Vraag het iedereen, kort na hun bezoek of opdracht. Alleen tevreden klanten vragen mag volgens Google niet.`,
      impact: "hoog",
      actie: "verzoeken",
    });
  }
  const kritisch = f.reviews.filter((r) => r.rating <= 2);
  if (kritisch.length) {
    v.push({
      id: "reageer-kritiek",
      titel: `Reageer op ${kritisch.length === 1 ? "de kritische review" : `de ${kritisch.length} kritische reviews`}`,
      uitleg: "Een rustig, persoonlijk antwoord laat nieuwe klanten zien dat je klachten serieus neemt; vaak past de schrijver daarna zijn review aan. Hieronder staat per review een voorstel. Kijk wel eerst of je al gereageerd hebt: dat laat Google ons niet zien.",
      impact: "hoog",
      actie: "antwoorden",
    });
  }
  const zwak = themas.filter((t) => t.negatief > 0).slice(0, 2);
  for (const t of zwak) {
    v.push({
      id: `thema-${t.id}`,
      titel: `Pak "${t.label.toLowerCase()}" aan`,
      uitleg: `Dit noemen klanten in ${t.negatief === 1 ? "een kritische review" : `${t.negatief} kritische reviews`}. Een verbetering hier tilt je score het snelst omhoog. Vertel in je antwoorden ook wat je eraan doet.`,
      impact: f.rating !== null && f.rating < 4.3 ? "hoog" : "middel",
    });
  }
  const dagen = dagenSindsLaatste(f.reviews, nu);
  if (dagen !== null && dagen > 60) {
    v.push({
      id: "recent",
      titel: "Zorg voor nieuwe reviews",
      uitleg: `De recentste review die Google toont is ${dagen} dagen oud. Klanten en Google letten op recente reviews; een paar per maand houdt je profiel levend.`,
      impact: "middel",
      actie: "verzoeken",
    });
  }
  if (!p.openingstijden) v.push({ id: "openingstijden", titel: "Zet je openingstijden op Google", uitleg: "Zonder openingstijden twijfelen klanten of je open bent en kiezen ze sneller een ander.", impact: "middel", actie: "profiel" });
  if (p.fotos < 10) {
    v.push({
      id: "fotos",
      titel: "Voeg foto's toe aan je profiel",
      uitleg: `Google toont ${p.fotos === 0 ? "nog geen foto's" : `${p.fotos} foto${p.fotos === 1 ? "" : "'s"}`}. Bedrijven met echte foto's van de zaak, het team en het werk krijgen meer klikken. Mik op minstens 10.`,
      impact: p.fotos < 5 ? "middel" : "laag",
      actie: "profiel",
    });
  }
  if (!p.website) v.push({ id: "website", titel: "Koppel een website aan je profiel", uitleg: "Klanten willen meer zien dan je Google-profiel. Met een eigen website met je reviews erop maak je de keuze makkelijk.", impact: "middel", actie: "website" });
  if (!p.telefoon) v.push({ id: "telefoon", titel: "Zet je telefoonnummer op Google", uitleg: "Veel klanten bellen direct vanuit Google Maps. Zonder nummer mis je die.", impact: "middel", actie: "profiel" });
  if (f.website) {
    if (!f.website.reviewLink) {
      v.push({ id: "site-knop", titel: "Zet een knop \"Schrijf een review\" op je website", uitleg: "Tevreden klanten die je website bezoeken, kunnen dan met één klik een review achterlaten.", impact: "laag", actie: "website" });
    }
    if (!f.website.reviewsOpSite && f.rating !== null && f.rating >= 4) {
      v.push({ id: "site-score", titel: "Laat je Google-score zien op je website", uitleg: `Een ${cijfer(f.rating)} van ${f.aantal} klanten is een sterk verkoopargument. Toon die op je homepage.`, impact: "laag", actie: "website" });
    }
  }
  return v.sort((a, b) => IMPACT_VOLGORDE[a.impact] - IMPACT_VOLGORDE[b.impact]);
}
