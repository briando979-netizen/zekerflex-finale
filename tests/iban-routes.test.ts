import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Het wijzigen van een BESTAAND uitbetaal-IBAN vraagt overal dezelfde tweede
// bevestiging (mailcode of 2FA) als /api/me/fiscal; een eerste IBAN en een
// ongewijzigd IBAN blijven vrij. Hier: /api/me/uitzend (PUT), de onboarding
// (lib/onboarding/verify.ts: Stripe-route + wallet-route) en de gedeelde poort.
// ---------------------------------------------------------------------------

const kvStore = new Map<string, unknown>();
const mails: { to: string; text: string }[] = [];
let tweeStap = false;

// Toestand van de nagebootste database
let fiscalIban: string | null = null;
let profielIban: string | null = null;
let heeftProfiel = true;
const setFiscalMock = vi.fn(async (_u: string, patch: Record<string, unknown>) => ({
  loonheffingskorting: false,
  iban: (patch.iban as string | undefined) ?? fiscalIban,
  ibanValid: true,
  ibanPendingVerification: Boolean(patch.ibanPendingVerification),
}));
const profielUpdate = vi.fn(async () => ({}));
const walletConsume = vi.fn(async () => ({ givenName: "Jan", familyName: "Jansen" }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async (args: { select?: { email?: boolean } }) =>
        args.select?.email
          ? { email: "werker@example.test", fullName: "Jan Jansen" }
          : { id: "u1", fullName: "Jan Jansen", freelancerProfile: heeftProfiel ? { id: "p1" } : null },
    },
    freelancerProfile: {
      findUnique: async () => ({ payoutIban: profielIban }),
      update: (...a: unknown[]) => (profielUpdate as (...x: unknown[]) => unknown)(...a),
    },
  },
}));
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "test-geheim-test-geheim-test-geheim" } }));
vi.mock("@/lib/audit", () => ({ recordAudit: async () => undefined }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kvStore.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kvStore.set(k, v),
  kvDelete: async (k: string) => void kvStore.delete(k),
}));
vi.mock("@/lib/rate-limit", () => ({ fixedWindow: async () => ({ ok: true }) }));
vi.mock("@/lib/auth/two-factor", () => ({
  hasTwoFactor: async () => tweeStap,
  verifySecondFactor: async (_u: string, c: string) => ({ ok: c === "123456" }),
}));
vi.mock("@/lib/mail", () => ({
  sendMail: async (m: { to: string; text: string }) => {
    mails.push(m);
    return { delivered: true };
  },
}));

// uitzend-route
vi.mock("@/lib/auth", () => ({
  requirePrincipal: async () => ({ userId: "u1", role: "FREELANCER" }),
  requireRole: () => undefined,
}));
vi.mock("@/lib/payroll/uitzend-status", () => ({ getUitzendStatus: async () => ({}) }));
vi.mock("@/lib/fiscal/store", () => ({
  getFiscal: async () => ({ iban: fiscalIban, loonheffingskorting: false }),
  setFiscal: (...a: unknown[]) => (setFiscalMock as (...x: unknown[]) => unknown)(...a),
}));
vi.mock("@/lib/billing/sepa", () => ({ isValidIban: () => true }));
vi.mock("@/lib/compliance/documents", () => ({
  invalidateBankDoc: async () => undefined,
  flagIbanChanged: async () => undefined,
}));

// onboarding (verify.ts)
vi.mock("@/lib/integrations/vies", () => ({ checkVies: async () => null }));
vi.mock("@/lib/ai/client", () => ({ chatJson: async () => ({}) }));
vi.mock("@/lib/integrations/pdok", () => ({
  geocodePostcode: async () => ({ latitude: 52.37, longitude: 4.9, postalCode: "1012AB", city: "Amsterdam", street: "Damrak", approximate: false }),
}));
vi.mock("@/lib/company/registration", () => ({ registerFreelancerCompany: async () => ({}) }));
vi.mock("@/lib/storage/local", () => ({ storeUpload: async () => ({}) }));
vi.mock("@/lib/kyc/vision", () => ({ runVisionReview: async () => ({}) }));
vi.mock("@/lib/kyc/wallet", () => ({ consumeVerifiedWalletAttempt: (...a: unknown[]) => (walletConsume as (...x: unknown[]) => unknown)(...a) }));
vi.mock("@/lib/ops/alert", () => ({ alertOwnerLater: () => undefined }));

import { PUT } from "@/app/api/me/uitzend/route";
import { saveFreelancerBase, submitFreelancerOnboardingViaWallet } from "@/lib/onboarding/verify";
import {
  eisIbanBevestiging,
  IbanBevestigingFout,
  ibanBevestigingAntwoord,
} from "@/lib/fiscal/iban-bevestiging";
import { ibanCodeBericht, isIbanCodeFout, type IbanCodeTexts } from "@/lib/fiscal/iban-code-teksten";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

const OUD = "NL91ABNA0417164300";
const NIEUW = "NL02ABNA0123456789";

function codeUitMail(): string {
  return mails.at(-1)?.text.match(/\n(\d{6})\n/)?.[1] ?? "";
}

function putUitzend(body: Record<string, unknown>): Promise<Response> {
  return PUT(new Request("http://app:3000/api/me/uitzend", { method: "PUT", body: JSON.stringify(body) }));
}

const basis = { userId: "u1", kvkNumber: "", postalCode: "1012 AB", houseNumber: "1" };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T10:00:00+01:00"));
  kvStore.clear();
  mails.length = 0;
  tweeStap = false;
  fiscalIban = null;
  profielIban = null;
  heeftProfiel = true;
  setFiscalMock.mockClear();
  profielUpdate.mockClear();
  walletConsume.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("PUT /api/me/uitzend", () => {
  it("een eerste IBAN is vrij (geen code, geen mail)", async () => {
    const res = await putUitzend({ iban: NIEUW });
    expect(res.status).toBe(200);
    expect(mails).toHaveLength(0);
    expect(setFiscalMock).toHaveBeenCalledTimes(1);
  });

  it("een ongewijzigd IBAN is vrij", async () => {
    fiscalIban = OUD;
    const res = await putUitzend({ iban: "nl91 abna 0417 1643 00" });
    expect(res.status).toBe(200);
    expect(mails).toHaveLength(0);
  });

  it("een wijziging zonder code wordt geweigerd met 423, er wordt een code gemaild en niets opgeslagen", async () => {
    fiscalIban = OUD;
    const res = await putUitzend({ iban: NIEUW });
    expect(res.status).toBe(423);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("IBAN_BEVESTIGING_NODIG");
    expect(mails).toHaveLength(1);
    expect(setFiscalMock).not.toHaveBeenCalled();
  });

  it("een wijziging met de juiste mailcode wordt opgeslagen; de code werkt maar eenmaal", async () => {
    fiscalIban = OUD;
    await putUitzend({ iban: NIEUW });
    const code = codeUitMail();
    const ok = await putUitzend({ iban: NIEUW, ibanCode: code });
    expect(ok.status).toBe(200);
    expect(setFiscalMock).toHaveBeenCalledTimes(1);
    const opnieuw = await putUitzend({ iban: NIEUW, ibanCode: code });
    expect(opnieuw.status).toBe(423);
    expect(setFiscalMock).toHaveBeenCalledTimes(1);
  });

  it("een foute code wordt geweigerd (423, IBAN_CODE_ONGELDIG)", async () => {
    fiscalIban = OUD;
    await putUitzend({ iban: NIEUW });
    const goed = codeUitMail();
    const fout = goed === "000000" ? "000001" : "000000";
    const res = await putUitzend({ iban: NIEUW, ibanCode: fout });
    expect(res.status).toBe(423);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("IBAN_CODE_ONGELDIG");
    expect(setFiscalMock).not.toHaveBeenCalled();
  });

  it("met 2FA telt een code uit de app", async () => {
    fiscalIban = OUD;
    tweeStap = true;
    const zonder = await putUitzend({ iban: NIEUW });
    expect(zonder.status).toBe(423);
    expect(mails).toHaveLength(0);
    const met = await putUitzend({ iban: NIEUW, ibanCode: "123456" });
    expect(met.status).toBe(200);
  });

  it("alleen de loonheffingskorting wijzigen vraagt geen code", async () => {
    fiscalIban = OUD;
    const res = await putUitzend({ loonheffingskorting: true });
    expect(res.status).toBe(200);
    expect(mails).toHaveLength(0);
  });
});

describe("onboarding: saveFreelancerBase (Stripe-route; ook de foto-route gebruikt dezelfde poort)", () => {
  it("een eerste IBAN (profiel zonder IBAN) is vrij", async () => {
    profielIban = null;
    await expect(saveFreelancerBase({ ...basis, payoutIban: NIEUW })).resolves.toBeDefined();
    expect(mails).toHaveLength(0);
    expect(profielUpdate).toHaveBeenCalledTimes(1);
  });

  it("een ongewijzigd IBAN is vrij", async () => {
    profielIban = OUD;
    await expect(saveFreelancerBase({ ...basis, payoutIban: "NL91 ABNA 0417 1643 00" })).resolves.toBeDefined();
    expect(mails).toHaveLength(0);
  });

  it("een wijziging zonder code gooit een 423-fout en schrijft niets", async () => {
    profielIban = OUD;
    const fout = await saveFreelancerBase({ ...basis, payoutIban: NIEUW }).catch((e: unknown) => e);
    expect(fout).toBeInstanceOf(IbanBevestigingFout);
    expect(ibanBevestigingAntwoord(fout)).toMatchObject({ status: 423, body: { error: { code: "IBAN_BEVESTIGING_NODIG" } } });
    expect(mails).toHaveLength(1);
    expect(profielUpdate).not.toHaveBeenCalled();
  });

  it("met een geldige code wordt het IBAN opgeslagen", async () => {
    profielIban = OUD;
    await saveFreelancerBase({ ...basis, payoutIban: NIEUW }).catch(() => undefined);
    await expect(saveFreelancerBase({ ...basis, payoutIban: NIEUW, ibanCode: codeUitMail() })).resolves.toBeDefined();
    expect(profielUpdate).toHaveBeenCalledTimes(1);
  });

  it("met een foute code wordt niets opgeslagen", async () => {
    profielIban = OUD;
    await saveFreelancerBase({ ...basis, payoutIban: NIEUW }).catch(() => undefined);
    const goed = codeUitMail();
    const fout = await saveFreelancerBase({ ...basis, payoutIban: NIEUW, ibanCode: goed === "000000" ? "000001" : "000000" }).catch((e: unknown) => e);
    expect(ibanBevestigingAntwoord(fout)).toMatchObject({ status: 423, body: { error: { code: "IBAN_CODE_ONGELDIG" } } });
    expect(profielUpdate).not.toHaveBeenCalled();
  });

  it("een nieuw profiel (nog geen profiel) is vrij", async () => {
    heeftProfiel = false;
    // geen profiel: ensureFreelancerBase maakt het aan via prisma.freelancerProfile.create (niet nagebootst)
    const fout = await saveFreelancerBase({ ...basis, payoutIban: NIEUW }).catch((e: unknown) => e);
    expect(fout).not.toBeInstanceOf(IbanBevestigingFout);
    expect(mails).toHaveLength(0);
  });
});

describe("onboarding: wallet-route", () => {
  const wallet = { ...basis, attemptId: "a1" };

  it("een wijziging zonder code verbruikt het eenmalige wallet-resultaat NIET", async () => {
    profielIban = OUD;
    const fout = await submitFreelancerOnboardingViaWallet({ ...wallet, payoutIban: NIEUW }).catch((e: unknown) => e);
    expect(ibanBevestigingAntwoord(fout)).toMatchObject({ status: 423, body: { error: { code: "IBAN_BEVESTIGING_NODIG" } } });
    expect(walletConsume).not.toHaveBeenCalled();
    expect(profielUpdate).not.toHaveBeenCalled();
  });

  it("met een geldige code gaat de verificatie door en wordt de code niet twee keer gevraagd", async () => {
    profielIban = OUD;
    await submitFreelancerOnboardingViaWallet({ ...wallet, payoutIban: NIEUW }).catch(() => undefined);
    const code = codeUitMail();
    const fout = await submitFreelancerOnboardingViaWallet({ ...wallet, payoutIban: NIEUW, ibanCode: code }).catch((e: unknown) => e);
    // de poort liet het door: de wallet is verbruikt en de update gebeurde (latere stappen mogen op de mocks stuklopen)
    expect(fout).not.toBeInstanceOf(IbanBevestigingFout);
    expect(walletConsume).toHaveBeenCalledTimes(1);
    expect(profielUpdate).toHaveBeenCalledTimes(1);
  });

  it("een eerste IBAN is vrij", async () => {
    profielIban = null;
    const fout = await submitFreelancerOnboardingViaWallet({ ...wallet, payoutIban: NIEUW }).catch((e: unknown) => e);
    expect(fout).not.toBeInstanceOf(IbanBevestigingFout);
    expect(mails).toHaveLength(0);
    expect(walletConsume).toHaveBeenCalledTimes(1);
  });
});

describe("eisIbanBevestiging", () => {
  it("laat een eerste en een ongewijzigd IBAN door zonder iets te doen", async () => {
    await expect(eisIbanBevestiging("u1", null, NIEUW, undefined)).resolves.toBeUndefined();
    await expect(eisIbanBevestiging("u1", undefined, NIEUW, undefined)).resolves.toBeUndefined();
    await expect(eisIbanBevestiging("u1", OUD, OUD, undefined)).resolves.toBeUndefined();
    expect(mails).toHaveLength(0);
  });

  it("geeft geen antwoord voor een andere fout", () => {
    expect(ibanBevestigingAntwoord(new Error("x"))).toBeNull();
  });
});

describe("codeveld-teksten", () => {
  it("elke taal heeft alle teksten ingevuld", () => {
    for (const dict of Object.values(FREELANCER_DICTS)) {
      for (const v of Object.values(dict.ibanCode)) expect(v.length).toBeGreaterThan(3);
    }
  });

  it("koppelt elke servercode aan een eigen tekst en valt terug op de servertekst", () => {
    const t: IbanCodeTexts = FREELANCER_DICTS.pl.ibanCode;
    expect(ibanCodeBericht("IBAN_BEVESTIGING_NODIG", t)).toBe(t.sent);
    expect(ibanCodeBericht("IBAN_2FA_NODIG", t)).toBe(t.need2fa);
    expect(ibanCodeBericht("IBAN_CODE_ONGELDIG", t)).toBe(t.invalid);
    expect(ibanCodeBericht("IBAN_CODE_VERLOPEN", t)).toBe(t.expired);
    expect(ibanCodeBericht("IBAN_TE_VEEL_POGINGEN", t)).toBe(t.tooMany);
    expect(ibanCodeBericht("IBAN_MAIL_MISLUKT", t)).toBe(t.mailFailed);
    expect(ibanCodeBericht("IBAN_ONBEKEND", t, "Servertekst")).toBe("Servertekst");
  });

  it("herkent alleen een IBAN-bevestigingsfout (423/429/503 met IBAN_-code)", () => {
    expect(isIbanCodeFout(423, "IBAN_CODE_ONGELDIG")).toBe(true);
    expect(isIbanCodeFout(429, "IBAN_TE_VEEL_POGINGEN")).toBe(true);
    expect(isIbanCodeFout(422, "IBAN_CODE_ONGELDIG")).toBe(false);
    expect(isIbanCodeFout(423, "ANDERS")).toBe(false);
    expect(isIbanCodeFout(423, undefined)).toBe(false);
  });
});
