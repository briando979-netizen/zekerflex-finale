import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WhatsApp-uitbouw stap 18 (15 nov): status, 24 uur. Wie ziet hem: alleen wederzijds, zoals WhatsApp: een direct gesprek,
// of jullie bewaarden elkaar allebei als contact; geblokkeerd niet. Wie hem zag, ziet alleen de eigenaar. Een foto alleen via de eigen
// route met dezelfde controle (anders 404), opnieuw opgeslagen zonder GPS; na 24 uur weg, met de foto.

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvGetMany: async (keys: string[]) => new Map(keys.filter((k) => kv.has(k)).map((k) => [k, structuredClone(kv.get(k))])),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
  kvListKeys: async (prefix: string) => [...kv.keys()].filter((k) => k.startsWith(prefix)),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const opslag = vi.hoisted(() => ({ bewaard: new Map<string, Buffer>(), gewist: [] as string[], teller: 0 }));
vi.mock("@/lib/storage/local", () => ({
  storeUpload: async (i: { bytes: Buffer; mimeType: string; filename: string }) => {
    const id = `up${++opslag.teller}`;
    opslag.bewaard.set(id, i.bytes);
    return { id, filename: i.filename, mimeType: i.mimeType, sizeBytes: i.bytes.length };
  },
  readUpload: async (id: string) => ({ bytes: opslag.bewaard.get(id)!, filename: "status", mimeType: "image/png" }),
  deleteUpload: async (id: string) => void opslag.gewist.push(id),
}));
vi.mock("@/lib/messaging/media", () => ({ cleanPhoto: async (_b: Buffer, mime: string) => (mime === "image/png" ? Buffer.from("schoon, zonder gps") : null) }));
let wie = "a";
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: wie, fullName: wie }) }));
const NAMEN: Record<string, string> = { a: "Anna", b: "Bas", c: "Cor", d: "Dirk" };
vi.mock("@/lib/messaging/contacts", () => ({
  isPlatformAdmin: async () => false,
  userDirectory: async (ids: string[]) => new Map(ids.map((id) => [id, { userId: id, name: NAMEN[id] ?? id, role: "freelancer" }])),
}));

import { GET, POST } from "@/app/api/inbox/status/route";
import { DELETE as weghalen, POST as zag } from "@/app/api/inbox/status/[statusId]/route";
import { GET as foto } from "@/app/api/inbox/status/[statusId]/media/route";
import { ruimStatusOp } from "@/lib/messaging/status";
import { STATUS_MAX_PER_PERSOON, type StatusFeed } from "@/lib/messaging/status-vorm";
import { ERASABLE_KV_PREFIXES } from "@/lib/privacy/user-kv";
import type { ChatThread } from "@/lib/messaging/store";

const NU = new Date("2026-11-15T12:00:00+01:00");
const als = (u: string) => (wie = u);
const feed = async () => (await (await GET()).json()) as StatusFeed;
const tekst = (t = "Vandaag in Utrecht", kleur = 1) => POST(new Request("http://localhost/api/inbox/status", { method: "POST", body: JSON.stringify({ tekst: t, kleur }) }));
const fotoPost = (type = "image/png") => {
  const form = new FormData();
  form.append("file", new File([Buffer.from("ruwe foto met gps")], "x", { type }));
  form.append("tekst", "Mijn werkplek");
  return POST(new Request("http://localhost/api/inbox/status", { method: "POST", body: form }));
};
const markeer = (id: string, van: string) => zag(new Request(`http://localhost/api/inbox/status/${id}`, { method: "POST", body: JSON.stringify({ van }) }), { params: Promise.resolve({ statusId: id }) });
const haalFoto = (id: string, van: string) => foto(new Request(`http://localhost/api/inbox/status/${id}/media?van=${van}`), { params: Promise.resolve({ statusId: id }) });
const schrap = (id: string) => weghalen(new Request(`http://localhost/api/inbox/status/${id}`, { method: "DELETE" }), { params: Promise.resolve({ statusId: id }) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
  kv.clear();
  opslag.bewaard.clear();
  opslag.gewist.length = 0;
  opslag.teller = 0;
  // A en B chatten (wederzijds); A en D bewaarden elkaar; C bewaarde A, maar A kent C niet; A bewaarde E, E kent A niet
  kv.set("chat-thread:ab", { id: "ab", kind: "direct", participants: ["a", "b"], createdAt: "", lastMessageAt: "", lastMessage: null, meta: {}, reads: {} } as ChatThread);
  kv.set("contacts:a", { contacts: [{ userId: "d" }, { userId: "e" }] });
  kv.set("contacts:d", { contacts: [{ userId: "a" }] });
  kv.set("contacts:c", { contacts: [{ userId: "a" }] });
  als("a");
});
afterEach(() => {
  vi.useRealTimers();
});

describe("wie ziet je status", () => {
  it("je gesprekspartner en wederzijdse contacten; niet als maar één van jullie de ander bewaarde; geblokkeerd niet", async () => {
    expect((await tekst()).status).toBe(201);
    expect((await feed()).mijn).toHaveLength(1);
    als("b");
    expect((await feed()).anderen.map((x) => [x.naam, x.statussen.length])).toEqual([["Anna", 1]]);
    als("d");
    expect((await feed()).anderen.map((x) => x.userId)).toEqual(["a"]);
    als("c");
    expect((await feed()).anderen).toEqual([]);
    als("e");
    expect((await feed()).anderen).toEqual([]);
    kv.set("chat-prefs:a", { blocked: ["b"] });
    als("b");
    expect((await feed()).anderen).toEqual([]);
  });

  it("gezien: de eigenaar ziet wie; een kijker ziet alleen dat hij hem zag; wie hem niet mag zien: 404", async () => {
    const { id } = await (await tekst()).json();
    als("b");
    expect((await markeer(id, "a")).status).toBe(200);
    expect((await feed()).anderen[0]!.statussen[0]).toMatchObject({ id, gezien: true });
    expect(JSON.stringify(await feed())).not.toContain("gezienDoor");
    als("c");
    expect((await markeer(id, "a")).status).toBe(404);
    als("a");
    const mijn = await feed();
    expect(Object.keys(mijn.mijn[0]!.gezienDoor)).toEqual(["b"]);
    expect(mijn.namen).toEqual({ b: "Bas" });
  });

  it("een te lange tekst, een onbekende kleur of te veel: 422", async () => {
    expect((await tekst("x".repeat(701))).status).toBe(422);
    expect((await tekst("x", 9)).status).toBe(422);
    for (let i = 0; i < STATUS_MAX_PER_PERSOON; i++) expect((await tekst(`nr ${i}`)).status).toBe(201);
    expect((await tekst("één te veel")).status).toBe(422);
  });
});

describe("een foto", () => {
  it("opnieuw opgeslagen (zonder gps), alleen te zien voor wie de status mag zien", async () => {
    const res = await fotoPost();
    expect(res.status).toBe(201);
    const { id } = await res.json();
    expect([...opslag.bewaard.values()].map(String)).toEqual(["schoon, zonder gps"]);
    als("b");
    const goed = await haalFoto(id, "a");
    expect(goed.status).toBe(200);
    expect(goed.headers.get("cache-control")).toBe("private, no-store");
    als("c");
    expect((await haalFoto(id, "a")).status).toBe(404);
    als("b");
    expect((await haalFoto(id, "c")).status).toBe(404);
  });

  it("een soort die we niet zonder gps kunnen opslaan: 422", async () => {
    expect((await fotoPost("image/heic")).status).toBe(422);
    expect(opslag.bewaard.size).toBe(0);
  });
});

describe("weg", () => {
  it("na 24 uur weg, met de foto; ook als niemand meer kijkt (cron)", async () => {
    await fotoPost();
    await tekst();
    vi.setSystemTime(new Date(NU.getTime() + 24 * 3_600_000 + 1000));
    expect(await ruimStatusOp()).toBe(2);
    expect(opslag.gewist).toEqual(["up1"]);
    expect(kv.has("chat-status:a")).toBe(false);
    als("b");
    expect((await feed()).anderen).toEqual([]);
  });

  it("je eigen status weghalen; van een ander kan niet (404)", async () => {
    const { id } = await (await fotoPost()).json();
    als("b");
    expect((await schrap(id)).status).toBe(404);
    als("a");
    expect((await schrap(id)).status).toBe(200);
    expect(opslag.gewist).toEqual(["up1"]);
    expect((await schrap(id)).status).toBe(404);
  });
});

describe("op de server", () => {
  it("opruimen elk uur, een hartslag, inzage en wissen", () => {
    const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
    expect(lees("deploy/cron/entrypoint.sh")).toContain('17 * * * * wget -q -O /dev/null -T 120 "$H" "$APP/api/internal/chat/status-opruimen"');
    expect(lees("lib/ops/heartbeat.ts")).toContain('{ job: "chat-status-opruimen", label: "Chat: verlopen statussen opruimen", maxAgeHours: 2 }');
    expect(lees("app/api/internal/chat/status-opruimen/route.ts")).toContain("checkInternalToken(request)");
    expect(ERASABLE_KV_PREFIXES).toContain("chat-status:");
  });
});
