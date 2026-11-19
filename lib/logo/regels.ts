import { isKleurId, schoonTekst, STANDAARD_KLEUR, type KleurId, type Uitkomst } from "@/lib/advertentie/regels";

// ---------------------------------------------------------------------------
// Logo maker (/logo-maker): de regels, puur. Zelfde opzet als de advertentie op
// maat (lib/advertentie/regels.ts): eerst een klein voorbeeld met ingebakken
// watermerk, de schone bestanden pas na vrijgave door de eigenaar (na betaling).
// De logo's komen uit de naam met vaste ontwerpregels (lib/logo/ontwerp.ts):
// typografie en eenvoudige vormen, geen AI-beelden en geen plaatjes van derden.
// ---------------------------------------------------------------------------

export const SFEREN = [
  { id: "streetwear", naam: "Streetwear", uitleg: "Schuin, zwaar, met ster en baan" },
  { id: "sport", naam: "Sport", uitleg: "Snel en krachtig" },
  { id: "luxe", naam: "Luxe", uitleg: "Fijn en elegant" },
  { id: "gothic", naam: "Gothic", uitleg: "Gotische letter, kroon" },
  { id: "techno", naam: "Techno", uitleg: "Breed, ruimte en bol" },
  { id: "outdoor", naam: "Outdoor", uitleg: "Bergen en buitenlucht" },
  { id: "strak", naam: "Strak", uitleg: "Rustig en modern" },
  { id: "speels", naam: "Speels", uitleg: "Rond en vrolijk" },
  { id: "klassiek", naam: "Klassiek", uitleg: "Sierlijk, met schreef" },
  { id: "stoer", naam: "Stoer", uitleg: "Smal en krachtig" },
] as const;
export type SfeerId = (typeof SFEREN)[number]["id"];
export const isSfeerId = (v: unknown): v is SfeerId => typeof v === "string" && SFEREN.some((s) => s.id === v);

/** De soort bedrijf bepaalt het beeldmerk van logo 5. */
export const BRANCHES = [
  { id: "kleding", naam: "Kleding en mode" },
  { id: "bouw", naam: "Bouw en klussen" },
  { id: "horeca", naam: "Horeca" },
  { id: "bakker", naam: "Bakker en eten" },
  { id: "zorg", naam: "Zorg en welzijn" },
  { id: "schoonmaak", naam: "Schoonmaak" },
  { id: "transport", naam: "Transport en logistiek" },
  { id: "winkel", naam: "Winkel of webshop" },
  { id: "beauty", naam: "Kapper en beauty" },
  { id: "techniek", naam: "ICT en techniek" },
  { id: "advies", naam: "Advies en zakelijk" },
  { id: "anders", naam: "Iets anders" },
] as const;
export type BrancheId = (typeof BRANCHES)[number]["id"];
export const isBrancheId = (v: unknown): v is BrancheId => typeof v === "string" && BRANCHES.some((b) => b.id === v);

export const LOGOS = [
  { nr: 1, naam: "Woordmerk", uitleg: "Je naam als logo" },
  { nr: 2, naam: "Monogram", uitleg: "Je letters in een vorm" },
  { nr: 3, naam: "Naast elkaar", uitleg: "Letters en naam op een rij" },
  { nr: 4, naam: "Gestapeld", uitleg: "Je naam in twee regels" },
  { nr: 5, naam: "Beeldmerk", uitleg: "Een teken bij je naam" },
  { nr: 6, naam: "Zegel", uitleg: "Rond, als een stempel" },
] as const;
/** De eerste versie had zes logo's per aanvraag (LOGOS hierboven); sinds versie 2 zijn het er negen, per sfeer een eigen set. */
export type LogoNr = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export const LOGO_AANTAL = 9;
export const isLogoNr = (v: unknown, aantal: number = LOGO_AANTAL): v is LogoNr => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= aantal;
/** Hoeveel logo's deze aanvraag heeft: een rij van vóór versie 2 houdt zijn zes, en ziet er altijd uit zoals toen. */
export const logoAantal = (logo: { versie?: number | undefined }): number => (logo.versie === 2 ? LOGO_AANTAL : 6);

/** De sjablonen van versie 2 (lib/logo/ontwerp2.ts). Elke sfeer kiest er negen uit, in een eigen volgorde. */
export const SJABLONEN = {
  baan: { naam: "Baan", uitleg: "Je naam in een baan met ster" },
  strepen: { naam: "Vaart", uitleg: "Monogram met snelheidsstrepen" },
  berg: { naam: "Bergtop", uitleg: "Toppen boven je naam" },
  berg2: { naam: "Twee toppen", uitleg: "Bergen in lijn" },
  bol: { naam: "Wereld", uitleg: "Je naam dwars door een bol" },
  chevron: { naam: "Punt", uitleg: "Een scherp teken" },
  ster: { naam: "Ster", uitleg: "Ster boven je naam" },
  kroon: { naam: "Kroon", uitleg: "Letter met kroon" },
  zegel: { naam: "Zegel", uitleg: "Rond, met een band" },
  schild: { naam: "Schild", uitleg: "Je letters in een schild" },
  vleugels: { naam: "Vleugels", uitleg: "Letters met vleugels" },
  breed: { naam: "Woordmerk", uitleg: "Je naam tussen lijnen" },
  lauwer: { naam: "Krans", uitleg: "Letters in een lauwerkrans" },
  bliksem: { naam: "Naast elkaar", uitleg: "Teken naast je naam" },
  stapel: { naam: "Gestapeld", uitleg: "Je naam in twee regels" },
  cirkel: { naam: "Monogram", uitleg: "Letters in een fijne cirkel" },
  teken: { naam: "Beeldmerk", uitleg: "Een teken bij je naam" },
  embleem: { naam: "Embleem", uitleg: "Je teken uitgespaard in een vlak" },
} as const;
export type SjabloonId = keyof typeof SJABLONEN;

export const SFEER_SJABLONEN: Record<SfeerId, readonly SjabloonId[]> = {
  streetwear: ["baan", "strepen", "bol", "ster", "chevron", "stapel", "zegel", "schild", "bliksem"],
  sport: ["strepen", "bliksem", "chevron", "baan", "vleugels", "schild", "stapel", "berg2", "zegel"],
  luxe: ["cirkel", "lauwer", "breed", "kroon", "zegel", "schild", "ster", "vleugels", "stapel"],
  gothic: ["kroon", "vleugels", "zegel", "schild", "lauwer", "breed", "ster", "cirkel", "stapel"],
  techno: ["bol", "baan", "breed", "chevron", "strepen", "ster", "zegel", "bliksem", "schild"],
  outdoor: ["berg", "berg2", "zegel", "schild", "chevron", "breed", "ster", "stapel", "lauwer"],
  strak: ["breed", "cirkel", "chevron", "schild", "zegel", "baan", "ster", "stapel", "strepen"],
  speels: ["baan", "ster", "stapel", "zegel", "bol", "schild", "bliksem", "lauwer", "breed"],
  klassiek: ["lauwer", "cirkel", "kroon", "zegel", "schild", "breed", "vleugels", "ster", "stapel"],
  stoer: ["schild", "strepen", "bliksem", "chevron", "berg", "vleugels", "zegel", "stapel", "breed"],
};

/** Hoe het voorbeeld getoond wordt: wit op donker, zwart op wit, of in de gekozen kleur op wit. */
export const THEMAS = [
  { id: "donker", naam: "Donker" },
  { id: "licht", naam: "Licht" },
  { id: "kleur", naam: "In jouw kleur" },
] as const;
export type ThemaId = (typeof THEMAS)[number]["id"];
export const isThemaId = (v: unknown): v is ThemaId => v === "donker" || v === "licht" || v === "kleur";

/** Wat de klant na vrijgave krijgt. `doorzichtig` = zonder achtergrond (PNG met alfakanaal). */
export const VARIANTEN = {
  "kleur-wit": { naam: "In kleur op wit", uitleg: "Voor documenten en drukwerk", breedte: 2400, hoogte: 1800, doorzichtig: false },
  kleur: { naam: "In kleur, zonder achtergrond", uitleg: "Voor je website en lichte achtergronden", breedte: 2400, hoogte: 1800, doorzichtig: true },
  wit: { naam: "Wit, zonder achtergrond", uitleg: "Voor donkere achtergronden en foto's", breedte: 2400, hoogte: 1800, doorzichtig: true },
  zwart: { naam: "Zwart, zonder achtergrond", uitleg: "Voor stempels en zwart-wit drukwerk", breedte: 2400, hoogte: 1800, doorzichtig: true },
  icoon: { naam: "Vierkant icoon", uitleg: "Voor je profielfoto en als favicon", breedte: 1024, hoogte: 1024, doorzichtig: false },
} as const;
export type VariantId = keyof typeof VARIANTEN;
export const VARIANT_IDS = Object.keys(VARIANTEN) as VariantId[];
export const isVariantId = (v: unknown): v is VariantId => typeof v === "string" && Object.hasOwn(VARIANTEN, v);

/** Het voorbeeld vóór vrijgave: klein, in kleur op wit, met watermerk. */
export const VOORBEELD = { breedte: 400, hoogte: 300 } as const;

export const LOGO_GRENS = { naam: 40, slogan: 60, brancheTekst: 40 } as const;

export interface LogoInvoer {
  naam: string;
  slogan?: string;
  branche: BrancheId;
  /** wat de bezoeker bij "iets anders" invulde (alleen voor Beheer) */
  brancheTekst?: string;
  kleur: KleurId;
  sfeer: SfeerId;
}

export interface LogoAanvraag {
  logo: LogoNr;
  naam: string;
  email: string;
  telefoon?: string;
  op: string;
}

export interface Logo {
  id: string;
  aangemaakt: string;
  gewijzigd: string;
  invoer: LogoInvoer;
  /** 2 = negen logo's uit lib/logo/ontwerp2.ts; ontbreekt = de zes van de eerste versie (lib/logo/ontwerp.ts) */
  versie?: 2;
  status: "gemaakt" | "aangevraagd" | "vrijgegeven";
  aanvraag?: LogoAanvraag;
  vrijgegevenOp?: string;
}

const veld = (bron: unknown, naam: string): unknown => (bron && typeof bron === "object" ? (bron as Record<string, unknown>)[naam] : undefined);

export function valideerLogoInvoer(ruw: unknown): Uitkomst<LogoInvoer> {
  const naam = schoonTekst(veld(ruw, "naam"), LOGO_GRENS.naam);
  const slogan = schoonTekst(veld(ruw, "slogan"), LOGO_GRENS.slogan);
  const branche = veld(ruw, "branche");
  const brancheTekst = schoonTekst(veld(ruw, "brancheTekst"), LOGO_GRENS.brancheTekst);
  const kleur = veld(ruw, "kleur");
  const sfeer = veld(ruw, "sfeer");
  if (naam.length < 2) return { ok: false, fout: "Vul de naam van je bedrijf in.", veld: "naam" };
  if (!/[\p{L}\p{N}]/u.test(naam)) return { ok: false, fout: "De naam heeft minstens één letter of cijfer nodig.", veld: "naam" };
  const b: BrancheId = isBrancheId(branche) ? branche : "anders";
  return {
    ok: true,
    waarde: {
      naam,
      ...(slogan ? { slogan } : {}),
      branche: b,
      ...(b === "anders" && brancheTekst ? { brancheTekst } : {}),
      kleur: isKleurId(kleur) ? kleur : STANDAARD_KLEUR,
      sfeer: isSfeerId(sfeer) ? sfeer : "strak",
    },
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function valideerLogoAanvraag(ruw: unknown): Uitkomst<Omit<LogoAanvraag, "op">> {
  const logo = Number(veld(ruw, "logo"));
  const naam = schoonTekst(veld(ruw, "naam"), 80);
  const emailRuw = veld(ruw, "email");
  const email = typeof emailRuw === "string" ? emailRuw.trim().slice(0, 200) : "";
  const telefoon = schoonTekst(veld(ruw, "telefoon"), 30).replace(/[^0-9+() -]/g, "").trim();
  if (!isLogoNr(logo)) return { ok: false, fout: "Kies eerst een van de logo's.", veld: "logo" };
  if (naam.length < 2) return { ok: false, fout: "Vul je naam in.", veld: "naam" };
  if (!EMAIL.test(email)) return { ok: false, fout: "Vul een geldig e-mailadres in.", veld: "email" };
  return { ok: true, waarde: { logo, naam, email, ...(telefoon ? { telefoon } : {}) } };
}

// ---------------------------------------------------------------------------
// De letters en regels van een naam
// ---------------------------------------------------------------------------

const KLEIN = new Set(["de", "het", "een", "van", "der", "den", "en", "in", "op", "voor", "bij", "te", "ter", "'t", "&", "+", "-", "bv", "b.v.", "vof", "v.o.f."]);
const eersteTeken = (woord: string): string => [...woord].find((c) => /[\p{L}\p{N}]/u.test(c))?.toLocaleUpperCase("nl-NL") ?? "";

/** De letters voor het monogram: de eerste letters van de twee belangrijkste woorden; bij één woord één letter. */
export function initialen(naam: string): string {
  const woorden = naam.split(/\s+/).filter(Boolean);
  const groot = woorden.filter((w) => !KLEIN.has(w.toLowerCase()) && eersteTeken(w));
  const bron = groot.length ? groot : woorden;
  const letters = bron.map(eersteTeken).filter(Boolean);
  return (letters.length >= 2 ? `${letters[0]}${letters[1]}` : (letters[0] ?? "")) || "?";
}

/** De naam in twee regels voor het gestapelde logo: zo gelijk mogelijk van lengte; één woord blijft één regel. */
export function tweeRegels(naam: string): [string] | [string, string] {
  const woorden = naam.split(/\s+/).filter(Boolean);
  if (woorden.length < 2) return [naam];
  let beste = 1;
  let verschil = Infinity;
  for (let i = 1; i < woorden.length; i++) {
    const v = Math.abs(woorden.slice(0, i).join(" ").length - woorden.slice(i).join(" ").length);
    if (v < verschil) {
      verschil = v;
      beste = i;
    }
  }
  return [woorden.slice(0, beste).join(" "), woorden.slice(beste).join(" ")];
}

// ---------------------------------------------------------------------------
// Het beeld: watermerk ja of nee, welke variant en welke maat
// ---------------------------------------------------------------------------

/** Na vrijgave is alleen het gekozen logo vrij. */
export function logoVrij(logo: Pick<Logo, "status" | "aanvraag">, nr: LogoNr): boolean {
  return logo.status === "vrijgegeven" && logo.aanvraag?.logo === nr;
}

export interface LogoBesluit {
  watermerk: boolean;
  /** alleen bij een voorbeeld van versie 2: op welke ondergrond (donker, licht of in kleur) */
  thema: ThemaId | null;
  variant: VariantId;
  breedte: number;
  hoogte: number;
}

/**
 * De enige plek die bepaalt wat de beeldroute van de logo maker teruggeeft. Niet vrijgegeven = altijd klein, in kleur op
 * wit en met ingebakken watermerk, wat er ook gevraagd wordt. De grote, schone varianten bestaan alleen voor het gekozen
 * logo na vrijgave, of voor een platformbeheerder (de controle in Beheer).
 */
export function logoBesluit(v: { logo: Pick<Logo, "status" | "aanvraag"> & { versie?: number | undefined }; nr: LogoNr; beheerder: boolean; variant: VariantId; thema?: ThemaId | undefined }): LogoBesluit {
  if (v.beheerder || logoVrij(v.logo, v.nr)) {
    const maat = VARIANTEN[v.variant];
    return { watermerk: false, thema: null, variant: v.variant, breedte: maat.breedte, hoogte: maat.hoogte };
  }
  // het voorbeeld: bij versie 2 op de gevraagde ondergrond (dat is alleen een andere kleur van hetzelfde watermerkbeeld)
  return { watermerk: true, thema: v.logo.versie === 2 ? (v.thema ?? "donker") : null, variant: "kleur-wit", breedte: VOORBEELD.breedte, hoogte: VOORBEELD.hoogte };
}
