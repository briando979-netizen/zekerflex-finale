import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Personal contact book — saved / favourite people you message. Postgres-
// backed (KeyValueStore, key "contacts:<userId>") — was local disk,
// unreliable on Vercel's serverless functions.
// ---------------------------------------------------------------------------

export interface SavedContact {
  userId: string;
  label?: string; // e.g. "Vaste opdrachtgever Jumbo"
  favourite: boolean;
  addedAt: string;
}

interface ContactBook {
  contacts: SavedContact[];
}

const key = (userId: string) => `contacts:${userId}`;

async function read(userId: string): Promise<ContactBook> {
  return (await kvGet<ContactBook>(key(userId))) ?? { contacts: [] };
}

async function write(userId: string, book: ContactBook): Promise<void> {
  await kvSet(key(userId), book);
}

export async function listContacts(userId: string): Promise<SavedContact[]> {
  const { contacts } = await read(userId);
  return [...contacts].sort((a, b) =>
    a.favourite === b.favourite ? (a.addedAt < b.addedAt ? 1 : -1) : a.favourite ? -1 : 1,
  );
}

export async function saveContact(
  userId: string,
  target: string,
  opts: { label?: string; favourite?: boolean } = {},
): Promise<SavedContact> {
  if (target === userId) throw new Error("cannot save yourself");
  const book = await read(userId);
  const existing = book.contacts.find((c) => c.userId === target);
  if (existing) {
    if (opts.label !== undefined) {
      if (opts.label) existing.label = opts.label;
      else delete existing.label;
    }
    if (opts.favourite !== undefined) existing.favourite = opts.favourite;
    await write(userId, book);
    return existing;
  }
  const created: SavedContact = {
    userId: target,
    favourite: opts.favourite ?? false,
    addedAt: new Date().toISOString(),
    ...(opts.label ? { label: opts.label } : {}),
  };
  book.contacts.push(created);
  await write(userId, book);
  return created;
}

export async function removeContact(userId: string, target: string): Promise<void> {
  const book = await read(userId);
  book.contacts = book.contacts.filter((c) => c.userId !== target);
  await write(userId, book);
}

export async function isSavedContact(userId: string, target: string): Promise<boolean> {
  const { contacts } = await read(userId);
  return contacts.some((c) => c.userId === target);
}
