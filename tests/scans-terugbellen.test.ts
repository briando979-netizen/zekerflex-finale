import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// "Bel me eerst terug" op /deal/<id>: nog geen ja, wel een gesprek. Lead warm met het
// telefoonnummer, stap "aanvraag", sales een melding; één keer per voorstel; bij een
// testbedrijf alleen vastleggen.

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
afterAll(() => vi.useRealTimers());

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
vi.mock("@/lib/prisma", () => ({ prisma: { salesLead: { findUnique: vi.fn(async () => ({ notes: "eerder" })), update: (...a: unknown[]) => leadUpdate(...a) } } }));
const createLead = vi.fn();
vi.mock("@/lib/sales/leads", () => ({ createLead: (...a: unknown[]) => createLead(...a) }));
vi.mock("@/lib/sales/website-proposal", () => ({ proposalOffer: vi.fn() }));

const { dealTerugbellen } = await import("@/lib/scans/deal");

const SCAN = "0123456789abcdef";
const ID = "aaaaaaaaaaaaaaaa";
const log = (host: string, leadId: string | null) => ({
  sleutel: `website:${SCAN}`, soort: "website", scanId: SCAN, at: "2026-11-04T10:00:00Z", host, naam: "Bakkerij Jansen", plaats: "Utrecht",
  score: 62, samenvatting: "3 problemen", rapport: `/website-check?r=${SCAN}`, leadId, dealId: ID, siteSlug: null,
  stappen: [{ stap: "gescand", at: "2026-11-04T10:00:00Z" }],
});
const deal = (host: string, extra: Record<string, unknown> = {}) => ({
  id: ID, scan: { soort: "website", scanId: SCAN }, at: "2026-11-04T10:00:00Z", geldigTot: "2026-12-04T10:00:00Z",
  bedrijf: { naam: "Bakkerij Jansen", host, plaats: "Utrecht" }, score: 62, samenvatting: "3 problemen", rapport: `/website-check?r=${SCAN}`, siteSlug: null,
  opties: [{ id: "nieuwe-website", naam: "Je nieuwe website", uitleg: "", waarom: "", eenmaligCent: 24750, maandCent: null, prijsTekst: null, aanbevolen: true }],
  status: "bekeken", keuze: ["nieuwe-website"], ...extra,
});
const PERSOON = { naam: "Piet Jansen", telefoon: "06 12345678", moment: "ochtend" as const, vraag: "Kan het voor de kerst?" };
const stappen = () => (kv.get(`scan-log:website:${SCAN}`) as { stappen: { stap: string; info?: string }[] }).stappen;

beforeEach(() => {
  kv.clear();
  sendMail.mockReset().mockResolvedValue({ id: "m1", delivered: true, transport: "smtp" });
  leadUpdate.mockReset().mockResolvedValue({});
  createLead.mockReset().mockResolvedValue({ id: "nieuw1" });
});

describe("dealTerugbellen", () => {
  it("maakt de lead van de scan warm met het nummer en meldt het aan sales", async () => {
    kv.set(`scan-log:website:${SCAN}`, log("bakkerij.nl", "lead1"));
    kv.set(`scan-deal:${ID}`, deal("bakkerij.nl"));
    const na = await dealTerugbellen(ID, PERSOON);
    expect(na.terugbellen).toMatchObject({ telefoon: "06 12345678", moment: "ochtend", vraag: "Kan het voor de kerst?" });
    expect(na.status).toBe("bekeken");
    const upd = leadUpdate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(upd.data).toMatchObject({ contactName: "Piet Jansen", contactPhone: "06 12345678" });
    expect(upd.data).not.toHaveProperty("contactEmail");
    expect(createLead).not.toHaveBeenCalled();
    const m = sendMail.mock.calls[0]![0] as { subject: string; text: string };
    expect(m.subject).toContain("Terugbellen: Bakkerij Jansen");
    expect(m.text).toContain("06 12345678");
    expect(m.text).toContain("In de ochtend");
    expect(stappen().map((s) => s.stap)).toEqual(["gescand", "aanvraag"]);
  });

  it("maakt een nieuwe lead als de scan er geen had, en vraagt maar één keer", async () => {
    kv.set(`scan-log:website:${SCAN}`, log("bakkerij.nl", null));
    kv.set(`scan-deal:${ID}`, deal("bakkerij.nl"));
    await dealTerugbellen(ID, PERSOON);
    expect(createLead).toHaveBeenCalledTimes(1);
    await dealTerugbellen(ID, PERSOON);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("een testbedrijf: wel vastleggen, geen lead en geen mail", async () => {
    kv.set(`scan-log:website:${SCAN}`, log("example.com", null));
    kv.set(`scan-deal:${ID}`, deal("example.com"));
    await dealTerugbellen(ID, PERSOON);
    expect(sendMail).not.toHaveBeenCalled();
    expect(createLead).not.toHaveBeenCalled();
    expect(stappen().at(-1)).toMatchObject({ stap: "aanvraag", info: "terugbellen (test)" });
  });

  it("niet bij een verlopen of al geaccepteerd voorstel", async () => {
    kv.set(`scan-log:website:${SCAN}`, log("bakkerij.nl", "lead1"));
    kv.set(`scan-deal:${ID}`, deal("bakkerij.nl", { status: "akkoord" }));
    await expect(dealTerugbellen(ID, PERSOON)).rejects.toThrow("al ja");
    kv.set(`scan-deal:${ID}`, deal("bakkerij.nl", { geldigTot: "2026-11-01T00:00:00Z" }));
    await expect(dealTerugbellen(ID, PERSOON)).rejects.toThrow("verlopen");
    expect(sendMail).not.toHaveBeenCalled();
  });
});
