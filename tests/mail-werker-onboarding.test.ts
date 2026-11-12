import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// De onboarding-mails aan werkers (welkom, ID geverifieerd, aanmelding compleet) in alle vijf de app-talen (12 nov 2026).
// Het Nederlands zelf wordt bewaakt door tests/mail-werker-nl.test.ts (golden-hashes).

vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zf.test" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { welcomeEmailT } from "@/lib/mail/werker/welkom";
import { idGeverifieerdEmailT } from "@/lib/mail/werker/id-geverifieerd";
import { aanmeldingCompleetEmailT } from "@/lib/mail/werker/aanmelding-compleet";
import { LOCALES } from "@/lib/i18n/config";
import { FOUTEN } from "@/lib/i18n/fouten";

const u = "https://zf.test";
const bron = (pad: string) => readFileSync(pad, "utf8").replace(/\r\n/g, "\n");
const nietNl = LOCALES.filter((t) => t !== "nl");
// kernzinnen die alleen in een Nederlandse mail horen te staan
const NL_ZINNEN = ["Volgende stap", "Vragen? Mail", "Je e-mailadres is bevestigd", "geverifieerd", "Je kunt vanaf nu", "Bedankt, je aanmelding", "Goed om te weten", "Maak een goede eerste indruk"];

describe("welkomstmail in vijf talen", () => {
  for (const taal of LOCALES) {
    it(`${taal}: onderwerp, tekst, html-taal en link`, () => {
      const m = welcomeEmailT("Anna Kowalska", "freelancer", u, "zzp", { ontwikkelingsnotitie: true }, taal);
      expect(m.subject.length).toBeGreaterThan(3);
      expect(m.text.length).toBeGreaterThan(50);
      expect(m.html).toContain(`<html lang="${taal}">`);
      expect(m.text).toContain(`${u}/login`);
      expect(m.html).toContain(`href="${u}/login"`);
      expect(m.text).toContain("support@zekerflex.com");
      expect(m.kind).toBe("welcome");
    });
  }
  it("geen Nederlandse kernzinnen meer in een andere taal", () => {
    for (const taal of nietNl) {
      const m = welcomeEmailT("Anna", "freelancer", u, "uitzendkracht", { ontwikkelingsnotitie: true }, taal);
      for (const zin of NL_ZINNEN) {
        expect(m.text, `${taal}: ${zin}`).not.toContain(zin);
        expect(m.html, `${taal}: ${zin}`).not.toContain(zin);
      }
      // de lijst met andere talen hoort alleen bij de Nederlandse mail
      expect(m.text).not.toContain("Українською:");
    }
  });
  it("de Nederlandse notitie houdt de lijst met andere talen", () => {
    const m = welcomeEmailT("Anna", "freelancer", u, "zzp", { ontwikkelingsnotitie: true }, "nl");
    expect(m.text).toContain("Polski:");
    expect(m.html).toContain("Română");
  });
  it("een bedrijf blijft Nederlands, ook met een andere taal", () => {
    const m = welcomeEmailT("Jan Bakker", "bedrijf", u, undefined, {}, "pl");
    expect(m.subject).toBe("Welkom bij ZekerFlex");
    expect(m.html).toContain('<html lang="nl">');
    expect(m.text).toContain("Volgende stap:");
  });
  it("schermt de naam af", () => {
    const m = welcomeEmailT("<img src=x onerror=alert(1)>", "freelancer", u, "zzp", {}, "uk");
    expect(m.html).not.toContain("<img src=x");
  });
});

describe("ID geverifieerd in vijf talen", () => {
  for (const taal of LOCALES) {
    for (const reageren of [true, false]) {
      it(`${taal} (kan reageren: ${reageren})`, () => {
        const m = idGeverifieerdEmailT("Anna Kowalska", `${u}/`, reageren, taal);
        expect(m.subject.length).toBeGreaterThan(3);
        expect(m.text.length).toBeGreaterThan(50);
        expect(m.html).toContain(`<html lang="${taal}">`);
        expect(m.text).toContain(`${u}/dashboard/eerste-indruk`);
        expect(m.html).toContain(`href="${u}/dashboard/eerste-indruk"`);
        expect(m.kind).toBe("onboarding");
        if (taal !== "nl") for (const zin of NL_ZINNEN) expect(m.text + m.html).not.toContain(zin);
      });
    }
  }
});

describe("aanmelding compleet in vijf talen", () => {
  for (const taal of LOCALES) {
    for (const soort of ["kan-reageren", "nog-iets", "id-in-controle"] as const) {
      it(`${taal} (${soort})`, () => {
        const m = aanmeldingCompleetEmailT({ fullName: "Anna Kowalska", appUrl: u, soort, reden: "REDEN-X" }, taal);
        expect(m.subject.length).toBeGreaterThan(3);
        expect(m.html).toContain(`<html lang="${taal}">`);
        expect(m.text).toContain(`${u}/dashboard/klussen`);
        expect(m.html).toContain(`href="${u}/dashboard/klussen"`);
        expect(m.kind).toBe("aanmelding-compleet");
        expect(m.text.includes("REDEN-X")).toBe(soort === "nog-iets");
        if (taal !== "nl") for (const zin of NL_ZINNEN) expect(m.text + m.html).not.toContain(zin);
      });
    }
  }
  it("zonder reden verwijst de mail naar de app", () => {
    const m = aanmeldingCompleetEmailT({ fullName: "Anna", appUrl: u, soort: "nog-iets", reden: null }, "en");
    expect(m.text).toContain("open the app");
  });
});

describe("aanroepers", () => {
  it("kiezen de taal met mailTaalVoorWerker", () => {
    for (const pad of ["lib/onboarding/id-geverifieerd.ts", "lib/onboarding/aanmelding-compleet.ts"]) {
      const s = bron(pad);
      expect(s, pad).toContain("mailTaalVoorWerker(userId)");
    }
    const s = bron("lib/auth/email-verify.ts");
    const welkom = s.slice(s.indexOf("export async function sendWelcome("));
    expect(welkom).toContain("mailTaalVoorWerker(user.id)");
    expect(welkom).toContain("welcomeEmailT(");
  });
  it("vertalen de reden van 'nog iets' via FOUTEN en de sleutel", () => {
    const s = bron("lib/onboarding/aanmelding-compleet.ts");
    expect(s).toContain("FOUTEN[reageren.sleutel]?.[taal]");
    expect(bron("lib/onboarding/kan-reageren.ts")).toContain("sleutel");
    // elke sleutel van eligibility heeft een vertaling in alle talen
    for (const k of ["elig.uitzendGegevens", "elig.contract", "elig.kvk", "elig.iban"]) {
      for (const taal of LOCALES) expect(FOUTEN[k]?.[taal]?.length ?? 0, `${k} ${taal}`).toBeGreaterThan(5);
    }
  });
});
