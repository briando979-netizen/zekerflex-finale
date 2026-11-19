import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lettergrootte } from "@/lib/advertentie/ontwerp";
import {
  BEWAAR_DAGEN,
  FORMATEN,
  GRENS,
  STANDAARD_PRIJZEN,
  VOORBEELD_ZIJDE,
  beeldBesluit,
  geldendePrijzen,
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

  it("niet vrijgegeven: altijd klein, vierkant en met watermerk, wat er ook gevraagd wordt", () => {
    for (const status of ["gemaakt", "aangevraagd"] as const) {
      for (const formaat of ["vierkant", "verhaal", "liggend"] as const) {
        for (const ontwerp of [1, 2, 3] as const) {
          expect(beeldBesluit({ ad: ad(status, status === "aangevraagd" ? keuze(ontwerp, "alle") : undefined), ontwerp, beheerder: false, formaat })).toEqual(klein);
        }
      }
    }
  });

  it("vrijgegeven met één ontwerp: alleen dat ontwerp is schoon en groot, de andere houden hun watermerk", () => {
    const vrij = ad("vrijgegeven", keuze(2, "een"));
    expect(beeldBesluit({ ad: vrij, ontwerp: 2, beheerder: false, formaat: "verhaal" })).toEqual({ watermerk: false, formaat: "verhaal", breedte: 1080, hoogte: 1920 });
    expect(beeldBesluit({ ad: vrij, ontwerp: 2, beheerder: false, formaat: "liggend" })).toEqual({ watermerk: false, formaat: "liggend", breedte: 1200, hoogte: 628 });
    expect(beeldBesluit({ ad: vrij, ontwerp: 1, beheerder: false, formaat: "verhaal" })).toEqual(klein);
    expect(beeldBesluit({ ad: vrij, ontwerp: 3, beheerder: false, formaat: "vierkant" })).toEqual(klein);
    expect([1, 2, 3].filter((n) => ontwerpVrij(vrij, n as 1 | 2 | 3))).toEqual([2]);
  });

  it("vrijgegeven met alle drie: elk ontwerp is schoon", () => {
    const vrij = ad("vrijgegeven", keuze(1, "alle"));
    for (const ontwerp of [1, 2, 3] as const) expect(beeldBesluit({ ad: vrij, ontwerp, beheerder: false, formaat: "vierkant" })).toEqual({ watermerk: false, formaat: "vierkant", breedte: 1080, hoogte: 1080 });
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
    expect(valideerAanvraag({ ...basis, ontwerp: 4 })).toMatchObject({ ok: false, veld: "ontwerp" });
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
  it("de standaard is € 29 voor één ontwerp en € 49 voor alle drie, exclusief btw", () => {
    expect(STANDAARD_PRIJZEN).toEqual({ een: "\u{20AC} 29", alle: "\u{20AC} 49", logo: "\u{20AC} 49" });
    expect(prijsTekst(STANDAARD_PRIJZEN, "een")).toBe("\u{20AC} 29 excl. btw");
    expect(vanafTekst()).toBe("Vanaf \u{20AC} 29");
  });

  it("Beheer overschrijft per veld; leeg of onbruikbaar = de standaard", () => {
    expect(geldendePrijzen(null)).toEqual(STANDAARD_PRIJZEN);
    expect(geldendePrijzen({ een: "", alle: "  " })).toEqual(STANDAARD_PRIJZEN);
    expect(geldendePrijzen({ een: "\u{20AC} 35", alle: 12, logo: "\u{20AC} 59" })).toEqual({ een: "\u{20AC} 35", alle: STANDAARD_PRIJZEN.alle, logo: "\u{20AC} 59" });
    expect(geldendePrijzen({ een: "<b>\u{20AC} 39</b>" }).een).toBe("\u{20AC} 39");
  });

  it("het aanbod noemt dezelfde prijs en de pagina's verzinnen geen eigen bedrag", () => {
    expect(AANBOD.find((a) => a.slug === "advertentie-op-maat")).toMatchObject({ pijler: "online", pagina: "/advertentie-op-maat", status: "beschikbaar", prijs: "Vanaf \u{20AC} 29, je ziet eerst het voorbeeld" });
    for (const pad of [["app", "(marketing)", "advertentie-op-maat", "page.tsx"], ["components", "marketing", "advertentie", "AdvertentieResultaat.tsx"], ["components", "marketing", "advertentie", "AdvertentieFormulier.tsx"], ["lib", "advertentie", "melding.ts"]]) {
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
    expect(VOORBEELDEN.map((v) => v.ontwerp).sort()).toEqual([1, 2, 3]);
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
