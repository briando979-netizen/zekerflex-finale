import { beforeEach, describe, expect, it, vi } from "vitest";

// Opvolgen vanuit Admin → Scans & deals: een mens mailt het voorstel op maat, nooit naar
// een testadres, hooguit eens per week, en een afgemeld adres krijgt niets.

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (k: string) => structuredClone(kv.get(k) ?? null)),
  kvSet: vi.fn(async (k: string, v: unknown) => void kv.set(k, structuredClone(v))),
  kvGetMany: vi.fn(async () => new Map()),
  kvListValues: vi.fn(async () => []),
}));
const sendMail = vi.fn();
vi.mock("@/lib/mail", () => ({ sendMail: (...a: unknown[]) => sendMail(...a), mailShell: (t: string, b: string) => `${t}${b}`, mailButton: (u: string, l: string) => `${l}:${u}` }));
const leadUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { salesLead: { findUnique: vi.fn(async () => ({ notes: "eerder", contactEmail: null })), update: (...a: unknown[]) => leadUpdate(...a) } } }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn(async () => undefined) }));

const { stuurVoorstel, leesSleutel } = await import("@/lib/scans/opvolgen");

const NU = new Date("2026-11-04T12:00:00Z");
const DOOR = { userId: "u1", naam: "Sanne Sales", email: "sanne@zekerflex.test" };
const log = (extra: Record<string, unknown> = {}) => ({
  sleutel: "website:0123456789abcdef",
  soort: "website",
  scanId: "0123456789abcdef",
  at: "2026-11-04T10:00:00Z",
  host: "bakkerij.nl",
  naam: "Bakkerij Jansen",
  plaats: "Utrecht",
  score: 62,
  samenvatting: "3 problemen",
  rapport: "/website-check?r=0123456789abcdef",
  leadId: "lead1",
  dealId: "aaaaaaaaaaaaaaaa",
  siteSlug: null,
  stappen: [{ stap: "gescand", at: "2026-11-04T10:00:00Z" }],
  ...extra,
});
const deal = (extra: Record<string, unknown> = {}) => ({
  id: "aaaaaaaaaaaaaaaa",
  scan: { soort: "website", scanId: "0123456789abcdef" },
  at: "2026-11-04T10:00:00Z",
  geldigTot: "2026-12-04T10:00:00Z",
  bedrijf: { naam: "Bakkerij Jansen", host: "bakkerij.nl", plaats: "Utrecht" },
  score: 62,
  samenvatting: "3 problemen",
  rapport: "/website-check?r=0123456789abcdef",
  siteSlug: null,
  opties: [{ id: "nieuwe-website", naam: "Je nieuwe website", uitleg: "", waarom: "", eenmaligCent: 24750, maandCent: null, prijsTekst: null, aanbevolen: true }],
  status: "open",
  keuze: ["nieuwe-website"],
  ...extra,
});

beforeEach(() => {
  kv.clear();
  sendMail.mockReset();
  leadUpdate.mockReset();
  leadUpdate.mockResolvedValue({});
  sendMail.mockResolvedValue({ id: "m1", delivered: true, transport: "smtp" });
  kv.set("scan-log:website:0123456789abcdef", log());
  kv.set("scan-deal:aaaaaaaaaaaaaaaa", deal());
});

describe("stuurVoorstel", () => {
  it("leest alleen geldige sleutels", () => {
    expect(leesSleutel("website:0123456789abcdef")).toEqual({ soort: "website", scanId: "0123456789abcdef" });
    expect(leesSleutel("anders:0123456789abcdef")).toBeNull();
    expect(leesSleutel("website:../../etc")).toBeNull();
  });

  it("mailt het voorstel als zakelijke introductie en legt het vast", async () => {
    const na = await stuurVoorstel("website:0123456789abcdef", "Info@Bakkerij.nl", "Leuk je te spreken!", DOOR, NU);
    const m = sendMail.mock.calls[0]![0] as { to: string; kind: string; replyTo: string; text: string };
    expect(m).toMatchObject({ to: "info@bakkerij.nl", kind: "sales-outreach", replyTo: "sanne@zekerflex.test" });
    expect(m.text).toContain("/deal/aaaaaaaaaaaaaaaa");
    expect(m.text).toContain("Leuk je te spreken!");
    expect(na.stappen.map((s) => s.stap)).toEqual(["gescand", "opgevolgd"]);
    expect(leadUpdate).toHaveBeenCalledTimes(1);
  });

  it("weigert testadressen, een tweede mail binnen een week, en een al geaccepteerd voorstel", async () => {
    await expect(stuurVoorstel("website:0123456789abcdef", "test@example.com", "", DOOR, NU)).rejects.toThrow("testadres");
    await stuurVoorstel("website:0123456789abcdef", "info@bakkerij.nl", "", DOOR, NU);
    await expect(stuurVoorstel("website:0123456789abcdef", "info@bakkerij.nl", "", DOOR, new Date("2026-11-08T12:00:00Z"))).rejects.toThrow("al gemaild");
    await expect(stuurVoorstel("website:0123456789abcdef", "info@bakkerij.nl", "", DOOR, new Date("2026-11-12T12:00:00Z"))).resolves.toBeTruthy();
    kv.set("scan-deal:aaaaaaaaaaaaaaaa", deal({ status: "akkoord" }));
    await expect(stuurVoorstel("website:0123456789abcdef", "info@bakkerij.nl", "", DOOR, new Date("2026-11-30T12:00:00Z"))).rejects.toThrow("al ja");
  });

  it("een afgemeld adres krijgt niets en het logboek blijft gelijk", async () => {
    sendMail.mockResolvedValue({ id: "m1", delivered: false, transport: "smtp", suppressed: "sales-outreach" });
    await expect(stuurVoorstel("website:0123456789abcdef", "info@bakkerij.nl", "", DOOR, NU)).rejects.toThrow("afgemeld");
    expect((kv.get("scan-log:website:0123456789abcdef") as { stappen: unknown[] }).stappen).toHaveLength(1);
  });

  it("een verlopen voorstel wordt niet gemaild", async () => {
    await expect(stuurVoorstel("website:0123456789abcdef", "info@bakkerij.nl", "", DOOR, new Date("2026-12-10T12:00:00Z"))).rejects.toThrow("verlopen");
    expect(sendMail).not.toHaveBeenCalled();
  });
});
