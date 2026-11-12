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

describe("de gezichtscontrole in beeld", () => {
  it("oordeel en percentage uit rawPayload.gezicht, anders uit de kolom faceMatchScore", () => {
    const w = idControleWeergave("AI_LOCAL", { gezicht: { oordeel: "zelfde", score: 0.6234, technisch: false, automatisch: true, ms: 420 } });
    expect(w.gezicht).toEqual({ oordeel: "zelfde persoon", procent: 62, technisch: false, automatisch: true, beweging: null, reeks: null });
    expect(idControleWeergave("AI_LOCAL", { gezicht: { oordeel: "onbruikbaar", score: null, technisch: true, automatisch: false } }).gezicht).toEqual({
      oordeel: "niet te meten (foto onbruikbaar)",
      procent: null,
      technisch: true,
      automatisch: false,
      beweging: null,
      reeks: null,
    });
    expect(idControleWeergave("AI_LOCAL", {}, null, 0.41).gezicht?.procent).toBe(41);
    expect(idControleWeergave("AI_LOCAL", {}).gezicht).toBeNull();
  });

  it("de bewegingscontrole (tweede selfie met gedraaid hoofd): oordeel, draai en de foto zelf", () => {
    const w = idControleWeergave("AI_LOCAL", {
      uploadIds: { front: "a", back: "b", selfie: "c", selfie2: "d" },
      gezicht: { oordeel: "zelfde", score: 0.7, technisch: false, automatisch: true, beweging: { oordeel: "ok", verschil: 0.27 } },
    });
    expect(w.fotos).toEqual(["front", "back", "selfie", "selfie2"]);
    expect(w.gezicht?.beweging).toBe("hoofd echt gedraaid (draai 27%)");
    expect(fotoUploadId({ uploadIds: { selfie2: "d" } }, "selfie2")).toBe("d");
    const nep = idControleWeergave("AI_LOCAL", { gezicht: { oordeel: "zelfde", score: 0.8, beweging: { oordeel: "niet-gedraaid", verschil: 0.03 } } });
    expect(nep.gezicht?.beweging).toBe("hoofd niet gedraaid (mogelijk een foto of scherm) (draai 3%)");
    expect(idControleWeergave("AI_LOCAL", { gezicht: { oordeel: "zelfde", beweging: { oordeel: "niet-aangeleverd", verschil: null } } }).gezicht?.beweging).toBe("geen tweede selfie meegestuurd");
    // de live reeks (alleen ter informatie): tussenstanden, een sprong, of niets gezien
    const met = (reeks: unknown) => idControleWeergave("AI_LOCAL", { gezicht: { oordeel: "zelfde", score: 0.6, reeks } }).gezicht?.reeks;
    expect(met({ beelden: 14, tussenstanden: 2, ms: 1250, draai: 0.28 })).toBe("2 tussenstanden in 1,3 s (14 beelden): het hoofd draaide geleidelijk");
    expect(met({ beelden: 9, tussenstanden: 1, ms: 800, draai: -0.3 })).toBe("1 tussenstand in 0,8 s (9 beelden): het hoofd draaide geleidelijk");
    expect(met({ beelden: 12, tussenstanden: 0, ms: 410, draai: 0.32 })).toMatch(/^draai in één sprong, zonder tussenstand \(0,4 s, 12 beelden\): mogelijk twee losse foto's/);
    expect(met({ beelden: 1, tussenstanden: 0, ms: null, draai: null })).toBe("geen draai live gezien (1 beeld)");
    expect(met(undefined)).toBeNull();
    expect(met("rommel")).toBeNull();
    expect(lees("app/admin/gebruikers/[id]/page.tsx")).toContain("w.gezicht.reeks");
  });

  it("de uitkomst (waarom niet automatisch) en de gegevens van het document", () => {
    const w = idControleWeergave("AI_LOCAL", {
      nietAutomatisch: ["het gezicht lijkt 41% op de pasfoto (zeker vanaf 42%)", 7, ""],
      document: { naam: "JAN JANSEN", uitDeCode: true, nummerEind: "014" },
    });
    expect(w.nietAutomatisch).toEqual(["het gezicht lijkt 41% op de pasfoto (zeker vanaf 42%)"]);
    expect(w.document).toEqual({ naam: "JAN JANSEN", uitDeCode: true, nummerEind: "014" });
    // zelf goedgekeurd: een lege lijst; een oudere controle: niets
    expect(idControleWeergave("AI_LOCAL", { nietAutomatisch: [] }).nietAutomatisch).toEqual([]);
    expect(idControleWeergave("AI_LOCAL", {}).nietAutomatisch).toBeNull();
    expect(idControleWeergave("AI_LOCAL", {}).document).toBeNull();
    const pagina = lees("app/admin/gebruikers/[id]/page.tsx");
    expect(pagina).toContain("Wacht op jou, omdat:");
    expect(pagina).toContain("automatisch goedgekeurd, alle controles klopten");
    expect(lees("app/api/admin/gebruikers/[id]/identiteit/[checkId]/beeld/route.ts")).toMatch(/z\.enum\(\["front", "back", "selfie", "selfie2"\]\)/);
  });
});
