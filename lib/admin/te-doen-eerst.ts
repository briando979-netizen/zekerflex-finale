import { amsterdamDayKey } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Beheer -> Te doen, blok "Begin hier": van de vele taken de paar die echt niet kunnen wachten. Een taak met `eerst`
// blokkeert iets: geld dat niet binnenkomt, gegevens die kwijt kunnen raken, een wettelijke termijn of mail die niet aankomt.
// Pure kern (geen prisma of kv, alleen lib/time/amsterdam.ts), zodat het scherm en de test hem kunnen gebruiken.
// ---------------------------------------------------------------------------

export type EerstReden = "geld binnen" | "gegevens kwijt" | "wettelijk" | "bezorging";

export interface Eerst {
  reden: EerstReden;
  /** uiterste datum, ISO (JJJJ-MM-DD), alleen als die echt vastligt (in de taak of de projectnotities) */
  uiterlijk?: string | undefined;
}

/** Het minimum dat het blok van een taak nodig heeft; de taken van Te doen passen er direct op. */
export interface EerstTodo {
  id: string;
  title: string;
  why: string;
  how: string[];
  done: boolean;
  eerst?: Eerst | undefined;
}

export const MAX_BEGIN_HIER = 5;

/** De volgorde van de redenen bij gelijke datum: wettelijk gaat voor gegevens kwijt, dan geld binnen, dan bezorging. */
export const REDEN_VOLGORDE: EerstReden[] = ["wettelijk", "gegevens kwijt", "geld binnen", "bezorging"];

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

/** Het dagnummer van een ISO-datum (JJJJ-MM-DD), of null als het geen echte datum is. */
function dagNummer(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [j, mnd, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(j, mnd - 1, d);
  const terug = new Date(ms);
  // 2026-02-31 bestaat niet: Date schuift door naar maart, dus de onderdelen moeten terugkomen
  if (terug.getUTCFullYear() !== j || terug.getUTCMonth() !== mnd - 1 || terug.getUTCDate() !== d) return null;
  return ms / 86_400_000;
}

/** Is dit een echte kalenderdatum in de vorm JJJJ-MM-DD? */
export function geldigeDatum(iso: string): boolean {
  return dagNummer(iso) !== null;
}

/** "31 december 2026". */
export function datumNl(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m || !geldigeDatum(iso)) return iso;
  return `${Number(m[3])} ${MAANDEN[Number(m[2]) - 1] ?? ""} ${m[1]}`;
}

export interface BeginHierItem<T extends EerstTodo> {
  todo: T;
  reden: EerstReden;
  uiterlijk: string | null;
  /** de uiterste datum is al voorbij (de taak blijft bovenaan staan) */
  verlopen: boolean;
  /** dagen tot de uiterste datum (0 = vandaag, negatief = verlopen); null zonder datum */
  dagenOver: number | null;
  /** een zin: waarom dit eerst moet */
  zin: string;
}

function zinVoor(reden: EerstReden, uiterlijk: string | null, dagenOver: number | null): string {
  const waarom: Record<EerstReden, string> = {
    wettelijk: "Dit is wettelijk verplicht",
    "gegevens kwijt": "Zonder dit kun je gegevens voorgoed kwijtraken",
    "geld binnen": "Zonder dit kan er geen geld binnenkomen",
    bezorging: "Zonder dit komen mails mogelijk niet aan",
  };
  const kern = waarom[reden];
  if (uiterlijk === null || dagenOver === null) return `${kern}.`;
  if (dagenOver < 0) return `${kern}. De uiterste datum, ${datumNl(uiterlijk)}, is verlopen.`;
  if (dagenOver === 0) return `${kern}, en de uiterste datum is vandaag (${datumNl(uiterlijk)}).`;
  return `${kern}, en het moet uiterlijk ${datumNl(uiterlijk)} klaar zijn (nog ${dagenOver} ${dagenOver === 1 ? "dag" : "dagen"}).`;
}

/**
 * De openstaande taken met `eerst`, gesorteerd op uiterste datum (vroegst eerst, zonder datum achteraan), dan op de volgorde van
 * de redenen, hooguit `max`. Een afgevinkte taak telt niet mee. Een verlopen datum blijft bovenaan staan en wordt als zodanig getoond.
 */
export function kiesBeginHier<T extends EerstTodo>(todos: T[], nu: Date, max = MAX_BEGIN_HIER): BeginHierItem<T>[] {
  const vandaag = dagNummer(amsterdamDayKey(nu));
  const items: { item: BeginHierItem<T>; dag: number | null; volgorde: number; index: number }[] = [];
  todos.forEach((todo, index) => {
    if (todo.done || !todo.eerst) return;
    const dag = todo.eerst.uiterlijk ? dagNummer(todo.eerst.uiterlijk) : null;
    const uiterlijk = dag === null ? null : (todo.eerst.uiterlijk ?? null);
    const dagenOver = dag === null || vandaag === null ? null : dag - vandaag;
    items.push({
      item: { todo, reden: todo.eerst.reden, uiterlijk, verlopen: dagenOver !== null && dagenOver < 0, dagenOver, zin: zinVoor(todo.eerst.reden, uiterlijk, dagenOver) },
      dag,
      volgorde: REDEN_VOLGORDE.indexOf(todo.eerst.reden),
      index,
    });
  });
  items.sort((a, b) => {
    if (a.dag !== b.dag) {
      if (a.dag === null) return 1;
      if (b.dag === null) return -1;
      return a.dag - b.dag;
    }
    return a.volgorde - b.volgorde || a.index - b.index;
  });
  return items.slice(0, max).map((x) => x.item);
}
