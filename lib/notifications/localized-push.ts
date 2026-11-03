import type { Locale } from "@/lib/i18n/config";
import { userLocales } from "@/lib/i18n/worker-locale";
import { WORKER_PUSH, type WorkerPushTexts } from "@/lib/i18n/worker-push";
import { sendUserPush, type UserPush } from "@/lib/notifications/push";

/**
 * Send a push to workers in each one's own app language: recipients are grouped
 * by their stored locale (Dutch when none is stored) and `build` makes the
 * message per language. Returns the number of devices reached.
 */
export async function sendLocalizedPush(
  userIds: string[],
  build: (t: WorkerPushTexts, locale: Locale) => UserPush,
): Promise<number> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return 0;
  const locales = await userLocales(ids);
  const groups = new Map<Locale, string[]>();
  for (const id of ids) {
    const l = locales.get(id) ?? "nl";
    groups.set(l, [...(groups.get(l) ?? []), id]);
  }
  let reached = 0;
  for (const [locale, group] of groups) reached += await sendUserPush(group, build(WORKER_PUSH[locale], locale));
  return reached;
}
