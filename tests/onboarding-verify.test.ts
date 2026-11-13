import { afterEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Freelancer self-serve onboarding used to accept one generic "document"
// upload and left a *second*, separate "Identiteitsbewijs" upload requirement
// in ComplianceDocsPanel untouched — a freelancer had to hand over their ID
// twice. These tests lock in the fix: three captures (front/back/selfie) in
// one submission, and the front photo auto-satisfies the compliance "id" doc
// so ComplianceDocsPanel never re-asks for it.
// ---------------------------------------------------------------------------

const userFindUnique = vi.fn();
/** zoekt een ander account met hetzelfde document (documentNumberHash) of hetzelfde chipzegel (rawPayload.chip.sodHash) */
const ivFindFirst = vi.fn().mockResolvedValue(null);
const userUpdate = vi.fn();
const freelancerProfileUpdate = vi.fn().mockResolvedValue({});
// No existing payoutIban by default — these tests aren't about IBAN changes,
// so ensureFreelancerBase's "did it change?" check should stay false.
const freelancerProfileFindUnique = vi.fn().mockResolvedValue({ payoutIban: null });
const ivCreate = vi.fn();
const complianceDeleteMany = vi.fn();
const complianceCreate = vi.fn();
const txn = vi.fn(async (fn: (tx: unknown) => unknown) =>
  fn({
    identityVerification: { create: (...a: unknown[]) => ivCreate(...a) },
    user: { update: (...a: unknown[]) => userUpdate(...a) },
    complianceDocument: {
      deleteMany: (...a: unknown[]) => complianceDeleteMany(...a),
      create: (...a: unknown[]) => complianceCreate(...a),
    },
  }),
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    identityVerification: { findFirst: (...a: unknown[]) => ivFindFirst(...a) },
    freelancerProfile: {
      update: (...a: unknown[]) => freelancerProfileUpdate(...a),
      findUnique: (...a: unknown[]) => freelancerProfileFindUnique(...a),
    },
    $transaction: (fn: (tx: unknown) => unknown) => txn(fn),
  },
}));

vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/integrations/pdok", () => ({
  geocodePostcode: vi.fn().mockResolvedValue({
    latitude: 52.37,
    longitude: 4.9,
    postalCode: "1012AB",
    city: "Amsterdam",
    street: "Damrak",
    approximate: false,
  }),
}));

vi.mock("@/lib/company/registration", () => ({
  registerFreelancerCompany: vi.fn(),
}));

let uploadCounter = 0;
vi.mock("@/lib/storage/local", () => ({
  storeUpload: vi.fn(async (input: { filename: string }) => {
    uploadCounter += 1;
    return { id: `up_${uploadCounter}`, filename: input.filename, sha256: `sha_${uploadCounter}` };
  }),
}));

const runVisionReview = vi.fn().mockResolvedValue({ available: false, document: null, face: null, model: null });
vi.mock("@/lib/kyc/vision", () => ({ runVisionReview: (...a: unknown[]) => runVisionReview(...a) }));

/** het eigen gezichtsmodel (lib/kyc/gezicht): standaard "kon niet draaien", dus een mens beslist */
const BEWEGING_NIET = { oordeel: "niet-beoordeeld", verschil: null, reden: "De bewegingscontrole is niet uitgevoerd. Een medewerker kijkt mee." };
const BEWEGING_OK = { oordeel: "ok", verschil: 0.31, reden: "Het hoofd draaide echt tussen de twee selfies." };
const GEZICHT_NIET = { beschikbaar: false, oordeel: "onbruikbaar", score: null, reden: "De automatische gezichtscontrole was niet beschikbaar. Een medewerker kijkt mee.", technisch: true, ms: 1, beweging: BEWEGING_NIET };
const GEZICHT_ZELFDE = { beschikbaar: true, oordeel: "zelfde", score: 0.72, reden: "Het gezicht op de selfie komt overeen met de pasfoto op het document.", technisch: false, ms: 90, beweging: BEWEGING_OK };
const gezichtControle = vi.fn().mockResolvedValue(GEZICHT_NIET);
vi.mock("@/lib/kyc/gezicht/controle", () => ({ gezichtControle: (...a: unknown[]) => gezichtControle(...a) }));
const featureEnabled = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/flags", () => ({ featureEnabled: (...a: unknown[]) => featureEnabled(...a) }));

/** de code op het document (MRZ), standaard: hoort bij Jan Jansen en SPECI2014, geldig tot 2030 */
const MRZ_JAN = {
  formaat: "TD1",
  soort: "ID_CARD",
  land: "NLD",
  documentnummer: "SPECI2014",
  nationaliteit: "NLD",
  geboortedatum: "1990-01-01",
  vervaldatum: "2030-01-01",
  geslacht: "M",
  achternaam: "JANSEN",
  voornamen: "JAN",
  controles: { documentnummer: true, geboortedatum: true, vervaldatum: true, totaal: true },
  geldig: true,
  volledig: true,
  verlopen: false,
};
const leesMrzVanFoto = vi.fn().mockResolvedValue({ uitslag: MRZ_JAN, pogingen: 1, ms: 5 });
vi.mock("@/lib/kyc/mrz-lezen", () => ({ leesMrzVanFoto: (...a: unknown[]) => leesMrzVanFoto(...a) }));

/** de chip van het document (NFC via de app): standaard niet gelezen */
const chipLezing = vi.fn().mockResolvedValue(null);
const wisChipGegevens = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/kyc/chip/sessie", () => ({
  chipLezing: (...a: unknown[]) => chipLezing(...a),
  wisChipGegevens: (...a: unknown[]) => wisChipGegevens(...a),
}));
const CHIP_JAN = {
  op: "2026-11-09T12:00:00.000Z",
  echt: true,
  hashesOk: true,
  handtekeningOk: true,
  ketenOk: true,
  geldigOk: true,
  land: "NL",
  nummerKlopt: true,
  naamOpChip: { achternaam: "JANSEN", voornamen: "JAN" },
  sodHash: "zegel-van-jan",
  ds: null,
  werkrecht: "vrij",
  leeftijd: "volwassen",
  documentnummer: "SPECI2014",
  vervaldatum: "2030-01-01",
  fouten: [],
};

/** de live reeks van de selfies (lib/kyc/gezicht/reeks.ts): standaard een echte draai met tussenstanden */
const REEKS_ECHT = { beelden: 14, tussenstanden: 2, ms: 1600, draai: 0.28 };
const reeksSamenvatting = vi.fn().mockResolvedValue(REEKS_ECHT);
const wisReeks = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/kyc/gezicht/reeks-opslag", () => ({
  reeksSamenvatting: (...a: unknown[]) => reeksSamenvatting(...a),
  wisReeks: (...a: unknown[]) => wisReeks(...a),
}));

const alertOwnerLater = vi.fn();
vi.mock("@/lib/ops/alert", () => ({ alertOwnerLater: (...a: unknown[]) => alertOwnerLater(...a) }));

/** a vision review that looked at the photos and found nothing wrong */
const VISION_OK = {
  available: true,
  model: "moondream",
  document: { plausible: true, confidence: 0.9, documentNumber: null, expiryDate: null, concerns: [] },
  face: { samePerson: true, faceMatchConfidence: 0.9, looksLive: true, livenessConfidence: 0.8, concerns: [] },
};

vi.mock("@/lib/ai/client", () => ({
  ensureAiNode: async () => undefined,
  chatJson: vi.fn().mockResolvedValue({
    verdict: "approved",
    confidence: 0.9,
    reasons: [],
    summary: "Alles klopt.",
  }),
}));

/** "alles gratis" (lib/ai/gratis.ts): standaard uit, dan vraagt de controle de tekst-AI wel */
let gratisStand = false;
vi.mock("@/lib/ai/gratis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/gratis")>()),
  getGratisStand: async () => ({ aan: gratisStand, basis: "", model: "" }),
}));

const consumeVerifiedWalletAttempt = vi.fn();
vi.mock("@/lib/kyc/wallet", () => ({
  consumeVerifiedWalletAttempt: (...a: unknown[]) => consumeVerifiedWalletAttempt(...a),
}));

import { submitFreelancerOnboarding, submitFreelancerOnboardingViaWallet } from "@/lib/onboarding/verify";
import { resetAiReviewRem } from "@/lib/onboarding/ai-review-rem";

function image(name: string, size = 20_000): { filename: string; mimeType: string; bytes: Buffer } {
  return { filename: name, mimeType: "image/jpeg", bytes: Buffer.alloc(size, 1) };
}

const BASE_INPUT = {
  userId: "usr_1",
  kvkNumber: "", // uitzendkracht path — skips the KVK/Handelsregister call
  postalCode: "1012 AB",
  houseNumber: "10",
  payoutIban: "NL91ABNA0417164300",
  documentType: "ID_CARD" as const,
  documentNumber: "SPECI2014",
  documentExpiry: "2030-01-01",
  nameOnDocument: "Jan Jansen",
};

afterEach(() => {
  // de rem op de tekst-AI (lib/onboarding/ai-review-rem.ts) leeft per proces: elke test begint dicht bij nul
  resetAiReviewRem();
  vi.clearAllMocks();
  uploadCounter = 0;
});

describe("submitFreelancerOnboarding — three-capture flow", () => {
  it("rejects when a photo is unreadable (too small) — never reaches storage", async () => {
    userFindUnique.mockResolvedValue({
      id: "usr_1",
      fullName: "Jan Jansen",
      kycStatus: "PENDING",
      freelancerProfile: { id: "fp_1" },
    });

    await expect(
      submitFreelancerOnboarding({
        ...BASE_INPUT,
        files: { front: image("front.jpg"), back: image("back.jpg", 100), selfie: image("selfie.jpg") },
      }),
    ).rejects.toThrow(/niet leesbaar/);

    expect(ivCreate).not.toHaveBeenCalled();
    expect(complianceCreate).not.toHaveBeenCalled();
  });

  it("review H1 (telefoon): dezelfde goede aanvraag via een tweede toestel gaat nooit automatisch door", async () => {
    userFindUnique.mockResolvedValue({
      id: "usr_1",
      fullName: "Jan Jansen",
      kycStatus: "PENDING",
      freelancerProfile: { id: "fp_1" },
    });
    runVisionReview.mockResolvedValueOnce(VISION_OK);
    const result = await submitFreelancerOnboarding({
      ...BASE_INPUT,
      files: { front: image("front.jpg"), back: image("back.jpg"), selfie: image("selfie.jpg") },
      viaTweedeToestel: true,
    });
    expect(result.outcome).toBe("in_review");
    expect(result.checks.some((c) => c.label === "Ingestuurd vanaf je telefoon" && !c.ok)).toBe(true);
  });

  it("review 2, H1/M2: een eerdere 'niet mijn account' gaat naar een mens, de werker ziet niet waarom", async () => {
    userFindUnique.mockResolvedValue({ id: "usr_1", fullName: "Jan Jansen", kycStatus: "PENDING", freelancerProfile: { id: "fp_1" } });
    runVisionReview.mockResolvedValueOnce(VISION_OK);
    const result = await submitFreelancerOnboarding({
      ...BASE_INPUT,
      files: { front: image("front.jpg"), back: image("back.jpg"), selfie: image("selfie.jpg") },
      tweedeToestel: { zelfdeNetwerk: null, geweigerd: 1, zonderVlag: false },
    });
    expect(result.outcome).toBe("in_review");
    expect(JSON.stringify(result)).not.toContain("niet mijn account");
    const ivArg = ivCreate.mock.calls[0]![0] as { data: { rawPayload: { checks: { label: string; ok: boolean }[] } } };
    expect(ivArg.data.rawPayload.checks.find((c) => c.label.startsWith("Geen 'dit is niet mijn account'"))?.ok).toBe(false);
  });

  it("review 2, H1/M2: de beoordelaar ziet of telefoon en laptop op hetzelfde netwerk zaten, en losse foto's na een overdracht", async () => {
    userFindUnique.mockResolvedValue({ id: "usr_1", fullName: "Jan Jansen", kycStatus: "PENDING", freelancerProfile: { id: "fp_1" } });
    runVisionReview.mockResolvedValueOnce(VISION_OK);
    await submitFreelancerOnboarding({
      ...BASE_INPUT,
      files: { front: image("front.jpg"), back: image("back.jpg"), selfie: image("selfie.jpg") },
      viaTweedeToestel: true,
      tweedeToestel: { zelfdeNetwerk: false, geweigerd: 0, zonderVlag: false },
    });
    runVisionReview.mockResolvedValueOnce(VISION_OK);
    const los = await submitFreelancerOnboarding({
      ...BASE_INPUT,
      files: { front: image("front.jpg"), back: image("back.jpg"), selfie: image("selfie.jpg") },
      viaTweedeToestel: true,
      tweedeToestel: { zelfdeNetwerk: null, geweigerd: 0, zonderVlag: true },
    });
    expect(los.outcome).toBe("in_review");
    const [eerste, tweede] = ivCreate.mock.calls.map((c) => (c[0] as { data: { rawPayload: { checks: { label: string; ok: boolean }[] } } }).data.rawPayload.checks);
    expect(eerste!.find((c) => c.label === "Telefoon en laptop op hetzelfde netwerk")?.ok).toBe(false);
    expect(tweede!.find((c) => c.label === "Foto's na een overdracht via de telefoon")?.ok).toBe(false);
    expect(tweede!.find((c) => c.label === "Telefoon en laptop op hetzelfde netwerk")).toBeUndefined();
    // de werker leest eerlijk waarom: eerder via de telefoon, niet "nu via je telefoon"
    expect(los.checks.find((c) => c.label === "Eerder via je telefoon ingestuurd")?.ok).toBe(false);
  });

  it("review 2, H1-bis: foto's van een tweede toestel komen niet vanzelf bij de documenten (niet te downloaden)", async () => {
    userFindUnique.mockResolvedValue({ id: "usr_1", fullName: "Jan Jansen", kycStatus: "PENDING", freelancerProfile: { id: "fp_1" } });
    runVisionReview.mockResolvedValueOnce(VISION_OK);
    await submitFreelancerOnboarding({
      ...BASE_INPUT,
      files: { front: image("front.jpg"), back: image("back.jpg"), selfie: image("selfie.jpg") },
      viaTweedeToestel: true,
    });
    expect(complianceCreate).not.toHaveBeenCalled();
    const ivArg = ivCreate.mock.calls[0]![0] as { data: { rawPayload: { viaTweedeToestel: boolean; uploadIds: { front: string } } } };
    expect(ivArg.data.rawPayload.viaTweedeToestel).toBe(true);
    expect(typeof ivArg.data.rawPayload.uploadIds.front).toBe("string");
  });

  it("stores all three photos and auto-fills the compliance ID doc from the front photo", async () => {
    userFindUnique.mockResolvedValue({
      id: "usr_1",
      fullName: "Jan Jansen",
      kycStatus: "PENDING",
      freelancerProfile: { id: "fp_1" },
    });

    runVisionReview.mockResolvedValueOnce(VISION_OK);
    const result = await submitFreelancerOnboarding({
      ...BASE_INPUT,
      files: { front: image("front.jpg"), back: image("back.jpg"), selfie: image("selfie.jpg") },
    });

    expect(result.outcome).toBe("verified");
    expect(alertOwnerLater).not.toHaveBeenCalled();

    // One compliance "id" doc, superseding any previous one, pointing at the
    // FRONT upload specifically — not the back or the selfie.
    expect(complianceDeleteMany).toHaveBeenCalledWith({
      where: { userId: "usr_1", kind: "ID" },
    });
    expect(complianceCreate).toHaveBeenCalledWith({
      data: { userId: "usr_1", kind: "ID", uploadId: "up_1" },
    });

    // The identity-verification row references all three uploads.
    const ivArg = ivCreate.mock.calls[0]![0] as { data: { rawPayload: { uploadIds: Record<string, string> } } };
    expect(ivArg.data.rawPayload.uploadIds).toEqual({ front: "up_1", back: "up_2", selfie: "up_3" });
  });

  describe("de code op het document zelf (MRZ)", () => {
    const jan = { id: "usr_1", fullName: "Jan Jansen", kycStatus: "PENDING", freelancerProfile: { id: "fp_1" } };
    const files = () => ({ front: image("front.jpg"), back: image("back.jpg"), selfie: image("selfie.jpg") });

    it("leest bij een ID-kaart eerst de achterkant", async () => {
      userFindUnique.mockResolvedValue(jan);
      const f = files();
      await submitFreelancerOnboarding({ ...BASE_INPUT, files: f });
      expect(leesMrzVanFoto.mock.calls[0]![0]).toBe(f.back.bytes);
    });

    it("wijst af als het document volgens de MRZ verlopen is, ook als er een geldige datum is getypt", async () => {
      userFindUnique.mockResolvedValue(jan);
      runVisionReview.mockResolvedValueOnce(VISION_OK);
      leesMrzVanFoto.mockResolvedValueOnce({ uitslag: { ...MRZ_JAN, vervaldatum: "2024-02-03", verlopen: true }, pogingen: 1, ms: 5 });
      const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: files() });
      expect(result.outcome).toBe("rejected");
      expect(result.reasons.join(" ")).toContain("verlopen op 03-02-2024");
    });

    it("een getypt nummer dat afwijkt van het document: een mens kijkt mee, ook als de beeldcontrole goed is", async () => {
      userFindUnique.mockResolvedValue(jan);
      runVisionReview.mockResolvedValueOnce(VISION_OK);
      leesMrzVanFoto.mockResolvedValueOnce({ uitslag: { ...MRZ_JAN, documentnummer: "XYZ987654" }, pogingen: 1, ms: 5 });
      const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: files() });
      expect(result.outcome).toBe("in_review");
      expect(result.checks.find((c) => c.label.startsWith("Documentnummer komt overeen"))?.ok).toBe(false);
    });

    it("geen MRZ gevonden: nooit afgewezen, maar ook niet automatisch goedgekeurd", async () => {
      userFindUnique.mockResolvedValue(jan);
      runVisionReview.mockResolvedValueOnce(VISION_OK);
      leesMrzVanFoto.mockResolvedValue({ uitslag: null, pogingen: 8, ms: 900 });
      const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: files() });
      leesMrzVanFoto.mockResolvedValue({ uitslag: MRZ_JAN, pogingen: 1, ms: 5 });
      expect(result.outcome).toBe("in_review");
      expect(alertOwnerLater).toHaveBeenCalled();
    });

    it("de vervaldatum van het document gaat vóór de getypte, en er wordt geen nummer, naam of BSN bewaard", async () => {
      userFindUnique.mockResolvedValue(jan);
      runVisionReview.mockResolvedValueOnce(VISION_OK);
      leesMrzVanFoto.mockResolvedValueOnce({ uitslag: { ...MRZ_JAN, vervaldatum: "2031-05-06" }, pogingen: 1, ms: 5 });
      await submitFreelancerOnboarding({ ...BASE_INPUT, files: files() });
      const ivArg = ivCreate.mock.calls[0]![0] as { data: { expiresAt: Date; rawPayload: { mrz: Record<string, unknown> } } };
      expect(ivArg.data.expiresAt.toISOString().slice(0, 10)).toBe("2031-05-06");
      expect(ivArg.data.rawPayload.mrz).toMatchObject({ geldig: true, nummerKlopt: true, naamKlopt: true });
      const opgeslagen = JSON.stringify(ivArg.data.rawPayload.mrz);
      expect(opgeslagen).not.toContain("SPECI2014");
      expect(opgeslagen).not.toContain("JANSEN");
      expect(opgeslagen).not.toContain("1990-01-01");
    });

    it("review H1-rest: een chip vervangt een onleesbare foto-MRZ nooit, ook een echte niet (een mens kijkt)", async () => {
      userFindUnique.mockResolvedValue(jan);
      runVisionReview.mockResolvedValueOnce(VISION_OK);
      leesMrzVanFoto.mockResolvedValue({ uitslag: null, pogingen: 8, ms: 900 });
      chipLezing.mockResolvedValueOnce(CHIP_JAN);
      const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: files() });
      leesMrzVanFoto.mockResolvedValue({ uitslag: MRZ_JAN, pogingen: 1, ms: 5 });
      expect(result.outcome).toBe("in_review");
      expect(result.checks.find((c) => c.label.startsWith("Chip van het document"))?.ok).toBe(true);
      // na de verificatie zijn de chipgegevens weg, en bewaard is alleen de uitslag
      expect(wisChipGegevens).toHaveBeenCalledWith("usr_1");
      const ivArg = ivCreate.mock.calls[0]![0] as { data: { rawPayload: { chip: Record<string, unknown> } } };
      expect(ivArg.data.rawPayload.chip).toMatchObject({ echt: true, nummerKlopt: true, naamKlopt: true });
      expect(JSON.stringify(ivArg.data.rawPayload.chip)).not.toContain("SPECI2014");
    });

    it("een chip ondertekend door een niet-vertrouwde 'overheid' wordt afgewezen", async () => {
      userFindUnique.mockResolvedValue(jan);
      runVisionReview.mockResolvedValueOnce(VISION_OK);
      chipLezing.mockResolvedValueOnce({ ...CHIP_JAN, echt: false, ketenOk: false });
      const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: files() });
      expect(result.outcome).toBe("rejected");
    });

    it("een echte chip met een andere naam: een mens kijkt mee", async () => {
      userFindUnique.mockResolvedValue(jan);
      runVisionReview.mockResolvedValueOnce(VISION_OK);
      leesMrzVanFoto.mockResolvedValue({ uitslag: null, pogingen: 8, ms: 900 });
      chipLezing.mockResolvedValueOnce({ ...CHIP_JAN, naamOpChip: { achternaam: "PIETERSEN", voornamen: "PIET" } });
      const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: files() });
      leesMrzVanFoto.mockResolvedValue({ uitslag: MRZ_JAN, pogingen: 1, ms: 5 });
      expect(result.outcome).toBe("in_review");
    });

    it("review H1: de chip van V met de foto's en selfie van A wordt nooit automatisch V", async () => {
      // account op naam van V (Jan Jansen), getypt nummer van V, chip van V echt …
      userFindUnique.mockResolvedValue(jan);
      runVisionReview.mockResolvedValueOnce(VISION_OK); // … en A's eigen selfie past bij A's eigen kaart
      leesMrzVanFoto.mockResolvedValueOnce({ uitslag: { ...MRZ_JAN, documentnummer: "AAA111222", achternaam: "PIETERS", voornamen: "PIET" }, pogingen: 1, ms: 5 });
      chipLezing.mockResolvedValueOnce(CHIP_JAN);
      const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: files() });
      expect(result.outcome).not.toBe("verified");
      const chipCheck = result.checks.find((c) => c.label.startsWith("Chip van het document"));
      expect(chipCheck?.ok).toBe(false);
      expect(chipCheck?.detail).toContain("ander document of een andere persoon");
    });

    it("review M3: een gedeelde achternaam is niet genoeg (Piet Jansen op het account van Jan Jansen)", async () => {
      userFindUnique.mockResolvedValue(jan);
      runVisionReview.mockResolvedValueOnce(VISION_OK);
      leesMrzVanFoto.mockResolvedValueOnce({ uitslag: { ...MRZ_JAN, voornamen: "PIET" }, pogingen: 1, ms: 5 });
      const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: files() });
      expect(result.outcome).toBe("in_review");
      expect(result.checks.find((c) => c.label.startsWith("Naam op het document"))?.ok).toBe(false);
    });

    it("review H3: hetzelfde chipzegel al bij een ander account: een mens kijkt", async () => {
      userFindUnique.mockResolvedValue(jan);
      runVisionReview.mockResolvedValueOnce(VISION_OK);
      chipLezing.mockResolvedValueOnce(CHIP_JAN);
      ivFindFirst.mockImplementation(async (a: { where: Record<string, unknown> }) => ("rawPayload" in a.where ? { id: "iv_ander" } : null));
      const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: files() });
      ivFindFirst.mockResolvedValue(null);
      expect(result.outcome).toBe("in_review");
      // review N4: de werker ziet niet dat dit zegel elders bekend is; de beoordelaar wel
      expect(result.checks.find((c) => c.label.startsWith("Chipgegevens niet eerder"))).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain("ander account");
      const ivArg = ivCreate.mock.calls[0]![0] as { data: { rawPayload: { checks: { label: string; ok: boolean }[] } } };
      expect(ivArg.data.rawPayload.checks.find((c) => c.label.startsWith("Chipgegevens niet eerder"))?.ok).toBe(false);
    });

    it("hetzelfde document al bij een ander account: een mens kijkt", async () => {
      userFindUnique.mockResolvedValue(jan);
      runVisionReview.mockResolvedValueOnce(VISION_OK);
      ivFindFirst.mockImplementation(async (a: { where: Record<string, unknown> }) => ("documentNumberHash" in a.where ? { id: "iv_ander" } : null));
      const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: files() });
      ivFindFirst.mockResolvedValue(null);
      expect(result.outcome).toBe("in_review");
      // review N4: de werker ziet niet dat dit document elders bekend is; de beoordelaar wel
      expect(result.checks.find((c) => c.label.startsWith("Document niet al gebruikt"))).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain("ander account");
      expect(result.summary).toContain("in behandeling");
      const ivArg = ivCreate.mock.calls[0]![0] as { data: { rawPayload: { checks: { label: string; ok: boolean }[] } } };
      expect(ivArg.data.rawPayload.checks.find((c) => c.label.startsWith("Document niet al gebruikt"))?.ok).toBe(false);
    });

    it("nationaliteit buiten de EU/EER: werkvergunning of verblijfsdocument, een mens kijkt", async () => {
      userFindUnique.mockResolvedValue(jan);
      runVisionReview.mockResolvedValueOnce(VISION_OK);
      leesMrzVanFoto.mockResolvedValueOnce({ uitslag: { ...MRZ_JAN, nationaliteit: "UKR" }, pogingen: 1, ms: 5 });
      const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: files() });
      expect(result.outcome).toBe("in_review");
      expect(result.checks.find((c) => c.label.startsWith("Recht om te werken"))?.ok).toBe(false);
      const ivArg = ivCreate.mock.calls[0]![0] as { data: { rawPayload: Record<string, unknown> } };
      expect(ivArg.data.rawPayload.werkrecht).toBe("controle");
      expect(JSON.stringify(ivArg.data.rawPayload)).not.toContain("UKR"); // alleen de categorie
    });

    it("minderjarig: een mens kijkt, en de geboortedatum wordt niet bewaard", async () => {
      userFindUnique.mockResolvedValue(jan);
      runVisionReview.mockResolvedValueOnce(VISION_OK);
      leesMrzVanFoto.mockResolvedValueOnce({ uitslag: { ...MRZ_JAN, geboortedatum: "2010-01-01" }, pogingen: 1, ms: 5 });
      const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: files() });
      expect(result.outcome).toBe("in_review");
      const ivArg = ivCreate.mock.calls[0]![0] as { data: { rawPayload: Record<string, unknown> } };
      expect(["minderjarig", "te-jong"]).toContain(ivArg.data.rawPayload.leeftijd);
      expect(JSON.stringify(ivArg.data.rawPayload)).not.toContain("2010-01-01");
    });

    it("review N2: werkrecht 'vrij' alleen als uitgevend land én nationaliteit EU/EER/CH zijn", async () => {
      userFindUnique.mockResolvedValue(jan);
      runVisionReview.mockResolvedValueOnce(VISION_OK);
      // Nederlandse nationaliteit op een document van een land buiten de EU: een mens kijkt
      leesMrzVanFoto.mockResolvedValueOnce({ uitslag: { ...MRZ_JAN, land: "UKR" }, pogingen: 1, ms: 5 });
      const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: files() });
      expect(result.outcome).toBe("in_review");
    });

    it("review N2: een rijbewijs (geen nationaliteit) gaat nooit automatisch door", async () => {
      userFindUnique.mockResolvedValue(jan);
      runVisionReview.mockResolvedValueOnce(VISION_OK);
      const result = await submitFreelancerOnboarding({ ...BASE_INPUT, documentType: "DRIVERS_LICENSE", documentNumber: "1234567890", files: files() });
      expect(result.outcome).toBe("in_review");
    });

    it("review N5: eigen rijbewijs plus de echte chip van een ander geeft nooit diens werkrecht", async () => {
      userFindUnique.mockResolvedValue(jan);
      runVisionReview.mockResolvedValueOnce(VISION_OK);
      chipLezing.mockResolvedValueOnce({ ...CHIP_JAN, nummerKlopt: false, naamOpChip: { achternaam: "DEVRIES", voornamen: "PIET" } });
      const result = await submitFreelancerOnboarding({ ...BASE_INPUT, documentType: "DRIVERS_LICENSE", documentNumber: "1234567890", files: files() });
      expect(result.outcome).toBe("in_review");
      const ivArg = ivCreate.mock.calls[0]![0] as { data: { rawPayload: { werkrecht?: unknown; leeftijd?: unknown } } };
      expect(ivArg.data.rawPayload.werkrecht ?? null).toBeNull();
      expect(ivArg.data.rawPayload.leeftijd ?? null).toBeNull();
    });

    it("review N3: dezelfde hash bij een andere documentsoort, en geen gewone SHA-256", async () => {
      const { createHash } = await import("node:crypto");
      userFindUnique.mockResolvedValue(jan);
      await submitFreelancerOnboarding({ ...BASE_INPUT, files: files() });
      await submitFreelancerOnboarding({ ...BASE_INPUT, documentType: "PASSPORT", files: files() });
      const hashes = ivFindFirst.mock.calls
        .map((c) => (c[0] as { where: { documentNumberHash?: string } }).where.documentNumberHash)
        .filter((h): h is string => Boolean(h));
      expect(hashes).toHaveLength(2);
      expect(hashes[0]).toBe(hashes[1]);
      expect(hashes[0]).not.toBe(createHash("sha256").update("ID_CARD:SPECI2014").digest("hex").slice(0, 48));
    });

    it("bewaart geen documentnummer van het beeldmodel en geen land (nationaliteit) in de uitslag", async () => {
      userFindUnique.mockResolvedValue(jan);
      runVisionReview.mockResolvedValueOnce({ ...VISION_OK, document: { ...VISION_OK.document, documentNumber: "SPECI2014", expiryDate: "2030-01-01" } });
      await submitFreelancerOnboarding({ ...BASE_INPUT, files: files() });
      const ivArg = ivCreate.mock.calls[0]![0] as { data: { rawPayload: { vision: { document: Record<string, unknown> }; mrz: Record<string, unknown> } } };
      expect(ivArg.data.rawPayload.vision.document.documentNumber).toBeNull();
      expect(ivArg.data.rawPayload.mrz).not.toHaveProperty("land");
    });

    it("review N5 (extra slot): account op naam van de chiphouder + diens nummer bij 'rijbewijs' gaat naar een mens", async () => {
      // A maakt een account op naam van V, kiest "rijbewijs", typt V's documentnummer (hier
      // een nummer van alleen cijfers, zoals in veel landen) en leest V's echte chip
      userFindUnique.mockResolvedValue(jan);
      runVisionReview.mockResolvedValueOnce(VISION_OK);
      chipLezing.mockResolvedValueOnce({ ...CHIP_JAN, documentnummer: "123456789" });
      const result = await submitFreelancerOnboarding({ ...BASE_INPUT, documentType: "DRIVERS_LICENSE", documentNumber: "123456789", files: files() });
      expect(result.outcome).toBe("in_review");
      const ivArg = ivCreate.mock.calls[0]![0] as { data: { rawPayload: Record<string, unknown> } };
      expect(ivArg.data.rawPayload.werkrecht).toBeNull();
      expect(ivArg.data.rawPayload.leeftijd).toBeNull();
    });

    it("een rijbewijs heeft geen MRZ: daar wordt niets gelezen", async () => {
      userFindUnique.mockResolvedValue(jan);
      await submitFreelancerOnboarding({ ...BASE_INPUT, documentType: "DRIVERS_LICENSE", documentNumber: "1234567890", files: files() });
      expect(leesMrzVanFoto).not.toHaveBeenCalled();
    });
  });

  it("does NOT auto-fill the compliance doc for a driver's license — that slot only accepts passport/ID card", async () => {
    userFindUnique.mockResolvedValue({
      id: "usr_1",
      fullName: "Jan Jansen",
      kycStatus: "PENDING",
      freelancerProfile: { id: "fp_1" },
    });

    await submitFreelancerOnboarding({
      ...BASE_INPUT,
      documentType: "DRIVERS_LICENSE",
      documentNumber: "1234567890",
      files: { front: image("front.jpg"), back: image("back.jpg"), selfie: image("selfie.jpg") },
    });

    expect(complianceDeleteMany).not.toHaveBeenCalled();
    expect(complianceCreate).not.toHaveBeenCalled();
  });
});

describe("submitFreelancerOnboarding — vision review (photo content)", () => {
  it("rejects on a confident face mismatch, and does NOT wave the untrusted document into compliance", async () => {
    userFindUnique.mockResolvedValue({
      id: "usr_1",
      fullName: "Jan Jansen",
      kycStatus: "PENDING",
      freelancerProfile: { id: "fp_1" },
    });
    runVisionReview.mockResolvedValueOnce({
      available: true,
      model: "moondream",
      document: { plausible: true, confidence: 0.9, documentNumber: null, expiryDate: null, concerns: [] },
      face: {
        samePerson: false,
        faceMatchConfidence: 0.85, // confident -> hard fail
        looksLive: true,
        livenessConfidence: 0.8,
        concerns: ["Gezichten komen niet overeen"],
      },
    });

    const result = await submitFreelancerOnboarding({
      ...BASE_INPUT,
      files: { front: image("front.jpg"), back: image("back.jpg"), selfie: image("selfie.jpg") },
    });

    expect(result.outcome).toBe("rejected");
    expect(result.reasons).toContain("Gezichten komen niet overeen");
    // A rejected verification must not still mark the compliance ID slot "done".
    expect(complianceCreate).not.toHaveBeenCalled();

    const ivArg = ivCreate.mock.calls[0]![0] as { data: { faceMatchScore: number; livenessScore: number } };
    expect(ivArg.data.faceMatchScore).toBe(0.85);
    expect(ivArg.data.livenessScore).toBe(0.8);
  });

  it("a LOW-confidence mismatch does not hard-block — falls to in_review, never a dead end", async () => {
    userFindUnique.mockResolvedValue({
      id: "usr_1",
      fullName: "Jan Jansen",
      kycStatus: "PENDING",
      freelancerProfile: { id: "fp_1" },
    });
    runVisionReview.mockResolvedValueOnce({
      available: true,
      model: "moondream",
      document: { plausible: true, confidence: 0.9, documentNumber: null, expiryDate: null, concerns: [] },
      face: {
        samePerson: false,
        faceMatchConfidence: 0.4, // below the 0.7 hard-fail threshold
        looksLive: true,
        livenessConfidence: 0.6,
        concerns: ["Twijfelachtig"],
      },
    });

    const result = await submitFreelancerOnboarding({
      ...BASE_INPUT,
      files: { front: image("front.jpg"), back: image("back.jpg"), selfie: image("selfie.jpg") },
    });

    expect(result.outcome).toBe("in_review");
  });

  it("without any photo check (no vision model) nobody is auto-approved on typed fields alone: a person reviews", async () => {
    userFindUnique.mockResolvedValue({
      id: "usr_1",
      fullName: "Jan Jansen",
      kycStatus: "PENDING",
      freelancerProfile: { id: "fp_1" },
    });

    const result = await submitFreelancerOnboarding({
      ...BASE_INPUT,
      files: { front: image("front.jpg"), back: image("back.jpg"), selfie: image("selfie.jpg") },
    });

    // the text AI said "approved", but it never saw the photos
    expect(result.outcome).toBe("in_review");
    expect(result.kycStatus).toBe("PENDING");
    expect(result.summary).toMatch(/medewerker/);
    // the owner is told, otherwise the worker waits unseen
    expect(alertOwnerLater).toHaveBeenCalledWith(expect.objectContaining({ key: "kyc-beoordeling:usr_1", url: "/admin/gebruikers/usr_1" }));
    // the front photo still fills the compliance ID slot (not rejected)
    expect(complianceCreate).toHaveBeenCalled();
  });

  it("a vision model failure (unavailable) never blocks — it lands with a person (in_review), never rejected", async () => {
    userFindUnique.mockResolvedValue({
      id: "usr_1",
      fullName: "Jan Jansen",
      kycStatus: "PENDING",
      freelancerProfile: { id: "fp_1" },
    });
    runVisionReview.mockResolvedValueOnce({
      available: false,
      document: null,
      face: null,
      model: "moondream",
      error: "timeout",
    });

    const result = await submitFreelancerOnboarding({
      ...BASE_INPUT,
      files: { front: image("front.jpg"), back: image("back.jpg"), selfie: image("selfie.jpg") },
    });

    expect(result.outcome).toBe("in_review");
    expect(result.checks.some((c) => c.label.includes("beeldcontrole"))).toBe(false);
  });
});

describe("submitFreelancerOnboarding — gezichtscontrole met het eigen model (11 nov)", () => {
  const GEBRUIKER = { id: "usr_1", fullName: "Jan Jansen", kycStatus: "PENDING", freelancerProfile: { id: "fp_1" } };
  const FOTOS = { front: image("front.jpg"), back: image("back.jpg"), selfie: image("selfie.jpg") };
  /** de tekst-AI is niet bereikbaar (time-out): vertrouwen 0 */
  const aiUit = async () => {
    const { chatJson } = await import("@/lib/ai/client");
    vi.mocked(chatJson).mockRejectedValueOnce(new Error("LLM request timed out after 8000ms"));
  };

  it("een sterke match met een kloppende MRZ keurt zelf goed, ook als de tekst-AI niet bereikbaar is", async () => {
    userFindUnique.mockResolvedValue(GEBRUIKER);
    gezichtControle.mockResolvedValueOnce(GEZICHT_ZELFDE);
    await aiUit();
    const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: FOTOS });
    expect(result.outcome).toBe("verified");
    expect(alertOwnerLater).not.toHaveBeenCalled();
    // alleen de score wordt bewaard
    const data = (ivCreate.mock.calls[0]![0] as { data: { faceMatchScore: number; rawPayload: { gezicht: { oordeel: string; score: number; automatisch: boolean } } } }).data;
    expect(data.faceMatchScore).toBe(0.72);
    expect(data.rawPayload.gezicht).toMatchObject({ oordeel: "zelfde", score: 0.72, automatisch: true });
    expect(JSON.stringify(data.rawPayload)).not.toMatch(/kenmerk|embedding/i);
    // live camera of bestandskeuze per vak (lib/kyc/foto-bron.ts): deze testfoto's heten front.jpg enz., dus uit bestand
    expect((data.rawPayload as unknown as { bron: unknown }).bron).toEqual({ front: "bestand", back: "bestand", selfie: "bestand" });
  });

  it("met 'alles gratis' vraagt de controle de tekst-AI niet (het eigen model haalt de 8 s nooit, 13 nov): zelfde uitkomst", async () => {
    userFindUnique.mockResolvedValue(GEBRUIKER);
    gezichtControle.mockResolvedValueOnce(GEZICHT_ZELFDE);
    gratisStand = true;
    try {
      const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: FOTOS });
      expect(result.outcome).toBe("verified");
    } finally {
      gratisStand = false;
    }
    const { chatJson } = await import("@/lib/ai/client");
    expect(chatJson).not.toHaveBeenCalled();
    // hetzelfde als een AI die niet op tijd antwoordt: "bekijk handmatig" met vertrouwen 0
    const data = (ivCreate.mock.calls[0]![0] as { data: { rawPayload: { ai: { verdict: string; confidence: number } } } }).data;
    expect(data.rawPayload.ai).toMatchObject({ verdict: "needs_review", confidence: 0 });
  });

  it("de live reeks: alleen de samenvatting bij de controle, daarna gewist; nog geen poort (ook een sprong keurt goed)", async () => {
    userFindUnique.mockResolvedValue(GEBRUIKER);
    gezichtControle.mockResolvedValueOnce(GEZICHT_ZELFDE);
    reeksSamenvatting.mockResolvedValueOnce({ beelden: 5, tussenstanden: 0, ms: 800, draai: 0.28 });
    await aiUit();
    const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: FOTOS });
    expect(result.outcome).toBe("verified");
    const data = (ivCreate.mock.calls[0]![0] as { data: { rawPayload: { gezicht: { reeks?: unknown } } } }).data;
    expect(data.rawPayload.gezicht.reeks).toEqual({ beelden: 5, tussenstanden: 0, ms: 800, draai: 0.28 });
    expect(reeksSamenvatting).toHaveBeenCalledWith("usr_1");
    expect(wisReeks).toHaveBeenCalledWith("usr_1");
  });

  it("zelf gekozen foto's (geen live camerabeelden) gaan naar een mens, ook als gezicht en document kloppen (review 73)", async () => {
    userFindUnique.mockResolvedValue(GEBRUIKER);
    gezichtControle.mockResolvedValueOnce(GEZICHT_ZELFDE);
    reeksSamenvatting.mockResolvedValueOnce({ beelden: 0, tussenstanden: 0, ms: null, draai: null });
    await aiUit();
    const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: FOTOS });
    expect(result.outcome).toBe("in_review");
    const data = (ivCreate.mock.calls[0]![0] as { data: { rawPayload: { nietAutomatisch: string[] } } }).data;
    expect(data.rawPayload.nietAutomatisch).toEqual(["geen live camerabeelden (foto's zelf gekozen, of de live camera viel weg): dan kijkt een medewerker mee"]);
  });

  it("een testaccount (.test, .example) dat in behandeling komt, stuurt de eigenaar geen melding; een echt account wel", async () => {
    const twijfel = { ...GEZICHT_ZELFDE, oordeel: "twijfel", score: 0.4 };
    for (const email of ["zf-idlive@zekerflex.test", "iemand@voorbeeld.example"]) {
      userFindUnique.mockResolvedValueOnce({ ...GEBRUIKER, email });
      gezichtControle.mockResolvedValueOnce(twijfel);
      await aiUit();
      expect((await submitFreelancerOnboarding({ ...BASE_INPUT, files: FOTOS })).outcome).toBe("in_review");
    }
    expect(alertOwnerLater).not.toHaveBeenCalled();
    userFindUnique.mockResolvedValueOnce({ ...GEBRUIKER, email: "jan@jansen.nl" });
    gezichtControle.mockResolvedValueOnce(twijfel);
    await aiUit();
    expect((await submitFreelancerOnboarding({ ...BASE_INPUT, files: FOTOS })).outcome).toBe("in_review");
    expect(alertOwnerLater).toHaveBeenCalledWith(expect.objectContaining({ key: "kyc-beoordeling:usr_1" }));
  });

  it("de live reeks: een storing bij lezen of wissen breekt de verificatie niet, maar zonder live bewijs kijkt een mens", async () => {
    userFindUnique.mockResolvedValue(GEBRUIKER);
    gezichtControle.mockResolvedValueOnce(GEZICHT_ZELFDE);
    reeksSamenvatting.mockRejectedValueOnce(new Error("kv weg"));
    wisReeks.mockRejectedValueOnce(new Error("kv weg"));
    await aiUit();
    const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: FOTOS });
    expect(result.outcome).toBe("in_review");
    const data = (ivCreate.mock.calls[0]![0] as { data: { rawPayload: { gezicht: Record<string, unknown> } } }).data;
    expect("reeks" in data.rawPayload.gezicht).toBe(false);
  });

  it("zegt de tekst-AI 'bekijk handmatig' terwijl foto's en document alles bevestigen, dan keurt de controle toch zelf goed (12 nov)", async () => {
    userFindUnique.mockResolvedValue(GEBRUIKER);
    gezichtControle.mockResolvedValueOnce(GEZICHT_ZELFDE);
    const { chatJson } = await import("@/lib/ai/client");
    vi.mocked(chatJson).mockResolvedValueOnce({ verdict: "needs_review", confidence: 0.4, reasons: ["twijfel"], summary: "" });
    const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: FOTOS });
    expect(result.outcome).toBe("verified");
    const data = (ivCreate.mock.calls[0]![0] as { data: { rawPayload: { nietAutomatisch: string[]; document: Record<string, unknown> } } }).data;
    expect(data.rawPayload.nietAutomatisch).toEqual([]);
    // de gegevens van het document voor het beheer: naam van de code, het eind van het nummer, geen BSN of nationaliteit
    expect(data.rawPayload.document).toMatchObject({ uitDeCode: true });
    expect(String(data.rawPayload.document.nummerEind)).toHaveLength(3);
    expect(Object.keys(data.rawPayload.document).sort()).toEqual(["naam", "nummerEind", "uitDeCode"]);
  });

  it("zegt de tekst-AI uitdrukkelijk 'afgekeurd', dan kijkt een mens (nooit meer een afwijzing door de AI alleen), met de reden erbij", async () => {
    userFindUnique.mockResolvedValue(GEBRUIKER);
    gezichtControle.mockResolvedValueOnce(GEZICHT_ZELFDE);
    const { chatJson } = await import("@/lib/ai/client");
    vi.mocked(chatJson).mockResolvedValueOnce({ verdict: "rejected", confidence: 0.9, reasons: ["tegenstrijdig"], summary: "" });
    const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: FOTOS });
    expect(result.outcome).toBe("in_review");
    const data = (ivCreate.mock.calls[0]![0] as { data: { rawPayload: { nietAutomatisch: string[] } } }).data;
    expect(data.rawPayload.nietAutomatisch).toEqual(["de automatische beoordeling zag een tegenstrijdigheid in de gegevens"]);
    expect(alertOwnerLater).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.stringContaining("Niet vanzelf goedgekeurd omdat: de automatische beoordeling zag een tegenstrijdigheid") }));
  });

  it("aannemelijk maar niet zeker (twijfel) gaat naar een mens, met de score voor de medewerker", async () => {
    userFindUnique.mockResolvedValue(GEBRUIKER);
    gezichtControle.mockResolvedValueOnce({ ...GEZICHT_ZELFDE, oordeel: "twijfel", score: 0.43, reden: "Het gezicht lijkt op de pasfoto, maar niet zeker genoeg. Een medewerker kijkt mee." });
    await aiUit();
    const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: FOTOS });
    expect(result.outcome).toBe("in_review");
    expect(result.checks.find((c) => c.label.includes("gezichtscontrole"))?.ok).toBe(false);
    // de score is alleen voor medewerkers: de werker ziet hem niet, het opgeslagen dossier wel
    expect(result.checks.some((c) => c.label === "Gezichtsgelijkenis (score)")).toBe(false);
    const opgeslagen = (ivCreate.mock.calls[0]![0] as { data: { rawPayload: { checks: { label: string; intern?: boolean; detail: string }[] } } }).data.rawPayload.checks;
    const score = opgeslagen.find((c) => c.label === "Gezichtsgelijkenis (score)");
    expect(score?.intern).toBe(true);
    expect(score?.detail).toContain("43%");
  });

  it("een ander gezicht wijst niet af (de drempels zijn nog niet gemeten op echte pasfoto's) maar gaat naar een mens", async () => {
    userFindUnique.mockResolvedValue(GEBRUIKER);
    gezichtControle.mockResolvedValueOnce({ ...GEZICHT_ZELFDE, oordeel: "anders", score: 0.12, reden: "Het gezicht op de selfie lijkt niet op de pasfoto op het document. Een medewerker kijkt mee." });
    await aiUit();
    const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: FOTOS });
    expect(result.outcome).toBe("in_review");
  });

  it("de controle kon niet draaien (technische storing): een mens beslist, nooit een afwijzing", async () => {
    userFindUnique.mockResolvedValue(GEBRUIKER);
    await aiUit();
    const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: FOTOS });
    expect(result.outcome).toBe("in_review");
  });

  it("een rijbewijs heeft geen code op het document: ook bij een sterke match beslist een mens", async () => {
    userFindUnique.mockResolvedValue(GEBRUIKER);
    gezichtControle.mockResolvedValueOnce(GEZICHT_ZELFDE);
    await aiUit();
    const result = await submitFreelancerOnboarding({ ...BASE_INPUT, documentType: "DRIVERS_LICENSE", files: FOTOS });
    expect(result.outcome).toBe("in_review");
  });

  it("zonder kloppende MRZ keurt een sterke match niet zelf goed", async () => {
    userFindUnique.mockResolvedValue(GEBRUIKER);
    gezichtControle.mockResolvedValueOnce(GEZICHT_ZELFDE);
    // de code wordt van elke foto gelezen: voor deze aanvraag nergens gevonden, daarna weer de standaard
    leesMrzVanFoto.mockResolvedValue({ uitslag: null, pogingen: 1, ms: 5 });
    try {
      await aiUit();
      const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: FOTOS });
      expect(result.outcome).toBe("in_review");
    } finally {
      leesMrzVanFoto.mockResolvedValue({ uitslag: MRZ_JAN, pogingen: 1, ms: 5 });
    }
  });

  it("de eigenaar kan automatisch goedkeuren op het gezicht uitzetten: de score blijft, een mens beslist", async () => {
    userFindUnique.mockResolvedValue(GEBRUIKER);
    gezichtControle.mockResolvedValueOnce(GEZICHT_ZELFDE);
    featureEnabled.mockResolvedValueOnce(false);
    await aiUit();
    const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: FOTOS });
    expect(result.outcome).toBe("in_review");
    const data = (ivCreate.mock.calls[0]![0] as { data: { faceMatchScore: number } }).data;
    expect(data.faceMatchScore).toBe(0.72);
  });

  it("zonder tweede selfie (gedraaid hoofd) keurt een sterke match niet zelf goed: een selfie uit de galerij komt er niet doorheen", async () => {
    userFindUnique.mockResolvedValue(GEBRUIKER);
    gezichtControle.mockResolvedValueOnce({ ...GEZICHT_ZELFDE, beweging: { oordeel: "niet-aangeleverd", verschil: null, reden: "Er is geen tweede selfie met een gedraaid hoofd. Een medewerker kijkt mee." } });
    await aiUit();
    const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: FOTOS });
    expect(result.outcome).toBe("in_review");
    expect(result.checks.find((c) => c.label.includes("bewegingscontrole"))?.ok).toBe(false);
  });

  it("een hoofd dat niet draaide (foto of scherm als selfie) gaat naar een mens, ook bij een sterke match", async () => {
    userFindUnique.mockResolvedValue(GEBRUIKER);
    gezichtControle.mockResolvedValueOnce({ ...GEZICHT_ZELFDE, beweging: { oordeel: "niet-gedraaid", verschil: 0.02, reden: "Je hoofd was op de tweede selfie niet duidelijk gedraaid." } });
    await aiUit();
    const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: { ...FOTOS, selfie2: image("selfie2.jpg") } });
    expect(result.outcome).toBe("in_review");
    const data = (ivCreate.mock.calls[0]![0] as { data: { rawPayload: { gezicht: { automatisch: boolean; beweging: { oordeel: string; verschil: number } } } } }).data;
    expect(data.rawPayload.gezicht.automatisch).toBe(false);
    expect(data.rawPayload.gezicht.beweging).toEqual({ oordeel: "niet-gedraaid", verschil: 0.02 });
  });

  it("met een echt gedraaid hoofd keurt hij zelf goed, geeft de tweede selfie door en bewaart hem naast de andere foto's", async () => {
    userFindUnique.mockResolvedValue(GEBRUIKER);
    gezichtControle.mockResolvedValueOnce(GEZICHT_ZELFDE);
    await aiUit();
    const selfie2 = image("selfie2.jpg");
    const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: { ...FOTOS, selfie2 } });
    expect(result.outcome).toBe("verified");
    // de controle kreeg de bytes van de tweede selfie als derde argument
    expect(gezichtControle.mock.calls[0]?.[2]).toBe(selfie2.bytes);
    const payload = (ivCreate.mock.calls[0]![0] as { data: { rawPayload: { uploadIds: Record<string, string>; gezicht: { beweging: { oordeel: string } } } } }).data.rawPayload;
    expect(Object.keys(payload.uploadIds).sort()).toEqual(["back", "front", "selfie", "selfie2"]);
    expect(payload.gezicht.beweging.oordeel).toBe("ok");
  });

  it("een tweede selfie die te klein is (geen echte foto) telt als niet aangeleverd en wordt niet doorgegeven", async () => {
    userFindUnique.mockResolvedValue(GEBRUIKER);
    gezichtControle.mockResolvedValueOnce(GEZICHT_ZELFDE);
    await aiUit();
    await submitFreelancerOnboarding({ ...BASE_INPUT, files: { ...FOTOS, selfie2: image("selfie2.jpg", 100) } });
    expect(gezichtControle.mock.calls[0]?.[2]).toBeUndefined();
    const ids = (ivCreate.mock.calls[0]![0] as { data: { rawPayload: { uploadIds: Record<string, string> } } }).data.rawPayload.uploadIds;
    expect(ids.selfie2).toBeUndefined();
  });

  it("foto's via een tweede toestel blijven altijd bij een mens, ook met een sterke match", async () => {
    userFindUnique.mockResolvedValue(GEBRUIKER);
    gezichtControle.mockResolvedValueOnce(GEZICHT_ZELFDE);
    await aiUit();
    const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: FOTOS, viaTweedeToestel: true });
    expect(result.outcome).toBe("in_review");
  });
});

describe("submitFreelancerOnboardingViaWallet", () => {
  const WALLET_INPUT = {
    userId: "usr_1",
    attemptId: "attempt_1",
    kvkNumber: "",
    postalCode: "1012 AB",
    houseNumber: "10",
    payoutIban: "NL91ABNA0417164300",
  };

  it("throws when the wallet attempt is missing, expired, or already used — never touches the DB", async () => {
    userFindUnique.mockResolvedValue({ id: "usr_1", fullName: "Jan Jansen", freelancerProfile: { id: "fp_1" } });
    consumeVerifiedWalletAttempt.mockResolvedValue(null);

    await expect(submitFreelancerOnboardingViaWallet(WALLET_INPUT)).rejects.toThrow(/verlopen/);
    expect(ivCreate).not.toHaveBeenCalled();
  });

  it("verifies straight through on a name match, no KVK needed (uitzendkracht)", async () => {
    userFindUnique.mockResolvedValue({ id: "usr_1", fullName: "Jan Jansen", freelancerProfile: { id: "fp_1" } });
    consumeVerifiedWalletAttempt.mockResolvedValue({
      givenName: "Jan",
      familyName: "Jansen",
      birthDate: "1990-01-01",
      documentNumber: "AB1234567",
      expiryDate: "2030-01-01",
      issuingCountry: "NL",
      rawDocumentType: "eu.europa.ec.eudi.pid.1",
    });

    const result = await submitFreelancerOnboardingViaWallet(WALLET_INPUT);

    expect(result.outcome).toBe("verified");
    const ivArg = ivCreate.mock.calls[0]![0] as { data: { provider: string; documentType: string } };
    expect(ivArg.data.provider).toBe("DIGITAL_WALLET");
    expect(ivArg.data.documentType).toBe("ID_CARD");
    // No file was ever uploaded for this path.
    expect(complianceCreate).not.toHaveBeenCalled();
  });

  it("maps a mobile driver's license credential to DRIVERS_LICENSE", async () => {
    userFindUnique.mockResolvedValue({ id: "usr_1", fullName: "Jan Jansen", freelancerProfile: { id: "fp_1" } });
    consumeVerifiedWalletAttempt.mockResolvedValue({
      givenName: "Jan",
      familyName: "Jansen",
      birthDate: "1990-01-01",
      documentNumber: "AB1234567",
      expiryDate: "2030-01-01",
      issuingCountry: "NL",
      rawDocumentType: "org.iso.18013.5.1.mDL",
    });

    await submitFreelancerOnboardingViaWallet(WALLET_INPUT);

    const ivArg = ivCreate.mock.calls[0]![0] as { data: { documentType: string } };
    expect(ivArg.data.documentType).toBe("DRIVERS_LICENSE");
  });

  it("rejects when the wallet's name doesn't match the account", async () => {
    userFindUnique.mockResolvedValue({ id: "usr_1", fullName: "Jan Jansen", freelancerProfile: { id: "fp_1" } });
    consumeVerifiedWalletAttempt.mockResolvedValue({
      givenName: "Someone",
      familyName: "Else",
      birthDate: "1990-01-01",
      documentNumber: "AB1234567",
      expiryDate: "2030-01-01",
      issuingCountry: "NL",
      rawDocumentType: "eu.europa.ec.eudi.pid.1",
    });

    const result = await submitFreelancerOnboardingViaWallet(WALLET_INPUT);

    expect(result.outcome).toBe("rejected");
  });
});
