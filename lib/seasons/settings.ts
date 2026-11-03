import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { recordAudit } from "@/lib/audit";
import { getFiscal } from "@/lib/fiscal/store";
import { amsterdamDayKey, amsterdamToUtc } from "@/lib/time/amsterdam";
import { isBirthdayOn, isThemeId, seasonOn, type SeasonId, type ThemeId } from "@/lib/seasons/calendar";

// ---------------------------------------------------------------------------
// Seizoensthema's: aan/uit (Admin → Huisstijl) en wat er nu te vieren valt.
//   KV "seasonal-themes"       → { aan, uit: ThemeId[] }
//   KV "user-birthday:<userId>" → "MM-DD", optioneel, alleen dag en maand
// Flexwerkers hebben al een geboortedatum in hun fiscale gegevens; die telt
// als ze zelf niets hebben ingevuld.
// ---------------------------------------------------------------------------

export interface SeasonSettings {
  /** master switch */
  aan: boolean;
  /** themes the owner switched off */
  uit: ThemeId[];
}

const KEY = "seasonal-themes";
// The root layout asks on every page view; settings change rarely.
let cache: { at: number; value: SeasonSettings } | null = null;

export async function getSeasonSettings(): Promise<SeasonSettings> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  const raw = await kvGet<Partial<SeasonSettings>>(KEY).catch(() => null);
  const value: SeasonSettings = { aan: raw?.aan !== false, uit: (raw?.uit ?? []).filter(isThemeId) };
  cache = { at: Date.now(), value };
  return value;
}

export async function saveSeasonSettings(input: SeasonSettings, by: { userId: string }): Promise<SeasonSettings> {
  const value: SeasonSettings = { aan: Boolean(input.aan), uit: [...new Set(input.uit.filter(isThemeId))] };
  await kvSet(KEY, value);
  cache = { at: Date.now(), value };
  await recordAudit({
    category: "ADMIN",
    action: "seasons.updated",
    actorUserId: by.userId,
    summary: `Seizoensthema's ${value.aan ? "aan" : "uit"}${value.uit.length ? `; uit: ${value.uit.join(", ")}` : ""}`,
    targetType: "settings",
    targetId: KEY,
  });
  return value;
}

/** Test hook: forget the cached settings. */
export function _resetSeasonCache(): void {
  cache = null;
}

const allowed = (s: SeasonSettings, id: ThemeId) => s.aan && !s.uit.includes(id);

/** The season to show now (Dutch calendar day), with the countdown target on 31 December; null on an ordinary day. */
export async function activeSeason(now = new Date()): Promise<{ id: SeasonId; countdownTo: string | null } | null> {
  const day = amsterdamDayKey(now);
  const id = seasonOn(day);
  if (!id || !allowed(await getSeasonSettings(), id)) return null;
  return { id, countdownTo: id === "oudjaar" ? amsterdamToUtc(Number(day.slice(0, 4)) + 1, 1, 1).toISOString() : null };
}

const birthdayKey = (userId: string) => `user-birthday:${userId}`;
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** "MM-DD" when month and day form a real date (29 February allowed), else null. */
export function birthdayValue(month: number, day: number): string | null {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12) return null;
  if (day < 1 || day > (DAYS_IN_MONTH[month - 1] ?? 0)) return null;
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export async function getUserBirthday(userId: string): Promise<string | null> {
  return (await kvGet<string>(birthdayKey(userId)).catch(() => null)) ?? null;
}

export async function setUserBirthday(userId: string, value: string | null): Promise<void> {
  if (value) await kvSet(birthdayKey(userId), value);
  else await kvDelete(birthdayKey(userId));
}

/** Is it this person's birthday today (in the Netherlands), and is the birthday theme on? */
export async function birthdayToday(userId: string, now = new Date()): Promise<boolean> {
  if (!allowed(await getSeasonSettings(), "verjaardag")) return false;
  const own = await getUserBirthday(userId);
  const birth = own ?? (await getFiscal(userId).catch(() => null))?.birthDate ?? null;
  return isBirthdayOn(birth, amsterdamDayKey(now));
}
