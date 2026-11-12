import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { sendLocalizedPush } from "@/lib/notifications/localized-push";
import { userLocales } from "@/lib/i18n/worker-locale";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { amsterdamYearQuarter, getWorkerMilestones } from "@/lib/worker/milestones";

// ---------------------------------------------------------------------------
// Dagelijkse herinneringen voor administratie-mijlpalen (btw-deadline, 1.225-
// urencriterium gehaald, KOR-grens in zicht). Elk signaal gaat max. één keer
// per periode naar een gebruiker (KV-claim). Draait vanuit de dagelijkse cron.
// ---------------------------------------------------------------------------

const URL = "/dashboard/administratie";

async function claim(key: string): Promise<boolean> {
  if (await kvGet(`ms-push:${key}`).catch(() => null)) return false;
  await kvSet(`ms-push:${key}`, { at: new Date().toISOString() });
  return true;
}

export async function sweepMilestoneReminders(now = new Date()): Promise<{ users: number; sent: number }> {
  const { year, quarter } = amsterdamYearQuarter(now);

  const users = await prisma.user.findMany({
    where: {
      disabledAt: null,
      freelancerProfile: { isNot: null },
      webPushSubscriptions: { some: { disabledAt: null } },
    },
    select: { id: true },
    take: 3000,
  });

  // elke werker krijgt de mijlpaaltekst en de melding in zijn eigen app-taal (WORKER_PUSH, lib/i18n/worker-push.ts)
  const locales = await userLocales(users.map((u) => u.id));
  let sent = 0;
  for (const u of users) {
    try {
      const data = await getWorkerMilestones(u.id, now, FREELANCER_DICTS[locales.get(u.id) ?? "nl"].milestones);
      if (!data) continue;
      for (const m of data.milestones) {
        if (m.id === "btw" && m.status === "action") {
          if (await claim(`btw:${u.id}:${year}Q${quarter}`)) {
            await sendLocalizedPush([u.id], (t) => ({
              title: t.msBtwTitle,
              body: `${m.headline}. ${m.detail}`.slice(0, 180),
              data: { type: "ADMIN", url: URL, tag: `btw-${year}Q${quarter}` },
              ttlSeconds: 7 * 24 * 3600,
            }));
            sent += 1;
          }
        } else if (m.id === "urencriterium" && m.status === "ok") {
          if (await claim(`uren:${u.id}:${year}`)) {
            await sendLocalizedPush([u.id], (t) => ({
              title: t.msUrenTitle,
              body: t.msUrenBody,
              data: { type: "ADMIN", url: URL, tag: `uren-${year}` },
              ttlSeconds: 14 * 24 * 3600,
            }));
            sent += 1;
          }
        } else if (m.id === "spreiding" && m.status === "action") {
          // Wet DBA: één seintje per kwartaal zolang één opdrachtgever te groot is.
          if (await claim(`spreiding:${u.id}:${year}Q${quarter}`)) {
            await sendLocalizedPush([u.id], (t) => ({
              title: t.msSpreidingTitle,
              body: t.msSpreidingBody(m.headline).slice(0, 180),
              data: { type: "ADMIN", url: URL, tag: `spreiding-${year}Q${quarter}` },
              ttlSeconds: 14 * 24 * 3600,
            }));
            sent += 1;
          }
        } else if (m.id === "kor" && (m.status === "action" || m.status === "soon")) {
          if (await claim(`kor:${u.id}:${year}`)) {
            await sendLocalizedPush([u.id], (t) => ({
              title: t.msKorTitle,
              body: `${m.headline}. ${m.detail}`.slice(0, 180),
              data: { type: "ADMIN", url: URL, tag: `kor-${year}` },
              ttlSeconds: 14 * 24 * 3600,
            }));
            sent += 1;
          }
        }
      }
    } catch (err) {
      logger.warn("milestone sweep: user failed", { userId: u.id, error: (err as Error).message });
    }
  }
  return { users: users.length, sent };
}
