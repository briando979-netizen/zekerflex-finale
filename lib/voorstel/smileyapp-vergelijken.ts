import { randomBytes } from "crypto";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import {
  beheerRijen,
  isRijId,
  leesStaat,
  metEigenRij,
  metVerborgenRij,
  zichtbareRijen,
  zonderEigenRij,
  type BeheerRij,
  type Rij,
  type Uitkomst,
  type VergelijkStaat,
} from "@/lib/voorstel/smileyapp-vergelijk-regels";

// ---------------------------------------------------------------------------
// De vergelijking "Smileyapp of een papieren enquête?" zoals de site hem toont:
// de standaardrijen uit lib/voorstel/smileyapp-vergelijk-regels.ts met de
// wijzigingen van het team eroverheen (KV voorstel-smileyapp:vergelijken, één
// rij, geen persoonsgegevens). Lukt het lezen niet, dan gelden de
// standaardrijen: de pagina valt nooit om door de opslag.
// ---------------------------------------------------------------------------

const SLEUTEL = "voorstel-smileyapp:vergelijken";

async function staatNu(): Promise<VergelijkStaat | null> {
  return leesStaat(await kvGet<unknown>(SLEUTEL));
}

/** De rijen voor de pagina /vergelijken. */
export async function vergelijkRijen(): Promise<Rij[]> {
  return zichtbareRijen(await staatNu().catch(() => null));
}

export interface VergelijkVoorBeheer {
  rijen: BeheerRij[];
  /** staat alles nog op de standaard? */
  aangepast: boolean;
}

export async function vergelijkVoorBeheer(): Promise<VergelijkVoorBeheer> {
  const staat = await staatNu();
  return { rijen: beheerRijen(staat), aangepast: staat !== null };
}

export type VergelijkActie =
  | { soort: "toevoegen"; kenmerk: string; smileyapp: string; papier: string }
  | { soort: "verwijderen"; id: string }
  | { soort: "verbergen"; id: string; verborgen: boolean };

/** Voert één wijziging uit en bewaart de uitkomst. De regels (grenzen, wat mag) staan in smileyapp-vergelijk-regels.ts. */
export async function wijzigVergelijk(actie: VergelijkActie): Promise<VergelijkVoorBeheer> {
  if (actie.soort !== "toevoegen" && !isRijId(actie.id)) throw AppError.notFound("Deze rij bestaat niet (meer).");
  const staat = await staatNu();
  let uit: Uitkomst;
  if (actie.soort === "toevoegen") uit = metEigenRij(staat, actie, randomBytes(8).toString("hex"));
  else if (actie.soort === "verwijderen") uit = zonderEigenRij(staat, actie.id);
  else uit = metVerborgenRij(staat, actie.id, actie.verborgen);
  if (!uit.ok) throw AppError.validation(uit.fout, uit.veld ? { veld: uit.veld } : undefined);
  if (uit.staat) await kvSet(SLEUTEL, uit.staat);
  else await kvDelete(SLEUTEL);
  // de serverversie terug: het scherm neemt die over
  return { rijen: beheerRijen(uit.staat), aangepast: uit.staat !== null };
}
