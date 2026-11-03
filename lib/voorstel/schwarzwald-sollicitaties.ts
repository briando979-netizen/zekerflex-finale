import { randomBytes } from "crypto";
import { kvDelete, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { paginaVoorSite } from "@/lib/voorstel/schwarzwald-cms";
import { OPEN_SOLLICITATIE, isVacaturePad, verlopen, type SollicitatieStatus } from "@/lib/voorstel/sollicitatie-regels";

// ---------------------------------------------------------------------------
// Sollicitaties via de vacaturepagina's. Ze komen in het beheer (tabblad
// Sollicitaties) in plaats van in een mailbox, en worden 4 weken na de laatste
// wijziging vanzelf gewist (AVG). KV: voorstel-schwarzwald:sollicitatie:<id>
// ---------------------------------------------------------------------------

const PREFIX = "voorstel-schwarzwald:sollicitatie:";

export interface Sollicitatie {
  id: string;
  /** pad van de vacature, bv. /vacatures/zelfstandig-werkend-kok */
  vacature: string;
  functie: string;
  naam: string;
  email: string;
  telefoon: string;
  uren: string;
  /** gewenste startdatum (JJJJ-MM-DD) of leeg */
  start: string;
  motivatie: string;
  /** e-mail van het ingelogde account dat solliciteerde */
  account?: string;
  status: SollicitatieStatus;
  notitie: string;
  aangemaakt: string;
  bijgewerkt: string;
}

export type NieuweSollicitatie = Pick<Sollicitatie, "vacature" | "naam" | "email" | "telefoon" | "uren" | "start" | "motivatie">;

const geldigId = (id: string) => /^[a-z0-9]{6,24}$/.test(id);

export async function plaatsSollicitatie(input: NieuweSollicitatie, account?: string | undefined): Promise<Sollicitatie> {
  if (!isVacaturePad(input.vacature)) throw AppError.validation("Onbekende vacature.");
  const functie = input.vacature === "/vacatures" ? OPEN_SOLLICITATIE : (await paginaVoorSite(input.vacature))?.titel;
  if (!functie) throw AppError.validation("Deze vacature bestaat niet meer.");
  const nu = new Date().toISOString();
  const s: Sollicitatie = {
    ...input,
    email: input.email.trim().toLowerCase(),
    id: `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`,
    functie,
    ...(account ? { account: account.toLowerCase() } : {}),
    status: "nieuw",
    notitie: "",
    aangemaakt: nu,
    bijgewerkt: nu,
  };
  await kvSet(`${PREFIX}${s.id}`, s);
  return s;
}

/** Alle lopende sollicitaties; verlopen exemplaren worden meteen gewist. */
export async function alleSollicitaties(): Promise<Sollicitatie[]> {
  const rows = await kvListEntries<Sollicitatie>(PREFIX, 5000);
  const nu = Date.now();
  await Promise.all(rows.filter((r) => verlopen(r.value.bijgewerkt, nu)).map((r) => kvDelete(r.key)));
  return rows
    .filter((r) => !verlopen(r.value.bijgewerkt, nu))
    .map((r) => r.value)
    .sort((a, b) => b.aangemaakt.localeCompare(a.aangemaakt));
}

export async function wijzigSollicitatie(id: string, w: { status?: SollicitatieStatus | undefined; notitie?: string | undefined }): Promise<Sollicitatie> {
  if (!geldigId(id)) throw AppError.validation("Onbekende sollicitatie.");
  const s = await kvGet<Sollicitatie>(`${PREFIX}${id}`);
  if (!s) throw AppError.notFound("Sollicitatie niet gevonden.");
  const nieuw: Sollicitatie = {
    ...s,
    ...(w.status ? { status: w.status } : {}),
    ...(w.notitie !== undefined ? { notitie: w.notitie.trim() } : {}),
    bijgewerkt: new Date().toISOString(),
  };
  await kvSet(`${PREFIX}${id}`, nieuw);
  return nieuw;
}

export async function verwijderSollicitatie(id: string): Promise<void> {
  if (!geldigId(id)) throw AppError.validation("Onbekende sollicitatie.");
  await kvDelete(`${PREFIX}${id}`);
}
