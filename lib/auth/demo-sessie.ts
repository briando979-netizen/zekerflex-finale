import { cookies } from "next/headers";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { VIEW_AS_COOKIE } from "@/lib/auth/inspect";

/**
 * Het adres van de "Verlaat voorbeeld"-knop. Bewust een GET, zodat het nooit op de
 * alleen-lezen 423 van een demo vastloopt zoals uitloggen (een POST) wel deed; de route
 * wist de demo-sessie (app/voorbeeld/sluiten/route.ts).
 */
export const VOORBEELD_UITGANG = "/voorbeeld/sluiten";

/**
 * True wanneer de huidige bezoeker in een ZekerFlex-voorbeeld (read-only demo via
 * lib/auth/inspect.ts) het echte dashboard bekijkt — en niet de admin-"Bekijk als"
 * (die heeft zijn eigen balk, ViewAsBanner). Server-only: leest de sessiecookie.
 */
export async function inDemoSessie(): Promise<boolean> {
  const cs = await cookies();
  if (cs.get(VIEW_AS_COOKIE)?.value) return false;
  const raw = cs.get(SESSION_COOKIE)?.value;
  if (!raw) return false;
  const claims = await decodeSession(raw);
  return claims?.inspect === true;
}
