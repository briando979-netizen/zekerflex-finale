import { AppError } from "@/lib/errors";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { leesPosterZin, posterZin } from "@/lib/voorstel/smileyapp-poster-regels";

// ---------------------------------------------------------------------------
// Kleine instellingen van het SmileyApp-beheer (deel 6a), in één rij: KV
// voorstel-smileyapp:instellingen. Nu: staat de wekelijkse mail aan (standaard
// ja) en de zin op de poster. Geen persoonsgegevens.
// ---------------------------------------------------------------------------

const SLEUTEL = "voorstel-smileyapp:instellingen";

interface Opgeslagen {
  weekmail?: boolean;
  posterZin?: string;
}

export interface Instellingen {
  /** de wekelijkse mail aan de beheerders; standaard aan */
  weekmail: boolean;
  posterZin: string;
}

async function lees(): Promise<Opgeslagen> {
  const ruw = await kvGet<unknown>(SLEUTEL);
  return typeof ruw === "object" && ruw !== null ? (ruw as Opgeslagen) : {};
}

const alsInstellingen = (o: Opgeslagen): Instellingen => ({ weekmail: o.weekmail !== false, posterZin: posterZin(o.posterZin) });

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
