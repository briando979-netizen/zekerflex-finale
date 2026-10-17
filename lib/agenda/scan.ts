import { logger } from "@/lib/logger";
import { acquireLock } from "@/lib/redis";
import { kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { extractAppointments, type AppointmentCandidate } from "@/lib/agenda/extract";
import { parseIcs } from "@/lib/agenda/ics";
import { cleanSubject, isBulkSender, stripQuotedReply } from "@/lib/agenda/mail-text";
import { describeAppointment } from "@/lib/agenda/titles";
import { addFoundItem, hasSourceRef, mailScanStateKey, removeBySourcePrefix, type AgendaSource } from "@/lib/agenda/store";
import { fetchForScan, fetchInboxList } from "@/lib/mail/imap";
import { imapConfigFor, mailboxPassword, type MailboxConnection } from "@/lib/mail/mailbox-connection";
import { userDirectory } from "@/lib/messaging/contacts";
import type { ChatMessage, ChatThread } from "@/lib/messaging/store";
import { getImportedChat } from "@/lib/whatsapp/store";

// ---------------------------------------------------------------------------
// Puts appointments into people's agendas straight from what they write and
// receive: chat messages, imported WhatsApp chats and their connected
// mailbox (text + calendar invitations). Runs after the response (after()),
// from user actions, plus a daily sweep of all connected mailboxes.
// ---------------------------------------------------------------------------

const HOUR = 60 * 60_000;
const MAX_PER_TEXT = 5;
const MAIL_PER_RUN = 8;
const WHATSAPP_WINDOW_DAYS = 60;
const WHATSAPP_AI_TITLES = 15;

/** Whose agenda an appointment goes into, and how it's labelled for them. */
interface Target {
  userId: string;
  sourceLabel: string;
  fallbackTitle: string;
}

const upcoming = (c: AppointmentCandidate) => c.start.getTime() >= Date.now() - HOUR;
const defaultEnd = (c: AppointmentCandidate) => (c.end ?? (c.allDay ? null : new Date(c.start.getTime() + HOUR)))?.toISOString() ?? null;

/**
 * Plans what one text says for the given people; returns how many new items
 * were added. The model is asked once per appointment, however many people
 * it is planned for — only the fallback title is per person.
 */
async function planFromText(
  targets: Target[],
  text: string,
  writtenAt: Date,
  source: AgendaSource,
  refBase: string,
  useAi = true,
): Promise<number> {
  const found = extractAppointments(text, writtenAt).filter(upcoming).slice(0, MAX_PER_TEXT);
  let added = 0;
  for (const c of found) {
    const sourceRef = `${refBase}@${c.start.toISOString()}`;
    const todo: Target[] = [];
    for (const t of targets) if (!(await hasSourceRef(t.userId, sourceRef))) todo.push(t);
    if (todo.length === 0) continue;
    const ai = useAi ? await describeAppointment(c.phrase, todo[0]!.sourceLabel, "") : null;
    for (const t of todo) {
      const item = await addFoundItem(t.userId, {
        title: ai?.byAi ? ai.title : t.fallbackTitle,
        start: c.start.toISOString(),
        end: defaultEnd(c),
        allDay: c.allDay,
        location: ai?.location ?? null,
        source,
        sourceLabel: t.sourceLabel,
        sourceRef,
        phrase: c.phrase,
      });
      if (item) added++;
    }
  }
  return added;
}

/** A 1-on-1 chat message: the appointment lands in both people's agendas. */
export async function scanChatMessage(thread: ChatThread, msg: ChatMessage): Promise<number> {
  if (thread.kind !== "direct" || msg.kind !== "text" || msg.auto || !msg.text.trim()) return 0;
  try {
    const dir = await userDirectory(thread.participants);
    const targets = thread.participants.map((userId) => {
      const other = thread.participants.find((id) => id !== userId);
      const name = (other && dir.get(other)?.name) || "contact";
      return { userId, sourceLabel: `Chat met ${name}`, fallbackTitle: `Afspraak met ${name}` };
    });
    return await planFromText(targets, msg.text, new Date(msg.at), "chat", `chat:${thread.id}:${msg.id}`);
  } catch (err) {
    logger.warn("agenda chat scan failed", { threadId: thread.id, error: (err as Error).message });
    return 0;
  }
}

/** An imported WhatsApp chat: recent messages only (older ones can't hold upcoming appointments). */
export async function scanWhatsAppChat(userId: string, chatId: string): Promise<number> {
  try {
    const found = await getImportedChat(userId, chatId);
    if (!found) return 0;
    const since = Date.now() - WHATSAPP_WINDOW_DAYS * 24 * HOUR;
    let added = 0;
    let aiBudget = WHATSAPP_AI_TITLES;
    for (let i = 0; i < found.messages.length; i++) {
      const m = found.messages[i]!;
      if (!m.author || m.media || new Date(m.at).getTime() < since) continue;
      const n = await planFromText(
        [{ userId, sourceLabel: `WhatsApp: ${found.chat.title}`, fallbackTitle: `Afspraak met ${found.chat.title}` }],
        m.text,
        new Date(m.at),
        "whatsapp",
        `wa:${chatId}:${i}`,
        aiBudget > 0,
      );
      aiBudget -= n;
      added += n;
    }
    return added;
  } catch (err) {
    logger.warn("agenda whatsapp scan failed", { chatId, error: (err as Error).message });
    return 0;
  }
}

interface MailScanState {
  lastUid: number;
}

/** New mail in the user's connected mailbox: invitations and appointments in the text. Mail stays unread. */
export async function scanMailbox(userId: string): Promise<number> {
  const unlock = await acquireLock(`agenda-mail-scan:${userId}`, 120_000).catch(() => null);
  if (!unlock) return 0;
  try {
    const conn = await kvGet<MailboxConnection>(`mailbox-connection:${userId}`);
    if (!conn) return 0;
    const cfg = await imapConfigFor(conn, mailboxPassword(conn));
    const list = await fetchInboxList(cfg, 30);
    if (list.length === 0) return 0;

    const stateKey = mailScanStateKey(userId);
    const state = await kvGet<MailScanState>(stateKey);
    // First scan: only the newest few — older mail can't hold many upcoming appointments.
    const floor = state?.lastUid ?? Math.max(0, (list[MAIL_PER_RUN - 1]?.uid ?? list[list.length - 1]!.uid) - 1);
    const fresh = list.filter((m) => m.uid > floor).sort((a, b) => a.uid - b.uid).slice(0, MAIL_PER_RUN);

    let added = 0;
    let lastUid = floor;
    for (const m of fresh) {
      lastUid = m.uid;
      if (isBulkSender(m.fromAddress, m.fromName)) continue;
      const content = await fetchForScan(cfg, m.uid).catch(() => null);
      if (!content) continue;
      const from = m.fromName || m.fromAddress || "onbekend";

      for (const ics of content.calendars) {
        for (const ev of parseIcs(ics)) {
          const ref = `ics:${ev.uid ?? `${m.uid}:${ev.start.toISOString()}`}`;
          if (ev.cancelled) {
            await removeBySourcePrefix(userId, ref);
            continue;
          }
          if ((ev.end ?? ev.start).getTime() < Date.now() - HOUR) continue;
          const item = await addFoundItem(userId, {
            title: ev.summary ?? cleanSubject(m.subject) ?? "Uitnodiging",
            start: ev.start.toISOString(),
            end: ev.end?.toISOString() ?? null,
            allDay: ev.allDay,
            location: ev.location,
            source: "ics",
            sourceLabel: `Uitnodiging van ${from}`,
            sourceRef: `${ref}@${ev.start.toISOString()}`,
            phrase: null,
          });
          if (item) added++;
        }
      }
      if (content.calendars.length > 0) continue;

      const subject = cleanSubject(m.subject);
      const text = `${subject ?? ""}\n${stripQuotedReply(content.text)}`;
      added += await planFromText(
        [{ userId, sourceLabel: `Mail van ${from}`, fallbackTitle: subject ?? `Afspraak met ${from}` }],
        text,
        m.date ? new Date(m.date) : new Date(),
        "mail",
        `mail:${m.uid}`,
      );
    }
    if (lastUid > (state?.lastUid ?? -1)) await kvSet(stateKey, { lastUid } satisfies MailScanState);
    return added;
  } catch (err) {
    logger.warn("agenda mail scan failed", { userId, error: (err as Error).message });
    return 0;
  } finally {
    await unlock();
  }
}

/** Daily safety net: every connected mailbox, also for people who didn't open ZekerFlex. */
export async function sweepMailboxes(limit = 100): Promise<{ mailboxes: number; added: number }> {
  const conns = await kvListValues<MailboxConnection>("mailbox-connection:", limit);
  let added = 0;
  for (const c of conns) added += await scanMailbox(c.userId);
  return { mailboxes: conns.length, added };
}
