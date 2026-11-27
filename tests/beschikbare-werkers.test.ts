import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const count = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { freelancerProfile: { count: () => count() } } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: () => undefined } }));

import { beschikbareWerkers, MIN_OM_TE_TONEN } from "@/lib/marketing/beschikbare-werkers";

// Het aantal beschikbare werkers op /bedrijven is een belofte aan een bedrijf: hij mag nooit blijven staan als we het
// niet weten. Zelfde afspraak als lib/marketing/echte-klussen.ts (22 nov 2026): bij twijfel niets tonen.

describe("beschikbare werkers", () => {
  beforeEach(() => {
    count.mockReset();
    delete (globalThis as { __zfBeschikbareWerkers?: unknown }).__zfBeschikbareWerkers;
  });

  it("geeft het aantal zodra er genoeg zijn", async () => {
    count.mockResolvedValue(46);
    expect(await beschikbareWerkers(1_000)).toBe(46);
  });

  it("zegt niets bij te weinig werkers: dan is het geen bewijs", async () => {
    count.mockResolvedValue(MIN_OM_TE_TONEN - 1);
    expect(await beschikbareWerkers(1_000)).toBeNull();
  });

  it("zegt niets als de database het niet weet (nooit een loze belofte)", async () => {
    count.mockRejectedValue(new Error("db weg"));
    expect(await beschikbareWerkers(1_000)).toBeNull();
  });

  it("telt hoogstens eens per vijf minuten", async () => {
    count.mockResolvedValue(46);
    await beschikbareWerkers(1_000);
    await beschikbareWerkers(2_000);
    expect(count).toHaveBeenCalledTimes(1);
    await beschikbareWerkers(1_000 + 5 * 60_000 + 1);
    expect(count).toHaveBeenCalledTimes(2);
  });

  it("laat test- en interne accounts niet meetellen als beschikbare werker", () => {
    const bron = readFileSync(path.join(process.cwd(), "lib/marketing/beschikbare-werkers.ts"), "utf8");
    for (const deel of [".test", ".example", ".invalid", "@zekerflex.com"]) expect(bron, deel).toContain(`"${deel}"`);
    expect(bron).toContain('kycStatus: "VERIFIED"');
    expect(bron).toContain("disabledAt: null");
  });

  it("de kop van /bedrijven valt terug op de algemene tekst als we het niet weten", () => {
    const pagina = readFileSync(path.join(process.cwd(), "app/(marketing)/bedrijven/page.tsx"), "utf8");
    expect(pagina).toContain('werkers === null ? "Geverifieerde mensen"');
    expect(pagina).toContain("beschikbareWerkers().catch(() => null)");
  });
});
