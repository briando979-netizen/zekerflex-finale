import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/voice/announce", () => ({ announce: vi.fn().mockResolvedValue(null) }));

vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn().mockResolvedValue(null), set: vi.fn(), del: vi.fn() },
  acquireLock: vi.fn().mockResolvedValue(async () => undefined),
}));

const engineRunCreate = vi.fn().mockResolvedValue({ id: "run_1" });
const engineRunUpdate = vi.fn().mockResolvedValue({});
const campaignFindMany = vi.fn();
const sourceFindMany = vi.fn().mockResolvedValue([]);
const leadFindMany = vi.fn();
const leadUpdate = vi.fn().mockResolvedValue({});
const leadUpdateMany = vi.fn().mockResolvedValue({});
const leadFindFirst = vi.fn().mockResolvedValue(null);
const discoverySourceFindFirst = vi.fn().mockResolvedValue(null);
const discoverySourceCreate = vi.fn().mockResolvedValue({});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    salesEngineRun: {
      create: (...a: unknown[]) => engineRunCreate(...a),
      update: (...a: unknown[]) => engineRunUpdate(...a),
    },
    salesCampaign: { findMany: (...a: unknown[]) => campaignFindMany(...a) },
    salesDiscoverySource: {
      findMany: (...a: unknown[]) => sourceFindMany(...a),
      update: vi.fn(),
      findFirst: (...a: unknown[]) => discoverySourceFindFirst(...a),
      create: (...a: unknown[]) => discoverySourceCreate(...a),
    },
    salesLead: {
      findMany: (...a: unknown[]) => leadFindMany(...a),
      findFirst: (...a: unknown[]) => leadFindFirst(...a),
      update: (...a: unknown[]) => leadUpdate(...a),
      updateMany: (...a: unknown[]) => leadUpdateMany(...a),
    },
  },
}));

const enrichLead = vi.fn().mockResolvedValue({});
const scoreLead = vi.fn().mockResolvedValue({});
vi.mock("@/lib/sales/leads", () => ({
  enrichLead: (...a: unknown[]) => enrichLead(...a),
  scoreLead: (...a: unknown[]) => scoreLead(...a),
}));

const draftOutreach = vi.fn().mockResolvedValue({ id: "o1", stepIndex: 0 });
const approveOutreach = vi.fn().mockResolvedValue({});
vi.mock("@/lib/sales/outreach", () => ({
  draftOutreach: (...a: unknown[]) => draftOutreach(...a),
  approveOutreach: (...a: unknown[]) => approveOutreach(...a),
}));

const sendOutreachMail = vi.fn().mockResolvedValue({ status: "sent", outreachId: "o1" });
vi.mock("@/lib/sales/send", () => ({ sendOutreachMail: (...a: unknown[]) => sendOutreachMail(...a) }));

vi.mock("@/lib/sales/suppression", () => ({
  isSuppressed: vi.fn().mockResolvedValue({ blocked: false }),
  domainOf: (e: string) => e.split("@")[1] ?? null,
}));

vi.mock("@/lib/sales/discovery/kvkbase", () => ({
  discoverViaKvkBase: vi.fn().mockResolvedValue({ created: 0, seen: 0, queries: [], skipped: 0 }),
}));
vi.mock("@/lib/sales/discovery/careers", () => ({
  crawlCareersSource: vi.fn().mockResolvedValue({ created: 0, updated: 0, pagesFetched: 0, blockedByRobots: 0, emailFound: null, vacancySignal: null, companyName: null }),
}));
const guessAndVerifyDomain = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/sales/discovery/domain-guess", () => ({
  guessAndVerifyDomain: (...a: unknown[]) => guessAndVerifyDomain(...a),
}));

vi.mock("@/lib/sales/campaign", () => ({
  campaignSendCountToday: vi.fn().mockResolvedValue(0),
  globalSendCountToday: vi.fn().mockResolvedValue(0),
  withinSendWindow: vi.fn().mockReturnValue(true),
}));

import { runSalesEngineTick } from "@/lib/sales/engine";

const campaign = {
  id: "c1",
  name: "T",
  status: "ACTIVE",
  mode: "REVIEW",
  minScore: 55,
  dailyCap: 40,
  stepDelaysDays: [0, 4, 10],
  targetSectors: [],
  targetCities: [],
  workdaysOnly: true,
  sendStartHour: 8,
  sendEndHour: 18,
  autopilotConfirmedAt: null,
};

const dueLead = {
  id: "l1",
  campaignId: "c1",
  contactEmail: "hr@acme.nl",
  discoveredEmail: null,
  score: 80,
  sequenceStep: 0,
  status: "ENRICHED",
  suppressed: false,
  repliedAt: null,
  bouncedAt: null,
};

function wireCampaign(mode: "REVIEW" | "AUTOPILOT") {
  campaignFindMany.mockResolvedValue([{ ...campaign, mode, autopilotConfirmedAt: mode === "AUTOPILOT" ? new Date() : null }]);
  leadFindMany.mockImplementation((args: { where?: { score?: unknown; sourceUrl?: unknown } }) => {
    const where = args?.where ?? {};
    // enrichAndScore asks for score: null; resolveLeadDomains asks for sourceUrl:
    // null (no score key at all); processDueLeads asks for score: { gte }.
    if (where.score === null) return Promise.resolve([]);
    if (where.sourceUrl === null) return Promise.resolve([]);
    return Promise.resolve([dueLead]);
  });
}

afterEach(() => vi.clearAllMocks());

describe("sales engine tick", () => {
  it("does nothing when the engine is disabled and not forced", async () => {
    const r = await runSalesEngineTick();
    expect(r.ok).toBe(false);
    expect(r.skipped).toMatch(/engine uit/i);
    expect(engineRunCreate).not.toHaveBeenCalled();
  });

  it("REVIEW mode drafts but never sends", async () => {
    wireCampaign("REVIEW");
    const r = await runSalesEngineTick({ campaignId: "c1", force: true });
    expect(draftOutreach).toHaveBeenCalledWith("l1", null, 0);
    expect(sendOutreachMail).not.toHaveBeenCalled();
    expect(r.drafted).toBe(1);
    expect(r.sent).toBe(0);
  });

  it("AUTOPILOT does not send while SALES_AUTOPILOT_ENABLED is off", async () => {
    // tests/setup.ts leaves SALES_AUTOPILOT_ENABLED unset -> false
    wireCampaign("AUTOPILOT");
    const r = await runSalesEngineTick({ campaignId: "c1", force: true });
    expect(sendOutreachMail).not.toHaveBeenCalled();
    expect(r.sent).toBe(0);
  });

  it("turns a verified domain guess into a new CAREERS_URL source", async () => {
    campaignFindMany.mockResolvedValue([{ ...campaign, mode: "REVIEW", autopilotConfirmedAt: null }]);
    const noUrlLead = { id: "l2", companyName: "Bakkerij De Korenaar", enrichmentJson: {} };
    leadFindMany.mockImplementation((args: { where?: { score?: unknown; sourceUrl?: unknown } }) => {
      const where = args?.where ?? {};
      if (where.score === null) return Promise.resolve([]);
      if (where.sourceUrl === null) return Promise.resolve([noUrlLead]);
      return Promise.resolve([]);
    });
    guessAndVerifyDomain.mockResolvedValue({
      origin: "https://bakkerijkorenaar.nl",
      matchedName: "Bakkerij De Korenaar",
      similarity: 0.8,
    });

    const r = await runSalesEngineTick({ campaignId: "c1", force: true });

    expect(guessAndVerifyDomain).toHaveBeenCalledWith("Bakkerij De Korenaar");
    expect(discoverySourceCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        campaignId: "c1",
        kind: "CAREERS_URL",
        url: "https://bakkerijkorenaar.nl",
      }),
    });
    expect(leadUpdate).toHaveBeenCalledWith({
      where: { id: "l2" },
      data: { sourceUrl: "https://bakkerijkorenaar.nl" },
    });
    expect(r.discovered).toBeGreaterThan(0);
  });

  it("does not re-create a source for a domain that's already known", async () => {
    campaignFindMany.mockResolvedValue([{ ...campaign, mode: "REVIEW", autopilotConfirmedAt: null }]);
    const noUrlLead = { id: "l3", companyName: "Bakkerij De Korenaar", enrichmentJson: {} };
    leadFindMany.mockImplementation((args: { where?: { score?: unknown; sourceUrl?: unknown } }) => {
      const where = args?.where ?? {};
      if (where.score === null) return Promise.resolve([]);
      if (where.sourceUrl === null) return Promise.resolve([noUrlLead]);
      return Promise.resolve([]);
    });
    guessAndVerifyDomain.mockResolvedValue({
      origin: "https://bakkerijkorenaar.nl",
      matchedName: "Bakkerij De Korenaar",
      similarity: 0.8,
    });
    discoverySourceFindFirst.mockResolvedValue({ id: "existing-source" });

    await runSalesEngineTick({ campaignId: "c1", force: true });

    expect(discoverySourceCreate).not.toHaveBeenCalled();
  });
});
