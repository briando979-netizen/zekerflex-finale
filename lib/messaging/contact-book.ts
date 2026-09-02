import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Personal contact book — saved / favourite people you message. Per account,
// filesystem only:  storage/contacts/<userId>.json
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

const dir = () => join(process.cwd(), "storage", "contacts");
const file = (userId: string) => join(dir(), `${userId.replace(/[^a-z0-9-]/gi, "")}.json`);

async function read(userId: string): Promise<ContactBook> {
  const p = file(userId);
  if (!existsSync(p)) return { contacts: [] };
  try {
    return JSON.parse(await readFile(p, "utf8")) as ContactBook;
  } catch {
    return { contacts: [] };
  }
}

async function write(userId: string, book: ContactBook): Promise<void> {
  await mkdir(dir(), { recursive: true });
  await writeFile(file(userId), JSON.stringify(book, null, 2), "utf8");
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
