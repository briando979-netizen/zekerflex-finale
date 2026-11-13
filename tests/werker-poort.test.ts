import { beforeEach, describe, expect, it, vi } from "vitest";
import { BRANCHE_STAP_SINDS, branchesTellen, openVerplicht, toegestaanTijdensOnboarding, volgendeNaVerificatie, werkerOnboardingKlaar, type WerkerPoortFeiten } from "@/lib/onboarding/werker-poort";

// De onboarding van de werker (10 nov 2026). Sinds 12 nov is de app open en wacht alleen reageren op de onboarding;
// tweestapsverificatie is dan optioneel (eigenaar).

const ALLES: WerkerPoortFeiten = {
  soortGekozen: true,
  branchesGekozen: true,
  gegevensIngevuld: true,
  identiteitIngestuurd: true,
  werkrechtIngevuld: true,
  tweestapAan: true,
  fotoGezet: true,
};

describe("volgendeNaVerificatie (klaar-scherm van Verificatie)", () => {
  it("alleen de foto mist: rechtstreeks naar de foto", () => {
    expect(volgendeNaVerificatie({ ...ALLES, fotoGezet: false })).toBe("foto");
    expect(volgendeNaVerificatie({ ...ALLES, fotoGezet: false, tweestapAan: false, werkrechtIngevuld: false })).toBe("foto");
  });

  it("er mist nog iets anders (branches bij een oud account): naar de stappen, niet naar de fotopagina die terugstuurt", () => {
    expect(volgendeNaVerificatie({ ...ALLES, fotoGezet: false, branchesGekozen: false })).toBe("stappen");
    expect(volgendeNaVerificatie({ ...ALLES, branchesGekozen: false })).toBe("stappen");
  });

  it("klaar, een testaccount of een storing (geen feiten): het gewone klaar-scherm", () => {
    expect(volgendeNaVerificatie(ALLES)).toBe("klaar");
    expect(volgendeNaVerificatie(null)).toBe("klaar");
  });

  it("telt alleen de verplichte stappen die open staan", () => {
    expect(openVerplicht(ALLES)).toBe(0);
    expect(openVerplicht({ ...ALLES, fotoGezet: false, tweestapAan: false })).toBe(1);
    expect(openVerplicht({ ...ALLES, fotoGezet: false, branchesGekozen: false })).toBe(2);
  });
});

describe("werkerOnboardingKlaar", () => {
  it("alleen klaar als elke verplichte stap is ingevuld", () => {
    expect(werkerOnboardingKlaar(ALLES)).toBe(true);
    for (const k of Object.keys(ALLES) as (keyof WerkerPoortFeiten)[]) {
      // het recht om te werken hoort niet meer bij de onboarding (10 nov): dat telt vóór de eerste betaalde klus;
      // tweestapsverificatie is sinds 12 nov optioneel (eigenaar)
      expect(werkerOnboardingKlaar({ ...ALLES, [k]: false })).toBe(k === "werkrechtIngevuld" || k === "tweestapAan");
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
  foto: true as boolean,
  email: "werker@voorbeeld.nl" as string | null,
  aangemeld: null as Date | null,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: async () => h.profiel },
    user: { findUnique: async () => (h.email === null ? null : { kycStatus: h.kyc, email: h.email, createdAt: h.aangemeld }) },
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
vi.mock("@/lib/profile/store", () => ({ getUserProfileExtra: async () => (h.foto ? { avatarUploadId: "up1" } : {}) }));
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
    h.foto = true;
    h.email = "werker@voorbeeld.nl";
    h.aangemeld = null;
  });

  it("zonder profielfoto: niet klaar", async () => {
    const { werkerPoortStand } = await import("@/lib/onboarding/werker-poort-server");
    h.foto = false;
    const s = await werkerPoortStand("u1");
    expect(s.fotoGezet).toBe(false);
    expect(s.klaar).toBe(false);
  });

  it("zonder tweestapsverificatie en zonder passkey: toch klaar (optioneel sinds 12 nov), en de stand zegt het", async () => {
    const { werkerPoortStand } = await import("@/lib/onboarding/werker-poort-server");
    h.tweestap = false;
    const s = await werkerPoortStand("u1");
    expect(s.tweestapAan).toBe(false);
    expect(s.klaar).toBe(true);
    h.passkeys = 1;
    expect((await werkerPoortStand("u1")).tweestapAan).toBe(true);
  });

  it("reageren wacht op de onboarding: 412 met de reden, geen 403; afgerond, testaccount of storing: door", async () => {
    const { eisOnboardingVoorReageren, ONBOARDING_EERST, onboardingKlaarVoorReageren } = await import("@/lib/onboarding/werker-poort-server");
    await expect(eisOnboardingVoorReageren("u1")).resolves.toBeUndefined();
    h.foto = false;
    await expect(eisOnboardingVoorReageren("u1")).rejects.toMatchObject({ status: 412, code: "PRECONDITION_FAILED", message: ONBOARDING_EERST });
    expect(await onboardingKlaarVoorReageren("u1")).toBe(false);
    // de beoordelaars van Apple en Google (testaccount) vallen erbuiten
    h.email = "appreview@zekerflex.test";
    expect(await onboardingKlaarVoorReageren("u1")).toBe(true);
    // een storing in een bron houdt reageren niet tegen (de controles vóór werk staan daar los van)
    h.email = "werker@voorbeeld.nl";
    h.fiscal = null as unknown as Record<string, unknown>;
    expect(await onboardingKlaarVoorReageren("u1")).toBe(true);
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

  it("zzp'er of flexwerker: KVK/btw/KOR hoort sinds 13 nov niet bij de aanmelding (86), alleen de thuisbasis", async () => {
    const { werkerPoortStand } = await import("@/lib/onboarding/werker-poort-server");
    for (const workerKind of ["zzp", "flexwerker"]) {
      h.fiscal = { workerKind };
      h.profiel = { homePostalCode: "1012AB" };
      expect((await werkerPoortStand("u1")).gegevensIngevuld, workerKind).toBe(true);
      h.profiel = { homePostalCode: null };
      expect((await werkerPoortStand("u1")).gegevensIngevuld, workerKind).toBe(false);
    }
  });

  it("uitzendkracht: het BSN (fiscaal ingevuld) en de getekende overeenkomst blijven in de poort", async () => {
    const { werkerPoortStand } = await import("@/lib/onboarding/werker-poort-server");
    h.fiscal = { workerKind: "uitzendkracht" };
    // de mock van activeUitzendContract geeft null: geen getekende overeenkomst
    expect((await werkerPoortStand("u1")).gegevensIngevuld).toBe(false);
  });

  it("geen branchekeuze: een account van vóór de stap (10 nov) telt als 'alle', een nieuw account niet", async () => {
    const { werkerPoortStand } = await import("@/lib/onboarding/werker-poort-server");
    h.branches = null;
    h.aangemeld = new Date("2026-11-09T23:59:00+01:00");
    expect((await werkerPoortStand("u1")).branchesGekozen).toBe(true);
    h.aangemeld = new Date("2026-11-10T00:00:00+01:00");
    expect((await werkerPoortStand("u1")).branchesGekozen).toBe(false);
    h.aangemeld = null;
    expect((await werkerPoortStand("u1")).branchesGekozen).toBe(false);
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

describe("de stap branches voor accounts van vóór 10 nov (13 nov, 86)", () => {
  it("een keuze telt altijd; zonder keuze alleen een account van vóór de stap", () => {
    expect(branchesTellen(true, null)).toBe(true);
    expect(branchesTellen(true, new Date(BRANCHE_STAP_SINDS + 1))).toBe(true);
    expect(branchesTellen(false, new Date(BRANCHE_STAP_SINDS - 1))).toBe(true);
    expect(branchesTellen(false, new Date(BRANCHE_STAP_SINDS))).toBe(false);
    expect(branchesTellen(false, undefined)).toBe(false);
  });

  it("de grens is 10 nov 2026 00:00 in Amsterdam", () => {
    expect(new Date(BRANCHE_STAP_SINDS).toISOString()).toBe("2026-11-09T23:00:00.000Z");
  });
});
