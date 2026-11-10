// ---------------------------------------------------------------------------
// Een bedrijf zet zichzelf op ZekerFlex Kaart: wat het mag invullen en hoe dat wordt schoongemaakt. Niets
// komt vanzelf op de kaart: de beheerder keurt elke aanmelding eerst goed. Alleen invoer van het bedrijf
// zelf, dus geen gegevens van het internet. Puur bestand (ook voor het scherm), met tests.
// ---------------------------------------------------------------------------

export const PLEK_SOORTEN = [
  { key: "horeca", label: "Horeca (restaurant, café, bar)" },
  { key: "winkel", label: "Winkel" },
  { key: "dienst", label: "Dienstverlener (kapper, garage, kantoor)" },
  { key: "zorg", label: "Zorg en welzijn" },
  { key: "sport", label: "Sport en vrije tijd" },
  { key: "overig", label: "Overig" },
] as const;

export type PlekSoort = (typeof PLEK_SOORTEN)[number]["key"];

const SOORT_LABEL: Record<PlekSoort, string> = { horeca: "Horeca", winkel: "Winkel", dienst: "Dienstverlener", zorg: "Zorg en welzijn", sport: "Sport en vrije tijd", overig: "Bedrijf" };

export const isPlekSoort = (s: unknown): s is PlekSoort => typeof s === "string" && Object.hasOwn(SOORT_LABEL, s);
export const plekSoortNl = (s: string): string => (isPlekSoort(s) ? SOORT_LABEL[s] : "Bedrijf");

export type AanmeldStatus = "wacht" | "goedgekeurd" | "afgewezen";

export interface Aanmelding {
  tenantId: string;
  naam: string;
  soort: PlekSoort;
  /** zoals ingevuld; de plek zelf wordt bij PDOK opgezocht */
  adres: string;
  /** alleen https, of leeg */
  website: string;
  omschrijving: string;
  /** leeg of een nummer dat het bedrijf zelf openbaar wil maken */
  telefoon: string;
  lat: number;
  lon: number;
  plaats: string;
  status: AanmeldStatus;
  ingediend: string;
  beoordeeld: string | null;
  /** waarom afgewezen, voor het bedrijf */
  reden: string;
}

export interface AanmeldInvoer {
  naam: unknown;
  soort: unknown;
  adres: unknown;
  website?: unknown;
  omschrijving?: unknown;
  telefoon?: unknown;
  toestemming?: unknown;
}

export type Schoon = { naam: string; soort: PlekSoort; adres: string; website: string; omschrijving: string; telefoon: string };

/** Spaties samenvoegen en stuurtekens weghalen. */
const tekst = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Een https-adres met een echte host, of "". Geen http, geen javascript:, geen gebruikersnaam of wachtwoord in het adres. */
export function schoneWebsite(v: unknown): string {
  const t = tekst(v, 200);
  if (!t) return "";
  const met = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(met);
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".") || /\s/.test(u.hostname)) return "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

/** Een telefoonnummer: cijfers, plus, spaties, streepjes en haakjes; 8 tot 16 cijfers. Anders leeg. */
export function schoneTelefoon(v: unknown): string {
  const t = tekst(v, 24);
  if (!/^[+\d][\d\s()-]*$/.test(t)) return "";
  const cijfers = t.replace(/\D/g, "").length;
  return cijfers >= 8 && cijfers <= 16 ? t : "";
}

export type Gecontroleerd = { ok: true; waarde: Schoon } | { ok: false; fout: string };

/** Controleert wat een bedrijf invult. De fouten zijn gewoon Nederlands, voor het formulier. */
export function controleerAanmelding(i: AanmeldInvoer): Gecontroleerd {
  const naam = tekst(i.naam, 80);
  if (naam.length < 2) return { ok: false, fout: "Vul de naam van je bedrijf in." };
  if (!isPlekSoort(i.soort)) return { ok: false, fout: "Kies wat voor bedrijf het is." };
  const adres = tekst(i.adres, 160);
  if (adres.length < 5) return { ok: false, fout: "Vul het adres in, met straat, huisnummer en plaats." };
  const ruweWebsite = tekst(i.website, 200);
  const website = schoneWebsite(ruweWebsite);
  if (ruweWebsite && !website) return { ok: false, fout: "Dit websiteadres klopt niet. Gebruik een adres met https, bijvoorbeeld https://jouwbedrijf.nl." };
  const ruweTelefoon = tekst(i.telefoon, 24);
  const telefoon = schoneTelefoon(ruweTelefoon);
  if (ruweTelefoon && !telefoon) return { ok: false, fout: "Dit telefoonnummer klopt niet." };
  if (telefoon && i.toestemming !== true) return { ok: false, fout: "Zet een vinkje als je wilt dat je telefoonnummer openbaar op de kaart staat." };
  return { ok: true, waarde: { naam, soort: i.soort, adres, website, omschrijving: tekst(i.omschrijving, 200), telefoon } };
}
