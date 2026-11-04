// ---------------------------------------------------------------------------
// Scans & deals (4 nov 2026): elke gratis scan (website-check en review-scan)
// komt in een logboek met wat de bezoeker daarna deed — alleen gescand, een
// nieuwe website laten maken, een stijl gekozen, het voorstel bekeken, contact
// aangevraagd of het voorstel geaccepteerd — met een automatische lead en een
// voorstel op maat (deal) met échte prijzen. Dit bestand is puur: de vorm van
// het logboek, de status, de trechter en de opties van een deal. Opslag:
// lib/scans/store.ts, lead: lead.ts, deal: deal.ts; beheer: /admin/scans.
// ---------------------------------------------------------------------------

export type ScanSoort = "website" | "reviews";
export const SOORT_LABEL: Record<ScanSoort, string> = { website: "Website-check", reviews: "Review-scan" };

/** "opgevolgd" is een stap van ons (sales mailde het voorstel), de rest doet de bezoeker. */
export type ScanStap = "gescand" | "nieuwe-site" | "stijl" | "deal-bekeken" | "aanvraag" | "deal-akkoord" | "opgevolgd";
export const STAP_LABEL: Record<ScanStap, string> = {
  gescand: "Gescand",
  "nieuwe-site": "Nieuwe website gemaakt",
  stijl: "Stijl gekozen",
  "deal-bekeken": "Voorstel bekeken",
  aanvraag: "Contact aangevraagd",
  "deal-akkoord": "Voorstel geaccepteerd",
  opgevolgd: "Voorstel gemaild door sales",
};

/** Wanneer sales het voorstel het laatst mailde, of null. */
export function laatstOpgevolgd(log: Pick<ScanLog, "stappen">): string | null {
  const s = log.stappen.filter((x) => x.stap === "opgevolgd").map((x) => x.at).sort();
  return s[s.length - 1] ?? null;
}

export interface ScanLog {
  /** `${soort}:${scanId}` */
  sleutel: string;
  soort: ScanSoort;
  scanId: string;
  at: string;
  host: string | null;
  naam: string;
  plaats: string | null;
  score: number;
  /** "3 problemen, 4 aandachtspunten" of "4,4 op Google uit 620 reviews" */
  samenvatting: string;
  /** relatief adres van het rapport */
  rapport: string;
  leadId: string | null;
  dealId: string | null;
  siteSlug: string | null;
  stappen: { stap: ScanStap; at: string; info?: string | undefined }[];
}

export const scanSleutel = (soort: ScanSoort, scanId: string) => `${soort}:${scanId}`;

/** Een stap erbij; elke stap telt één keer, behalve een stijlkeuze en het mailen door sales (die mogen vaker). */
export function metStap(log: ScanLog, stap: ScanStap, at: string, info?: string): ScanLog {
  if (stap !== "stijl" && stap !== "opgevolgd" && log.stappen.some((s) => s.stap === stap)) return log;
  return { ...log, stappen: [...log.stappen, { stap, at, ...(info ? { info: info.slice(0, 120) } : {}) }] };
}

export type ScanStatus = "alleen-gescand" | "verder-gekeken" | "aanvraag" | "akkoord";

/** Kleur volgens het systeem: blauw = plan (verder gekeken), amber = wacht op ons, groen = gedaan. */
export const STATUS_INFO: Record<ScanStatus, { label: string; tone: "neutral" | "plan" | "warn" | "ok" }> = {
  "alleen-gescand": { label: "Bleef bij de scan", tone: "neutral" },
  "verder-gekeken": { label: "Keek verder", tone: "plan" },
  aanvraag: { label: "Vroeg contact aan", tone: "warn" },
  akkoord: { label: "Akkoord met voorstel", tone: "ok" },
};

export function statusVan(log: Pick<ScanLog, "stappen">): ScanStatus {
  const heeft = (s: ScanStap) => log.stappen.some((x) => x.stap === s);
  if (heeft("deal-akkoord")) return "akkoord";
  if (heeft("aanvraag")) return "aanvraag";
  if (heeft("nieuwe-site") || heeft("stijl") || heeft("deal-bekeken")) return "verder-gekeken";
  return "alleen-gescand";
}

/** Hoeveel scans kwamen tot elke stap (een latere stap telt ook voor de eerdere). */
export function trechter(logs: readonly Pick<ScanLog, "stappen">[]): { gescand: number; verder: number; aanvraag: number; akkoord: number } {
  const st = logs.map(statusVan);
  return {
    gescand: logs.length,
    verder: st.filter((s) => s !== "alleen-gescand").length,
    aanvraag: st.filter((s) => s === "aanvraag" || s === "akkoord").length,
    akkoord: st.filter((s) => s === "akkoord").length,
  };
}

/** Testadressen en onze eigen sites krijgen geen lead (AGENTS.md: nooit een echte lead bij een test). */
export function isTestHost(host: string | null): boolean {
  if (!host) return false;
  const h = host.toLowerCase().replace(/^www\./, "");
  return /(^|\.)(example\.(com|org|net)|zekerflex\.(com|nl))$/.test(h) || /\.(test|example|invalid|localhost|local)$/.test(h) || h === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
}

/**
 * Een testadres voor mail: de RFC 2606-domeinen (example.com/.net/.org) en .test/.example/.invalid/localhost.
 * lib/mail verstuurt example.com wél (live tests gebruiken het); meldingen aan sales slaan we bij een test dus zelf over.
 */
export const isTestEmail = (email: string) => /@([^@]+\.)?example\.(com|net|org)$/i.test(email.trim()) || /[@.](test|example|invalid|localhost)$/i.test(email.trim());

// --- deal op maat ------------------------------------------------------------------

export type Branche = "horeca" | "rijschool" | "bouw" | "zorg" | "schoonmaak" | "logistiek" | "kapper" | "garage" | "algemeen";

export interface DealPrijzen {
  /** nieuwe website, eenmalig, en de prijs met introductiekorting als er nog plekken zijn */
  websiteCent: number;
  websiteKortingCent: number | null;
  beheer: { key: string; label: string; maandCent: number }[];
  horecaBasisCent: number;
  horecaBundelCent: number;
  telefoonCent: number | null;
  uurfeeCent: number;
  /** .nl per jaar (lib/domeinen/extensies.ts); het eerste jaar zit bij een nieuwe website */
  domeinNlCent?: number | undefined;
}

export interface DealOptie {
  id: string;
  naam: string;
  uitleg: string;
  /** waarom dit bij hén past, uit hun scan */
  waarom: string;
  eenmaligCent: number | null;
  maandCent: number | null;
  /** voor wat niet per maand gaat: "€ 3,50 per gewerkt uur", "Gratis", "Prijs op aanvraag" */
  prijsTekst: string | null;
  aanbevolen: boolean;
}

export interface DealInput {
  soort: ScanSoort;
  score: number;
  branche: Branche;
  naam: string;
  /** titels van de problemen uit de scan */
  problemen: string[];
  /** categorieën met een probleem (website-check): snelheid, google, veiligheid, telefoon … */
  probleemCategorieen: string[];
  reviewsOpSite: boolean;
  googleRating: number | null;
  googleAantal: number;
  nieuweSite: boolean;
  /** het bedrijf heeft een eigen website (bij een review-scan niet altijd) */
  heeftWebsite?: boolean | undefined;
}

const euro = (cent: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: cent % 100 ? 2 : 0 }).format(cent / 100);
export { euro as dealEuro };

/** De opties van een voorstel op maat, met de aanbevolen opties vooraf aangevinkt. Alleen echte prijzen. */
export function dealOpties(d: DealInput, p: DealPrijzen): DealOptie[] {
  const opties: DealOptie[] = [];
  const zwak = d.score < 85;
  const website = d.soort === "website";
  const zonderSite = d.heeftWebsite === false;
  const korting = p.websiteKortingCent !== null && p.websiteKortingCent < p.websiteCent;
  opties.push({
    id: "nieuwe-website",
    naam: zonderSite ? "Je eigen website" : "Je nieuwe website",
    uitleg: "Snel, goed vindbaar en veilig, met je eigen teksten en foto's, contactformulier, WhatsApp en privacyverklaring. Wij zetten hem op je eigen adres.",
    waarom: website
      ? d.nieuweSite
        ? `Je hebt hem al gezien: je huidige site scoort ${d.score} van 100, de nieuwe haalt veel meer.`
        : `Je huidige site scoort ${d.score} van 100.${d.problemen.length ? ` Onder meer: ${d.problemen.slice(0, 2).join("; ").toLowerCase()}.` : ""}`
      : zonderSite
        ? "Je hebt nog geen website: klanten die je op Google vinden, kunnen nergens verder lezen, reserveren of je aanbod bekijken."
        : "Een site met je Google-score en een knop om een review te schrijven, zodat bezoekers je meteen vertrouwen.",
    eenmaligCent: korting ? p.websiteKortingCent : p.websiteCent,
    maandCent: null,
    prijsTekst: korting ? `Introductieprijs, normaal ${euro(p.websiteCent)}` : null,
    aanbevolen: (website && (zwak || d.nieuweSite)) || zonderSite,
  });
  if (zonderSite && p.domeinNlCent) {
    opties.push({
      id: "domein",
      naam: "Je eigen domeinnaam",
      uitleg: "Een eigen adres zoals jouwbedrijf.nl, met e-mail op je eigen naam mogelijk. Wij regelen de aanvraag.",
      waarom: "Zonder eigen adres vinden klanten je moeilijker en oogt je mail minder zakelijk.",
      eenmaligCent: null,
      maandCent: null,
      prijsTekst: `Eerste jaar inbegrepen bij je website, daarna ${euro(p.domeinNlCent)} per jaar (.nl)`,
      aanbevolen: true,
    });
  }
  const basis = p.beheer.find((b) => b.key === "basis");
  const pro = p.beheer.find((b) => b.key === "pro");
  const zwaar = d.score < 60 || d.probleemCategorieen.some((c) => c === "veiligheid" || c === "snelheid");
  if (basis) {
    opties.push({
      id: "beheer-basis",
      naam: `Website-beheer ${basis.label}`,
      uitleg: "Wij houden je website snel, veilig en online: updates, back-ups en bewaking.",
      waarom: website ? "Zo blijft je score hoog, ook als je zelf geen tijd hebt." : "Eén vast aanspreekpunt voor je website.",
      eenmaligCent: null,
      maandCent: basis.maandCent,
      prijsTekst: null,
      aanbevolen: website && !zwaar,
    });
  }
  if (pro) {
    opties.push({
      id: "beheer-pro",
      naam: `Website-beheer ${pro.label}`,
      uitleg: "Alles van Basis, plus meer hulp bij teksten, vindbaarheid en aanpassingen.",
      waarom: d.probleemCategorieen.includes("snelheid") ? "Je site is nu traag; met Pro lossen wij dat op en houden we hem snel." : d.probleemCategorieen.includes("veiligheid") ? "Er zijn beveiligingspunten; met Pro regelen wij die voor je." : "Voor wie het helemaal uit handen wil geven.",
      eenmaligCent: null,
      maandCent: pro.maandCent,
      prijsTekst: null,
      aanbevolen: website && zwaar,
    });
  }
  opties.push({
    id: "google-reviews",
    naam: "Google-reviews verzamelen",
    uitleg: "Stuur klanten na hun bezoek met één klik een verzoek om een review. Iedereen krijgt de knop naar Google, zoals het hoort.",
    waarom:
      d.googleRating !== null
        ? `Je staat op ${d.googleRating.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} uit ${d.googleAantal.toLocaleString("nl-NL")} reviews; meer recente reviews tillen je omhoog.`
        : d.reviewsOpSite
          ? "Je laat al reviews zien; met verzoeken krijg je er vanzelf meer bij."
          : "Je site laat nog geen reviews zien; met een paar verzoeken per week bouw je ze op.",
    eenmaligCent: null,
    maandCent: null,
    prijsTekst: "Gratis bij een ZekerFlex-account",
    aanbevolen: d.soort === "reviews" || !d.reviewsOpSite,
  });
  if (d.branche === "horeca") {
    opties.push({
      id: "horeca",
      naam: "Horeca-pakket",
      uitleg: `Reserveren, menukaart met allergenen, bestellen met QR en een keukenscherm, op je eigen site. Losse modules of alles-in-één voor ${euro(p.horecaBundelCent)} per maand.`,
      waarom: `Voor ${d.naam}: gasten reserveren en bestellen direct bij jou, zonder commissie aan een platform.`,
      eenmaligCent: null,
      maandCent: p.horecaBasisCent,
      prijsTekst: "Vanaf, per maand",
      aanbevolen: true,
    });
  }
  if (d.branche === "rijschool") {
    opties.push({
      id: "rijschool",
      naam: "Rijschool-pakket",
      uitleg: "Je eigen rijschoolsite met proefles-aanvraag, lesagenda, leerling- en instructeur-app en tegoed.",
      waarom: `Alles voor ${d.naam} op één plek, met je eigen app voor leerlingen.`,
      eenmaligCent: null,
      maandCent: null,
      prijsTekst: "Prijs op aanvraag",
      aanbevolen: true,
    });
  }
  // a salon (stylists for the holidays) and a garage (the tyre weeks) hire extra hands too
  if (d.branche === "horeca" || d.branche === "bouw" || d.branche === "schoonmaak" || d.branche === "logistiek" || d.branche === "zorg" || d.branche === "kapper" || d.branche === "garage") {
    opties.push({
      id: "personeel",
      naam: "Personeel inhuren",
      uitleg: "Flexkrachten, zzp'ers of uitzendkrachten voor drukke dagen, gematcht op reistijd en vak. Geen abonnement.",
      waarom: "Extra handen precies wanneer je ze nodig hebt.",
      eenmaligCent: null,
      maandCent: null,
      prijsTekst: `${euro(p.uurfeeCent)} per gewerkt uur`,
      aanbevolen: false,
    });
  }
  if (p.telefoonCent !== null && p.telefoonCent > 0) {
    opties.push({
      id: "telefoon",
      naam: "Zakelijk telefoonnummer",
      uitleg: "Een vast nummer voor je bedrijf, bellen en gebeld worden vanuit ZekerFlex.",
      waarom: "Zakelijk en privé gescheiden, en altijd bereikbaar.",
      eenmaligCent: null,
      maandCent: p.telefoonCent,
      prijsTekst: null,
      aanbevolen: false,
    });
  }
  return opties;
}

/** Wat de bezoeker van een voorstel ziet: zonder de contactgegevens van wie ja zei. */
export interface DealWeergave {
  id: string;
  soort: ScanSoort;
  geldigTot: string;
  bedrijf: { naam: string; host: string | null; plaats: string | null };
  score: number;
  samenvatting: string;
  rapport: string;
  siteSlug: string | null;
  opties: DealOptie[];
  status: "open" | "bekeken" | "akkoord";
  keuze: string[];
  akkoordAt: string | null;
  /** wanneer de bezoeker vroeg om eerst teruggebeld te worden, of null */
  terugbellenAt: string | null;
  verlopen: boolean;
}

/** Wanneer we het best kunnen terugbellen (keuze op /deal/<id>). */
export const BEL_MOMENTEN = { ochtend: "In de ochtend", middag: "In de middag", laat: "Aan het einde van de middag", maakt_niet_uit: "Maakt niet uit" } as const;
export type BelMoment = keyof typeof BEL_MOMENTEN;

/** Wat de gekozen opties samen kosten: eenmalig en per maand. */
export function dealTotaal(opties: readonly DealOptie[], keuze: readonly string[]): { eenmaligCent: number; maandCent: number } {
  const gekozen = opties.filter((o) => keuze.includes(o.id));
  // Basis en Pro sluiten elkaar uit: tel de duurste
  const beheer = gekozen.filter((o) => o.id.startsWith("beheer-")).sort((a, b) => (b.maandCent ?? 0) - (a.maandCent ?? 0))[0];
  const rest = gekozen.filter((o) => !o.id.startsWith("beheer-"));
  const alle = beheer ? [...rest, beheer] : rest;
  return {
    eenmaligCent: alle.reduce((s, o) => s + (o.eenmaligCent ?? 0), 0),
    maandCent: alle.reduce((s, o) => s + (o.maandCent ?? 0), 0),
  };
}

/** Een keuze opschonen: alleen bekende opties, en nooit Basis én Pro samen. */
export function schoneKeuze(opties: readonly DealOptie[], keuze: readonly unknown[]): string[] {
  const ids = new Set(opties.map((o) => o.id));
  const k = [...new Set(keuze.filter((x): x is string => typeof x === "string" && ids.has(x)))];
  return k.includes("beheer-pro") ? k.filter((x) => x !== "beheer-basis") : k;
}
