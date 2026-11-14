import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { FLAG_REGISTRY } from "@/lib/flags";
import { WATCHED_CRONS } from "@/lib/ops/heartbeat";
import {
  KLUSSEN_VERLOPEN_JOB,
  KV_VERLOPEN_METING,
  MARGE_UREN,
  NOG_LOPEND,
  VERLOPEN_VLAG,
  rondVerlopenAf,
  verlopenWhere,
  zonderInschrijvingWhere,
  type VerlopenAfhankelijkheden,
  type VerlopenMeting,
} from "@/lib/shifts/verlopen";

// Klussen na afloop afronden (14 nov): niets zette een klus ooit op COMPLETED; uitgevoerde klussen bleven OPEN/FILLED.
const NU = new Date("2026-11-14T03:20:00+00:00");

function nep(aan: boolean, aantallen: { met: number; zonder: number }) {
  const gesloten: Prisma.ShiftWhereInput[] = [];
  const bewaard: VerlopenMeting[] = [];
  const d: VerlopenAfhankelijkheden = {
    aan: async () => aan,
    tel: async (where) => ("some" in ((where.assignments as object | undefined) ?? {}) ? aantallen.met : aantallen.zonder),
    sluit: async (where) => {
      gesloten.push(where);
      return aantallen.met;
    },
    bewaar: async (m) => void bewaard.push(m),
  };
  return { d, gesloten, bewaard };
}

describe("klussen na afloop afronden", () => {
  it("pakt alleen klussen ruim na hun eindtijd waar nog iemand op staat", () => {
    const w = verlopenWhere(NU);
    expect(w.assignments).toEqual({ some: { cancelledAt: null } });
    expect(w.endsAt).toEqual({ lt: new Date(NU.getTime() - MARGE_UREN * 3_600_000) });
    expect(w.status).toEqual({ in: [...NOG_LOPEND] });
  });

  it("raakt een concept, een geannuleerde of een al afgeronde klus nooit aan", () => {
    for (const s of ["DRAFT", "CANCELLED", "COMPLETED"]) expect(NOG_LOPEND as readonly string[]).not.toContain(s);
  });

  it("een klus zonder inschrijving blijft open (onvervulde vraag); die wordt alleen geteld", () => {
    expect(zonderInschrijvingWhere(NU).assignments).toEqual({ none: { cancelledAt: null } });
  });

  it("met de vlag uit telt hij alleen en verandert hij niets", async () => {
    const { d, gesloten, bewaard } = nep(false, { met: 8, zonder: 22 });
    const m = await rondVerlopenAf(d, NU);
    expect(gesloten).toEqual([]);
    expect(m).toEqual({ at: NU.toISOString(), droog: true, gevonden: 8, gesloten: 0, zonderInschrijving: 22 });
    expect(bewaard).toEqual([m]);
  });

  it("met de vlag aan sluit hij met precies dezelfde voorwaarde als het tellen", async () => {
    const { d, gesloten } = nep(true, { met: 8, zonder: 22 });
    const m = await rondVerlopenAf(d, NU);
    expect(m.droog).toBe(false);
    expect(m.gesloten).toBe(8);
    expect(gesloten).toEqual([verlopenWhere(NU)]);
  });

  it("niets gevonden: geen schrijfactie, wel een stand", async () => {
    const { d, gesloten, bewaard } = nep(true, { met: 0, zonder: 3 });
    const m = await rondVerlopenAf(d, NU);
    expect(gesloten).toEqual([]);
    expect(m.gesloten).toBe(0);
    expect(bewaard).toHaveLength(1);
  });

  it("de stand in KV is een meting zonder persoonsgegevens", () => {
    expect(KV_VERLOPEN_METING).toBe("meting:klussen-verlopen");
  });

  it("staat standaard uit, heeft een hartslag van een dag en staat in de cron", () => {
    expect(FLAG_REGISTRY.find((f) => f.key === VERLOPEN_VLAG)?.default).toBe(false);
    expect(WATCHED_CRONS.find((c) => c.job === KLUSSEN_VERLOPEN_JOB)?.maxAgeHours).toBe(26);
    const cron = readFileSync(path.join(process.cwd(), "deploy/cron/entrypoint.sh"), "utf8");
    expect(cron).toMatch(/^20 3 \* \* \* wget .*\/api\/internal\/klussen\/verlopen"\r?$/m);
  });
});
