import { randomUUID } from "node:crypto";
import { kvDelete, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import type { WhatsAppMessage } from "@/lib/whatsapp/export-parser";
import type { ImportedContact } from "@/lib/whatsapp/vcard";

// ---------------------------------------------------------------------------
// WhatsApp data a user imported (chat exports + phone contacts), private to
// that user. Read-only archive: replying goes through WhatsApp itself until
// the Business API is connected.
//   key "wa-chat:<userId>:<chatId>"  — chat metadata (cheap to list)
//   key "wa-msgs:<userId>:<chatId>"  — that chat's messages
//   key "wa-contacts:<userId>"       — merged address book
// ---------------------------------------------------------------------------

export const MAX_MESSAGES_PER_CHAT = 10_000;
export const MAX_CONTACTS = 5_000;

export interface ImportedChat {
  id: string;
  title: string;
  participants: string[];
  messageCount: number;
  firstAt: string | null;
  lastAt: string | null;
  importedAt: string;
}

export interface ContactBook {
  importedAt: string;
  contacts: ImportedContact[];
}

const chatKey = (userId: string, id: string) => `wa-chat:${userId}:${id}`;
const msgsKey = (userId: string, id: string) => `wa-msgs:${userId}:${id}`;
const contactsKey = (userId: string) => `wa-contacts:${userId}`;

export async function saveImportedChat(
  userId: string,
  title: string,
  participants: string[],
  messages: WhatsAppMessage[],
): Promise<ImportedChat> {
  const kept = messages.slice(-MAX_MESSAGES_PER_CHAT);
  const chat: ImportedChat = {
    id: randomUUID().slice(0, 12),
    title: title.slice(0, 120),
    participants: participants.slice(0, 50),
    messageCount: kept.length,
    firstAt: kept[0]?.at ?? null,
    lastAt: kept[kept.length - 1]?.at ?? null,
    importedAt: new Date().toISOString(),
  };
  await kvSet(msgsKey(userId, chat.id), kept);
  await kvSet(chatKey(userId, chat.id), chat);
  return chat;
}

export async function listImportedChats(userId: string): Promise<ImportedChat[]> {
  const rows = await kvListValues<ImportedChat>(`wa-chat:${userId}:`, 500);
  return rows.sort((a, b) => ((a.lastAt ?? "") < (b.lastAt ?? "") ? 1 : -1));
}

export async function getImportedChat(
  userId: string,
  id: string,
): Promise<{ chat: ImportedChat; messages: WhatsAppMessage[] } | null> {
  const chat = await kvGet<ImportedChat>(chatKey(userId, id));
  if (!chat) return null;
  return { chat, messages: (await kvGet<WhatsAppMessage[]>(msgsKey(userId, id))) ?? [] };
}

export async function deleteImportedChat(userId: string, id: string): Promise<void> {
  await kvDelete(msgsKey(userId, id));
  await kvDelete(chatKey(userId, id));
}

/** Merges new contacts into the book: same phone number or e-mail = same person (latest import wins). */
export async function mergeContacts(userId: string, incoming: ImportedContact[]): Promise<ContactBook> {
  const book = (await kvGet<ContactBook>(contactsKey(userId))) ?? { importedAt: "", contacts: [] };
  const identities = (c: ImportedContact) => [...c.phones, ...c.emails];
  const merged = [...incoming];
  const seen = new Set(incoming.flatMap(identities));
  for (const old of book.contacts) {
    if (!identities(old).some((id) => seen.has(id))) merged.push(old);
  }
  const next: ContactBook = {
    importedAt: new Date().toISOString(),
    contacts: merged.sort((a, b) => a.name.localeCompare(b.name, "nl")).slice(0, MAX_CONTACTS),
  };
  await kvSet(contactsKey(userId), next);
  return next;
}

export async function getContacts(userId: string): Promise<ContactBook> {
  return (await kvGet<ContactBook>(contactsKey(userId))) ?? { importedAt: "", contacts: [] };
}

export async function clearContacts(userId: string): Promise<void> {
  await kvDelete(contactsKey(userId));
}
