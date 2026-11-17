import { SHIFT_TEMPLATES } from "@/lib/shifts/catalogus";
import { ESCO_BEROEPEN, type EscoBeroep } from "@/lib/shifts/esco-beroepen";

// ---------------------------------------------------------------------------
// De naam van het beroep in de taal van de werker, uit de Europese beroepenlijst ESCO (lib/shifts/esco-beroepen.ts, gemaakt
// door scripts/esco-beroepen.mjs en met de hand nagelezen). Een klus heeft een vrije titel; die koppelen we alleen aan een
// beroep als er een vaste functie als los woord in staat ("Heftruckchauffeur zaterdag"). Liever geen naam dan een verkeerde.
// Puur: geen database.
// ---------------------------------------------------------------------------

const klein = (s: string) => s.toLowerCase().normalize("NFC").trim();

/**
 * Namen die te breed zijn om een beroep aan te hangen: "horeca" (uit het label "Bediening / horeca") is niet altijd een
 * ober, een "interieurverzorger" maakt vaak kantoren schoon (ESCO bedoelt bij mensen thuis), en "medewerker keuken" of
 * "medewerker huishoudelijke dienst" zegt te weinig.
 */
const TE_BREED = new Set(["horeca", "interieurverzorger", "medewerker keuken", "medewerker huishoudelijke dienst"]);

/** zoeknamen per functie: het label (en elk deel rond " / ") en de Nederlandse ESCO-naam; langste eerst */
const NAMEN: { key: string; naam: string }[] = SHIFT_TEMPLATES.filter((t) => Object.hasOwn(ESCO_BEROEPEN, t.key))
  .flatMap((t) => {
    const esco = ESCO_BEROEPEN[t.key];
    const delen = [t.label, ...t.label.split(" / "), ...(esco ? esco.nl.split("/") : [])];
    return [...new Set(delen.map(klein))].filter((n) => n.length >= 3 && !TE_BREED.has(n)).map((naam) => ({ key: t.key, naam }));
  })
  .sort((a, b) => b.naam.length - a.naam.length);

const LETTER = /[\p{L}\p{N}]/u;

/** staat `naam` als los woord (of woordgroep) in `tekst`? */
function losWoord(tekst: string, naam: string): boolean {
  let i = tekst.indexOf(naam);
  while (i !== -1) {
    const voor = i === 0 ? "" : tekst.charAt(i - 1);
    const na = tekst.charAt(i + naam.length);
    if (!LETTER.test(voor) && !LETTER.test(na)) return true;
    i = tekst.indexOf(naam, i + 1);
  }
  return false;
}

export function escoBeroepVoorTitel(titel: string): EscoBeroep | null {
  const t = klein(titel);
  for (const { key, naam } of NAMEN) if (losWoord(t, naam)) return ESCO_BEROEPEN[key] ?? null;
  return null;
}

/** De beroepsnaam in de taal van de werker, of null (Nederlands, een taal die ESCO niet heeft, of geen passend beroep). */
export function beroepInTaal(titel: string, locale: string): string | null {
  if (locale !== "en" && locale !== "pl" && locale !== "ro" && locale !== "uk") return null;
  const b = escoBeroepVoorTitel(titel);
  const naam = b?.[locale];
  // ESCO noemt soms beide vormen ("kasjer/kasjerka"); dat laten we zo staan
  return naam && klein(naam) !== klein(titel) ? naam : null;
}
