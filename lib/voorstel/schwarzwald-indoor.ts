import { randomBytes } from "crypto";
import { kvDelete, kvFindByField, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { schoonInteresses, verlopen, voegInteressesSamen, type Interesse } from "@/lib/voorstel/indoor-regels";

// ---------------------------------------------------------------------------
// Opslag van de interesselijst voor het indoor megacenter (regels in
// indoor-regels.ts). Eén aanmelding per e-mailadres: opnieuw aanmelden werkt
// de bestaande bij. Verlopen aanmeldingen vallen weg bij het lezen.
// KV: voorstel-schwarzwald:indoor:<id> — valt onder inzage en wissen
// (schwarzwald-privacy.ts).
// ---------------------------------------------------------------------------

const PREFIX = "voorstel-schwarzwald:indoor:";

export interface IndoorAanmelding {
  id: string;
  email: string;
  naam: string;
  interesses: Interesse[];
  groep?: number;
  /** e-mail van het ingelogde account dat zich aanmeldde */
  account?: string;
  aangemeld: string;
  bijgewerkt: string;
}

const geldigId = (id: string) => /^[a-z0-9]{6,24}$/.test(id);

export async function meldAanIndoor(
  input: { email: string; naam: string; interesses: readonly string[]; groep?: number | undefined },
  account?: string | undefined,
): Promise<{ aanmelding: IndoorAanmelding; nieuw: boolean }> {
  const email = input.email.trim().toLowerCase();
  const nu = new Date().toISOString();
  const interesses = schoonInteresses(input.interesses);
  const bestaand = (await kvFindByField<IndoorAanmelding>(PREFIX, "email", email, 20))[0];
  const basis = bestaand ?? { id: `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`, email, aangemeld: nu };
  const aanmelding: IndoorAanmelding = {
    id: basis.id,
    email,
    aangemeld: basis.aangemeld,
    naam: input.naam.trim() || bestaand?.naam || "",
    interesses: bestaand ? voegInteressesSamen(bestaand.interesses, interesses) : interesses,
    ...(input.groep ? { groep: input.groep } : bestaand?.groep ? { groep: bestaand.groep } : {}),
    ...(account ? { account: account.toLowerCase() } : bestaand?.account ? { account: bestaand.account } : {}),
    bijgewerkt: nu,
  };
  await kvSet(`${PREFIX}${aanmelding.id}`, aanmelding);
  return { aanmelding, nieuw: !bestaand };
}

/** Alle aanmeldingen, nieuwste eerst; verlopen aanmeldingen worden meteen gewist. */
export async function alleIndoor(): Promise<IndoorAanmelding[]> {
  const nu = new Date();
  const rijen = await kvListEntries<IndoorAanmelding>(PREFIX, 10000);
  await Promise.all(rijen.filter((r) => verlopen(r.value.bijgewerkt, nu)).map((r) => kvDelete(r.key)));
  return rijen
    .map((r) => r.value)
    .filter((a) => !verlopen(a.bijgewerkt, nu))
    .sort((a, b) => b.aangemeld.localeCompare(a.aangemeld));
}

export async function verwijderIndoor(id: string): Promise<void> {
  if (!geldigId(id)) throw AppError.validation("Onbekende aanmelding.");
  if (!(await kvGet<IndoorAanmelding>(`${PREFIX}${id}`))) throw AppError.notFound("Aanmelding niet gevonden.");
  await kvDelete(`${PREFIX}${id}`);
}
