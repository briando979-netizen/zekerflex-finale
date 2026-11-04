import { klok, plusDagen, weekdag } from "@/lib/voorstel/schwarzwald-agenda";

// ---------------------------------------------------------------------------
// "Nu open tot 22:30" en de openingstijden in de footer, uit de tijden die de
// beheerder instelt (Beheer → Openingstijden) in plaats van een vaste lijst.
// Puur: de pagina geeft de Amsterdamse datum en minuut van nu mee, zodat het
// los te testen is en server en browser niets zelf uitrekenen.
// ---------------------------------------------------------------------------

export interface OpenTijden {
  /** weekdag (0 = zondag) -> open van/tot in minuten, null = dicht */
  open: Record<number, { van: number; tot: number } | null>;
  /** extra gesloten datums */
  gesloten: string[];
}

const DAGEN = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const dagNaam = (wd: number) => DAGEN[wd] ?? "";
const hoofdletter = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function tijdenOp(datum: string, t: OpenTijden) {
  if (t.gesloten.includes(datum)) return null;
  return t.open[weekdag(datum)] ?? null;
}

/** Korte status voor bezoekers, op basis van de Amsterdamse datum en minuut van nu. */
export function openStatus(datum: string, minuut: number, t: OpenTijden): { open: boolean; tekst: string } {
  const vandaag = tijdenOp(datum, t);
  if (vandaag && minuut < vandaag.tot) {
    if (minuut >= vandaag.van) return { open: true, tekst: `Nu open tot ${klok(vandaag.tot)}` };
    return { open: false, tekst: `Vandaag open vanaf ${klok(vandaag.van)}` };
  }
  for (let n = 1; n <= 14; n++) {
    const dag = plusDagen(datum, n);
    const tijden = tijdenOp(dag, t);
    if (!tijden) continue;
    // binnen een week is de weekdag duidelijk; verder weg de datum zelf
    const wanneer =
      n === 1
        ? "morgen"
        : n < 7
          ? dagNaam(weekdag(dag))
          : `op ${new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${dag}T12:00:00Z`))}`;
    return { open: false, tekst: `Nu gesloten · ${wanneer} open vanaf ${klok(tijden.van)}` };
  }
  return { open: false, tekst: "Tijdelijk gesloten" };
}

/**
 * De openingstijden als regels voor de footer, maandag eerst, opeenvolgende
 * dagen met dezelfde tijden samen: "Woensdag t/m vrijdag" · "13:00 – 22:30".
 */
export function openingsRegels(open: OpenTijden["open"]): { dagen: string; tijd: string }[] {
  const volgorde = [1, 2, 3, 4, 5, 6, 0];
  const groepen: { dagen: number[]; van: number; tot: number }[] = [];
  let vorige: number | null = null;
  for (const wd of volgorde) {
    const tijden = open[wd] ?? null;
    if (!tijden) {
      vorige = null;
      continue;
    }
    const laatste = groepen.at(-1);
    if (laatste && vorige !== null && laatste.van === tijden.van && laatste.tot === tijden.tot) laatste.dagen.push(wd);
    else groepen.push({ dagen: [wd], van: tijden.van, tot: tijden.tot });
    vorige = wd;
  }
  return groepen.map((g) => {
    const eerste = dagNaam(g.dagen[0] ?? 0);
    const laatste = dagNaam(g.dagen.at(-1) ?? 0);
    const dagen = g.dagen.length === 1 ? eerste : g.dagen.length === 2 ? `${eerste} en ${laatste}` : `${eerste} t/m ${laatste}`;
    return { dagen: hoofdletter(dagen), tijd: `${klok(g.van)} – ${klok(g.tot)}` };
  });
}
