import { mediaId } from "@/lib/ontwerp/paginas";
import { PHOTO_KEYS, type PhotoKey } from "@/lib/marketing/photo-specs";

// ---------------------------------------------------------------------------
// Vervangende foto's voor de vaste fotoplekken van de site (homepage, Voor
// bedrijven, Over ons …). Een keuze wijst naar een foto in de mediabibliotheek
// van de Site-ontwerper (op het opslagvolume), zodat hij een uitrol overleeft:
// een bestand in public/marketing verdwijnt bij elke nieuwe container. Zonder
// keuze toont de site de standaardfoto uit git. Puur en browser-veilig.
// ---------------------------------------------------------------------------

export interface FotoKeuze {
  /** media-id uit de bibliotheek (lib/ontwerp/media.ts) */
  media: string;
  /** eigen alt-tekst; leeg = de standaard van de plek */
  alt: string;
}

export type FotoKeuzes = Partial<Record<PhotoKey, FotoKeuze>>;

export function normalizeFotoKeuze(raw: unknown): FotoKeuze | null {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const media = mediaId(r.media);
  if (!media) return null;
  const alt = typeof r.alt === "string" ? r.alt.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  return { media, alt };
}

export function normalizeFotoKeuzes(raw: unknown): FotoKeuzes {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const uit: FotoKeuzes = {};
  for (const key of PHOTO_KEYS) {
    const k = normalizeFotoKeuze(r[key]);
    if (k) uit[key] = k;
  }
  return uit;
}
