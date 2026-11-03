import { afterEach, describe, expect, it, vi } from "vitest";

const profileFindUnique = vi.fn();
const timesheetFindMany = vi.fn();
const timesheetFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: (...a: unknown[]) => profileFindUnique(...a) },
    timesheet: {
      findMany: (...a: unknown[]) => timesheetFindMany(...a),
      findFirst: (...a: unknown[]) => timesheetFindFirst(...a),
    },
  },
}));

// In-memory KV zodat aanpassingen (ritten:) en eigen ritten (ritten-eigen:) los van elkaar te testen zijn.
const store = new Map<string, unknown>();
const kvSet = vi.fn(async (key: string, value: unknown) => {
  store.set(key, JSON.parse(JSON.stringify(value)));
});
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (key: string) => (store.has(key) ? JSON.parse(JSON.stringify(store.get(key))) : null),
  kvSet: (key: string, value: unknown) => kvSet(key, value),
}));

const getFiscal = vi.fn();
const invoiceModeFor = vi.fn();
vi.mock("@/lib/fiscal/store", () => ({
  getFiscal: (...a: unknown[]) => getFiscal(...a),
  invoiceModeFor: (...a: unknown[]) => invoiceModeFor(...a),
}));

import { addManualTrip, deleteManualTrip, getMileageLog, mileageCsv, roundTripKm, setTripOverride, totalsFor } from "@/lib/worker/mileage";

const DAM = { latitude: 52.3731, longitude: 4.8926 };
const UTRECHT = { latitude: 52.0907, longitude: 5.1214 };
const NOW = new Date("2026-11-03T10:00:00Z");

function sheet(id: string, iso: string, branch = UTRECHT) {
  return {
    id,
    scheduledStart: new Date(iso),
    actualStart: null,
    assignment: { shift: { title: "Bediening" } },
    branch: { addressLine: "Oudegracht 1", postalCode: "3511 AA", city: "Utrecht", ...branch, tenant: { name: "Café De Brug" } },
  };
}

function withProfile(home = DAM, postal = "1012 JS") {
  profileFindUnique.mockResolvedValue({ id: "fp1", homeLatitude: home.latitude, homeLongitude: home.longitude, homePostalCode: postal });
  getFiscal.mockResolvedValue({});
  invoiceModeFor.mockReturnValue("reverse-billing");
}

afterEach(() => {
  vi.clearAllMocks();
  store.clear();
});

describe("roundTripKm", () => {
  it("schat heen en terug over de weg (hemelsbreed × omrijfactor × 2)", () => {
    const km = roundTripKm(DAM, UTRECHT);
    // ~35 km hemelsbreed → ~94 km heen en terug
    expect(km).toBeGreaterThan(85);
    expect(km).toBeLessThan(105);
    expect(roundTripKm(DAM, DAM)).toBe(0);
  });
});

describe("totalsFor", () => {
  it("telt uitgezette ritten niet mee en rekent € 0,23 per km", () => {
    const t = totalsFor([
      { km: 10, excluded: false },
      { km: 20.5, excluded: false },
      { km: 100, excluded: true },
    ]);
    expect(t).toEqual({ trips: 2, km: 30.5, amountCents: 702 });
  });
});

describe("getMileageLog", () => {
  it("maakt per dienst een rit en past eigen km en uitzetten toe", async () => {
    withProfile();
    store.set("ritten:u1", { t2: { km: 50 }, t3: { excluded: true } });
    // 23:30 UTC op 31 dec = 1 jan in Amsterdam: de dag volgt de Nederlandse kalender
    timesheetFindMany.mockResolvedValue([sheet("t3", "2025-12-31T23:30:00Z"), sheet("t1", "2026-03-02T08:00:00Z"), sheet("t2", "2026-03-03T08:00:00Z")]);

    const log = await getMileageLog("u1", 2026);
    expect(log).not.toBeNull();
    expect(log!.isPayroll).toBe(false);
    expect(log!.homeKnown).toBe(true);
    const [t3, t1, t2] = log!.trips;
    expect(t3!.excluded).toBe(true);
    expect(t3!.day).toBe("2026-01-01");
    expect(t1!.manual).toBe(false);
    expect(t1!.edited).toBe(false);
    expect(t1!.km).toBe(t1!.estimatedKm);
    expect(t1!.purpose).toBe("Bediening");
    expect(t2!.km).toBe(50);
    expect(t2!.edited).toBe(true);
    expect(log!.totals.trips).toBe(2);
    expect(log!.totals.km).toBeCloseTo((t1!.estimatedKm ?? 0) + 50, 1);

    const where = timesheetFindMany.mock.calls[0]![0].where;
    expect(where.freelancerId).toBe("fp1");
    expect(where.status.in).toEqual(["SUBMITTED", "APPROVED", "PAID"]);
    // jaargrens in Amsterdamse tijd: 1 jan 00:00 CET = 31 dec 23:00 UTC
    expect(where.scheduledStart.gte.toISOString()).toBe("2025-12-31T23:00:00.000Z");
  });

  it("zet eigen ritten van dat jaar tussen de diensten, op datum", async () => {
    withProfile();
    timesheetFindMany.mockResolvedValue([sheet("t1", "2026-03-02T08:00:00Z"), sheet("t2", "2026-05-01T08:00:00Z")]);
    await addManualTrip("u1", { day: "2026-04-10", destination: "Breda", company: "Bouwbedrijf Vos", purpose: "klus", km: 88 }, NOW);
    await addManualTrip("u1", { day: "2025-06-01", destination: "Gouda", company: "", purpose: "", km: 40 }, NOW);

    const log = await getMileageLog("u1", 2026);
    expect(log!.trips.map((t) => t.day)).toEqual(["2026-03-02", "2026-04-10", "2026-05-01"]);
    const own = log!.trips[1]!;
    expect(own.manual).toBe(true);
    expect(own.id.startsWith("m-")).toBe(true);
    expect(own.km).toBe(88);
    expect(own.estimatedKm).toBeNull();
    expect(log!.totals.trips).toBe(3);
  });

  it("schat niets zonder thuisadres", async () => {
    profileFindUnique.mockResolvedValue({ id: "fp1", homeLatitude: 0, homeLongitude: 0, homePostalCode: "" });
    getFiscal.mockResolvedValue({});
    invoiceModeFor.mockReturnValue("payroll");
    timesheetFindMany.mockResolvedValue([sheet("t1", "2026-03-02T08:00:00Z")]);

    const log = await getMileageLog("u1", 2026);
    expect(log!.homeKnown).toBe(false);
    expect(log!.isPayroll).toBe(true);
    expect(log!.trips[0]!.estimatedKm).toBeNull();
    expect(log!.trips[0]!.km).toBe(0);
  });

  it("geeft null zonder professional-profiel", async () => {
    profileFindUnique.mockResolvedValue(null);
    expect(await getMileageLog("u1", 2026)).toBeNull();
  });
});

describe("setTripOverride", () => {
  it("weigert een rit van iemand anders", async () => {
    timesheetFindFirst.mockResolvedValue(null);
    await expect(setTripOverride("u1", "t9", { km: 10 })).rejects.toThrow(/hoort niet bij jouw diensten/);
    expect(timesheetFindFirst.mock.calls[0]![0].where).toEqual({ id: "t9", freelancer: { userId: "u1" } });
    expect(kvSet).not.toHaveBeenCalled();
  });

  it("weigert een onzinnige afstand", async () => {
    timesheetFindFirst.mockResolvedValue({ id: "t1" });
    await expect(setTripOverride("u1", "t1", { km: -3 })).rejects.toThrow(/tussen 0 en/);
    await expect(setTripOverride("u1", "t1", { km: 99999 })).rejects.toThrow(/tussen 0 en/);
  });

  it("slaat km op, en ruimt de regel op als alles terug naar standaard is", async () => {
    timesheetFindFirst.mockResolvedValue({ id: "t1" });
    store.set("ritten:u1", { t1: { excluded: true }, t2: { km: 5 } });
    await setTripOverride("u1", "t1", { km: 12.34 });
    expect(store.get("ritten:u1")).toEqual({ t1: { excluded: true, km: 12.3 }, t2: { km: 5 } });

    await setTripOverride("u1", "t1", { km: null, excluded: false });
    expect(store.get("ritten:u1")).toEqual({ t2: { km: 5 } });
  });

  it("past de km van een eigen rit aan zonder de dienst-check", async () => {
    const trip = await addManualTrip("u1", { day: "2026-04-10", destination: "Breda", company: "", purpose: "", km: 88 }, NOW);
    await setTripOverride("u1", trip.id, { km: 91.26 });
    expect((store.get("ritten-eigen:u1") as { km: number }[])[0]!.km).toBe(91.3);
    expect(timesheetFindFirst).not.toHaveBeenCalled();
    await expect(setTripOverride("u1", trip.id, { km: null })).rejects.toThrow(/Vul de kilometers/);
    await expect(setTripOverride("u1", "m-bestaat-niet", { km: 5 })).rejects.toThrow(/bestaat niet meer/);
  });
});

describe("addManualTrip / deleteManualTrip", () => {
  it("controleert datum, afstand en bestemming", async () => {
    const base = { destination: "Breda", company: "", purpose: "", km: 10 };
    await expect(addManualTrip("u1", { ...base, day: "3-11-2026" }, NOW)).rejects.toThrow(/Kies een datum/);
    await expect(addManualTrip("u1", { ...base, day: "2026-02-30" }, NOW)).rejects.toThrow(/bestaat niet/);
    await expect(addManualTrip("u1", { ...base, day: "2026-11-04" }, NOW)).rejects.toThrow(/niet in de toekomst/);
    await expect(addManualTrip("u1", { ...base, day: "2019-12-31" }, NOW)).rejects.toThrow(/vanaf 2020/);
    await expect(addManualTrip("u1", { ...base, day: "2026-11-03", km: 0 }, NOW)).rejects.toThrow(/Vul de kilometers/);
    await expect(addManualTrip("u1", { ...base, day: "2026-11-03", destination: "  " }, NOW)).rejects.toThrow(/waar je naartoe/);
    expect(kvSet).not.toHaveBeenCalled();
  });

  it("verwijdert alleen eigen ritten", async () => {
    const trip = await addManualTrip("u1", { day: "2026-11-03", destination: " Breda ", company: " Vos ", purpose: "klus", km: 12.345 }, NOW);
    expect(trip).toMatchObject({ manual: true, day: "2026-11-03", destination: "Breda", company: "Vos", km: 12.3 });
    await expect(deleteManualTrip("u1", "t1")).rejects.toThrow(/uitzetten, niet verwijderen/);
    await deleteManualTrip("u1", trip.id);
    expect(store.get("ritten-eigen:u1")).toEqual([]);
    await expect(deleteManualTrip("u1", trip.id)).rejects.toThrow(/bestaat niet meer/);
  });
});

describe("mileageCsv", () => {
  it("maakt een Excel-vriendelijke rittenlijst met totaal", () => {
    const csv = mileageCsv({
      year: 2026,
      isPayroll: false,
      homeKnown: true,
      homePostalCode: "1012 JS",
      ratePerKmCents: 23,
      trips: [
        { id: "t1", manual: false, day: "2026-03-02", company: "Café; De Brug", purpose: "Bediening", destination: "Oudegracht 1, 3511 AA Utrecht", estimatedKm: 94.2, km: 94.2, edited: false, excluded: false },
        { id: "t2", manual: false, day: "2026-03-03", company: "X", purpose: "Afwas", destination: "Y", estimatedKm: 10, km: 10, edited: false, excluded: true },
        { id: "m-1", manual: true, day: "2026-03-04", company: "Vos", purpose: "klus", destination: "Breda", estimatedKm: null, km: 20, edited: false, excluded: false },
      ],
      totals: { trips: 2, km: 114.2, amountCents: 2627 },
    });
    expect(csv.startsWith("﻿Datum;")).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines[1]).toBe('2026-03-02;1012 JS;Oudegracht 1, 3511 AA Utrecht;"Café; De Brug";Dienst: Bediening;94,2;21,67;ja;ZekerFlex-dienst');
    expect(lines[2]).toBe("2026-03-03;1012 JS;Y;X;Dienst: Afwas;10,0;0,00;nee;ZekerFlex-dienst");
    expect(lines[3]).toBe("2026-03-04;1012 JS;Breda;Vos;klus;20,0;4,60;ja;zelf ingevoerd");
    expect(lines[4]).toBe("Totaal;;;;2 ritten;114,2;26,27;;");
  });
});
