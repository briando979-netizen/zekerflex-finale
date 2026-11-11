// ---------------------------------------------------------------------------
// Live meten voor de camera van de ID-scan (POST /api/onboarding/gezicht-live). Alleen de detector (YuNet):
// waar het gezicht staat en hoe het gedraaid is. Geen gezichtskenmerken, en het beeld blijft in het geheugen:
// het wordt niet bewaard en niet gelogd. De regels voor wat het scherm daarmee zegt staan in beweging.ts (LIVE).
// ---------------------------------------------------------------------------

import { grootste } from "@/lib/kyc/gezicht/detector";
import { leesBeeld, vindGezichten } from "@/lib/kyc/gezicht/motor";
import { liveMeting, type LiveMeting } from "@/lib/kyc/gezicht/beweging";

/** Het grootste gezicht in een klein camerabeeld, of `null` als er geen gezicht te zien is. */
export async function meetLive(bytes: Uint8Array): Promise<LiveMeting | null> {
  const beeld = await leesBeeld(bytes);
  const alle = await vindGezichten(beeld);
  const g = grootste(alle);
  return g ? liveMeting(g, alle, beeld.breedte) : null;
}
