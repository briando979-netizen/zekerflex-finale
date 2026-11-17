import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inVeelhoek, leesWaarschuwingen, waarschuwingVoor } from "@/lib/integrations/meteoalarm";
import { komendeVakantie, leesSchoolvakanties, schooljaarVan } from "@/lib/integrations/schoolvakanties";
import { vakantieTekst } from "@/lib/integrations/schoolvakanties-tekst";
import { alleenWonen, bagOmschrijving, huisnummerUitAdresregel, huisnummerVan, leesLocatieAdres, leesVerblijfsobject, postcodeVan } from "@/lib/geo/bag";
import { beroepInTaal, escoBeroepVoorTitel } from "@/lib/shifts/esco";
import { ESCO_BEROEPEN } from "@/lib/shifts/esco-beroepen";
import { SHIFT_TEMPLATES } from "@/lib/shifts/catalogus";
import { cbsBlok } from "@/lib/seo-cbs-tekst";
import { CBS_VESTIGINGEN } from "@/lib/seo-cbs";
import { CITIES } from "@/lib/seo-cities";
import { SECTORS } from "@/lib/seo-sectors";
import { GRATIS_DIENSTEN } from "@/lib/gratis/diensten";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { WORKER_PUSH, weerNamen } from "@/lib/i18n/worker-push";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";

const lees = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

// Vijf gratis open bronnen, ronde 2 (16 nov 2026, eigenaar: "go"). Voorbeeldantwoorden zoals gemeten op 16 nov vanaf de server.

describe("weerwaarschuwingen (KNMI via MeteoAlarm)", () => {
  const nu = Date.parse("2026-11-16T03:00:00Z");
  // een ruwe rechthoek om Noord-Brabant en een gebied op zee bij Vlissingen
  const BRABANT = "51.25,4.20 51.80,4.20 51.80,6.05 51.25,6.05";
  const ZEE = "51.40,3.20 51.60,3.20 51.60,3.50 51.40,3.50";
  const alert = (p: { id: string; niveau: string; soort: string; onset: string; expires: string; gebied: string; polygon: string; msgType?: string }) => ({
    alert: {
      identifier: p.id,
      msgType: p.msgType ?? "Alert",
      info: [
        { language: "en-GB", headline: "Severe gusts", onset: p.onset, expires: p.expires, area: [{ areaDesc: "North Brabant", polygon: [p.polygon] }], parameter: [] },
        {
          language: "nl-NL",
          headline: "Zware  windstoten\nin het zuiden.",
          onset: p.onset,
          expires: p.expires,
          area: [{ areaDesc: p.gebied, polygon: [p.polygon] }],
          parameter: [
            { valueName: "awareness_level", value: p.niveau },
            { valueName: "awareness_type", value: p.soort },
          ],
        },
      ],
    },
  });
  const FEED = {
    warnings: [
      alert({ id: "oranje-wind", niveau: "3; orange; Severe", soort: "1; Wind", onset: "2026-11-16T10:00:00+00:00", expires: "2026-11-16T18:00:00+00:00", gebied: "Noord-Brabant", polygon: BRABANT }),
      alert({ id: "geel-mist", niveau: "2; yellow; Moderate", soort: "4; Fog", onset: "2026-11-16T05:00:00+00:00", expires: "2026-11-16T09:00:00+00:00", gebied: "Noord-Brabant", polygon: BRABANT }),
      alert({ id: "zee", niveau: "2; yellow; Moderate", soort: "1; Wind", onset: "2026-11-15T03:14:00+00:00", expires: "2026-11-17T02:46:00+00:00", gebied: "Vlissingen", polygon: ZEE }),
      alert({ id: "verlopen", niveau: "4; red; Extreme", soort: "1; Wind", onset: "2026-11-12T05:30:00+00:00", expires: "2026-11-12T06:48:29+00:00", gebied: "Noord-Brabant", polygon: BRABANT }),
      alert({ id: "groen", niveau: "1; green; Minor", soort: "4; Fog", onset: "2026-11-16T05:00:00+00:00", expires: "2026-11-16T09:00:00+00:00", gebied: "Noord-Brabant", polygon: BRABANT }),
      alert({ id: "ingetrokken", niveau: "4; red; Extreme", soort: "1; Wind", onset: "2026-11-16T10:00:00+00:00", expires: "2026-11-16T18:00:00+00:00", gebied: "Noord-Brabant", polygon: BRABANT, msgType: "Cancel" }),
      alert({ id: "kapot", niveau: "3; orange; Severe", soort: "1; Wind", onset: "2026-11-16T10:00:00+00:00", expires: "2026-11-16T18:00:00+00:00", gebied: "x", polygon: "geen punten" }),
      { iets: "anders" },
    ],
  };
  const lijst = leesWaarschuwingen(FEED, nu);

  it("alleen geldende waarschuwingen, geel of zwaarder; verlopen, groen, ingetrokken en onleesbaar vallen weg", () => {
    expect(lijst.map((w) => w.id)).toEqual(["oranje-wind", "geel-mist", "zee"]);
    expect(lijst[0]).toMatchObject({ soort: "wind", niveau: "oranje", gebied: "Noord-Brabant", kop: "Zware windstoten in het zuiden.", van: "2026-11-16T10:00:00.000Z" });
    expect(leesWaarschuwingen({ niets: true }, nu)).toEqual([]);
  });

  it("de zwaarste waarschuwing op de plek en tijd van een klus; een klus op het land valt buiten een gebied op zee", () => {
    const eindhoven = { lat: 51.44, lon: 5.48 };
    const amsterdam = { lat: 52.37, lon: 4.89 };
    expect(inVeelhoek(eindhoven.lat, eindhoven.lon, lijst[0]!.veelhoeken[0]!)).toBe(true);
    expect(inVeelhoek(amsterdam.lat, amsterdam.lon, lijst[0]!.veelhoeken[0]!)).toBe(false);
    // klus 08:00–17:00 UTC: mist (tot 09:00) en wind (vanaf 10:00) overlappen; wind is zwaarder
    expect(waarschuwingVoor(lijst, eindhoven, Date.parse("2026-11-16T08:00:00Z"), Date.parse("2026-11-16T17:00:00Z"))?.id).toBe("oranje-wind");
    // klus 06:00–09:30 UTC: alleen de mist
    expect(waarschuwingVoor(lijst, eindhoven, Date.parse("2026-11-16T06:00:00Z"), Date.parse("2026-11-16T09:30:00Z"))?.id).toBe("geel-mist");
    // de avond erna: niets meer
    expect(waarschuwingVoor(lijst, eindhoven, Date.parse("2026-11-16T19:00:00Z"), Date.parse("2026-11-16T23:00:00Z"))).toBeNull();
    // Vlissingen-stad ligt niet in het gebied op zee
    expect(waarschuwingVoor(lijst, { lat: 51.44, lon: 3.57 }, nu, nu + 3600_000)).toBeNull();
  });
});

describe("schoolvakanties (Rijksoverheid)", () => {
  const regio = (region: string, startdate: string, enddate: string) => ({ region, startdate, enddate });
  const JSON_2026 = {
    content: [
      {
        vacations: [
          { type: "\n  Herfstvakantie \n", regions: [regio("noord", "2026-10-10T00:00:00.000Z", "2026-10-18T21:59:00.000Z"), regio("midden", "2026-10-17T00:00:00.000Z", "2026-10-25T22:59:00.000Z"), regio("zuid", "2026-10-17T00:00:00.000Z", "2026-10-25T22:59:00.000Z")] },
          { type: " Kerstvakantie ", regions: [regio("heel Nederland", "2026-12-19T00:00:00.000Z", "2027-01-03T22:59:00.000Z")] },
          { type: " Voorjaarsvakantie ", regions: [regio("noord", "2027-02-20T00:00:00.000Z", "2027-02-28T22:59:00.000Z"), regio("zuid", "2027-02-13T00:00:00.000Z", "2027-02-21T22:59:00.000Z"), regio("mars", "x", "y")] },
        ],
      },
    ],
  };
  const lijst = leesSchoolvakanties(JSON_2026);

  it("per regio de eerste en de laatste vakantiedag, in Nederlandse dagen", () => {
    expect(lijst.find((v) => v.naam === "Herfstvakantie" && v.regio === "midden")).toEqual({ naam: "Herfstvakantie", regio: "midden", van: "2026-10-17", tot: "2026-10-25" });
    expect(lijst.find((v) => v.naam === "Kerstvakantie")).toEqual({ naam: "Kerstvakantie", regio: "heel", van: "2026-12-19", tot: "2027-01-03" });
    expect(lijst).toHaveLength(6);
    expect(leesSchoolvakanties({ iets: 1 })).toEqual([]);
    expect(schooljaarVan("2026-11-16")).toBe("2026-2027");
    expect(schooljaarVan("2027-07-31")).toBe("2026-2027");
    expect(schooljaarVan("2027-08-01")).toBe("2027-2028");
  });

  it("de eerstvolgende vakantie binnen zes weken; een vakantie die in één regio al loopt telt mee tot de laatste regio begint", () => {
    expect(komendeVakantie(lijst, "2026-11-16")).toMatchObject({ naam: "Kerstvakantie", dagen: 33, regios: [{ regio: "heel", van: "2026-12-19" }] });
    expect(komendeVakantie(lijst, "2026-10-01")).toMatchObject({ naam: "Herfstvakantie", dagen: 9 });
    // noord is al begonnen, midden en zuid nog niet
    expect(komendeVakantie(lijst, "2026-10-12")).toMatchObject({ naam: "Herfstvakantie", dagen: 0 });
    // alles al begonnen: de volgende (kerst) is meer dan zes weken weg
    expect(komendeVakantie(lijst, "2026-10-20")).toBeNull();
    expect(komendeVakantie(lijst, "2027-01-10")).toMatchObject({ naam: "Voorjaarsvakantie", dagen: 34, regios: [{ regio: "zuid" }, { regio: "noord" }] });
  });

  it("het seintje op het startscherm van de werkgever, in het Nederlands en het Engels", () => {
    const kerst = komendeVakantie(lijst, "2026-11-16")!;
    expect(vakantieTekst(kerst, nl.werkgeverStart)).toEqual({ kop: "De kerstvakantie begint over 33 dagen", regios: [{ regio: "Heel Nederland", periode: "19 dec t/m 3 jan" }] });
    expect(vakantieTekst(kerst, en.werkgeverStart)).toEqual({ kop: "The Christmas school holiday starts in 33 days", regios: [{ regio: "All of the Netherlands", periode: "19 Dec to 3 Jan" }] });
    const voorjaar = komendeVakantie(lijst, "2027-02-12")!;
    expect(vakantieTekst(voorjaar, nl.werkgeverStart)).toEqual({
      kop: "De voorjaarsvakantie begint morgen",
      regios: [
        { regio: "Zuid", periode: "13 feb t/m 21 feb" },
        { regio: "Noord", periode: "20 feb t/m 28 feb" },
      ],
    });
    expect(vakantieTekst({ ...voorjaar, dagen: 0 }, nl.werkgeverStart).kop).toBe("De voorjaarsvakantie begint vandaag");
    // een naam die de Rijksoverheid later toevoegt, komt er in kleine letters te staan
    expect(vakantieTekst({ naam: "Tulpvakantie", dagen: 5, regios: [] }, nl.werkgeverStart).kop).toBe("De tulpvakantie begint over 5 dagen");
    expect(nl.werkgeverStart.vakantieMaanden.split(",")).toHaveLength(12);
    expect(en.werkgeverStart.vakantieMaanden.split(",")).toHaveLength(12);
    const pagina = lees("app/werkgever/page.tsx");
    expect(pagina).toContain("komendeSchoolvakantie().catch(() => null)");
    expect(pagina).toContain("{vakantieRegels && !startModus && (");
  });
});

describe("weerwaarschuwing in de werker-app", () => {
  const SOORTEN = ["wind", "sneeuw", "onweer", "mist", "hitte", "kou", "kust", "brand", "regen", "water"];

  it("elk niveau en elke soort heeft een naam in de vijf talen, ook in de pushmelding", () => {
    for (const taal of ["nl", "en", "pl", "ro", "uk"] as const) {
      const w = FREELANCER_DICTS[taal].detail.weer;
      for (const n of ["geel", "oranje", "rood"]) expect(w.niveaus[n], `${taal} ${n}`).toBeTruthy();
      for (const s of SOORTEN) expect(w.soorten[s], `${taal} ${s}`).toBeTruthy();
      const naam = weerNamen(taal, "oranje", "wind");
      const titel = WORKER_PUSH[taal].weerTitle(naam.niveau, naam.soort);
      expect(titel, taal).toContain(naam.niveau);
      expect(titel, taal).toContain(naam.soort);
      expect(WORKER_PUSH[taal].weerBody("Heftruckchauffeur", "Testbedrijf", "ma 16/11 09:00"), taal).toContain("KNMI");
    }
    expect(weerNamen("pl", "oranje", "wind")).toEqual({ niveau: "pomarańczowy", soort: "wiatr" });
    expect(WORKER_PUSH.nl.weerTitle("oranje", "wind")).toBe("⚠️ Code oranje voor wind");
  });

  it("een melding alleen bij code oranje of rood, eens per inzet; code geel staat alleen op de kluspagina", () => {
    const push = lees("lib/notifications/worker-push.ts");
    expect(push).toContain('.filter((w) => w.niveau !== "geel")');
    expect(push).toContain("claim(`weer-${w.soort}-${w.niveau}`, r.id)");
    expect(push).toContain("claim(`weer-werkgever-${w.soort}-${w.niveau}`, r.shift.id)");
    // een storing bij de weerbron houdt de andere meldingen niet tegen
    expect(push).toContain("await weerPushes(now).catch(");
    const pagina = lees("app/dashboard/klussen/[shiftId]/page.tsx");
    expect(pagina).toContain("waarschuwingVoor(await weerwaarschuwingen().catch(() => [])");
    expect(pagina).toContain('role="status"');
  });
});

describe("pand volgens het Kadaster (BAG via PDOK)", () => {
  const LOCATIE = {
    response: {
      numFound: 3,
      docs: [
        { weergavenaam: "Hoofdstraat 12, 1234AB Dorp", adresseerbaarobject_id: "0363010003761571", huis_nlt: "12" },
        { weergavenaam: "Hoofdstraat 12A, 1234AB Dorp", adresseerbaarobject_id: "0363010003761572", huis_nlt: "12A" },
        { weergavenaam: "Hoofdstraat 12-2, 1234AB Dorp", adresseerbaarobject_id: "0363010003761573", huis_nlt: "12-2" },
      ],
    },
  };

  it("alleen het adres met precies deze letter of toevoeging; past er geen, dan niets", () => {
    expect(leesLocatieAdres(LOCATIE, "12")?.id).toBe("0363010003761571");
    expect(leesLocatieAdres(LOCATIE, "12 a")?.adres).toBe("Hoofdstraat 12A, 1234AB Dorp");
    expect(leesLocatieAdres(LOCATIE, "12-2")?.id).toBe("0363010003761573");
    expect(leesLocatieAdres(LOCATIE, "12b")).toBeNull();
    expect(leesLocatieAdres(LOCATIE, "")).toBeNull();
    expect(leesLocatieAdres({ response: { docs: [{ adresseerbaarobject_id: "kort", huis_nlt: "12" }] } }, "12")).toBeNull();
    expect(leesLocatieAdres(null, "12")).toBeNull();
  });

  it("gebruik en oppervlakte, zoals gemeten voor Dam 1 in Amsterdam; onzin valt weg", () => {
    const winkel = leesVerblijfsobject({ features: [{ properties: { gebruiksdoel: "winkelfunctie", oppervlakte: 23820 } }] });
    expect(winkel).toEqual({ gebruiksdoelen: ["winkelfunctie"], oppervlakte: 23820 });
    expect(bagOmschrijving({ adres: "", ...winkel! })).toBe("winkelfunctie, 23.820 m²");
    const twee = leesVerblijfsobject({ features: [{ properties: { gebruiksdoel: "woonfunctie,kantoorfunctie", oppervlakte: 140 } }] })!;
    expect(bagOmschrijving({ adres: "", ...twee })).toBe("woonfunctie en kantoorfunctie, 140 m²");
    expect(alleenWonen({ adres: "", ...twee })).toBe(false);
    expect(alleenWonen({ adres: "", gebruiksdoelen: ["woonfunctie"], oppervlakte: 72 })).toBe(true);
    expect(alleenWonen({ adres: "", gebruiksdoelen: [], oppervlakte: 72 })).toBe(false);
    expect(leesVerblijfsobject({ features: [] })).toBeNull();
    expect(leesVerblijfsobject({ features: [{ properties: { gebruiksdoel: "<script>", oppervlakte: -1 } }] })).toBeNull();
  });

  it("postcode en huisnummer uit wat er is ingevuld", () => {
    expect(postcodeVan("1012 js")).toBe("1012JS");
    expect(postcodeVan("0123AB")).toBeNull();
    expect(postcodeVan("B-2000")).toBeNull();
    expect(huisnummerVan("12a")).toBe(12);
    expect(huisnummerVan("a12")).toBeNull();
    expect(huisnummerUitAdresregel("Hoofdstraat 12a")).toBe("12a");
    expect(huisnummerUitAdresregel("Plein 1945 3-2, Dorp")).toBe("3-2");
    expect(huisnummerUitAdresregel("Kerkstraat 5 II")).toBeNull();
    expect(huisnummerUitAdresregel("Zonder nummer")).toBeNull();
    expect(huisnummerUitAdresregel(null)).toBeNull();
  });

  it("de elf gebruiksdoelen van de BAG hebben een naam in de vijf talen; beheer en de kluspagina tonen het pand", () => {
    const DOELEN = ["woonfunctie", "kantoorfunctie", "winkelfunctie", "industriefunctie", "bijeenkomstfunctie", "logiesfunctie", "onderwijsfunctie", "gezondheidszorgfunctie", "sportfunctie", "celfunctie", "overige gebruiksfunctie"];
    for (const taal of ["nl", "en", "pl", "ro", "uk"] as const) {
      const p = FREELANCER_DICTS[taal].detail.pand;
      for (const d of DOELEN) expect(p.doelen[d], `${taal} ${d}`).toBeTruthy();
      expect(p.regel("240", "x"), taal).toContain("240");
      expect(p.regel("240", "x"), taal).toContain("Kadaster");
    }
    expect(lees("app/dashboard/klussen/[shiftId]/page.tsx")).toContain('cat.key === "schoonmaak" ? await bagVoorAdres(s.postalCode, huisnummerUitAdresregel(s.address)).catch(() => null) : null');
    const beheer = lees("app/admin/bedrijven/[id]/page.tsx");
    expect(beheer).toContain("Volgens het Kadaster: {bagOmschrijving(bag)}");
    expect(beheer).toContain('tenant.country === "NL" && reg ? bagVoorAdres(reg.postalCode, reg.houseNumber).catch(() => null)');
  });
});

describe("beroep in de taal van de werker (ESCO)", () => {
  it("een vaste functie als los woord in de titel geeft het beroep; een vrije titel niets", () => {
    expect(beroepInTaal("Heftruckchauffeur zaterdag", "pl")).toBe("operator wózka widłowego");
    expect(beroepInTaal("Heftruckchauffeur zaterdag", "ro")).toBe("operator stivuitor");
    expect(beroepInTaal("Gezocht: kassamedewerker (avond)", "en")).toBe("cashier");
    expect(beroepInTaal("Heftruckchauffeur", "uk")).toContain("машиніст");
    expect(beroepInTaal("Heftruckchauffeur", "nl")).toBeNull();
    expect(beroepInTaal("Heftruckchauffeur", "constructor")).toBeNull();
    expect(beroepInTaal("Hulp bij verhuizing", "pl")).toBeNull();
    expect(escoBeroepVoorTitel("Zelfstandig werkend kok")?.en).toBe("cook");
    // alleen als los woord: geen kok in "kokosnoten", geen beveiliger in "evenementenbeveiliger"
    expect(escoBeroepVoorTitel("Kokosnoten sorteren")).toBeNull();
    expect(escoBeroepVoorTitel("Evenementenbeveiliger festival")?.en).toBe("crowd controller");
    // de langste naam wint: de bakkerij is niet zomaar een verkoopmedewerker
    expect(escoBeroepVoorTitel("Verkoopmedewerker bakkerij")?.en).toBe("bakery specialised seller");
    // te breed om een beroep aan te hangen
    expect(escoBeroepVoorTitel("Allround horeca kracht")).toBeNull();
    expect(escoBeroepVoorTitel("Interieurverzorger kantoor")).toBeNull();
  });

  it("elke koppeling hoort bij een bestaande functie en heeft de vier talen; twijfelgevallen zijn niet gekoppeld", () => {
    const keys = new Set(SHIFT_TEMPLATES.map((t) => t.key));
    expect(Object.keys(ESCO_BEROEPEN).length).toBeGreaterThanOrEqual(40);
    for (const [key, b] of Object.entries(ESCO_BEROEPEN)) {
      expect(keys.has(key), key).toBe(true);
      expect(b.id, key).toMatch(/^[0-9a-f-]{36}$/);
      for (const t of ["en", "pl", "ro", "uk"] as const) expect(b[t]?.length ?? 0, `${key} ${t}`).toBeGreaterThan(2);
    }
    // nagelezen op 16 nov 2026: een verkeerd beroep is erger dan geen
    for (const key of ["bezorger", "zorghulp", "productie", "klantenservice", "eventcrew", "activiteitenbegeleider"]) expect(Object.hasOwn(ESCO_BEROEPEN, key), key).toBe(false);
    for (const taal of ["nl", "en", "pl", "ro", "uk"] as const) expect(FREELANCER_DICTS[taal].detail.beroepEsco, taal).toBeTruthy();
    expect(lees("app/dashboard/klussen/[shiftId]/page.tsx")).toContain("beroepInTaal(s.title, locale)");
  });
});

describe("CBS-cijfers op de stadspagina's", () => {
  it("elke stad heeft cijfers die kloppen met elkaar", () => {
    for (const c of CITIES) {
      const v = Object.hasOwn(CBS_VESTIGINGEN, c.slug) ? CBS_VESTIGINGEN[c.slug] : undefined;
      expect(v, c.slug).toBeDefined();
      if (!v) continue;
      expect(v.code, c.slug).toMatch(/^GM\d{4}$/);
      expect(v.jaar, c.slug).toBeGreaterThanOrEqual(2026);
      for (const n of [v.horeca, v.vervoer, v.handel, v.cultuur]) expect(n, c.slug).toBeGreaterThan(0);
      expect(v.horeca + v.vervoer + v.handel + v.cultuur, c.slug).toBeLessThan(v.totaal);
    }
  });

  it("de tekst noemt alleen wat CBS meet, en zegt het erbij als de stad bij een grotere gemeente hoort", () => {
    const ams = cbsBlok("horeca", { slug: "amsterdam", name: "Amsterdam" })!;
    expect(ams.kop).toBe("Amsterdam in cijfers");
    expect(ams.regels[0]).toMatch(/^In de gemeente Amsterdam zijn [\d.]+ bedrijfsvestigingen\.$/);
    expect(ams.regels[1]).toMatch(/^Daarvan zijn er [\d.]+ horecazaken\.$/);
    expect(ams.bron).toMatch(/^Bron: CBS StatLine, vestigingen van bedrijven op 1 januari 20\d\d\./);
    expect(cbsBlok("logistiek", { slug: "amsterdam", name: "Amsterdam" })?.regels[1]).toContain("vervoer en opslag");
    expect(cbsBlok("retail", { slug: "amsterdam", name: "Amsterdam" })?.regels[1]).toContain("winkels, groothandel en autohandel");
    // voor schoonmaak heeft CBS geen eigen bedrijfstak in deze tabel: alleen het totaal
    expect(cbsBlok("schoonmaak", { slug: "amsterdam", name: "Amsterdam" })?.regels).toHaveLength(1);
    expect(cbsBlok("horeca", { slug: "hoogezand", name: "Hoogezand-Sappemeer" })?.regels[0]).toContain("de gemeente Midden-Groningen, waar Hoogezand-Sappemeer bij hoort");
    expect(cbsBlok("horeca", { slug: "constructor", name: "x" })).toBeNull();
    expect(cbsBlok("constructor", { slug: "amsterdam", name: "Amsterdam" })?.regels).toHaveLength(1);
    for (const s of SECTORS) expect(cbsBlok(s.key, { slug: "groningen", name: "Groningen" }), s.key).not.toBeNull();
  });

  it("het blok staat op de stadspagina voor werkgevers en voor werkers", () => {
    const src = lees("components/marketing/SectorLanding.tsx");
    expect(src.split("<CbsCijfers sector={s} city={c} />")).toHaveLength(3);
    expect(src).toContain("Bekijk de tabel bij CBS");
  });
});

describe("Alles gratis, ronde 2", () => {
  it("de vijf bronnen staan in de lijst, gratis, met hun host als de app zelf iets opvraagt", () => {
    for (const [id, host] of [["weerwaarschuwingen", "feeds.meteoalarm.org"], ["schoolvakanties", "opendata.rijksoverheid.nl"], ["kadaster-bag", "api.pdok.nl"], ["esco-beroepen", null], ["cbs-vestigingen", null]] as const) {
      const d = GRATIS_DIENSTEN.find((x) => x.id === id);
      expect(d?.status, id).toBe("gratis");
      if (host) expect(d?.hosts, id).toContain(host);
      else expect(d?.hosts, id).toBeUndefined();
    }
  });
});
