import { kvDelete, kvGet, kvListKeys, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { pagina, type Blok, type Pagina, type Run } from "@/lib/voorstel/schwarzwald-paginas";

// ---------------------------------------------------------------------------
// Teksten zelf aanpassen (de CMS-wens uit hun vacature). Een bewerkte pagina
// staat als geheel in de KV (voorstel-schwarzwald:pagina:<pad>) en gaat voor
// op het origineel uit schwarzwald-paginas.json; "terugzetten" wist hem.
// Alleen tekst is bewerkbaar (koppen, alinea's, lijsten, titel, kop bovenaan);
// foto's, arrangementen en knoppen blijven zoals ze zijn. Een gewijzigde
// alinea verliest zijn vet en links, want hij wordt platte tekst.
// ---------------------------------------------------------------------------

const PREFIX = "voorstel-schwarzwald:pagina:";

export const platteTekst = (runs: Run[]) => runs.map((r) => r.t).join("");
const naarRuns = (tekst: string): Run[] =>
  tekst
    .split("\n")
    .flatMap((regel, i) => (i === 0 ? [{ t: regel }] : [{ t: "\n" }, { t: regel }]))
    .filter((r) => r.t !== "");

/** De pagina zoals bezoekers hem zien: bewerkt als dat er is, anders het origineel. */
export async function paginaVoorSite(pad: string): Promise<Pagina | undefined> {
  const bewerkt = await kvGet<Pagina>(`${PREFIX}${pad}`).catch(() => null);
  return bewerkt ?? pagina(pad);
}

export async function bewerktePaden(): Promise<string[]> {
  return (await kvListKeys(PREFIX, 1000)).map((k) => k.slice(PREFIX.length));
}

export interface TekstWijziging {
  titel: string;
  heroKop: string;
  /** index in blokken -> nieuwe tekst (kop/alinea) of regels (lijst) */
  blokken: Record<number, string | string[]>;
}

export async function slaPaginaOp(pad: string, w: TekstWijziging): Promise<Pagina> {
  const huidig = await paginaVoorSite(pad);
  if (!huidig) throw AppError.notFound("Pagina niet gevonden.");
  // een leeggemaakte alinea of lijst verdwijnt van de pagina
  const blokken: Blok[] = huidig.blokken.flatMap((b, i): Blok[] => {
    const nieuw = w.blokken[i];
    if (nieuw === undefined) return [b];
    if (b.type === "kop" && typeof nieuw === "string") return [{ ...b, tekst: nieuw.trim() || b.tekst }];
    if (b.type === "alinea" && typeof nieuw === "string") {
      if (!nieuw.trim()) return [];
      return [nieuw === platteTekst(b.runs) ? b : { type: "alinea", runs: naarRuns(nieuw) }];
    }
    if (b.type === "lijst" && Array.isArray(nieuw)) {
      const regels = nieuw.map((r) => r.trim()).filter(Boolean);
      const oud = b.items.map(platteTekst);
      // ongewijzigde regels behouden hun opmaak en links
      return regels.length ? [{ type: "lijst", items: regels.map((r) => b.items[oud.indexOf(r)] ?? [{ t: r }]) }] : [];
    }
    return [b];
  });
  const opgeslagen: Pagina = { ...huidig, titel: w.titel.trim() || huidig.titel, heroKop: w.heroKop.trim(), blokken };
  await kvSet(`${PREFIX}${pad}`, opgeslagen);
  return opgeslagen;
}

export async function zetPaginaTerug(pad: string): Promise<void> {
  await kvDelete(`${PREFIX}${pad}`);
}
