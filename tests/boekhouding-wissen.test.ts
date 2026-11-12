import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const state = { soort: "TEST" as string | null, log: [] as string[] };
  const tabel = (naam: string, extra: Record<string, unknown> = {}) => ({
    deleteMany: async () => {
      state.log.push(naam);
      return { count: 2 };
    },
    ...extra,
  });
  const tx = {
    boekAdministratie: {
      findUnique: async () => (state.soort === null ? null : { id: "adm", soort: state.soort }),
      delete: async () => void state.log.push("BoekAdministratie"),
    },
    boekBankTransactie: tabel("BoekBankTransactie"),
    boekBankAfschrift: tabel("BoekBankAfschrift"),
    boekBankRekening: tabel("BoekBankRekening"),
    boekBon: tabel("BoekBon"),
    boekBtwAangifte: tabel("BoekBtwAangifte"),
    boekBtwPeriode: tabel("BoekBtwPeriode"),
    boekRegel: tabel("BoekRegel"),
    boekBoeking: {
      deleteMany: async ({ where }: { where: { keertBoekingId?: unknown } }) => {
        state.log.push(where.keertBoekingId ? "BoekBoeking(tegen)" : "BoekBoeking(rest)");
        return { count: 1 };
      },
    },
    boekVolgnummer: tabel("BoekVolgnummer"),
    boekPeriode: tabel("BoekPeriode"),
    boekBtwCode: tabel("BoekBtwCode"),
    boekRekening: tabel("BoekRekening", { updateMany: async () => void state.log.push("BoekRekening(ouders los)") }),
  };
  return { state, prisma: { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) } };
});
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));

import { AppError } from "@/lib/errors";
import { wisTestAdministratie } from "@/lib/boekhouding/test-wissen";

beforeEach(() => {
  m.state.soort = "TEST";
  m.state.log.length = 0;
});

describe("wisTestAdministratie()", () => {
  it("weigert een ECHTE administratie en wist dan niets", async () => {
    m.state.soort = "ECHT";
    await expect(wisTestAdministratie("adm")).rejects.toMatchObject({ status: 422 });
    await expect(wisTestAdministratie("adm")).rejects.toThrow(/Alleen een testadministratie/);
    expect(m.state.log).toEqual([]);
  });

  it("geeft een 404 voor een administratie die niet bestaat", async () => {
    m.state.soort = null;
    const e = await wisTestAdministratie("adm").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).status).toBe(404);
    expect(m.state.log).toEqual([]);
  });

  it("wist een TEST in de volgorde van de foreign keys", async () => {
    const r = await wisTestAdministratie("adm");
    expect(m.state.log).toEqual([
      "BoekBankTransactie",
      "BoekBankAfschrift",
      "BoekBankRekening",
      "BoekBon",
      "BoekBtwAangifte",
      "BoekBtwPeriode",
      "BoekRegel",
      "BoekBoeking(tegen)", // tegenboekingen eerst: ze verwijzen naar de boeking die ze opheffen
      "BoekBoeking(rest)",
      "BoekVolgnummer",
      "BoekPeriode",
      "BoekBtwCode",
      "BoekRekening(ouders los)", // kopje en kind verwijzen naar elkaar
      "BoekRekening",
      "BoekAdministratie",
    ]);
    expect(r.administratieId).toBe("adm");
    expect(r.verwijderd["BoekRegel"]).toBe(2);
    expect(r.verwijderd["BoekBoeking"]).toBe(2);
    expect(r.verwijderd["BoekAdministratie"]).toBe(1);
  });
});
