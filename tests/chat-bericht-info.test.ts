import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// WhatsApp-uitbouw stap 8 (13 nov): berichtinfo van je eigen bericht — wie het gelezen heeft en wie nog niet, met
// dezelfde leesbevestigingsregels als de vinkjes, en geen tijden (die weten we niet per bericht).

let wie = "a";
const thread = {
  id: "g1",
  kind: "group",
  participants: ["a", "b", "c", "d"],
  createdAt: "",
  lastMessageAt: "",
  lastMessage: null,
  meta: {},
  // b las na het bericht, c ervoor, d heeft leesbevestigingen uit
  reads: { b: "2026-11-13T12:05:00+01:00", c: "2026-11-13T11:55:00+01:00", d: "2026-11-13T12:10:00+01:00" },
};
const bericht = { id: "m1", threadId: "g1", from: "a", at: "2026-11-13T12:00:00+01:00", text: "Wie kan zaterdag?", kind: "text" };
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: wie, fullName: wie }) }));
vi.mock("@/lib/messaging/contacts", () => ({
  isPlatformAdmin: async () => false,
  userDirectory: async (ids: string[]) => new Map(ids.map((id) => [id, { userId: id, name: `Naam ${id}`, role: "freelancer" }])),
}));
vi.mock("@/lib/messaging/store", () => ({
  getThread: async () => thread,
  canAccess: (t: typeof thread, uid: string) => t.participants.includes(uid),
  getMessageById: async (_t: string, id: string) => (id === "m1" ? bericht : null),
}));
let uit = new Set<string>(["d"]);
vi.mock("@/lib/messaging/settings", () => ({ chatPrivacy: async () => ({ hideOnline: new Set(), noReceipts: uit, noPreview: new Set() }) }));

import { berichtInfo } from "@/lib/messaging/bericht-info";
import { GET } from "@/app/api/inbox/[threadId]/info/route";

const haal = (messageId: string) => GET(new Request(`http://localhost/api/inbox/g1/info?messageId=${messageId}`), { params: Promise.resolve({ threadId: "g1" }) });

describe("berichtInfo", () => {
  it("gelezen als iemand het gesprek na het versturen las; wie bevestigingen uit heeft telt niet mee", () => {
    expect(berichtInfo(thread, bericht, "a", new Set(["d"]))).toEqual({ uit: false, gelezen: ["b"], nogNiet: ["c"], verborgen: 1 });
  });

  it("je eigen bevestigingen uit: je ziet niets", () => {
    expect(berichtInfo(thread, bericht, "a", new Set(["a"]))).toEqual({ uit: true, gelezen: [], nogNiet: [], verborgen: 0 });
  });
});

describe("GET /api/inbox/:id/info", () => {
  it("geeft de info van je eigen bericht, met namen", async () => {
    wie = "a";
    uit = new Set(["d"]);
    const res = await haal("m1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ uit: false, gelezen: ["b"], nogNiet: ["c"], verborgen: 1, namen: { b: "Naam b", c: "Naam c" } });
  });

  it("andermans bericht of een onbekend bericht: niet gevonden (geen 403)", async () => {
    wie = "b";
    expect((await haal("m1")).status).toBe(404);
    wie = "a";
    expect((await haal("bestaat-niet")).status).toBe(404);
  });
});

describe("in de chat", () => {
  it("alleen bij je eigen bericht staat Berichtinfo in het menu", () => {
    const bubbel = readFileSync(path.join(process.cwd(), "components/chat/MessageBubble.tsx"), "utf8").split("\r\n").join("\n");
    expect(bubbel).toContain('...(mine && onInfo && !m.pending ? [{ key: "info", label: t.info, icon: "ⓘ", run: () => onInfo(m) }] : []),');
  });
});
