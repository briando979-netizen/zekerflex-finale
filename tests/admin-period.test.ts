import { describe, expect, it } from "vitest";
import { bucketCount, bucketSum, dayKeyNl, deltaPct, resolvePeriod, safe, timelineKeys, within } from "@/lib/admin/period";

const NOW = new Date("2026-11-02T10:00:00Z");

describe("periodekeuze", () => {
  it("valt terug op de standaard bij een onbekende waarde", () => {
    expect(resolvePeriod(undefined, 30, NOW).days).toBe(30);
    expect(resolvePeriod("13", 30, NOW).days).toBe(30);
    expect(resolvePeriod("7", 30, NOW).days).toBe(7);
  });

  it("toont per maand vanaf 12 maanden", () => {
    expect(resolvePeriod("90", 30, NOW).bucket).toBe("day");
    const year = resolvePeriod("365", 30, NOW);
    expect(year.bucket).toBe("month");
    const keys = timelineKeys(year);
    expect(keys).toHaveLength(12);
    expect(keys[11]).toBe("2026-11");
    expect(keys[0]).toBe("2025-12");
  });

  it("geeft precies zoveel dagen als de periode, vandaag als laatste", () => {
    const keys = timelineKeys(resolvePeriod("7", 30, NOW));
    expect(keys).toHaveLength(7);
    expect(keys[6]).toBe("2026-11-02");
    expect(keys[0]).toBe("2026-10-27");
  });

  it("rekent dagen in Nederlandse tijd", () => {
    // 23:30 UTC op 1 nov is in Nederland al 2 nov (wintertijd)
    expect(dayKeyNl(new Date("2026-11-01T23:30:00Z"))).toBe("2026-11-02");
  });
});

describe("verdelen over de tijd", () => {
  const period = resolvePeriod("7", 30, NOW);
  const rows = [
    { at: new Date("2026-11-01T23:30:00Z"), cents: 500 }, // telt als 2 nov
    { at: new Date("2026-11-02T08:00:00Z"), cents: 100 },
    { at: new Date("2026-10-27T12:00:00Z"), cents: 50 },
    { at: new Date("2026-10-01T12:00:00Z"), cents: 9999 }, // buiten de grafiek
  ];

  it("telt waarden op bij de juiste dag en laat de rest weg", () => {
    const sums = bucketSum(rows, (r) => r.at, (r) => r.cents, period);
    expect(sums[6]).toBe(600);
    expect(sums[0]).toBe(50);
    expect(sums.reduce((a, b) => a + b, 0)).toBe(650);
  });

  it("telt rijen", () => {
    expect(bucketCount(rows, (r) => r.at, period)[6]).toBe(2);
  });

  it("slaat rijen zonder datum over", () => {
    expect(bucketCount([{ at: null }], (r) => r.at, period).every((v) => v === 0)).toBe(true);
  });
});

describe("vergelijken en terugvallen", () => {
  it("zegt niets als er geen vorige periode is", () => {
    expect(deltaPct(100, 0)).toBeNull();
  });

  it("rekent het verschil in procenten", () => {
    expect(deltaPct(150, 100)).toBe(50);
    expect(deltaPct(50, 100)).toBe(-50);
  });

  it("geeft null als iets van buiten te lang duurt of mislukt", async () => {
    await expect(within(new Promise((resolve) => setTimeout(() => resolve("laat"), 200)), 5)).resolves.toBeNull();
    await expect(within(Promise.reject(new Error("kapot")), 50)).resolves.toBeNull();
    await expect(within(Promise.resolve("op tijd"), 50)).resolves.toBe("op tijd");
  });

  it("vangt een mislukte query op", async () => {
    await expect(safe(async () => { throw new Error("kapot"); }, 7)).resolves.toBe(7);
    await expect(safe(async () => 3, 7)).resolves.toBe(3);
  });
});
