import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";
import { naamInitialen } from "@/lib/naam/initialen";

// De bovenbalk van het bedrijven-dashboard (components/app/EmployerShell.tsx), 20 nov 2026:
// - een nieuw bedrijf zag vijf grijze sterren met "(0 reviews)" naast zijn naam;
// - "reviews" stond in het Nederlands als Engels woord;
// - het rondje toonde "R(" bij de naam "Rondgang (controle)".

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("bovenbalk van het bedrijf: sterren", () => {
  const shell = lees("components/app/EmployerShell.tsx");

  it("toont de sterren en het aantal pas vanaf de eerste beoordeling", () => {
    expect(shell).toContain("{rating && rating.count > 0 && (");
    expect(shell).not.toContain("t.shell.reviewsZero");
  });

  it("zegt in het Nederlands 'beoordelingen', in het Engels 'reviews'", () => {
    expect(nl.shell.reviewsCount).toBe("{avg} · {n} beoordelingen");
    expect(nl.shell.reviewsCountOne).toBe("{avg} · {n} beoordeling");
    for (const tekst of [nl.shell.reviewsZero, nl.shell.reviewsCount, nl.shell.reviewsCountOne, nl.shell.reviewsTitle]) {
      expect(tekst.toLowerCase()).not.toContain("review");
    }
    expect(en.shell.reviewsCount).toBe("{avg} · {n} reviews");
    expect(en.shell.reviewsCountOne).toBe("{avg} · {n} review");
  });
});

describe("initialen in de schillen", () => {
  const BESTANDEN = ["components/app/EmployerShell.tsx", "components/app/AppShell.tsx", "components/app/RecentMessagesPanel.tsx"];

  it("gebruiken het gedeelde hulpje, geen eigen kopie van de oude regel", () => {
    for (const f of BESTANDEN) {
      const bron = lees(f);
      expect(bron, f).toContain('import { naamInitialen } from "@/lib/naam/initialen"');
      expect(bron, f).toContain("naamInitialen(");
      expect(bron, f).not.toContain("p[0]?.toUpperCase()");
      expect(bron, f).not.toMatch(/\binitials\(/);
    }
  });

  it("geen haakje in het rondje; gewone namen blijven gelijk", () => {
    expect(naamInitialen("Rondgang (controle)")).toBe("RC");
    expect(naamInitialen("Jan de Vries")).toBe("JD");
    expect(naamInitialen("Bakkerij Jansen")).toBe("BJ");
    expect(naamInitialen("shalomi")).toBe("S");
  });
});
