import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fotoUploadId, idControleWeergave, stripeSessieUrl } from "@/lib/admin/kyc-weergave";

// Admin → Gebruikers (eigenaar 11 nov): profielfoto, de foto's van de ID-controle (voor, achter,
// selfie), de uitslag van alle controles en de plek in beeld. Nooit een documentnummer of BSN.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

const eigen = {
  outcome: "in_review",
  uploadIds: { front: "up_front", back: "up_back", selfie: "up_selfie" },
  checks: [
    { label: "Naam komt overeen", ok: true, detail: "Jan de Vries" },
    { label: "Document al gebruikt", ok: false, detail: "bij een ander account", intern: true },
  ],
  ai: { verdict: "needs_review", confidence: 0.4, reasons: ["Foto onscherp"] },
  vision: { available: true, model: "gemini", document: { plausible: true, confidence: 0.9, documentNumber: null, expiryDate: null, concerns: [] }, face: { samePerson: false, faceMatchConfidence: 0.3, looksLive: true, livenessConfidence: 0.8, concerns: ["ander kapsel"] } },
  mrz: { geldig: true, volledig: true, soort: "TD1", verlopen: false, vervaldatum: "2031-05-01", nummerKlopt: true, naamKlopt: true },
  werkrecht: "vrij",
  leeftijd: "volwassen",
  dubbelDocument: true,
  viaTweedeToestel: true,
};

describe("weergave van een identiteitscontrole", () => {
  it("de eigen controle: drie foto's, de controles, het oordeel en de uitslagen", () => {
    const w = idControleWeergave("AI_LOCAL", eigen);
    expect(w.fotos).toEqual(["front", "back", "selfie"]);
    expect(w.regels).toEqual([
      { label: "Naam komt overeen", ok: true, detail: "Jan de Vries", intern: false },
      { label: "Document al gebruikt", ok: false, detail: "bij een ander account", intern: true },
    ]);
    expect(w.ai).toEqual({ oordeel: "laat een mens kijken", zekerheid: 0.4, redenen: ["Foto onscherp"] });
    expect(w.beeld.aan).toBe(true);
    expect(w.beeld.samenvatting.join(" | ")).toMatch(/Document ziet er echt uit \(90%\).*Selfie lijkt een ander persoon \(30%\).*ander kapsel/);
    expect(w.mrz).toContain("geldig tot 2031-05-01");
    expect(w.overig).toEqual(expect.arrayContaining(["Werkrecht: mag vrij werken (EU/EER/CH)", "Dit document is al bij een ander account gebruikt", "Ingestuurd via een tweede toestel (verder op je telefoon)"]));
    expect(w.stripe).toBeNull();
  });

  it("Stripe: de foto's staan bij Stripe, met een link naar de sessie", () => {
    const w = idControleWeergave("STRIPE_IDENTITY", { sessionId: "vs_123", nameOnDocument: "Jan de Vries", nameOk: false, provider: "STRIPE_IDENTITY" });
    expect(w.fotos).toEqual([]);
    expect(w.stripe).toEqual({ sessieId: "vs_123", naamOpDocument: "Jan de Vries", naamKlopt: false, reden: null });
    expect(stripeSessieUrl("vs_123")).toBe("https://dashboard.stripe.com/identity/verification-sessions/vs_123");
  });

  it("verdraagt een leeg of opgeruimd payload, en geeft nooit een documentnummer door", () => {
    for (const leeg of [null, {}, "x", [], { checks: "geen lijst" }]) {
      const w = idControleWeergave("AI_LOCAL", leeg);
      expect(w.fotos).toEqual([]);
      expect(w.regels).toEqual([]);
    }
    const metNummer = { ...eigen, vision: { ...eigen.vision, document: { ...eigen.vision.document, documentNumber: "NX1234567" } } };
    expect(JSON.stringify(idControleWeergave("AI_LOCAL", metNummer))).not.toMatch(/NX1234567/);
    expect(fotoUploadId(eigen, "back")).toBe("up_back");
    expect(fotoUploadId({}, "back")).toBeNull();
  });
});

describe("de routes en het scherm", () => {
  it("de foto-route is alleen voor platformbeheerders, alleen voor afbeeldingen, en logt elke inzage", () => {
    const route = lees("app/api/admin/gebruikers/[id]/identiteit/[checkId]/beeld/route.ts");
    expect(route).toMatch(/withAdminAccess<[^>]+>\(\["PLATFORM_ADMIN"\]/);
    expect(route).toMatch(/where: \{ id: params\.checkId, userId: params\.id \}/);
    expect(route).toMatch(/startsWith\("image\/"\)/);
    expect(route).toMatch(/action: "kyc\.beeld_bekeken"/);
  });

  it("de gebruikerspagina toont profielfoto, ID-foto's, plek en check-ins, en meer dan 3 controles", () => {
    const pagina = lees("app/admin/gebruikers/[id]/page.tsx");
    expect(pagina).toMatch(/avatarUrlFor\(user\.id/);
    expect(pagina).toMatch(/identiteit\/\$\{c\.id\}\/beeld\?welk=/);
    expect(pagina).toMatch(/title="In- en uitchecks"/);
    expect(pagina).toMatch(/label: "Thuisbasis"/);
    expect(pagina).toMatch(/take: 10 \}/);
    expect(lees("app/admin/gebruikers/page.tsx")).toMatch(/fotoUrl=\{avatarUrlFor\(u\.id/);
  });

  it("handmatig goedkeuren sluit de openstaande eigen controle en het ID-document mee af", () => {
    const route = lees("app/api/admin/gebruikers/[id]/kyc/route.ts");
    expect(route).toMatch(/provider: "AI_LOCAL", status: KycStatus\.PENDING/);
    expect(route).toMatch(/kind: ComplianceDocKind\.ID, status: ComplianceDocStatus\.UPLOADED/);
  });

  it("de knoppen laten een fout zien in plaats van stil niets te doen", () => {
    expect(lees("components/admin/IdentityCheckActions.tsx")).toMatch(/role="alert"/);
  });
});
