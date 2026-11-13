import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { klussenKaarten, type KlussenKaartFeiten } from "@/lib/onboarding/klussen-kaarten";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

// De kaart "Meldingen aanzetten" bovenaan /dashboard/klussen (13 nov 2026, ja van de eigenaar) en de regel: hooguit één
// aansporing bovenaan. De pushkaart vervangt "Maak een goede eerste indruk" als alleen meldingen nog openstaat; de tipkaart
// ("Ken je een bedrijf dat mensen zoekt?") gaat dan naar onderen.

const basis: KlussenKaartFeiten = {
  geverifieerd: true,
  eersteIndruk: { open: 1, heeftMeldingen: false },
  netOpgeslagen: false,
  tipPlek: "boven",
};
const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

describe("welke kaart bovenaan staat", () => {
  it("geverifieerd en alleen meldingen open: de pushkaart bovenaan, de tip onderaan, geen kaart 'eerste indruk' ernaast", () => {
    expect(klussenKaarten(basis)).toEqual({ push: true, eersteIndruk: false, tip: "onder" });
    expect(klussenKaarten({ ...basis, tipPlek: "onder" })).toEqual({ push: true, eersteIndruk: false, tip: "onder" });
  });

  it("zonder pushkaart blijft de tip waar hij uit zichzelf staat", () => {
    expect(klussenKaarten({ ...basis, eersteIndruk: { open: 0, heeftMeldingen: true } })).toEqual({ push: false, eersteIndruk: false, tip: "boven" });
    expect(klussenKaarten({ ...basis, eersteIndruk: { open: 0, heeftMeldingen: true }, tipPlek: "onder" }).tip).toBe("onder");
  });

  it("nog niet geverifieerd: geen pushkaart, de kaart 'eerste indruk' blijft", () => {
    expect(klussenKaarten({ ...basis, geverifieerd: false })).toEqual({ push: false, eersteIndruk: true, tip: "boven" });
  });

  it("staan foto of werkervaring nog open, dan eerst 'eerste indruk' (meldingen is daar de laatste stap)", () => {
    expect(klussenKaarten({ ...basis, eersteIndruk: { open: 2, heeftMeldingen: false } })).toEqual({ push: false, eersteIndruk: true, tip: "boven" });
  });

  it("meldingen komen al aan, of het kan hier niet (iPhone-app, geen web-push): geen pushkaart", () => {
    expect(klussenKaarten({ ...basis, eersteIndruk: { open: 1, heeftMeldingen: true } }).push).toBe(false);
  });

  it("tijdens de onboarding (geen stand) en net na 'Opslaan' (?eerste=1): geen pushkaart en geen kaart 'eerste indruk'", () => {
    expect(klussenKaarten({ ...basis, eersteIndruk: null })).toEqual({ push: false, eersteIndruk: false, tip: "boven" });
    expect(klussenKaarten({ ...basis, netOpgeslagen: true })).toEqual({ push: false, eersteIndruk: false, tip: "boven" });
  });
});

describe("de pagina en de knop", () => {
  const pagina = lees("app/dashboard/klussen/page.tsx");
  const knop = lees("components/app/PushToggle.tsx");

  it("de pagina beslist met klussenKaarten: de pushkaart staat boven de tip (als die bovenaan mag) en boven de lijst", () => {
    expect(pagina).toContain("klussenKaarten(");
    expect(pagina).toContain('const tipBoven = kaarten.tip === "boven";');
    expect(pagina).toContain("{kaarten.eersteIndruk && eersteIndruk && (");
    const push = pagina.indexOf("{kaarten.push && <PushToggle");
    const tipBoven = pagina.indexOf("{tipBoven && <TipBedrijfKaart />}");
    const lijst = pagina.indexOf("<MarketplaceView");
    const tipOnder = pagina.indexOf("{!tipBoven && (");
    expect(push).toBeGreaterThan(-1);
    expect(push).toBeLessThan(tipBoven);
    expect(tipBoven).toBeLessThan(lijst);
    expect(lijst).toBeLessThan(tipOnder);
  });

  it("de bestaande banner met de meetcodes, geen nieuwe pushlogica; niet in de iPhone-app", () => {
    expect(pagina).toContain('<PushToggle variant="banner" texts={t.pushBanner} track={{ aan: "push-kaart-aan", weg: "push-kaart-weg" }} />');
    expect(knop).toContain("data-track={track?.aan}");
    expect(knop).toContain("data-track={track?.weg}");
    expect(knop).toContain("if (ios !== false) return null;");
    // wegklikken: per apparaat, en na 14 dagen terug (bannerWeerTonen)
    expect(knop).toContain("bannerWeerTonen(window.localStorage.getItem(DISMISS_KEY), Date.now())");
  });
});

describe("de teksten in vijf talen", () => {
  it("elke taal heeft de bannerteksten, niets is leeg, en de andere talen zijn vertaald", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      for (const s of ["aanzetten", "ios", "knop", "bezig", "nietNu"] as const) expect(d.pushBanner[s].length, `${taal} ${s}`).toBeGreaterThan(0);
    }
    for (const taal of ["en", "pl", "ro", "uk"] as const) {
      expect(FREELANCER_DICTS[taal].pushBanner.aanzetten, taal).not.toBe(FREELANCER_DICTS.nl.pushBanner.aanzetten);
    }
  });
});
