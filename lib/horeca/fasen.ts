import type { BestelRegel, BestelStatus, Fase } from "@/lib/horeca/bestellen";

// ---------------------------------------------------------------------------
// Fasen per regel van een bestelling. Keuken en bar werken elk aan hun eigen
// regels: de drankjes zijn klaar en geserveerd terwijl de keuken nog bakt. De
// status van de hele bestelling (die de gast en de cijfers zien) volgt uit de
// regels: alles geserveerd = GESERVEERD, alles klaar = KLAAR, iets begonnen =
// IN_BEREIDING. Elke stap verplaatst alleen regels die in een bepaalde fase
// staan, zodat een dubbele tik of een trage keuken nooit iets overslaat.
// Puur, dus ook in de browser bruikbaar en los te testen.
// ---------------------------------------------------------------------------

export type { Fase };
export const FASEN: readonly Fase[] = ["nieuw", "gestart", "klaar", "geserveerd"];
export type Station = "keuken" | "bar";
export type Filter = Station | "alles";

const rang = (f: Fase) => FASEN.indexOf(f);
export const faseVan = (r: Pick<BestelRegel, "fase">): Fase => r.fase ?? "nieuw";
const hoort = (r: BestelRegel, filter: Filter) => filter === "alles" || r.station === filter;

function metFase(r: BestelRegel, fase: Fase, nu: string): BestelRegel {
  const { fase: _f, klaarOp, geserveerdOp: _g, ...rest } = r;
  const uit: BestelRegel = { ...rest };
  if (fase !== "nieuw") uit.fase = fase;
  // klaarOp blijft staan bij serveren; terug naar nieuw of gestart wist hem
  if (rang(fase) >= rang("klaar")) uit.klaarOp = klaarOp ?? nu;
  if (fase === "geserveerd") uit.geserveerdOp = nu;
  return uit;
}

/**
 * Zet de regels van een station die in een van de fasen `van` staan op `naar`.
 * Met `laatste` alleen de regels die als laatste samen geserveerd werden
 * ("Ongedaan maken" na serveren laat eerder geserveerde drankjes staan).
 */
export function verplaats(regels: readonly BestelRegel[], filter: Filter, van: readonly Fase[], naar: Fase, nu: string, laatste = false): BestelRegel[] {
  const grens = laatste ? regels.map((r) => r.geserveerdOp ?? "").sort().pop() ?? "" : "";
  return regels.map((r) => (hoort(r, filter) && van.includes(faseVan(r)) && (!laatste || (r.geserveerdOp ?? "") === grens) ? metFase(r, naar, nu) : r));
}

/** De stappen die schermen en het beheer kunnen zetten. */
export const STAPPEN = {
  /** keuken of bar begint */
  start: { van: ["nieuw"], naar: "gestart" },
  /** keuken of bar meldt klaar (ook zonder eerst Start) */
  klaar: { van: ["nieuw", "gestart"], naar: "klaar" },
  /** per ongeluk op Klaar getikt */
  terugNaarBezig: { van: ["klaar"], naar: "gestart" },
  /** per ongeluk op Start getikt */
  terugNaarNieuw: { van: ["gestart"], naar: "nieuw" },
  /** de bediening brengt weg wat klaarstaat, nooit wat nog in de maak is */
  serveer: { van: ["klaar"], naar: "geserveerd" },
  /** "Ongedaan maken" na serveren: alleen wat als laatste samen geserveerd werd */
  serveerTerug: { van: ["geserveerd"], naar: "klaar", laatste: true },
} as const satisfies Record<string, { van: readonly Fase[]; naar: Fase; laatste?: boolean }>;
export type Stap = keyof typeof STAPPEN;

/** De status van de hele bestelling (beheer): alles vooruit naar die fase, of bij Nieuw alles terug. */
export function stapVoorStatus(status: Exclude<BestelStatus, "GEANNULEERD">): { van: readonly Fase[]; naar: Fase } {
  switch (status) {
    case "NIEUW":
      return { van: ["gestart", "klaar", "geserveerd"], naar: "nieuw" };
    case "IN_BEREIDING":
      return STAPPEN.start;
    case "KLAAR":
      return STAPPEN.klaar;
    case "GESERVEERD":
      return { van: ["nieuw", "gestart", "klaar"], naar: "geserveerd" };
  }
}

/** De status van de hele bestelling, afgeleid uit de regels. */
export function statusUit(regels: readonly BestelRegel[]): BestelStatus {
  if (!regels.length) return "NIEUW";
  const rangen = regels.map((r) => rang(faseVan(r)));
  const laagst = Math.min(...rangen);
  if (laagst >= rang("geserveerd")) return "GESERVEERD";
  if (laagst >= rang("klaar")) return "KLAAR";
  return Math.max(...rangen) >= rang("gestart") ? "IN_BEREIDING" : "NIEUW";
}

/** Hoe ver een station met deze bestelling is (de laagste fase van zijn regels), of null zonder regels. */
export function stationFase(regels: readonly BestelRegel[], filter: Filter): Fase | null {
  const eigen = regels.filter((r) => hoort(r, filter));
  if (!eigen.length) return null;
  return FASEN[Math.min(...eigen.map((r) => rang(faseVan(r))))] ?? "nieuw";
}

/** Aantal stuks dat klaarstaat om te serveren. */
export const klaarOmTeServeren = (regels: readonly BestelRegel[], filter: Filter = "alles") =>
  regels.filter((r) => hoort(r, filter) && faseVan(r) === "klaar").reduce((s, r) => s + r.aantal, 0);
