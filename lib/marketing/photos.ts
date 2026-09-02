import { existsSync, statSync } from "node:fs";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Marketing photo slots.
//
// Each slot has a file under /public/marketing. A slot is "ready" the moment
// its file exists on disk — no manifest flag to flip. Photos are produced in
// the admin Studio (/admin/studio) with the self-hosted image model, or dropped
// in by hand (see /public/marketing/README.md).
// ---------------------------------------------------------------------------

export interface PhotoSpec {
  file: string;
  alt: string;
  aspect: "portrait" | "landscape" | "wide";
}

export const MARKETING_PHOTOS = {
  hero: {
    file: "hero-freelancer.jpg",
    alt: "Een zzp'er onderweg naar een dienst, telefoon in de hand",
    aspect: "portrait",
  },
  freelancer: {
    file: "freelancer-at-work.jpg",
    alt: "Een zelfstandige aan het werk op locatie",
    aspect: "landscape",
  },
  employer: {
    file: "employer-branch.jpg",
    alt: "Een vestigingsmanager bekijkt de bezetting op een tablet",
    aspect: "landscape",
  },
  employerHero: {
    file: "employer-hero.jpg",
    alt: "Flexkracht aan het werk in een wasserij",
    aspect: "portrait",
  },
  team: {
    file: "team-shift.jpg",
    alt: "Een team flexwerkers tijdens een drukke dienst",
    aspect: "wide",
  },
} satisfies Record<string, PhotoSpec>;

export type PhotoKey = keyof typeof MARKETING_PHOTOS;

export function marketingDir(): string {
  return join(process.cwd(), "public", "marketing");
}

export function photoPath(key: PhotoKey): string {
  return join(marketingDir(), MARKETING_PHOTOS[key].file);
}

/** True when the slot's file exists on disk. */
export function isPhotoReady(key: PhotoKey): boolean {
  try {
    return existsSync(photoPath(key));
  } catch {
    return false;
  }
}

/** A stable cache key that changes when the file is replaced. */
export function photoVersion(key: PhotoKey): string {
  try {
    return Math.round(statSync(photoPath(key)).mtimeMs).toString(36);
  } catch {
    return "0";
  }
}

export async function saveMarketingPhoto(key: PhotoKey, bytes: Buffer): Promise<string> {
  await mkdir(marketingDir(), { recursive: true });
  await writeFile(photoPath(key), bytes);
  return `/marketing/${MARKETING_PHOTOS[key].file}`;
}

export async function removeMarketingPhoto(key: PhotoKey): Promise<void> {
  try {
    await unlink(photoPath(key));
  } catch {
    /* already gone */
  }
}

export function photoStatus(): { key: PhotoKey; ready: boolean; file: string }[] {
  return (Object.keys(MARKETING_PHOTOS) as PhotoKey[]).map((key) => ({
    key,
    ready: isPhotoReady(key),
    file: MARKETING_PHOTOS[key].file,
  }));
}
