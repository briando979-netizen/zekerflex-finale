import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

// Punt 4 van de review van de proefklussen (21 nov 2026): twee acceptaties tegelijk zagen allebei "nog 1 over" en samen
// werden het er 3. Nu neemt het proefpad in de transactie die de ShiftAssignment maakt een slot per werker
// (pg_advisory_xact_lock) en telt daarbinnen opnieuw (eisProefklusInSlot, lib/fiscal/eligibility.ts). Hier een nagebootste
// database: vastgelegde rijen, een transactie die pas bij "commit" zichtbaar wordt, en het slot als wachtrij.

type Rij = { cancelledAt: Date | null; cancelReason: string | null; shift: { title: string; createdAt: Date; branch: { tenantId: string; tenant: { name: string } } } };

const h = vi.hoisted(() => ({
  /** vastgelegde (gecommitte) toewijzingen van werker u1 */
  rijen: [] as unknown[],
  profiel: { kvkValid: false, vatValid: false, payoutIban: null } as Record<string, unknown> | null,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: async () => h.profiel },
    shiftAssignment: { findMany: async () => [...h.rijen] },
  },
}));
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: async () => ({}), invoiceModeFor: () => "invoice" }));
vi.mock("@/lib/agreements/uitzend-contract", () => ({ activeUitzendContract: async () => null }));
vi.mock("@/lib/werkrecht/store", () => ({ werkrechtVoorWerk: async () => ({ ok: true, reden: null }) }));
vi.mock("@/lib/kvk/tegoed-opslag", () => ({ kvkWachtVan: async () => false }));
vi.mock("@/lib/admin/eigen-test", () => ({ leesEigenTest: async () => ({ tenants: {}, users: {} }) }));

import { eisProefklusInSlot, proefSlotSleutel } from "@/lib/fiscal/eligibility";
import { proefklusRuimte } from "@/lib/fiscal/proefklussen";
import { isWerkerNietKlaar } from "@/lib/fiscal/werker-niet-klaar";
import { AppError } from "@/lib/errors";

const klus = (): Rij => ({
  cancelledAt: null,
  cancelReason: null,
  shift: { title: "Orderpicker", createdAt: new Date("2026-11-01T10:00:00+01:00"), branch: { tenantId: "t1", tenant: { name: "Bakkerij Jansen" } } },
});

const wacht = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Het slot: wie het neemt, wacht op de vorige houder; vrij bij commit of rollback (net als pg_advisory_xact_lock). */
let slot: Promise<void> = Promise.resolve();
let sloten: unknown[][] = [];

/**
 * Eén "transactie" die een proefklus aanneemt: het slot en de nieuwe telling (eisProefklusInSlot), dan de nieuwe rij. Die
 * rij is pas na de commit voor anderen te zien; daarna gaat het slot vrij.
 */
async function aannemen(opties: { slotFaalt?: boolean } = {}): Promise<void> {
  let vrij: (() => void) | null = null;
  const nieuw: Rij[] = [];
  const tx = {
    $executeRaw: async (...args: unknown[]) => {
      if (opties.slotFaalt) throw new Error("database weg");
      sloten.push(args);
      const vorige = slot;
      slot = new Promise<void>((r) => (vrij = r));
      await vorige;
    },
    shiftAssignment: { findMany: async () => [...h.rijen] },
  } as unknown as Prisma.TransactionClient;
  try {
    await eisProefklusInSlot(tx, "u1");
    await wacht(5); // de rest van de transactie (aanmaken, urenbriefje, overeenkomst): genoeg tijd voor de ander
    nieuw.push(klus());
    h.rijen.push(...nieuw); // commit
  } finally {
    (vrij as (() => void) | null)?.();
  }
}

beforeEach(() => {
  h.rijen = [];
  h.profiel = { kvkValid: false, vatValid: false, payoutIban: null };
  slot = Promise.resolve();
  sloten = [];
});

describe("proefklussen tegelijk aannemen", () => {
  it("zonder slot zien twee acceptaties tegelijk allebei nog 1 over (het oude gat)", async () => {
    h.rijen = [klus()];
    const [a, b] = await Promise.all([proefklusRuimte("u1"), proefklusRuimte("u1")]);
    expect(a.over).toBe(1);
    expect(b.over).toBe(1);
  });

  it("met het slot: van twee tegelijk lukt er één, de ander krijgt de reden van de proefklussen", async () => {
    h.rijen = [klus()];
    const uit = await Promise.allSettled([aannemen(), aannemen()]);
    expect(uit.filter((u) => u.status === "fulfilled")).toHaveLength(1);
    const fout = uit.find((u): u is PromiseRejectedResult => u.status === "rejected")?.reason as AppError;
    expect(fout).toBeInstanceOf(AppError);
    expect(fout.status).toBe(412);
    expect(fout.sleutel).toBe("elig.proefOp");
    // gemerkt: een werkgever die deze reactie accepteert leest een eigen zin (app/werkgever/diensten/[shiftId]/actions.ts)
    expect(isWerkerNietKlaar(fout)).toBe(true);
    // nooit meer dan 2 echte klussen
    expect(h.rijen).toHaveLength(2);
  });

  it("drie tegelijk met 2 over: er komen er precies 2 bij", async () => {
    const uit = await Promise.allSettled([aannemen(), aannemen(), aannemen()]);
    expect(uit.filter((u) => u.status === "fulfilled")).toHaveLength(2);
    expect(h.rijen).toHaveLength(2);
  });

  it("het slot hoort bij deze werker, met een eigen voorvoegsel", async () => {
    await aannemen();
    expect(proefSlotSleutel("u1")).toBe("zf:proefklus:u1");
    expect(sloten[0]?.slice(1)).toEqual(["zf:proefklus:u1"]);
  });

  it("heeft de werker intussen alles ingevuld, dan gaat het door, ook als de proefklussen op zijn", async () => {
    h.rijen = [klus(), klus()];
    h.profiel = { kvkValid: true, vatValid: false, payoutIban: "NL00TEST0000000000" };
    await expect(aannemen()).resolves.toBeUndefined();
    expect(h.rijen).toHaveLength(3);
  });

  it("een storing in het slot houdt alleen het proefpad tegen (faalt dicht)", async () => {
    await expect(aannemen({ slotFaalt: true })).rejects.toThrow("database weg");
    expect(h.rijen).toHaveLength(0);
  });
});
