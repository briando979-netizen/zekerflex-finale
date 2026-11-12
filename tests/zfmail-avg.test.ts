import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ZekerFlex Mail en de AVG (12 nov 2026, besluit 86): de mailbox hangt aan een userId, dus hij is persoonlijk. Bij inzage
// gaat hij mee zonder het verzegelde wachtwoord; bij wissen wordt hij geblokkeerd zonder persoonsgegevens, blijft het adres
// vergrendeld, en is opheffen bij TransIP een eigenaar-taak.

const kv = vi.hoisted(() => ({ rijen: new Map<string, unknown>(), stuk: false }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => {
    if (kv.stuk) throw new Error("database weg");
    return kv.rijen.get(k) ?? null;
  },
  kvSet: async (k: string, v: unknown) => void kv.rijen.set(k, JSON.parse(JSON.stringify(v))),
  kvDelete: async (k: string) => void kv.rijen.delete(k),
  kvListValues: async (pre: string) => [...kv.rijen].filter(([k]) => k.startsWith(pre)).map(([, v]) => v),
}));
const mb = vi.hoisted(() => ({ conn: null as { email: string } | null, weg: vi.fn(), opTransip: new Set<string>() }));
vi.mock("@/lib/mail/mailbox-connection", () => ({
  getMailboxConnection: async () => mb.conn,
  deleteMailboxConnection: async (u: string) => mb.weg(u),
  saveMailboxConnection: vi.fn(),
  sealMailboxPassword: vi.fn(),
}));
vi.mock("@/lib/mail/hosting/transip", () => ({
  transipConfigured: () => true,
  createMailbox: vi.fn(),
  listMailboxes: async () => [...mb.opTransip].map((localPart) => ({ localPart })),
  listMailForwards: async () => [],
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/ops/alert", () => ({ alertOwner: vi.fn() }));

import { ZF_GEWIST, _resetZfMailCache, teOpheffenBijTransip, wisZfMailVan, zfMailVoorInzage } from "@/lib/mail/zf-accounts";

const ADRES = "bakkerij@zekerflex.com";
const NU = new Date("2026-11-12T21:00:00+01:00");
function vul() {
  kv.rijen.clear();
  kv.stuk = false;
  kv.rijen.set("zfmail:user:u1", ADRES);
  kv.rijen.set(`zfmail:account:${ADRES}`, {
    address: ADRES,
    localPart: "bakkerij",
    userId: "u1",
    tenantId: "t1",
    displayName: "Jan Bakker",
    status: "aangevraagd",
    pendingPasswordSealed: "verzegeld-geheim",
    recoveryEmail: "jan.prive@voorbeeld.test",
    createdAt: "2026-11-01T10:00:00.000Z",
    activatedAt: null,
    history: [{ at: "2026-11-02T10:00:00.000Z", what: "blokkeer: klacht van Piet Klant", by: "Beheerder Anna" }],
  });
  mb.conn = { email: ADRES };
  mb.weg.mockClear();
  mb.opTransip = new Set(["bakkerij"]);
  _resetZfMailCache();
}
beforeEach(vul);

describe("inzage", () => {
  it("de mailbox gaat mee, zonder het verzegelde wachtwoord en zonder wat over anderen gaat", async () => {
    const r = await zfMailVoorInzage("u1");
    expect(r?.key).toBe(`zfmail:account:${ADRES}`);
    const tekst = JSON.stringify(r);
    expect(tekst).not.toContain("verzegeld-geheim");
    expect(tekst).not.toContain("pendingPasswordSealed");
    expect(tekst).not.toContain("Beheerder Anna");
    expect(tekst).not.toContain("Piet Klant");
    expect(r?.value).toMatchObject({ address: ADRES, displayName: "Jan Bakker", history: [{ at: "2026-11-02T10:00:00.000Z", what: "blokkeer" }] });
    expect(await zfMailVoorInzage("iemand-anders")).toBeNull();
  });

  it("exportUserKv neemt hem mee (hij staat onder het adres, niet onder de userId)", () => {
    const bron = readFileSync(path.join(process.cwd(), "lib/privacy/user-kv.ts"), "utf8");
    expect(bron).toMatch(/import\("@\/lib\/mail\/zf-accounts"\)\.then\(\(m\) => m\.zfMailVoorInzage\(userId\)\)/);
  });
});

describe("wissen", () => {
  it("geblokkeerd, zonder naam, herstel-adres of wachtwoord; het adres blijft vergrendeld; de koppeling met de mailpagina weg", async () => {
    expect(await wisZfMailVan("u1", NU)).toBe("gewist");
    const a = kv.rijen.get(`zfmail:account:${ADRES}`) as Record<string, unknown>;
    expect(a).toEqual({
      address: ADRES,
      localPart: "bakkerij",
      userId: ZF_GEWIST,
      tenantId: "t1",
      displayName: "",
      status: "geblokkeerd",
      recoveryEmail: null,
      createdAt: "2026-11-01T10:00:00.000Z",
      activatedAt: null,
      history: [{ at: NU.toISOString(), what: "gewist (AVG)", by: "systeem" }],
    });
    expect(JSON.stringify(a)).not.toMatch(/Jan|prive|verzegeld|Piet|Anna/);
    expect(kv.rijen.has("zfmail:user:u1")).toBe(false);
    expect(mb.weg).toHaveBeenCalledWith("u1");
  });

  it("een tweede keer wissen doet niets", async () => {
    await wisZfMailVan("u1", NU);
    const na = JSON.stringify([...kv.rijen]);
    expect(await wisZfMailVan("u1", new Date("2026-11-13T10:00:00+01:00"))).toBe("geen");
    expect(JSON.stringify([...kv.rijen])).toBe(na);
  });

  it("een storing houdt het wissen van het account niet tegen (anonymizeUser vangt hem af, vóór de transactie)", async () => {
    kv.stuk = true;
    await expect(wisZfMailVan("u1", NU)).rejects.toThrow();
    const bron = readFileSync(path.join(process.cwd(), "lib/privacy/anonymize.ts"), "utf8");
    const i = bron.indexOf("m.wisZfMailVan(userId)");
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(bron.indexOf("await prisma.$transaction"));
    expect(bron.slice(i, i + 400)).toMatch(/\.catch\(\(err\) => logger\.warn\("erasure: zekerflex-mail wissen mislukt", \{ soort: /);
  });
});

describe("eigenaar-taak", () => {
  it("noemt het gewiste adres zolang TransIP de mailbox nog heeft, en is daarna af", async () => {
    expect(await teOpheffenBijTransip()).toEqual([]);
    await wisZfMailVan("u1", NU);
    _resetZfMailCache();
    expect(await teOpheffenBijTransip()).toEqual([ADRES]);
    mb.opTransip = new Set();
    _resetZfMailCache();
    // zonder mailboxen bij TransIP (of een lege lijst) telt hij als nog op te heffen: liever een taak te veel
    expect(await teOpheffenBijTransip()).toEqual([ADRES]);
    mb.opTransip = new Set(["iets-anders"]);
    _resetZfMailCache();
    expect(await teOpheffenBijTransip()).toEqual([]);
  });

  it("het adres staat niet in de titel van de taak", () => {
    const bron = readFileSync(path.join(process.cwd(), "lib/admin/owner-todos.ts"), "utf8");
    expect(bron).toMatch(/id: "zfmail-opheffen",\s*group: "Beheer & veiligheid",\s*title: "ZekerFlex Mail-adres opheffen bij TransIP",/);
  });
});
