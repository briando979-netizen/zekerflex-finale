import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { deleteUpload, readUpload, storeUpload } from "@/lib/storage/local";
import { sniffAndVerifyUploadType } from "@/lib/storage/validate";
import { DOCUMENT_SOORTEN, type DocumentSoort } from "@/lib/horeca-personeel/model";
import { leesPersoneelVan } from "@/lib/horeca-personeel/store";

// ---------------------------------------------------------------------------
// Documenten voor het eigen personeel van een horecazaak: een contract of afspraak voor één medewerker, of huisregels, het
// handboek en HACCP-instructies voor iedereen. Alleen pdf. Het bestand staat in de gewone uploadopslag, de lijst in één
// KV-waarde per bedrijf (horeca:documenten:<tenantId>, lib/privacy/org-kv.ts). Een medewerker ziet de documenten voor iedereen
// en zijn eigen documenten, nooit die van een collega.
// ---------------------------------------------------------------------------

export const MAX_DOCUMENT_BYTES = 5_000_000;
export const MAX_DOCUMENTEN = 300;

export interface Document {
  id: string;
  /** null = voor alle medewerkers */
  medewerkerId: string | null;
  soort: DocumentSoort;
  titel: string;
  uploadId: string;
  bestand: string;
  grootte: number;
  op: string;
}

async function lees(tenantId: string): Promise<Document[]> {
  const ruw = await kvGet<unknown>(`horeca:documenten:${tenantId}`);
  return Array.isArray(ruw) ? (ruw as Document[]).filter((x) => x && typeof x.id === "string" && typeof x.uploadId === "string") : [];
}

const bewaar = (tenantId: string, lijst: Document[]) => kvSet(`horeca:documenten:${tenantId}`, lijst);

/** Alle documenten van het bedrijf (beheerder), of alleen wat deze medewerker mag zien. */
export const documentenVan = (tenantId: string, medewerkerId?: string): Promise<Document[]> =>
  lees(tenantId).then((l) => (medewerkerId === undefined ? l : l.filter((d) => d.medewerkerId === null || d.medewerkerId === medewerkerId)).sort((a, b) => (a.op < b.op ? 1 : -1)));

export async function voegDocumentToe(
  tenantId: string,
  i: { medewerkerId: string | null; soort: string; titel: string; bestandsnaam: string; bytes: Buffer; door: string },
  nu: Date = new Date(),
): Promise<Document> {
  const titel = i.titel.trim().slice(0, 80);
  if (!titel) throw AppError.validation("Geef het document een titel.");
  if (!(DOCUMENT_SOORTEN as readonly string[]).includes(i.soort)) throw AppError.validation("Kies een soort document.");
  if (i.medewerkerId !== null) {
    const d = await leesPersoneelVan(tenantId);
    if (!d.medewerkers.some((m) => m.id === i.medewerkerId && m.status !== "gestopt")) throw AppError.notFound("Deze medewerker staat niet in je lijst.");
  }
  if (i.bytes.length === 0) throw AppError.validation("Kies een pdf-bestand.");
  if (i.bytes.length > MAX_DOCUMENT_BYTES) throw AppError.validation("Dit bestand is te groot (maximaal 5 MB).");
  const type = sniffAndVerifyUploadType(i.bytes, ["pdf"]);
  const lijst = await lees(tenantId);
  if (lijst.length >= MAX_DOCUMENTEN) throw AppError.validation("Je hebt het maximale aantal documenten bereikt.");
  const up = await storeUpload({ filename: i.bestandsnaam || "document.pdf", mimeType: type, bytes: i.bytes, uploadedById: i.door });
  const doc: Document = { id: randomUUID().slice(0, 12), medewerkerId: i.medewerkerId, soort: i.soort as DocumentSoort, titel, uploadId: up.id, bestand: up.filename, grootte: up.sizeBytes, op: nu.toISOString() };
  await bewaar(tenantId, [...lijst, doc]);
  return doc;
}

export async function verwijderDocument(tenantId: string, id: string): Promise<void> {
  const lijst = await lees(tenantId);
  const d = lijst.find((x) => x.id === id);
  if (!d) return;
  await bewaar(tenantId, lijst.filter((x) => x.id !== id));
  await deleteUpload(d.uploadId);
}

/** Het bestand van een document: de beheerder (zonder medewerkerId) elk document van zijn bedrijf, een medewerker alleen wat hij mag zien. */
export async function leesDocumentBestand(tenantId: string, id: string, medewerkerId?: string): Promise<{ bytes: Buffer; bestand: string }> {
  const d = (await lees(tenantId)).find((x) => x.id === id);
  if (!d || (medewerkerId !== undefined && d.medewerkerId !== null && d.medewerkerId !== medewerkerId)) throw AppError.notFound("Dit document bestaat niet.");
  const f = await readUpload(d.uploadId);
  return { bytes: f.bytes, bestand: d.bestand };
}
