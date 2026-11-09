import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Inchecken en uitchecken zonder bereik (lib/timesheets/offline.ts + checkin.ts):
// het bewaarde tijdstip alleen binnen de grenzen, nooit stil teruggezet via de
// gewone route, dubbel versturen met hetzelfde clientId telt één keer, en de
// opdrachtgever krijgt altijd een signaal op het urenbriefje.

type Rij = Record<string, unknown> & { id: string; type: string };
const h = vi.hoisted(() => ({
  ts: null as null | {
    id: string;
    freelancerId: string;
    branchId: string;
    status: string;
    scheduledStart: Date;
    scheduledEnd: Date;
    actualStart: Date | null;
    actualEnd: Date | null;
    breakMinutes: number;
    billableMinutes: number;
  },
  events: [] as Rij[],
  updates: [] as Record<string, unknown>[],
  disputes: [] as Record<string, unknown>[],
  sloten: 0,
  badges: 0,
}));

const BRANCH = { latitude: 52.3676, longitude: 4.9041, geofenceRadiusMeters: 150, tenantId: "t1" };

vi.mock("@/lib/logger", () => {
  const stil = { info: () => undefined, warn: () => undefined, error: () => undefined };
  return { logger: { child: () => stil, ...stil } };
});
vi.mock("@/lib/audit", () => ({ recordAudit: async () => undefined }));
vi.mock("@/lib/engagement/events", () => ({ recordEngagement: async () => undefined }));
vi.mock("@/lib/webhooks/dispatcher", () => ({ dispatchWebhook: async () => undefined }));
vi.mock("@/lib/locatie/printen", () => ({
  badgeNaInchecken: async () => {
    h.badges++;
  },
}));
vi.mock("@/lib/auth", () => ({
  requirePrincipal: async () => ({ userId: "u1", grants: [{ role: "FREELANCER" }] }),
  requireRole: () => undefined,
}));
vi.mock("@/lib/prisma", () => {
  const tx = {
    $queryRaw: async () => {
      h.sloten++;
      return [{ id: h.ts?.id }];
    },
    timesheet: {
      findUnique: async () =>
        h.ts && { status: h.ts.status, actualStart: h.ts.actualStart, actualEnd: h.ts.actualEnd, billableMinutes: h.ts.billableMinutes },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(h.ts ?? {}, data);
        h.updates.push(data);
        return h.ts;
      },
    },
    gpsEvent: {
      findMany: async () => h.events.map((e) => ({ ...e })),
      create: async ({ data }: { data: Record<string, unknown> & { type: string } }) => {
        const e = { id: `e${h.events.length + 1}`, ...data };
        h.events.push(e);
        return e;
      },
    },
    deviceFingerprint: { upsert: async () => ({ id: "fp1" }), findMany: async () => [], update: async () => ({}) },
    dispute: {
      upsert: async ({ create }: { create: { origin: string } }) => {
        h.disputes.push(create);
        return { origin: create.origin };
      },
    },
  };
  return {
    prisma: {
      timesheet: { findUnique: async () => h.ts && { ...h.ts, branch: BRANCH, freelancer: { userId: "u1" } } },
      freelancerProfile: { findUnique: async () => ({ id: "fl1" }) },
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

import { BEWAARD_MAX_MS, LIVE_MARGE_MS, beoordeelOffline, liveTijdstip, offlineTijdstip } from "@/lib/timesheets/offline";
import { recordGpsEvent, type RecordGpsEventInput } from "@/lib/timesheets/checkin";
import { evaluateTimesheetFraud } from "@/lib/fraud/timesheet";
import { AppError } from "@/lib/errors";
import { POST } from "@/app/api/timesheets/[timesheetId]/gps/route";

const START = new Date("2026-11-09T08:00:00+01:00");
const EINDE = new Date("2026-11-09T16:30:00+01:00");
const OP_LOCATIE = { latitude: BRANCH.latitude, longitude: BRANCH.longitude, accuracyMeters: 12, deviceHash: "toestel-1234" };

function nieuwBriefje() {
  h.ts = {
    id: "ts1",
    freelancerId: "fl1",
    branchId: "b1",
    status: "DRAFT",
    scheduledStart: START,
    scheduledEnd: EINDE,
    actualStart: null,
    actualEnd: null,
    breakMinutes: 30,
    billableMinutes: 0,
  };
}

const tik = (extra: Partial<RecordGpsEventInput>): RecordGpsEventInput => ({
  timesheetId: "ts1",
  freelancerProfileId: "fl1",
  type: "CHECK_IN",
  ...OP_LOCATIE,
  ...extra,
});

async function fout(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error("geen fout");
}

beforeEach(() => {
  nieuwBriefje();
  h.events = [];
  h.updates = [];
  h.disputes = [];
  h.sloten = 0;
  h.badges = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T09:15:00+01:00"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("de grenzen voor een bewaard tijdstip", () => {
  const nu = new Date("2026-11-09T09:15:00+01:00");
  const basis = { type: "CHECK_IN" as const, nu, geplandeStart: START, geplandEinde: EINDE, ingechecktOp: null };

  it("binnen [begin − een uur, ontvangst] en hoogstens 12 uur oud: goed", () => {
    expect(beoordeelOffline({ ...basis, tik: new Date("2026-11-09T08:02:00+01:00") })).toEqual({ ok: true });
    expect(beoordeelOffline({ ...basis, tik: new Date("2026-11-09T07:00:00+01:00") })).toEqual({ ok: true });
    expect(beoordeelOffline({ ...basis, tik: nu })).toEqual({ ok: true });
  });

  it("nooit in de toekomst, nooit ruim vóór de dienst, nooit ouder dan 12 uur", () => {
    expect(beoordeelOffline({ ...basis, tik: new Date(nu.getTime() + 1_000) })).toEqual({ ok: false, reden: "toekomst" });
    expect(beoordeelOffline({ ...basis, tik: new Date("2026-11-09T06:59:00+01:00") })).toEqual({ ok: false, reden: "voorDienst" });
    const laat = new Date("2026-11-10T00:30:00+01:00");
    expect(beoordeelOffline({ ...basis, nu: laat, tik: new Date(laat.getTime() - BEWAARD_MAX_MS - 60_000) })).toEqual({ ok: false, reden: "teOud" });
  });

  it("uitchecken niet na einde + zes uur en niet vóór het inchecken", () => {
    const nacht = new Date("2026-11-09T23:00:00+01:00");
    expect(beoordeelOffline({ ...basis, type: "CHECK_OUT", nu: nacht, tik: new Date("2026-11-09T22:31:00+01:00") })).toEqual({ ok: false, reden: "naDienst" });
    expect(
      beoordeelOffline({ ...basis, type: "CHECK_OUT", tik: new Date("2026-11-09T08:01:00+01:00"), ingechecktOp: new Date("2026-11-09T08:02:00+01:00") }),
    ).toEqual({ ok: false, reden: "voorInchecken" });
  });

  it("de verstreken tijd volgens de telefoon telt, niet zijn klok", () => {
    // de klok van de telefoon loopt 10 minuten achter
    const t = offlineTijdstip({ tikOp: new Date("2026-11-09T07:52:00+01:00"), verzondenOp: new Date("2026-11-09T09:05:00+01:00"), nu });
    expect(t).toEqual(new Date("2026-11-09T08:02:00+01:00"));
    expect(offlineTijdstip({ tikOp: new Date("2026-11-09T09:00:00+01:00"), verzondenOp: new Date("2026-11-09T08:00:00+01:00"), nu })).toBe("klok");
    expect(offlineTijdstip({ tikOp: new Date("2026-11-09T08:02:00+01:00"), nu })).toEqual(new Date("2026-11-09T08:02:00+01:00"));
  });

  it("direct verstuurd: de klok van de telefoon alleen binnen twee minuten vóór ontvangst", () => {
    expect(liveTijdstip(new Date(nu.getTime() - 30_000), nu)).toEqual(new Date(nu.getTime() - 30_000));
    expect(liveTijdstip(new Date(nu.getTime() - LIVE_MARGE_MS - 1), nu)).toEqual(nu);
    expect(liveTijdstip(new Date(nu.getTime() + 5_000), nu)).toEqual(nu);
    expect(liveTijdstip(undefined, nu)).toEqual(nu);
  });
});

describe("recordGpsEvent met een bewaarde tik", () => {
  it("binnen de grenzen: het tijdstip van tikken, bron offline, ontvangen om nu, geofence op de bewaarde plek", async () => {
    const r = await recordGpsEvent(
      tik({ bron: "offline", clientId: "tik-0001", recordedAt: new Date("2026-11-09T08:02:00+01:00"), verzondenOp: new Date("2026-11-09T09:15:00+01:00") }),
    );
    expect(r.recordedAt).toBe(new Date("2026-11-09T08:02:00+01:00").toISOString());
    expect(r).toMatchObject({ bron: "offline", dubbel: false, withinGeofence: true, disputeRaised: null });
    expect(r.ontvangenOp).toBe(new Date("2026-11-09T09:15:00+01:00").toISOString());
    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toMatchObject({ bron: "offline", clientId: "tik-0001", latitude: BRANCH.latitude, ontvangenOp: new Date("2026-11-09T09:15:00+01:00") });
    expect(h.ts?.actualStart).toEqual(new Date("2026-11-09T08:02:00+01:00"));
    expect(h.sloten).toBe(1);
    expect(h.badges).toBe(0); // geen badge meer printen: de werker is al lang binnen
  });

  it("een bewaarde plek buiten de vestiging geeft net als altijd een GPS-geschil", async () => {
    const r = await recordGpsEvent(tik({ bron: "offline", clientId: "tik-0002", latitude: 52.39, longitude: 4.9041, recordedAt: new Date("2026-11-09T08:02:00+01:00") }));
    expect(r.withinGeofence).toBe(false);
    expect(r.disputeRaised).toBe("GEOFENCE_VIOLATION");
  });

  it("buiten de grenzen: geweigerd met een reden, niets vastgelegd", async () => {
    const e = await fout(recordGpsEvent(tik({ bron: "offline", clientId: "tik-0003", recordedAt: new Date("2026-11-09T06:30:00+01:00") })));
    expect(e.status).toBe(422);
    expect(e.details).toEqual({ reden: "voorDienst" });
    expect(h.events).toHaveLength(0);
    expect(h.updates).toHaveLength(0);

    const toekomst = await fout(recordGpsEvent(tik({ bron: "offline", clientId: "tik-0004", recordedAt: new Date("2026-11-09T09:20:00+01:00") })));
    expect(toekomst.details).toEqual({ reden: "toekomst" });
  });

  it("uitchecken vóór het inchecken wordt geweigerd", async () => {
    await recordGpsEvent(tik({ bron: "offline", clientId: "tik-0005", recordedAt: new Date("2026-11-09T08:02:00+01:00") }));
    const e = await fout(recordGpsEvent(tik({ type: "CHECK_OUT", bron: "offline", clientId: "tik-0006", recordedAt: new Date("2026-11-09T08:00:00+01:00") })));
    expect(e.details).toEqual({ reden: "voorInchecken" });
  });

  it("hetzelfde clientId twee keer: één registratie, de tweede keer het bestaande event", async () => {
    const eerst = await recordGpsEvent(tik({ bron: "offline", clientId: "tik-0007", recordedAt: new Date("2026-11-09T08:02:00+01:00") }));
    vi.setSystemTime(new Date("2026-11-09T09:16:00+01:00"));
    const weer = await recordGpsEvent(tik({ bron: "offline", clientId: "tik-0007", recordedAt: new Date("2026-11-09T08:02:00+01:00") }));
    expect(h.events).toHaveLength(1);
    expect(h.updates).toHaveLength(1);
    expect(weer).toMatchObject({ dubbel: true, eventId: eerst.eventId, recordedAt: eerst.recordedAt, actualStart: eerst.actualStart, bron: "offline" });
    // ook nadat het urenbriefje al is ingediend: het event is er, geen fout
    if (h.ts) h.ts.status = "SUBMITTED";
    await expect(recordGpsEvent(tik({ bron: "offline", clientId: "tik-0007", recordedAt: new Date("2026-11-09T08:02:00+01:00") }))).resolves.toMatchObject({ dubbel: true });
  });

  it("een ander clientId voor dezelfde actie blijft een conflict", async () => {
    await recordGpsEvent(tik({ clientId: "tik-0008" }));
    const e = await fout(recordGpsEvent(tik({ bron: "offline", clientId: "tik-0009", recordedAt: new Date("2026-11-09T08:02:00+01:00") })));
    expect(e.status).toBe(409);
    expect(h.events).toHaveLength(1);
  });

  it("een locatie-ping kan niet offline worden bewaard", async () => {
    const e = await fout(recordGpsEvent(tik({ type: "HEARTBEAT", bron: "offline", recordedAt: new Date("2026-11-09T08:02:00+01:00") })));
    expect(e.status).toBe(422);
  });
});

describe("recordGpsEvent direct verstuurd", () => {
  it("een teruggezette tijd zonder bron offline wordt de servertijd, nooit stil overgenomen", async () => {
    const r = await recordGpsEvent(tik({ clientId: "tik-0010", recordedAt: new Date("2026-11-09T04:15:00+01:00") }));
    expect(r.recordedAt).toBe(new Date("2026-11-09T09:15:00+01:00").toISOString());
    expect(r).toMatchObject({ bron: "apparaat", ontvangenOp: null, dubbel: false });
    expect(h.events[0]).toMatchObject({ bron: "apparaat", ontvangenOp: null });
    expect(h.badges).toBe(1);
  });

  it("een tijd van een halve minuut geleden (GPS zoeken) blijft staan", async () => {
    const r = await recordGpsEvent(tik({ recordedAt: new Date("2026-11-09T09:14:30+01:00") }));
    expect(r.recordedAt).toBe(new Date("2026-11-09T09:14:30+01:00").toISOString());
  });
});

describe("POST /api/timesheets/:id/gps", () => {
  const post = (body: Record<string, unknown>) =>
    POST(new Request("http://localhost/api/timesheets/ts1/gps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), {
      params: Promise.resolve({ timesheetId: "ts1" }),
    });
  const bewaard = {
    type: "CHECK_IN",
    ...OP_LOCATIE,
    recordedAt: new Date("2026-11-09T08:02:00+01:00").toISOString(),
    clientId: "8f14e45f-ceea-467a-9575-2a1c0b6a1f00",
    offline: true,
    verzondenOp: new Date("2026-11-09T09:15:00+01:00").toISOString(),
  };

  it("201 de eerste keer, 200 met hetzelfde event de tweede keer", async () => {
    const a = await post(bewaard);
    expect(a.status).toBe(201);
    const b = await post(bewaard);
    expect(b.status).toBe(200);
    expect(await b.json()).toMatchObject({ dubbel: true, bron: "offline" });
    expect(h.events).toHaveLength(1);
  });

  it("422 met de reden als het te lang geleden is", async () => {
    vi.setSystemTime(new Date("2026-11-09T21:30:00+01:00"));
    const r = await post({ ...bewaard, verzondenOp: new Date("2026-11-09T21:30:00+01:00").toISOString() });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ error: { code: "VALIDATION_FAILED", details: { reden: "teOud" } } });
  });
});

describe("signaal voor de opdrachtgever", () => {
  const briefje = {
    scheduledStart: START,
    scheduledEnd: EINDE,
    actualStart: new Date("2026-11-09T08:02:00+01:00"),
    actualEnd: new Date("2026-11-09T16:30:00+01:00"),
    breakMinutes: 30,
    billableMinutes: 478,
    overlappingCount: 0,
  };
  const ev = (type: string, recordedAt: string, extra: Record<string, unknown> = {}) => ({
    type,
    mocked: false,
    withinGeofence: true,
    distanceToBranchMeters: 20,
    recordedAt: new Date(recordedAt),
    ...extra,
  });

  it("een offline check-in krijgt altijd een waarschuwing met de tijd van tikken en van ontvangst", () => {
    const flags = evaluateTimesheetFraud({
      ...briefje,
      gpsEvents: [
        ev("CHECK_IN", "2026-11-09T08:02:00+01:00", { bron: "offline", ontvangenOp: new Date("2026-11-09T09:15:00+01:00") }),
        ev("CHECK_OUT", "2026-11-09T16:30:00+01:00", { bron: "apparaat", ontvangenOp: null }),
      ],
    });
    expect(flags).toContainEqual({
      code: "OFFLINE_CHECKIN",
      severity: "warning",
      message: "Check-in zonder bereik vastgelegd om 08:02, ontvangen om 09:15. Controleer of de tijd klopt.",
    });
    expect(flags.some((f) => f.code === "OFFLINE_CHECKOUT")).toBe(false);
  });

  it("ontvangen op een andere dag: met de datum erbij", () => {
    const flags = evaluateTimesheetFraud({
      ...briefje,
      gpsEvents: [ev("CHECK_IN", "2026-11-09T08:02:00+01:00"), ev("CHECK_OUT", "2026-11-09T16:30:00+01:00", { bron: "offline", ontvangenOp: new Date("2026-11-10T07:15:00+01:00") })],
    });
    expect(flags.find((f) => f.code === "OFFLINE_CHECKOUT")?.message).toBe(
      "Check-out zonder bereik vastgelegd om 16:30, ontvangen op 10 nov om 07:15. Controleer of de tijd klopt.",
    );
  });

  it("live en oude registraties (zonder bron) geven geen offline-signaal", () => {
    const flags = evaluateTimesheetFraud({ ...briefje, gpsEvents: [ev("CHECK_IN", "2026-11-09T08:02:00+01:00"), ev("CHECK_OUT", "2026-11-09T16:30:00+01:00", { bron: "apparaat" })] });
    expect(flags.filter((f) => f.code.startsWith("OFFLINE"))).toEqual([]);
  });
});
