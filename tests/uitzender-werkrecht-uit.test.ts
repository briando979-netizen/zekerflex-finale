import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// 21 nov 2026: ZekerFlex is zelf geen uitzender meer (ZEKERFLEX_UITZENDER, lib/uitzend/model.ts): het uitzendbureau verloont
// (loonstrook, StiPP, loonheffing). Het recht om te werken staat uit (WERKRECHT_AAN, lib/werkrecht/aan.ts) en de bank ook
// (BANK_AAN, lib/app-mode.ts). Deze test bewaakt het gedrag met de schakelaars uit: niets stuurt of linkt nog naar de lege
// /dashboard/verloning, geen mijlpalen over ABU-fase/StiPP/loonheffing door ZekerFlex, geen keuze voor een loonvoorschot, en de
// ID-controle toont het recht om te werken niet en houdt de goedkeuring er niet op tegen. De tests van het oude gedrag zetten
// de schakelaar in hun eigen bestand aan (vi.mock).

const h = vi.hoisted(() => ({ uitzendStatus: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { freelancerProfile: { findUnique: async () => ({ id: "fp1" }) } } }));
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: async () => ({ workerKind: "uitzendkracht" }), invoiceModeFor: () => "payroll" }));
vi.mock("@/lib/payroll/uitzend-status", () => ({ getUitzendStatus: (...a: unknown[]) => h.uitzendStatus(...a) }));

import { ZEKERFLEX_UITZENDER } from "@/lib/uitzend/model";
import { WERKRECHT_AAN } from "@/lib/werkrecht/aan";
import { BANK_AAN } from "@/lib/app-mode";
import { approvedPushUrl } from "@/lib/notifications/approved-push";
import { alleApps } from "@/lib/os/apps";
import { getWorkerMilestones } from "@/lib/worker/milestones";
import { redenenNietAutomatisch, type AutoFeiten } from "@/lib/onboarding/auto-redenen";
import { HULP_TEKSTEN } from "@/lib/hulp/teksten";

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

const ALLES_GOED: AutoFeiten = {
  kvkOk: true,
  naamOk: true,
  nummerFormaatOk: true,
  geldigOk: true,
  rijbewijs: false,
  mrzGeldig: true,
  mrzNummerOk: true,
  mrzNaamOk: true,
  chipFotoVerschil: false,
  werkrecht: "vrij",
  leeftijd: "volwassen",
  viaTweedeToestel: false,
  telefoonGeweigerd: false,
  dubbelDocument: false,
  zegelElders: false,
  gezichtAutomatischAan: true,
  gezichtOordeel: "zelfde",
  gezichtScore: 0.48,
  bewegingOordeel: "ok",
  beeldmodelOk: false,
  aiVerdict: "needs_review",
  aiZeker: false,
  liveBeelden: 14,
};

describe("de schakelaars staan uit", () => {
  it("ZekerFlex is geen uitzender, het recht om te werken en de bank staan uit", () => {
    expect(ZEKERFLEX_UITZENDER).toBe(false);
    expect(WERKRECHT_AAN).toBe(false);
    expect(BANK_AAN).toBe(false);
  });
});

describe("niets wijst nog naar de lege verloning", () => {
  it("de push na goedgekeurde uren gaat bij verloning naar Mijn klussen", () => {
    expect(approvedPushUrl("payroll")).toBe("/dashboard/diensten");
    expect(approvedPushUrl("partner")).toBe("/dashboard/diensten");
    expect(approvedPushUrl("invoice")).toBe("/dashboard/uitbetalingen");
  });

  it("ZekerFlex OS heeft geen app Verloning", () => {
    const apps = alleApps();
    expect(apps.some((a) => a.id === "w-verloning")).toBe(false);
    expect(apps.some((a) => a.href === "/dashboard/verloning")).toBe(false);
  });

  it("uitbetalingen en verzekering sturen een uitzendkracht naar Mijn klussen, het urenformulier toont geen loonstroken-knop", () => {
    for (const p of ["app/dashboard/uitbetalingen/page.tsx", "app/dashboard/verzekering/page.tsx"]) {
      expect(lees(p), p).toContain('redirect(ZEKERFLEX_UITZENDER ? "/dashboard/verloning" : "/dashboard/diensten")');
    }
    expect(lees("components/app/TimesheetSubmitForm.tsx")).toContain("{(!payroll || ZEKERFLEX_UITZENDER) && (");
  });

  it("geen ABU-mail van ZekerFlex (die wees naar /dashboard/verloning)", () => {
    expect(lees("lib/payroll/abu-phase-sweep.ts")).toContain("if (!ZEKERFLEX_UITZENDER) return { checked: 0, seeded: 0, transitions: [] };");
  });

  it("het hulpcentrum zegt in elke taal dat het uitzendbureau het loon betaalt, zonder link naar de verloning", () => {
    const nl = HULP_TEKSTEN.nl.vragen.find((v) => v.id === "betaling");
    expect(nl?.a).toContain("Werk je als uitzendkracht, dan betaalt je uitzendbureau je loon en krijg je je loonstrook van het bureau.");
    for (const [taal, t] of Object.entries(HULP_TEKSTEN)) {
      const v = t.vragen.find((x) => x.id === "betaling");
      expect(v?.link?.href, taal).not.toBe("/dashboard/verloning");
    }
  });
});

describe("administratie: geen kaarten over ABU, StiPP of loonheffing door ZekerFlex", () => {
  it("een uitzendkracht krijgt geen mijlpalen, en de uitzendstatus wordt niet eens opgevraagd", async () => {
    const data = await getWorkerMilestones("u1", new Date("2026-11-21T10:00:00+01:00"));
    expect(data?.milestones).toEqual([]);
    expect(h.uitzendStatus).not.toHaveBeenCalled();
  });
});

describe("geen loonvoorschot voor uitzendkrachten", () => {
  it("de route zegt dat het niet kan en het scherm toont de keuze dan niet", () => {
    expect(lees("app/api/werkgever/fastpay/route.ts")).toContain("if (!ZEKERFLEX_UITZENDER || !BANK_AAN) return false;");
    expect(lees("components/werkgever/FastPaySettings.tsx")).toContain("{ZEKERFLEX_UITZENDER && BANK_AAN && s.voorschotKan ? (");
  });
});

describe("ID-controle zonder het recht om te werken", () => {
  it("een nationaliteit van buiten de EU (of een onleesbare) houdt de automatische goedkeuring niet tegen", () => {
    expect(redenenNietAutomatisch(ALLES_GOED)).toEqual([]);
    expect(redenenNietAutomatisch({ ...ALLES_GOED, werkrecht: "controle" })).toEqual([]);
    expect(redenenNietAutomatisch({ ...ALLES_GOED, werkrecht: null })).toEqual([]);
    // de leeftijd telt wel gewoon mee
    expect(redenenNietAutomatisch({ ...ALLES_GOED, werkrecht: "controle", leeftijd: "minderjarig" })).toEqual(["de werker is jonger dan 18"]);
  });

  it("de uitslag toont geen controle 'Recht om te werken'; de categorie gaat wel mee voor later", () => {
    const s = lees("lib/onboarding/verify.ts");
    expect(s).toContain('if (WERKRECHT_AAN && werkrecht) checks.push({ label: "Recht om te werken in Nederland"');
    expect(s).toContain("const werkrecht = mrzGeldig ? werkrechtUitMrz(mrz) : null;");
  });
});
