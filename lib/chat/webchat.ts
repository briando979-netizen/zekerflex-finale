import { kvFindByField, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Website-chat conversations as tickets. Every visitor conversation with the
// homepage assistant is kept; an admin can read along, take over (the AI then
// stays quiet), reply live, and close it. The visitor's widget polls for new
// messages, so a human reply shows up within seconds.
//   key "webchat:<conversationId>"  (the id is a random token from the widget)
// ---------------------------------------------------------------------------

export type WebchatStatus = "open" | "human" | "closed";

export interface WebchatMessage {
  role: "user" | "assistant" | "agent";
  content: string;
  at: string;
  /** agent name for human replies */
  by?: string;
}

export interface WebchatConversation {
  id: string;
  status: WebchatStatus;
  startedAt: string;
  lastAt: string;
  page?: string;
  messages: WebchatMessage[];
  /** visitor messages an agent hasn't seen yet */
  unread: number;
}

export const isConversationId = (id: unknown): id is string => typeof id === "string" && /^[\w-]{12,48}$/.test(id);
const key = (id: string) => `webchat:${id}`;
const MAX_MESSAGES = 200;

export async function getConversation(id: string): Promise<WebchatConversation | null> {
  return isConversationId(id) ? kvGet<WebchatConversation>(key(id)) : null;
}

export async function appendMessage(id: string, msg: Omit<WebchatMessage, "at">, page?: string): Promise<WebchatConversation> {
  const now = new Date().toISOString();
  const cur = (await getConversation(id)) ?? { id, status: "open" as const, startedAt: now, lastAt: now, messages: [], unread: 0, ...(page ? { page } : {}) };
  const next: WebchatConversation = {
    ...cur,
    lastAt: now,
    messages: [...cur.messages, { ...msg, content: msg.content.slice(0, 4000), at: now }].slice(-MAX_MESSAGES),
    unread: msg.role === "user" ? cur.unread + 1 : cur.unread,
    // A visitor writing again re-opens a closed ticket.
    status: msg.role === "user" && cur.status === "closed" ? "open" : cur.status,
  };
  await kvSet(key(id), next);
  meldBericht(msg.role, cur.messages.length === 0, next.page);
  return next;
}

/**
 * De eigenaar melden (lib/ops/melder.ts): alleen dat er iets gebeurde en op welke pagina, nooit de vraag zelf (die kan een naam of
 * nummer bevatten; de inhoud staat bij Websitechat). Alles gaat in het uurbericht: de websitechat is publiek en kan veel berichten
 * geven, dus een direct bericht per gesprek zou de telefoon kunnen overspoelen.
 */
function meldBericht(role: WebchatMessage["role"], eerste: boolean, page: string | undefined): void {
  const pagina = page ? page.split(/[?#]/)[0]?.slice(0, 80) : undefined;
  const nieuw =
    role === "user"
      ? eerste
        ? { titel: "Een bezoeker begon een gesprek met de assistent", belang: "samenvatting" as const }
        : { titel: "Een bezoeker stelde een vraag aan de assistent", belang: "samenvatting" as const }
      : role === "assistant"
        ? { titel: "De assistent antwoordde een bezoeker", belang: "samenvatting" as const }
        : { titel: "Een medewerker antwoordde in de websitechat", belang: "samenvatting" as const };
  void import("@/lib/ops/melder")
    .then(({ meldGebeurtenis }) => meldGebeurtenis({ soort: "assistent", ...nieuw, ...(pagina ? { detail: `Pagina ${pagina}` } : {}), url: "/admin/webchat" }))
    .catch(() => undefined);
}

export async function setStatus(id: string, status: WebchatStatus): Promise<WebchatConversation | null> {
  const cur = await getConversation(id);
  if (!cur) return null;
  const next = { ...cur, status };
  await kvSet(key(id), next);
  return next;
}

export async function markRead(id: string): Promise<void> {
  const cur = await getConversation(id);
  if (cur && cur.unread) await kvSet(key(id), { ...cur, unread: 0 });
}

export async function listConversations(filter: "all" | WebchatStatus = "all", limit = 200): Promise<WebchatConversation[]> {
  const rows = filter === "all" ? await kvListValues<WebchatConversation>("webchat:", limit) : await kvFindByField<WebchatConversation>("webchat:", "status", filter, limit);
  return rows.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
}
