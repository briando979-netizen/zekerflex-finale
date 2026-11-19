import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STANDAARD_PRIJZEN, prijsTekst } from "@/lib/advertentie/regels";
import { logoBoom, passend } from "@/lib/logo/ontwerp";
import { BRANCHES, LOGOS, SFEREN, VARIANTEN, VARIANT_IDS, VOORBEELD, initialen, logoBesluit, logoVrij, tweeRegels, valideerLogoAanvraag, valideerLogoInvoer, type Logo, type LogoInvoer, type LogoNr } from "@/lib/logo/regels";
import { LOGO_VOORBEELDEN } from "@/lib/logo/voorbeelden";
import { AANBOD } from "@/lib/marketing/aanbod";

// Logo maker (/logo-maker): de regels in lib/logo/regels.ts. Net als bij de advertentie op maat is de kern de
// watermerkbeslissing: de schone, grote bestanden mogen de browser nooit bereiken vóór vrijgave.

const ROOT = join(__dirname, "..");
const logo = (status: Logo["status"], gekozen?: LogoNr): Pick<Logo, "status" | "aanvraag"> => ({ status, ...(gekozen ? { aanvraag: { logo: gekozen, naam: "Test", email: "test@voorbeeld.test", op: "2026-11-19T10:00:00.000Z" } } : {}) });
const klein = { watermerk: true, variant: "kleur-wit", breedte: VOORBEELD.breedte, hoogte: VOORBEELD.hoogte };

describe("het logo: watermerk ja of nee, welke variant en welke maat", () => {
  it("niet vrijgegeven: altijd klein, in kleur op wit en met watermerk, wat er ook gevraagd wordt", () => {
    for (const status of ["gemaakt", "aangevraagd"] as const) {
      for (const variant of VARIANT_IDS) {
        for (const l of LOGOS) expect(logoBesluit({ logo: logo(status, status === "aangevraagd" ? l.nr : undefined), nr: l.nr, beheerder: false, variant })).toEqual(klein);
      }
    }
  });

  it("vrijgegeven: alleen het gekozen logo is schoon, in elke variant op volle maat", () => {
    const vrij = logo("vrijgegeven", 4);
    expect(logoBesluit({ logo: vrij, nr: 4, beheerder: false, variant: "wit" })).toEqual({ watermerk: false, variant: "wit", breedte: 2400, hoogte: 1800 });
    expect(logoBesluit({ logo: vrij, nr: 4, beheerder: false, variant: "icoon" })).toEqual({ watermerk: false, variant: "icoon", breedte: 1024, hoogte: 1024 });
    for (const nr of [1, 2, 3, 5, 6] as LogoNr[]) expect(logoBesluit({ logo: vrij, nr, beheerder: false, variant: "kleur" })).toEqual(klein);
    expect(LOGOS.filter((l) => logoVrij(vrij, l.nr)).map((l) => l.nr)).toEqual([4]);
    expect(logoVrij(logo("vrijgegeven"), 1)).toBe(false);
  });

  it("alleen een beheerder ziet de schone versie eerder", () => {
    expect(logoBesluit({ logo: logo("gemaakt"), nr: 2, beheerder: true, variant: "zwart" })).toEqual({ watermerk: false, variant: "zwart", breedte: 2400, hoogte: 1800 });
  });

  it("de beeldroute beslist alleen via logoBesluit en bewaart een voorbeeld nergens", () => {
    const route = readFileSync(join(ROOT, "app", "api", "logo-maker", "[id]", "beeld", "route.ts"), "utf8");
    expect(route).toContain("logoBesluit({ logo, nr, beheerder, variant })");
    expect(route).toContain("private, no-store");
    expect(route).toContain('hasRole(principal, "PLATFORM_ADMIN")');
    expect(route).not.toMatch(/logger\.\w+\([^)]*(request\.url|\bid\b)/);
  });

  it("een boom met watermerk heeft de watermerklaag, een schone niet; doorzichtige varianten hebben geen achtergrond", () => {
    const invoer: LogoInvoer = { naam: "Bakkerij De Korenbloem", branche: "winkel", kleur: "oranje", sfeer: "strak" };
    const tekst = (b: unknown) => JSON.stringify(b);
    expect(tekst(logoBoom(1, invoer, "kleur-wit", 480, true).boom)).toContain("VOORBEELD");
    expect(tekst(logoBoom(1, invoer, "kleur-wit", 480, false).boom)).not.toContain("VOORBEELD");
    expect(logoBoom(1, invoer, "kleur-wit", 480, false)).toMatchObject({ breedte: 480, hoogte: 360 });
    expect(logoBoom(1, invoer, "icoon", 512, false)).toMatchObject({ breedte: 512, hoogte: 512 });
    const stijl = (v: "kleur-wit" | "kleur" | "wit" | "zwart") => (logoBoom(2, invoer, v, 480, false).boom.props as { style: { background?: string } }).style.background;
    expect(stijl("kleur-wit")).toBe("#FFFFFF");
    for (const v of ["kleur", "wit", "zwart"] as const) expect(stijl(v), v).toBeUndefined();
  });
});

describe("de invoer", () => {
  it("maakt de naam schoon, vult standaarden in en laat lege velden weg", () => {
    expect(valideerLogoInvoer({ naam: " <b>Café Zoë</b> ", slogan: "", branche: "horeca", kleur: "rood", sfeer: "klassiek" })).toEqual({ ok: true, waarde: { naam: "Café Zoë", branche: "horeca", kleur: "rood", sfeer: "klassiek" } });
    expect(valideerLogoInvoer({ naam: "Jo", branche: "constructor", kleur: "roze", sfeer: "wild", brancheTekst: "Hondenuitlaat" })).toEqual({ ok: true, waarde: { naam: "Jo", branche: "anders", brancheTekst: "Hondenuitlaat", kleur: "groen", sfeer: "strak" } });
    expect(valideerLogoInvoer({ naam: "J" })).toMatchObject({ ok: false, veld: "naam" });
    expect(valideerLogoInvoer({ naam: "&&&" })).toMatchObject({ ok: false, veld: "naam" });
    expect(valideerLogoInvoer(null)).toMatchObject({ ok: false });
    const lang = valideerLogoInvoer({ naam: "x".repeat(200) });
    expect(lang.ok && lang.waarde.naam.length).toBe(40);
  });

  it("valideert de aanvraag", () => {
    expect(valideerLogoAanvraag({ logo: 6, naam: "Jan Jansen", email: "jan@voorbeeld.test" })).toEqual({ ok: true, waarde: { logo: 6, naam: "Jan Jansen", email: "jan@voorbeeld.test" } });
    expect(valideerLogoAanvraag({ logo: 7, naam: "Jan", email: "jan@voorbeeld.test" })).toMatchObject({ ok: false, veld: "logo" });
    expect(valideerLogoAanvraag({ logo: 1.5, naam: "Jan", email: "jan@voorbeeld.test" })).toMatchObject({ ok: false, veld: "logo" });
    expect(valideerLogoAanvraag({ logo: 1, naam: "Jan", email: "geen" })).toMatchObject({ ok: false, veld: "email" });
  });
});

describe("de letters van een naam", () => {
  it("initialen: de eerste letters van de twee belangrijkste woorden", () => {
    expect(initialen("Bakkerij De Korenbloem")).toBe("BK");
    expect(initialen("Jansen & Zn. 24/7")).toBe("JZ");
    expect(initialen("Noor's Kapsalon")).toBe("NK");
    expect(initialen("Café Zoë")).toBe("CZ");
    expect(initialen("Bas")).toBe("B");
    expect(initialen("de van")).toBe("DV");
    expect(initialen("écluse élan")).toBe("ÉÉ");
    expect(initialen("24 Uur Service")).toBe("2U");
    expect(initialen("'t Hoekje")).toBe("H");
  });

  it("twee regels: zo gelijk mogelijk verdeeld, één woord blijft één regel", () => {
    expect(tweeRegels("Bakkerij De Korenbloem")).toEqual(["Bakkerij De", "Korenbloem"]);
    expect(tweeRegels("Schoonmaakbedrijf Van der Westhuizen")).toEqual(["Schoonmaakbedrijf", "Van der Westhuizen"]);
    expect(tweeRegels("Bas")).toEqual(["Bas"]);
  });

  it("de letter past altijd op één regel in de breedte", () => {
    expect(passend("Jo", 1000, 300, 0.52)).toBe(300);
    const lang = "Schoonmaakbedrijf Van der Westhuizen & Zn";
    expect(passend(lang, 1000, 300, 0.52) * lang.length * 0.52).toBeLessThanOrEqual(1000);
  });
});

describe("prijs, aanbod, voorbeelden en lettertypes", () => {
  it("de prijs komt uit dezelfde bron als de advertentie; de pagina's verzinnen geen eigen bedrag", () => {
    expect(prijsTekst(STANDAARD_PRIJZEN, "logo")).toBe("\u{20AC} 49 excl. btw");
    expect(AANBOD.find((a) => a.slug === "logo-maker")).toMatchObject({ pijler: "online", pagina: "/logo-maker", status: "beschikbaar", prijs: "\u{20AC} 49 excl. btw, je ziet eerst het voorbeeld" });
    for (const pad of [["app", "(marketing)", "logo-maker", "page.tsx"], ["components", "marketing", "logo", "LogoResultaat.tsx"], ["components", "marketing", "logo", "LogoFormulier.tsx"]]) {
      const bron = readFileSync(join(ROOT, ...pad), "utf8").replace(/\/\/.*$/gm, "");
      expect(bron, pad.join("/")).not.toMatch(/\u{20AC}\s?\d/u);
    }
  });

  it("de pagina belooft geen vectorbestand, geen uniek logo en geen merkbescherming", () => {
    const pagina = readFileSync(join(ROOT, "app", "(marketing)", "logo-maker", "page.tsx"), "utf8");
    expect(pagina).toContain("BOIP");
    expect(pagina).toContain("Dat beloven we niet");
    expect(pagina).not.toMatch(/https?:\/\/[^"'\s]*boip/i);
    expect(Object.keys(VARIANTEN)).toEqual(["kleur-wit", "kleur", "wit", "zwart", "icoon"]);
  });

  it("de voorbeelden zijn zes verschillende soorten logo en gebruiken bestaande keuzes", () => {
    expect(LOGO_VOORBEELDEN.map((v) => v.logo).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    for (const v of LOGO_VOORBEELDEN) {
      expect(valideerLogoInvoer(v.invoer)).toEqual({ ok: true, waarde: v.invoer });
      expect(BRANCHES.some((b) => b.id === v.invoer.branche)).toBe(true);
      expect(SFEREN.some((s) => s.id === v.invoer.sfeer)).toBe(true);
    }
  });

  it("elk logo, elke sfeer en elke soort bedrijf geeft een boom (geen ontbrekende tak)", () => {
    for (const s of SFEREN) for (const b of BRANCHES) for (const l of LOGOS) for (const v of VARIANT_IDS) expect(() => logoBoom(l.nr, { naam: "Jansen & Zn.", slogan: "Sinds jaar en dag", branche: b.id, kleur: "blauw", sfeer: s.id }, v, 240, false)).not.toThrow();
  });

  it("het extra lettertype staat in de map, met bron en licentie", () => {
    const map = join(ROOT, "public", "fonts", "advertentie");
    expect(existsSync(join(map, "Anton-Regular.ttf"))).toBe(true);
    expect(readFileSync(join(map, "README.txt"), "utf8")).toContain("Anton-Regular.ttf");
  });
});
