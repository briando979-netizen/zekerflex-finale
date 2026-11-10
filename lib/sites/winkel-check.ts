import { WEBSHOP_TEMPLATES, webshopPages } from "@/lib/sites/webshop-templates";
import type { Block, Company, Page, SiteDoc, SiteProduct } from "@/lib/sites/types";
import { euro, isUitverkocht, winkelVan } from "@/lib/sites/winkel";

// ---------------------------------------------------------------------------
// Studio → Webshop → Slim → Winkelcheck: wat er aan een webshop nog beter kan,
// uitgerekend uit de echte gegevens van de site (producten, prijzen, pagina's,
// bedrijfsgegevens). Puur en client-veilig: geen AI en geen netwerk, dus het
// werkt altijd. Elk punt zegt wat er mis is, waarom het telt en waar je het
// oplost. De score telt per punt een gewicht; bij producten naar het deel dat
// het raakt (één product zonder foto van de twintig weegt minder dan alle twintig).
// ---------------------------------------------------------------------------

const B = "/studio/webshop";
const INSTELLINGEN = `${B}/instellingen`;

export type CheckGroep = "producten" | "prijzen" | "google" | "wettelijk" | "online";
export type CheckStatus = "probleem" | "let-op";

export const GROEP_LABEL: Record<CheckGroep, string> = {
  producten: "Producten",
  prijzen: "Prijzen",
  google: "Vindbaar in Google",
  wettelijk: "Wat de wet vraagt",
  online: "Online en bestellen",
};
const GROEP_VOLGORDE: CheckGroep[] = ["producten", "prijzen", "google", "wettelijk", "online"];

/** De pagina's die elke Nederlandse webwinkel hoort te hebben (lib/sites/webshop-templates.ts). */
export const WETTELIJKE_PAGINAS = { "verzenden-en-retourneren": "Verzenden en retourneren", voorwaarden: "Algemene voorwaarden" } as const;
export type WettelijkeSlug = keyof typeof WETTELIJKE_PAGINAS;

export type CheckActie =
  | { soort: "link"; label: string; href: string }
  /** de AI-schrijfhulp op dezelfde pagina, voor alle producten zonder (goede) omschrijving */
  | { soort: "producttekst"; label: string }
  /** de standaardpagina van een nieuwe webshop toevoegen of een lege pagina vullen */
  | { soort: "pagina"; label: string; slug: WettelijkeSlug }
  | { soort: "publiceren"; label: string };

export interface CheckProduct {
  id: string;
  naam: string;
  href: string;
  /** bv. de prijs bij een prijs die niet lijkt te kloppen */
  extra?: string | undefined;
}

export interface CheckPunt {
  id: string;
  groep: CheckGroep;
  status: CheckStatus;
  /** wat er mis is */
  titel: string;
  /** waarom het telt, in één korte zin */
  waarom: string;
  actie: CheckActie | null;
  /** de producten waar het om gaat (leeg bij een punt over de hele winkel) */
  producten: CheckProduct[];
}

export interface WinkelCheck {
  /** 0–100 */
  score: number;
  /** eerst de problemen, dan de let-op-punten, elk in de volgorde van de groepen */
  punten: CheckPunt[];
  /** wat al in orde is, als korte zinnen */
  goed: string[];
}

export interface CheckInvoer {
  site: Pick<SiteDoc, "bedrijf" | "pages" | "media" | "liveBuild" | "winkel">;
  /** pagina's, stijl of bedrijfsgegevens gewijzigd na de laatste keer publiceren */
  unpublished: boolean;
  /** het bedrijf mag publiceren (Website-beheer of kosteloos account) */
  canPublish: boolean;
}

/** Hoe vaak een prijs hoger (of lager) mag zijn dan de middelste prijs voordat we vragen of hij klopt. */
export const PRIJS_FACTOR = 50;
/** Korter dan dit is een omschrijving eigenlijk geen omschrijving (ongeveer één korte zin). */
export const KORTE_OMSCHRIJVING = 80;
/** Zoveel tekens van de korte zin toont Google ongeveer; de site knipt de beschrijving hier ook af (lib/sites/render.ts). */
export const GOOGLE_OMSCHRIJVING = 160;
/** De titel van een productpagina is "<naam> | <bedrijf>", afgeknipt op 70 tekens (lib/sites/render.ts). */
export const GOOGLE_TITEL = 70;

const meer = (n: number, een: string, veel: string) => (n === 1 ? een : veel.replace("{n}", String(n)));
const productHref = (p: Pick<SiteProduct, "id">) => `${B}/producten/${p.id}`;
const alsCheck = (p: SiteProduct, extra?: string): CheckProduct => ({ id: p.id, naam: p.naam.trim() || "Naamloos product", href: productHref(p), ...(extra ? { extra } : {}) });
const sleutel = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Alle tekst van een blok (koppen, teksten, items), om te zien of een pagina leeg is. */
function tekstVan(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(tekstVan).join(" ");
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).map(tekstVan).join(" ");
  return "";
}

/** Een pagina zonder echte tekst: geen zichtbaar blok, of samen minder dan een paar woorden. */
export function paginaIsLeeg(p: Pick<Page, "blocks">): boolean {
  const tekst = p.blocks
    .filter((b: Block) => !b.verborgen)
    .map((b) => tekstVan(b.props))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return tekst.length < 40;
}

/** De middelste waarde (bij een even aantal het gemiddelde van de twee middelste). */
export function mediaan(waarden: number[]): number | null {
  if (!waarden.length) return null;
  const s = [...waarden].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
}

/** Producten met een prijs die sterk afwijkt van de rest (vaak een typfout: 1250 in plaats van 12,50). Pas vanaf vier producten met een prijs. */
export function prijsUitschieters(producten: SiteProduct[], factor = PRIJS_FACTOR): { product: SiteProduct; mediaanCents: number }[] {
  const metPrijs = producten.filter((p) => p.prijsCents > 0);
  if (metPrijs.length < 4) return [];
  const m = mediaan(metPrijs.map((p) => p.prijsCents)) ?? 0;
  if (m <= 0) return [];
  return metPrijs.filter((p) => p.prijsCents >= m * factor || p.prijsCents * factor <= m).map((product) => ({ product, mediaanCents: m }));
}

/** De korting van een aanbieding in hele procenten, of null zonder (geldige) was-prijs. */
export function kortingPct(p: Pick<SiteProduct, "prijsCents" | "oudePrijsCents">): number | null {
  const oud = p.oudePrijsCents ?? 0;
  if (oud <= 0 || oud <= p.prijsCents) return null;
  return Math.round((1 - p.prijsCents / oud) * 100);
}

interface Teller {
  gewicht: number;
  krediet: number;
}

/** De winkelcheck: alle punten, de score en wat al goed is. */
export function winkelCheck({ site, unpublished, canPublish }: CheckInvoer): WinkelCheck {
  const winkel = winkelVan(site);
  const punten: CheckPunt[] = [];
  const goed: string[] = [];
  const telling: Teller[] = [];
  const fotoIds = new Set(site.media.map((m) => m.id));
  const online = winkel.producten.filter((p) => p.zichtbaar);
  const n = online.length;

  /** Een punt over (een deel van) de producten: de score zakt naar het deel dat het raakt, bij let-op half zo hard. */
  const overProducten = (o: { id: string; groep: CheckGroep; status: CheckStatus; gewicht: number; geraakt: CheckProduct[]; van: number; titel: (n: number) => string; waarom: string; goed: string; actie: CheckActie | null }) => {
    const deel = o.van ? Math.min(1, o.geraakt.length / o.van) : 0;
    telling.push({ gewicht: o.gewicht, krediet: 1 - deel * (o.status === "probleem" ? 1 : 0.5) });
    if (!o.geraakt.length) goed.push(o.goed);
    else punten.push({ id: o.id, groep: o.groep, status: o.status, titel: o.titel(o.geraakt.length), waarom: o.waarom, actie: o.actie, producten: o.geraakt });
  };
  /** Een punt over de hele winkel: in orde, of niet. */
  const overWinkel = (o: { id: string; groep: CheckGroep; status: CheckStatus; gewicht: number; mis: boolean; titel: string; waarom: string; goed: string; actie: CheckActie | null }) => {
    telling.push({ gewicht: o.gewicht, krediet: o.mis ? (o.status === "probleem" ? 0 : 0.5) : 1 });
    if (!o.mis) goed.push(o.goed);
    else punten.push({ id: o.id, groep: o.groep, status: o.status, titel: o.titel, waarom: o.waarom, actie: o.actie, producten: [] });
  };

  // ---- producten --------------------------------------------------------------
  const verborgen = winkel.producten.length - n;
  overWinkel({
    id: "geen-producten",
    groep: "producten",
    status: "probleem",
    gewicht: 20,
    mis: n === 0,
    titel: verborgen ? `Er staat geen product online (${meer(verborgen, "1 is verborgen", "{n} zijn verborgen")})` : "Je webshop heeft nog geen producten",
    waarom: "Zonder producten online valt er niets te kopen.",
    goed: `${meer(n, "1 product staat", "{n} producten staan")} online.`,
    actie: verborgen ? { soort: "link", label: "Naar je producten", href: `${B}/producten` } : { soort: "link", label: "Product toevoegen", href: `${B}/producten/nieuw` },
  });

  if (n > 0) {
    overProducten({
      id: "geen-foto",
      groep: "producten",
      status: "probleem",
      gewicht: 10,
      van: n,
      geraakt: online.filter((p) => !p.fotos.some((f) => fotoIds.has(f))).map((p) => alsCheck(p)),
      titel: (k) => meer(k, "1 product heeft geen foto", "{n} producten hebben geen foto"),
      waarom: "Zonder foto weet een klant niet goed wat hij koopt, en twijfelt hij eerder.",
      goed: "Elk product heeft een foto.",
      actie: null,
    });
    overProducten({
      id: "geen-omschrijving",
      groep: "producten",
      status: "probleem",
      gewicht: 8,
      van: n,
      geraakt: online.filter((p) => !p.omschrijving.trim()).map((p) => alsCheck(p)),
      titel: (k) => meer(k, "1 product heeft geen omschrijving", "{n} producten hebben geen omschrijving"),
      waarom: "Een klant wil lezen wat hij krijgt; Google heeft tekst nodig om je product te vinden.",
      goed: "Elk product heeft een omschrijving.",
      actie: { soort: "producttekst", label: "Laat de AI een tekst voorstellen" },
    });
    overProducten({
      id: "korte-omschrijving",
      groep: "producten",
      status: "let-op",
      gewicht: 4,
      van: n,
      geraakt: online.filter((p) => p.omschrijving.trim() && p.omschrijving.trim().length < KORTE_OMSCHRIJVING).map((p) => alsCheck(p)),
      titel: (k) => meer(k, "1 product heeft een heel korte omschrijving", "{n} producten hebben een heel korte omschrijving"),
      waarom: "Eén regel vertelt een klant te weinig om zonder vragen te bestellen.",
      goed: "Geen enkele omschrijving is te kort.",
      actie: { soort: "producttekst", label: "Laat de AI een tekst voorstellen" },
    });
    overProducten({
      id: "uitverkocht-zichtbaar",
      groep: "producten",
      status: "let-op",
      gewicht: 3,
      van: n,
      geraakt: online.filter((p) => isUitverkocht(p)).map((p) => alsCheck(p, p.voorraad != null && p.voorraad <= 0 ? "voorraad 0" : "uitverkocht")),
      titel: (k) => meer(k, "1 product is uitverkocht maar staat online", "{n} producten zijn uitverkocht maar staan online"),
      waarom: "Klanten zien het wel, maar kunnen het niet bestellen: vul de voorraad aan of verberg het.",
      goed: "Wat online staat, is ook te bestellen.",
      actie: null,
    });
  }
  if (winkel.producten.length > 1) {
    const perNaam = new Map<string, SiteProduct[]>();
    for (const p of winkel.producten) if (p.naam.trim()) perNaam.set(sleutel(p.naam), [...(perNaam.get(sleutel(p.naam)) ?? []), p]);
    overProducten({
      id: "dubbele-naam",
      groep: "producten",
      status: "let-op",
      gewicht: 3,
      van: winkel.producten.length,
      geraakt: [...perNaam.values()].filter((l) => l.length > 1).flat().map((p) => alsCheck(p)),
      titel: (k) => `${k} producten hebben dezelfde naam als een ander product`,
      waarom: "Klanten en Google kunnen twee producten met dezelfde naam niet uit elkaar houden.",
      goed: "Elk product heeft een eigen naam.",
      actie: null,
    });
    const perAdres = new Map<string, SiteProduct[]>();
    for (const p of winkel.producten) perAdres.set(p.slug, [...(perAdres.get(p.slug) ?? []), p]);
    overProducten({
      id: "dubbel-adres",
      groep: "producten",
      status: "probleem",
      gewicht: 5,
      van: winkel.producten.length,
      geraakt: [...perAdres.values()].filter((l) => l.length > 1).flat().map((p) => alsCheck(p, `/p/${p.slug}`)),
      titel: (k) => `${k} producten delen hetzelfde webadres`,
      waarom: "Op één adres kan maar één product staan; geef elk product een eigen webadres.",
      goed: "Elk product heeft een eigen webadres.",
      actie: null,
    });
  }

  // ---- prijzen ----------------------------------------------------------------
  if (n > 0) {
    overProducten({
      id: "geen-prijs",
      groep: "prijzen",
      status: "probleem",
      gewicht: 10,
      van: n,
      geraakt: online.filter((p) => p.prijsCents <= 0).map((p) => alsCheck(p, euro(0))),
      titel: (k) => meer(k, "1 product heeft geen prijs", "{n} producten hebben geen prijs"),
      waarom: "Een klant kan het nu voor € 0,00 bestellen.",
      goed: "Elk product heeft een prijs.",
      actie: null,
    });
    const uitschieters = prijsUitschieters(online);
    const m = uitschieters[0]?.mediaanCents;
    overProducten({
      id: "prijs-uitschieter",
      groep: "prijzen",
      status: "let-op",
      gewicht: 5,
      van: n,
      geraakt: uitschieters.map((u) => alsCheck(u.product, euro(u.product.prijsCents))),
      titel: (k) => meer(k, "Klopt deze prijs? 1 product wijkt sterk af", "Kloppen deze prijzen? {n} producten wijken sterk af"),
      waarom: `De prijs is meer dan ${PRIJS_FACTOR} keer zo hoog of laag als de middelste prijs in je winkel (${euro(m ?? 0)}); vaak is dat een typfout, zoals 1250 in plaats van 12,50.`,
      goed: "Geen prijs wijkt vreemd af van de rest.",
      actie: null,
    });
    overProducten({
      id: "korting-hoog",
      groep: "prijzen",
      status: "let-op",
      gewicht: 2,
      van: n,
      geraakt: online.filter((p) => p.prijsCents > 0 && (kortingPct(p) ?? 0) >= 90).map((p) => alsCheck(p, `${kortingPct(p) ?? 0}% korting`)),
      titel: (k) => meer(k, "1 aanbieding geeft 90% korting of meer", "{n} aanbiedingen geven 90% korting of meer"),
      waarom: "De was-prijs moet een prijs zijn die je echt eerder vroeg; anders is de aanbieding misleidend.",
      goed: "Geen aanbieding met een vreemd hoge korting.",
      actie: null,
    });
  }

  // ---- Google -----------------------------------------------------------------
  if (n > 0) {
    overProducten({
      id: "geen-korte-tekst",
      groep: "google",
      status: "let-op",
      gewicht: 4,
      van: n,
      geraakt: online.filter((p) => !p.korteTekst.trim()).map((p) => alsCheck(p)),
      titel: (k) => meer(k, "1 product heeft geen korte zin", "{n} producten hebben geen korte zin"),
      waarom: "Die zin staat op de productkaart én onder je product in Google; zonder pakt Google het begin van de omschrijving, of niets.",
      goed: "Elk product heeft een korte zin voor de kaart en Google.",
      actie: { soort: "producttekst", label: "Laat de AI een tekst voorstellen" },
    });
    overProducten({
      id: "korte-tekst-lang",
      groep: "google",
      status: "let-op",
      gewicht: 2,
      van: n,
      geraakt: online.filter((p) => p.korteTekst.trim().length > GOOGLE_OMSCHRIJVING).map((p) => alsCheck(p, `${p.korteTekst.trim().length} tekens`)),
      titel: (k) => meer(k, "1 korte zin is te lang voor Google", "{n} korte zinnen zijn te lang voor Google"),
      waarom: `Google laat ongeveer ${GOOGLE_OMSCHRIJVING} tekens zien; de rest valt weg.`,
      goed: "Elke korte zin past in Google.",
      actie: null,
    });
    const bedrijf = site.bedrijf.naam.trim();
    overProducten({
      id: "titel-lang",
      groep: "google",
      status: "let-op",
      gewicht: 2,
      van: n,
      geraakt: online.filter((p) => `${p.naam.trim()} | ${bedrijf}`.length > GOOGLE_TITEL).map((p) => alsCheck(p, `${p.naam.trim().length} tekens`)),
      titel: (k) => meer(k, "1 productnaam is te lang voor Google", "{n} productnamen zijn te lang voor Google"),
      waarom: `In Google staat de naam met je bedrijfsnaam erachter; na ${GOOGLE_TITEL} tekens valt de rest weg.`,
      goed: "Elke productnaam past in Google.",
      actie: null,
    });
  }

  // ---- wat de wet vraagt ------------------------------------------------------
  for (const [slug, naam] of Object.entries(WETTELIJKE_PAGINAS) as [WettelijkeSlug, string][]) {
    const pagina = site.pages.find((p) => p.slug === slug);
    const verzenden = slug === "verzenden-en-retourneren";
    overWinkel({
      id: `pagina-${slug}`,
      groep: "wettelijk",
      status: verzenden ? "probleem" : "let-op",
      gewicht: verzenden ? 8 : 4,
      mis: !pagina || paginaIsLeeg(pagina),
      titel: pagina ? `De pagina ${naam} is leeg` : `De pagina ${naam} ontbreekt`,
      waarom: verzenden
        ? "Een klant moet vóór het bestellen kunnen lezen hoe bezorgen, de bedenktijd van 14 dagen en terugsturen werken."
        : "Met voorwaarden weet een klant waar hij aan toe is; ze gelden alleen als hij ze vóór de bestelling kan lezen.",
      goed: `De pagina ${naam} staat erin.`,
      actie: { soort: "pagina", label: pagina ? "Standaardtekst invullen" : "Standaardpagina toevoegen", slug },
    });
  }
  const b = site.bedrijf;
  const naarGegevens: CheckActie = { soort: "link", label: "Naar je bedrijfsgegevens", href: INSTELLINGEN };
  overWinkel({
    id: "bedrijf-kvk",
    groep: "wettelijk",
    status: "probleem",
    gewicht: 6,
    mis: !/^\d{8}$/.test(b.kvk.trim()),
    titel: "Je KVK-nummer ontbreekt",
    waarom: "Een webwinkel moet zijn KVK-nummer op de website zetten; zo ziet een klant dat je bedrijf echt bestaat.",
    goed: "Je KVK-nummer staat erbij.",
    actie: naarGegevens,
  });
  overWinkel({
    id: "bedrijf-adres",
    groep: "wettelijk",
    status: "probleem",
    gewicht: 6,
    mis: !(b.straat.trim() && b.postcode.trim() && b.plaats.trim()),
    titel: "Je adres is niet compleet",
    waarom: "Een klant heeft recht op het adres van je bedrijf (straat, postcode en plaats).",
    goed: "Je adres is compleet.",
    actie: naarGegevens,
  });
  overWinkel({
    id: "bedrijf-email",
    groep: "wettelijk",
    status: "probleem",
    gewicht: 6,
    mis: !b.email.trim(),
    titel: "Er staat geen e-mailadres bij je bedrijf",
    waarom: "Bestellingen en vragen komen op dat adres binnen, en een klant moet je snel kunnen bereiken.",
    goed: "Je e-mailadres staat erbij.",
    actie: naarGegevens,
  });
  overWinkel({
    id: "bedrijf-telefoon",
    groep: "wettelijk",
    status: "let-op",
    gewicht: 2,
    mis: !b.telefoon.trim(),
    titel: "Er staat geen telefoonnummer bij je bedrijf",
    waarom: "Met een telefoonnummer kan een klant je snel bereiken bij een vraag over zijn bestelling.",
    goed: "Je telefoonnummer staat erbij.",
    actie: naarGegevens,
  });

  // ---- online en bestellen ----------------------------------------------------
  const live = Boolean(site.liveBuild);
  overWinkel({
    id: "niet-online",
    groep: "online",
    status: "probleem",
    gewicht: 10,
    mis: !live,
    titel: "Je webshop staat nog niet online",
    waarom: "Tot je publiceert, kan niemand je webshop bekijken of er iets bestellen.",
    goed: "Je webshop staat online.",
    actie: canPublish ? { soort: "publiceren", label: "Nu publiceren" } : { soort: "link", label: "Online zetten met Website-beheer", href: "/werkgever/website" },
  });
  if (live) {
    overWinkel({
      id: "wijzigingen",
      groep: "online",
      status: "let-op",
      gewicht: 2,
      mis: unpublished,
      titel: "Er zijn wijzigingen die nog niet online staan",
      waarom: "Pagina's, stijl en bedrijfsgegevens zie je op je webshop pas na Publiceren; producten staan wel meteen online.",
      goed: "Al je wijzigingen staan online.",
      actie: canPublish ? { soort: "publiceren", label: "Wijzigingen publiceren" } : null,
    });
  }
  overWinkel({
    id: "bestellen-uit",
    groep: "online",
    status: "let-op",
    gewicht: 5,
    mis: !winkel.bestellen,
    titel: "Online bestellen staat uit",
    waarom: "Klanten zien je producten, maar kunnen niets bestellen.",
    goed: "Klanten kunnen online bestellen.",
    actie: { soort: "link", label: "Naar bestellen en bezorgen", href: INSTELLINGEN },
  });
  if (winkel.bestellen) {
    overWinkel({
      id: "betaaltekst",
      groep: "online",
      status: "let-op",
      gewicht: 2,
      mis: !winkel.betaalTekst.trim(),
      titel: "Er staat niet bij hoe klanten betalen",
      waarom: "Die zin staat bij elke bestelling; zonder weet een klant niet waar hij aan toe is.",
      goed: "Bij elke bestelling staat hoe betalen gaat.",
      actie: { soort: "link", label: "Naar bestellen en bezorgen", href: INSTELLINGEN },
    });
  }

  const totaal = telling.reduce((s, t) => s + t.gewicht, 0);
  const score = totaal ? Math.round((100 * telling.reduce((s, t) => s + t.gewicht * t.krediet, 0)) / totaal) : 100;
  const rang = (p: CheckPunt) => (p.status === "probleem" ? 0 : 10) + GROEP_VOLGORDE.indexOf(p.groep);
  return { score: Math.max(0, Math.min(100, score)), punten: punten.map((p, i) => ({ p, i })).sort((x, y) => rang(x.p) - rang(y.p) || x.i - y.i).map((x) => x.p), goed };
}

/**
 * De pagina's met de standaardpagina van een nieuwe webshop erbij (dezelfde tekst als bij het
 * aanmaken, met de bedrijfsgegevens van nu): een ontbrekende pagina komt vóór Contact, een lege
 * krijgt de tekst. Een pagina met tekst blijft zoals hij is (null: er is niets te doen), en bij
 * het maximum van 12 pagina's komt er niets bij (null).
 */
export function metStandaardPagina(pages: Page[], slug: WettelijkeSlug, bedrijf: Company, newId: () => string): Page[] | null {
  const sjabloon = WEBSHOP_TEMPLATES[0];
  const standaard = sjabloon ? webshopPages(sjabloon, bedrijf, newId).find((p) => p.slug === slug) : undefined;
  if (!standaard) return null;
  const bestaand = pages.find((p) => p.slug === slug);
  if (bestaand) return paginaIsLeeg(bestaand) ? pages.map((p) => (p === bestaand ? { ...p, blocks: standaard.blocks } : p)) : null;
  if (pages.length >= 12) return null;
  const contact = pages.findIndex((p) => p.slug === "contact");
  return contact < 0 ? [...pages, standaard] : [...pages.slice(0, contact), standaard, ...pages.slice(contact)];
}
