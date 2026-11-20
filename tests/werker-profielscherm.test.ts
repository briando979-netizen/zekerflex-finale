import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initials } from "@/components/chat/shared";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { naamInitialen } from "@/lib/naam/initialen";

// Het profielscherm van de werker (/dashboard/profiel), 20 nov 2026:
// - het heette "Account", net als /dashboard/account, maar is een ander scherm → een eigen naam;
// - "Identiteit (KYC)" en "Niet gestart" waren vaktaal;
// - het rondje toonde "R(" bij de naam "Rondgang (controle)";
// - een nieuwe werker zag vijf lege sterren en drie nullen.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("naamInitialen", () => {
  it("gewone namen blijven zoals ze waren", () => {
    expect(naamInitialen("Jan de Vries")).toBe("JD");
    expect(naamInitialen("  shalomi ")).toBe("S");
    expect(naamInitialen("anna   maria jansen")).toBe("AM");
    expect(naamInitialen("Zoë Élan")).toBe("ZÉ");
    expect(naamInitialen("Олена Шевченко")).toBe("ОШ");
  });

  it("alleen letters: geen haakje, streepje of ander teken in het rondje", () => {
    expect(naamInitialen("Rondgang (controle)")).toBe("RC");
    expect(naamInitialen("(test) Piet")).toBe("TP");
    expect(naamInitialen("Jan - Peter")).toBe("JP");
    expect(naamInitialen("Jansen & Zn.")).toBe("JZ");
    expect(naamInitialen("'t Hoekje")).toBe("TH");
    expect(naamInitialen("Piet (2)")).toBe("P");
  });

  it("zonder letters: een cijfer, anders leeg; nooit een fout", () => {
    expect(naamInitialen("24/7")).toBe("2");
    expect(naamInitialen("( )")).toBe("");
    expect(naamInitialen("")).toBe("");
    expect(naamInitialen(null)).toBe("");
    expect(naamInitialen(undefined)).toBe("");
  });

  it("de chat gebruikt hetzelfde hulpje", () => {
    expect(initials("Rondgang (controle)")).toBe("RC");
    expect(initials("Jan de Vries")).toBe("JD");
  });
});

describe("/dashboard/profiel", () => {
  const pagina = lees("app/dashboard/profiel/page.tsx");

  it("heeft een eigen naam, in alle vijf talen een andere dan het accountscherm", () => {
    expect(FREELANCER_DICTS.nl.profiel.titel).toBe("Mijn gegevens");
    const oud: Record<string, string> = { nl: "Account", en: "Account", pl: "Konto", ro: "Cont", uk: "Акаунт" };
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      expect(d.profiel.titel.length, taal).toBeGreaterThan(3);
      expect(d.profiel.titel, taal).not.toBe(oud[taal]);
    }
    expect(pagina).toContain("title={t.titel}");
  });

  it("de identiteit staat er in gewone woorden, zonder 'KYC'", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      expect(d.profiel.kyc, taal).not.toMatch(/KYC/i);
    }
    expect(FREELANCER_DICTS.nl.profiel.kyc).toBe("Identiteit");
    expect(FREELANCER_DICTS.nl.profiel.nietGestart).toBe("Nog niet gecontroleerd");
  });

  it("de initialen komen uit het gedeelde hulpje, ook bij de fotoknop", () => {
    expect(pagina).toContain("naamInitialen(name)");
    expect(pagina).not.toContain("p[0]?.toUpperCase()");
    const upload = lees("components/app/AvatarUpload.tsx");
    expect(upload).toContain("naamInitialen(name)");
    expect(upload).not.toContain("p[0]?.toUpperCase()");
  });

  it("sterren en tellers staan er pas als er iets te tellen valt", () => {
    expect(pagina).toMatch(/const nogNietsGedaan =\s*stats\.reviews\.count === 0 && stats\.matchedShifts === 0 && stats\.notCompleted === 0 && stats\.replacementsArranged === 0;/);
    // zowel de sterrenregel als het blok met de drie tellers hangt aan die voorwaarde
    expect(pagina.split("{!nogNietsGedaan && (").length - 1).toBe(2);
    const tellers = pagina.indexOf("{t.zesMaanden}");
    const voorwaarde = pagina.lastIndexOf("{!nogNietsGedaan && (", tellers);
    expect(voorwaarde).toBeGreaterThan(pagina.indexOf("★★★★★"));
  });
});
