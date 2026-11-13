// ---------------------------------------------------------------------------
// @vermeldingen in een groepsgesprek, zoals WhatsApp (13 nov 2026). Puur: voor de invoer (Composer), de bubbel en de
// server. In de tekst staat gewoon "@Naam"; het bericht onthoudt daarnaast wie er genoemd is (`mentions`, userIds), zodat
// een naam die toevallig in een zin staat geen melding geeft. Geen lookbehind in deze regexen (Safari < 16.4).
// ---------------------------------------------------------------------------

export interface Lid {
  userId: string;
  name: string;
}

/** Hooguit zoveel mensen noemen in één bericht. */
export const VERMELDING_MAX = 20;

/** Het "@…" vlak voor de cursor (zonder spatie erin), of null: dan staat er geen lijst open. */
export function vermeldingVraag(tekst: string, cursor: number): { start: number; vraag: string } | null {
  const voor = tekst.slice(0, Math.max(0, cursor));
  const m = /(^|\s)@([^\s@]{0,30})$/.exec(voor);
  if (!m) return null;
  const vraag = m[2] ?? "";
  return { start: voor.length - vraag.length - 1, vraag };
}

const klein = (s: string) => s.toLocaleLowerCase("nl-NL");

/** Wie past bij wat je na @ typte: eerst wie ermee begint (voor- of achternaam), dan wie het ergens bevat. */
export function kandidaten(leden: Lid[], vraag: string, max = 6): Lid[] {
  const q = klein(vraag.trim());
  if (!q) return leden.slice(0, max);
  const begin = leden.filter((l) => klein(l.name).split(/\s+/).some((w) => w.startsWith(q)));
  const rest = leden.filter((l) => !begin.includes(l) && klein(l.name).includes(q));
  return [...begin, ...rest].slice(0, max);
}

/** Zet "@Naam " op de plek van het "@…" dat je aan het typen was; geeft de nieuwe tekst en de cursor erachter. */
export function vulVermeldingIn(tekst: string, start: number, cursor: number, naam: string): { tekst: string; cursor: number } {
  const invoeg = `@${naam} `;
  const na = tekst.slice(cursor).replace(/^\s+/, "");
  return { tekst: tekst.slice(0, start) + invoeg + na, cursor: start + invoeg.length };
}

/** Wie er bij het versturen nog echt genoemd wordt: gekozen én "@Naam" staat nog in de tekst. */
export function vermeldingenIn(tekst: string, gekozen: Lid[]): string[] {
  const ids = gekozen.filter((l) => l.name && tekst.includes(`@${l.name}`)).map((l) => l.userId);
  return [...new Set(ids)].slice(0, VERMELDING_MAX);
}

/** De server: alleen leden van het gesprek, niet jezelf, elk één keer. */
export function geldigeVermeldingen(mentions: readonly string[] | undefined, deelnemers: readonly string[], afzender: string): string[] {
  if (!mentions?.length) return [];
  const mag = new Set(deelnemers.filter((id) => id !== afzender));
  return [...new Set(mentions.filter((id) => mag.has(id)))].slice(0, VERMELDING_MAX);
}

/** De tekst in stukken, waarbij elk "@Naam" van een genoemde persoon een eigen stuk is (de bubbel kleurt die). */
export function vermeldingDelen(tekst: string, namen: readonly string[]): Array<{ tekst: string; vermelding: boolean }> {
  const geldig = [...new Set(namen.filter(Boolean))].sort((a, b) => b.length - a.length); // "Jan de Vries" vóór "Jan"
  if (!geldig.length || !tekst.includes("@")) return [{ tekst, vermelding: false }];
  const uit: Array<{ tekst: string; vermelding: boolean }> = [];
  let i = 0;
  let los = "";
  while (i < tekst.length) {
    const naam = tekst[i] === "@" ? geldig.find((n) => tekst.startsWith(`@${n}`, i)) : undefined;
    if (naam) {
      if (los) uit.push({ tekst: los, vermelding: false });
      los = "";
      uit.push({ tekst: `@${naam}`, vermelding: true });
      i += naam.length + 1;
    } else {
      los += tekst[i];
      i++;
    }
  }
  if (los) uit.push({ tekst: los, vermelding: false });
  return uit;
}
