import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Inchecken is optioneel per bedrijf (lib/checkin/vereist.ts). Bij een bedrijf dat inchecken uit heeft staan nemen we geen nieuwe
// check-in meer aan (geen QR, geen GPS-controle, geen geofence-geschil), met een vaste sleutel voor de vijf talen van de werker-app.
// Wie al was ingecheckt voor het uitzetten kan gewoon nog uitchecken, en een storing in de opslag verandert niets.

type Rij = Record<string, unknown> & { id: string; type: string };
const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  kvKapot: false,
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
}));

const BRANCH = { latitude: 52.3676, longitude: 4.9041, geofenceRadiusMeters: 150, tenantId: "t1" };

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => {
    if (h.kvKapot) throw new Error("opslag weg");
    return h.kv.get(k) ?? null;
  },
}));
vi.mock("@/lib/logger", () => {
  const stil = { info: () => undefined, warn: () => undefined, error: () => undefined };
  return { logger: { child: () => stil, ...stil } };
});
vi.mock("@/lib/audit", () => ({ recordAudit: async () => undefined }));
vi.mock("@/lib/engagement/events", () => ({ recordEngagement: async () => undefined }));
vi.mock("@/lib/webhooks/dispatcher", () => ({ dispatchWebhook: async () => undefined }));
vi.mock("@/lib/locatie/printen", () => ({ badgeNaInchecken: async () => undefined }));
vi.mock("@/lib/prisma", () => {
  const tx = {
    $queryRaw: async () => [{ id: h.ts?.id }],
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
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

import { recordGpsEvent, type RecordGpsEventInput } from "@/lib/timesheets/checkin";
import { AppError } from "@/lib/errors";

const START = new Date("2026-11-09T08:00:00+01:00");
const EINDE = new Date("2026-11-09T16:30:00+01:00");
const OP_LOCATIE = { latitude: BRANCH.latitude, longitude: BRANCH.longitude, accuracyMeters: 12, deviceHash: "toestel-1234" };
const UIT = { vereist: false, sinds: "2026-11-08T10:00:00.000Z" };

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
  h.kv.clear();
  h.kvKapot = false;
  h.events = [];
  h.updates = [];
  h.disputes = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T09:15:00+01:00"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("inchecken bij een bedrijf dat het (niet) vraagt", () => {
  it("standaard, zonder keuze van het bedrijf: een check-in wordt aangenomen", async () => {
    const r = await recordGpsEvent(tik({}));
    expect(r).toMatchObject({ type: "CHECK_IN", withinGeofence: true, dubbel: false });
    expect(h.events).toHaveLength(1);
    expect(h.ts?.actualStart).toEqual(new Date("2026-11-09T09:15:00+01:00"));
  });

  it("inchecken uit: een nieuwe check-in wordt geweigerd (412) met een vaste sleutel, en er wordt niets vastgelegd", async () => {
    h.kv.set("incheck:instelling:t1", UIT);
    const e = await fout(recordGpsEvent(tik({})));
    expect(e.status).toBe(412);
    expect(e.sleutel).toBe("checkin.nietNodig");
    expect(e.message).toBe("Dit bedrijf vraagt geen inchecken. Dien na afloop je uren in.");
    expect(h.events).toHaveLength(0);
    expect(h.updates).toHaveLength(0);
    expect(h.disputes).toHaveLength(0);
    expect(h.ts?.actualStart).toBeNull();
  });

  it("ook een zonder bereik bewaarde check-in wordt geweigerd: geen achterdeur voor een bedrijf dat het niet vraagt", async () => {
    h.kv.set("incheck:instelling:t1", UIT);
    const e = await fout(recordGpsEvent(tik({ bron: "offline", clientId: "tik-0001", recordedAt: new Date("2026-11-09T08:02:00+01:00") })));
    expect(e.status).toBe(412);
    expect(e.sleutel).toBe("checkin.nietNodig");
    expect(h.events).toHaveLength(0);
  });

  it("wie al was ingecheckt voordat het bedrijf inchecken uitzette, kan nog uitchecken", async () => {
    await recordGpsEvent(tik({}));
    h.kv.set("incheck:instelling:t1", UIT);
    vi.setSystemTime(new Date("2026-11-09T16:31:00+01:00"));
    const r = await recordGpsEvent(tik({ type: "CHECK_OUT" }));
    expect(r).toMatchObject({ type: "CHECK_OUT", dubbel: false });
    expect(h.events.map((e) => e.type)).toEqual(["CHECK_IN", "CHECK_OUT"]);
  });

  it("de keuze geldt per bedrijf: een ander bedrijf blijft gewoon inchecken", async () => {
    h.kv.set("incheck:instelling:t2", UIT);
    await expect(recordGpsEvent(tik({}))).resolves.toMatchObject({ type: "CHECK_IN" });
  });

  it("een storing in de opslag verandert niets: inchecken blijft kunnen, zoals altijd", async () => {
    h.kv.set("incheck:instelling:t1", UIT);
    h.kvKapot = true;
    await expect(recordGpsEvent(tik({}))).resolves.toMatchObject({ type: "CHECK_IN" });
  });
});
