import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCHERM_TITEL_SLEUTELS, schermTitelSleutel } from "@/lib/werker/schermtitel";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

// De balk bovenaan de werker-app toonde "Vind jouw klus" op elk scherm buiten de balk onderaan
// (Verificatie, Profiel, Uitbetalingen, Beschikbaarheid, Administratie, Hulp). Nu heeft elk scherm
// zijn eigen naam, in vijf talen; een onbekend scherm krijgt een neutrale titel.
// En de paginakoppen: overal dezelfde (PageHeader: gewone letters, groene streep).

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("de titel bovenaan volgt het scherm", () => {
  it("elk scherm uit de melding heeft zijn eigen naam", () => {
    expect(schermTitelSleutel("/dashboard/verificatie")).toBe("verificatie");
    expect(schermTitelSleutel("/dashboard/profiel")).toBe("profiel");
    expect(schermTitelSleutel("/dashboard/uitbetalingen")).toBe("uitbetalingen");
    expect(schermTitelSleutel("/dashboard/verloning")).toBe("verloning");
    expect(schermTitelSleutel("/dashboard/beschikbaarheid")).toBe("beschikbaarheid");
    expect(schermTitelSleutel("/dashboard/administratie")).toBe("administratie");
    expect(schermTitelSleutel("/dashboard/hulp")).toBe("hulp");
  });

  it("onderliggende adressen horen bij hun scherm; de twee incheckadressen delen een naam", () => {
    expect(schermTitelSleutel("/dashboard/inchecken/abc123")).toBe("inchecken");
    expect(schermTitelSleutel("/dashboard/incheck")).toBe("inchecken");
    expect(schermTitelSleutel("/dashboard/agenda-koppeling")).toBe("agenda");
    expect(schermTitelSleutel("/dashboard/hulp/")).toBe("hulp");
  });

  it("een onbekend scherm krijgt de neutrale titel, nooit die van een ander scherm", () => {
    for (const p of ["/dashboard/bestaat-niet", "/dashboard", "/", "", "/werkgever/hulp", "/dashboard/constructor", "/dashboard/toString"]) {
      expect(schermTitelSleutel(p), p).toBe("overig");
    }
  });

  it("alle vijf talen hebben elke naam, en geen enkele is 'Vind jouw klus'", () => {
    for (const [taal, dict] of Object.entries(FREELANCER_DICTS)) {
      for (const s of SCHERM_TITEL_SLEUTELS) {
        const naam = dict.schermTitel[s];
        expect(naam.length, `${taal}.${s}`).toBeGreaterThan(1);
        expect(naam, `${taal}.${s}`).not.toBe(dict.nav.findJob);
      }
      expect(Object.keys(dict.schermTitel).sort(), taal).toEqual([...SCHERM_TITEL_SLEUTELS].sort());
    }
    expect(FREELANCER_DICTS.nl.schermTitel.hulp).toBe("Hulp");
    expect(FREELANCER_DICTS.nl.schermTitel.overig).toBe("ZekerFlex");
  });

  it("de shell gebruikt de regel alleen buiten de balk onderaan; de regel zelf is puur", () => {
    const shell = bron("components/app/FreelancerShell.tsx");
    expect(shell).toContain("ft.schermTitel[schermTitelSleutel(pathname)]");
    expect(shell).toContain("ft.nav.findJob");
    expect(bron("lib/werker/schermtitel.ts")).not.toMatch(/^import /m);
  });
});

describe("één kopstijl in de werker-app", () => {
  // Mijn klussen (app/dashboard/diensten) heeft sinds 21 nov geen eigen kop meer: de naam staat in de balk bovenaan
  // en de tabs beginnen meteen, zoals in de app van YoungOnes.
  const SCHERMEN = [
    "app/dashboard/klussen/page.tsx",
    "app/dashboard/account/page.tsx",
    "app/dashboard/account/beveiliging/page.tsx",
    "app/dashboard/account/passkeys/page.tsx",
    "app/dashboard/account/verborgen/page.tsx",
    "app/dashboard/account/verwijderen/page.tsx",
    "app/dashboard/certificaten/page.tsx",
    "app/dashboard/favorieten/page.tsx",
    "app/dashboard/incheck/page.tsx",
    "app/dashboard/introduceren/page.tsx",
    "app/dashboard/wifi/page.tsx",
  ];

  it("de schermen die een eigen kop in hoofdletters hadden, gebruiken nu de gedeelde kop", () => {
    for (const f of SCHERMEN) {
      const s = bron(f);
      expect(s, f).toContain("<PageHeader");
      expect(s, f).not.toMatch(/<h1 className="[^"]*uppercase/);
      expect(s, f).not.toContain("from-crit to-crit/40");
    }
  });

  it("de gedeelde kop is gewone letters met de groene streep; de balk bovenaan heeft dezelfde streep", () => {
    const kop = bron("components/app/ui.tsx");
    const h1 = kop.match(/<h1 className="([^"]*)"/)?.[1] ?? "";
    expect(h1).toContain("font-display");
    expect(h1).not.toContain("uppercase");
    expect(kop).toContain("from-brand-500 to-brand-mint");
    const shell = bron("components/app/FreelancerShell.tsx");
    expect(shell).toContain("from-brand-500 to-brand-mint");
    expect(shell).not.toContain("from-crit");
  });
});
