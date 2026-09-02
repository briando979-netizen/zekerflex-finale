import { listThreadsForUser, getMessages, unreadForUser } from "@/lib/messaging/store";
import { userDirectory } from "@/lib/messaging/contacts";

export interface RecentThread {
  id: string;
  kind: "direct" | "support" | "group";
  name: string;
  preview: string;
  at: string | null;
  unread: number;
}

/**
 * Compact thread previews for a dashboard "Berichten" panel. Read-only over the
 * filesystem chat store — never marks anything read.
 */
export async function recentThreads(
  userId: string,
  isAdmin: boolean,
  limit = 4,
): Promise<RecentThread[]> {
  const threads = (await listThreadsForUser(userId, isAdmin)).slice(0, limit);
  if (threads.length === 0) return [];

  const otherIds = threads.flatMap((t) => t.participants.filter((p) => p !== userId));
  const dir = await userDirectory(otherIds);

  const rows = await Promise.all(
    threads.map(async (t) => {
      const messages = await getMessages(t.id, 60);
      const other = t.participants.find((p) => p !== userId);
      const name =
        t.kind === "support"
          ? "ZekerFlex Support"
          : t.kind === "group"
            ? t.meta.title || "Community"
            : (other && dir.get(other)?.name) || t.meta.shiftTitle || "Gesprek";
      const preview =
        t.lastMessage != null
          ? `${t.lastMessage.from === userId ? "Jij: " : ""}${t.lastMessage.text}`
          : t.meta.shiftTitle ?? "Nieuw gesprek";
      return {
        id: t.id,
        kind: t.kind,
        name,
        preview: preview.length > 90 ? preview.slice(0, 89) + "…" : preview,
        at: t.lastMessageAt ?? null,
        unread: unreadForUser(t, messages, userId),
      } satisfies RecentThread;
    }),
  );
  return rows;
}
