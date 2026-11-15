import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { deleteUpload, readUpload, storeUpload } from "@/lib/storage/local";
import { sniffAndVerifyUploadType } from "@/lib/storage/validate";
import { leesPersoneelVan } from "@/lib/horeca-personeel/store";

// ---------------------------------------------------------------------------
// Loonstroken van het eigen personeel van een horecazaak. ZekerFlex rekent geen loon uit voor eigen personeel: de werkgever
// (of zijn loonadministratie) zet de pdf per medewerker en periode neer, en de medewerker ziet alleen zijn eigen stroken. Het
// bestand zelf staat in de gewone uploadopslag (nooit in public/), de lijst met wie welke strook heeft in één KV-waarde per
// bedrijf (horeca:loonstroken:<tenantId>, lib/privacy/org-kv.ts).
// ---------------------------------------------------------------------------

export const MAX_LOONSTROOK_BYTES = 3_000_000;
export const MAX_PER_MEDEWERKER = 60;

export interface Loonstrook {
  id: string;
  medewerkerId: string;
  /** vrije tekst, bijvoorbeeld "oktober 2026" */
  periode: string;
  uploadId: string;
  bestand: string;
  grootte: number;
  op: string;
}

async function lees(tenantId: string): Promise<Loonstrook[]> {
  const ruw = await kvGet<unknown>(`horeca:loonstroken:${tenantId}`);
  return Array.isArray(ruw) ? (ruw as Loonstrook[]).filter((x) => x && typeof x.id === "string" && typeof x.uploadId === "string") : [];
}

const bewaar = (tenantId: string, lijst: Loonstrook[]) => kvSet(`horeca:loonstroken:${tenantId}`, lijst);

export const loonstrokenVan = (tenantId: string, medewerkerId?: string): Promise<Loonstrook[]> =>
  lees(tenantId).then((l) => (medewerkerId ? l.filter((x) => x.medewerkerId === medewerkerId) : l).sort((a, b) => (a.op < b.op ? 1 : -1)));

/** Een pdf voor een medewerker van deze zaak opslaan. Het type komt uit de bytes, niet uit wat de browser opgeeft. */
export async function voegLoonstrookToe(
  tenantId: string,
  input: { medewerkerId: string; periode: string; bestandsnaam: string; bytes: Buffer; door: string },
  nu: Date = new Date(),
): Promise<Loonstrook> {
  const periode = input.periode.trim().slice(0, 40);
  if (!periode) throw AppError.validation("Vul de periode in, bijvoorbeeld oktober 2026.");
  const d = await leesPersoneelVan(tenantId);
  if (!d.medewerkers.some((m) => m.id === input.medewerkerId && m.status !== "gestopt")) throw AppError.notFound("Deze medewerker staat niet in je lijst.");
  if (input.bytes.length === 0) throw AppError.validation("Kies een pdf-bestand.");
  if (input.bytes.length > MAX_LOONSTROOK_BYTES) throw AppError.validation("Dit bestand is te groot (maximaal 3 MB).");
  const type = sniffAndVerifyUploadType(input.bytes, ["pdf"]);
  const lijst = await lees(tenantId);
  if (lijst.filter((x) => x.medewerkerId === input.medewerkerId).length >= MAX_PER_MEDEWERKER) throw AppError.validation("Deze medewerker heeft het maximale aantal loonstroken.");
  const up = await storeUpload({ filename: input.bestandsnaam || "loonstrook.pdf", mimeType: type, bytes: input.bytes, uploadedById: input.door });
  const l: Loonstrook = { id: randomUUID().slice(0, 12), medewerkerId: input.medewerkerId, periode, uploadId: up.id, bestand: up.filename, grootte: up.sizeBytes, op: nu.toISOString() };
  await bewaar(tenantId, [...lijst, l]);
  return l;
}

export async function verwijderLoonstrook(tenantId: string, id: string): Promise<void> {
  const lijst = await lees(tenantId);
  const l = lijst.find((x) => x.id === id);
  if (!l) return;
  await bewaar(tenantId, lijst.filter((x) => x.id !== id));
  await deleteUpload(l.uploadId);
}

/** Het bestand van een strook, alleen als de strook bij dit bedrijf hoort (en, voor een medewerker, bij hemzelf). */
export async function leesLoonstrookBestand(tenantId: string, id: string, medewerkerId?: string): Promise<{ bytes: Buffer; bestand: string }> {
  const l = (await lees(tenantId)).find((x) => x.id === id);
  if (!l || (medewerkerId !== undefined && l.medewerkerId !== medewerkerId)) throw AppError.notFound("Deze loonstrook bestaat niet.");
  const f = await readUpload(l.uploadId);
  return { bytes: f.bytes, bestand: l.bestand };
}

/** Het antwoord waarmee een strook terugkomt: nooit in de browsercache, nooit als iets anders dan een pdf. */
export function pdfAntwoord(bytes: Buffer, bestand: string): Response {
  const naam = bestand.replace(/[^\w.\- ]+/g, "_").slice(0, 100) || "loonstrook.pdf";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${naam}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
