import { beforeEach, describe, expect, it, vi } from "vitest";

// Seizoensthema's: welk feest het in Nederland is (op de Nederlandse kalender,
// niet die van de server in UTC), aan/uit per thema, en verjaardagen.

const store = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => structuredClone(store.get(k) ?? null),
  kvSet: async (k: string, v: unknown) => void store.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void store.delete(k),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
const fiscal = new Map<string, string | null>();
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: async (userId: string) => ({ birthDate: fiscal.get(userId) ?? null }) }));

import { isBirthdayOn, seasonOn } from "@/lib/seasons/calendar";
import { _resetSeasonCache, activeSeason, birthdayToday, birthdayValue, saveSeasonSettings, setUserBirthday } from "@/lib/seasons/settings";
import { isBirthdayToday } from "@/lib/birthday";
import { easterMonthDay } from "@/lib/time/easter";
import { publicHolidaysOf } from "@/lib/payroll/cao";

beforeEach(() => {
  store.clear();
  fiscal.clear();
  _resetSeasonCache();
});

describe("welk feest is het", () => {
  it.each([
    ["2026-01-01", "nieuwjaar"],
    ["2026-01-02", "nieuwjaar"],
    ["2026-01-03", null],
    ["2026-02-14", "valentijn"],
    ["2026-02-15", "carnaval"], // Pasen 2026 = 5 april: carnaval 15–17 februari
    ["2026-02-17", "carnaval"],
    ["2026-02-18", null],
    ["2026-04-03", "pasen"], // Goede Vrijdag
    ["2026-04-06", "pasen"], // tweede paasdag
    ["2026-04-07", null],
    ["2027-03-26", "pasen"], // Pasen 2027 = 28 maart
    ["2027-02-07", "carnaval"],
    ["2026-04-27", "koningsdag"],
    ["2025-04-26", "koningsdag"], // 27 april 2025 was een zondag
    ["2025-04-27", null],
    ["2026-10-28", null],
    ["2026-10-29", "halloween"],
    ["2026-10-31", "halloween"],
    ["2026-11-03", null],
    ["2026-12-05", "sinterklaas"],
    ["2026-12-20", "kerst"],
    ["2026-12-26", "kerst"],
    ["2026-12-31", "oudjaar"],
    ["onzin", null],
  ])("%s → %s", (day, theme) => {
    expect(seasonOn(day)).toBe(theme);
  });

  it("de paasberekening is verhuisd, maar de feestdagen in de loonregels blijven gelijk", () => {
    expect(easterMonthDay(2025)).toEqual({ month: 4, day: 20 });
    expect(easterMonthDay(2026)).toEqual({ month: 4, day: 5 });
    expect(easterMonthDay(2027)).toEqual({ month: 3, day: 28 });
    const h = publicHolidaysOf(2026);
    for (const day of ["2026-04-03", "2026-04-05", "2026-04-06", "2026-05-14", "2026-05-24", "2026-05-25"]) expect(h.has(day)).toBe(true);
  });
});

describe("aan en uit, op de Nederlandse klok", () => {
  it("telt af naar middernacht in Nederland op 31 december", async () => {
    expect(await activeSeason(new Date("2026-12-31T12:00:00Z"))).toEqual({ id: "oudjaar", countdownTo: "2026-12-31T23:00:00.000Z" });
    // 23:30 UTC is al 00:30 op 1 januari in Nederland
    expect((await activeSeason(new Date("2026-12-31T23:30:00Z")))?.id).toBe("nieuwjaar");
  });

  it("een uitgezet thema, of alles uit, toont niets", async () => {
    await saveSeasonSettings({ aan: true, uit: ["kerst"] }, { userId: "admin" });
    expect(await activeSeason(new Date("2026-12-24T12:00:00Z"))).toBeNull();
    expect((await activeSeason(new Date("2026-12-31T12:00:00Z")))?.id).toBe("oudjaar");
    await saveSeasonSettings({ aan: false, uit: [] }, { userId: "admin" });
    expect(await activeSeason(new Date("2026-12-31T12:00:00Z"))).toBeNull();
  });
});

describe("verjaardagen", () => {
  it("telt de Nederlandse dag, niet de UTC-dag van de server", () => {
    expect(isBirthdayToday("1990-06-15", new Date("2026-06-14T22:30:00Z"))).toBe(true); // 00:30 op 15 juni in Nederland
    expect(isBirthdayToday("1990-06-15", new Date("2026-06-15T22:30:00Z"))).toBe(false);
    expect(isBirthdayToday("23-10-1990", new Date("2026-10-23T09:00:00Z"))).toBe(false);
  });

  it("29 februari viert in andere jaren op 28 februari", () => {
    expect(isBirthdayOn("2000-02-29", "2026-02-28")).toBe(true);
    expect(isBirthdayOn("02-29", "2028-02-29")).toBe(true);
    expect(isBirthdayOn("02-29", "2028-02-28")).toBe(false);
  });

  it("alleen echte data mogen erin", () => {
    expect(birthdayValue(2, 29)).toBe("02-29");
    expect(birthdayValue(4, 31)).toBeNull();
    expect(birthdayValue(13, 1)).toBeNull();
    expect(birthdayValue(0, 10)).toBeNull();
  });

  it("eigen verjaardag, anders de geboortedatum van een flexwerker; uit te zetten", async () => {
    const day = new Date("2026-11-03T10:00:00Z");
    await setUserBirthday("u-werkgever", "11-03");
    fiscal.set("u-flex", "1995-11-03");
    expect(await birthdayToday("u-werkgever", day)).toBe(true);
    expect(await birthdayToday("u-flex", day)).toBe(true);
    expect(await birthdayToday("u-niemand", day)).toBe(false);
    await setUserBirthday("u-werkgever", null);
    expect(await birthdayToday("u-werkgever", day)).toBe(false);
    await saveSeasonSettings({ aan: true, uit: ["verjaardag"] }, { userId: "admin" });
    expect(await birthdayToday("u-flex", day)).toBe(false);
  });
});
