import { describe, expect, it } from "vitest";
import { controleerReservering, datumTekst, isTafelZaak, leesReserveerInvoer, reserveerBlokVan, reserveerUren, tijdenUitUren, tijdenVoor, voorbeeldVol, type ReserveerBlok, type ReserveerInvoer } from "@/lib/sites/reserveren";
import { renderPage, renderReserveerPagina, renderSitemap, renderSystemPage, safeHref, siteCss } from "@/lib/sites/render";
import { siteSaveSchema } from "@/lib/sites/schema";
import { functiesVoorBezoekers } from "@/lib/sites/wat-kan-deze-site";
import { SECTOR_TEMPLATES, newBlock, pagesFromTemplate, type Page, type SiteDoc } from "@/lib/sites/types";
import { BRANCHE_VOORBEELDEN, brancheVoorbeeldPaginas } from "@/lib/sites/branche-voorbeelden";

// Een tafel reserveren op een klantsite (4 nov 2026): vrije tijden met de regels van het
// horecapakket, een controle die zinnen geeft, en HTML zonder scripts.

const blok = (over: Partial<ReserveerBlok> = {}): ReserveerBlok => ({
  ...(newBlock("reserveren", "r1").props as ReserveerBlok),
  // vrijdag 17:00 – 22:00, de rest dicht
  tijden: { "0": null, "1": null, "2": null, "3": null, "4": null, "5": { van: "17:00", tot: "22:00" }, "6": null },
  maxGasten: 10,
  ...over,
});
const VRIJDAG = "2026-11-06";
const nu = { datum: "2026-11-05", minuten: 10 * 60 };

const gast = (over: Partial<ReserveerInvoer> = {}): ReserveerInvoer => ({ datum: VRIJDAG, tijd: "18:00", personen: 4, naam: "Sanne", email: "sanne@zekerflex.test", telefoon: "06 12345678", opmerking: "", ...over });

describe("reserveren: rekenen", () => {
  it("geeft de tijden van een open dag, met de laatste tijd zo dat het verblijf voor sluiting eindigt", () => {
    const t = tijdenVoor(blok(), VRIJDAG, 2, [], nu);
    expect(t.map((x) => x.tijd)).toEqual(["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00"]);
    expect(t.every((x) => x.vrij)).toBe(true);
    expect(tijdenVoor(blok(), "2026-11-07", 2, [], nu)).toEqual([]);
  });

  it("is vol als de capaciteit tijdens het verblijf op is", () => {
    const t = tijdenVoor(blok(), VRIJDAG, 4, [{ tijd: "18:00", personen: 8 }], nu);
    expect(t.find((x) => x.tijd === "18:00")?.vrij).toBe(false);
    expect(t.find((x) => x.tijd === "17:00")?.vrij).toBe(false); // 17:00–19:00 overlapt met 18:00
    expect(t.find((x) => x.tijd === "20:00")?.vrij).toBe(true);
  });

  it("controleert tijd, groep, naam, e-mail en telefoon in gewone zinnen", () => {
    expect(controleerReservering(blok(), gast(), [], nu)).toEqual([]);
    expect(controleerReservering(blok(), gast({ tijd: "" }), [], nu)).toContain("Kies een tijd.");
    expect(controleerReservering(blok(), gast({ personen: 20 }), [], nu).join(" ")).toMatch(/groepen groter dan 8/);
    expect(controleerReservering(blok(), gast({ email: "geen" }), [], nu).join(" ")).toMatch(/e-mailadres/);
    expect(controleerReservering(blok(), gast({ telefoon: "12" }), [], nu).join(" ")).toMatch(/telefoonnummer/);
    expect(controleerReservering(blok(), gast({ tijd: "18:00" }), [{ tijd: "18:00", personen: 10 }], nu).join(" ")).toMatch(/net vol/);
    expect(controleerReservering(blok(), gast({ tijd: "18:00" }), [], nu, new Set(["18:00"])).join(" ")).toMatch(/net vol/);
  });

  it("leest een formulier veilig uit", () => {
    const r = leesReserveerInvoer((k) => ({ datum: "2026-11-06", tijd: "18:00", personen: "3", naam: "  Bas  ", email: "x@y.nl" })[k]);
    expect(r).toMatchObject({ datum: "2026-11-06", tijd: "18:00", personen: 3, naam: "Bas" });
    expect(leesReserveerInvoer((k) => ({ datum: "morgen", tijd: "25:00", personen: "-1" })[k])).toMatchObject({ datum: "", tijd: "", personen: 0 });
  });

  it("schrijft dagen in gewone woorden", () => {
    expect(datumTekst("2026-11-06")).toBe("vrijdag 6 november");
    expect(datumTekst("2027-01-01", 2026)).toBe("vrijdag 1 januari 2027");
  });

  it("zet op een voorbeeld elke dag andere, maar vaste tijden op vol", () => {
    const a = voorbeeldVol(blok({ tijden: { ...blok().tijden, "5": { van: "12:00", tot: "23:00" } } }), VRIJDAG);
    expect(a).toEqual(voorbeeldVol(blok({ tijden: { ...blok().tijden, "5": { van: "12:00", tot: "23:00" } } }), VRIJDAG));
    expect(a.size).toBeGreaterThan(0);
    expect(a.size).toBeLessThan(19);
  });

  it("toont de laatste aankomsttijd per dag op de kaart", () => {
    const uren = reserveerUren(blok());
    expect(uren[0]).toEqual({ dag: "Maandag", tijd: "Gesloten" });
    expect(uren[4]).toEqual({ dag: "Vrijdag", tijd: "17:00 – 20:00" });
  });
});

describe("reserveren: openingstijden van een eigen website", () => {
  it("maakt reserveertijden van wat de website-check leest, en verzint niets", () => {
    const t = tijdenUitUren([
      { dag: "Maandag", tijd: "Gesloten" },
      { dag: "Dinsdag t/m vrijdag", tijd: "12:00 – 14:00 en 17:00 – 22:00" },
      { dag: "Zaterdag", tijd: "17:00 – 24:00" },
    ]);
    expect(t?.["1"]).toBeNull();
    expect(t?.["3"]).toEqual({ van: "12:00", tot: "22:00" });
    expect(t?.["6"]).toEqual({ van: "17:00", tot: "00:00" });
    expect(t?.["0"]).toBeNull();
    expect(tijdenUitUren([{ dag: "Maandag", tijd: "Op afspraak" }])).toBeNull();
    expect(tijdenUitUren([])).toBeNull();
  });

  it("herkent zaken waar je aan tafel eet", () => {
    expect(isTafelZaak("Brasserie De Kade")).toBe(true);
    expect(isTafelZaak("Burgerbar Vuur")).toBe(true);
    expect(isTafelZaak("Bakkerij Jansen")).toBe(false);
  });
});

const doc = (pages: Page[], over: Partial<SiteDoc> = {}): Pick<SiteDoc, "pages" | "media" | "theme" | "bedrijf" | "voorbeeld" | "voorstel" | "winkel"> => ({
  pages,
  media: [],
  theme: { kleur: "#5C2E22", accent: "#F2A541", lettertype: "modern", hoeken: "rond", stijl: "beleving" },
  bedrijf: { naam: "Brasserie <Het> Plein", kvk: "", straat: "Plein 1", postcode: "1234 AB", plaats: "Zonnedorp", telefoon: "0548 123 456", email: "" },
  ...over,
});
const opts = { root: "/site/plein/", origin: "https://zekerflex.com" };
const metBlok = (): Page[] => [{ id: "home", slug: "", titel: "Home", seoTitel: "", seoOmschrijving: "", blocks: [{ id: "r1", type: "reserveren", props: blok() }] }];

describe("reserveren: weergave", () => {
  it("toont dag en personen als formulier naar …/reserveren, met de kaart van de tijden, zonder scripts", () => {
    const html = renderPage(doc(metBlok()), metBlok()[0]!, opts);
    expect(html).toContain('<form class="rsv" method="get" action="/site/plein/reserveren">');
    expect(html).toContain('type="date" name="datum" required');
    expect(html).toContain("Reserveren kan");
    expect(html).toContain('<a class="btn cta-top" href="/site/plein/reserveren">Reserveren</a>');
    expect(html).toContain("Brasserie &lt;Het&gt; Plein");
    expect(html).not.toMatch(/<script(?! type="application\/ld\+json")/);
  });

  it("toont de tijden als keuzerondjes, volle uit, en de gegevens in een POST-formulier", () => {
    const html =
      renderReserveerPagina(doc(metBlok()), { soort: "reserveren", staat: { invoer: { datum: VRIJDAG, personen: 4 }, tijden: [{ tijd: "18:00", vrij: true }, { tijd: "18:30", vrij: false }], fouten: [], suggesties: [], nu } }, opts) ?? "";
    expect(html).toContain('action="/site/plein/_zf/reservering"');
    expect(html).toContain('<input type="radio" name="tijd" value="18:00" required>');
    expect(html).toContain('<input type="radio" name="tijd" value="18:30" disabled>');
    expect(html).toContain("vrijdag 6 november, 4 personen");
    expect(html).toContain('name="naam"');
  });

  it("stelt bij een volle dag de eerstvolgende dagen met plek voor", () => {
    const html = renderReserveerPagina(doc(metBlok()), { soort: "reserveren", staat: { invoer: { datum: VRIJDAG, personen: 4 }, tijden: [{ tijd: "18:00", vrij: false }], fouten: [], suggesties: ["2026-11-13"], nu } }, opts) ?? "";
    expect(html).toContain('href="/site/plein/reserveren?datum=2026-11-13&amp;personen=4"');
    expect(html).not.toContain("_zf/reservering");
  });

  it("zegt op een voorbeeld dat er niets is gereserveerd", () => {
    const html = renderReserveerPagina(doc(metBlok(), { voorbeeld: true }), { soort: "gereserveerd", reservering: { nr: "", datum: VRIJDAG, tijd: "19:00", personen: 2 }, voorbeeld: true }, opts) ?? "";
    expect(html).toContain("Zo ziet je bevestiging eruit");
    expect(html).toContain("er is niets gereserveerd en niets verstuurd");
    expect(html).toContain("vrijdag 6 november om 19:00");
  });

  it("heeft geen reserveerpagina zonder blok, wel een link en een sitemapregel met blok", () => {
    const zonder: Page[] = [{ id: "home", slug: "", titel: "Home", seoTitel: "", seoOmschrijving: "", blocks: [] }];
    expect(renderReserveerPagina(doc(zonder), { soort: "gereserveerd", reservering: null, voorbeeld: false }, opts)).toBeNull();
    expect(safeHref("reserveren", "/site/plein/", zonder)).toBe("/site/plein/reserveren");
    expect(renderSitemap(doc(metBlok()), opts)).toContain("https://zekerflex.com/site/plein/reserveren");
    expect(renderSitemap(doc(zonder), opts)).not.toContain("reserveren");
  });

  it("noemt reserveren in de privacyverklaring en op 'wat kan deze site'", () => {
    expect(renderSystemPage(doc(metBlok()), "privacy", opts)).toContain("een tafel reserveert");
    expect(functiesVoorBezoekers(doc(metBlok())).map((f) => f.titel)).toContain("Online een tafel reserveren");
    expect(siteCss(doc(metBlok()).theme)).toContain(".slots{");
  });
});

describe("reserveren: opslaan en sjablonen", () => {
  it("laat de bouwer het blok bewaren en weigert een eigen pagina 'reserveren'", () => {
    const pages = metBlok();
    const base = { theme: doc(pages).theme, bedrijf: { ...doc(pages).bedrijf, naam: "Plein" }, pages };
    expect(siteSaveSchema.safeParse(base).success).toBe(true);
    expect(siteSaveSchema.safeParse({ ...base, pages: [...pages, { ...pages[0]!, id: "p2", slug: "reserveren" }] }).success).toBe(false);
    const fout = { ...base, pages: [{ ...pages[0]!, blocks: [{ id: "r1", type: "reserveren", props: { ...blok(), tijden: { ...blok().tijden, "5": { van: "25:00", tot: "22:00" } } } }] }] };
    expect(siteSaveSchema.safeParse(fout).success).toBe(false);
  });

  it("geeft een nieuwe horecasite en de voorbeeldbrasserie online reserveren", () => {
    const horeca = SECTOR_TEMPLATES.find((t) => t.id === "horeca")!;
    let n = 0;
    const pages = pagesFromTemplate(horeca, { naam: "Eetcafé Test", kvk: "", straat: "", postcode: "", plaats: "", telefoon: "", email: "" }, () => `id${n++}`);
    expect(reserveerBlokVan(pages)).not.toBeNull();
    const bouw = SECTOR_TEMPLATES.find((t) => t.id === "bouw")!;
    expect(reserveerBlokVan(pagesFromTemplate(bouw, { naam: "Bouw", kvk: "", straat: "", postcode: "", plaats: "", telefoon: "", email: "" }, () => `id${n++}`))).toBeNull();
    const brasserie = BRANCHE_VOORBEELDEN.find((v) => v.id === "horeca")!;
    const bv = brancheVoorbeeldPaginas(brasserie, () => null);
    expect(reserveerBlokVan(bv)?.maxGroep).toBe(10);
    expect(bv[0]!.blocks.find((b) => b.type === "hero")?.props).toMatchObject({ knopLink: "reserveren" });
  });
});
