import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { sendUserPush } from "@/lib/notifications/push";
import { getWorkerMilestones } from "@/lib/worker/milestones";

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
  const year = now.getFullYear();
  const quarter = Math.floor(now.getMonth() / 3) + 1;

  const users = await prisma.user.findMany({
    where: {
      disabledAt: null,
      freelancerProfile: { isNot: null },
      webPushSubscriptions: { some: { disabledAt: null } },
    },
    select: { id: true },
    take: 3000,
  });

  let sent = 0;
  for (const u of users) {
    try {
      const data = await getWorkerMilestones(u.id, now);
      if (!data) continue;
      for (const m of data.milestones) {
        if (m.id === "btw" && m.status === "action") {
          if (await claim(`btw:${u.id}:${year}Q${quarter}`)) {
            await sendUserPush([u.id], {
              title: "🧾 Btw-aangifte bijna",
              body: `${m.headline}. ${m.detail}`.slice(0, 180),
              data: { type: "ADMIN", url: URL, tag: `btw-${year}Q${quarter}` },
              ttlSeconds: 7 * 24 * 3600,
            });
            sent += 1;
          }
        } else if (m.id === "urencriterium" && m.status === "ok") {
          if (await claim(`uren:${u.id}:${year}`)) {
            await sendUserPush([u.id], {
              title: "⏱️ 1.225 uur gehaald!",
              body: "Je hebt het urencriterium gehaald — je komt in aanmerking voor de zelfstandigenaftrek. Bekijk wat dat voor je betekent.",
              data: { type: "ADMIN", url: URL, tag: `uren-${year}` },
              ttlSeconds: 14 * 24 * 3600,
            });
            sent += 1;
          }
        } else if (m.id === "kor" && (m.status === "action" || m.status === "soon")) {
          if (await claim(`kor:${u.id}:${year}`)) {
            await sendUserPush([u.id], {
              title: "📊 Let op je KOR-grens",
              body: `${m.headline}. ${m.detail}`.slice(0, 180),
              data: { type: "ADMIN", url: URL, tag: `kor-${year}` },
              ttlSeconds: 14 * 24 * 3600,
            });
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
