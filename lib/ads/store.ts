import { randomUUID } from "node:crypto";
import { kvGet, kvSet, kvListValues, kvDelete } from "@/lib/storage/kv";
import type { AdAudience, AdCopy } from "@/lib/ads/generate";

// ---------------------------------------------------------------------------
// Generated ads (copy + optional rendered image), Postgres-backed KV store —
// same pattern as lib/reviews/store.ts and lib/claims/store.ts. An admin can
// regenerate/discard freely; nothing here is auto-published anywhere, this
// is a drafting tool, not a live ad-buying integration.
// ---------------------------------------------------------------------------

export interface GeneratedAd extends AdCopy {
  id: string;
  audience: AdAudience;
  angle: string | null;
  imageB64: string | null;
  imageMimeType: string | null;
  imagePrompt: string | null;
  createdAt: string;
  createdById: string;
}

const key = (id: string) => `ad:${id}`;

export async function saveAd(input: Omit<GeneratedAd, "id" | "createdAt">): Promise<GeneratedAd> {
  const ad: GeneratedAd = { ...input, id: randomUUID().slice(0, 12), createdAt: new Date().toISOString() };
  await kvSet(key(ad.id), ad);
  return ad;
}

export async function listAds(limit = 50): Promise<GeneratedAd[]> {
  const rows = await kvListValues<GeneratedAd>("ad:", limit);
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getAd(id: string): Promise<GeneratedAd | null> {
  return kvGet<GeneratedAd>(key(id.replace(/[^a-z0-9-]/gi, "")));
}

export async function deleteAd(id: string): Promise<void> {
  await kvDelete(key(id));
}
