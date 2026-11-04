import { kvGet, kvSet } from "@/lib/storage/kv";
import { chatStandaardAan } from "@/lib/sitechat/site-kennis";
import type { SiteDoc } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Staat de chat aan op een klantsite? Een eigen KV-sleutel per site (zoals het
// eigen domein), zodat aan- en uitzetten meteen werkt zonder opnieuw te
// publiceren, en de autosave van de bouwer hem nooit overschrijft.
// Zonder keuze: aan voor nieuwe sites, uit voor bestaande (AGENTS.md).
// KV: sitechat-aan:<siteId>
// ---------------------------------------------------------------------------

export interface ChatInstelling {
  aan: boolean;
  gewijzigd: string;
  door: string;
}

const sleutel = (siteId: string) => `sitechat-aan:${siteId}`;

export const siteKanaal = (siteId: string) => `site-${siteId.toLowerCase().replace(/[^a-z0-9_-]/g, "")}`;

export async function chatInstelling(siteId: string): Promise<ChatInstelling | null> {
  return kvGet<ChatInstelling>(sleutel(siteId)).catch(() => null);
}

export async function chatAan(site: Pick<SiteDoc, "id" | "createdAt">): Promise<boolean> {
  return (await chatInstelling(site.id))?.aan ?? chatStandaardAan(site);
}

export async function zetChat(siteId: string, aan: boolean, door: string): Promise<ChatInstelling> {
  const i: ChatInstelling = { aan, gewijzigd: new Date().toISOString(), door: door.slice(0, 120) };
  await kvSet(sleutel(siteId), i);
  return i;
}
