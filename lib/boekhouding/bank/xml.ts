// ---------------------------------------------------------------------------
// Bank: een kleine, veilige XML-lezer voor CAMT.053 (puur). Bewust zelf geschreven in plaats van een zware
// dependency: een afschrift is een gewoon element-boompje. Veilig omdat we niets uitvoeren of ophalen:
//  - een DOCTYPE of ENTITY wordt geweigerd (geen externe entiteiten, geen "billion laughs");
//  - alleen de vijf vaste entiteiten en tekencodes (&#...;) worden vertaald;
//  - namespace-voorvoegsels vallen weg ("ns2:Stmt" wordt "Stmt"), de diepte is begrensd.
// Een element is { naam, attrs, kinderen, tekst }; tekst is de samengevoegde tekst direct in het element.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";

export interface XmlElement {
  naam: string;
  attrs: Record<string, string>;
  kinderen: XmlElement[];
  tekst: string;
}

const MAX_DIEPTE = 64;
const MAX_ELEMENTEN = 2_000_000;

const ENTITEITEN: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function ontsnap(tekst: string): string {
  if (!tekst.includes("&")) return tekst;
  return tekst.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z]+);/g, (heel, naam: string) => {
    if (naam.startsWith("#x")) return codepunt(parseInt(naam.slice(2), 16), heel);
    if (naam.startsWith("#")) return codepunt(parseInt(naam.slice(1), 10), heel);
    return Object.hasOwn(ENTITEITEN, naam) ? (ENTITEITEN[naam] ?? heel) : heel;
  });
}

function codepunt(n: number, terug: string): string {
  if (!Number.isInteger(n) || n < 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return terug;
  return String.fromCodePoint(n);
}

function lokaleNaam(naam: string): string {
  const i = naam.indexOf(":");
  return i >= 0 ? naam.slice(i + 1) : naam;
}

function leesAttrs(tekst: string): Record<string, string> {
  const attrs: Record<string, string> = Object.create(null) as Record<string, string>;
  const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  for (const m of tekst.matchAll(re)) {
    const naam = lokaleNaam(m[1] ?? "");
    if (naam === "xmlns" || (m[1] ?? "").startsWith("xmlns")) continue;
    attrs[naam] = ontsnap(m[3] ?? m[4] ?? "");
  }
  return attrs;
}

/** Leest XML-tekst naar een boom (het hoofdelement). Gooit AppError.validation met een Nederlandse tekst. */
export function leesXml(bron: string): XmlElement {
  if (/<!DOCTYPE/i.test(bron) || /<!ENTITY/i.test(bron)) {
    throw AppError.validation(
      "Dit XML-bestand bevat een DOCTYPE of ENTITY-regel. Die nemen we om veiligheidsredenen niet aan; een echt bankafschrift heeft die niet.",
    );
  }
  const root: XmlElement = { naam: "#root", attrs: {}, kinderen: [], tekst: "" };
  const stapel: XmlElement[] = [root];
  let i = 0;
  let aantal = 0;
  const n = bron.length;
  while (i < n) {
    const lt = bron.indexOf("<", i);
    if (lt < 0) {
      const rest = bron.slice(i);
      if (rest.trim()) (stapel[stapel.length - 1] as XmlElement).tekst += ontsnap(rest);
      break;
    }
    if (lt > i) (stapel[stapel.length - 1] as XmlElement).tekst += ontsnap(bron.slice(i, lt));
    if (bron.startsWith("<!--", lt)) {
      const eind = bron.indexOf("-->", lt + 4);
      if (eind < 0) throw AppError.validation("Het XML-bestand is niet compleet (een opmerking is niet afgesloten).");
      i = eind + 3;
    } else if (bron.startsWith("<![CDATA[", lt)) {
      const eind = bron.indexOf("]]>", lt + 9);
      if (eind < 0) throw AppError.validation("Het XML-bestand is niet compleet (een CDATA-blok is niet afgesloten).");
      (stapel[stapel.length - 1] as XmlElement).tekst += bron.slice(lt + 9, eind);
      i = eind + 3;
    } else if (bron.startsWith("<?", lt)) {
      const eind = bron.indexOf("?>", lt + 2);
      if (eind < 0) throw AppError.validation("Het XML-bestand is niet compleet.");
      i = eind + 2;
    } else if (bron.startsWith("<!", lt)) {
      throw AppError.validation("Dit XML-bestand bevat een instructie die we niet aannemen.");
    } else {
      // Een tag: zoek het einde, buiten aanhalingstekens.
      let j = lt + 1;
      let aanhaling = "";
      while (j < n) {
        const c = bron[j] as string;
        if (aanhaling) {
          if (c === aanhaling) aanhaling = "";
        } else if (c === '"' || c === "'") aanhaling = c;
        else if (c === ">") break;
        j += 1;
      }
      if (j >= n) throw AppError.validation("Het XML-bestand is niet compleet (een tag is niet afgesloten).");
      const binnen = bron.slice(lt + 1, j);
      i = j + 1;
      if (binnen.startsWith("/")) {
        const naam = lokaleNaam(binnen.slice(1).trim());
        const open = stapel.pop();
        if (!open || stapel.length === 0 || open.naam !== naam) {
          throw AppError.validation("Het XML-bestand klopt niet: een tag wordt niet goed gesloten.");
        }
      } else {
        const zelfSluitend = binnen.endsWith("/");
        const inhoud = zelfSluitend ? binnen.slice(0, -1) : binnen;
        const spatie = inhoud.search(/\s/);
        const ruweNaam = spatie < 0 ? inhoud : inhoud.slice(0, spatie);
        if (!ruweNaam) throw AppError.validation("Het XML-bestand klopt niet: een tag heeft geen naam.");
        aantal += 1;
        if (aantal > MAX_ELEMENTEN) throw AppError.validation("Het XML-bestand is te groot of te ingewikkeld.");
        const el: XmlElement = {
          naam: lokaleNaam(ruweNaam),
          attrs: spatie < 0 ? {} : leesAttrs(inhoud.slice(spatie)),
          kinderen: [],
          tekst: "",
        };
        (stapel[stapel.length - 1] as XmlElement).kinderen.push(el);
        if (!zelfSluitend) {
          if (stapel.length > MAX_DIEPTE) throw AppError.validation("Het XML-bestand is te diep genest.");
          stapel.push(el);
        }
      }
    }
  }
  if (stapel.length !== 1) throw AppError.validation("Het XML-bestand is niet compleet: er ontbreekt een sluitende tag.");
  const hoofd = root.kinderen[0];
  if (!hoofd) throw AppError.validation("Het XML-bestand is leeg.");
  return hoofd;
}

/** Het eerste kind met deze naam. */
export function kind(el: XmlElement | undefined, naam: string): XmlElement | undefined {
  return el?.kinderen.find((k) => k.naam === naam);
}

/** Alle kinderen met deze naam. */
export function kinderen(el: XmlElement | undefined, naam: string): XmlElement[] {
  return el ? el.kinderen.filter((k) => k.naam === naam) : [];
}

/** Het element langs een pad van namen ("Dbtr/Pty/Nm"). */
export function pad(el: XmlElement | undefined, route: string): XmlElement | undefined {
  let huidig = el;
  for (const stap of route.split("/")) {
    huidig = kind(huidig, stap);
    if (!huidig) return undefined;
  }
  return huidig;
}

/** De opgeschoonde tekst van het element langs een pad, of null. */
export function tekstOp(el: XmlElement | undefined, route: string): string | null {
  const t = pad(el, route)?.tekst.trim();
  return t ? t : null;
}
