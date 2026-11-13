import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WhatsApp-uitbouw stap 7 (13 nov): groepsbeheer. Iedereen kan de groep verlaten (de eigenaar geeft hem dan door),
// beheerders maken anderen beheerder, en de naam en omschrijving zijn te wijzigen; elke wijziging zet een regel in het
// groepsgesprek.

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
  kvAppend: async (k: string, v: unknown) => void kv.set(k, [...((kv.get(k) as unknown[]) ?? []), structuredClone(v)]),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
}));
let wie = "u_eig";
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: wie, fullName: wie === "u_eig" ? "Eva Eigenaar" : wie === "u_beh" ? "Bert Beheer" : "Lotte Lid" }) }));
const namen: Record<string, string> = { u_eig: "Eva Eigenaar", u_beh: "Bert Beheer", u_lid: "Lotte Lid" };
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: async ({ where }: { where: { id: string } }) => ({ fullName: namen[where.id] ?? "Iemand", disabledAt: null }) } } }));

import { addMember, createCommunity, getCommunity, leaveCommunity, setMemberRole } from "@/lib/communities/store";
import { getMessages } from "@/lib/messaging/store";
import { opvolgerVan } from "@/components/chat/groep-opvolger";
import { DELETE as leden, PATCH as rolRoute } from "@/app/api/communities/[id]/members/route";
import { PATCH as hernoem } from "@/app/api/communities/[id]/route";

let groepId = "";
const groep = async () => (await getCommunity(groepId))!;
const regels = async () => (await getMessages((await groep()).threadId!)).filter((m) => m.kind === "system").map((m) => m.text);
const verzoek = (methode: string, pad: string, body?: unknown) =>
  new Request(`http://localhost${pad}`, { method: methode, ...(body ? { body: JSON.stringify(body) } : {}) });
const params = () => ({ params: Promise.resolve({ id: groepId }) });

beforeEach(async () => {
  kv.clear();
  wie = "u_eig";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-13T10:00:00+01:00"));
  const c = await createCommunity("u_eig", "Team Zaterdag");
  groepId = c.id;
  vi.setSystemTime(new Date("2026-11-13T10:05:00+01:00"));
  await addMember(await groep(), "u_lid");
  vi.setSystemTime(new Date("2026-11-13T10:10:00+01:00"));
  await addMember(await groep(), "u_beh", "admin");
});
afterEach(() => vi.useRealTimers());

describe("de groep verlaten", () => {
  it("de eigenaar geeft de groep door aan de beheerder die het langst lid is (anders het oudste lid)", async () => {
    expect(opvolgerVan((await groep()).members, "u_eig")).toBe("u_beh");
    expect(await leaveCommunity(await groep(), "u_eig")).toEqual({ newOwnerId: "u_beh" });
    const c = await groep();
    expect(c.ownerId).toBe("u_beh");
    expect(c.members.map((m) => [m.userId, m.role])).toEqual([
      ["u_lid", "member"],
      ["u_beh", "owner"],
    ]);
    // zonder beheerder: het oudste lid
    expect(opvolgerVan([{ userId: "x", role: "owner" }, { userId: "b", role: "member", joinedAt: "2" }, { userId: "a", role: "member", joinedAt: "1" }], "x")).toBe("a");
  });

  it("het laatste lid kan niet weg", async () => {
    const c = await createCommunity("u_eig", "Alleen ik");
    await expect(leaveCommunity(c, "u_eig")).rejects.toThrow("Je bent het enige lid van deze groep.");
  });

  it("de route: zelf verlaten zet een regel in het gesprek, en het gesprek heeft je niet meer als deelnemer", async () => {
    wie = "u_lid";
    expect((await leden(verzoek("DELETE", `/api/communities/${groepId}/members`), params())).status).toBe(200);
    expect(await regels()).toContain("Lotte Lid heeft de groep verlaten.");
    wie = "u_eig";
    expect((await leden(verzoek("DELETE", `/api/communities/${groepId}/members`), params())).status).toBe(200);
    expect(await regels()).toContain("Eva Eigenaar heeft de groep verlaten. Bert Beheer is nu de eigenaar.");
    const t = (kv.get(`chat-thread:${(await groep()).threadId}`) as { participants: string[] }).participants;
    expect(t).toEqual(["u_beh"]);
  });
});

describe("beheerder maken en naam wijzigen", () => {
  it("een beheerder maakt een lid beheerder en trekt het weer in; de eigenaar blijft eigenaar", async () => {
    wie = "u_beh";
    expect((await rolRoute(verzoek("PATCH", "/x", { userId: "u_lid", role: "admin" }), params())).status).toBe(200);
    expect((await groep()).members.find((m) => m.userId === "u_lid")?.role).toBe("admin");
    expect(await regels()).toContain("Bert Beheer heeft Lotte Lid beheerder gemaakt.");
    expect((await rolRoute(verzoek("PATCH", "/x", { userId: "u_lid", role: "member" }), params())).status).toBe(200);
    expect(await regels()).toContain("Lotte Lid is geen beheerder meer.");
    expect((await rolRoute(verzoek("PATCH", "/x", { userId: "u_eig", role: "member" }), params())).status).toBe(422);
    await expect(setMemberRole(await groep(), "u_vreemd", "admin")).rejects.toThrow();
  });

  it("een gewoon lid mag dat niet", async () => {
    wie = "u_lid";
    expect((await rolRoute(verzoek("PATCH", "/x", { userId: "u_beh", role: "member" }), params())).status).toBe(403);
  });

  it("naam en omschrijving wijzigen geeft een regel in het gesprek", async () => {
    const res = await hernoem(verzoek("PATCH", "/x", { name: "Team Zondag", description: "Alles voor zondag" }), params());
    expect(res.status).toBe(200);
    expect(await regels()).toEqual(expect.arrayContaining(["Eva Eigenaar heeft de groepsnaam gewijzigd in “Team Zondag”.", "Eva Eigenaar heeft de groepsbeschrijving gewijzigd."]));
  });
});

describe("het venster", () => {
  it("rollen in gewone taal, verlaten voor iedereen, beheeracties niet op je eigen rij of die van de eigenaar", () => {
    const venster = readFileSync(path.join(process.cwd(), "components/chat/modals.tsx"), "utf8").split("\r\n").join("\n");
    expect(venster).toContain('const rol = (r: string) => (r === "owner" ? t.eigenaar : r === "admin" ? t.beheerder : t.lid);');
    expect(venster).toContain("{canManage && m.userId !== c.ownerId && m.userId !== c.myUserId && (");
    expect(venster).toContain("{t.groepVerlaten}");
    expect(venster).not.toContain("{m.role === \"owner\" ? chat.modals.eigenaar : m.role}");
  });
});
