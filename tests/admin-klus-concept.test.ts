import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// De handrem van Beheer (23 nov 2026): een bedrijf dat nog niet is gecontroleerd zet zijn klus meteen live. Beheer kan een klus
// waar nog niemand op staat met één klik naar concept zetten (werkers zien hem niet meer) en weer live zetten.

const m = vi.hoisted(() => ({
  shiftFindFirst: vi.fn(),
  shiftUpdate: vi.fn(async () => ({})),
  recordAudit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { shift: { findFirst: m.shiftFindFirst, update: m.shiftUpdate } } }));
vi.mock("@/lib/audit", () => ({ recordAudit: m.recordAudit }));
vi.mock("@/lib/auth/handlers", () => ({
  withAdminAccess:
    (_roles: string[], handler: (req: Request, ctx: { principal: { userId: string; email: string }; params: { id: string; shiftId: string } }) => Promise<Response>) =>
    async (req: Request) => {
      try {
        return await handler(req, { principal: { userId: "admin-1", email: "beheer@zekerflex.nl" }, params: { id: "t1", shiftId: "s1" } });
      } catch (e) {
        const f = e as { status?: number; code?: string; message: string; name: string };
        if (f.name === "ZodError") return Response.json({ code: "VALIDATION_FAILED" }, { status: 422 });
        return Response.json({ code: f.code, message: f.message }, { status: f.status ?? 500 });
      }
    },
}));

const { POST } = await import("@/app/api/admin/bedrijven/[id]/klussen/[shiftId]/route");
const zet = (naar: unknown) => (POST as unknown as (r: Request) => Promise<Response>)(new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ naar }) }));

const klus = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  title: "Magazijnmedewerker",
  status: "OPEN",
  startsAt: new Date(Date.now() + 3 * 86_400_000),
  _count: { assignments: 0 },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.shiftFindFirst.mockResolvedValue(klus());
});

describe("een klus naar concept en weer live (Admin → Bedrijven)", () => {
  it("een open klus zonder ingeplande mensen gaat naar concept, met een regel in het auditspoor", async () => {
    const res = await zet("concept");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "DRAFT" });
    // de klus moet bij dit bedrijf horen: de vraag aan de database begrenst op de organisatie uit de URL
    expect(m.shiftFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "s1", branch: { tenantId: "t1" } } }));
    expect(m.shiftUpdate).toHaveBeenCalledWith({ where: { id: "s1" }, data: { status: "DRAFT" } });
    expect(m.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.shift.to_draft", targetId: "s1", actorUserId: "admin-1" }));
  });

  it("een klus waar al iemand op staat of die niet meer open is, kan niet naar concept", async () => {
    m.shiftFindFirst.mockResolvedValue(klus({ _count: { assignments: 1 } }));
    expect((await zet("concept")).status).toBe(409);
    m.shiftFindFirst.mockResolvedValue(klus({ status: "PARTIALLY_FILLED" }));
    expect((await zet("concept")).status).toBe(409);
    m.shiftFindFirst.mockResolvedValue(klus({ status: "COMPLETED" }));
    expect((await zet("concept")).status).toBe(409);
    expect(m.shiftUpdate).not.toHaveBeenCalled();
  });

  it("een concept gaat weer live zolang de starttijd niet voorbij is", async () => {
    m.shiftFindFirst.mockResolvedValue(klus({ status: "DRAFT" }));
    const res = await zet("live");
    expect(res.status).toBe(200);
    expect(m.shiftUpdate).toHaveBeenCalledWith({ where: { id: "s1" }, data: { status: "OPEN" } });
    expect(m.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.shift.to_live" }));

    vi.clearAllMocks();
    m.shiftFindFirst.mockResolvedValue(klus({ status: "DRAFT", startsAt: new Date(Date.now() - 3_600_000) }));
    expect((await zet("live")).status).toBe(409);
    m.shiftFindFirst.mockResolvedValue(klus({ status: "OPEN" }));
    expect((await zet("live")).status).toBe(409);
    expect(m.shiftUpdate).not.toHaveBeenCalled();
  });

  it("een klus van een ander bedrijf bestaat niet voor deze URL (404), en een onbekende keuze is ongeldig", async () => {
    m.shiftFindFirst.mockResolvedValue(null);
    expect((await zet("concept")).status).toBe(404);
    expect((await zet("verwijderen")).status).toBe(422);
    expect(m.shiftUpdate).not.toHaveBeenCalled();
  });

  it("de route is alleen voor platformbeheerders, en de pagina van het bedrijf toont de knop alleen waar het mag", () => {
    const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
    expect(lees("app/api/admin/bedrijven/[id]/klussen/[shiftId]/route.ts")).toMatch(/withAdminAccess<[^>]+>\(\["PLATFORM_ADMIN"\]/);
    const pagina = lees("app/admin/bedrijven/[id]/page.tsx");
    expect(pagina).toContain('(s.status === "OPEN" || s.status === "MATCHING") && s.assignments.length === 0');
    expect(pagina).toContain('naar="concept"');
    expect(pagina).toContain('naar="live"');
  });
});
