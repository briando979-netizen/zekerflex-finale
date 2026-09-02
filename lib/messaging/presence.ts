import { redis } from "@/lib/redis";

// ---------------------------------------------------------------------------
// Lightweight presence. Each authenticated poll of the inbox calls touch();
// a user counts as "online" while their key is fresh. Last-seen survives ~30d.
// Redis only — nothing is written to Postgres.
// ---------------------------------------------------------------------------

const ONLINE_TTL_SEC = 65; // a bit over the 8s thread-list poll interval
const LASTSEEN_TTL_SEC = 60 * 60 * 24 * 30;

const onlineKey = (userId: string) => `presence:online:${userId}`;
const seenKey = (userId: string) => `presence:seen:${userId}`;

export async function touchPresence(userId: string): Promise<void> {
  try {
    const now = new Date().toISOString();
    await redis
      .multi()
      .set(onlineKey(userId), now, "EX", ONLINE_TTL_SEC)
      .set(seenKey(userId), now, "EX", LASTSEEN_TTL_SEC)
      .exec();
  } catch {
    /* best effort */
  }
}

export interface Presence {
  online: boolean;
  lastSeen: string | null;
}

export async function getPresence(userIds: string[]): Promise<Record<string, Presence>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const out: Record<string, Presence> = {};
  if (ids.length === 0) return out;
  try {
    const [onlines, seens] = await Promise.all([
      redis.mget(...ids.map(onlineKey)),
      redis.mget(...ids.map(seenKey)),
    ]);
    ids.forEach((id, i) => {
      out[id] = {
        online: Boolean(onlines[i]),
        lastSeen: onlines[i] ?? seens[i] ?? null,
      };
    });
  } catch {
    ids.forEach((id) => (out[id] = { online: false, lastSeen: null }));
  }
  return out;
}

/** "online" / "laatst gezien vandaag om 14:03" / "laatst gezien 3 sep" */
export function formatLastSeen(p: Presence | undefined): string {
  if (!p) return "";
  if (p.online) return "online";
  if (!p.lastSeen) return "";
  const d = new Date(p.lastSeen);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `laatst gezien vandaag om ${time}`;
  if (d.toDateString() === y.toDateString()) return `laatst gezien gisteren om ${time}`;
  return `laatst gezien ${d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}`;
}
