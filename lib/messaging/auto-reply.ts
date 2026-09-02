import { getMessages, getThread, postMessage } from "@/lib/messaging/store";
import { getChatSettings } from "@/lib/messaging/settings";
import { getPresence } from "@/lib/messaging/presence";
import { mayPingNow } from "@/lib/notifications/timing";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Automatic reply ("afwezigheidsbericht"). When someone messages a user who
// has auto-reply on — and isn't around — post their canned answer once.
// Loop-safe: never auto-replies to an auto-reply, at most once per 6h/thread.
// ---------------------------------------------------------------------------

const COOLDOWN_MS = 6 * 60 * 60 * 1000;

export async function maybeAutoReply(
  threadId: string,
  recipientId: string,
  senderId: string,
): Promise<void> {
  try {
    if (recipientId === senderId || recipientId === "system") return;
    const settings = await getChatSettings(recipientId);
    if (!settings.autoReply.enabled || !settings.autoReply.text.trim()) return;

    const thread = await getThread(threadId);
    if (!thread || thread.kind === "group") return;

    const msgs = await getMessages(threadId, 40);
    // don't chain off another automatic message
    const last = msgs[msgs.length - 1];
    if (last?.auto) return;
    // one auto-reply per cooldown window
    const recentAuto = msgs.find(
      (m) => m.auto && m.from === recipientId && Date.now() - new Date(m.at).getTime() < COOLDOWN_MS,
    );
    if (recentAuto) return;
    // if the recipient already answered after the sender's latest message, skip
    const senderLast = [...msgs].reverse().find((m) => m.from === senderId);
    if (senderLast) {
      const answered = msgs.some(
        (m) => m.from === recipientId && new Date(m.at).getTime() > new Date(senderLast.at).getTime(),
      );
      if (answered) return;
    }

    if (settings.autoReply.onlyWhenAway) {
      const presence = (await getPresence([recipientId]))[recipientId];
      if (presence?.online) return;
      // also respect their active-hours window
      const profile = await prisma.freelancerProfile
        .findUnique({
          where: { userId: recipientId },
          select: { timezone: true, quietHoursStart: true, quietHoursEnd: true, learnedActiveHours: true },
        })
        .catch(() => null);
      if (profile && mayPingNow(profile)) return;
    }

    await postMessage(threadId, recipientId, settings.autoReply.text.trim(), "text", { auto: true });
  } catch {
    /* best effort — auto-reply never blocks a send */
  }
}
