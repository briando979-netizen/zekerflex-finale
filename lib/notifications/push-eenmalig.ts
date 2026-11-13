import { kvDeleteStale, kvGet, kvSet } from "@/lib/storage/kv";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Eén push per klus per werker per kanaal (13 nov 2026). Volgers en job-alerts stuurden hun push zonder markering: zette
// een werkgever een klus opnieuw openbaar (app/werkgever/diensten/[shiftId]/actions.ts), dan kreeg een werker hem
// nog eens, en het bereik was niet te meten. Nu dezelfde markering als "in de buurt" (lib/notifications/geo-push.ts):
// KV "push-sent:<kanaal>:<klus>:<werker>", gezet vóór het sturen. Een markering geldt 30 dagen en wordt daarna
// opgeruimd (ook die van geo). Een storing in de KV = gewoon sturen: liever een keer te veel dan een klus missen.
// Bewust zonder markering: stand-by en spoed, daar is een herhaling bedoeld (na een afzegging, een grotere straal).
// ---------------------------------------------------------------------------

export const PUSH_EENMALIG_DAGEN = 30;
const DAG_MS = 86_400_000;

export type PushKanaal = "volg" | "alert";

/** Zelfde vorm als push-sent:geo:<klus>:<werker>. De werker staat achteraan: het voorvoegsel is van het kanaal. */
export const pushSleutel = (kanaal: PushKanaal, shiftId: string, userId: string) => `push-sent:${kanaal}:${shiftId}:${userId}`;

/**
 * true = deze push mag (nu gemarkeerd); false = deze werker kreeg hem binnen 30 dagen al. Een storing bij het lezen of
 * schrijven geeft true.
 */
export async function eenmaligPush(kanaal: PushKanaal, shiftId: string, userId: string, nu = new Date()): Promise<boolean> {
  const sleutel = pushSleutel(kanaal, shiftId, userId);
  try {
    const eerder = await kvGet<{ at?: unknown }>(sleutel);
    if (eerder) {
      const at = typeof eerder.at === "string" ? Date.parse(eerder.at) : Number.NaN;
      // zonder leesbare tijd telt hij als gestuurd; alleen een oude markering mag opnieuw
      if (Number.isNaN(at) || nu.getTime() - at < PUSH_EENMALIG_DAGEN * DAG_MS) return false;
    }
  } catch {
    return true;
  }
  await kvSet(sleutel, { at: nu.toISOString() }).catch(() => undefined);
  return true;
}

/** De voorvoegsels die het opruimen raakt: de twee kanalen hierboven en "in de buurt". */
export const PUSH_MARKERING_VOORVOEGSELS = ["push-sent:volg:", "push-sent:alert:", "push-sent:geo:"] as const;
const OPRUIM_SLEUTEL = "systeem:push-sent-opruim";

/**
 * Markeringen ouder dan 30 dagen weg (ook de geo-markeringen, die tot nu toe bleven staan). Hooguit één keer per
 * Amsterdamse dag; een storing laat de rest doorgaan. Geeft het aantal gewiste rijen.
 */
export async function ruimPushMarkeringenOp(nu = new Date()): Promise<number> {
  const dag = amsterdamDayKey(nu);
  try {
    const laatst = await kvGet<{ dag?: string }>(OPRUIM_SLEUTEL);
    if (laatst?.dag === dag) return 0;
    await kvSet(OPRUIM_SLEUTEL, { dag });
  } catch {
    return 0;
  }
  const grens = new Date(nu.getTime() - PUSH_EENMALIG_DAGEN * DAG_MS);
  let weg = 0;
  for (const voorvoegsel of PUSH_MARKERING_VOORVOEGSELS) {
    try {
      weg += await kvDeleteStale(voorvoegsel, grens);
    } catch {
      /* dit voorvoegsel morgen opnieuw; de rest gaat door */
    }
  }
  return weg;
}
