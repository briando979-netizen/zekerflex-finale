import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "@/lib/auth";

// Met "Klussen automatisch heropenen" uit blijft een volle klus waar iemand van afzegde op "volledig bezet" staan (tests/klus-heropenen-afzeggen.test.ts).
// Het bedrijf zet hem dan zelf weer open met de knop op de klus (heropenShiftAction): dezelfde gevolgen als bij automatisch heropenen, dus de klus
// gaat weer open of deels bezet, er wordt gematcht en standby-werkers horen het. Alleen voor een volle klus met een vrije plek die nog niet begon.

const h = vi.hoisted(() => ({
  tasks: [] as Promise<unknown>[],
  matched: [] as string[],
  standby: [] as string[],
  updates: [] as { where: { id: string }; data: { status: string } }[],
  audits: [] as { action: string; targetId?: string | null; summary: string }[],
  shift: null as null | Record<string, unknown>,
}));

vi.mock("@/lib/run-after", () => ({ runAfter: (t: () => Promise<unknown>) => void h.tasks.push(t()) }));
vi.mock("@/lib/notifications/push", () => ({ sendUserPush: async () => 1 }));
vi.mock("@/lib/matching/engine", () => ({ runMatchingForShift: async (id: string) => void h.matched.push(id) }));
vi.mock("@/lib/matching/standby", () => ({ notifyStandby: async (id: string) => void h.standby.push(id) }));
const requirePrincipal = vi.fn();
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requirePrincipal: () => requirePrincipal() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ tenantIds: ["org1"], branchIds: null }) }));
vi.mock("@/lib/audit", () => ({ recordAudit: async (a: { action: string; targetId?: string | null; summary: string }) => void h.audits.push(a) }));
vi.mock("@/lib/messaging/store", () => ({ ensureDirectThread: async () => ({ id: "thread1" }), postMessage: async () => undefined }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shift: {
      findFirst: async () => h.shift,
      update: async (args: { where: { id: string }; data: { status: string } }) => (h.updates.push(args), args),
    },
  },
}));

import { heropenShiftAction } from "@/app/werkgever/diensten/[shiftId]/actions";
import { nl } from "@/lib/i18n/dictionaries";

const manager = {
  userId: "mgr1",
  email: "manager@bedrijf.test",
  fullName: "Manager",
  emailVerifiedAt: new Date(),
  grants: [{ role: "LOCAL_MANAGER", organizationId: "org1", locationIds: ["branch1"] }],
  memberships: [],
  managedBranchIds: ["branch1"],
} as unknown as Principal;

const klus = (o: Record<string, unknown> = {}) => ({
  id: "sh1",
  title: "Magazijn",
  description: null,
  status: "FILLED",
  visibility: "PUBLIC",
  startsAt: new Date("2026-11-20T08:00:00Z"),
  endsAt: new Date("2026-11-20T16:00:00Z"),
  breakMinutes: 30,
  hourlyRateCents: 1800,
  positions: 2,
  viaUitzendbureau: false,
  branch: { id: "branch1", name: "Hal 1", tenantId: "org1" },
  assignments: [{ id: "a1", freelancer: { id: "fp1", userId: "w1", user: { fullName: "Sanne" } } }],
  ...o,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-17T12:00:00Z"));
  requirePrincipal.mockResolvedValue(manager);
  h.tasks.length = 0;
  h.matched.length = 0;
  h.standby.length = 0;
  h.updates.length = 0;
  h.audits.length = 0;
  h.shift = klus();
});
afterEach(() => vi.useRealTimers());

const k = nl.klusWeerOpen;

describe("heropenShiftAction: een volle klus weer openzetten", () => {
  it("een plek vrij en nog iemand ingepland: deels bezet, er wordt gematcht en standby-werkers horen het", async () => {
    const r = await heropenShiftAction("sh1");
    expect(r).toEqual({ ok: true, message: k.gedaan });
    expect(h.updates).toEqual([{ where: { id: "sh1" }, data: { status: "PARTIALLY_FILLED" } }]);
    await Promise.all(h.tasks);
    expect(h.matched).toEqual(["sh1"]);
    expect(h.standby).toEqual(["sh1"]);
    expect(h.audits).toEqual([expect.objectContaining({ action: "shift.reopened_by_employer", targetId: "sh1" })]);
    expect(h.audits[0]?.summary).toContain("1/2 bezet");
  });

  it("niemand meer ingepland: de klus is weer gewoon open", async () => {
    h.shift = klus({ positions: 1, assignments: [] });
    const r = await heropenShiftAction("sh1");
    expect(r.ok).toBe(true);
    expect(h.updates[0]?.data.status).toBe("OPEN");
  });

  it("een klus die al open staat, hoeft niet: niets verandert", async () => {
    for (const status of ["OPEN", "MATCHING", "PARTIALLY_FILLED", "CANCELLED", "COMPLETED"]) {
      h.shift = klus({ status });
      expect(await heropenShiftAction("sh1"), status).toEqual({ ok: false, message: k.nietVol });
    }
    expect(h.updates).toEqual([]);
    await Promise.all(h.tasks);
    expect(h.matched).toEqual([]);
  });

  it("alle plekken bezet: er is niets om open te zetten", async () => {
    h.shift = klus({ positions: 1 });
    expect(await heropenShiftAction("sh1")).toEqual({ ok: false, message: k.alleBezet });
    expect(h.updates).toEqual([]);
  });

  it("een klus die al begonnen is, wordt niet meer opengezet", async () => {
    h.shift = klus({ startsAt: new Date("2026-11-17T11:00:00Z"), endsAt: new Date("2026-11-17T19:00:00Z") });
    expect(await heropenShiftAction("sh1")).toEqual({ ok: false, message: k.begonnen });
    expect(h.updates).toEqual([]);
  });

  it("een klus van een ander bedrijf kan niemand openzetten", async () => {
    h.shift = null;
    const r = await heropenShiftAction("sh9");
    expect(r.ok).toBe(false);
    expect(h.updates).toEqual([]);
    expect(h.audits).toEqual([]);
  });

  it("een werker mag het niet", async () => {
    requirePrincipal.mockResolvedValue({ ...manager, grants: [{ role: "FREELANCER", organizationId: "org1" }] } as unknown as Principal);
    const r = await heropenShiftAction("sh1");
    expect(r.ok).toBe(false);
    expect(h.updates).toEqual([]);
  });
});

describe("de knop op de klus", () => {
  const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

  it("staat alleen bij een volle klus met een vrije plek die nog niet begon, en niet bij een bedrijf in controle", () => {
    const pagina = lees("app/werkgever/diensten/[shiftId]/page.tsx");
    expect(pagina).toContain('{s.status === "FILLED" && seatsFree > 0 && verified && !shiftEnded && (');
    expect(pagina).toContain("<KlusWeerOpenKnop shiftId={s.id} />");
  });

  it("vraagt eerst, geeft de melding van de server in de taal van de app door en ververst de pagina", () => {
    const knop = lees("components/app/KlusWeerOpenKnop.tsx");
    expect(knop).toContain("heropenShiftAction(shiftId)");
    expect(knop).toContain("setVraag(true)");
    expect(knop).toContain("toast.success(res.message)");
    expect(knop).toContain("router.refresh()");
    expect(knop).toContain("useT().klusWeerOpen");
    for (const klasse of knop.match(/className="btn-[^"]*"/g) ?? []) expect(klasse, klasse).toContain("min-h-11");
  });

  it("de server-actie weigert een andere status dan volledig bezet en zet de status volgens het aantal ingeplande krachten", () => {
    const acties = lees("app/werkgever/diensten/[shiftId]/actions.ts");
    expect(acties).toContain("export async function heropenShiftAction(shiftId: string): Promise<OfferResponse> {");
    expect(acties).toContain('if (shift.status !== "FILLED") return { ok: false, message: k.nietVol };');
    expect(acties).toContain("status: statusNaHeropenen(shift.assignments.length)");
    expect(acties).toContain("getDict().catch(() => nlDict)");
  });
});
