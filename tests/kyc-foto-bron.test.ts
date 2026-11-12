import { describe, expect, it } from "vitest";
import { fotoBron, fotoBronTekst, isLiveBron } from "@/lib/kyc/foto-bron";
import { idControleWeergave } from "@/lib/admin/kyc-weergave";

// Live camera of bestandskeuze per ID-foto (12 nov 2026): de live camera noemt een foto kaart-<tijd>.jpg of
// ovaal-<tijd>.jpg (components/app/IdScan.tsx); alles anders kwam uit de bestandskeuze.

describe("fotoBron", () => {
  it("herkent de namen van de live camera, en niets anders", () => {
    expect(fotoBron("kaart-1762956000000.jpg")).toBe("live");
    expect(fotoBron("ovaal-1762956000000.jpg")).toBe("live");
    for (const naam of ["IMG_1234.jpg", "kaart.jpg", "kaart-12.jpg", "mijn-kaart-1762956000000.jpg", "ovaal-1762956000000.png", "", null, undefined]) {
      expect(fotoBron(naam), String(naam)).toBe("bestand");
    }
  });

  it("vanzelf of met de knop (sinds 12 nov: <vorm>-auto-<tijd> en <vorm>-knop-<tijd>)", () => {
    expect(fotoBron("kaart-auto-1762956000000.jpg")).toBe("live-auto");
    expect(fotoBron("ovaal-auto-1762956000000.jpg")).toBe("live-auto");
    expect(fotoBron("kaart-knop-1762956000000.jpg")).toBe("live-knop");
    expect(fotoBron("OVAAL-KNOP-1762956000000.JPG")).toBe("live-knop");
    for (const naam of ["kaart-hand-1762956000000.jpg", "kaart-auto.jpg", "kaart-auto-12.jpg", "x-kaart-auto-1762956000000.jpg"]) {
      expect(fotoBron(naam), naam).toBe("bestand");
    }
    expect(["live", "live-auto", "live-knop"].every(isLiveBron)).toBe(true);
    expect(isLiveBron("bestand")).toBe(false);
  });

  it("de tekst noemt vanzelf of knop per vak", () => {
    expect(fotoBronTekst({ front: "live-auto", back: "live-auto", selfie: "live-auto" })).toBe("alles van de live camera (vanzelf)");
    expect(fotoBronTekst({ front: "live-auto", back: "live-knop", selfie: "bestand" })).toBe("voorkant live (vanzelf), achterkant live (knop), selfie uit bestand");
  });

  it("de tekst voor Beheer: alles live, alles uit bestand, of per vak", () => {
    expect(fotoBronTekst({ front: "live", back: "live", selfie: "live", selfie2: "live" })).toBe("alles van de live camera");
    expect(fotoBronTekst({ front: "bestand", back: "bestand", selfie: "bestand" })).toBe("alles uit de bestandskeuze (zelf gekozen)");
    expect(fotoBronTekst({ front: "live", back: "bestand", selfie: "live" })).toBe("voorkant live, achterkant uit bestand, selfie live");
    expect(fotoBronTekst(null)).toBeNull();
    expect(fotoBronTekst({ front: "vreemd" })).toBeNull();
  });

  it("Beheer leest het uit rawPayload.bron; een oudere controle zonder bron geeft niets", () => {
    expect(idControleWeergave("AI_LOCAL", { bron: { front: "live", back: "live", selfie: "live" } }).fotoBron).toBe("alles van de live camera");
    expect(idControleWeergave("AI_LOCAL", {}).fotoBron).toBeNull();
  });
});
