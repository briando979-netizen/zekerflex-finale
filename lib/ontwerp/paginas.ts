// ---------------------------------------------------------------------------
// Eigen pagina's in de Site-ontwerper: de eigenaar bouwt een pagina uit blokken
// (hero, tekst, beeld met tekst, kolommen, cijfers, vragen, citaat, video,
// galerij, oproep, witruimte). Een pagina heeft een concept en een live versie;
// bezoekers zien alleen live op /p/<slug>. Puur en browser-veilig: dezelfde
// normalisatie geldt voor wat de editor stuurt, wat de AI voorstelt en wat er
// opgeslagen staat. Links alleen intern (/…), https:// of mailto:/tel:.
// ---------------------------------------------------------------------------

export const ACHTERGRONDEN = { licht: "Licht", zacht: "Zacht grijs", donker: "Donker", merk: "Hoofdkleur" } as const;
export type Achtergrond = keyof typeof ACHTERGRONDEN;

export interface Knop {
  tekst: string;
  link: string;
}

interface Basis {
  id: string;
  achtergrond: Achtergrond;
}

export type Blok = Basis &
  (
    | { soort: "hero"; bovenregel: string; kop: string; tekst: string; knop: Knop; knop2: Knop; beeld: string; uitlijning: "links" | "midden" }
    | { soort: "tekst"; kop: string; tekst: string }
    | { soort: "beeldTekst"; kop: string; tekst: string; beeld: string; kant: "links" | "rechts"; knop: Knop }
    | { soort: "kolommen"; kop: string; items: { kop: string; tekst: string }[] }
    | { soort: "cijfers"; kop: string; items: { getal: string; label: string }[] }
    | { soort: "faq"; kop: string; items: { vraag: string; antwoord: string }[] }
    | { soort: "citaat"; tekst: string; naam: string }
    | { soort: "video"; kop: string; bron: string }
    | { soort: "galerij"; kop: string; beelden: string[] }
    | { soort: "oproep"; kop: string; tekst: string; knop: Knop }
    | { soort: "ruimte"; grootte: "klein" | "middel" | "groot" }
  );
export type BlokSoort = Blok["soort"];

export const BLOK_SOORTEN: { soort: BlokSoort; label: string; uitleg: string }[] = [
  { soort: "hero", label: "Hero", uitleg: "Grote kop bovenaan met knoppen en een foto" },
  { soort: "tekst", label: "Tekst", uitleg: "Een kop met alinea's" },
  { soort: "beeldTekst", label: "Beeld + tekst", uitleg: "Foto naast tekst, links of rechts" },
  { soort: "kolommen", label: "Kolommen", uitleg: "Twee tot zes voordelen naast elkaar" },
  { soort: "cijfers", label: "Cijfers", uitleg: "Grote getallen met uitleg" },
  { soort: "faq", label: "Vragen", uitleg: "Veelgestelde vragen om open te klikken" },
  { soort: "citaat", label: "Citaat", uitleg: "Een uitspraak van een klant" },
  { soort: "video", label: "Video", uitleg: "Een eigen video of een YouTube-video" },
  { soort: "galerij", label: "Galerij", uitleg: "Een raster van foto's" },
  { soort: "oproep", label: "Oproep", uitleg: "Afsluitende oproep met een knop" },
  { soort: "ruimte", label: "Witruimte", uitleg: "Lucht tussen twee blokken" },
];

export interface PaginaInhoud {
  titel: string;
  /** voor Google en bij delen */
  omschrijving: string;
  noindex: boolean;
  blokken: Blok[];
}

/** Talen voor vertalingen van eigen pagina's; Nederlands is de hoofdtaal (/p/<slug>). */
export const TALEN = {
  en: { naam: "Engels", eigen: "English" },
  de: { naam: "Duits", eigen: "Deutsch" },
  fr: { naam: "Frans", eigen: "Français" },
  es: { naam: "Spaans", eigen: "Español" },
  pl: { naam: "Pools", eigen: "Polski" },
  ro: { naam: "Roemeens", eigen: "Română" },
  uk: { naam: "Oekraïens", eigen: "Українська" },
  tr: { naam: "Turks", eigen: "Türkçe" },
} as const;
export type Taal = keyof typeof TALEN;
export const isTaal = (v: unknown): v is Taal => typeof v === "string" && v in TALEN;

export interface Pagina {
  id: string;
  slug: string;
  concept: PaginaInhoud;
  live: PaginaInhoud | null;
  bijgewerkt: string;
  gepubliceerd: string | null;
  /** vertalingen van het concept; gaan met Publiceren mee naar liveVertalingen */
  vertalingen?: Partial<Record<Taal, PaginaInhoud>>;
  liveVertalingen?: Partial<Record<Taal, PaginaInhoud>>;
}

/** Alleen geldige talen met een geldige inhoud. */
export function normalizeVertalingen(raw: unknown): Partial<Record<Taal, PaginaInhoud>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const uit: Partial<Record<Taal, PaginaInhoud>> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (isTaal(k) && v && typeof v === "object") uit[k] = normalizeInhoud(v);
  return uit;
}

/**
 * Een vertaling op de vorm van het origineel: alleen tekst komt uit de vertaling,
 * al het andere (soort, volgorde, achtergrond, foto's, video, links, uitlijning)
 * uit het origineel. Zo kan een vertaling nooit een link, foto of blok toevoegen
 * of weghalen. Een blok dat de vertaling mist, blijft in de hoofdtaal staan.
 */
export function opVormVanOrigineel(origineel: PaginaInhoud, vertaling: PaginaInhoud): PaginaInhoud {
  const tekstVan = (o: Blok, v: Blok | undefined): Blok => {
    if (!v || v.soort !== o.soort) return o;
    switch (o.soort) {
      case "hero": {
        const t = v as typeof o;
        return { ...o, bovenregel: t.bovenregel, kop: t.kop, tekst: t.tekst, knop: { ...o.knop, tekst: t.knop.tekst }, knop2: { ...o.knop2, tekst: t.knop2.tekst } };
      }
      case "tekst": {
        const t = v as typeof o;
        return { ...o, kop: t.kop, tekst: t.tekst };
      }
      case "beeldTekst": {
        const t = v as typeof o;
        return { ...o, kop: t.kop, tekst: t.tekst, knop: { ...o.knop, tekst: t.knop.tekst } };
      }
      case "kolommen": {
        const t = v as typeof o;
        return { ...o, kop: t.kop, items: o.items.map((it, i) => ({ kop: t.items[i]?.kop ?? it.kop, tekst: t.items[i]?.tekst ?? it.tekst })) };
      }
      case "cijfers": {
        const t = v as typeof o;
        return { ...o, kop: t.kop, items: o.items.map((it, i) => ({ getal: it.getal, label: t.items[i]?.label ?? it.label })) };
      }
      case "faq": {
        const t = v as typeof o;
        return { ...o, kop: t.kop, items: o.items.map((it, i) => ({ vraag: t.items[i]?.vraag ?? it.vraag, antwoord: t.items[i]?.antwoord ?? it.antwoord })) };
      }
      case "citaat": {
        const t = v as typeof o;
        return { ...o, tekst: t.tekst, naam: t.naam };
      }
      case "video":
      case "galerij": {
        const t = v as typeof o;
        return { ...o, kop: t.kop };
      }
      case "oproep": {
        const t = v as typeof o;
        return { ...o, kop: t.kop, tekst: t.tekst, knop: { ...o.knop, tekst: t.knop.tekst } };
      }
      case "ruimte":
        return o;
    }
  };
  const perId = new Map(vertaling.blokken.map((b) => [b.id, b]));
  return {
    titel: vertaling.titel || origineel.titel,
    omschrijving: vertaling.omschrijving,
    noindex: origineel.noindex,
    blokken: origineel.blokken.map((o, i) => tekstVan(o, perId.get(o.id) ?? vertaling.blokken[i])),
  };
}

export const MAX_BLOKKEN = 40;
const MAX_ITEMS = 20;

/** Paden die al van de site zelf zijn mogen geen eigen pagina worden; eigen pagina's staan onder /p/. */
export function maakSlug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const tekst = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").slice(0, max) : "");
const een = <T extends string>(v: unknown, opties: readonly T[], standaard: T): T => (typeof v === "string" && (opties as readonly string[]).includes(v) ? (v as T) : standaard);
const lijst = (v: unknown): unknown[] => (Array.isArray(v) ? v.slice(0, MAX_ITEMS) : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Alleen veilige links: intern, https, mail of telefoon. Al het andere wordt leeg. */
export function veiligeLink(v: unknown): string {
  const s = tekst(v, 500).trim();
  if (!s) return "";
  if (/^\/(?!\/)[^\s]*$/.test(s)) return s;
  if (/^https:\/\/[^\s]+$/i.test(s)) return s;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(s)) return s;
  if (/^tel:\+?[\d\s-]{6,20}$/i.test(s)) return s;
  return "";
}

/** Een media-id uit de bibliotheek (lib/ontwerp/media.ts) of leeg. */
export const mediaId = (v: unknown) => (typeof v === "string" && /^m[a-z0-9]{10,30}$/.test(v) ? v : "");

/** Video: een eigen media-id of een YouTube-id (11 tekens). Een volledige YouTube-link mag ook. */
export function videoBron(v: unknown): string {
  const s = tekst(v, 300).trim();
  if (mediaId(s)) return s;
  const yt = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/.exec(s)?.[1] ?? (/^[\w-]{11}$/.test(s) ? s : "");
  return yt ? `yt:${yt}` : "";
}

const knop = (v: unknown): Knop => {
  const k = obj(v);
  return { tekst: tekst(k.tekst, 60), link: veiligeLink(k.link) };
};

let teller = 0;
export function nieuwId(): string {
  teller = (teller + 1) % 1_000_000;
  return `b${Date.now().toString(36)}${teller.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function normalizeBlok(raw: unknown): Blok | null {
  const r = obj(raw);
  const basis = { id: typeof r.id === "string" && /^[a-z0-9]{4,40}$/i.test(r.id) ? r.id : nieuwId(), achtergrond: een(r.achtergrond, Object.keys(ACHTERGRONDEN) as Achtergrond[], "licht") };
  switch (r.soort) {
    case "hero":
      return { ...basis, soort: "hero", bovenregel: tekst(r.bovenregel, 80), kop: tekst(r.kop, 160), tekst: tekst(r.tekst, 600), knop: knop(r.knop), knop2: knop(r.knop2), beeld: mediaId(r.beeld), uitlijning: een(r.uitlijning, ["links", "midden"] as const, "links") };
    case "tekst":
      return { ...basis, soort: "tekst", kop: tekst(r.kop, 160), tekst: tekst(r.tekst, 6000) };
    case "beeldTekst":
      return { ...basis, soort: "beeldTekst", kop: tekst(r.kop, 160), tekst: tekst(r.tekst, 2000), beeld: mediaId(r.beeld), kant: een(r.kant, ["links", "rechts"] as const, "rechts"), knop: knop(r.knop) };
    case "kolommen":
      return { ...basis, soort: "kolommen", kop: tekst(r.kop, 160), items: lijst(r.items).slice(0, 6).map((i) => ({ kop: tekst(obj(i).kop, 100), tekst: tekst(obj(i).tekst, 400) })) };
    case "cijfers":
      return { ...basis, soort: "cijfers", kop: tekst(r.kop, 160), items: lijst(r.items).slice(0, 6).map((i) => ({ getal: tekst(obj(i).getal, 20), label: tekst(obj(i).label, 100) })) };
    case "faq":
      return { ...basis, soort: "faq", kop: tekst(r.kop, 160), items: lijst(r.items).map((i) => ({ vraag: tekst(obj(i).vraag, 200), antwoord: tekst(obj(i).antwoord, 1500) })) };
    case "citaat":
      return { ...basis, soort: "citaat", tekst: tekst(r.tekst, 600), naam: tekst(r.naam, 120) };
    case "video":
      return { ...basis, soort: "video", kop: tekst(r.kop, 160), bron: videoBron(r.bron) };
    case "galerij":
      return { ...basis, soort: "galerij", kop: tekst(r.kop, 160), beelden: lijst(r.beelden).map(mediaId).filter(Boolean).slice(0, 12) };
    case "oproep":
      return { ...basis, soort: "oproep", kop: tekst(r.kop, 160), tekst: tekst(r.tekst, 400), knop: knop(r.knop) };
    case "ruimte":
      return { ...basis, soort: "ruimte", grootte: een(r.grootte, ["klein", "middel", "groot"] as const, "middel") };
    default:
      return null;
  }
}

export function normalizeInhoud(raw: unknown): PaginaInhoud {
  const r = obj(raw);
  return {
    titel: tekst(r.titel, 120).trim() || "Nieuwe pagina",
    omschrijving: tekst(r.omschrijving, 300),
    noindex: r.noindex === true,
    blokken: Array.isArray(r.blokken) ? r.blokken.slice(0, MAX_BLOKKEN).map(normalizeBlok).filter((b): b is Blok => b !== null) : [],
  };
}

/** Een leeg blok van een soort, met voorbeeldtekst zodat je direct ziet hoe het eruitziet. */
export function leegBlok(soort: BlokSoort): Blok {
  const leeg: Knop = { tekst: "", link: "" };
  const b = { id: nieuwId(), achtergrond: "licht" as Achtergrond };
  switch (soort) {
    case "hero":
      return { ...b, achtergrond: "donker", soort, bovenregel: "ZekerFlex", kop: "Een sterke kop over wat je biedt", tekst: "Eén of twee zinnen die uitleggen waarom dit voor de bezoeker belangrijk is.", knop: { tekst: "Aan de slag", link: "/register" }, knop2: leeg, beeld: "", uitlijning: "links" };
    case "tekst":
      return { ...b, soort, kop: "Kop van deze alinea", tekst: "Schrijf hier je tekst.\n\nEen lege regel begint een nieuwe alinea." };
    case "beeldTekst":
      return { ...b, soort, kop: "Vertel je verhaal", tekst: "Kies hiernaast een foto uit de bibliotheek en vertel wat erop gebeurt.", beeld: "", kant: "rechts", knop: leeg };
    case "kolommen":
      return { ...b, achtergrond: "zacht", soort, kop: "Waarom ZekerFlex", items: [{ kop: "Snel", tekst: "Uitleg van het eerste voordeel." }, { kop: "Zeker", tekst: "Uitleg van het tweede voordeel." }, { kop: "Simpel", tekst: "Uitleg van het derde voordeel." }] };
    case "cijfers":
      return { ...b, soort, kop: "In cijfers", items: [{ getal: "24/7", label: "Bereikbaar" }, { getal: "€ 3,50", label: "Per gewerkt uur" }, { getal: "0", label: "Opstartkosten" }] };
    case "faq":
      return { ...b, soort, kop: "Veelgestelde vragen", items: [{ vraag: "Een vraag die klanten vaak stellen?", antwoord: "Het antwoord daarop." }] };
    case "citaat":
      return { ...b, achtergrond: "donker", soort, tekst: "Een uitspraak van een tevreden klant.", naam: "Naam, functie" };
    case "video":
      return { ...b, soort, kop: "", bron: "" };
    case "galerij":
      return { ...b, soort, kop: "", beelden: [] };
    case "oproep":
      return { ...b, achtergrond: "merk", soort, kop: "Klaar om te beginnen?", tekst: "Maak in een paar minuten een gratis account.", knop: { tekst: "Account aanmaken", link: "/register" } };
    case "ruimte":
      return { ...b, soort, grootte: "middel" };
  }
}

/** Kant-en-klare pagina's om mee te beginnen. */
export const PAGINA_SJABLONEN: { id: string; naam: string; uitleg: string; inhoud: () => PaginaInhoud }[] = [
  { id: "leeg", naam: "Lege pagina", uitleg: "Begin met één hero", inhoud: () => ({ titel: "Nieuwe pagina", omschrijving: "", noindex: false, blokken: [leegBlok("hero")] }) },
  {
    id: "dienst",
    naam: "Dienst of product",
    uitleg: "Hero, voordelen, beeld met tekst, vragen en een oproep",
    inhoud: () => ({ titel: "Onze dienst", omschrijving: "", noindex: false, blokken: [leegBlok("hero"), leegBlok("kolommen"), leegBlok("beeldTekst"), leegBlok("cijfers"), leegBlok("faq"), leegBlok("oproep")] }),
  },
  {
    id: "actie",
    naam: "Actie of campagne",
    uitleg: "Korte pagina voor een advertentie: hero, citaat en oproep",
    inhoud: () => ({ titel: "Actie", omschrijving: "", noindex: true, blokken: [leegBlok("hero"), leegBlok("citaat"), leegBlok("oproep")] }),
  },
  {
    id: "verhaal",
    naam: "Verhaal of nieuws",
    uitleg: "Hero, tekst, foto's en video",
    inhoud: () => ({ titel: "Ons verhaal", omschrijving: "", noindex: false, blokken: [leegBlok("hero"), leegBlok("tekst"), leegBlok("galerij"), leegBlok("video")] }),
  },
];
