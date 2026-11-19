import { randomBytes } from "crypto";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { veelgesteld, type Vraag } from "@/lib/voorstel/smileyapp";
import { smileyappPakketten } from "@/lib/voorstel/smileyapp-pakketten";
import {
  beheerVragen,
  isVraagId,
  leesStaat,
  metBewerkteVraag,
  metNieuweVraag,
  metVerborgen,
  metVerplaatst,
  terugNaarStandaard,
  zichtbareVragen,
  zonderVraag,
  type BeheerVraag,
  type Uitkomst,
  type VragenStaat,
} from "@/lib/voorstel/smileyapp-vraag-regels";

// ---------------------------------------------------------------------------
// De veelgestelde vragen zoals de site ze toont: de standaard uit
// lib/voorstel/smileyapp.ts met de wijzigingen van het team eroverheen (KV
// voorstel-smileyapp:vragen, één rij). Eén bron, smileyappVragen(), voor de
// vragen op de voorpagina én voor wat de chat weet, zoals smileyappPakketten()
// dat voor de prijzen is: ze kunnen nooit iets anders zeggen. Lukt het lezen
// niet, dan geldt de standaard: de site valt nooit om door de opslag.
// ---------------------------------------------------------------------------

const SLEUTEL = "voorstel-smileyapp:vragen";

/** De opslag van het team, of null zolang alles de standaard is. Gooit bij een storing: de aanroeper kiest wat dan geldt. */
export async function vragenStaat(): Promise<VragenStaat | null> {
  return leesStaat(await kvGet<unknown>(SLEUTEL));
}

/**
 * De vragen voor de site en de chat. `standaard` is veelgesteld(pakketten): de lijst uit de code met de prijzen
 * van nu. Zonder wijzigingen van het team (of bij een storing) is het antwoord exact die lijst.
 */
export async function smileyappVragen(standaard: readonly Vraag[]): Promise<Vraag[]> {
  return zichtbareVragen(standaard, await vragenStaat().catch(() => null));
}

export interface VragenVoorBeheer {
  vragen: BeheerVraag[];
  /** staat alles nog op de standaard? Dan is "terug naar de standaard" niet nodig. */
  aangepast: boolean;
}

async function standaardNu(): Promise<Vraag[]> {
  return veelgesteld(await smileyappPakketten());
}

export async function vragenVoorBeheer(): Promise<VragenVoorBeheer> {
  const [standaard, staat] = await Promise.all([standaardNu(), vragenStaat()]);
  return { vragen: beheerVragen(standaard, staat), aangepast: staat !== null };
}

export type VraagActie =
  | { soort: "bewaren"; id?: string | undefined; vraag: string; antwoord: string }
  | { soort: "verbergen"; id: string; verborgen: boolean }
  | { soort: "verplaatsen"; id: string; richting: "op" | "neer" }
  | { soort: "verwijderen"; id: string }
  | { soort: "standaard"; id?: string | undefined };

/** Voert één wijziging uit en bewaart de uitkomst. De regels (grenzen, wat mag) staan in smileyapp-vraag-regels.ts. */
export async function wijzigVragen(actie: VraagActie): Promise<VragenVoorBeheer> {
  if (actie.id !== undefined && !isVraagId(actie.id)) throw AppError.notFound("Deze vraag bestaat niet (meer).");
  const [standaard, staat] = await Promise.all([standaardNu(), vragenStaat()]);
  let uit: Uitkomst;
  if (actie.soort === "bewaren") uit = actie.id === undefined ? metNieuweVraag(standaard, staat, actie, randomBytes(8).toString("hex")) : metBewerkteVraag(standaard, staat, actie.id, actie);
  else if (actie.soort === "verbergen") uit = metVerborgen(standaard, staat, actie.id, actie.verborgen);
  else if (actie.soort === "verplaatsen") uit = metVerplaatst(standaard, staat, actie.id, actie.richting);
  else if (actie.soort === "verwijderen") uit = zonderVraag(standaard, staat, actie.id);
  else uit = terugNaarStandaard(standaard, staat, actie.id);
  if (!uit.ok) throw AppError.validation(uit.fout, uit.veld ? { veld: uit.veld } : undefined);
  if (uit.staat) await kvSet(SLEUTEL, uit.staat);
  else await kvDelete(SLEUTEL);
  // de serverversie terug: het scherm neemt die over
  return { vragen: beheerVragen(standaard, uit.staat), aangepast: uit.staat !== null };
}
