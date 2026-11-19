import { describe, it, expect, vi, beforeEach } from "vitest";

// Automatische websitepijplijn (lib/sales/website-pijplijn.ts). Bewaakt: maakt
// voorstellen tot de cap, slaat testhosts en lopende voorstellen (AppError) over,
// doet niets zonder platformbeheerder, en stuurt alleen een samenvatting als er
// iets gemaakt is. De zware voorstel-motor is gemockt, dus geen netwerk.

const h = vi.hoisted(() => ({
  createWebsiteProposal: vi.fn(),
  findMany: vi.fn(),
  userFindFirst: vi.fn(),
  anyPlatformAdmin: vi.fn(),
  alertOwner: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zekerflex.test" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: { salesLead: { findMany: h.findMany }, user: { findFirst: h.userFindFirst } } }));
vi.mock("@/lib/sales/website-proposal", () => ({ createWebsiteProposal: h.createWebsiteProposal }));
vi.mock("@/lib/messaging/contacts", () => ({ anyPlatformAdmin: h.anyPlatformAdmin }));
vi.mock("@/lib/ops/alert", () => ({ alertOwner: h.alertOwner }));
vi.mock("@/lib/sales/website-score-shared", () => ({
  leadWebsiteUrl: (u?: string | null) => (u && /^https?:\/\//.test(u) ? u : null),
}));
vi.mock("@/lib/time/amsterdam", () => ({ amsterdamDayKey: () => "2026-11-18" }));

import { AppError } from "@/lib/errors";
import { runWebsitePijplijn, stuurPijplijnDagoverzicht, PIJPLIJN_CAP, type PijplijnResult } from "@/lib/sales/website-pijplijn";
import { heeftHandgemaaktVoorstel, HANDGEMAAKTE_VOORSTEL_DOMEINEN } from "@/lib/sales/handgemaakte-voorstellen";
import { VOORSTELLEN } from "@/lib/voorstel/subdomein";

interface LeadRow {
  id: string;
  companyName: string;
  sourceUrl: string;
  contactEmail: string | null;
  discoveredEmail: string | null;
}
const lead = (id: string, over: Partial<LeadRow> = {}): LeadRow => ({
  id,
  companyName: `Bedrijf ${id}`,
  sourceUrl: `https://${id}.nl`,
  contactEmail: `info@${id}.nl`,
  discoveredEmail: null,
  ...over,
});
const proposalOf = (id: string, score = 40) => ({
  id: `wv_${id}`,
  bedrijf: `Bedrijf ${id}`,
  host: `${id}.nl`,
  check: { score },
  punten: [{ status: "probleem", titel: "Geen https" }],
});

beforeEach(() => {
  h.createWebsiteProposal.mockReset();
  h.findMany.mockReset();
  h.userFindFirst.mockReset();
  h.anyPlatformAdmin.mockReset();
  h.alertOwner.mockReset();
  h.userFindFirst.mockResolvedValue(null);
  h.anyPlatformAdmin.mockResolvedValue("admin1");
  h.createWebsiteProposal.mockImplementation((input: { leadId?: string }) => Promise.resolve(proposalOf(input.leadId ?? "x")));
});

describe("runWebsitePijplijn", () => {
  it("maakt hooguit `cap` voorstellen, ook als er meer leads zijn", async () => {
    h.findMany.mockResolvedValue([lead("a"), lead("b"), lead("c"), lead("d"), lead("e")]);
    const r = await runWebsitePijplijn();
    expect(r.gemaakt).toHaveLength(PIJPLIJN_CAP);
    expect(h.createWebsiteProposal).toHaveBeenCalledTimes(PIJPLIJN_CAP);
    // het voorstel wordt aan een platformbeheerder toegeschreven (zodat de herinneringen de eigenaar bereiken)
    expect(h.createWebsiteProposal).toHaveBeenCalledWith({ leadId: "a" }, expect.objectContaining({ userId: "admin1" }));
    expect(r.gemaakt[0]).toMatchObject({ bedrijf: "Bedrijf a", host: "a.nl", score: 40, email: "info@a.nl", url: "https://zekerflex.test/websitevoorstel/wv_a" });
    expect(r.gemaakt[0]?.punten[0]).toBe("Geen https");
  });

  it("slaat een lead met een lopend voorstel over (AppError) en telt dat", async () => {
    h.findMany.mockResolvedValue([lead("a"), lead("b")]);
    h.createWebsiteProposal.mockReset();
    h.createWebsiteProposal
      .mockRejectedValueOnce(AppError.conflict("Er loopt al een voorstel"))
      .mockResolvedValueOnce(proposalOf("b"));
    const r = await runWebsitePijplijn({ limit: 5 });
    expect(r.gemaakt).toHaveLength(1);
    expect(r.gemaakt[0]?.bedrijf).toBe("Bedrijf b");
    expect(r.overgeslagen).toBe(1);
    expect(r.mislukt).toBe(0);
  });

  it("telt een onverwachte fout als mislukt, niet als overgeslagen", async () => {
    h.findMany.mockResolvedValue([lead("a")]);
    h.createWebsiteProposal.mockReset();
    h.createWebsiteProposal.mockRejectedValue(new Error("netwerk kapot"));
    const r = await runWebsitePijplijn({ limit: 5 });
    expect(r.gemaakt).toHaveLength(0);
    expect(r.mislukt).toBe(1);
    expect(r.overgeslagen).toBe(0);
  });

  it("slaat een testhost over zonder de voorstel-motor aan te roepen", async () => {
    h.findMany.mockResolvedValue([lead("x", { sourceUrl: "https://demo.test" })]);
    const r = await runWebsitePijplijn();
    expect(h.createWebsiteProposal).not.toHaveBeenCalled();
    expect(r.gemaakt).toHaveLength(0);
    expect(r.overgeslagen).toBe(1);
  });

  it("doet niets zonder platformbeheerder", async () => {
    h.anyPlatformAdmin.mockResolvedValue(null);
    const r = await runWebsitePijplijn();
    expect(h.findMany).not.toHaveBeenCalled();
    expect(h.createWebsiteProposal).not.toHaveBeenCalled();
    expect(r.gemaakt).toHaveLength(0);
  });
});

describe("uitsluiten (handgemaakt voorstel / bestaande klant)", () => {
  it("slaat een bedrijf met een handgemaakt voorstel over (smileyapp.nl = partner Martijn)", async () => {
    h.findMany.mockResolvedValue([lead("smiley", { sourceUrl: "https://smileyapp.nl" }), lead("a")]);
    const r = await runWebsitePijplijn();
    expect(r.gemaakt.map((i) => i.leadId)).toEqual(["a"]);
    expect(r.overgeslagen).toBe(1);
    expect(h.createWebsiteProposal).not.toHaveBeenCalledWith({ leadId: "smiley" }, expect.anything());
  });

  it("slaat ook een subdomein van een handgemaakt-voorstel-domein over (www.hetschwarzwald.nl)", async () => {
    h.findMany.mockResolvedValue([lead("sw", { sourceUrl: "https://www.hetschwarzwald.nl" })]);
    const r = await runWebsitePijplijn();
    expect(r.gemaakt).toHaveLength(0);
    expect(r.overgeslagen).toBe(1);
    expect(h.createWebsiteProposal).not.toHaveBeenCalled();
  });

  it("slaat een bestaande klant over (actief account op het bedrijfsdomein)", async () => {
    h.findMany.mockResolvedValue([lead("klant", { sourceUrl: "https://klantco.nl" })]);
    h.userFindFirst.mockResolvedValue({ id: "u1" });
    const r = await runWebsitePijplijn();
    expect(r.gemaakt).toHaveLength(0);
    expect(r.overgeslagen).toBe(1);
    expect(h.createWebsiteProposal).not.toHaveBeenCalled();
    expect(h.userFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ email: { endsWith: "@klantco.nl" } }) }));
  });

  it("heeftHandgemaaktVoorstel herkent de domeinen", () => {
    expect(heeftHandgemaaktVoorstel("smileyapp.nl")).toBe(true);
    expect(heeftHandgemaaktVoorstel("www.smileyapp.nl")).toBe(true);
    expect(heeftHandgemaaktVoorstel("hetschwarzwald.nl")).toBe(true);
    expect(heeftHandgemaaktVoorstel("ikenzorg.nl")).toBe(false);
  });

  it("elke VOORSTELLEN-sleutel heeft een bedrijfsdomein (anders wordt een nieuw voorstel niet uitgesloten)", () => {
    expect(HANDGEMAAKTE_VOORSTEL_DOMEINEN.length).toBe(Object.keys(VOORSTELLEN).length);
    expect(HANDGEMAAKTE_VOORSTEL_DOMEINEN.every((d) => typeof d === "string" && d.includes("."))).toBe(true);
  });
});

describe("stuurPijplijnDagoverzicht", () => {
  const vol: PijplijnResult = {
    gemaakt: [{ leadId: "a", bedrijf: "Bedrijf a", host: "a.nl", score: 40, punten: ["Geen https"], proposalId: "wv_a", url: "https://zekerflex.test/websitevoorstel/wv_a", email: "info@a.nl" }],
    overgeslagen: 0,
    mislukt: 0,
  };

  it("mailt de eigenaar een samenvatting als er iets gemaakt is", async () => {
    await stuurPijplijnDagoverzicht(vol, new Date("2026-11-18T09:00:00Z"));
    expect(h.alertOwner).toHaveBeenCalledTimes(1);
    const arg = h.alertOwner.mock.calls[0]?.[0];
    expect(arg).toMatchObject({ url: "/admin/websitevoorstellen", severity: "warning" });
    expect(String(arg?.detail)).toContain("Bedrijf a");
  });

  it("stuurt niets op een lege dag", async () => {
    await stuurPijplijnDagoverzicht({ gemaakt: [], overgeslagen: 3, mislukt: 0 });
    expect(h.alertOwner).not.toHaveBeenCalled();
  });
});
