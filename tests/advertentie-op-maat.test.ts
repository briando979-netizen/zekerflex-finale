import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { afterEach, vi } from "vitest";
import { BASISLETTERS, SIERLETTERS, gegevensVan, letterMeter, maakBeeld, maakPng } from "@/lib/advertentie/beeld";
import { logoBoom2, logoTinten } from "@/lib/logo/ontwerp2";
import { SFEREN } from "@/lib/logo/regels";
import { GEHEUGEN_MAX, GEHEUGEN_MS, geheugenGrootte, leegGeheugen, watermerkBeeld } from "@/lib/advertentie/beeld-geheugen";
import { WACHT_MS, gelijktijdig } from "@/lib/advertentie/render-rij";
import { FLUISTER_DEKKING, SNIJ_DEKKING, advertentieTinten, lettergrootte, ontwerpBoom } from "@/lib/advertentie/ontwerp";
import { logoBoom } from "@/lib/logo/ontwerp";
import { valideerLogoInvoer } from "@/lib/logo/regels";
import {
  BEWAAR_DAGEN,
  FORMATEN,
  GRENS,
  STANDAARD_PRIJZEN,
  VOORBEELD_ZIJDE,
  beeldBesluit,
  IN_LETTERTYPE,
  KEUZE_GEWIJZIGD,
  geldendePrijzen,
  keuzeGewijzigd,
  normaliseerPrijs,
  verloopGrens,
  isAdvertentieId,
  kortAf,
  leesModelTekst,
  ontwerpVrij,
  prijsTekst,
  schoonTekst,
  sjabloonTekst,
  valideerAanvraag,
  valideerInvoer,
  vanafTekst,
  verlopen,
  verzint,
  type Advertentie,
  type Invoer,
} from "@/lib/advertentie/regels";
import { VOORBEELDEN } from "@/lib/advertentie/voorbeelden";
import { AANBOD } from "@/lib/marketing/aanbod";

// Advertentie op maat (/advertentie-op-maat): de regels in lib/advertentie/regels.ts. De kern is de watermerkbeslissing:
// de schone versie mag de browser nooit bereiken vóór vrijgave.

const ROOT = join(__dirname, "..");
const invoer: Invoer = { bedrijf: "Fietsenmaker Van Dijk", aanbod: "Wij repareren stadsfietsen en e-bikes. Ook onderhoud.", plaats: "Zuidbroek", contact: "0598 123456", kleur: "groen" };
const ad = (status: Advertentie["status"], aanvraag?: Advertentie["aanvraag"]): Pick<Advertentie, "status" | "aanvraag"> => ({ status, ...(aanvraag ? { aanvraag } : {}) });
const keuze = (ontwerp: 1 | 2 | 3, pakket: "een" | "alle") => ({ ontwerp, pakket, naam: "Test", email: "test@voorbeeld.test", op: "2026-11-19T10:00:00.000Z" });

describe("het beeld: watermerk ja of nee, en welke maat", () => {
  const klein = { watermerk: true, formaat: "vierkant", breedte: VOORBEELD_ZIJDE, hoogte: VOORBEELD_ZIJDE };
  const kleinIn = { vierkant: klein, verhaal: { watermerk: true, formaat: "verhaal", breedte: 338, hoogte: 600 }, liggend: { watermerk: true, formaat: "liggend", breedte: 600, hoogte: 314 } };

  it("niet vrijgegeven: altijd klein en met watermerk, in elk formaat en voor elk ontwerp", () => {
    for (const status of ["gemaakt", "aangevraagd"] as const) {
      for (const formaat of ["vierkant", "verhaal", "liggend"] as const) {
        for (const ontwerp of [1, 2, 3, 4, 5, 6] as const) {
          const b = beeldBesluit({ ad: ad(status, status === "aangevraagd" ? keuze(ontwerp > 3 ? 1 : (ontwerp as 1 | 2 | 3), "alle") : undefined), ontwerp, beheerder: false, formaat });
          expect(b).toEqual(kleinIn[formaat]);
          expect(Math.max(b.breedte, b.hoogte)).toBeLessThanOrEqual(VOORBEELD_ZIJDE);
        }
      }
    }
  });

  it("vrijgegeven met één ontwerp: alleen dat ontwerp is schoon en groot, de andere houden hun watermerk", () => {
    const vrij = ad("vrijgegeven", keuze(2, "een"));
    expect(beeldBesluit({ ad: vrij, ontwerp: 2, beheerder: false, formaat: "verhaal" })).toEqual({ watermerk: false, formaat: "verhaal", breedte: 1080, hoogte: 1920 });
    expect(beeldBesluit({ ad: vrij, ontwerp: 2, beheerder: false, formaat: "liggend" })).toEqual({ watermerk: false, formaat: "liggend", breedte: 1200, hoogte: 628 });
    expect(beeldBesluit({ ad: vrij, ontwerp: 1, beheerder: false, formaat: "verhaal" })).toEqual(kleinIn.verhaal);
    expect(beeldBesluit({ ad: vrij, ontwerp: 5, beheerder: false, formaat: "liggend" })).toEqual(kleinIn.liggend);
    expect(beeldBesluit({ ad: vrij, ontwerp: 3, beheerder: false, formaat: "vierkant" })).toEqual(klein);
    expect([1, 2, 3].filter((n) => ontwerpVrij(vrij, n as 1 | 2 | 3))).toEqual([2]);
  });

  it("vrijgegeven met alle ontwerpen: elk ontwerp is schoon", () => {
    const vrij = ad("vrijgegeven", keuze(1, "alle"));
    for (const ontwerp of [1, 2, 3, 4, 5, 6] as const) expect(beeldBesluit({ ad: vrij, ontwerp, beheerder: false, formaat: "vierkant" })).toEqual({ watermerk: false, formaat: "vierkant", breedte: 1080, hoogte: 1080 });
  });

  it("een status 'vrijgegeven' zonder aanvraag geeft niets vrij", () => {
    expect(beeldBesluit({ ad: ad("vrijgegeven"), ontwerp: 1, beheerder: false, formaat: "vierkant" })).toEqual(klein);
  });

  it("alleen een beheerder ziet de schone versie eerder", () => {
    expect(beeldBesluit({ ad: ad("gemaakt"), ontwerp: 3, beheerder: true, formaat: "liggend" })).toEqual({ watermerk: false, formaat: "liggend", breedte: 1200, hoogte: 628 });
  });

  it("de beeldroute beslist alleen via beeldBesluit en bewaart een voorbeeld nergens", () => {
    const route = readFileSync(join(ROOT, "app", "api", "advertentie", "[id]", "beeld", "route.ts"), "utf8");
    expect(route).toContain("beeldBesluit({ ad, ontwerp, beheerder, formaat })");
    expect(route).toContain("private, no-store");
    expect(route).toContain('hasRole(principal, "PLATFORM_ADMIN")');
    // het id is een capability: nooit de url of het id in een log
    expect(route).not.toMatch(/logger\.\w+\([^)]*(request\.url|\bid\b)/);
  });
});

describe("invoer schoonmaken", () => {
  it("haalt HTML, stuurtekens, onzichtbare tekens en emoji weg en begrenst de lengte", () => {
    expect(schoonTekst("  <b>Bakker</b>\u{200B} Jan\n\t<script>x</script> \u{1F600}!  ", 60)).toBe("Bakker Jan x !");
    expect(schoonTekst("a\u{202E}b\u{0007}c", 10)).toBe("ab c");
    expect(schoonTekst("x".repeat(500), GRENS.bedrijf)).toHaveLength(GRENS.bedrijf);
    expect(schoonTekst(42, 10)).toBe("");
    expect(schoonTekst({ a: 1 }, 10)).toBe("");
  });

  it("houdt accenten en het euroteken, en maakt krullende tekens recht (geen tekens buiten het lettertype)", () => {
    expect(schoonTekst("Café Zoë \u{2018}t Hoekje\u{2019} \u{2013} \u{20AC} 5", 60)).toBe("Café Zoë 't Hoekje' - \u{20AC} 5");
    expect(schoonTekst("Łódź Привет 日本", 60)).toBe("Łódź");
  });

  it("valideert het formulier en laat lege keuzevelden weg", () => {
    expect(valideerInvoer({ bedrijf: "J", aanbod: "Fietsen maken" })).toMatchObject({ ok: false, veld: "bedrijf" });
    expect(valideerInvoer({ bedrijf: "Jo", aanbod: "x" })).toMatchObject({ ok: false, veld: "aanbod" });
    expect(valideerInvoer(null)).toMatchObject({ ok: false });
    const goed = valideerInvoer({ bedrijf: " Jo's <i>Fietsen</i> ", aanbod: "Wij maken fietsen.", plaats: "", kleur: "roze", extra: "weg" });
    expect(goed).toEqual({ ok: true, waarde: { bedrijf: "Jo's Fietsen", aanbod: "Wij maken fietsen.", kleur: "groen" } });
  });

  it("valideert de aanvraag: ontwerp, pakket, naam en e-mail", () => {
    const basis = { ontwerp: 2, pakket: "alle", naam: "Jan Jansen", email: "jan@voorbeeld.test", telefoon: "06-1234 5678 <x>" };
    expect(valideerAanvraag(basis)).toEqual({ ok: true, waarde: { ontwerp: 2, pakket: "alle", naam: "Jan Jansen", email: "jan@voorbeeld.test", telefoon: "06-1234 5678" } });
    expect(valideerAanvraag({ ...basis, ontwerp: 6 })).toMatchObject({ ok: true });
    for (const fout of [0, 7, 2.5, "x"]) expect(valideerAanvraag({ ...basis, ontwerp: fout }), String(fout)).toMatchObject({ ok: false, veld: "ontwerp" });
    expect(valideerAanvraag({ ...basis, pakket: "gratis" })).toMatchObject({ ok: false, veld: "pakket" });
    expect(valideerAanvraag({ ...basis, naam: "" })).toMatchObject({ ok: false, veld: "naam" });
    expect(valideerAanvraag({ ...basis, email: "jan@" })).toMatchObject({ ok: false, veld: "email" });
  });
});

describe("het id en de houdbaarheid", () => {
  it("een id is precies 32 hex-tekens (128 bit)", () => {
    expect(isAdvertentieId("0123456789abcdef0123456789abcdef")).toBe(true);
    for (const fout of ["", "0123456789abcdef", "0123456789ABCDEF0123456789ABCDEF", "0123456789abcdef0123456789abcdeg", "../0123456789abcdef0123456789abcd", "constructor", 5, null]) expect(isAdvertentieId(fout), String(fout)).toBe(false);
  });

  it(`vervalt ${BEWAAR_DAGEN} dagen na de laatste wijziging`, () => {
    const nu = new Date("2026-11-19T12:00:00+01:00");
    expect(verlopen("2026-09-21T12:00:00+02:00", nu)).toBe(false);
    expect(verlopen("2026-09-19T12:00:00+02:00", nu)).toBe(true);
    expect(verlopen("geen datum", nu)).toBe(true);
  });
});

describe("de tekst", () => {
  const VAST = new Set(["bij", "in", "neem", "contact", "op", "bel", "ons", "bekijk", "de", "website"]);
  const woorden = (s: string) => s.toLowerCase().split(/[^a-z0-9à-ÿ'-]+/).filter(Boolean);

  it("het sjabloon gebruikt alleen woorden uit de invoer (plus een paar vaste verbindingswoorden)", () => {
    const gevallen: Invoer[] = [
      invoer,
      { bedrijf: "Kapsalon Noor", aanbod: "Knippen en kleuren voor dames en heren", boodschap: "Nu ook open op zondag", contact: "kapsalonnoor.example", kleur: "paars" },
      { bedrijf: "Jo", aanbod: "Pizza uit de steenoven!", kleur: "rood" },
    ];
    for (const i of gevallen) {
      const bron = new Set([...woorden([i.bedrijf, i.aanbod, i.plaats ?? "", i.boodschap ?? ""].join(" ")), ...VAST]);
      const t = sjabloonTekst(i);
      for (const w of woorden(`${t.kop} ${t.onderregel} ${t.knop}`)) expect(bron.has(w), `${w} in "${t.kop} / ${t.onderregel} / ${t.knop}"`).toBe(true);
      expect(t.kop.length).toBeGreaterThan(0);
      expect(t.kop.length).toBeLessThanOrEqual(GRENS.kop);
      expect(t.onderregel.length).toBeLessThanOrEqual(GRENS.onderregel);
      expect(verzint(`${t.kop} ${t.onderregel}`, i)).toBe(false);
    }
    expect(sjabloonTekst(invoer)).toEqual({ kop: "Wij repareren stadsfietsen en e-bikes", onderregel: "Bij Fietsenmaker Van Dijk in Zuidbroek", knop: "Bel ons" });
  });

  it("een lange zin wordt op een woordgrens afgekort", () => {
    const lang = "Wij maken kantoren trappenhuizen en winkels schoon in de hele regio en wassen ook de ramen";
    expect(kortAf(lang, 64)).toBe("Wij maken kantoren trappenhuizen en winkels schoon in de hele");
    expect(kortAf("kort", 64)).toBe("kort");
  });

  it("herkent verzonnen cijfers en claims, maar niet wat het bedrijf zelf invulde", () => {
    expect(verzint("Nu 20% korting op elke beurt", invoer)).toBe(true);
    expect(verzint("Al 25 jaar de beste van Zuidbroek", invoer)).toBe(true);
    expect(verzint("Gratis ophalen en bezorgen", invoer)).toBe(true);
    expect(verzint("Je fiets weer als nieuw", invoer)).toBe(false);
    expect(verzint("Bestel je onderhoud", invoer)).toBe(false);
    const metActie: Invoer = { ...invoer, boodschap: "10% korting in november" };
    expect(verzint("10% korting in november", metActie)).toBe(false);
    expect(verzint("15% korting in november", metActie)).toBe(true);
  });

  it("leest het antwoord van het model soepel: object waar tekst hoort, andere veldnamen, te lang", () => {
    const uit = leesModelTekst({ headline: { tekst: "Je fiets weer als nieuw" }, subheadline: ["Reparatie en onderhoud", "van stadsfietsen."], cta: "  Maak een afspraak  " }, invoer);
    expect(uit).toEqual({ bron: "model", tekst: { kop: "Je fiets weer als nieuw", onderregel: "Reparatie en onderhoud van stadsfietsen.", knop: "Maak een afspraak" } });
    const lang = leesModelTekst({ kop: "Fietsen ".repeat(30), onderregel: "Onderhoud", knop: "Bel" }, invoer);
    expect(lang.tekst.kop.length).toBeLessThanOrEqual(GRENS.kop);
  });

  it("een verzonnen veld valt terug op het sjabloon; zonder bruikbare kop is het hele antwoord het sjabloon", () => {
    const vast = sjabloonTekst(invoer);
    const deels = leesModelTekst({ kop: "Je fiets weer als nieuw", onderregel: "Nu met 50% korting!", knop: "Bel ons" }, invoer);
    expect(deels).toEqual({ bron: "model", tekst: { kop: "Je fiets weer als nieuw", onderregel: vast.onderregel, knop: "Bel ons" } });
    for (const slecht of [null, "tekst", 5, [], {}, { kop: "" }, { kop: "De beste fietsenmaker, 100% garantie" }, { kop: { a: { b: { c: { d: "te diep" } } } } }]) {
      expect(leesModelTekst(slecht, invoer), JSON.stringify(slecht)).toEqual({ bron: "sjabloon", tekst: vast });
    }
  });
});

describe("de prijs: één bron", () => {
  it("de standaard is € 29 voor één ontwerp en € 49 voor alle ontwerpen, exclusief btw", () => {
    expect(STANDAARD_PRIJZEN).toEqual({ een: "\u{20AC} 29", alle: "\u{20AC} 49", logo: "\u{20AC} 49" });
    expect(prijsTekst(STANDAARD_PRIJZEN, "een")).toBe("\u{20AC} 29 excl. btw");
    expect(vanafTekst()).toBe("Vanaf \u{20AC} 29");
  });

  it("Beheer overschrijft per veld; leeg of onbruikbaar = de standaard", () => {
    expect(geldendePrijzen(null)).toEqual(STANDAARD_PRIJZEN);
    expect(geldendePrijzen({ een: "", alle: "  " })).toEqual(STANDAARD_PRIJZEN);
    expect(geldendePrijzen({ een: "\u{20AC} 35", alle: 12, logo: "\u{20AC} 59" })).toEqual({ een: "\u{20AC} 35", alle: STANDAARD_PRIJZEN.alle, logo: "\u{20AC} 59" });
    // iets anders dan een bedrag telt niet: dan geldt de standaard
    expect(geldendePrijzen({ een: "<b>\u{20AC} 39</b>", alle: "gratis", logo: "vanaf 10" })).toEqual(STANDAARD_PRIJZEN);
  });

  it("een prijs uit Beheer is alleen een bedrag en wordt genormaliseerd opgeslagen", () => {
    for (const [in_, uit] of [["29", "\u{20AC} 29"], [" \u{20AC}29 ", "\u{20AC} 29"], ["\u{20AC} 29", "\u{20AC} 29"], ["29,5", "\u{20AC} 29,50"], ["29.50", "\u{20AC} 29,50"], ["029", "\u{20AC} 29"], ["29,00", "\u{20AC} 29"], ["", ""], ["   ", ""]] as const) expect(normaliseerPrijs(in_), in_).toBe(uit);
    expect(normaliseerPrijs(undefined)).toBe("");
    for (const fout of ["gratis", "vanaf 29", "29 euro", "\u{20AC} 29 excl. btw", "-5", "0", "0,00", "29,999", "1e3", "<b>29</b>", "123456", 29, {}]) expect(normaliseerPrijs(fout), String(fout)).toBeNull();
    const route = readFileSync(join(ROOT, "lib", "advertentie", "store.ts"), "utf8");
    expect(route).toContain("AppError.validation(PRIJS_FOUT");
  });

  // de pagina /advertentie-op-maat en zijn schermen zijn op 22 nov 2026 weggehaald; de melding blijft (Beheer)
  it("het aanbod noemt dezelfde prijs en de melding verzint geen eigen bedrag", () => {
    expect(AANBOD.find((a) => a.slug === "advertentie-op-maat")).toMatchObject({ pijler: "online", pagina: "/advertentie-op-maat", status: "beschikbaar", prijs: "Vanaf \u{20AC} 29 excl. btw, je ziet eerst het voorbeeld" });
    for (const pad of [["lib", "advertentie", "melding.ts"]]) {
      const bron = readFileSync(join(ROOT, ...pad), "utf8").replace(/\/\/.*$/gm, "");
      expect(bron, pad.join("/")).not.toMatch(/\u{20AC}\s?\d/u);
    }
  });
});

describe("de ontwerpen en de voorbeelden", () => {
  it("de lettergrootte krimpt bij lange tekst en laat het langste woord op één regel passen", () => {
    const treden = [[14, 132], [26, 110], [999, 76]] as const;
    expect(lettergrootte("Pizza", 900, treden)).toBe(132);
    expect(lettergrootte("Je fiets weer als nieuw", 900, treden)).toBe(110);
    expect(lettergrootte("x ".repeat(40), 900, treden)).toBe(76);
    const woord = "Arbeidsongeschiktheidsverzekering";
    expect(lettergrootte(woord, 900, treden) * woord.length * 0.56).toBeLessThanOrEqual(900);
  });

  it("de voorbeelden op de landingspagina zijn verzonnen, zonder prijs of claim, en passen binnen de grenzen", () => {
    expect(VOORBEELDEN.map((v) => v.ontwerp).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    for (const v of VOORBEELDEN) {
      const g = v.gegevens;
      expect(`${g.kop} ${g.onderregel} ${g.knop}`).not.toMatch(/\u{20AC}|%|korting|gratis|beste/iu);
      expect(g.kop.length).toBeLessThanOrEqual(GRENS.kop);
      expect(g.onderregel.length).toBeLessThanOrEqual(GRENS.onderregel);
      expect(schoonTekst(g.kop, 99)).toBe(g.kop);
      expect(schoonTekst(g.onderregel, 199)).toBe(g.onderregel);
    }
  });

  it("de lettertypes voor de beelden staan in public/fonts/advertentie, met bron en licentie", () => {
    const map = join(ROOT, "public", "fonts", "advertentie");
    const beeld = readFileSync(join(ROOT, "lib", "advertentie", "beeld.ts"), "utf8");
    const bestanden = [...beeld.matchAll(/bestand: "([^"]+\.ttf)"/g)].map((m) => m[1]!);
    expect(bestanden.length).toBeGreaterThanOrEqual(4);
    for (const b of bestanden) expect(existsSync(join(map, b)), b).toBe(true);
    const leesmij = readFileSync(join(map, "README.txt"), "utf8");
    for (const b of bestanden) expect(leesmij, b).toContain(b);
    expect(leesmij).toContain("SIL Open Font License");
    expect(Object.keys(FORMATEN)).toEqual(["vierkant", "verhaal", "liggend"]);
  });
});

describe("verzonnen getallen en aanbiedingen", () => {
  it("vergelijkt hele getallen: een 5 staat niet in 2015", () => {
    const sinds: Invoer = { ...invoer, aanbod: "Fietsenmaker sinds 2015 in Zuidbroek" };
    expect(verzint("Al sinds 2015 je fietsenmaker", sinds)).toBe(false);
    expect(verzint("5 redenen om langs te komen", sinds)).toBe(true);
    expect(verzint("Open sinds 201", sinds)).toBe(true);
    expect(verzint("Nu 20 15 keer beter", sinds)).toBe(true);
  });

  it("de contactregel is geen bron: een telefoonnummer laat geen cijfers of woorden door", () => {
    const metNummer: Invoer = { bedrijf: "Bakker Jan", aanbod: "Vers brood en gebak", contact: "06 21 12 34 56", kleur: "oranje" };
    expect(verzint("2 halen, 1 betalen", metNummer)).toBe(true);
    expect(verzint("Bel 06 21 12 34 56", metNummer)).toBe(true);
    const metSite: Invoer = { ...metNummer, contact: "www.gratis-korting.example" };
    expect(verzint("Gratis proeven", metSite)).toBe(true);
    expect(verzint("Nu met korting", metSite)).toBe(true);
  });

  it("herkent aanbiedingen in woorden en losse claims", () => {
    const i: Invoer = { bedrijf: "Bakker Jan", aanbod: "Vers brood en gebak", kleur: "oranje" };
    for (const tekst of ["Twee halen, één betalen", "Tweede gratis", "Drie voor twee", "Voor de halve prijs", "De helft goedkoper", "Kosteloos advies", "Gratis koffie erbij", "De specialist in brood", "Nummer 1 van de stad", "De beste bakker", "Het goedkoopste brood", "Dagelijks geopend", "24/7 open", "Dé specialisten in gebak"]) expect(verzint(tekst, i), tekst).toBe(true);
    for (const tekst of ["Vers brood, elke ochtend", "Gebak voor elk feest", "Een brood voor thuis", "Kom proeven"]) expect(verzint(tekst, i), tekst).toBe(false);
    // wat het bedrijf zelf invulde, mag
    const eigen: Invoer = { ...i, boodschap: "Tweede brood gratis, dagelijks geopend" };
    expect(verzint("Tweede brood gratis", eigen)).toBe(false);
    expect(verzint("Dagelijks geopend", eigen)).toBe(false);
    expect(verzint("Derde brood gratis", eigen)).toBe(true);
  });
});

describe("keuze wisselen na het betaalverzoek en de opruiming", () => {
  it("vrijgeven geldt alleen voor de aanvraag die de beheerder zag", () => {
    const gezien = "2026-11-19T10:00:00.000Z";
    expect(keuzeGewijzigd({ op: gezien }, gezien)).toBe(false);
    expect(keuzeGewijzigd({ op: "2026-11-19T10:05:00.000Z" }, gezien)).toBe(true);
    expect(keuzeGewijzigd(undefined, gezien)).toBe(true);
    expect(KEUZE_GEWIJZIGD).toEqual({ code: "KEUZE_GEWIJZIGD", tekst: "De klant heeft zijn keuze gewijzigd. Bekijk de aanvraag opnieuw." });
    const route = readFileSync(join(ROOT, "app", "api", "admin", "advertentie-op-maat", "route.ts"), "utf8");
    expect(route).toContain("gezienOp");
    expect(route).toContain("{ status: 409 }");
    const store = readFileSync(join(ROOT, "lib", "advertentie", "store.ts"), "utf8");
    expect(store).toContain("if (keuzeGewijzigd(ad.aanvraag, gezienOp)) return { ok: false, rij: ad };");
    expect(readFileSync(join(ROOT, "lib", "logo", "store.ts"), "utf8")).toContain("if (keuzeGewijzigd(logo.aanvraag, gezienOp)) return { ok: false, rij: logo };");
    const scherm = readFileSync(join(ROOT, "components", "admin", "AdvertentieBeheer.tsx"), "utf8");
    expect(scherm).toContain("gezienOp: a.op");
    expect(scherm).toContain("KEUZE_GEWIJZIGD.code");
  });

  it("de grens van de dagelijkse opruiming is dezelfde als die van 'verlopen'", () => {
    const nu = new Date("2026-11-19T12:00:00+01:00");
    const grens = verloopGrens(nu);
    expect(grens.toISOString()).toBe("2026-09-20T11:00:00.000Z");
    expect(verlopen(new Date(grens.getTime() - 1).toISOString(), nu)).toBe(true);
    expect(verlopen(new Date(grens.getTime() + 1).toISOString(), nu)).toBe(false);
    const opslag = readFileSync(join(ROOT, "lib", "advertentie", "opslag.ts"), "utf8");
    expect(opslag).toContain("[ADVERTENTIE_VOORVOEGSEL, LOGO_VOORVOEGSEL].map((v) => kvDeleteStale(v, grens))");
    expect(readFileSync(join(ROOT, "lib", "privacy", "sweep.ts"), "utf8")).toContain("ruimVerlopenOp(now)");
  });
});

describe("het geheugen voor watermerkbeelden", () => {
  afterEach(() => leegGeheugen());
  const beeld = (n: number) => () => Promise.resolve(new Uint8Array([n]).buffer as ArrayBuffer);

  it("maakt een beeld één keer en geeft daarna een kopie uit het geheugen", async () => {
    let gemaakt = 0;
    const maak = () => {
      gemaakt++;
      return beeld(7)();
    };
    const a = await watermerkBeeld("advertentie:x:1", maak, 1000);
    const b = await watermerkBeeld("advertentie:x:1", maak, 2000);
    expect(gemaakt).toBe(1);
    expect(new Uint8Array(b)[0]).toBe(7);
    expect(a).not.toBe(b);
    // na tien minuten opnieuw
    await watermerkBeeld("advertentie:x:1", maak, 1000 + GEHEUGEN_MS + 1);
    expect(gemaakt).toBe(2);
  });

  it("houdt hooguit het maximum vast en gooit het langst ongebruikte weg; een mislukte poging blijft niet staan", async () => {
    for (let i = 0; i < GEHEUGEN_MAX; i++) await watermerkBeeld(`k${i}`, beeld(i), 1000);
    await watermerkBeeld("k0", beeld(0), 1500); // k0 is weer vers
    await watermerkBeeld("nieuw", beeld(9), 2000);
    expect(geheugenGrootte()).toBe(GEHEUGEN_MAX);
    let opnieuw = 0;
    await watermerkBeeld("k0", () => (opnieuw++, beeld(0)()), 2500);
    await watermerkBeeld("k1", () => (opnieuw++, beeld(1)()), 2500);
    expect(opnieuw).toBe(1); // k1 viel eraf, k0 niet
    await expect(watermerkBeeld("stuk", () => Promise.reject(new Error("x")), 3000)).rejects.toThrow("x");
    let daarna = 0;
    await watermerkBeeld("stuk", () => (daarna++, beeld(1)()), 3001);
    expect(daarna).toBe(1);
  });

  it("alleen de watermerkversie gaat het geheugen in", () => {
    for (const pad of [["app", "api", "advertentie", "[id]", "beeld", "route.ts"], ["app", "api", "logo-maker", "[id]", "beeld", "route.ts"]]) {
      const route = readFileSync(join(ROOT, ...pad), "utf8");
      expect(route.match(/watermerkBeeld\(/g)?.length, pad.join("/")).toBe(1);
      expect(route, pad.join("/")).toMatch(/if \(besluit\.watermerk\) \{\s+png = await watermerkBeeld\(/);
    }
  });
});

describe("geen lettertype van buiten", () => {
  /** De tekens in de cmap van een TTF (format 4 en 12). */
  function dekking(buf: Buffer): Set<number> {
    const set = new Set<number>();
    let cmap = 0;
    for (let i = 0; i < buf.readUInt16BE(4); i++) if (buf.toString("ascii", 12 + i * 16, 16 + i * 16) === "cmap") cmap = buf.readUInt32BE(12 + i * 16 + 8);
    for (let i = 0; i < buf.readUInt16BE(cmap + 2); i++) {
      const off = cmap + buf.readUInt32BE(cmap + 4 + i * 8 + 4);
      const fmt = buf.readUInt16BE(off);
      if (fmt === 4) {
        const seg = buf.readUInt16BE(off + 6) / 2;
        const eind = off + 14;
        const start = eind + seg * 2 + 2;
        const delta = start + seg * 2;
        const bereik = delta + seg * 2;
        for (let s = 0; s < seg; s++) {
          const e = buf.readUInt16BE(eind + s * 2);
          const b = buf.readUInt16BE(start + s * 2);
          const d = buf.readInt16BE(delta + s * 2);
          const r = buf.readUInt16BE(bereik + s * 2);
          for (let c = b; c <= e && c !== 0xffff; c++) {
            const v = r === 0 ? c + d : buf.readUInt16BE(bereik + s * 2 + r + (c - b) * 2);
            if ((r === 0 ? v & 0xffff : v) !== 0) set.add(c);
          }
        }
      } else if (fmt === 12) {
        for (let g = 0; g < buf.readUInt32BE(off + 12); g++) for (let c = buf.readUInt32BE(off + 16 + g * 12); c <= buf.readUInt32BE(off + 20 + g * 12); c++) set.add(c);
      }
    }
    return set;
  }
  const map = join(ROOT, "public", "fonts", "advertentie");

  it("elk teken dat de invoerreiniging doorlaat, zit in alle lettertypes van de beelden", () => {
    // de zeven basisletters dekken elk teken dat de reiniging doorlaat; een sierletter die een teken mist, leent het daar
    expect(readdirSync(map).filter((f) => f.endsWith(".ttf")).sort()).toEqual([...BASISLETTERS, ...SIERLETTERS].sort());
    const bestanden = [...BASISLETTERS];
    for (const sier of SIERLETTERS) {
      const set = dekking(readFileSync(join(map, sier)));
      for (const teken of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789&.,-'!?") expect(set.has(teken.codePointAt(0) ?? 0), `${sier} ${teken}`).toBe(true);
    }
    const sets = bestanden.map((f) => dekking(readFileSync(join(map, f))));
    const toegestaan: number[] = [];
    for (let c = 0; c <= 0x2fff; c++) if (IN_LETTERTYPE.test(String.fromCodePoint(c))) toegestaan.push(c);
    expect(toegestaan.length).toBeGreaterThan(250);
    for (const [i, set] of sets.entries()) expect(toegestaan.filter((c) => !set.has(c)).map((c) => c.toString(16)), bestanden[i]).toEqual([]);
    // en schoonTekst laat niets anders door
    const alles = Array.from({ length: 0x3000 }, (_, c) => String.fromCodePoint(c)).join("") + "\u{4E2D}\u{1F600}";
    for (const teken of schoonTekst(alles, 99_999)) expect(IN_LETTERTYPE.test(teken), teken.codePointAt(0)?.toString(16)).toBe(true);
  });

  it("een naam vol accenten, een Chinees teken en een emoji: het renderen haalt niets van buiten", async () => {
    const haal = vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.reject(new Error("geen netwerk in deze test")));
    try {
      const ruw = { bedrijf: "Café Zoë \u{4E2D}\u{6587} \u{1F600} Łódź Ñandú", aanbod: "Crème brûlée, één \u{1F370} en çay \u{2014} «vers» \u{BD} prijs \u{B1} \u{3A9}", plaats: "Škofja Loka", boodschap: "Żółć & Ångström \u{1F525}", contact: "www.café-zoë.example", kleur: "rood" };
      const invoerSchoon = valideerInvoer(ruw);
      expect(invoerSchoon.ok && invoerSchoon.waarde.bedrijf).toBe("Café Zoë Łódź Ñandú");
      if (!invoerSchoon.ok) return;
      const ad = { invoer: invoerSchoon.waarde, tekst: sjabloonTekst(invoerSchoon.waarde) };
      for (const nr of [1, 2, 3, 4, 5, 6] as const) {
        const png = await maakBeeld(gegevensVan(ad), nr, { watermerk: true, formaat: "vierkant", breedte: 200, hoogte: 200 });
        expect(Buffer.from(png).subarray(1, 4).toString("ascii")).toBe("PNG");
      }
      const logo = valideerLogoInvoer({ naam: "Zoë & Łukasz \u{4E2D} \u{1F600}", slogan: "Crème de la crème \u{2728}", branche: "bakker", kleur: "paars", sfeer: "stoer" });
      expect(logo.ok && logo.waarde.naam).toBe("Zoë & Łukasz");
      if (!logo.ok) return;
      for (const sfeer of ["strak", "speels", "klassiek", "stoer"] as const) {
        const { boom, breedte, hoogte } = logoBoom(6, { ...logo.waarde, sfeer }, "kleur-wit", 180, true);
        await maakPng(boom, breedte, hoogte);
      }
      // versie 2: elke sfeer (met de sierletters) en elk van de negen logo's, met accenten in de naam
      const meet = await letterMeter();
      for (const s of SFEREN) {
        for (const nr of [1, 4, 8, 9] as const) {
          const v2 = logoBoom2(nr, { naam: "Zoë Łukasz", slogan: "Crème de la crème", branche: "kleding", kleur: "rood", sfeer: s.id }, { soort: "thema", thema: "donker" }, 160, true, meet);
          await maakPng(v2.boom, v2.breedte, v2.hoogte);
        }
      }
      expect(haal).not.toHaveBeenCalled();
    } finally {
      haal.mockRestore();
    }
  }, 240_000);

  it("het watermerk heeft twee lagen: een stevige in de achtergrondtint en een lichte in de inkttint", () => {
    const g = VOORBEELDEN[0]!.gegevens;
    for (const nr of [1, 2, 3, 4, 5, 6] as const) {
      const tinten = advertentieTinten(nr, g);
      expect(tinten.snij).not.toBe(tinten.inkt);
      const lagen = JSON.stringify(ontwerpBoom(nr, g, "vierkant", 600, true));
      // de snijlaag: de achtergrond, bijna dekkend; de fluisterlaag: de inkt, heel licht
      expect(lagen, String(nr)).toContain(`"color":"${tinten.snij}","opacity":${SNIJ_DEKKING}`);
      expect(lagen, String(nr)).toContain(`"color":"${tinten.inkt}","opacity":${FLUISTER_DEKKING}`);
    }
    expect(SNIJ_DEKKING).toBeGreaterThanOrEqual(0.9);
    expect(FLUISTER_DEKKING).toBeGreaterThanOrEqual(0.08);
    expect(FLUISTER_DEKKING).toBeLessThanOrEqual(0.16);
    // met een kant-en-klare laag ligt het watermerk als één plaatje over het ontwerp (snel), zonder losse tekst
    const metLaag = JSON.stringify(ontwerpBoom(1, g, "vierkant", 600, true, false, "data:image/png;base64,AAAA"));
    expect(metLaag).toContain('"type":"img"');
    expect(metLaag).not.toContain("VOORBEELD");
    // bij het logo: de ondergrond snijdt, de inkt fluistert, op elke ondergrond
    expect(logoTinten({ naam: "X", branche: "anders", kleur: "rood", sfeer: "strak" }, "donker")).toEqual({ snij: "#0B0B0C", inkt: "#FFFFFF" });
    expect(logoTinten({ naam: "X", branche: "anders", kleur: "rood", sfeer: "strak" }, "licht")).toEqual({ snij: "#FFFFFF", inkt: "#111111" });
    expect(logoTinten({ naam: "X", branche: "anders", kleur: "rood", sfeer: "strak" }, "kleur")).toEqual({ snij: "#FFFFFF", inkt: "#B3261E" });
    const boom = JSON.stringify(ontwerpBoom(1, g, "vierkant", 600, true));
    expect(boom.split("VOORBEELD").length).toBeGreaterThan(60);
    expect(JSON.stringify(ontwerpBoom(1, VOORBEELDEN[0]!.gegevens, "vierkant", 600, false))).not.toContain("VOORBEELD");
  });
});
describe("snel en zonder kapotte beelden", () => {
  it("het aantal renders tegelijk volgt het aantal kernen: één vrij, minstens twee, hooguit vier", () => {
    expect([1, 2, 3, 4, 5, 8, 16].map(gelijktijdig)).toEqual([2, 2, 2, 3, 4, 4, 4]);
    expect(WACHT_MS).toBe(30_000);
  });

  it("het watermerkbeeld mag tien minuten in de browser blijven, de schone versie van een beheerder nooit", () => {
    for (const pad of [["app", "api", "advertentie", "[id]", "beeld", "route.ts"], ["app", "api", "logo-maker", "[id]", "beeld", "route.ts"]]) {
      const route = readFileSync(join(ROOT, ...pad), "utf8");
      expect(route, pad.join("/")).toContain('besluit.watermerk ? "private, max-age=600" : beheerder ? "private, no-store" : "private, max-age=300"');
    }
  });

  // de schermen van de bezoeker (VoorbeeldBeeld, Mockups, de resultaatpagina's) zijn op 22 nov 2026 weggehaald
  it("de extra poging in het adres komt niet in de sleutel van het geheugen", () => {
    // die bestaat alleen uit id, nummer en ondergrond
    expect(readFileSync(join(ROOT, "app", "api", "logo-maker", "[id]", "beeld", "route.ts"), "utf8")).not.toContain('searchParams.get("_p")');
  });
});