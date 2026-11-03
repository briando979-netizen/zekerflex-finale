import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Verdiendoel per maand (bruto), naast de loon-vooruitblik. Alleen een eigen
// doel van de werker; niets verplicht en niets dat de matching beïnvloedt.
//   KV "verdiendoel:<userId>" → { monthlyCents }   (op de AVG-wislijst)
// ---------------------------------------------------------------------------

const MAX_GOAL_CENTS = 50_000_00;
const key = (userId: string) => `verdiendoel:${userId}`;

export async function getEarningsGoal(userId: string): Promise<number | null> {
  const v = await kvGet<{ monthlyCents?: number }>(key(userId)).catch(() => null);
  return v?.monthlyCents && v.monthlyCents > 0 ? v.monthlyCents : null;
}

/** null wist het doel. */
export async function setEarningsGoal(userId: string, monthlyCents: number | null): Promise<number | null> {
  if (monthlyCents === null) {
    await kvDelete(key(userId));
    return null;
  }
  if (!Number.isInteger(monthlyCents) || monthlyCents < 100_00 || monthlyCents > MAX_GOAL_CENTS) {
    throw AppError.validation("Kies een doel tussen € 100 en € 50.000 per maand");
  }
  await kvSet(key(userId), { monthlyCents });
  return monthlyCents;
}
