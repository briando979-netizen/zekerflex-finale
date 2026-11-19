import { AppError } from "@/lib/errors";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { leesPosterZin, posterZin } from "@/lib/voorstel/smileyapp-poster-regels";
import { leesRespons, responsUitOpslag, type Respons } from "@/lib/voorstel/smileyapp-rekenhulp-regels";

// ---------------------------------------------------------------------------
// Kleine instellingen van het SmileyApp-beheer (deel 6a), in één rij: KV
// voorstel-smileyapp:instellingen. Nu: staat de wekelijkse mail aan (standaard
// ja) en de zin op de poster. Geen persoonsgegevens.
// Deel 6b: het responspercentage van de rekenhulp op de site, met de zin over
// waar dat cijfer vandaan komt. Er is geen standaard: zolang een beheerder niets
// invult, ontbreekt de sleutel en staat de rekenhulp nergens op de site.
// ---------------------------------------------------------------------------

const SLEUTEL = "voorstel-smileyapp:instellingen";

interface Opgeslagen {
  weekmail?: boolean;
  posterZin?: string;
  respons?: unknown;
}

export interface Instellingen {
  /** de wekelijkse mail aan de beheerders; standaard aan */
  weekmail: boolean;
  posterZin: string;
  /** de rekenhulp op de site; ontbreekt zolang een beheerder niets heeft ingevuld */
  respons?: Respons;
}

async function lees(): Promise<Opgeslagen> {
  const ruw = await kvGet<unknown>(SLEUTEL);
  return typeof ruw === "object" && ruw !== null ? (ruw as Opgeslagen) : {};
}

const alsInstellingen = (o: Opgeslagen): Instellingen => {
  const respons = responsUitOpslag(o.respons);
  return { weekmail: o.weekmail !== false, posterZin: posterZin(o.posterZin), ...(respons ? { respons } : {}) };
};

export async function smileyappInstellingen(): Promise<Instellingen> {
  return alsInstellingen(await lees());
}

export async function zetWeekmail(aan: boolean): Promise<Instellingen> {
  const nieuw: Opgeslagen = { ...(await lees()), weekmail: aan };
  await kvSet(SLEUTEL, nieuw);
  return alsInstellingen(nieuw);
}

export async function bewaarPosterZin(ruw: string): Promise<Instellingen> {
  const zin = leesPosterZin(ruw);
  if (!zin.ok) throw AppError.validation(zin.fout, { veld: "zin" });
  const nieuw: Opgeslagen = { ...(await lees()), posterZin: zin.waarde };
  await kvSet(SLEUTEL, nieuw);
  return alsInstellingen(nieuw);
}

/**
 * De instelling van de rekenhulp voor de site, of null. Null betekent: het blok bestaat niet. Dat geldt ook als het
 * lezen niet lukt of de rij niet klopt: de site toont dan liever niets dan een schatting met een verkeerd cijfer.
 */
export async function smileyappRespons(): Promise<Respons | null> {
  return responsUitOpslag((await lees().catch(() => ({}) as Opgeslagen)).respons);
}

/** Bewaart het percentage met de bronzin; de regels staan in smileyapp-rekenhulp-regels.ts. */
export async function bewaarRespons(invoer: { percentage: unknown; bron: unknown }): Promise<Instellingen> {
  const u = leesRespons(invoer);
  if (!u.ok) throw AppError.validation(u.fout, { veld: u.veld });
  const nieuw: Opgeslagen = { ...(await lees()), respons: u.waarde };
  await kvSet(SLEUTEL, nieuw);
  return alsInstellingen(nieuw);
}

/** Leeg maken: de sleutel verdwijnt, en daarmee het blok op de site. */
export async function wisRespons(): Promise<Instellingen> {
  const { respons: _respons, ...rest } = await lees();
  await kvSet(SLEUTEL, rest);
  return alsInstellingen(rest);
}
