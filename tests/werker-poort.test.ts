import { beforeEach, describe, expect, it, vi } from "vitest";
import { toegestaanTijdensOnboarding, werkerOnboardingKlaar, type WerkerPoortFeiten } from "@/lib/onboarding/werker-poort";

// De poort van de werker-app (10 nov 2026): eerst de onboarding helemaal invullen, dan de rest.

const ALLES: WerkerPoortFeiten = {
  soortGekozen: true,
  branchesGekozen: true,
  gegevensIngevuld: true,
  identiteitIngestuurd: true,
  werkrechtIngevuld: true,
  tweestapAan: true,
};

describe("werkerOnboardingKlaar", () => {
  it("alleen klaar als elke stap is ingevuld", () => {
    expect(werkerOnboardingKlaar(ALLES)).toBe(true);
    for (const k of Object.keys(ALLES) as (keyof WerkerPoortFeiten)[]) {
      // het recht om te werken hoort niet meer bij de onboarding (10 nov): dat telt vóór de eerste betaalde klus
      expect(werkerOnboardingKlaar({ ...ALLES, [k]: false })).toBe(k === "werkrechtIngevuld");
    }
  });
});

describe("toegestaanTijdensOnboarding", () => {
  it("de schermen om de stappen in te vullen en je account", () => {
    for (const p of ["/dashboard/verificatie", "/dashboard/verificatie/", "/dashboard/fiscaal", "/dashboard/account", "/dashboard/account/taal"]) {
      expect(toegestaanTijdensOnboarding(p)).toBe(true);
    }
  });

  it("al het andere toont de start, ook bijna-gelijke namen", () => {
    for (const p of ["/dashboard", "/dashboard/klussen", "/dashboard/diensten", "/dashboard/berichten", "/dashboard/verificatiex", "/dashboard/accounts", "", null, undefined]) {
      expect(toegestaanTijdensOnboarding(p)).toBe(false);
    }
  });
});

// --- de feiten op de server ----------------------------------------------------

const h = vi.hoisted(() => ({
  fiscal: {} as Record<string, unknown>,
  profiel: null as Record<string, unknown> | null,
  kyc: "NOT_STARTED" as string,
  inBehandeling: null as { id: string } | null,
  branches: null as { alle: boolean; branches: string[] } | null,
  werkrecht: [{ land: "NL", stand: "verklaring-nodig" }] as { land: string; stand: string }[] | null,
  tweestap: false,
  passkeys: 0,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: async () => h.profiel },
    user: { findUnique: async () => ({ kycStatus: h.kyc }) },
    identityVerification: { findFirst: async () => h.inBehandeling },
    passkey: { count: async () => h.passkeys },
  },
}));
vi.mock("@/lib/fiscal/store", () => ({
  getFiscal: async () => h.fiscal,
  fiscaalIngevuld: (f: Record<string, unknown>) => Boolean(f.workerKind),
  invoiceModeFor: (f: Record<string, unknown>) => (f.workerKind === "uitzendkracht" ? "payroll" : "invoice"),
}));
vi.mock("@/lib/agreements/uitzend-contract", () => ({ activeUitzendContract: async () => null }));
vi.mock("@/lib/worker/branche-store", () => ({ getBrancheKeuze: async () => h.branches }));
vi.mock("@/lib/auth/two-factor", () => ({ hasTwoFactor: async () => h.tweestap }));
vi.mock("@/lib/werkrecht/store", () => ({
  werkrechtOverzicht: async () => {
    if (h.werkrecht === null) throw new Error("storing");
    return h.werkrecht;
  },
}));

describe("werkerPoortStand", () => {
  beforeEach(() => {
    h.fiscal = { workerKind: "zzp", iban: "NL00TEST0000000000" };
    h.profiel = { kvkValid: false, kvkNumber: "12345678", payoutIban: null, homePostalCode: "1012AB" };
    h.kyc = "PENDING";
    h.inBehandeling = { id: "iv1" };
    h.branches = { alle: true, branches: [] };
    h.werkrecht = [{ land: "NL", stand: "wacht" }];
    h.tweestap = true;
    h.passkeys = 0;
  });

  it("zonder tweestapsverificatie en zonder passkey: niet klaar; een passkey telt ook", async () => {
    const { werkerPoortStand } = await import("@/lib/onboarding/werker-poort-server");
    h.tweestap = false;
    expect((await werkerPoortStand("u1")).klaar).toBe(false);
    h.passkeys = 1;
    expect((await werkerPoortStand("u1")).klaar).toBe(true);
  });

  it("alles ingevuld en in behandeling: klaar (goedkeuren hoeft niet om de app te zien)", async () => {
    const { werkerPoortStand } = await import("@/lib/onboarding/werker-poort-server");
    expect((await werkerPoortStand("u1")).klaar).toBe(true);
  });

  it("geen IBAN nodig voor de poort (dat komt vóór de eerste betaalde klus)", async () => {
    const { werkerPoortStand } = await import("@/lib/onboarding/werker-poort-server");
    h.fiscal = { workerKind: "zzp" };
    h.profiel = { ...h.profiel, payoutIban: null };
    expect((await werkerPoortStand("u1")).gegevensIngevuld).toBe(true);
  });

  it("een KVK-nummer van 8 cijfers telt ook als de KVK-koppeling het (nog) niet bevestigde", async () => {
    const { werkerPoortStand } = await import("@/lib/onboarding/werker-poort-server");
    expect((await werkerPoortStand("u1")).gegevensIngevuld).toBe(true);
    h.profiel = { ...h.profiel, kvkNumber: "pending-abc" };
    expect((await werkerPoortStand("u1")).gegevensIngevuld).toBe(false);
  });

  it("een Stripe-sessie die alleen geopend is, telt niet als ingestuurd", async () => {
    const { werkerPoortStand } = await import("@/lib/onboarding/werker-poort-server");
    h.inBehandeling = null;
    const s = await werkerPoortStand("u1");
    expect(s.identiteitIngestuurd).toBe(false);
    expect(s.klaar).toBe(false);
  });

  it("nog geen branches: niet klaar; zonder recht om te werken wél (dat komt vóór de eerste klus)", async () => {
    const { werkerPoortStand } = await import("@/lib/onboarding/werker-poort-server");
    h.branches = null;
    expect((await werkerPoortStand("u1")).klaar).toBe(false);
    h.branches = { alle: true, branches: [] };
    h.werkrecht = [{ land: "NL", stand: "bewijs-nodig" }];
    expect((await werkerPoortStand("u1")).klaar).toBe(true);
  });

  it("een storing bij het werkrecht gooit de app niet dicht", async () => {
    const { werkerPoortStand } = await import("@/lib/onboarding/werker-poort-server");
    h.werkrecht = null;
    expect((await werkerPoortStand("u1")).werkrechtIngevuld).toBe(true);
  });
});
