import type { Vraag } from "@/lib/voorstel/smileyapp";

// ---------------------------------------------------------------------------
// De veelgestelde vragen van het SmileyApp-voorstel zoals het team ze zelf
// beheert (deel 6a). Puur (geen kv of zod), dus los te testen en ook bruikbaar
// in het beheer. De standaard is de lijst uit lib/voorstel/smileyapp.ts
// (veelgesteld), die de prijzen en looptijden van de pakketten volgt.
//
// De opslag bewaart alleen wat afwijkt: de volgorde, wat verborgen is, een
// eigen tekst bij een standaardvraag en eigen vragen. Een standaardvraag die
// het team niet aanraakte, bewaart alleen zijn verwijzing (`bron`): zijn tekst
// komt bij elk lezen opnieuw uit de standaard en blijft dus de prijzen volgen.
// Is alles weer gelijk aan de standaard, dan is er niets meer te bewaren.
// ---------------------------------------------------------------------------

export const VRAGEN_MAX = 30;
export const VRAAG_MIN = 10;
export const VRAAG_MAX = 200;
export const ANTWOORD_MIN = 20;
export const ANTWOORD_MAX = 1200;

export interface OpgeslagenVraag {
  id: string;
  /** de standaardvraag waar dit item bij hoort (de tekst van die vraag); ontbreekt bij een eigen vraag */
  bron?: string;
  /** de eigen tekst; ontbreken beide, dan geldt de tekst van de standaardvraag */
  vraag?: string;
  antwoord?: string;
  verborgen?: boolean;
}

export interface VragenStaat {
  items: OpgeslagenVraag[];
}

/** standaard: zoals in de code · aangepast: een standaardvraag met een eigen tekst · eigen: door het team toegevoegd */
export type VraagSoort = "standaard" | "aangepast" | "eigen";

export interface BeheerVraag extends Vraag {
  id: string;
  verborgen: boolean;
  soort: VraagSoort;
}

export type VraagControle = { ok: true; waarde: Vraag } | { ok: false; veld: "vraag" | "antwoord"; fout: string };
export type Uitkomst = { ok: true; staat: VragenStaat | null } | { ok: false; fout: string; veld?: "vraag" | "antwoord" };

/** Platte tekst op één regel: stuurtekens en regeleinden worden een spatie. Opmaak bestaat niet; de site toont de tekst letterlijk. */
export const platteTekst = (s: string) =>
  s
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Het vaste id van een standaardvraag: "std-" met de vraag in kleine letters en streepjes. */
export const standaardId = (vraag: string) =>
  `std-${
    vraag
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "vraag"
  }`;

export const isVraagId = (id: unknown): id is string => typeof id === "string" && /^(?:std-[a-z0-9-]{1,60}|[a-f0-9]{16})$/.test(id);

export function valideerVraag(invoer: { vraag: string; antwoord: string }): VraagControle {
  const vraag = platteTekst(invoer.vraag);
  const antwoord = platteTekst(invoer.antwoord);
  if (vraag.length < VRAAG_MIN || vraag.length > VRAAG_MAX) return { ok: false, veld: "vraag", fout: `Een vraag is minstens ${VRAAG_MIN} en hooguit ${VRAAG_MAX} tekens.` };
  if (antwoord.length < ANTWOORD_MIN || antwoord.length > ANTWOORD_MAX) return { ok: false, veld: "antwoord", fout: `Een antwoord is minstens ${ANTWOORD_MIN} en hooguit ${ANTWOORD_MAX} tekens.` };
  return { ok: true, waarde: { vraag, antwoord } };
}

/** Leest de opslag soepel: een kapotte rij telt niet mee, een kapot geheel is "geen wijzigingen". */
export function leesStaat(ruw: unknown): VragenStaat | null {
  const lijst = (ruw as { items?: unknown } | null)?.items;
  if (!Array.isArray(lijst)) return null;
  const items: OpgeslagenVraag[] = [];
  const gezien = new Set<string>();
  for (const x of lijst as unknown[]) {
    if (typeof x !== "object" || x === null) continue;
    const r = x as Record<string, unknown>;
    if (!isVraagId(r.id) || gezien.has(r.id)) continue;
    const bron = typeof r.bron === "string" && r.bron ? r.bron : undefined;
    const eigenTekst = typeof r.vraag === "string" && typeof r.antwoord === "string" ? valideerVraag({ vraag: r.vraag, antwoord: r.antwoord }) : null;
    if (!bron && !eigenTekst?.ok) continue;
    gezien.add(r.id);
    items.push({ id: r.id, ...(bron ? { bron } : {}), ...(eigenTekst?.ok ? eigenTekst.waarde : {}), ...(r.verborgen === true ? { verborgen: true } : {}) });
    if (items.length >= VRAGEN_MAX * 2) break;
  }
  return { items };
}

const heeftEigenTekst = (i: OpgeslagenVraag): i is OpgeslagenVraag & Vraag => i.vraag !== undefined && i.antwoord !== undefined;

/**
 * De hele lijst in volgorde: de opslag met de standaard erbij. Een standaardvraag die niet meer in de code staat
 * valt weg (met een eigen tekst blijft hij als eigen vraag); een nieuwe standaardvraag komt achteraan.
 */
function volledig(standaard: readonly Vraag[], staat: VragenStaat | null): OpgeslagenVraag[] {
  if (!staat) return standaard.map((v) => ({ id: standaardId(v.vraag), bron: v.vraag }));
  const bekend = new Set(standaard.map((v) => v.vraag));
  const items: OpgeslagenVraag[] = [];
  for (const i of staat.items) {
    if (i.bron === undefined || bekend.has(i.bron)) items.push(i);
    else if (heeftEigenTekst(i)) items.push({ id: i.id, vraag: i.vraag, antwoord: i.antwoord, ...(i.verborgen ? { verborgen: true } : {}) });
  }
  const gebruikt = new Set(items.map((i) => i.bron));
  for (const v of standaard) if (!gebruikt.has(v.vraag)) items.push({ id: standaardId(v.vraag), bron: v.vraag });
  return items;
}

/** Wat het beheer toont: elke vraag met zijn tekst van nu, of hij verborgen is en waar hij vandaan komt. */
export function beheerVragen(standaard: readonly Vraag[], staat: VragenStaat | null): BeheerVraag[] {
  const perVraag = new Map(standaard.map((v) => [v.vraag, v]));
  return volledig(standaard, staat).flatMap((i): BeheerVraag[] => {
    const std = i.bron !== undefined ? perVraag.get(i.bron) : undefined;
    const tekst: Vraag | undefined = heeftEigenTekst(i) ? { vraag: i.vraag, antwoord: i.antwoord } : std;
    if (!tekst) return [];
    return [{ id: i.id, vraag: tekst.vraag, antwoord: tekst.antwoord, verborgen: i.verborgen === true, soort: !std ? "eigen" : heeftEigenTekst(i) ? "aangepast" : "standaard" }];
  });
}

/** Wat de site en de chat tonen: de zichtbare vragen in de volgorde van het team. Zonder opslag: exact de standaard. */
export function zichtbareVragen(standaard: readonly Vraag[], staat: VragenStaat | null): Vraag[] {
  if (!staat) return standaard.map((v) => ({ vraag: v.vraag, antwoord: v.antwoord }));
  return beheerVragen(standaard, staat)
    .filter((v) => !v.verborgen)
    .map((v) => ({ vraag: v.vraag, antwoord: v.antwoord }));
}

/**
 * De vertaalde pagina's (/en, /de): `vertaald` is de standaardlijst in die taal, in dezelfde volgorde als
 * `standaard`. Ze volgen de volgorde en het verbergen van het team. Een vraag met een eigen Nederlandse tekst en
 * een eigen vraag hebben geen vertaling en staan er daarom niet: liever geen antwoord dan een ander antwoord.
 */
export function vertaaldeVragen(vertaald: readonly Vraag[], standaard: readonly Vraag[], staat: VragenStaat | null): Vraag[] {
  if (!staat || vertaald.length !== standaard.length) return [...vertaald];
  const plek = new Map(standaard.map((v, n) => [v.vraag, n]));
  return volledig(standaard, staat).flatMap((i) => {
    const n = i.bron !== undefined && !heeftEigenTekst(i) && !i.verborgen ? plek.get(i.bron) : undefined;
    const v = n !== undefined ? vertaald[n] : undefined;
    return v ? [v] : [];
  });
}

// ---- wijzigen: elke functie geeft de nieuwe opslag terug, of een fout ---------------

/** Is de lijst weer exact de standaard (zelfde volgorde, niets verborgen, geen eigen tekst)? Dan valt er niets te bewaren. */
function alsStaat(standaard: readonly Vraag[], items: OpgeslagenVraag[]): VragenStaat | null {
  const gelijk = items.length === standaard.length && items.every((i, n) => i.bron === standaard[n]?.vraag && !heeftEigenTekst(i) && !i.verborgen);
  return gelijk ? null : { items };
}

const zelfde = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Het blok met vragen op de site is nooit leeg: de laatste zichtbare vraag kan niet weg. */
const LAATSTE_ZICHTBAAR = "Er moet minstens één vraag zichtbaar blijven op de site.";

/** Twee vragen met dezelfde tekst kan niet: een bezoeker ziet dan twee keer dezelfde vraag. */
function dubbel(standaard: readonly Vraag[], items: readonly OpgeslagenVraag[], vraag: string, behalve?: string): boolean {
  return items.some((i) => i.id !== behalve && zelfde(heeftEigenTekst(i) ? i.vraag : (i.bron ?? ""), vraag)) || (behalve === undefined && standaard.some((v) => zelfde(v.vraag, vraag)));
}

/** Een eigen vraag erbij, achteraan. `id`: zestien hex-tekens, door de server gemaakt. */
export function metNieuweVraag(standaard: readonly Vraag[], staat: VragenStaat | null, invoer: { vraag: string; antwoord: string }, id: string): Uitkomst {
  const controle = valideerVraag(invoer);
  if (!controle.ok) return { ok: false, fout: controle.fout, veld: controle.veld };
  const items = volledig(standaard, staat);
  if (items.length >= VRAGEN_MAX) return { ok: false, fout: `Er staan al ${VRAGEN_MAX} vragen. Verwijder eerst een eigen vraag.` };
  if (dubbel(standaard, items, controle.waarde.vraag)) return { ok: false, fout: "Deze vraag staat er al.", veld: "vraag" };
  return { ok: true, staat: alsStaat(standaard, [...items, { id, ...controle.waarde }]) };
}

/** Een vraag een andere tekst geven. Is een standaardvraag weer letterlijk de standaard, dan volgt hij die weer. */
export function metBewerkteVraag(standaard: readonly Vraag[], staat: VragenStaat | null, id: string, invoer: { vraag: string; antwoord: string }): Uitkomst {
  const controle = valideerVraag(invoer);
  if (!controle.ok) return { ok: false, fout: controle.fout, veld: controle.veld };
  const items = volledig(standaard, staat);
  const oud = items.find((i) => i.id === id);
  if (!oud) return { ok: false, fout: "Deze vraag bestaat niet (meer)." };
  if (dubbel(standaard, items, controle.waarde.vraag, id)) return { ok: false, fout: "Deze vraag staat er al.", veld: "vraag" };
  const std = standaard.find((v) => v.vraag === oud.bron);
  const alsStandaard = std !== undefined && std.vraag === controle.waarde.vraag && std.antwoord === controle.waarde.antwoord;
  const nieuw: OpgeslagenVraag = { id, ...(oud.bron !== undefined ? { bron: oud.bron } : {}), ...(alsStandaard ? {} : controle.waarde), ...(oud.verborgen ? { verborgen: true } : {}) };
  return { ok: true, staat: alsStaat(standaard, items.map((i) => (i.id === id ? nieuw : i))) };
}

export function metVerborgen(standaard: readonly Vraag[], staat: VragenStaat | null, id: string, verborgen: boolean): Uitkomst {
  const items = volledig(standaard, staat);
  if (!items.some((i) => i.id === id)) return { ok: false, fout: "Deze vraag bestaat niet (meer)." };
  const nieuw = items.map((i): OpgeslagenVraag => {
    if (i.id !== id) return i;
    const { verborgen: _oud, ...rest } = i;
    return verborgen ? { ...rest, verborgen: true } : rest;
  });
  if (!nieuw.some((i) => !i.verborgen)) return { ok: false, fout: LAATSTE_ZICHTBAAR };
  return { ok: true, staat: alsStaat(standaard, nieuw) };
}

/** Eén plek omhoog of omlaag. Bovenaan omhoog of onderaan omlaag verandert niets. */
export function metVerplaatst(standaard: readonly Vraag[], staat: VragenStaat | null, id: string, richting: "op" | "neer"): Uitkomst {
  const items = volledig(standaard, staat);
  const van = items.findIndex((i) => i.id === id);
  if (van < 0) return { ok: false, fout: "Deze vraag bestaat niet (meer)." };
  const naar = richting === "op" ? van - 1 : van + 1;
  const a = items[van];
  const b = items[naar];
  if (!a || !b) return { ok: true, staat: alsStaat(standaard, items) };
  const nieuw = [...items];
  nieuw[van] = b;
  nieuw[naar] = a;
  return { ok: true, staat: alsStaat(standaard, nieuw) };
}

/** Verwijderen kan alleen bij een eigen vraag; een standaardvraag kun je verbergen. */
export function zonderVraag(standaard: readonly Vraag[], staat: VragenStaat | null, id: string): Uitkomst {
  const items = volledig(standaard, staat);
  const oud = items.find((i) => i.id === id);
  if (!oud) return { ok: false, fout: "Deze vraag bestaat niet (meer)." };
  if (oud.bron !== undefined) return { ok: false, fout: "Een standaardvraag kun je niet verwijderen. Verberg hem, dan staat hij niet meer op de site." };
  const over = items.filter((i) => i.id !== id);
  if (!over.some((i) => !i.verborgen)) return { ok: false, fout: LAATSTE_ZICHTBAAR };
  return { ok: true, staat: alsStaat(standaard, over) };
}

/** Terug naar de standaard: één standaardvraag krijgt zijn eigen tekst terug (en is weer zichtbaar), of zonder id alles. */
export function terugNaarStandaard(standaard: readonly Vraag[], staat: VragenStaat | null, id?: string): Uitkomst {
  if (id === undefined) return { ok: true, staat: null };
  const items = volledig(standaard, staat);
  const oud = items.find((i) => i.id === id);
  if (!oud) return { ok: false, fout: "Deze vraag bestaat niet (meer)." };
  if (oud.bron === undefined) return { ok: false, fout: "Dit is een eigen vraag: daar hoort geen standaard bij." };
  const bron = oud.bron;
  return { ok: true, staat: alsStaat(standaard, items.map((i) => (i.id === id ? { id, bron } : i))) };
}
