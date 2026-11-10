import { prisma } from "@/lib/prisma";
import { kvGet } from "@/lib/storage/kv";
import { getUserProfileExtra } from "@/lib/profile/store";
import { getErvaring } from "@/lib/werker/ervaring-store";
import { eersteIndrukStand, type EersteIndrukStand } from "@/lib/onboarding/eerste-indruk";
import { isWebPushEnabled } from "@/lib/notifications/push/web-push";
import { APNS_PREFIX } from "@/lib/notifications/push/apns";
import type { Ervaring } from "@/lib/werker/ervaring";

/**
 * Komen meldingen bij deze werker aan? Een actief web-push-abonnement of een apparaatcode van de
 * iPhone-app telt. In de iPhone-app zelf vraagt de app om toestemming (een webknop werkt daar niet),
 * en zonder ingerichte web-push valt er niets aan te zetten: dan geldt de stap ook als klaar.
 * Een storing telt als "klaar": een optionele stap mag niemand blijven lastigvallen.
 */
async function heeftMeldingen(userId: string, iosApp: boolean): Promise<boolean> {
  if (iosApp || !isWebPushEnabled()) return true;
  try {
    const [web, apns] = await Promise.all([
      prisma.webPushSubscription.count({ where: { disabledAt: null, OR: [{ userId }, { freelancer: { userId } }] } }),
      kvGet<unknown>(`${APNS_PREFIX}${userId}`),
    ]);
    return web > 0 || Boolean(apns);
  } catch {
    return true;
  }
}

/** De feiten voor "Maak een goede eerste indruk"; een storing in foto of ervaring telt als "nog niet gedaan". */
export async function eersteIndrukVoor(
  userId: string,
  opties: { iosApp?: boolean } = {},
): Promise<EersteIndrukStand & { ervaringen: Ervaring[]; geenErvaring: boolean; heeftFoto: boolean; heeftMeldingen: boolean }> {
  const [extra, ervaring, meldingen] = await Promise.all([
    getUserProfileExtra(userId).catch(() => ({}) as { avatarUploadId?: string }),
    getErvaring(userId).catch(() => ({ items: [] as Ervaring[], geen: false })),
    heeftMeldingen(userId, Boolean(opties.iosApp)),
  ]);
  const heeftFoto = Boolean(extra.avatarUploadId);
  return {
    ...eersteIndrukStand({ heeftFoto, aantalErvaringen: ervaring.items.length, geenErvaring: ervaring.geen, heeftMeldingen: meldingen }),
    ervaringen: ervaring.items,
    geenErvaring: ervaring.geen,
    heeftFoto,
    heeftMeldingen: meldingen,
  };
}
