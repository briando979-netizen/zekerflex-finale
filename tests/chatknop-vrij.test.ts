import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHATKNOP, CHATKNOP_VELDEN, CHATKNOP_VRIJ, TERUG_NA_MS, VELDEN_SELECTOR, raaktChatknop, wijktChatknop } from "@/lib/marketing/chatknop-vrij";

// 22 nov 2026 (gebruikersonderzoek B04b-04): op /klus-plaatsen lag de chatknop op de telefoon over "Totaal excl. btw".

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
const telefoon = { breedte: 390, hoogte: 844 };

describe("raakt een blok de chatknop rechtsonder?", () => {
  it("een bedrag rechts onderin het scherm wel", () => {
    // de regel met het totaal, op 40 px van de onderkant, over de hele breedte van de kaart
    expect(raaktChatknop({ top: 780, bottom: 810, left: 45, right: 345 }, telefoon)).toBe(true);
  });

  it("hetzelfde blok hoger op het scherm of alleen links niet", () => {
    expect(raaktChatknop({ top: 300, bottom: 330, left: 45, right: 345 }, telefoon)).toBe(false);
    expect(raaktChatknop({ top: 780, bottom: 810, left: 16, right: 200 }, telefoon)).toBe(false);
  });

  it("de knop zit op 20 px van de rand en is 56 px groot (bottom-5 right-5 h-14 w-14)", () => {
    expect(CHATKNOP).toMatchObject({ rechts: 20, onder: 20, maat: 56 });
    const knop = lees("components/marketing/ChatWidget.tsx");
    expect(knop).toContain("fixed bottom-5 right-5 z-50 flex h-14 w-14");
  });
});

describe("de pagina's", () => {
  it("de chatknop wijkt voor zo'n blok, maar niet als de chat open is", () => {
    const knop = lees("components/marketing/ChatWidget.tsx");
    expect(knop).toContain("document.querySelectorAll(`[${CHATKNOP_VRIJ}]`)");
    expect(knop).toContain('${wijk && !open ? " invisible" : ""}');
  });

  it("de kostenregel op /klus-plaatsen is zo'n blok", () => {
    expect(CHATKNOP_VRIJ).toBe("data-chatknop-vrij");
    // sinds 23 nov 2026 via de gedeelde KostenLijst (components/app/KostenLijst.tsx): het attribuut komt uit CHATKNOP_VRIJ
    expect(lees("components/marketing/KlusConcept.tsx")).toMatch(/<KostenLijst[^>]*\bchatknopVrij\b/);
    const lijst = lees("components/app/KostenLijst.tsx");
    expect(lijst).toContain("chatknopVrij ? { [CHATKNOP_VRIJ]: \"\" } : {}");
    expect(lijst).toContain("<dl {...vrij}");
  });
});

// 23 nov 2026 (schermcontrole van de live site, 390 px): de chatknop lag op /klus-plaatsen over het pijltje van de keuzelijst en het
// kalenderpictogram bij Datum. Nu geldt het voor het hele formulier: de knop wijkt zolang een veld of knop erin onder de knop ligt.
describe("de velden van een formulier mogen niet onder de chatknop liggen", () => {
  it("een veld dat over de hoek rechtsonder loopt wijkt de knop, een veld erboven of links ervan niet", () => {
    // een keuzelijst over de hele breedte (16 tot 374), de onderkant op 788 van 844: het pijltje ligt onder de knop
    expect(wijktChatknop({ blokken: [], velden: [{ top: 740, bottom: 788, left: 16, right: 374 }] }, telefoon)).toBe(true);
    // Datum met zijn kalenderpictogram rechts
    expect(wijktChatknop({ blokken: [], velden: [{ top: 770, bottom: 818, left: 16, right: 374 }] }, telefoon)).toBe(true);
    // hoger op het scherm, of een smal veld links
    expect(wijktChatknop({ blokken: [], velden: [{ top: 600, bottom: 648, left: 16, right: 374 }] }, telefoon)).toBe(false);
    expect(wijktChatknop({ blokken: [], velden: [{ top: 770, bottom: 818, left: 16, right: 200 }] }, telefoon)).toBe(false);
  });

  it("de knop wijkt ook voor een blok met CHATKNOP_VRIJ, en zonder velden of blokken niet", () => {
    expect(wijktChatknop({ blokken: [{ top: 780, bottom: 810, left: 45, right: 345 }], velden: [] }, telefoon)).toBe(true);
    expect(wijktChatknop({ blokken: [], velden: [] }, telefoon)).toBe(false);
  });

  it("één veld onder de knop is genoeg, ook als de andere velden ver weg liggen", () => {
    const velden = [
      { top: 100, bottom: 148, left: 16, right: 374 },
      { top: 790, bottom: 838, left: 16, right: 374 },
      { top: 1000, bottom: 1048, left: 16, right: 374 },
    ];
    expect(wijktChatknop({ blokken: [], velden }, telefoon)).toBe(true);
    expect(wijktChatknop({ blokken: [], velden: velden.filter((_, i) => i !== 1) }, telefoon)).toBe(false);
  });

  it("op een laptop (1366 × 768) raakt een veld links in het formulier de knop niet", () => {
    expect(wijktChatknop({ blokken: [], velden: [{ top: 700, bottom: 748, left: 120, right: 700 }] }, { breedte: 1366, hoogte: 768 })).toBe(false);
    // het overzicht rechts met de plaatsknop wel, als de plaatsknop onder de chatknop ligt
    expect(wijktChatknop({ blokken: [], velden: [{ top: 700, bottom: 748, left: 900, right: 1330 }] }, { breedte: 1366, hoogte: 768 })).toBe(true);
  });

  it("de ChatWidget kijkt naar de velden, wacht even met terugkomen en laat de bestaande regels staan", () => {
    const knop = lees("components/marketing/ChatWidget.tsx");
    expect(knop).toContain("document.querySelectorAll(VELDEN_SELECTOR)");
    expect(knop).toContain("wijktChatknop(");
    expect(knop).toContain("}, TERUG_NA_MS);");
    expect(knop).toContain("if (terug) clearTimeout(terug);");
    expect(knop).toContain("document.querySelectorAll(`[${CHATKNOP_VRIJ}]`)");
    expect(knop).toContain('${wijk && !open ? " invisible" : ""}');
    // een effect geeft alleen een opruimfunctie terug
    expect(knop).not.toMatch(/useEffect\(\(\) => (kijk|plan)/);
  });

  it("de velden worden gezocht in formulieren met het attribuut, op invoer, keuzelijsten, tekstvakken en knoppen", () => {
    expect(CHATKNOP_VELDEN).toBe("data-chatknop-velden");
    expect(VELDEN_SELECTOR.split(", ")).toEqual([
      "[data-chatknop-velden] input",
      "[data-chatknop-velden] select",
      "[data-chatknop-velden] textarea",
      "[data-chatknop-velden] button",
    ]);
    expect(TERUG_NA_MS).toBeGreaterThan(0);
    expect(TERUG_NA_MS).toBeLessThanOrEqual(1000);
  });

  it("/klus-plaatsen zet het attribuut op het websiteformulier, de velden en het overzicht met de plaatsknop", () => {
    const concept = lees("components/marketing/KlusConcept.tsx");
    expect(concept.match(/data-chatknop-velden=""/g)).toHaveLength(3);
    expect(concept).toMatch(/<form onSubmit=\{readSite\}[^>]*data-chatknop-velden=""/);
    expect(concept).toMatch(/<div className="min-w-0 space-y-5" onChange=\{used\} data-chatknop-velden="">/);
    expect(concept).toMatch(/aria-live="polite" data-chatknop-velden="">/);
  });
});
