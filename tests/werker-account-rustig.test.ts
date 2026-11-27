import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { netteHandleidingenUrl } from "@/lib/kennisbank/nette-url";

// Het scherm Account van de werker (/dashboard/account), sinds 21 nov 2026 in de opzet van de app van YoungOnes
// (eigenaar: "alles weg en in de stijl van YoungOnes"): geen "Ziek melden" zonder geplande of eerder aangenomen klus,
// de kaart met foto, naam, vijf sterren en de drie tellers staat er altijd (ook op nul, zoals in die app), en de oude
// kaarten zonder functie (betrouwbaarheidsring, level, uitnodigen, beveiligingskaart) zijn weg. De oproep om het profiel
// af te maken staat niet meer hier: Ontdekken toont daarvoor de turquoise kaart "Ga door met je profiel".
const bron = readFileSync(join(__dirname, "..", "app/dashboard/account/page.tsx"), "utf8");

describe("werker — scherm Account", () => {
  it("toont Ziek melden met een geplande of eerder aangenomen klus (ook tijdens een lopende klus), zonder extra vraag aan de database", () => {
    expect(bron).toContain("const heeftGeplandeKlus = overview.kpis.upcoming > 0;");
    // sinds ZEKERFLEX_UITZENDER = false (21 nov 2026) meldt een uitzendkracht zich ziek bij zijn uitzendbureau, niet bij ZekerFlex
    expect(bron).toContain("{isUitzend && ZEKERFLEX_UITZENDER && (heeftGeplandeKlus || matched > 0) && (");
    expect(bron).not.toContain("{isUitzend && heeftGeplandeKlus && (");
    expect(bron).not.toMatch(/\{isUitzend && \(\s*<div className="mb-4">\s*<ZiekMelden/);
  });

  it("toont foto, naam, de vijf sterren, het aantal beoordelingen en de drie tellers altijd (ook op nul, zoals YoungOnes)", () => {
    // 20 nov verborgen we sterren en tellers zolang alles nul was; die app toont ze altijd, dus die voorwaarde is weg
    expect(bron).not.toContain("nogNietsGedaan");
    const kaart = bron.indexOf("{/* Profile header");
    expect(kaart).toBeGreaterThan(-1);
    for (const stuk of ["card?.avatarUrl", "{card?.name ?? principal.email}", '"★★★★★".slice(0, stars)', "t.reviews(reviews.count)", "t.statsTitle", "<Stat value={matched}", "<Stat value={notCompleted}", "<Stat value={replacementsArranged}"]) {
      expect(bron.indexOf(stuk), stuk).toBeGreaterThan(kaart);
    }
    // de volgorde van die app: naam, sterren, beoordelingen, dan de tellers
    expect(bron.indexOf("{card?.name ?? principal.email}")).toBeLessThan(bron.indexOf('"★★★★★".slice(0, stars)'));
    expect(bron.indexOf('"★★★★★".slice(0, stars)')).toBeLessThan(bron.indexOf("t.reviews(reviews.count)"));
    expect(bron.indexOf("t.reviews(reviews.count)")).toBeLessThan(bron.indexOf("t.statsTitle"));
  });

  it("de oude kaarten zonder functie en de eigen kop zijn weg; de kop staat in de balk bovenaan", () => {
    for (const weg of ["ReliabilityRing", "LevelCard", "ReferralCard", "trust-card", "secureTitle", "finishProfile", "<PageHeader", "ZekerFlex · {principal.email}"]) {
      expect(bron, weg).not.toContain(weg);
    }
  });

  it("de rijen volgen de volgorde van die app: vraag, feedback, pushmeldingen, favorieten/verborgen, gegevens, account, kennisbank", () => {
    const plek = (s: string) => {
      const i = bron.indexOf(s);
      expect(i, s).toBeGreaterThan(-1);
      return i;
    };
    const volgorde = [
      "{ label: t.question, href: SUPPORT_CHAT }",
      "label: t.feedback",
      "{ label: t.favorites,",
      "{ label: t.hidden,",
      "{ label: t.personal,",
      '{ label: t.business, href: "/dashboard/fiscaal" }',
      "{ label: t.insurance,",
      "{ label: t.invoices,",
      "{ label: t.password,",
      // "Account verwijderen" is op 25 nov 2026 van dit scherm gehaald (eigenaar, zoals YoungOnes); /account-verwijderen blijft bestaan
      "{ label: t.kb,",
      "{ label: t.community,",
    ].map(plek);
    expect([...volgorde].sort((a, b) => a - b)).toEqual(volgorde);
    // de pushkaart staat tussen feedback en favorieten (in de JSX, na de lijst met rijen)
    expect(bron.indexOf("<PushToggle cardTexts={ft.accountDelen.push} />")).toBeLessThan(bron.indexOf("{GROEPEN.map("));
  });

  // 22 nov 2026 (gebruikersonderzoek): vier rijen naar dezelfde profielpagina werden er één, en de handleidingen staan er
  // niet op het kale serveradres (sslip.io)
  it("één rij naar Mijn gegevens, en de handleidingen alleen met een nette naam", () => {
    expect(bron.match(/href: "\/dashboard\/profiel"/g)).toHaveLength(1);
    for (const weg of ["{ label: t.address,", "{ label: t.experience,", "{ label: t.email,"]) expect(bron, weg).not.toContain(weg);
    expect(bron).toContain("netteHandleidingenUrl(`${outlinePubliekeUrl()}/`)");
    expect(netteHandleidingenUrl("https://kennis.37-97-226-24.sslip.io/")).toBeNull();
    expect(netteHandleidingenUrl("http://37.97.226.24/")).toBeNull();
    expect(netteHandleidingenUrl("")).toBeNull();
    expect(netteHandleidingenUrl("https://kennis.zekerflex.com/")).toBe("https://kennis.zekerflex.com/");
    expect(readFileSync(join(__dirname, "..", "app/dashboard/layout.tsx"), "utf8")).toContain("netteHandleidingenUrl(");
  });

  it("heeft geen regel ZekerFlex OS meer in de lijst van de werker", () => {
    expect(bron).not.toContain('label: "ZekerFlex OS"');
    expect(bron).not.toMatch(/href: "\/os"/);
  });
});
