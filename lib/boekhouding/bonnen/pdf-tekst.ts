// ---------------------------------------------------------------------------
// Bonnen: de tekstlaag van een pdf (puur, alleen node:zlib). Veel facturen zijn pdf's met echte tekst: die lezen we
// direct, zonder OCR. Dit is een bescheiden lezer: platte en Flate-gecomprimeerde inhoudsstromen met gewone
// tekstoperatoren (Tj/TJ) en lettertypes met een standaardcodering. Een pdf met een eigen lettercodering (veel
// gegenereerde facturen) of alleen een scan levert geen leesbare tekst: dan zegt `heeftLeesbareTekst` nee en gaat de
// bon naar "even kijken". We rasteren geen pdf naar een beeld; alleen beelden gaan door de OCR.
// ---------------------------------------------------------------------------

import { inflateSync } from "node:zlib";

const MAX_TEKST = 200_000;

function ontsnapPdfTekst(s: string): string {
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (_m, c: string) => {
    switch (c) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "(":
      case ")":
      case "\\":
        return c;
      default:
        return /^[0-7]+$/.test(c) ? String.fromCharCode(parseInt(c, 8)) : "";
    }
  });
}

/** Tekst uit een inhoudsstroom: de tekens tussen haakjes bij Tj en TJ, per tekstblok (BT...ET). */
function tekstUitStroom(stroom: string): string {
  const uit: string[] = [];
  for (const blok of stroom.matchAll(/BT([\s\S]*?)ET/g)) {
    const inhoud = blok[1] ?? "";
    let regel = "";
    for (const m of inhoud.matchAll(/\(((?:\\.|[^\\()])*)\)\s*(?:Tj|'|")|\[((?:\\.|[^\]\\])*)\]\s*TJ|(T\*|Td|TD|Tm)/g)) {
      if (m[1] !== undefined) {
        regel += ontsnapPdfTekst(m[1]);
      } else if (m[2] !== undefined) {
        for (const d of m[2].matchAll(/\(((?:\\.|[^\\()])*)\)|(-?\d+(?:\.\d+)?)/g)) {
          if (d[1] !== undefined) regel += ontsnapPdfTekst(d[1]);
          else if (d[2] !== undefined && Number(d[2]) < -200) regel += " "; // een grote verschuiving is een spatie
        }
      } else if (m[3] !== undefined && regel) {
        uit.push(regel);
        regel = "";
      }
    }
    if (regel) uit.push(regel);
  }
  return uit.join("\n");
}

/** Haalt de leesbare tekst uit een pdf (leeg als er geen is). */
export function pdfTekst(bytes: Buffer): string {
  const bron = bytes.toString("latin1");
  const delen: string[] = [];
  let totaal = 0;
  for (const m of bron.matchAll(/stream\r?\n/g)) {
    if (bron.slice(Math.max(0, (m.index ?? 0) - 3), m.index ?? 0) === "end") continue; // "endstream" zelf
    const start = (m.index ?? 0) + m[0].length;
    const eind = bron.indexOf("endstream", start);
    if (eind < 0) continue;
    const woordenboek = bron.slice(Math.max(0, (m.index ?? 0) - 400), m.index ?? 0);
    const dict = woordenboek.slice(woordenboek.lastIndexOf("<<"));
    let stroom = bron.slice(start, eind).replace(/\r?\n$/, "");
    if (/\/Filter\s*(?:\[\s*)?\/FlateDecode/.test(dict)) {
      try {
        stroom = inflateSync(Buffer.from(stroom, "latin1")).toString("latin1");
      } catch {
        continue;
      }
    } else if (/\/Filter/.test(dict)) {
      continue; // een ander filter (beeld, ASCII85, ...): niet ons werk
    }
    if (!stroom.includes("BT")) continue;
    const t = tekstUitStroom(stroom);
    if (t) {
      delen.push(t);
      totaal += t.length;
      if (totaal > MAX_TEKST) break;
    }
  }
  return delen.join("\n").slice(0, MAX_TEKST);
}

/** Is dit echte, leesbare tekst (en geen rommel van een eigen lettercodering)? */
export function heeftLeesbareTekst(tekst: string): boolean {
  const t = tekst.replace(/\s+/g, " ").trim();
  if (t.length < 30) return false;
  const leesbaar = (t.match(/[A-Za-z0-9.,:;€%\-/()@ ]/g) ?? []).length;
  const woorden = (t.match(/[A-Za-z]{3,}/g) ?? []).length;
  return leesbaar / t.length >= 0.85 && woorden >= 5;
}
