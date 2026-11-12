import { logger } from "@/lib/logger";
import { sendMixedPush } from "@/lib/notifications/localized-push";
import { platformAdminIds, userDirectory } from "@/lib/messaging/contacts";
import { visibleUsers } from "@/lib/messaging/presence";
import { getChatPrefs, isMuted } from "@/lib/messaging/thread-prefs";
import { chatPrivacy } from "@/lib/messaging/settings";
import { previewText, type ChatMessage, type ChatThread } from "@/lib/messaging/store";

// ---------------------------------------------------------------------------
// Phone/laptop notifications for the chat: incoming calls, missed calls and
// new messages. A ringing call is pushed to every device of the callee — it
// is urgent and over within 45s. Messages skip anyone who has a ZekerFlex tab
// in view (they see it arrive in-app) and group threads (too noisy).
// ---------------------------------------------------------------------------

type CallMode = "audio" | "video" | "screen";

const RING_TTL_SEC = 45; // the caller hangs up after 45s; a later delivery is useless
const MISSED_TTL_SEC = 24 * 60 * 60;
const CHAT_TTL_SEC = 24 * 60 * 60;

/** Role-neutral entry point; app/berichten redirects to the right inbox. */
export function chatUrl(threadId: string): string {
  return `/berichten?thread=${encodeURIComponent(threadId)}`;
}

async function nameOf(userId: string): Promise<string> {
  const dir = await userDirectory([userId]);
  return dir.get(userId)?.name ?? "Iemand";
}

export async function notifyIncomingCall(
  thread: ChatThread,
  callerId: string,
  callId: string,
  mode: CallMode,
): Promise<void> {
  const callees = thread.participants.filter((id) => id !== callerId);
  if (callees.length === 0) return;
  try {
    const name = await nameOf(callerId);
    // een werker leest dit in zijn app-taal; een opdrachtgever in het Nederlands (sendMixedPush)
    await sendMixedPush(callees, (t) => ({
      title: t.callTitle(name, mode === "video"),
      body: t.callBody,
      data: { type: "CALL", url: chatUrl(thread.id), tag: `call-${callId}` },
      ttlSeconds: RING_TTL_SEC,
    }));
  } catch (err) {
    logger.warn("incoming-call push failed", { threadId: thread.id, error: (err as Error).message });
  }
}

export async function notifyMissedCall(
  thread: ChatThread,
  callerId: string,
  callId: string,
  mode: CallMode,
): Promise<void> {
  const callees = thread.participants.filter((id) => id !== callerId);
  if (callees.length === 0) return;
  try {
    const name = await nameOf(callerId);
    await sendMixedPush(callees, (t) => ({
      title: t.missedTitle(name),
      body: mode === "video" ? t.missedVideoBody : t.missedBody,
      // Same tag as the ringing notification, so it replaces it on the device.
      data: { type: "CALL_MISSED", url: chatUrl(thread.id), tag: `call-${callId}` },
      ttlSeconds: MISSED_TTL_SEC,
    }));
  } catch (err) {
    logger.warn("missed-call push failed", { threadId: thread.id, error: (err as Error).message });
  }
}

/**
 * Who should hear about a new message: the other side of a direct chat; on a
 * support thread the user who opened it (when support answers) or the
 * platform admins (when the user writes).
 */
async function recipientsFor(thread: ChatThread, msg: ChatMessage): Promise<string[]> {
  if (thread.kind === "direct") return thread.participants.filter((id) => id !== msg.from);
  if (thread.kind === "support") {
    const fromUser = thread.participants.includes(msg.from);
    if (!fromUser) return thread.participants;
    return (await platformAdminIds()).filter((id) => id !== msg.from);
  }
  return [];
}

export async function notifyNewMessage(thread: ChatThread, msg: ChatMessage): Promise<void> {
  if (msg.kind === "call" || msg.kind === "system" || msg.auto) return;
  try {
    const recipients = await recipientsFor(thread, msg);
    if (recipients.length === 0) return;
    const inView = await visibleUsers(recipients);
    // "Dempen" (lib/messaging/thread-prefs.ts): no push for a muted conversation
    const muted = new Set(
      (await Promise.all(recipients.map(async (id) => (isMuted(await getChatPrefs(id), thread.id) ? id : null)))).filter(Boolean),
    );
    const targets = recipients.filter((id) => !inView.has(id) && !muted.has(id));
    if (targets.length === 0) return;

    const supportAnswer = thread.kind === "support" && !thread.participants.includes(msg.from);
    const title = supportAnswer ? "ZekerFlex Support" : await nameOf(msg.from);
    const { noPreview } = await chatPrivacy(targets);
    const withPreview = targets.filter((id) => !noPreview.has(id));
    const withoutPreview = targets.filter((id) => noPreview.has(id));
    const data = { type: "CHAT", url: chatUrl(thread.id), tag: `thread-${thread.id}` };
    if (withPreview.length) await sendMixedPush(withPreview, (t) => ({ title, body: previewText(msg).slice(0, 140) || t.newMessage, data, ttlSeconds: CHAT_TTL_SEC }));
    if (withoutPreview.length) await sendMixedPush(withoutPreview, (t) => ({ title, body: t.newMessage, data, ttlSeconds: CHAT_TTL_SEC }));
  } catch (err) {
    logger.warn("chat push failed", { threadId: thread.id, error: (err as Error).message });
  }
}
