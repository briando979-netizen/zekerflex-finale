import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";

// De kaarten op /werkgever/instellingen en het gebruikersmenu rechtsboven (eigenaar, 23 nov 2026: zoals bij YoungOnes). Vijf kaarten
// wezen naar de verkeerde plek: Contactinformatie en Klus-instellingen naar Bedrijfsprofiel, Kostenplaatsen naar Facturen, Labels naar
// Favorieten en Verwerkersovereenkomst naar de modelovereenkomsten (iets anders). Nu wijst elke kaart naar waar je het ook doet.

const ROOT = process.cwd();
const lees = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");

/** De regel van een kaart in de pagina, op zijn titelsleutel (`title: s.cXxxT`). */
function kaart(bron: string, titelSleutel: string): string {
  const regel = bron.split("\n").find((r) => r.includes(`title: s.${titelSleutel},`));
  if (!regel) throw new Error(`kaart ${titelSleutel} staat niet in de pagina`);
  return regel;
}

describe("de kaarten op /werkgever/instellingen wijzen naar de juiste plek", () => {
  const pagina = lees("app/werkgever/instellingen/page.tsx");

  it("Contactinformatie: het team (de contactpersoon bij een klus is nu een vestigingsmanager of beheerder)", () => {
    expect(kaart(pagina, "cContactT")).toContain('href: "/werkgever/team"');
    expect(kaart(pagina, "cContactT")).not.toContain("/werkgever/bedrijf");
  });

  it("Kostenplaatsen: de eigen pagina, niet meer Facturen", () => {
    expect(kaart(pagina, "cCostT")).toContain('href: "/werkgever/instellingen/kostenplaatsen"');
  });

  it("Labels voor favorieten: de groepen van favorieten", () => {
    expect(kaart(pagina, "cLabelsT")).toContain('href: "/werkgever/favorieten/pools"');
  });

  it("Klus-instellingen: de eigen pagina, niet meer Bedrijfsprofiel", () => {
    expect(kaart(pagina, "cShiftSettingsT")).toContain('href: "/werkgever/instellingen/klussen"');
  });

  it("Verwerkersovereenkomst: de openbare tekst, als gewone link; niet de modelovereenkomsten (iets anders)", () => {
    const k = kaart(pagina, "cDpaT");
    expect(k).toContain('href: "/verwerkersovereenkomst"');
    expect(k).toContain("gewoon: true");
    expect(pagina).not.toContain('href: "/werkgever/overeenkomsten"');
    expect(existsSync(path.join(ROOT, "app/(marketing)/verwerkersovereenkomst/page.tsx"))).toBe(true);
  });

  it("Factuurgegevens: het blok op Facturen, dat met het anker vanzelf openklapt", () => {
    expect(kaart(pagina, "cInvoiceT")).toContain('href: "/werkgever/facturen#factuurgegevens"');
    expect(lees("app/werkgever/facturen/page.tsx")).toContain('id="factuurgegevens"');
  });

  it("er is een kaart Notificaties, naar de mailvoorkeuren met een anker op de bedrijfspagina", () => {
    expect(kaart(pagina, "cNotifT")).toContain('href: "/werkgever/bedrijf#notificaties"');
    expect(lees("app/werkgever/bedrijf/page.tsx")).toContain('id="notificaties"');
    expect(nl.settings.cNotifT).toBe("Notificaties");
    expect(en.settings.cNotifT).toBe("Notifications");
  });

  it("de kaart Jouw bedrijfsprofiel heeft dezelfde stip als de zijbalk, volgens dezelfde regel", () => {
    expect(pagina).toContain("const hasCover = heeftOmslagfoto(extra);");
    expect(kaart(pagina, "cProfileT")).toContain("...(hasCover ? {} : { stip: true, stipTekst: d.shell.profileIncomplete })");
    expect(pagina).toContain("{c.stip && <span aria-hidden");
    expect(pagina).toContain("{c.stip && c.stipTekst && <span className=\"sr-only\"> ({c.stipTekst})</span>}");
  });

  it("wat al klopte blijft: profiel, beoordelingen, locaties, team, templates en het account", () => {
    expect(kaart(pagina, "cProfileT")).toContain('href: "/werkgever/bedrijf"');
    expect(kaart(pagina, "cReviewsT")).toContain('href: "/werkgever/reviews"');
    expect(kaart(pagina, "cLocationsT")).toContain('href: "/werkgever/locaties"');
    expect(kaart(pagina, "cUsersT")).toContain('href: "/werkgever/team"');
    expect(kaart(pagina, "cTemplatesT")).toContain('href: "/werkgever/templates"');
    expect(kaart(pagina, "cAccountT")).toContain('href: "/werkgever/account"');
  });

  it("de teksten van de kaarten zeggen wat de pagina doet (geen belofte die niet kan), in beide talen", () => {
    expect(nl.settings.cShiftSettingsS).toContain("heropenen");
    expect(nl.settings.cDpaS).not.toMatch(/teken de|ondertekenen/i);
    expect(en.settings.cDpaS).not.toMatch(/sign the|e-sign/i);
    for (const t of [nl.settings, en.settings]) {
      expect(t.cContactS).not.toMatch(/nieuwe toe|add new/i);
    }
  });
});

describe("het gebruikersmenu rechtsboven", () => {
  const shell = lees("components/app/EmployerShell.tsx");
  const menu = shell.slice(shell.indexOf("{userMenu && ("), shell.indexOf("</header>"));

  it("heeft Persoonlijke instellingen, Notificatievoorkeuren en Uitloggen, zoals bij YoungOnes", () => {
    expect(menu).toContain('href="/werkgever/account"');
    expect(menu).toContain("{t.shell.menuPersonal}");
    expect(menu).toContain('href="/werkgever/bedrijf#notificaties"');
    expect(menu).toContain("{t.shell.menuNotifications}");
    expect(menu).toContain("{t.shell.logout}");
    // de volgorde: eerst de twee nieuwe regels, uitloggen onderaan
    expect(menu.indexOf("menuPersonal")).toBeLessThan(menu.indexOf("menuNotifications"));
    expect(menu.indexOf("menuNotifications")).toBeLessThan(menu.indexOf("t.shell.logout"));
  });

  it("de werkersomgeving blijft voor wie ook werker is; Instellingen en Bedrijfsprofiel staan altijd in de zijbalk", () => {
    expect(menu).toContain("{canSwitchToFreelancer && (");
    expect(menu).toContain("{t.common.naarWebsite}");
    expect(menu).not.toContain("t.shell.menuSettings");
    expect(menu).not.toContain("t.shell.menuCompany");
  });

  it("elke regel is minstens 44 px hoog en sluit het menu bij een tik", () => {
    expect(shell).toContain('const menuRij = "flex min-h-11 items-center rounded-lg px-3 text-sm text-ink hover:bg-paper-soft";');
    expect(menu).toContain("className={menuRij}");
    expect(menu).toContain("flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-crit");
    expect(menu).toContain("onClick={() => setUserMenu(false)}");
  });

  it("de bestemmingen bestaan, en de teksten staan in beide talen", () => {
    expect(existsSync(path.join(ROOT, "app/werkgever/account/page.tsx"))).toBe(true);
    expect(existsSync(path.join(ROOT, "app/werkgever/bedrijf/page.tsx"))).toBe(true);
    expect(nl.shell.menuPersonal).toBe("Persoonlijke instellingen");
    expect(nl.shell.menuNotifications).toBe("Notificatievoorkeuren");
    expect(en.shell.menuPersonal).toBe("Personal settings");
    expect(en.shell.menuNotifications).toBe("Notification preferences");
  });
});
