import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Uren invullen (wens eigenaar, 12 nov): geen Overslaan bij de beoordeling (sterren verplicht, ook op de server),
// Terug gaat vanaf elke stap één voor één terug tot stap 1, en een uitzendkracht ziet in het overzicht waarom
// er geen keuze voor de uitbetaling is. Vaste klok, datums met een zone.

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvAppend: async (k: string, v: unknown) => void kv.set(k, [...((kv.get(k) as unknown[] | undefined) ?? []), v]),
}));
const update = vi.fn(async (..._a: unknown[]) => ({ id: "ts-1", status: "SUBMITTED", billableMinutes: 450 }));
let timesheet: Record<string, unknown> | null = null;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: async () => ({ id: "fp-1" }) },
    timesheet: { findFirst: async () => timesheet, update: (...a: unknown[]) => update(...a) },
  },
}));
vi.mock("@/lib/auth", () => ({
  requirePrincipal: async () => ({ userId: "u-1", fullName: "Test Werker" }),
  requireRole: () => undefined,
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => undefined }));
vi.mock("@/lib/audit", () => ({ recordAudit: async () => undefined }));
vi.mock("@/lib/notifications/employer-push", () => ({ pushHoursSubmitted: async () => undefined }));
vi.mock("@/lib/run-after", () => ({ runAfter: () => undefined }));

const { stappenVolgorde, volgendeStap, vorigeStap } = await import("@/lib/timesheets/indien-stappen");
const { POST } = await import("@/app/api/timesheets/[timesheetId]/submit/route");
const { FREELANCER_DICTS } = await import("@/lib/i18n/freelancer");

const START = new Date("2026-11-12T09:00:00+01:00");
const EIND = new Date("2026-11-12T17:00:00+01:00");
const REVIEWS = "reviews:company-tnt-1";

function indienen(body: Record<string, unknown>) {
  const req = new Request("http://app:3000/api/timesheets/ts-1/submit", { method: "POST", body: JSON.stringify({ breakMinutes: 30, ...body }) });
  return POST(req, { params: Promise.resolve({ timesheetId: "ts-1" }) });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T17:30:00+01:00"));
  update.mockClear();
  kv.clear();
  timesheet = {
    id: "ts-1",
    status: "DRAFT",
    scheduledStart: START,
    scheduledEnd: EIND,
    actualStart: null,
    actualEnd: null,
    breakMinutes: 30,
    branch: { tenantId: "tnt-1" },
    assignment: { shiftId: "s-1", shift: { title: "Bediening" } },
  };
});
afterEach(() => {
  vi.useRealTimers();
});

describe("stappenmachine", () => {
  it("Terug loopt vanaf het overzicht één voor één terug tot stap 1", () => {
    for (const payroll of [false, true]) {
      const volgorde = stappenVolgorde(payroll);
      const bezocht: string[] = [];
      let stap: ReturnType<typeof vorigeStap> = "confirm";
      while (stap) {
        bezocht.push(stap);
        stap = vorigeStap(volgorde, stap);
      }
      expect(bezocht).toEqual([...volgorde].reverse());
      expect(bezocht.at(-1)).toBe("worked");
    }
  });

  it("elke stap na stap 1 heeft een Terug, stap 1 niet; Niet gewerkt gaat terug naar stap 1", () => {
    const volgorde = stappenVolgorde(false);
    for (const stap of volgorde.slice(1)) expect(vorigeStap(volgorde, stap)).not.toBeNull();
    expect(vorigeStap(volgorde, "worked")).toBeNull();
    expect(vorigeStap(volgorde, "notWorked")).toBe("worked");
  });

  it("een uitzendkracht heeft geen stap voor de uitbetaling; Verder blijft op het overzicht staan", () => {
    expect(stappenVolgorde(true)).not.toContain("payout");
    expect(stappenVolgorde(false)).toContain("payout");
    expect(volgendeStap(stappenVolgorde(false), "confirm")).toBe("confirm");
    expect(volgendeStap(stappenVolgorde(true), "review")).toBe("confirm");
  });
});

describe("POST /api/timesheets/:id/submit en de beoordeling", () => {
  it("weigert uren zonder beoordeling met 422 en slaat niets op", async () => {
    const res = await indienen({});
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/beoordeling/);
    expect(update).not.toHaveBeenCalled();
    expect(kv.get(REVIEWS)).toBeUndefined();
  });

  it("weigert 0 sterren (422)", async () => {
    const res = await indienen({ review: { rating: 0 } });
    expect(res.status).toBe(422);
    expect(update).not.toHaveBeenCalled();
  });

  it("slaat de beoordeling op bij het indienen; de toelichting is optioneel", async () => {
    const res = await indienen({ review: { rating: 4, text: "Fijne ploeg" } });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledTimes(1);
    const opgeslagen = kv.get(REVIEWS) as { rating: number; text: string; shiftId: string; authorId: string; authorRole: string }[];
    expect(opgeslagen).toHaveLength(1);
    expect(opgeslagen[0]).toMatchObject({ rating: 4, text: "Fijne ploeg", shiftId: "s-1", authorId: "u-1", authorRole: "freelancer" });

    kv.clear();
    expect((await indienen({ review: { rating: 5 } })).status).toBe(200);
    expect((kv.get(REVIEWS) as { text: string }[])[0]?.text).toBe("");
  });

  it("al beoordeeld voor deze klus: indienen mag zonder, en er komt geen tweede beoordeling", async () => {
    kv.set(REVIEWS, [{ id: "r1", subjectType: "company", subjectId: "tnt-1", authorId: "u-1", authorName: "Test Werker", authorRole: "freelancer", rating: 3, text: "", shiftId: "s-1", at: "2026-11-12T16:00:00Z" }]);
    expect((await indienen({})).status).toBe(200);
    expect((await indienen({ review: { rating: 5 } })).status).toBe(200);
    expect(kv.get(REVIEWS) as unknown[]).toHaveLength(1);
  });
});

describe("het scherm", () => {
  const bron = readFileSync("components/app/TimesheetSubmitForm.tsx", "utf8");

  it("heeft geen Overslaan meer en stuurt de beoordeling mee met de uren", () => {
    expect(bron).not.toMatch(/T\.skip\b/);
    expect(bron).not.toContain('fetch("/api/reviews"');
    expect(bron).toContain("review: { rating, text: reviewText }");
    expect(bron).toContain("vorigeStap(order, step)");
  });

  it("heeft de nieuwe teksten in alle vijf talen", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      expect(d.ts.reviewRequired, taal).toMatch(/\S/);
      expect(d.ts.payrollPayLine, taal).toMatch(/\S/);
      expect(Object.hasOwn(d.ts, "skip"), taal).toBe(false);
      expect(Object.hasOwn(d.ts, "skipped"), taal).toBe(false);
    }
    expect(FREELANCER_DICTS.nl.ts.payrollPayLine).toBe("Je loon komt met de wekelijkse verloning (loonstrook).");
  });
});
