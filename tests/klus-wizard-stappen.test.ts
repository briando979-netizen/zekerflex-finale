import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { conceptCost, kostenUitUren } from "@/lib/klusconcept/concept";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";

// Klus uitzetten in twee stappen (22 nov 2026, eigenaar: "alle opties moet standaard worden getoond, net als YoungOnes"):
// het uitgebreide formulier (components/app/NewShiftForm.tsx) is de standaard, met een stappenbalk 1 "Klus omschrijven"
// en 2 "Klus inplannen", een live voorbeeld naast het formulier (op een telefoon een uitklapper) en de kosten bij de knop.
// "Snel een klus plaatsen" blijft als korte link (?snel=1). Er verdwijnt geen enkel veld.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("de kosten bij het uitgebreide formulier", () => {
  it("geven voor één dag hetzelfde als /klus-plaatsen en Snel plaatsen (conceptCost)", () => {
    const uitUren = kostenUitUren({ hours: 7.5, positions: 1, rateCents: 1_700 });
    expect(uitUren).toEqual(conceptCost({ start: "09:00", end: "17:00", breakMinutes: 30, positions: 1, rateCents: 1_700 }));
    // 7,5 uur × € 17 = € 127,50 loon, € 3,50 per uur = € 26,25 platform, samen € 153,75 (en dat staat er, niet € 154)
    expect(uitUren.grossTotalCents).toBe(12_750);
    expect(uitUren.feeTotalCents).toBe(2_625);
    expect(uitUren.totalCents).toBe(15_375);
  });

  it("tellen meer mensen en meer dagen mee: loon en platform over alle gewerkte uren", () => {
    const k = kostenUitUren({ hours: 6, positions: 2, rateCents: 1_700, days: 2 });
    expect(k.totalHours).toBe(24);
    expect(k.grossTotalCents).toBe(6 * 1_700 * 2 * 2);
    expect(k.feeTotalCents).toBe(8_400);
    expect(k.totalCents).toBe(k.grossTotalCents + k.feeTotalCents);
  });

  it("rekenen niet met onzin: geen uren is nul, plekken en dagen blijven binnen hun grenzen", () => {
    expect(kostenUitUren({ hours: 0, positions: 1, rateCents: 1_700 }).totalCents).toBe(0);
    expect(kostenUitUren({ hours: -3, positions: 1, rateCents: 1_700 }).totalCents).toBe(0);
    expect(kostenUitUren({ hours: 1, positions: 0, rateCents: 1_000 }).grossTotalCents).toBe(1_000);
    expect(kostenUitUren({ hours: 1, positions: 500, rateCents: 1_000 }).grossTotalCents).toBe(50_000);
  });
});

describe("de teksten van de twee stappen", () => {
  const sleutels = ["stappenLabel", "stap1", "stap2", "stap1Uitleg", "stap2Uitleg", "volgende", "terug", "titelKort", "kopieNota"] as const;

  it("staan in het Nederlands en het Engels, en geen enkele is leeg", () => {
    for (const k of sleutels) {
      expect(nl.newShiftForm[k].trim(), `nl ${k}`).not.toBe("");
      expect(en.newShiftForm[k].trim(), `en ${k}`).not.toBe("");
    }
    expect(nl.newShiftForm.stap1).toBe("Klus omschrijven");
    expect(nl.newShiftForm.stap2).toBe("Klus inplannen");
    expect(nl.newShift.snelLink).toBe("Liever snel? Plaats een klus in 1 minuut");
    expect(en.newShift.snelLink.length).toBeGreaterThan(5);
  });

  it("de melding bij een kopie noemt de oude tijden in beide talen", () => {
    expect(nl.newShiftForm.kopieNota).toContain("{van}");
    expect(nl.newShiftForm.kopieNota).toContain("{tot}");
    expect(en.newShiftForm.kopieNota).toContain("{van}");
    expect(en.newShiftForm.kopieNota).toContain("{tot}");
  });

  it("gewone taal: een functie kiezen, geen sjabloon, en 'klus' in plaats van 'dienst'", () => {
    expect(nl.newShift.subtitle).not.toMatch(/sjabloon/i);
    expect(en.newShift.subtitle).not.toMatch(/template/i);
    expect(nl.newShiftForm.titel).toBe("Titel van de klus");
    expect(nl.newShiftForm.titelFallback).toBe("Titel van de klus");
  });
});

describe("het formulier (bron-controle)", () => {
  const form = lees("components/app/NewShiftForm.tsx");
  const begin1 = form.indexOf("stap 1: klus omschrijven");
  const begin2 = form.indexOf("stap 2: klus inplannen");
  const einde = form.indexOf("live preview");
  const stap1 = form.slice(begin1, begin2);
  const stap2 = form.slice(begin2, einde);

  it("de twee stappen staan na elkaar in één formulier", () => {
    expect(begin1).toBeGreaterThan(0);
    expect(begin2).toBeGreaterThan(begin1);
    expect(einde).toBeGreaterThan(begin2);
  });

  it("stap 1 is klus omschrijven: functie, titel, omschrijving, kleding en annuleringstermijn", () => {
    for (const stuk of ["<SjabloonGalerij", 'name="title"', 'name="description"', 'name="dresscode"', 'name="annuleerUren"', "onClick={naarStap2}"]) {
      expect(stap1, stuk).toContain(stuk);
    }
    expect(stap1).not.toContain('name="startsAt"');
  });

  it("stap 2 is klus inplannen: locatie, tijden, plekken, tarief en de overige opties, met de knop", () => {
    for (const stuk of ['name="branchId"', 'name="adHocLabel"', 'name="startsAt"', 'name="endsAt"', 'name="breakMinutes"', 'name="positions"', "<FairPayMeter", "toggleDate", 'name="kostenplaats"', 'name="poolId"', 'name="autoAcceptFavorieten"', 'name="viaUitzendbureau"', "<Submit"]) {
      expect(stap2, stuk).toContain(stuk);
    }
    expect(stap2).not.toContain('name="title"');
  });

  it("er verdwijnt geen enkel veld: alles wat het formulier ooit naar de server stuurde staat er nog", () => {
    for (const naam of ["templateKey", "hourlyRateCents", "extraDates", "adHocLabel", "adHocPostalCode", "adHocCity", "adHocLatitude", "adHocLongitude", "branchId", "title", "description", "dresscode", "viaUitzendbureau", "autoAcceptFavorieten", "startsAt", "endsAt", "breakMinutes", "positions", "annuleerUren", "kostenplaats", "poolId"]) {
      expect(form, naam).toContain(`name="${naam}"`);
    }
  });

  it("een stap die je niet ziet blijft in het formulier (hidden), zodat zijn velden meedoen; bij bewerken is het één scherm", () => {
    expect(form).toContain("<div hidden={!toon1}");
    expect(form).toContain("<div hidden={!toon2}");
    expect(form).toContain("const metStappen = !edit;");
    expect(form).toContain("const toon1 = !metStappen || stap === 1;");
    expect(form).toContain("const toon2 = !metStappen || stap === 2;");
    expect(form).not.toMatch(/\{stap === 1 &&|\{stap === 2 &&/);
  });

  it("de stappenbalk is een genummerde lijst met de huidige stap aangegeven", () => {
    expect(form).toContain("aria-label={n.stappenLabel}");
    expect(form).toContain('aria-current={huidig ? "step" : undefined}');
    expect(form).toContain("{[n.stap1, n.stap2].map(");
    // terug naar stap 1 kan via de balk en via Terug
    expect(form).toContain("onClick={() => setStap(1)}");
  });

  // ronde 2 (23 nov 2026), naast de referentie gelegd
  it("de stappenbalk staat boven de kaarten: twee grote genummerde cirkels met een lijn ertussen", () => {
    const balk = form.indexOf("<ol aria-label={n.stappenLabel}");
    expect(balk).toBeGreaterThan(0);
    // vóór het formulier, dus buiten de kaarten
    expect(balk).toBeLessThan(form.indexOf("<form {..."));
    expect(form).toContain("rounded-full border-2 font-display text-base font-bold sm:h-11 sm:w-11 sm:text-lg");
    expect(form).toContain('<li role="presentation" aria-hidden className={`h-0.5 min-w-4 flex-1 rounded-full ${stap > 1 ? "bg-brand-500" : "bg-hairstrong"}`} />');
  });

  it("het formulier staat in secties met een kop, elk in een eigen kaart; bij wijzigen blijft het één geheel zonder koppen", () => {
    expect(form).toContain("function Sectie({ titel, kaart, children }");
    expect(form).toContain('if (!kaart) return <div className="space-y-7">{children}</div>;');
    for (const s of ["sectieFunctie", "sectieBasis", "sectieVereisten"]) expect(stap1, s).toContain(`<Sectie titel={n.${s}} kaart={metStappen}>`);
    for (const s of ["sectieLocatie", "sectieTijd", "sectieTarief"]) expect(stap2, s).toContain(`<Sectie titel={n.${s}} kaart={metStappen}>`);
    expect(stap2).toContain("<Sectie titel={n.sectieExtra} kaart>");
    expect(form.match(/<Sectie /g)?.length).toBe(form.match(/<\/Sectie>/g)?.length);
    for (const s of ["sectieFunctie", "sectieBasis", "sectieVereisten", "sectieLocatie", "sectieTijd", "sectieTarief", "sectieExtra"] as const) {
      expect(nl.newShiftForm[s].trim(), `nl ${s}`).not.toBe("");
      expect(en.newShiftForm[s].trim(), `en ${s}`).not.toBe("");
    }
    expect(nl.newShiftForm.sectieBasis).toBe("Basisinformatie");
    // twee kolommen waar het past, en het voorbeeld in een vaste smalle kolom ernaast
    expect(form).toContain('className={metStappen ? "grid gap-6 xl:grid-cols-2" : "space-y-7"}');
    expect(form).toContain("lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]");
  });

  it("het zoekveld van de functiekiezer wordt niet afgeknepen: is de kaart te smal, dan komt de keuzelijst eronder", () => {
    const galerij = lees("components/app/SjabloonGalerij.tsx");
    expect(galerij).toContain('<div className="mt-2 flex flex-wrap gap-2">');
    expect(galerij).toContain('<div className="relative min-w-0 flex-[1_1_19rem]">');
    expect(galerij).not.toContain("sm:grid-cols-[minmax(0,1fr)_13rem]");
  });

  it("Volgende controleert de titel met een melding (role alert) en Enter gaat naar de volgende stap", () => {
    expect(form).toContain("if (title.trim().length < 3) {");
    expect(form).toContain("setStapFout(n.titelKort);");
    expect(form).toMatch(/id="shift-title-fout" role="alert"/);
    expect(form).toContain("onKeyDown={metStappen && stap === 1 ? enterOpStap1 : undefined}");
    expect(form).toMatch(/function enterOpStap1[\s\S]*?e\.preventDefault\(\);\s*naarStap2\(\);/);
    // een toetsenbord met "Ga" in plaats van Enter dient in stap 1 ook niets in; in stap 2 gaat het formulier gewoon naar de server
    expect(form).toContain("{ action: formAction, onSubmit: stapOpIndienen }");
    expect(form).toMatch(/function stapOpIndienen[\s\S]*?if \(stap !== 1\) return;\s*e\.preventDefault\(\);\s*naarStap2\(\);/);
  });

  it("bij een andere stap gaat de focus naar de kop, en het effect geeft niets terug", () => {
    expect(form).toContain("kop.focus({ preventScroll: true });");
    expect(form).toContain('kop.scrollIntoView({ block: "start" });');
    expect(form).not.toMatch(/useEffect\(\(\) => (stapKop|kop)\./);
  });

  it("de kosten komen uit de gedeelde som en de teksten van Snel plaatsen; er staat geen vast platformtarief meer", () => {
    expect(form).toContain("kostenUitUren({");
    expect(form).toContain("function KostenBlok(");
    expect(form).toContain("{teksten.kostenTotaal}");
    expect(form).not.toMatch(/\*\s*3[.,]5\b/);
    // 23 nov 2026: alle bedragen op de cent (twee decimalen), het totaal is de som van loon en platformkosten, en de regel is de
    // gedeelde KostenLijst met één doorlopende scheidingslijn
    // de taal komt uit één plek (lib/klusconcept/weergave.ts): `const taal: WeergaveTaal = locale === "en" ? "en" : "nl"`
    expect(form).toContain("const bedragen = kostenBedragen(kosten, taal);");
    expect(form).toContain("totaal: bedragen.totaal,");
    expect(form).toContain("<KostenLijst");
    expect(form).not.toMatch(/maximumFractionDigits: 0|euroHeel/);
    // bij de knop (op een telefoon uitgebreid, op een laptop het totaal) én onder het voorbeeld op een laptop
    expect(form).toContain('<KostenBlok {...kostenRegels} className="lg:hidden" />');
    expect(form).toContain('<KostenBlok {...kostenRegels} className="mt-3 hidden lg:block" />');
  });

  it("het voorbeeld staat op een laptop naast het formulier en is op een telefoon een uitklapper onderaan", () => {
    expect(form).toContain("aria-expanded={voorbeeldOpen}");
    expect(form).toContain('aria-controls="klus-voorbeeld"');
    expect(form).toContain('className={voorbeeldOpen ? "mt-3" : "hidden lg:block"}');
    expect(form).toContain("lg:sticky");
    // een hoge kolom scrolt zelf in plaats van onderaan af te kappen
    expect(form).toContain("lg:max-h-[calc(100vh_-_7rem)]");
    expect(form).toContain("lg:overflow-y-auto");
  });

  it("tikdoelen van 44 px bij de knoppen van de wizard", () => {
    expect(form).toContain('className="btn-primary min-h-[44px] w-full disabled:opacity-50"');
    expect(form).toContain('className="btn-primary min-h-[44px] w-full sm:w-auto sm:px-10"');
    expect(form).toContain('className="btn-ghost min-h-[44px] sm:flex-shrink-0"');
  });

  it("een kopie ('Klus dupliceren') vult het formulier, alleen de datum is nieuw", () => {
    expect(form).toContain("voorinvulling?: SnelVoorinvulling;");
    expect(form).toContain("kopie?.titel");
    expect(form).toContain("kopie?.personen");
    expect(form).toContain("annuleerUrenOf(kopie?.annuleerUren");
    expect(form).toContain("defaultValue={kopieVestiging}");
    expect(form).toContain("fmt(n.kopieNota, { van: kopie.van, tot: kopie.tot })");
    // de datum blijft leeg: een verkeerde dag zou ongemerkt kunnen worden uitgezet
    expect(form).toContain('useState(init?.startsAt ?? "")');
  });

  it("nieuwe kleurklassen hebben een regel voor de donkere modus (alleen klassen die er al een hebben)", () => {
    const css = lees("app/globals.css");
    for (const klasse of ["bg-brand-50", "text-brand-700", "bg-paper-soft", "text-neutralx-500", "bg-hair", "border-hair", "border-hairstrong", "text-crit", "text-ink", "bg-white"]) {
      expect(css, klasse).toMatch(new RegExp(`\\.app-scope\\[data-theme="dark"\\] \\.${klasse}`));
    }
  });
});

describe("de pagina Klus uitzetten (bron-controle)", () => {
  const pagina = lees("app/werkgever/diensten/nieuw/page.tsx");

  it("toont standaard het uitgebreide formulier, zonder iets uit te klappen", () => {
    expect(pagina).toContain("{volledig}");
    expect(pagina).not.toContain("<details");
    // ronde 2 (23 nov 2026): het formulier volgt de breedte van de pagina (geen max-w-5xl in het midden) en elke sectie is een
    // eigen kaart in het formulier zelf, met op een telefoon minder opvulling
    expect(pagina).not.toContain("mx-auto max-w-5xl");
    expect(pagina).toContain('<div className={snelModus || branches.length === 0 ? "max-w-5xl" : undefined}>');
    expect(lees("components/app/NewShiftForm.tsx")).toContain('<section className="surface p-4 sm:p-6">');
  });

  it("de korte weg blijft als link ('Liever snel?') en terug kan met 'Alle opties'", () => {
    expect(pagina).toContain("{n.snelLink}");
    expect(pagina).toContain("/werkgever/diensten/nieuw?snel=1");
    expect(pagina).toContain("{d.werkgeverStart.alleOpties}");
    expect(pagina).toContain("{alleenFlexwerk && (");
    // een gekopieerde klus blijft meegaan in beide richtingen
    expect(pagina).toContain("const kopieQuery = kopieId ?");
  });

  it("de kopie gaat naar het uitgebreide formulier", () => {
    expect(pagina).toMatch(/<NewShiftForm[\s\S]*\{\.\.\.\(voorinvulling \? \{ voorinvulling \} : \{\}\)\}[\s\S]*\/>/);
  });
});
