import { listContacts } from "@/lib/messaging/contact-book";
import { listThreadsForUser } from "@/lib/messaging/store";

/**
 * Met wie je in contact staat: je bewaarde contacten en de andere kant van je gesprekken met één persoon. Rondzenden
 * en een contactkaart delen mogen alleen met deze mensen (zo kun je niemand bestoken of doorgeven die je niet kent).
 */
export async function bekendenVan(userId: string): Promise<Set<string>> {
  const [contacten, gesprekken] = await Promise.all([listContacts(userId), listThreadsForUser(userId, false)]);
  const ids = new Set<string>([...contacten.map((c) => c.userId), ...gesprekken.filter((t) => t.kind === "direct").flatMap((t) => t.participants)]);
  ids.delete(userId);
  return ids;
}
