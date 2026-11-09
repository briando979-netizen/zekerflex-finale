import { amsterdamParts } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Verwachte drukte in de roosterplanner: per dag van de gekozen week hoeveel
// plekken dit bedrijf gewoonlijk nodig heeft (gemiddelde per weekdag over de
// weken ervoor, max. 8) naast wat er al geplaatst is. Geen voorspelling uit de
// lucht: alleen de eigen diensten, en bij te weinig historie geen getal.
// Puur bestand (ook voor de browser), in Nederlandse tijd.
// ---------------------------------------------------------------------------

export const DRUKTE_WEKEN = 8;
/** Onder deze grens is een gemiddelde niet zinvol. */
const MIN_WEKEN = 2;
const MIN_DIENSTEN = 4;

export interface DrukteDag {
  /** YYYY-MM-DD, Nederlandse datum */
  datum: string;
  /** 0 = maandag … 6 = zondag */
  weekdag: number;
  /** gemiddeld aantal plekken op deze weekdag, 1 decimaal */
  verwacht: number;
  /** plekken in diensten die deze dag al geplaatst zijn */
  geplaatst: number;
}

export interface WeekDrukte {
  /** over hoeveel weken het gemiddelde gaat */
  weken: number;
  dagen: DrukteDag[];
}

export interface DrukteDienst {
  start: Date;
  plekken: number;
}

const dagNummer = (d: Date): { nr: number; weekdag: number; sleutel: string } => {
  const p = amsterdamParts(d);
  const nr = Math.round(Date.UTC(p.year, p.month - 1, p.day) / 86_400_000);
  const sleutel = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  return { nr, weekdag: (p.weekday + 6) % 7, sleutel };
};

const rond1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Drukte voor de week die op `van` begint (maandag 00:00 NL, zie planWeek).
 * `diensten` = alle eigen diensten van de weken ervoor én van die week zelf
 * (zonder concepten en geannuleerde). Null als er te weinig historie is.
 */
export function berekenDrukte(diensten: DrukteDienst[], van: Date): WeekDrukte | null {
  const maandag = dagNummer(van).nr;
  const perWeekdag = [0, 0, 0, 0, 0, 0, 0];
  const geplaatst = [0, 0, 0, 0, 0, 0, 0];
  let oudsteWeek = -1;
  let aantal = 0;

  for (const d of diensten) {
    const dag = dagNummer(d.start);
    const plekken = Math.max(0, d.plekken);
    const verschil = maandag - dag.nr;
    if (verschil <= 0 && verschil > -7) {
      geplaatst[dag.weekdag] = (geplaatst[dag.weekdag] ?? 0) + plekken;
    } else if (verschil > 0 && verschil <= DRUKTE_WEKEN * 7) {
      perWeekdag[dag.weekdag] = (perWeekdag[dag.weekdag] ?? 0) + plekken;
      oudsteWeek = Math.max(oudsteWeek, Math.floor((verschil - 1) / 7));
      aantal++;
    }
  }

  // Delen door het aantal weken sinds de oudste dienst (ook lege weken tellen
  // mee), anders lijkt een bedrijf dat één keer per maand plaatst elke week druk.
  const weken = oudsteWeek + 1;
  if (weken < MIN_WEKEN || aantal < MIN_DIENSTEN) return null;

  const dagen: DrukteDag[] = [];
  for (let i = 0; i < 7; i++) {
    // middag van die dag, zodat zomer-/wintertijd de datum niet verschuift
    const sleutel = dagNummer(new Date(van.getTime() + i * 86_400_000 + 12 * 3_600_000)).sleutel;
    dagen.push({ datum: sleutel, weekdag: i, verwacht: rond1((perWeekdag[i] ?? 0) / weken), geplaatst: geplaatst[i] ?? 0 });
  }
  return { weken, dagen };
}

/** Moet de werkgever er nog plekken bij zetten? Pas vanaf een halve plek verschil. */
export function teWeinigGeplaatst(dag: DrukteDag): boolean {
  return dag.verwacht - dag.geplaatst >= 0.5;
}
