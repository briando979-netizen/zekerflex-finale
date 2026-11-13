import { BLOCK_LABELS, newBlock, type BlockType, type Page, type Theme } from "@/lib/sites/types";
import { MAX_PAGINAS, nieuweSlug } from "@/lib/sites/paginabouwer";

// ---------------------------------------------------------------------------
// De assistent in de bouwer (13 nov 2026, eigenaar: "een assistent in het scherm, zoals de grote websitebouwers"). Je typt
// of spreekt een opdracht in gewone woorden en de site verandert meteen: de kleur, de hoeken, het lettertype, de stijl, een
// blok erbij of een nieuwe pagina. Bewust zonder AI: het antwoord staat er direct, kost niets, en de assistent doet alleen
// dingen die de bouwer zelf ook kan (dezelfde blokken, dezelfde grenzen). Wat hij niet begrijpt zegt hij eerlijk.
// Puur bestand, ook voor de browser (geen lookbehind in een regex: tests/regex-safari.test.ts).
// ---------------------------------------------------------------------------

export interface AssistentDoc {
  theme: Theme;
  pages: Page[];
}

export interface AssistentUitkomst {
  doc: AssistentDoc;
  /** wat er veranderd is, in gewone zinnen */
  gedaan: string[];
  /** de stukken van de opdracht die niet begrepen of niet mogelijk waren */
  nietGedaan: string[];
}

/** Hoogstens zoveel blokken op één pagina (lib/sites/schema.ts). */
export const MAX_BLOKKEN = 30;

// Kleuren die als hoofdkleur werken: donker genoeg voor witte tekst erop. De langste naam eerst ("donkerblauw" vóór "blauw").
const KLEUREN: readonly (readonly [string, string])[] = [
  ["donkerblauw", "#14325A"],
  ["lichtblauw", "#2B7BBB"],
  ["donkergroen", "#0B3D2E"],
  ["donkerrood", "#6E1423"],
  ["antraciet", "#26313A"],
  ["turquoise", "#2F6F73"],
  ["bordeaux", "#6E1423"],
  ["blauw", "#1D4E89"],
  ["groen", "#0E5C4A"],
  ["rood", "#9B1D3A"],
  ["zwart", "#1A1A1A"],
  ["grijs", "#4A5560"],
  ["paars", "#4B2A6B"],
  ["roze", "#B83268"],
  ["oranje", "#C2571A"],
  ["bruin", "#6B4226"],
  ["goud", "#F2B544"],
  ["geel", "#F2B544"],
];
/** Te licht voor witte tekst: die kleuren worden de accentkleur. */
const ALLEEN_ACCENT = new Set(["#F2B544"]);

// Woorden voor een blok; het eerste lijstje dat past telt, dus het meest precieze staat bovenaan.
const BLOKKEN: readonly (readonly [BlockType, readonly string[]])[] = [
  ["tekstFoto", ["tekst met foto", "tekst met een foto", "foto met tekst"]],
  ["openingstijden", ["openingstijd", "openingsuren", "wanneer we open"]],
  ["faq", ["veelgestelde vragen", "faq", "vragen en antwoorden"]],
  ["reviews", ["review", "ervaringen", "beoordelingen"]],
  ["galerij", ["galerij", "fotogalerij", "foto's", "fotos"]],
  ["contact", ["contactformulier", "formulier", "contact"]],
  ["prijzen", ["prijslijst", "prijzen", "pakketten", "tarieven"]],
  ["team", ["team", "medewerkers", "collega"]],
  ["kaart", ["kaart", "route", "adres"]],
  ["video", ["video", "filmpje"]],
  ["diensten", ["diensten", "wat we doen"]],
  ["stappen", ["stappen", "zo werkt het"]],
  ["usps", ["voordelen", "waarom wij"]],
  ["cijfers", ["cijfers", "getallen"]],
  ["logos", ["logo's", "logos", "partners"]],
  ["afbeelding", ["afbeelding", "plaatje", "foto"]],
  ["scheiding", ["scheiding", "scheidingslijn", "lijn", "witruimte"]],
  ["knoppen", ["knoppen", "knop"]],
  ["cta", ["oproep"]],
  ["tekst", ["tekst", "alinea", "verhaal"]],
];

const STIJLEN: readonly (readonly [NonNullable<Theme["stijl"]>, readonly string[], string])[] = [
  ["diepte", ["3d", "diepte"], "3D"],
  ["luxe", ["luxe", "chique", "sjiek"], "Luxe"],
  ["beleving", ["beleving"], "Beleving"],
  ["premium", ["premium"], "Premium"],
  ["standaard", ["eenvoudig", "simpel", "rustig", "standaard"], "Eenvoudig"],
];

const kaal = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const heeft = (zin: string, woorden: readonly string[]) => woorden.some((w) => zin.includes(w));

/** Een opdracht in stukken: per zin, en bij "en" vóór een nieuw werkwoord ("maak … en voeg … toe"). */
function stukken(tekst: string): string[] {
  return tekst
    .slice(0, 600)
    .split(/[.;!\n]+|,\s*(?=(?:maak|voeg|zet|gebruik|kies|verander|plaats|hernoem|noem|verwijder|haal|wis|verplaats|schuif)\b)|\s+en\s+(?=(?:maak|voeg|zet|gebruik|kies|verander|plaats|hernoem|noem|verwijder|haal|wis|verplaats|schuif)\b)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

function paginaTitel(stuk: string): string | null {
  const m = /(?:voeg|maak|zet)\s+(?:er\s+)?(?:een\s+|de\s+)?(?:nieuwe\s+)?pagina\s+(.+)$/i.exec(stuk);
  if (!m?.[1]) return null;
  const titel = m[1]
    .replace(/^(?:toe\s+)?(?:met de naam|met als naam|genaamd|die heet)\s+/i, "")
    .replace(/\s+(?:toe|aan|erbij)$/i, "")
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "")
    .slice(0, 60)
    .trim();
  if (titel.length < 2 || /^(?:toe|aan|erbij)$/i.test(titel)) return null;
  return titel.charAt(0).toUpperCase() + titel.slice(1);
}

/**
 * Voert een opdracht uit op de site. `paginaId` is de pagina die open staat (daar komen nieuwe blokken); `maakId` maakt een
 * nieuw id met het gegeven voorvoegsel, zoals de bouwer dat zelf doet. Verandert de invoer niet.
 */
export function voerOpdrachtUit(tekst: string, doc: AssistentDoc, paginaId: string, bedrijfNaam: string, maakId: (voorvoegsel: string) => string): AssistentUitkomst {
  let theme: Theme = { ...doc.theme };
  let pages: Page[] = doc.pages;
  const gedaan: string[] = [];
  const nietGedaan: string[] = [];
  const doel = pages.some((p) => p.id === paginaId) ? paginaId : (pages[0]?.id ?? "");

  for (const stuk of stukken(tekst)) {
    const zin = kaal(stuk);
    const voegtToe = /(?:^|\s)(?:voeg|plaats|zet|maak)(?:\s|$)/.test(zin);

    // 1. een nieuwe pagina
    if (/(?:^|\s)pagina(?:\s|$)/.test(zin) && voegtToe) {
      const titel = paginaTitel(stuk);
      if (!titel) {
        nietGedaan.push(`"${stuk}": zeg er de naam van de pagina bij, bijvoorbeeld "maak een pagina Over ons".`);
        continue;
      }
      if (pages.length >= MAX_PAGINAS) {
        nietGedaan.push(`De pagina ${titel} is niet gemaakt: er zijn al ${MAX_PAGINAS} pagina's, dat is het meeste.`);
        continue;
      }
      const pagina: Page = { id: maakId("p"), slug: nieuweSlug(titel, pages.map((p) => p.slug)), titel, seoTitel: `${titel} | ${bedrijfNaam}`.slice(0, 70), seoOmschrijving: "", blocks: [newBlock("tekst", maakId("b"))] };
      pages = [...pages, pagina];
      gedaan.push(`De pagina ${titel} is toegevoegd. Je vindt hem bij Pagina's.`);
      continue;
    }

    // 1b. de pagina die open staat een andere naam geven (het adres van de pagina blijft, dus links blijven werken)
    const naamRuw = /(?:^|\s)(?:hernoem|noem)\s+(?:de\s+|deze\s+)?pagina\s+(?:om\s+)?(?:naar\s+|in\s+)?(.+)$/i.exec(stuk)?.[1];
    if (naamRuw !== undefined) {
      const naam = naamRuw.replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "").slice(0, 60).trim();
      const pagina = pages.find((p) => p.id === doel);
      // alleen het voorzetsel ("hernoem de pagina naar") is geen naam
      if (!pagina || naam.length < 2 || /^(?:naar|in|om)$/i.test(naam)) {
        nietGedaan.push(`"${stuk}": zeg er de nieuwe naam bij, bijvoorbeeld "hernoem de pagina naar Ons verhaal".`);
        continue;
      }
      const titel = naam.charAt(0).toUpperCase() + naam.slice(1);
      pages = pages.map((p) => (p.id === doel ? { ...p, titel } : p));
      gedaan.push(`De pagina ${pagina.titel} heet nu ${titel}. Het adres van de pagina blijft hetzelfde.`);
      continue;
    }

    // 1c. een blok weghalen of verplaatsen op de pagina die open staat
    const wilWeg = /(?:^|\s)(?:verwijder|wis)(?:\s|$)/.test(zin) || (/(?:^|\s)haal(?:\s|$)/.test(zin) && /(?:^|\s)(?:weg|eraf|eruit)(?:\s|$)/.test(zin));
    const richting = /bovenaan|helemaal naar boven/.test(zin) ? "boven" : /onderaan|helemaal naar beneden/.test(zin) ? "onder" : /omhoog|naar boven/.test(zin) ? "op" : /omlaag|naar beneden/.test(zin) ? "neer" : null;
    const wilVerplaatsen = richting !== null && /(?:^|\s)(?:zet|verplaats|schuif|plaats)(?:\s|$)/.test(zin);
    if (wilWeg || wilVerplaatsen) {
      const soort = BLOKKEN.find(([, woorden]) => heeft(zin, woorden));
      const pagina = pages.find((p) => p.id === doel);
      if (!soort || !pagina) {
        nietGedaan.push(`"${stuk}": zeg erbij welk blok je bedoelt, bijvoorbeeld "${wilWeg ? "verwijder de openingstijden" : "zet de openingstijden bovenaan"}".`);
        continue;
      }
      const label = BLOCK_LABELS[soort[0]];
      // het laatste blok van die soort: meestal het blok dat net is toegevoegd
      let plek = -1;
      pagina.blocks.forEach((b, i) => {
        if (b.type === soort[0]) plek = i;
      });
      const blok = pagina.blocks[plek];
      if (!blok) {
        nietGedaan.push(`Op de pagina ${pagina.titel} staat geen blok "${label}".`);
        continue;
      }
      if (wilWeg) {
        if (pagina.blocks.length <= 1) {
          nietGedaan.push(`Het blok "${label}" is het enige blok op deze pagina en blijft dus staan.`);
          continue;
        }
        pages = pages.map((p) => (p.id === doel ? { ...p, blocks: p.blocks.filter((_, i) => i !== plek) } : p));
        gedaan.push(`Het blok "${label}" is van de pagina ${pagina.titel} gehaald. Met Maak ongedaan zet je het terug.`);
        continue;
      }
      const laatste = pagina.blocks.length - 1;
      const naar = richting === "boven" ? 0 : richting === "onder" ? laatste : richting === "op" ? Math.max(0, plek - 1) : Math.min(laatste, plek + 1);
      if (naar === plek) {
        nietGedaan.push(`Het blok "${label}" staat daar al.`);
        continue;
      }
      const rest = pagina.blocks.filter((_, i) => i !== plek);
      const blokken = [...rest.slice(0, naar), blok, ...rest.slice(naar)];
      pages = pages.map((p) => (p.id === doel ? { ...p, blocks: blokken } : p));
      gedaan.push(`Het blok "${label}" staat nu ${naar === 0 ? "bovenaan" : naar === laatste ? "onderaan" : naar < plek ? "een plek hoger" : "een plek lager"} op de pagina ${pagina.titel}.`);
      continue;
    }

    // 2. een blok erbij op de pagina die open staat
    // "maak de knoppen oranje" gaat over de kleur, niet over een blok met knoppen: een kleur in de zin telt als uiterlijk,
    // tenzij er echt "toe", "erbij" of "blok" staat
    const noemtKleur = /#[0-9a-f]{6}/.test(zin) || KLEUREN.some(([n]) => zin.includes(n));
    const wilErbij = /(?:^|\s)(?:toe|erbij|blok)(?:\s|$)/.test(zin);
    const overUiterlijk = /(?:^|\s)(?:kleur|hoeken|lettertype|letters|stijl)(?:\s|$)/.test(zin) || (noemtKleur && !wilErbij);
    const blok = voegtToe && !overUiterlijk ? BLOKKEN.find(([, woorden]) => heeft(zin, woorden)) : undefined;
    if (blok) {
      const pagina = pages.find((p) => p.id === doel);
      if (!pagina) {
        nietGedaan.push(`"${stuk}": er is geen pagina om het blok op te zetten.`);
        continue;
      }
      if (pagina.blocks.length >= MAX_BLOKKEN) {
        nietGedaan.push(`Het blok ${BLOCK_LABELS[blok[0]]} is niet toegevoegd: op deze pagina staan al ${MAX_BLOKKEN} blokken, dat is het meeste.`);
        continue;
      }
      const nieuw = newBlock(blok[0], maakId("b"));
      pages = pages.map((p) => (p.id === doel ? { ...p, blocks: [...p.blocks, nieuw] } : p));
      gedaan.push(`Het blok "${BLOCK_LABELS[blok[0]]}" staat onderaan de pagina ${pagina.titel}. Klik erop om de tekst aan te passen.`);
      continue;
    }

    // 3. het uiterlijk: hoeken, lettertype, stijl en kleur mogen samen in één zin ("ronde hoeken en een klassiek lettertype")
    let uiterlijk = false;
    if (zin.includes("hoek")) {
      const rond = /rond|afgerond/.test(zin);
      const strak = /strak|recht|vierkant|scherp/.test(zin);
      if (rond !== strak) {
        theme = { ...theme, hoeken: rond ? "rond" : "strak" };
        gedaan.push(rond ? "De hoeken zijn nu rond." : "De hoeken zijn nu strak.");
        uiterlijk = true;
      }
    }
    if (/letter|font/.test(zin)) {
      const keuze = /klassiek|sierlijk|schreef/.test(zin) ? "klassiek" : /vriendelijk|speels/.test(zin) ? "vriendelijk" : /modern|zakelijk/.test(zin) ? "modern" : null;
      if (keuze) {
        theme = { ...theme, lettertype: keuze };
        gedaan.push(`Het lettertype is nu ${keuze}.`);
        uiterlijk = true;
      }
    }
    if (/stijl|uitstraling|uiterlijk/.test(zin)) {
      const stijl = STIJLEN.find(([, woorden]) => heeft(zin, woorden));
      if (stijl) {
        theme = { ...theme, stijl: stijl[0] };
        gedaan.push(`De stijl is nu ${stijl[2]}.`);
        uiterlijk = true;
      }
    }
    // een kleur: een naam of een code met een hekje
    const code = /#[0-9a-f]{6}(?![0-9a-f])/i.exec(stuk)?.[0];
    const naam = KLEUREN.find(([n]) => zin.includes(n));
    const hex = code ?? naam?.[1];
    if (hex) {
      const alsAccent = /accent|knop/.test(zin) || (!code && ALLEEN_ACCENT.has(hex));
      theme = alsAccent ? { ...theme, accent: hex.toUpperCase() } : { ...theme, kleur: hex.toUpperCase() };
      const hoe = naam && !code ? naam[0] : hex.toUpperCase();
      gedaan.push(alsAccent ? `De accentkleur (knoppen en details) is nu ${hoe}.` : `De hoofdkleur is nu ${hoe}.`);
      uiterlijk = true;
    }
    if (uiterlijk) continue;

    nietGedaan.push(`"${stuk}": dat begrijp ik nog niet.`);
  }

  return { doc: { theme, pages }, gedaan, nietGedaan };
}

/** Voorbeelden onder het invoerveld. */
export const ASSISTENT_VOORBEELDEN = ["Maak de kleur donkerblauw", "Voeg openingstijden toe", "Zet de openingstijden bovenaan", "Maak een pagina Over ons", "Ronde hoeken en een klassiek lettertype"] as const;
