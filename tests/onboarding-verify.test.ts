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

const consumeVerifiedWalletAttempt = vi.fn();
vi.mock("@/lib/kyc/wallet", () => ({
  consumeVerifiedWalletAttempt: (...a: unknown[]) => consumeVerifiedWalletAttempt(...a),
}));

import { submitFreelancerOnboarding, submitFreelancerOnboardingViaWallet } from "@/lib/onboarding/verify";

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

    it("een echte chip met het juiste nummer en de juiste naam vervangt een onleesbare MRZ", async () => {
      userFindUnique.mockResolvedValue(jan);
      runVisionReview.mockResolvedValueOnce(VISION_OK);
      leesMrzVanFoto.mockResolvedValue({ uitslag: null, pogingen: 8, ms: 900 });
      chipLezing.mockResolvedValueOnce(CHIP_JAN);
      const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: files() });
      leesMrzVanFoto.mockResolvedValue({ uitslag: MRZ_JAN, pogingen: 1, ms: 5 });
      expect(result.outcome).toBe("verified");
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
      expect(result.checks.find((c) => c.label.startsWith("Chipgegevens niet eerder"))?.ok).toBe(false);
    });

    it("hetzelfde document al bij een ander account: een mens kijkt", async () => {
      userFindUnique.mockResolvedValue(jan);
      runVisionReview.mockResolvedValueOnce(VISION_OK);
      ivFindFirst.mockImplementation(async (a: { where: Record<string, unknown> }) => ("documentNumberHash" in a.where ? { id: "iv_ander" } : null));
      const result = await submitFreelancerOnboarding({ ...BASE_INPUT, files: files() });
      ivFindFirst.mockResolvedValue(null);
      expect(result.outcome).toBe("in_review");
      expect(result.checks.find((c) => c.label.startsWith("Document niet al gebruikt"))?.ok).toBe(false);
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
