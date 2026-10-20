import { beforeEach, describe, expect, it, vi } from "vitest";

const NOW = new Date("2026-10-20T08:00:00Z");
const H = 3_600_000;

const m = vi.hoisted(() => ({
  verified: new Set<string>(["t-ok"]),
  twoFa: new Set<string>(),
  convs: [] as unknown[],
  reviews: [] as unknown[],
  approve: vi.fn(),
  notify: vi.fn(async () => 2),
  dispatch: vi.fn(async () => 3),
  mail: vi.fn(),
}));

vi.mock("@/lib/company/verified", () => ({
  isTenantVerified: async (id: string) => m.verified.has(id),
  setTenantApproval: (...a: unknown[]) => m.approve(...a),
  notifyPendingReactions: m.notify,
}));
vi.mock("@/lib/auth/two-factor", () => ({ hasTwoFactor: async (id: string) => m.twoFa.has(id) }));
vi.mock("@/lib/fraud/timesheet", () => ({ fraudForTimesheet: async () => [{ code: "x", severity: "critical", message: "GPS nep-locatie" }] }));
vi.mock("@/lib/chat/webchat", () => ({ listConversations: async (s: string) => (s === "open" ? m.convs : []) }));
vi.mock("@/lib/storage/kv", () => ({ kvListValues: async () => m.reviews }));
vi.mock("@/lib/notifications/dispatcher", () => ({ dispatchNextWave: m.dispatch }));
vi.mock("@/lib/mail", () => ({ sendMail: (...a: unknown[]) => m.mail(...a) }));
vi.mock("@/lib/webhooks/manage", () => ({ resendDelivery: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zf.test" } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shift: {
      findMany: async ({ where }: { where: { status?: unknown; startsAt?: { lte?: Date; gte?: Date } } }) => {
        if (where.startsAt?.gte) return Array.from({ length: 10 }, () => ({ title: "Orderpicker magazijn", hourlyRateCents: 1600 }));
        if (where.startsAt?.lte)
          return [
            { id: "s1", title: "Orderpicker", startsAt: new Date(NOW.getTime() + 10 * H), positions: 4, branch: { name: "Tilburg", tenantId: "t-ok", tenant: { name: "Logistiek BV" } }, _count: { assignments: 1 } },
            { id: "s2", title: "Testklus", startsAt: new Date(NOW.getTime() + 5 * H), positions: 1, branch: { name: "X", tenantId: "t-new", tenant: { name: "Nieuw BV" } }, _count: { assignments: 0 } },
          ];
        return [{ id: "s3", title: "Orderpicker magazijn", hourlyRateCents: 1200, positions: 1, branch: { tenantId: "t-ok", tenant: { name: "Logistiek BV" } }, _count: { assignments: 0 } }];
      },
      findUnique: async () => ({ title: "Orderpicker magazijn", hourlyRateCents: 1200 }),
    },
    timesheet: {
      findMany: async ({ where }: { where: { status: string } }) =>
        where.status === "DRAFT"
          ? [{ scheduledStart: NOW, freelancer: { user: { fullName: "Piet" } }, branch: { name: "Tilburg", tenant: { name: "Logistiek BV" } }, assignment: { shift: { title: "Orderpicker" } } }]
          : [{ id: "ts1", freelancer: { user: { fullName: "Kees" } } }],
    },
    tenant: {
      findMany: async () => [
        { id: "t-new", name: "Nieuw BV", kvkNumber: "12345678", branches: [{ shifts: [{ _count: { matches: 2 } }] }] },
        { id: "t-ok", name: "Logistiek BV", kvkNumber: "87654321", branches: [{ shifts: [{ _count: { matches: 5 } }] }] },
      ],
    },
    user: { count: async () => 2 },
    shiftAssignment: { groupBy: async () => [{ freelancerId: "fp1", _count: { _all: 4 } }] },
    freelancerProfile: { findUnique: async () => ({ user: { fullName: "Anna" } }) },
    membership: {
      findMany: async ({ where }: { where: { role: string } }) =>
        where.role === "PLATFORM_ADMIN" ? [{ user: { id: "a1", fullName: "Brian" } }, { user: { id: "a2", fullName: "Sanne" } }] : [{ user: { email: "hq@bv.nl", fullName: "Hans de Boer" } }],
    },
  },
}));

import { planning, onboarding, prijs, kwaliteit, klantenservice, veiligheid } from "@/lib/ai-teams/extra-teams";
import { executeProposal } from "@/lib/ai-teams/execute";

const out = { logs: [] as string[], props: [] as { team: string; title: string; action: { type: string } | null }[] };
const tools = {
  log: async (team: string, text: string) => void out.logs.push(`${team}: ${text}`),
  propose: async (p: { team: string; title: string; action: { type: string } | null }) => void out.props.push(p),
};

beforeEach(() => {
  out.logs = [];
  out.props = [];
  m.mail.mockClear();
});

describe("extra AI-teams", () => {
  it("planning: proposes re-matching an understaffed klus, skips a test klus, spots no-shows", async () => {
    await planning(NOW, tools as never);
    expect(out.props).toHaveLength(1);
    expect(out.props[0]).toMatchObject({ action: { type: "rematch-shift", shiftId: "s1" } });
    expect(out.logs.join("\n")).toContain("Mogelijke no-show: Piet");
  });

  it("onboarding: only unverified companies with reactions are put up for approval", async () => {
    await onboarding(NOW, tools as never);
    expect(out.props.map((p) => p.action)).toEqual([{ type: "approve-company", tenantId: "t-new" }]);
    expect(out.props[0]!.title).toContain("2 freelancer(s) reageerden");
  });

  it("prijs: flags a klus paying far below the market median", async () => {
    await prijs(NOW, tools as never);
    expect(out.props[0]).toMatchObject({ action: { type: "rate-advice", shiftId: "s3", suggestedCents: 1600 } });
  });

  it("kwaliteit: low average rating and many cancellations", async () => {
    m.reviews = [[1, 2, 2].map((rating, i) => ({ subjectType: "freelancer", subjectId: "user-abcdefgh", rating, text: "Te laat", at: new Date(NOW.getTime() - i * 86_400_000).toISOString() }))];
    await kwaliteit(NOW, tools as never);
    const text = out.logs.join("\n");
    expect(text).toContain("gemiddeld 1.7 sterren");
    expect(text).toContain("Anna zegde 4 klussen af");
  });

  it("klantenservice: chats waiting more than 4 hours", async () => {
    const old = new Date(NOW.getTime() - 6 * H).toISOString();
    m.convs = [{ id: "c1", status: "open", lastAt: old, messages: [{ role: "user", content: "Wanneer word ik betaald?", at: old }] }];
    await klantenservice(NOW, tools as never);
    expect(out.logs.join("\n")).toContain('wacht al 6 uur op antwoord: "Wanneer word ik betaald?"');
  });

  it("veiligheid: admins without 2FA and critical fraud flags", async () => {
    m.twoFa = new Set(["a1"]);
    await veiligheid(NOW, tools as never);
    const text = out.logs.join("\n");
    expect(text).toContain("1 beheerder(s) zonder tweestapsverificatie: Sanne");
    expect(text).toContain("Verdachte uren van Kees: GPS nep-locatie");
  });
});

describe("executing the new proposals", () => {
  it("rematch-shift contacts the next wave", async () => {
    expect(await executeProposal({ type: "rematch-shift", shiftId: "s1" })).toBe("3 extra flexkracht(en) benaderd");
  });
  it("approve-company approves and notifies the people who reacted", async () => {
    expect(await executeProposal({ type: "approve-company", tenantId: "t-new" }, "admin@zf.nl")).toContain("2 freelancer(s)");
    expect(m.approve).toHaveBeenCalledWith("t-new", true, "admin@zf.nl");
  });
  it("rate-advice mails the company admins", async () => {
    await executeProposal({ type: "rate-advice", shiftId: "s3", tenantId: "t-ok", suggestedCents: 1600 });
    expect(m.mail).toHaveBeenCalledWith(expect.objectContaining({ to: "hq@bv.nl", kind: "rate-advice" }));
  });
});
