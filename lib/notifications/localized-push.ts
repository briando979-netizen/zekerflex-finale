import type { Locale } from "@/lib/i18n/config";
import { prisma } from "@/lib/prisma";
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

/**
 * Een push aan een groep waarin werkers én opdrachtgevers kunnen zitten (chat, bellen, testmelding): een werker leest het in
 * zijn eigen app-taal, al het andere (opdrachtgevers, beheer) blijft Nederlands. Lukt het opzoeken van wie werker is niet,
 * dan gaat het Nederlands: de melding mag er nooit door wegblijven.
 */
export async function sendMixedPush(userIds: string[], build: (t: WorkerPushTexts, locale: Locale) => UserPush): Promise<number> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return 0;
  let werkers = new Set<string>();
  try {
    const rijen = await prisma.freelancerProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true } });
    werkers = new Set(rijen.map((r) => r.userId));
  } catch {
    /* geen lijst: alles Nederlands */
  }
  const overig = ids.filter((id) => !werkers.has(id));
  let reached = 0;
  if (werkers.size) reached += await sendLocalizedPush([...werkers], build);
  if (overig.length) reached += await sendUserPush(overig, build(WORKER_PUSH.nl, "nl"));
  return reached;
}
