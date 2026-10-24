import { kvGet, kvSet } from "@/lib/storage/kv";

// Per-persoon zichtbaarheid van het werkpaspoort. Standaard UIT: een paspoort
// is privé tot de professional het zelf publiek deelt (privacy-by-default).
const KEY = (userId: string) => `passport:public:${userId}`;

export async function isPassportPublic(userId: string): Promise<boolean> {
  return (await kvGet<boolean>(KEY(userId)).catch(() => false)) === true;
}

export async function setPassportPublic(userId: string, enabled: boolean): Promise<void> {
  await kvSet(KEY(userId), enabled === true);
}
