import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

// Een leeg scherm in de werker-app loopt nooit dood: er staat een volgende stap bij (een knop naar het zoeken van
// klussen of naar het afmaken van de aanmelding), de uitleg staat er één keer, en een nieuwe werker ziet geen
// kaarten met "€ 0,00" of vaktaal. Alle teksten in vijf talen.

const ROOT = process.cwd();
const TALEN = ["nl", "en", "pl", "ro", "uk"] as const;
const bron = (f: string) => readFileSync(path.join(ROOT, f), "utf8");

describe("Mijn klussen: een lege lijst", () => {
  const src = bron("components/app/MyKlussenView.tsx");

  it("heeft een knop naar het zoeken van klussen, met tekst uit de woordenlijst", () => {
    const leeg = src.slice(src.indexOf("function Empty("));
    expect(leeg).toContain('href="/dashboard/klussen"');
    expect(leeg).toContain("{w.emptyCta}");
  });

  it("toont de filter- en sorteerknoppen en het filterpaneel alleen als er klussen zijn", () => {
    const rij = src.indexOf("items.length > 0 && (");
    const filters = src.indexOf("aria-label={w.filters}");
    expect(rij).toBeGreaterThan(-1);
    expect(filters).toBeGreaterThan(rij);
    expect(src).toContain("{items.length > 0 && panel && (");
    expect(src).not.toMatch(/\{panel && \(/);
  });

  it("de knop staat in alle vijf de talen en is vertaald", () => {
    for (const t of TALEN) expect(FREELANCER_DICTS[t].work.emptyCta.trim().length, t).toBeGreaterThan(0);
    for (const t of ["en", "pl", "ro", "uk"] as const) expect(FREELANCER_DICTS[t].work.emptyCta, t).not.toBe(FREELANCER_DICTS.nl.work.emptyCta);
  });
});

describe("Uren invullen: de uitleg staat er één keer", () => {
  it("het lege vak herhaalt de uitleg uit de kop niet", () => {
    for (const t of TALEN) {
      const H = FREELANCER_DICTS[t].hoursPage;
      expect(H.emptyBody.trim().length, t).toBeGreaterThan(0);
      expect(H.emptyBody, t).not.toBe(H.subtitle);
      // de verwijzing naar het archief staat alleen in de kop
      expect(H.emptyBody, t).not.toContain("→");
    }
    expect(FREELANCER_DICTS.nl.hoursPage.emptyBody).not.toContain("Gearchiveerd");
  });

  it("het lege vak heeft een knop naar het zoeken van klussen", () => {
    const src = bron("app/dashboard/uren/page.tsx");
    expect(src).toContain('cta={{ href: "/dashboard/klussen", label: ft.work.emptyCta }}');
  });
});

describe("Administratie zonder profiel", () => {
  it("gewone woorden en een knop naar de startstappen", () => {
    const src = bron("app/dashboard/administratie/page.tsx");
    expect(src).toContain('cta={{ href: "/dashboard/klussen", label: t.leegKnop }}');
    const nl = FREELANCER_DICTS.nl.administratie;
    expect(`${nl.leegTitel} ${nl.leegTekst} ${nl.leegKnop}`.toLowerCase()).not.toContain("professional");
    for (const t of TALEN) expect(FREELANCER_DICTS[t].administratie.leegKnop.trim().length, t).toBeGreaterThan(0);
  });
});

describe("Verloning voor een nieuwe werker", () => {
  it("de kaarten met bedragen staan achter de eerste verloonde week", () => {
    const src = bron("app/dashboard/verloning/page.tsx");
    const poort = src.indexOf("{latest && (");
    expect(poort).toBeGreaterThan(-1);
    expect(src.indexOf("t.reservering}")).toBeGreaterThan(poort);
    expect(src.indexOf("t.bruto")).toBeGreaterThan(poort);
    // geen streepje meer als plaatshouder voor een bedrag
    expect(src).not.toContain('"—"');
    // het lege vak komt uit de lijst zelf
    expect(src).toContain("<PayslipList payslips={payslips} t={t} />");
  });

  it("de inleiding en het lege vak gebruiken geen vaktaal", () => {
    const nl = FREELANCER_DICTS.nl.loonstrook;
    for (const tekst of [nl.subPayroll, nl.leegTekst]) {
      expect(tekst).not.toMatch(/ABU|reservering|inhouding|brutoloon/i);
    }
    for (const t of ["en", "pl", "ro", "uk"] as const) {
      expect(FREELANCER_DICTS[t].loonstrook.subPayroll, t).not.toContain("ABU");
    }
  });
});
