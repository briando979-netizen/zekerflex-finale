import { beforeEach, describe, expect, it, vi } from "vitest";

// TransIP weigert LOGIN bij veel inlogs vlak na elkaar: leesPostvakVoorBonnetjes laat tussen twee verbindingen een pauze
// (gemeten: met 1,5 s lukten alle 30 mails). Zonder mailserver: de IMAP-opdrachten zijn nagemaakt.

const m = vi.hoisted(() => ({
  tijden: [] as { naam: string; t: number }[],
  kv: new Map<string, unknown>(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => m.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, v),
  kvDelete: async (k: string) => void m.kv.delete(k),
}));
const stempel = (naam: string) => m.tijden.push({ naam, t: Date.now() });
vi.mock("@/lib/mail/imap", () => ({
  decodeMimeWords: (s: string) => s,
  fetchInboxList: async () => {
    stempel("lijst");
    return [
      { uid: 1, subject: "a" },
      { uid: 2, subject: "b" },
    ];
  },
  fetchKop: async () => {
    stempel("kop");
    return "From: a@b.nl\r\nTo: info@zekerflex.com\r\nX-Original-To: bonnetjes@zekerflex.com\r\nMessage-ID: <x@y>";
  },
  fetchBijlagen: async () => {
    stempel("bijlagen");
    return null; // geen bijlagen: niets te verwerken, alleen de verbindingen tellen
  },
}));

const { leesPostvakVoorBonnetjes, IMAP_PAUZE_MS } = await import("@/lib/boekhouding/bonnen/mail");
const CFG = { host: "imap.test", port: 993, user: "u", pass: "p", tls: true } as unknown as Parameters<typeof leesPostvakVoorBonnetjes>[0];

beforeEach(() => {
  m.tijden = [];
  m.kv.clear();
});

describe("leesPostvakVoorBonnetjes: rustig inloggen", () => {
  it("de standaardpauze is 1,5 seconde (gemeten op de echte postbus)", () => {
    expect(IMAP_PAUZE_MS).toBe(1500);
  });

  it("laat tussen twee verbindingen minstens de pauze verstrijken, ook tussen de lijst en de eerste mail", async () => {
    await leesPostvakVoorBonnetjes(CFG, "adm1", { pauzeMs: 40 });
    expect(m.tijden.map((x) => x.naam)).toEqual(["lijst", "kop", "bijlagen", "kop", "bijlagen"]);
    for (let i = 1; i < m.tijden.length; i++) {
      expect(m.tijden[i]!.t - m.tijden[i - 1]!.t, `tussen ${m.tijden[i - 1]!.naam} en ${m.tijden[i]!.naam}`).toBeGreaterThanOrEqual(35);
    }
  });

  it("pauzeMs 0 wacht niet", async () => {
    const t0 = Date.now();
    await leesPostvakVoorBonnetjes(CFG, "adm1", { pauzeMs: 0 });
    expect(Date.now() - t0).toBeLessThan(500);
  });
});
