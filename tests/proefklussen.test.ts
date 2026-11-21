import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_PROEFKLUSSEN, magProefklus, proefklussenOver } from "@/lib/fiscal/proefklussen-kern";
import { nogVoorEersteKlus, type KlusFeiten } from "@/lib/onboarding/klaar-voor-klus";
import { klusStappen, poortSamenvatting } from "@/lib/admin/werker-poort-weergave";
import { FOUTEN } from "@/lib/i18n/fouten";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { WORKER_PUSH } from "@/lib/i18n/worker-push";
import { AppError } from "@/lib/errors";

// Proefklussen (21 nov 2026, eigenaar): een zzp'er of flexwerker mag zijn eerste 2 klussen aannemen zonder KVK/btw/KOR en
// zonder rekeningnummer; vanaf de derde zijn die verplicht. Voor een uitzendkracht verandert niets, en uitbetalen blijft
// wachten op de gegevens (lib/timesheets/approve.ts). De telling faalt dicht.

type Rij = { shift: { title: string; createdAt: Date; branch: { tenantId: string; tenant: { name: string } } } };

const h = vi.hoisted(() => ({
  fiscal: {} as Record<string, unknown>,
  profiel: null as Record<string, unknown> | null,
  rijen: [] as unknown[],
  telFout: false,
  geteld: 0,
  telVraag: null as unknown,
  kvkWacht: false,
  contract: { id: "c1" } as { id: string } | null,
  contractGevraagd: 0,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: async () => h.profiel },
    shiftAssignment: {
      findMany: async (vraag: unknown) => {
        h.geteld++;
        h.telVraag = vraag;
        if (h.telFout) throw new Error("database weg");
        return h.rijen;
      },
    },
  },
}));
vi.mock("@/lib/fiscal/store", () => ({
  getFiscal: async () => h.fiscal,
  invoiceModeFor: (f: Record<string, unknown>) => (f.workerKind === "uitzendkracht" ? "payroll" : "invoice"),
}));
vi.mock("@/lib/agreements/uitzend-contract", () => ({
  activeUitzendContract: async () => {
    h.contractGevraagd++;
    return h.contract;
  },
}));
vi.mock("@/lib/werkrecht/store", () => ({ werkrechtVoorWerk: async () => ({ ok: true, reden: null }) }));
vi.mock("@/lib/kvk/tegoed-opslag", () => ({ kvkWachtVan: async () => h.kvkWacht }));
vi.mock("@/lib/admin/eigen-test", () => ({ leesEigenTest: async () => ({ tenants: {}, users: {} }) }));

const klus = (bedrijf = "Bakkerij Jansen", title = "Orderpicker"): Rij => ({
  shift: { title, createdAt: new Date("2026-11-01T10:00:00+01:00"), branch: { tenantId: "t1", tenant: { name: bedrijf } } },
});

const NIETS = { kvkValid: false, vatValid: false, payoutIban: null };
const ALLES = { kvkValid: true, vatValid: true, payoutIban: "NL00TEST0000000000" };

beforeEach(() => {
  h.fiscal = {};
  h.profiel = { ...NIETS };
  h.rijen = [];
  h.telFout = false;
  h.geteld = 0;
  h.telVraag = null;
  h.kvkWacht = false;
  h.contract = { id: "c1" };
  h.contractGevraagd = 0;
});

describe("de regel (puur)", () => {
  it("0 en 1 aangenomen klussen: mag; 2 en 3: niet meer", () => {
    expect(MAX_PROEFKLUSSEN).toBe(2);
    expect(magProefklus(0)).toBe(true);
    expect(magProefklus(1)).toBe(true);
    expect(magProefklus(2)).toBe(false);
    expect(magProefklus(3)).toBe(false);
  });

  it("een onleesbaar aantal geeft geen ruimte", () => {
    expect(magProefklus(Number.NaN)).toBe(false);
    expect(magProefklus(-1)).toBe(false);
    expect(magProefklus(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("hoeveel er nog over zijn", () => {
    expect([0, 1, 2, 3].map(proefklussenOver)).toEqual([2, 1, 0, 0]);
    expect(proefklussenOver(Number.NaN)).toBe(0);
  });
});

describe("de telling", () => {
  it("telt aangenomen, niet geannuleerde klussen van deze werker (via het profiel) en laat testklussen weg", async () => {
    const { proefklusRuimte } = await import("@/lib/fiscal/proefklussen");
    h.rijen = [klus(), klus("Test bedrijven"), klus("Bakkerij Jansen", "Bediening (testklus)")];
    expect(await proefklusRuimte("u1")).toEqual({ over: 1, aangenomen: 1 });
    expect(h.telVraag).toMatchObject({ where: { cancelledAt: null, freelancer: { userId: "u1" } } });
    h.rijen = [klus(), klus()];
    expect(await proefklusRuimte("u1")).toEqual({ over: 0, aangenomen: 2 });
    h.rijen = [];
    expect(await proefklusRuimte("u1")).toEqual({ over: 2, aangenomen: 0 });
  });

  it("faalt dicht: bij een storing geen ruimte", async () => {
    const { proefklusRuimte } = await import("@/lib/fiscal/proefklussen");
    h.telFout = true;
    expect(await proefklusRuimte("u1")).toEqual({ over: 0, aangenomen: null });
  });
});

describe("payoutEligibility op het factuurspoor", () => {
  it("zonder KVK/btw/KOR en zonder IBAN, met ruimte: mag door, en zegt hoeveel er over zijn", async () => {
    const { payoutEligibility } = await import("@/lib/fiscal/eligibility");
    expect(await payoutEligibility("u1")).toEqual({ ok: true, track: "invoice", reason: null, proef: { over: 2 } });
    h.rijen = [klus()];
    expect(await payoutEligibility("u1")).toEqual({ ok: true, track: "invoice", reason: null, proef: { over: 1 } });
    // alleen het rekeningnummer ontbreekt: ook dan
    h.profiel = { ...ALLES, payoutIban: null };
    expect((await payoutEligibility("u1")).ok).toBe(true);
  });

  it("de derde klus: niet meer, met de nieuwe reden en sleutel", async () => {
    const { payoutEligibility } = await import("@/lib/fiscal/eligibility");
    h.rijen = [klus(), klus()];
    const uit = await payoutEligibility("u1");
    expect(uit).toEqual({ ok: false, track: "invoice", reason: FOUTEN["elig.proefOp"]!.nl, sleutel: "elig.proefOp" });
    expect(uit.reason).toContain("eerste 2 klussen");
  });

  it("na 2 klussen met KVK maar zonder IBAN: de bestaande melding over het rekeningnummer", async () => {
    const { payoutEligibility } = await import("@/lib/fiscal/eligibility");
    h.rijen = [klus(), klus()];
    h.profiel = { ...ALLES, payoutIban: null };
    expect(await payoutEligibility("u1")).toMatchObject({ ok: false, sleutel: "elig.iban", reason: FOUTEN["elig.iban"]!.nl });
  });

  it("na 2 klussen terwijl de KVK-controle wacht: de bestaande melding daarover", async () => {
    const { payoutEligibility } = await import("@/lib/fiscal/eligibility");
    h.rijen = [klus(), klus()];
    h.kvkWacht = true;
    expect(await payoutEligibility("u1")).toMatchObject({ ok: false, sleutel: "elig.kvkWacht", reason: FOUTEN["elig.kvkWacht"]!.nl });
  });

  it("een storing in de telling: de regel en de melding van vóór de proefklussen", async () => {
    const { payoutEligibility } = await import("@/lib/fiscal/eligibility");
    h.telFout = true;
    expect(await payoutEligibility("u1")).toEqual({ ok: false, track: "invoice", reason: FOUTEN["elig.kvk"]!.nl, sleutel: "elig.kvk" });
  });

  it("alles ingevuld: gewoon ok, zonder te tellen", async () => {
    const { payoutEligibility } = await import("@/lib/fiscal/eligibility");
    h.profiel = { ...ALLES };
    h.rijen = [klus(), klus(), klus()];
    expect(await payoutEligibility("u1")).toEqual({ ok: true, track: "invoice", reason: null });
    expect(h.geteld).toBe(0);
  });
});

describe("het loonspoor (uitzendkracht): ongewijzigd, geen proefklussen", () => {
  it("zonder BSN of rekeningnummer: niet ok, ook met 0 klussen, en er wordt niet geteld", async () => {
    const { payoutEligibility } = await import("@/lib/fiscal/eligibility");
    h.fiscal = { workerKind: "uitzendkracht" };
    expect(await payoutEligibility("u1")).toEqual({ ok: false, track: "payroll", reason: FOUTEN["elig.uitzendGegevens"]!.nl, sleutel: "elig.uitzendGegevens" });
    expect(h.geteld).toBe(0);
  });

  it("zonder getekende overeenkomst: niet ok; met alles: ok", async () => {
    const { payoutEligibility } = await import("@/lib/fiscal/eligibility");
    h.fiscal = { workerKind: "uitzendkracht", bsnHash: "x", iban: "NL00TEST0000000000" };
    h.contract = null;
    expect(await payoutEligibility("u1")).toEqual({ ok: false, track: "payroll", reason: FOUTEN["elig.contract"]!.nl, sleutel: "elig.contract" });
    h.contract = { id: "c1" };
    expect(await payoutEligibility("u1")).toEqual({ ok: true, track: "payroll", reason: null });
    expect(h.geteld).toBe(0);
  });
});

describe("eisUitzendGegevens: dezelfde controle voor een aanbod aannemen en automatisch inplannen", () => {
  const fout = async (p: Promise<void>): Promise<AppError> => {
    try {
      await p;
    } catch (e) {
      if (e instanceof AppError) return e;
      throw e;
    }
    throw new Error("er kwam geen fout");
  };

  it("een uitzendkracht zonder BSN: 412 met de bestaande reden en sleutel", async () => {
    const { eisUitzendGegevens } = await import("@/lib/fiscal/eligibility");
    h.fiscal = { workerKind: "uitzendkracht", iban: "NL00TEST0000000000" };
    const e = await fout(eisUitzendGegevens("u1"));
    expect(e.status).toBe(412);
    expect(e.message).toBe(FOUTEN["elig.uitzendGegevens"]!.nl);
    expect(e.sleutel).toBe("elig.uitzendGegevens");
  });

  it("een uitzendkracht zonder getekende overeenkomst: 412; met alles: door", async () => {
    const { eisUitzendGegevens } = await import("@/lib/fiscal/eligibility");
    h.fiscal = { workerKind: "uitzendkracht", bsnHash: "x", iban: "NL00TEST0000000000" };
    h.contract = null;
    const e = await fout(eisUitzendGegevens("u1"));
    expect(e.status).toBe(412);
    expect(e.sleutel).toBe("elig.contract");
    h.contract = { id: "c1" };
    await expect(eisUitzendGegevens("u1")).resolves.toBeUndefined();
  });

  it("het factuurspoor: doet niets (daar beslist de matching), ook zonder KVK", async () => {
    const { eisUitzendGegevens } = await import("@/lib/fiscal/eligibility");
    await expect(eisUitzendGegevens("u1")).resolves.toBeUndefined();
    expect(h.contractGevraagd).toBe(0);
    expect(h.geteld).toBe(0);
  });
});

describe("de kaart 'klaar voor je eerste klus' zegt hetzelfde als de poort", () => {
  const zzp: KlusFeiten = { soort: "zzp", payroll: false, idGoedgekeurd: true, bsn: false, contract: true, bedrijf: false, kvkWacht: false, iban: false, werkrechtOpen: false };

  it("met proefruimte houden KVK/btw/KOR en het rekeningnummer reageren niet tegen; zonder wel", () => {
    expect(nogVoorEersteKlus(zzp)).toEqual(["bedrijf", "iban"]);
    expect(nogVoorEersteKlus({ ...zzp, proefRuimte: false })).toEqual(["bedrijf", "iban"]);
    expect(nogVoorEersteKlus({ ...zzp, proefRuimte: true })).toEqual([]);
    expect(nogVoorEersteKlus({ ...zzp, proefRuimte: true, kvkWacht: true })).toEqual([]);
    // het ID en het recht om te werken blijven vooraf nodig
    expect(nogVoorEersteKlus({ ...zzp, proefRuimte: true, idGoedgekeurd: false, werkrechtOpen: true })).toEqual(["werkrecht", "idWacht"]);
  });

  it("een uitzendkracht heeft geen proefklussen", () => {
    const uitzend: KlusFeiten = { ...zzp, soort: "uitzendkracht", payroll: true, contract: false, proefRuimte: true };
    expect(nogVoorEersteKlus(uitzend)).toEqual(["bsn", "contract", "iban"]);
  });

  it("Beheer: met proefruimte tellen de twee rijen niet als open stap", () => {
    expect(poortSamenvatting(klusStappen(zzp))).toMatch(/^2 stappen open/);
    const met = klusStappen({ ...zzp, proefRuimte: true });
    expect(poortSamenvatting(met)).toBe("Alles af: de werker kan op klussen reageren");
    expect(met.find((r) => r.key === "bedrijf")).toMatchObject({ ok: false, optioneel: true });
    expect(met.find((r) => r.key === "iban")?.uitleg).toMatch(/Uitbetalen wacht er wel op/);
  });
});

describe("de teksten", () => {
  it("de regel op Ontdekken staat er in vijf talen en belooft geen uitbetaling zonder gegevens", () => {
    expect(FREELANCER_DICTS.nl.start.proefHint).toBe(
      "Je kunt je eerste 2 klussen al doen. Je geld krijg je zodra je KVK- of btw-nummer en je rekeningnummer hebt ingevuld.",
    );
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      expect(d.start.proefHint, taal).toContain("2");
      expect(d.start.proefHint, taal).toContain("KVK");
      expect(d.start.proefKnop.length, taal).toBeGreaterThan(3);
      if (taal !== "nl") expect(d.start.proefHint, taal).not.toBe(FREELANCER_DICTS.nl.start.proefHint);
    }
  });

  it("de push bij uren die wachten op KVK/btw staat er in vijf talen", () => {
    expect(WORKER_PUSH.nl.payoutBedrijfBody).toBe(
      "Je uren staan klaar. Vul je KVK- en btw-nummer in, dan kan je opdrachtgever ze goedkeuren en krijg je je geld.",
    );
    for (const taal of ["en", "pl", "ro", "uk"] as const) {
      expect(WORKER_PUSH[taal].payoutBedrijfTitle, taal).not.toBe(WORKER_PUSH.nl.payoutBedrijfTitle);
      expect(WORKER_PUSH[taal].payoutBedrijfBody, taal).not.toBe(WORKER_PUSH.nl.payoutBedrijfBody);
      expect(WORKER_PUSH[taal].payoutBedrijfBody.length, taal).toBeLessThanOrEqual(180);
    }
  });
});
