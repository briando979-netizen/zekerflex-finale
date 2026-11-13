import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { WATCHED_CRONS } from "@/lib/ops/heartbeat";

// Hartslagronde (13 nov 2026): op prod waren alle 49 bewaakte taken vers en geslaagd; niets stil gestopt. Deze bewaker eist dat elke
// taaknaam die de code als hartslag schrijft (recordCronRun / recordCronHeartbeat met een vaste naam, of een *_JOB-constante)
// bewaakt wordt in WATCHED_CRONS, of hieronder bewust niet, met de reden. En omgekeerd: een bewaakte taak moet ergens echt
// een hartslag schrijven, anders geeft de bewaking vals alarm.

/** Bewust niet bewaakt, met de reden (zie ook de toelichting in lib/ops/heartbeat.ts). */
const NIET_BEWAAKT: Record<string, string> = {
  "ai-warm": "schrijft alleen een hartslag als 'alles gratis' aan staat; anders zou de bewaking vals alarm geven",
  "no-show-sweep": "staat bewust niet in de cron (keuze eigenaar, lib/claims/no-show-sweep.ts; alleen met de hand, ?droog=1)",
};

function bestanden(): string[] {
  const uit: string[] = [];
  const loop = (dir: string) => {
    for (const naam of readdirSync(dir)) {
      const p = path.join(dir, naam);
      if (statSync(p).isDirectory()) loop(p);
      else if (/\.tsx?$/.test(naam)) uit.push(p);
    }
  };
  for (const top of ["lib", "app"]) loop(path.join(process.cwd(), top));
  return uit;
}

function geschrevenTaken(): Set<string> {
  const taken = new Set<string>();
  for (const f of bestanden()) {
    const tekst = readFileSync(f, "utf8");
    for (const m of tekst.matchAll(/record(?:CronRun|CronHeartbeat)\(\s*["'`]([a-z0-9-]+)["'`]/g)) taken.add(m[1] ?? "");
    for (const m of tekst.matchAll(/export const [A-Z_]+_JOB = ["'`]([a-z0-9-]+)["'`]/g)) taken.add(m[1] ?? "");
  }
  taken.delete("");
  return taken;
}

describe("cron-hartslag: elke hartslag bewaakt, elke bewaking gevoed", () => {
  const geschreven = geschrevenTaken();
  const bewaakt = new Set(WATCHED_CRONS.map((c) => c.job));

  it("elke taak die een hartslag schrijft, wordt bewaakt of staat bewust op de lijst", () => {
    expect([...geschreven].filter((t) => !bewaakt.has(t) && !Object.hasOwn(NIET_BEWAAKT, t)).sort()).toEqual([]);
  });

  it("elke bewaakte taak schrijft ergens echt een hartslag", () => {
    expect([...bewaakt].filter((t) => !geschreven.has(t)).sort()).toEqual([]);
  });

  it("de lijst 'niet bewaakt' en de bewaking overlappen niet", () => {
    expect(Object.keys(NIET_BEWAAKT).filter((t) => bewaakt.has(t))).toEqual([]);
  });

  it("de maandelijkse en wekelijkse taken hebben een venster dat minstens hun schema dekt", () => {
    const venster = (job: string) => WATCHED_CRONS.find((c) => c.job === job)?.maxAgeHours ?? 0;
    expect(venster("pensioen-aangifte")).toBeGreaterThanOrEqual(31 * 24);
    expect(venster("site-weekly-check")).toBeGreaterThanOrEqual(7 * 24);
    expect(venster("db-backup-verify")).toBeGreaterThanOrEqual(7 * 24);
  });
});
