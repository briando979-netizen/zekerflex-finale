import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// WhatsApp-uitbouw stap 10 (13 nov): rondzenden. Eén bericht gaat apart naar meerdere mensen, ieder in jullie eigen
// gesprek. Alleen naar je bewaarde contacten en mensen met wie je al een gesprek hebt; geblokkeerd slaat over.

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
  kvAppend: async (k: string, v: unknown) => void kv.set(k, [...((kv.get(k) as unknown[]) ?? []), structuredClone(v)]),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
}));
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: "u_baas", fullName: "Bakkerij" }) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => ({ ok: true })) }));
const notify = vi.fn(async () => undefined);
vi.mock("@/lib/messaging/notify", () => ({ notifyNewMessage: (...a: unknown[]) => notify(...(a as [])) }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => void fn() }));

import { POST } from "@/app/api/inbox/rondzenden/route";
import { RONDZEND_MAX, rondzendKandidaten } from "@/lib/messaging/rondzenden";
import { ensureDirectThread, getMessages, listThreadsForUser } from "@/lib/messaging/store";
import { setBlocked } from "@/lib/messaging/thread-prefs";

const stuur = (body: unknown) => POST(new Request("http://localhost/api/inbox/rondzenden", { method: "POST", body: JSON.stringify(body) }));

beforeEach(async () => {
  kv.clear();
  notify.mockClear();
  kv.set("contacts:u_baas", { contacts: [{ userId: "u_anna" }, { userId: "u_bas" }] });
  await ensureDirectThread("u_baas", "u_cor"); // al een gesprek, geen bewaard contact
});

describe("rondzendKandidaten", () => {
  it("contacten en de andere kant van je gesprekken, elk één keer, op naam, zonder jezelf", () => {
    const namen: Record<string, string> = { u_anna: "Anna", u_bas: "Bas", u_cor: "Cor" };
    const k = rondzendKandidaten([{ userId: "u_bas" }, { userId: "u_anna" }], [{ kind: "direct", participants: ["u_baas", "u_cor"] }, { kind: "group", participants: ["u_baas", "u_vreemd"] }], "u_baas", (id) => namen[id]);
    expect(k.map((x) => x.name)).toEqual(["Anna", "Bas", "Cor"]);
  });
});

describe("POST /api/inbox/rondzenden", () => {
  it("ieder krijgt het bericht apart in het eigen gesprek; een onbekende wordt overgeslagen", async () => {
    const res = await stuur({ userIds: ["u_anna", "u_cor", "u_vreemd", "u_anna"], text: "Wie kan zaterdag?" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ verstuurd: 2, overgeslagen: 1 });
    const gesprekken = (await listThreadsForUser("u_baas", false)).filter((t) => t.kind === "direct");
    for (const ander of ["u_anna", "u_cor"]) {
      const t = gesprekken.find((x) => x.participants.includes(ander))!;
      expect((await getMessages(t.id)).at(-1)).toMatchObject({ from: "u_baas", text: "Wie kan zaterdag?" });
    }
    expect(gesprekken.some((t) => t.participants.includes("u_vreemd"))).toBe(false);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("geblokkeerd, in een van beide richtingen, slaat over", async () => {
    await setBlocked("u_bas", "u_baas", true);
    const res = await stuur({ userIds: ["u_bas", "u_anna"], text: "Hoi" });
    expect(await res.json()).toEqual({ verstuurd: 1, overgeslagen: 1 });
  });

  it("leeg bericht, geen ontvangers of te veel: 422", async () => {
    expect((await stuur({ userIds: ["u_anna"], text: "  " })).status).toBe(422);
    expect((await stuur({ userIds: [], text: "Hoi" })).status).toBe(422);
    expect((await stuur({ userIds: Array.from({ length: RONDZEND_MAX + 1 }, (_, i) => `u${i}`), text: "Hoi" })).status).toBe(422);
  });
});

describe("in de chat", () => {
  it("Tools heeft Rondzenden; de rol in de communitylijst is gewone taal", () => {
    const inbox = readFileSync(path.join(process.cwd(), "components/chat/InboxPage.tsx"), "utf8").split("\r\n").join("\n");
    expect(inbox).toContain("onClick={() => setRondzendOpen(true)}");
    expect(inbox).toContain('c.myRole === "admin" ? chat.modals.beheerder : chat.modals.lid');
    expect(inbox).not.toContain('{c.myRole === "owner" ? ib.rolEigenaar : c.myRole}');
  });
});
