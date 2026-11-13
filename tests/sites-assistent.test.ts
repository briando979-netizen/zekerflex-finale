import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ASSISTENT_VOORBEELDEN, MAX_BLOKKEN, voerOpdrachtUit, type AssistentDoc } from "@/lib/sites/assistent";
import { siteSaveSchema } from "@/lib/sites/schema";
import { MAX_PAGINAS } from "@/lib/sites/paginabouwer";
import { newBlock, type Page } from "@/lib/sites/types";

// De assistent in de bouwer (13 nov): een opdracht in gewone woorden verandert de kleur, de hoeken, het lettertype, de
// stijl, voegt een blok toe of maakt een pagina. Zonder AI. Wat hij niet begrijpt zegt hij, en hij doet niets wat de bouwer
// zelf niet kan.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
let teller = 0;
const maakId = (v: string) => `${v}test${String(++teller).padStart(4, "0")}`;
const pagina = (id: string, slug: string, titel: string, blokken = 1): Page => ({ id, slug, titel, seoTitel: "", seoOmschrijving: "", blocks: Array.from({ length: blokken }, (_, i) => newBlock("tekst", `b${id}${i}`)) });
const DOC: AssistentDoc = { theme: { kleur: "#0E5C4A", accent: "#F2B544", lettertype: "modern", hoeken: "rond" }, pages: [pagina("phome", "", "Home"), pagina("pcontact", "contact", "Contact")] };
const doe = (t: string, doc = DOC, pid = "phome") => voerOpdrachtUit(t, doc, pid, "Bakkerij Jansen", maakId);

describe("kleur, hoeken, lettertype en stijl", () => {
  it("een kleur bij naam of met een code; de langste naam telt", () => {
    expect(doe("Maak de kleur blauw").doc.theme.kleur).toBe("#1D4E89");
    expect(doe("maak de kleur donkerblauw").doc.theme.kleur).toBe("#14325A");
    expect(doe("zet de kleur op #aa3366").doc.theme.kleur).toBe("#AA3366");
    expect(doe("maak de knoppen oranje").doc.theme).toMatchObject({ kleur: "#0E5C4A", accent: "#C2571A" });
  });

  it("geel is te licht voor witte tekst en wordt dus de accentkleur", () => {
    const u = doe("maak de kleur geel");
    expect(u.doc.theme).toMatchObject({ kleur: "#0E5C4A", accent: "#F2B544" });
    expect(u.gedaan[0]).toContain("accentkleur");
  });

  it("hoeken, lettertype en stijl, ook in één zin", () => {
    const u = doe("Ronde hoeken en een klassiek lettertype");
    expect(u.doc.theme).toMatchObject({ hoeken: "rond", lettertype: "klassiek" });
    expect(doe("maak de hoeken strak").doc.theme.hoeken).toBe("strak");
    expect(doe("gebruik de stijl luxe").doc.theme.stijl).toBe("luxe");
    expect(doe("kies de 3D stijl").doc.theme.stijl).toBe("diepte");
    expect(u.nietGedaan).toEqual([]);
  });
});

describe("een blok of een pagina erbij", () => {
  it("het blok komt onderaan de pagina die open staat, met de standaardinhoud van de bouwer", () => {
    const u = doe("Voeg openingstijden toe", DOC, "pcontact");
    const blokken = u.doc.pages.find((p) => p.id === "pcontact")?.blocks ?? [];
    expect(blokken.map((b) => b.type)).toEqual(["tekst", "openingstijden"]);
    expect(u.doc.pages.find((p) => p.id === "phome")?.blocks).toHaveLength(1);
    expect(u.gedaan[0]).toContain("Openingstijden");
    expect(doe("plaats een fotogalerij").doc.pages[0]?.blocks.at(-1)?.type).toBe("galerij");
    expect(doe("voeg veelgestelde vragen toe").doc.pages[0]?.blocks.at(-1)?.type).toBe("faq");
    expect(doe("voeg een tekst met foto toe").doc.pages[0]?.blocks.at(-1)?.type).toBe("tekstFoto");
  });

  it("een nieuwe pagina krijgt een eigen adres en een eerste blok", () => {
    const u = doe("Maak een pagina Over ons");
    const nieuw = u.doc.pages.at(-1);
    expect(nieuw).toMatchObject({ titel: "Over ons", slug: "over-ons", seoTitel: "Over ons | Bakkerij Jansen" });
    expect(nieuw?.blocks).toHaveLength(1);
    // een naam die al bestaat krijgt een ander adres
    expect(doe("voeg een pagina Contact toe").doc.pages.at(-1)?.slug).not.toBe("contact");
    expect(doe("maak een pagina").nietGedaan[0]).toContain("naam van de pagina");
  });

  it("de grenzen van de bouwer gelden ook hier", () => {
    const vol: AssistentDoc = { ...DOC, pages: Array.from({ length: MAX_PAGINAS }, (_, i) => pagina(`p${i}`, i === 0 ? "" : `p-${i}`, `Pagina ${i}`)) };
    const u = doe("maak een pagina Extra", vol, "p0");
    expect(u.doc.pages).toHaveLength(MAX_PAGINAS);
    expect(u.nietGedaan[0]).toContain(`al ${MAX_PAGINAS} pagina's`);
    const druk: AssistentDoc = { ...DOC, pages: [pagina("phome", "", "Home", MAX_BLOKKEN)] };
    expect(doe("voeg een video toe", druk).doc.pages[0]?.blocks).toHaveLength(MAX_BLOKKEN);
    expect(bron("lib/sites/schema.ts")).toContain(`blocks: z.array(block).max(${MAX_BLOKKEN}),`);
  });
});

describe("eerlijk en veilig", () => {
  it("wat hij niet begrijpt zegt hij, en dan verandert er niets", () => {
    const u = doe("schrijf een mooie tekst over mijn bedrijf");
    expect(u.gedaan).toEqual([]);
    expect(u.nietGedaan).toHaveLength(1);
    expect(u.doc.theme).toEqual(DOC.theme);
    expect(u.doc.pages).toBe(DOC.pages);
    expect(doe("").gedaan).toEqual([]);
  });

  it("de invoer zelf wordt nooit aangepast", () => {
    const voor = JSON.stringify(DOC);
    doe("maak de kleur rood en voeg een video toe en maak een pagina Prijzen");
    expect(JSON.stringify(DOC)).toBe(voor);
  });

  it("wat eruit komt kan de bouwer gewoon opslaan", () => {
    const u = doe("maak de kleur paars, voeg een prijslijst toe en maak een pagina Ons team");
    expect(u.gedaan).toHaveLength(3);
    const bedrijf = { naam: "Bakkerij Jansen", kvk: "", straat: "", postcode: "", plaats: "", telefoon: "", email: "" };
    expect(siteSaveSchema.safeParse({ theme: u.doc.theme, bedrijf, pages: u.doc.pages }).success).toBe(true);
  });

  it("elk voorbeeld onder het invoerveld werkt echt", () => {
    // na elkaar, zoals iemand ze zou aanklikken: "zet … bovenaan" werkt op het blok dat net is toegevoegd
    let doc = DOC;
    for (const v of ASSISTENT_VOORBEELDEN) {
      const u = doe(v, doc);
      expect(u.gedaan.length, v).toBeGreaterThan(0);
      expect(u.nietGedaan, v).toEqual([]);
      doc = u.doc;
    }
  });

  it("puur en veilig voor oude Safari; het scherm verandert via de wijzigfunctie van de bouwer", () => {
    const regels = bron("lib/sites/assistent.ts");
    expect(regels).not.toMatch(/\(\?<[=!]/);
    expect(regels).not.toMatch(/prisma|storage\/kv|fetch\(/);
    const kaart = bron("components/studio/AssistentKaart.tsx");
    expect(kaart).not.toContain("fetch(");
    expect(kaart).toContain("Maak ongedaan");
    expect(bron("components/app/SiteBuilder.tsx")).toContain("onPasToe={(nieuw) => change((s) => ({ ...s, theme: nieuw.theme, pages: nieuw.pages }))}");
  });
});

describe("een websitevoorstel of bestaande site verandert nooit vanzelf", () => {
  const kaart = bron("components/studio/AssistentKaart.tsx");

  it("de kaart doet pas iets na een opdracht of Maak ongedaan: geen wijziging bij het laden", () => {
    // onPasToe wordt alleen in de twee knop-functies aangeroepen, nooit in een effect
    expect(kaart.match(/onPasToe\(/g) ?? []).toHaveLength(2);
    const effect = kaart.slice(kaart.indexOf("useEffect(() => {"), kaart.indexOf("}, []);"));
    expect(effect).not.toContain("onPasToe");
    expect(effect).not.toContain("voerOpdrachtUit");
    expect(kaart.match(/useEffect\(/g) ?? []).toHaveLength(1);
  });

  it("de assistent kent alleen het uiterlijk en de pagina's: het voorstelmerk, de bedrijfsgegevens, de winkel en wat online staat blijven", () => {
    const regels = bron("lib/sites/assistent.ts");
    const doc = regels.slice(regels.indexOf("export interface AssistentDoc {"), regels.indexOf("export interface AssistentUitkomst"));
    expect(doc.match(/^ {2}\w+: /gm)).toEqual(["  theme: ", "  pages: "]);
    for (const veld of ["voorstel", "liveBuild", "winkel", "builds"]) expect(regels, veld).not.toContain(veld);
    // de bouwer neemt alleen die twee over en laat de rest van de site staan
    expect(bron("components/app/SiteBuilder.tsx")).toContain("change((s) => ({ ...s, theme: nieuw.theme, pages: nieuw.pages }))");
    // er wordt niets verstuurd of gepubliceerd
    expect(kaart).not.toMatch(/fetch\(|publish|mail/i);
  });

  it("een opdracht raakt de bestaande blokken en hun teksten niet aan", () => {
    const u = doe("maak de kleur rood en voeg een video toe");
    expect(u.doc.pages[0]?.blocks[0]).toBe(DOC.pages[0]?.blocks[0]);
    expect(u.doc.pages[1]).toBe(DOC.pages[1]);
  });
});

describe("een blok weghalen of verplaatsen, en een pagina een andere naam geven", () => {
  const metBlokken: AssistentDoc = { ...DOC, pages: [{ ...pagina("phome", "", "Home"), blocks: [newBlock("hero", "bh"), newBlock("tekst", "bt"), newBlock("openingstijden", "bo"), newBlock("faq", "bf")] }] };
  const soorten = (d: AssistentDoc) => d.pages[0]?.blocks.map((b) => b.type);

  it("verplaatsen: bovenaan, onderaan, een plek omhoog of omlaag", () => {
    expect(soorten(doe("Zet de openingstijden bovenaan", metBlokken).doc)).toEqual(["openingstijden", "hero", "tekst", "faq"]);
    expect(soorten(doe("verplaats de tekst naar onderaan", metBlokken).doc)).toEqual(["hero", "openingstijden", "faq", "tekst"]);
    expect(soorten(doe("schuif de veelgestelde vragen omhoog", metBlokken).doc)).toEqual(["hero", "tekst", "faq", "openingstijden"]);
    expect(soorten(doe("zet de openingstijden omlaag", metBlokken).doc)).toEqual(["hero", "tekst", "faq", "openingstijden"]);
    // staat hij er al, dan zegt de assistent dat en verandert er niets
    const al = doe("zet de veelgestelde vragen onderaan", metBlokken);
    expect(al.gedaan).toEqual([]);
    expect(al.nietGedaan[0]).toContain("staat daar al");
  });

  it("weghalen: alleen het genoemde blok, en nooit het laatste blok van een pagina", () => {
    const u = doe("Verwijder de openingstijden", metBlokken);
    expect(soorten(u.doc)).toEqual(["hero", "tekst", "faq"]);
    expect(u.gedaan[0]).toContain("Maak ongedaan");
    expect(soorten(doe("haal de veelgestelde vragen weg", metBlokken).doc)).toEqual(["hero", "tekst", "openingstijden"]);
    // "haal" zonder "weg" is geen opdracht om iets te wissen
    expect(doe("haal de openingstijden", metBlokken).gedaan).toEqual([]);
    const enige = doe("verwijder de tekst", DOC);
    expect(enige.doc.pages[0]?.blocks).toHaveLength(1);
    expect(enige.nietGedaan[0]).toContain("enige blok");
    expect(doe("verwijder de video", metBlokken).nietGedaan[0]).toContain('geen blok "Video');
  });

  it("een andere naam voor de pagina die open staat; het adres blijft", () => {
    const u = doe("Hernoem de pagina naar ons verhaal", DOC, "pcontact");
    expect(u.doc.pages[1]).toMatchObject({ titel: "Ons verhaal", slug: "contact" });
    expect(u.doc.pages[0]?.titel).toBe("Home");
    expect(doe("hernoem de pagina naar", DOC, "pcontact").gedaan).toEqual([]);
  });

  it("wat eruit komt kan de bouwer nog steeds opslaan, en de invoer blijft ongemoeid", () => {
    const voor = JSON.stringify(metBlokken);
    const u = doe("zet de openingstijden bovenaan en verwijder de tekst en hernoem de pagina naar Welkom", metBlokken);
    expect(u.gedaan).toHaveLength(3);
    expect(JSON.stringify(metBlokken)).toBe(voor);
    const bedrijf = { naam: "Bakkerij Jansen", kvk: "", straat: "", postcode: "", plaats: "", telefoon: "", email: "" };
    expect(siteSaveSchema.safeParse({ theme: u.doc.theme, bedrijf, pages: u.doc.pages }).success).toBe(true);
  });
});
