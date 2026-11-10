import { getUserProfileExtra } from "@/lib/profile/store";
import { getErvaring } from "@/lib/werker/ervaring-store";
import { eersteIndrukStand, type EersteIndrukStand } from "@/lib/onboarding/eerste-indruk";
import type { Ervaring } from "@/lib/werker/ervaring";

/** De feiten voor "Maak een goede eerste indruk"; een storing in een bron telt als "nog niet gedaan". */
export async function eersteIndrukVoor(userId: string): Promise<EersteIndrukStand & { ervaringen: Ervaring[]; geenErvaring: boolean; heeftFoto: boolean }> {
  const [extra, ervaring] = await Promise.all([
    getUserProfileExtra(userId).catch(() => ({}) as { avatarUploadId?: string }),
    getErvaring(userId).catch(() => ({ items: [] as Ervaring[], geen: false })),
  ]);
  const heeftFoto = Boolean(extra.avatarUploadId);
  return {
    ...eersteIndrukStand({ heeftFoto, aantalErvaringen: ervaring.items.length, geenErvaring: ervaring.geen }),
    ervaringen: ervaring.items,
    geenErvaring: ervaring.geen,
    heeftFoto,
  };
}
