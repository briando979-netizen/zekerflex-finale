import { randomUUID } from "node:crypto";
import { kvDelete, kvFindDue, kvGet, kvListKeys, kvListValues, kvSet, kvVerwijderAlsVeld } from "@/lib/storage/kv";
import { logger } from "@/lib/logger";
import { getThread, postMessage } from "@/lib/messaging/store";
import { blockedBetween } from "@/lib/messaging/thread-prefs";
import { notifyNewMessage } from "@/lib/messaging/notify";
import { GEPLAND_MAX_PER_PERSOON, type GeplandBericht } from "@/lib/messaging/gepland-tijd";

export type { GeplandBericht };

// ---------------------------------------------------------------------------
// Later versturen in de chat (15 nov 2026). Een gepland bericht staat per persoon in KV
// (chat-gepland:<userId>:<id>, ook in ERASABLE_KV_PREFIXES: inzage en wissen). De cron
// (/api/internal/chat/gepland, elke minuut) verstuurt wat aan de beurt is. Eerst claimen
// (atomisch wissen), dan versturen: twee crons tegelijk sturen nooit hetzelfde bericht twee
// keer; een storing zet het terug (hooguit drie pogingen). Op het moment van versturen gelden dezelfde regels als bij gewoon sturen: nog in het
// gesprek, niet geblokkeerd; anders vervalt het bericht (en staat het in het log).
// ---------------------------------------------------------------------------

const PREFIX = "chat-gepland:";
const sleutel = (userId: string, id: string) => `${PREFIX}${userId}:${id}`;

/** Inplannen; null als je er al te veel hebt staan. */
export async function planBericht(userId: string, threadId: string, text: string, sendAt: Date, nu = new Date()): Promise<GeplandBericht | null> {
  if ((await kvListKeys(`${PREFIX}${userId}:`, GEPLAND_MAX_PER_PERSOON + 1)).length >= GEPLAND_MAX_PER_PERSOON) return null;
  const g: GeplandBericht = { id: randomUUID(), userId, threadId, text, sendAt: sendAt.toISOString(), createdAt: nu.toISOString() };
  await kvSet(sleutel(userId, g.id), g);
  return g;
}

/** Jouw geplande berichten in dit gesprek, eerst wat het eerst gaat. */
export async function geplandIn(userId: string, threadId: string): Promise<GeplandBericht[]> {
  const alle = await kvListValues<GeplandBericht>(`${PREFIX}${userId}:`, GEPLAND_MAX_PER_PERSOON * 2);
  return alle.filter((g) => g.threadId === threadId).sort((a, b) => (a.sendAt < b.sendAt ? -1 : 1));
}

/** Niet versturen; false als het niet (meer) bestaat of al onderweg is. */
export async function annuleerGepland(userId: string, id: string): Promise<boolean> {
  const g = await kvGet<GeplandBericht>(sleutel(userId, id));
  if (!g) return false;
  await kvDelete(sleutel(userId, id));
  return true;
}

/** De cron: alles wat aan de beurt is versturen. */
export async function verstuurGepland(nu = new Date()): Promise<{ verstuurd: number; vervallen: number }> {
  let verstuurd = 0;
  let vervallen = 0;
  const due = await kvFindDue<GeplandBericht>(PREFIX, "sendAt", nu.toISOString(), "", 200);
  for (const { key, value: g } of due) {
    // claimen: alleen wie het bericht wist, verstuurt het
    if (!(await kvVerwijderAlsVeld(key, "id", g.id))) continue;
    try {
      const thread = await getThread(g.threadId);
      const ander = thread?.kind === "direct" ? thread.participants.find((id) => id !== g.userId) : undefined;
      if (!thread || !thread.participants.includes(g.userId) || (ander && (await blockedBetween(g.userId, ander)))) {
        vervallen++;
        logger.info("gepland chatbericht vervalt", { threadId: g.threadId, reden: !thread ? "geen gesprek" : "geen toegang of geblokkeerd" });
        continue;
      }
      const msg = await postMessage(thread.id, g.userId, g.text, "text");
      await notifyNewMessage(thread, msg);
      verstuurd++;
    } catch (err) {
      // een storing: terugzetten voor de volgende minuut, hooguit drie keer
      const pogingen = (g.pogingen ?? 0) + 1;
      if (pogingen < 3) await kvSet(key, { ...g, pogingen }).catch(() => undefined);
      else vervallen++;
      logger.warn("gepland chatbericht niet verstuurd", { threadId: g.threadId, pogingen, error: (err as Error).message });
    }
  }
  return { verstuurd, vervallen };
}
