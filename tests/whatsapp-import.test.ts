import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";

const saved = { chats: [] as unknown[], contacts: [] as unknown[] };
vi.mock("@/lib/whatsapp/store", () => ({
  saveImportedChat: async (_u: string, title: string, participants: string[], messages: unknown[]) => {
    const chat = { id: "c1", title, participants, messageCount: messages.length, firstAt: null, lastAt: null, importedAt: "" };
    saved.chats.push(chat);
    return chat;
  },
  mergeContacts: async (_u: string, contacts: unknown[]) => {
    saved.contacts.push(...contacts);
    return { importedAt: "", contacts };
  },
}));
const requirePrincipal = vi.fn().mockResolvedValue({ userId: "u1" });
vi.mock("@/lib/auth", () => ({ requirePrincipal: () => requirePrincipal() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue({ ok: true }) }));

import { parseWhatsAppExport } from "@/lib/whatsapp/export-parser";
import { normalizePhone, parseVCards } from "@/lib/whatsapp/vcard";
import { readZip } from "@/lib/zip/read";
import { importWhatsAppFile, titleFromFilename } from "@/lib/whatsapp/import";
import { POST } from "@/app/api/me/whatsapp/import/route";

afterEach(() => {
  saved.chats = [];
  saved.contacts = [];
});

/** Builds a real ZIP (deflate) in memory, the way WhatsApp/phones write them. */
function makeZip(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const comp = deflateRawSync(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, comp);
    centrals.push(central, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

describe("WhatsApp chat export parser", () => {
  it("reads Android lines, joins multi-line messages and spots system lines and left-out media", () => {
    const chat = parseWhatsAppExport(
      [
        "15-10-2026 09:40 - Berichten en oproepen worden end-to-end versleuteld.",
        "15-10-2026 09:41 - Jan de Vries: Kun je morgen om 8 uur?",
        "15-10-2026 09:43 - Bakkerij Bol: Ja prima.",
        "Ik neem de sleutel mee.",
        "15-10-2026 09:44 - Jan de Vries: <Media weggelaten>",
        "15-10-2026 09:45 - Jan de Vries heeft de groepsnaam gewijzigd in: Team Bol",
      ].join("\n"),
    );
    expect(chat.participants).toEqual(["Jan de Vries", "Bakkerij Bol"]);
    expect(chat.messages[0]).toMatchObject({ author: null });
    expect(chat.messages[1]).toMatchObject({ author: "Jan de Vries", text: "Kun je morgen om 8 uur?", at: "2026-10-15T07:41:00.000Z" });
    expect(chat.messages[2]!.text).toBe("Ja prima.\nIk neem de sleutel mee.");
    expect(chat.messages[3]!.media).toBe(true);
    expect(chat.messages[4]).toMatchObject({ author: null, text: "Jan de Vries heeft de groepsnaam gewijzigd in: Team Bol" });
  });

  it("reads iPhone lines with seconds and hidden direction marks, in winter time too", () => {
    const chat = parseWhatsAppExport("‎[15-01-2026 09:41:12] Jan: ‎afbeelding weggelaten\r\n[15-01-2026 09:41:30] Jan: Dinsdag 14:30?");
    expect(chat.messages[0]!.media).toBe(true);
    expect(chat.messages[1]).toMatchObject({ author: "Jan", text: "Dinsdag 14:30?", at: "2026-01-15T08:41:30.000Z" });
  });

  it("detects month-first US exports and AM/PM", () => {
    const chat = parseWhatsAppExport("10/15/26, 9:41 AM - Jan: Hi\n10/15/26, 12:05 PM - Bol: Lunch?\n10/15/26, 12:30 AM - Jan: late");
    expect(chat.messages.map((m) => m.at)).toEqual(["2026-10-15T07:41:00.000Z", "2026-10-15T10:05:00.000Z", "2026-10-14T22:30:00.000Z"]);
  });
});

describe("contacts (.vcf)", () => {
  it("handles vCard 2.1 quoted-printable, 3.0 folding and 4.0 tel: URIs", () => {
    const contacts = parseVCards(
      [
        "BEGIN:VCARD",
        "VERSION:2.1",
        "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Vries;Jan;de;;",
        "TEL;CELL:06-12345678",
        "TEL;WORK:+31 (0)20 123 4567",
        "END:VCARD",
        "BEGIN:VCARD",
        "VERSION:3.0",
        "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Caf=C3=A9 de Hoek",
        "ORG:Café de Hoek B.V.;Keuken",
        "item1.EMAIL;type=INTERNET:Planning@CafeDeHoek.nl",
        "NOTE:lange notitie die",
        " doorloopt",
        "END:VCARD",
        "BEGIN:VCARD",
        "VERSION:4.0",
        "N:Jansen;Piet;;;",
        "TEL;VALUE=uri;TYPE=cell:tel:+32-470-12-34-56",
        "END:VCARD",
        "BEGIN:VCARD",
        "FN:Zonder gegevens",
        "END:VCARD",
      ].join("\r\n"),
    );
    expect(contacts).toEqual([
      { name: "Jan de Vries", phones: ["+31612345678", "+31201234567"], emails: [], organization: null },
      { name: "Café de Hoek", phones: [], emails: ["planning@cafedehoek.nl"], organization: "Café de Hoek B.V." },
      { name: "Piet Jansen", phones: ["+32470123456"], emails: [], organization: null },
    ]);
  });

  it("normalises Dutch numbers to international format", () => {
    expect(normalizePhone("06 1234 5678")).toBe("+31612345678");
    expect(normalizePhone("0031 6 1234 5678")).toBe("+31612345678");
    expect(normalizePhone("+31 (0)6-12345678")).toBe("+31612345678");
    expect(normalizePhone("abc")).toBeNull();
  });
});

describe("zip + import routing", () => {
  it("reads a deflated zip with a UTF-8 file name", () => {
    const zip = makeZip([
      { name: "WhatsApp-chat met Jan één.txt", data: Buffer.from("15-10-2026 09:41 - Jan: Hoi ✓") },
      { name: "IMG-20261015-WA0001.jpg", data: Buffer.alloc(3000, 7) },
    ]);
    const entries = readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(["WhatsApp-chat met Jan één.txt", "IMG-20261015-WA0001.jpg"]);
    expect(entries[0]!.read().toString("utf8")).toBe("15-10-2026 09:41 - Jan: Hoi ✓");
  });

  it("takes the chat title from WhatsApp's file names", () => {
    expect(titleFromFilename("WhatsApp-chat met Jan de Vries.txt")).toBe("Jan de Vries");
    expect(titleFromFilename("WhatsApp Chat - Bakkerij Bol.zip")).toBe("Bakkerij Bol");
    expect(titleFromFilename("WhatsApp Chat with Jan.txt")).toBe("Jan");
    expect(titleFromFilename("export.txt")).toBeNull();
  });

  it("imports an iPhone zip (_chat.txt inside) under the zip's name", async () => {
    const zip = makeZip([{ name: "_chat.txt", data: Buffer.from("[15-10-2026 09:41:12] Jan: Hoi\n[15-10-2026 09:42:00] Bol: Hallo") }]);
    const result = await importWhatsAppFile("u1", "WhatsApp Chat - Jan.zip", zip);
    expect(result).toMatchObject({ kind: "chat", chat: { title: "Jan", messageCount: 2 } });
  });

  it("routes a .vcf to the address book and rejects files that aren't exports", async () => {
    const vcf = Buffer.from("BEGIN:VCARD\nFN:Jan\nTEL:0612345678\nEND:VCARD");
    expect(await importWhatsAppFile("u1", "contacten.vcf", vcf)).toMatchObject({ kind: "contacts", imported: 1 });
    await expect(importWhatsAppFile("u1", "boodschappen.txt", Buffer.from("melk\nbrood"))).rejects.toThrow(/geen WhatsApp-export/);
  });

  it("upload route: 201 for an export, 422 for a file that's too large", async () => {
    const ok = new FormData();
    ok.append("file", new File(["15-10-2026 09:41 - Jan: Hoi"], "WhatsApp-chat met Jan.txt", { type: "text/plain" }));
    const res = await POST(new Request("http://localhost/api/me/whatsapp/import", { method: "POST", body: ok }));
    expect(res.status).toBe(201);

    const big = new FormData();
    big.append("file", new File([new Uint8Array(4 * 1024 * 1024 + 1)], "groot.zip"));
    const tooBig = await POST(new Request("http://localhost/api/me/whatsapp/import", { method: "POST", body: big }));
    expect(tooBig.status).toBe(422);
  });
});
