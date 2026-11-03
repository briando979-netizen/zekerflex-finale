import type { Rijschool } from "@prisma/client";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { deleteUpload, readUpload, storeUpload } from "@/lib/storage/local";
import { cleanImage } from "@/lib/media/clean-image";

// ---------------------------------------------------------------------------
// De foto bovenaan de rijschoolsite (bijvoorbeeld de lesauto of de instructeur).
// Opgeschoond (rechtop, zonder metadata of GPS, WebP, hoogstens 2000 px) en als
// upload bewaard; de verwijzing staat in de KV. De site zet hem onder een
// donkere laag, zodat de tekst erop altijd leesbaar blijft.
// ---------------------------------------------------------------------------

interface Heldfoto {
  uploadId: string;
  at: string;
}

const sleutel = (rijschoolId: string) => `rijschool-heldfoto:${rijschoolId}`;

export async function heldfoto(rijschoolId: string): Promise<Heldfoto | null> {
  return kvGet<Heldfoto>(sleutel(rijschoolId));
}

/** Het adres van de foto op de site, met de tijd erin zodat een nieuwe foto meteen te zien is. */
export async function heldfotoUrl(r: Pick<Rijschool, "id" | "slug">): Promise<string | null> {
  const f = await heldfoto(r.id).catch(() => null);
  return f ? `/rijschool/${r.slug}/heldfoto?v=${encodeURIComponent(f.at)}` : null;
}

export async function zetHeldfoto(r: Pick<Rijschool, "id">, bytes: Buffer, door: string | null): Promise<void> {
  const schoon = await cleanImage(bytes, 2000);
  const upload = await storeUpload({ filename: "heldfoto.webp", mimeType: schoon.mime, bytes: schoon.bytes, uploadedById: door });
  const oud = await heldfoto(r.id);
  await kvSet(sleutel(r.id), { uploadId: upload.id, at: new Date().toISOString() } satisfies Heldfoto);
  if (oud) await deleteUpload(oud.uploadId).catch(() => undefined);
}

export async function verwijderHeldfoto(r: Pick<Rijschool, "id">): Promise<void> {
  const oud = await heldfoto(r.id);
  await kvDelete(sleutel(r.id));
  if (oud) await deleteUpload(oud.uploadId).catch(() => undefined);
}

export async function leesHeldfoto(r: Pick<Rijschool, "id">): Promise<Buffer | null> {
  const f = await heldfoto(r.id);
  if (!f) return null;
  return (await readUpload(f.uploadId).catch(() => null))?.bytes ?? null;
}
