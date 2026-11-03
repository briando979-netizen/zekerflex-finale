import { beforeEach, describe, expect, it, vi } from "vitest";

// Claimt een opdrachtgever een vergoeding van een werker die te laat afzegde,
// dan kreeg die werker alleen een systeembericht in de chat, en dat stuurt geen
// push. Nu ook een pushbericht met het bedrag.

const h = vi.hoisted(() => ({
  pushes: [] as { ids: string[]; push: { title: string; body: string } }[],
  tasks: [] as Promise<unknown>[],
}));

const CLAIM = {
  id: "c1",
  direction: "employer_owed",
  shiftId: "sh1",
  shiftTitle: "Magazijn",
  employerTenantId: "org1",
  freelancerUserId: "w1",
  claimedCents: 6800,
};

vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: "mgr1" }), requireRole: () => undefined }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => undefined }));
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ tenantIds: ["org1"], branchIds: null }) }));
vi.mock("@/lib/claims/store", () => ({ getClaim: async () => CLAIM, decideOfferedClaim: async () => CLAIM }));
vi.mock("@/lib/claims/billing", () => ({ issueClaimInvoice: async () => undefined }));
vi.mock("@/lib/audit", () => ({ recordAudit: async () => undefined }));
vi.mock("@/lib/messaging/store", () => ({ ensureDirectThread: async () => ({ id: "t1" }), postMessage: async () => undefined }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: async () => ({ id: "w1" }) } } }));
vi.mock("@/lib/run-after", () => ({ runAfter: (t: () => Promise<unknown>) => void h.tasks.push(t()) }));
vi.mock("@/lib/notifications/push", () => ({
  sendUserPush: async (ids: string[], push: { title: string; body: string }) => (h.pushes.push({ ids, push }), 1),
}));

import { POST } from "@/app/api/werkgever/claims/[id]/decide-offer/route";

const call = (decision: string) =>
  POST(new Request("http://x/api", { method: "POST", body: JSON.stringify({ decision }) }), { params: Promise.resolve({ id: "c1" }) });

beforeEach(() => {
  h.pushes.length = 0;
  h.tasks.length = 0;
});

describe("aangeboden claim — de werker hoort het", () => {
  it("meldt het bedrag als de opdrachtgever de vergoeding claimt", async () => {
    const res = await call("accepted");
    await Promise.all(h.tasks);
    expect(res.status).toBe(200);
    expect(h.pushes[0]?.ids).toEqual(["w1"]);
    expect(h.pushes[0]?.push.title).toBe("De opdrachtgever claimt een vergoeding");
    expect(h.pushes[0]?.push.body).toMatch(/^Magazijn: €\s68,00 wegens te laat afzeggen/); // Intl zet een harde spatie
  });

  it("meldt het ook als de opdrachtgever ervan afziet", async () => {
    await call("declined");
    await Promise.all(h.tasks);
    expect(h.pushes[0]?.push.title).toBe("Geen vergoeding geclaimd");
  });
});
