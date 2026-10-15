import { AppError } from "@/lib/errors";
import { readZip } from "@/lib/zip/read";
import { parseWhatsAppExport } from "@/lib/whatsapp/export-parser";
import { parseVCards } from "@/lib/whatsapp/vcard";
import { mergeContacts, saveImportedChat, type ImportedChat } from "@/lib/whatsapp/store";

export type ImportResult =
  | { kind: "chat"; chat: ImportedChat }
  | { kind: "contacts"; imported: number; total: number };

/** "WhatsApp-chat met Jan de Vries.txt" / "WhatsApp Chat - Jan.zip" / "WhatsApp Chat with Jan.txt" → the other party. */
export function titleFromFilename(filename: string): string | null {
  const base = filename.replace(/\.(txt|zip)$/i, "").trim();
  const m = /^WhatsApp[- ]?chat\s*(?:met|with|-|–)\s*(.+)$/i.exec(base);
  return m?.[1]?.trim() || null;
}

const isZip = (b: Buffer) => b.length > 4 && b.readUInt32LE(0) === 0x04034b50;
const isVcard = (text: string) => /^\s*﻿?BEGIN:VCARD/i.test(text);

async function importContacts(userId: string, text: string): Promise<ImportResult> {
  const contacts = parseVCards(text);
  if (contacts.length === 0) throw AppError.validation("Geen contacten met een telefoonnummer of e-mailadres gevonden in dit bestand.");
  const book = await mergeContacts(userId, contacts);
  return { kind: "contacts", imported: contacts.length, total: book.contacts.length };
}

async function importChat(userId: string, filename: string, text: string): Promise<ImportResult> {
  const parsed = parseWhatsAppExport(text);
  if (parsed.messages.length === 0) {
    throw AppError.validation("Dit lijkt geen WhatsApp-export. Kies in WhatsApp: gesprek → Meer → Chat exporteren → Zonder media.");
  }
  const title = titleFromFilename(filename) ?? (parsed.participants.join(", ") || "WhatsApp-gesprek");
  const chat = await saveImportedChat(userId, title, parsed.participants, parsed.messages);
  return { kind: "chat", chat };
}

export async function importWhatsAppFile(userId: string, filename: string, bytes: Buffer): Promise<ImportResult> {
  if (isZip(bytes)) {
    let entries;
    try {
      entries = readZip(bytes);
    } catch {
      throw AppError.validation("Dit zip-bestand kan niet gelezen worden.");
    }
    const vcf = entries.find((e) => /\.vcf$/i.test(e.name));
    if (vcf) return importContacts(userId, vcf.read().toString("utf8"));
    const txt =
      entries.find((e) => /(^|\/)_chat\.txt$/i.test(e.name)) ?? entries.find((e) => /\.txt$/i.test(e.name) && !e.name.startsWith("__MACOSX"));
    if (!txt) throw AppError.validation("Geen chatbestand (.txt) gevonden in dit zip-bestand.");
    return importChat(userId, titleFromFilename(filename) ? filename : txt.name.split("/").pop() ?? filename, txt.read().toString("utf8"));
  }
  const text = bytes.toString("utf8");
  if (/\.vcf$/i.test(filename) || isVcard(text)) return importContacts(userId, text);
  return importChat(userId, filename, text);
}
