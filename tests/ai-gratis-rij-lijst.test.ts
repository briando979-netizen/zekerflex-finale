import { describe, expect, it } from "vitest";
import { BLIJFT_EIGEN, KETTING_AANBIEDERS, KETTING_DIENSTEN, magViaKetting } from "@/lib/ai/ketting";

// De echte lijst van de gratis rij (lib/ai/ketting.ts, onderzocht 16 nov 2026): klopt hij in zichzelf?

describe("de lijst van de gratis rij", () => {
  it("heeft unieke modellen bij bestaande diensten", () => {
    const ids = KETTING_AANBIEDERS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of KETTING_AANBIEDERS) expect(KETTING_DIENSTEN.some((d) => d.id === a.dienst)).toBe(true);
    // elke dienst heeft minstens één model
    for (const d of KETTING_DIENSTEN) expect(KETTING_AANBIEDERS.some((a) => a.dienst === d.id)).toBe(true);
  });

  it("praat alleen via https met de diensten, zonder / op het eind", () => {
    for (const d of KETTING_DIENSTEN) {
      expect(d.basis).toMatch(/^https:\/\/[^/]+\/.+[^/]$/);
      expect(d.aanmelden).toMatch(/^https:\/\//);
      expect(d.basis.includes("{account}")).toBe(d.accountNodig);
    }
  });

  it("geeft een denkend model ruimte en de rest niet", () => {
    for (const a of KETTING_AANBIEDERS) {
      const denkt = "reasoning_effort" in a.extra;
      expect(a.denkRuimte > 0).toBe(denkt);
    }
  });

  it("heeft geen diensten die we na onderzoek hebben afgewezen", () => {
    const hosts = KETTING_DIENSTEN.map((d) => new URL(d.basis.replace("{account}", "x")).host).join(" ");
    for (const nee of ["generativelanguage.googleapis.com", "openrouter.ai", "integrate.api.nvidia.com", "api.cohere", "models.github.ai", "api.cerebras.ai"]) {
      expect(hosts).not.toContain(nee);
    }
  });

  it("houdt de ID-controle, gesprekken en de warmhouder thuis", () => {
    for (const p of ["ai-warm", "kyc-review", "kyc-vision", "phone-agent", "chat-assist"]) {
      expect(BLIJFT_EIGEN.has(p)).toBe(true);
      expect(magViaKetting(p)).toBe(false);
    }
  });
});
