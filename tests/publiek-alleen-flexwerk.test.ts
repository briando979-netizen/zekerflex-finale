import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Vlag `publiek-alleen-flexwerk` (lib/marketing/flexwerk-only.ts): als hij AAN staat, is de openbare site alleen flexwerk.
// De bestaande tests draaien met de vlag UIT (de standaard) en blijven groen; dit bestand controleert de AAN-situatie.
// De vlag is mockbaar via @/lib/flags (featureEnabled).

const h = vi.hoisted(() => ({ vlagAan: false }));

// de sitemap leest inline prisma.shopProduct.findMany (buiten de .catch), dus die moet een functie zijn; de rest zit achter .catch
vi.mock("@/lib/prisma", () => ({ prisma: { shopProduct: { findMany: async () => [] } } }));
vi.mock("@/lib/nieuws/store", () => ({ geplaatsteBerichten: async () => [] }));
vi.mock("@/lib/flags", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/flags")>();
  return { ...actual, featureEnabled: async (key: string) => (key === "publiek-alleen-flexwerk" ? h.vlagAan : false) };
});

import {
  FLAG_ALLEEN_FLEXWERK,
  isNietFlexwerkPad,
  NIET_FLEXWERK_BAND,
  NIET_FLEXWERK_NAV_KEYS,
  NIET_FLEXWERK_PIJLERS,
  pijlerIsFlexwerk,
  werkruimteIsFlexwerk,
  zichtbareBandRegels,
  zichtbarePijlers,
} from "@/lib/marketing/flexwerk-only";
import { CONTENT_REGISTRY, lijstRegels } from "@/lib/content/store";
import { AANBOD_KOLOMMEN, ALLES_ONLINE, NAV, SNELLE_ACTIES, VOORBEELDSITES, zichtbareAanbodKolommen, zichtbareNav } from "@/lib/marketing/site-nav";
import { PIJLERS } from "@/lib/marketing/aanbod";
import { PLANNING_SAMEN, SAMENVOEGINGEN, WERKRUIMTES, menuVoor, type MenuOpties } from "@/lib/werkgever/werkruimte";
import { PLANNING_TABS } from "@/lib/werkgever/planning-tabs";
import { SAMEN_GROEPEN } from "@/lib/werkgever/samen-tabs";
import { planRegels, uitbreidingen } from "@/lib/abonnement/overzicht";
import { openbareRoutes } from "@/lib/ops/rondgang";
import { robotsVerborgen } from "@/lib/seo/verbergen";

beforeEach(() => {
  h.vlagAan = false;
});

describe("publiek = alleen flexwerk: de bron van waarheid", () => {
  it("de vlag heet precies publiek-alleen-flexwerk", () => {
    expect(FLAG_ALLEEN_FLEXWERK).toBe("publiek-alleen-flexwerk");
  });

  it("alleen online en branche zijn geen flexwerk; personeel en geld wel", () => {
    expect([...NIET_FLEXWERK_PIJLERS].sort()).toEqual(["branche", "online"]);
    expect(pijlerIsFlexwerk("personeel")).toBe(true);
    expect(pijlerIsFlexwerk("geld")).toBe(true);
    expect(pijlerIsFlexwerk("online")).toBe(false);
    expect(pijlerIsFlexwerk("branche")).toBe(false);
  });

  it("de niet-flexwerk-pagina's worden herkend, de flexwerk-pagina's niet", () => {
    for (const p of [
      "/shop",
      "/shop/paskamer",
      "/shop/een-of-ander-product",
      "/producten",
      "/producten/recruitflex-ai",
      "/apps",
      "/apps-en-spelletjes",
      "/online",
      "/website-maken",
      "/website-check",
      "/logo-maker",
      "/advertentie-op-maat",
      "/starters",
      "/domeinnaam",
      "/review-check",
      "/rijschool-software",
      "/verkopen",
      "/developers",
      "/developers/api",
      "/aanbod", // het hele-aanbod-overzicht; de menu-ingang is weg
      "/aanbod/website", // elke /aanbod/<slug>-functiepagina valt nu mee (voorvoegsel)
      "/aanbod/webshop",
      "/aanbod/horeca",
      "/aanbod/flexwerkers-inhuren", // ook de flexwerk-functiepagina's: "aanbod verbergen inclusief wat er is"
      "/aanbod/uitzendkrachten",
      "/aanbod/inchecken-op-locatie",
      "/aanbod/roosterplanner",
      "/aanbod/spoedoproep",
      "/aanbod/facturen-en-betalen",
      "/voor-bureaus", // partnerpagina's uit de voettekst (eigenaar 20 nov)
      "/sales-partner",
      "/klussen", // de publieke open-klussen-blader-/zoeklijst (exact)
      "/open-diensten", // de klussen-kaart
      "/open-diensten/3d",
      "/nieuwe-home", // de proefversies van het herontwerp van 19 nov: dicht (eigenaar, 20 nov)
      "/flexwerk",
    ]) {
      expect(isNietFlexwerkPad(p), p).toBe(true);
    }
    for (const p of [
      "/",
      "/uitzendbureau",
      "/voor-bedrijven",
      "/voor-freelancers",
      "/personeel-inhuren",
      "/prijzen",
      "/klussen/abc123", // een losse klus-advertenties blijft vindbaar (Google Vacatures / JobPosting)
      "/rekentools", // flexwerk-rekentools blijven
      "/rekentools/btw-nummer-check",
      "/kennis",
      "/over-ons",
      "/horeca-vacatures", // flexwerk: horeca-WERK, geen software
      "/freelance-werk", // flexwerk SEO-pagina per stad
      "/nieuws",
    ]) {
      expect(isNietFlexwerkPad(p), p).toBe(false);
    }
  });
});

describe("het hoofdmenu met de vlag aan", () => {
  it("zonder vlag is het menu ongewijzigd (shop en apps blijven)", () => {
    const keys = zichtbareNav(NAV, false).map((n) => n.key);
    expect(keys).toContain("shop");
    expect(keys).toContain("apps");
    expect(zichtbareNav(NAV, false)).toBe(NAV);
  });

  it("met de vlag aan vallen shop, apps en aanbod uit de bovenbalk", () => {
    const keys = zichtbareNav(NAV, true).map((n) => n.key);
    for (const weg of NIET_FLEXWERK_NAV_KEYS) expect(keys, weg).not.toContain(weg);
    expect(keys).not.toContain("aanbod");
    // de flexwerk-knoppen blijven
    expect(keys).toContain("prijzen");
    expect(keys).toContain("kennis");
  });

  it("de Aanbod-uitklap toont zonder vlag vier pijlers, met de vlag aan alleen personeel en geld", () => {
    expect(zichtbareAanbodKolommen(false).map((k) => k.sleutel)).toEqual(AANBOD_KOLOMMEN.map((k) => k.sleutel));
    expect(zichtbareAanbodKolommen(true).map((k) => k.sleutel)).toEqual(["personeel", "geld"]);
  });

  it("de losse Online-links (VOORBEELDSITES, ALLES_ONLINE) zijn niet-flexwerk en vallen dus weg in menu en voettekst", () => {
    // VOORBEELDSITES → /website-maken#voorbeelden, ALLES_ONLINE → /online
    expect(isNietFlexwerkPad(VOORBEELDSITES.href)).toBe(true);
    expect(isNietFlexwerkPad(ALLES_ONLINE.href)).toBe(true);
  });

  it("de snelle acties in het mobiele menu laten met de vlag aan de verborgen klussen-links (lijst, kaart) weg", () => {
    for (const doel of ["werknemers", "bedrijven"] as const) {
      const over = SNELLE_ACTIES[doel].filter((s) => !isNietFlexwerkPad(s.href));
      expect(over.some((s) => s.href === "/klussen"), doel).toBe(false);
      expect(over.some((s) => s.href === "/open-diensten"), doel).toBe(false);
    }
  });

  it("de lopende band op /bedrijven verliest met de vlag aan de software-/website-regels, ook in een eigen versie", () => {
    const standaard = lijstRegels(CONTENT_REGISTRY.find((c) => c.key === "marquee.items")?.default ?? "");
    expect(standaard.length).toBe(10);
    expect(zichtbareBandRegels(standaard, false)).toEqual(standaard);
    const flex = zichtbareBandRegels(standaard, true);
    expect(flex).toHaveLength(7);
    for (const weg of NIET_FLEXWERK_BAND) expect(flex, weg).not.toContain(weg);
    expect(flex).toContain("Gebouwd voor flexibel werk in Nederland");
    // een eigen band van de eigenaar met een spatie te veel valt ook mee
    expect(zichtbareBandRegels(["Snel geregeld", " Meer Google-reviews "], true)).toEqual(["Snel geregeld"]);
  });

  it("zichtbarePijlers filtert de pijlers op dezelfde manier", () => {
    expect(zichtbarePijlers(PIJLERS, false).map((p) => p.sleutel)).toEqual(PIJLERS.map((p) => p.sleutel));
    expect(zichtbarePijlers(PIJLERS, true).map((p) => p.sleutel)).toEqual(["personeel", "geld"]);
  });
});

describe("de nachtelijke rondgang met de vlag aan", () => {
  it("zonder vlag staan de niet-flexwerk-pagina's gewoon in de rondgang", () => {
    const routes = openbareRoutes(undefined, false);
    expect(routes).toContain("/online");
    expect(routes).toContain("/shop");
    expect(routes).toContain("/klussen");
    expect(routes).toContain("/aanbod");
  });

  it("met de vlag aan vallen de verborgen pagina's uit de rondgang, de flexwerk-pagina's blijven", () => {
    const routes = openbareRoutes(undefined, true);
    for (const weg of ["/online", "/shop", "/developers", "/website-maken", "/apps-en-spelletjes", "/rijschool-software", "/klussen", "/open-diensten", "/aanbod"]) {
      expect(routes, weg).not.toContain(weg);
    }
    expect(routes).toContain("/uitzendbureau");
    expect(routes).toContain("/prijzen");
  });
});

describe("noindex op een verborgen pagina", () => {
  it("zonder vlag krijgt een verborgen pagina geen robots-metadata", async () => {
    h.vlagAan = false;
    expect(await robotsVerborgen("/online")).toEqual({});
  });

  it("met de vlag aan komt een verborgen pagina op noindex (links volgen mag)", async () => {
    h.vlagAan = true;
    expect(await robotsVerborgen("/online")).toEqual({ robots: { index: false, follow: true } });
    expect(await robotsVerborgen("/shop")).toEqual({ robots: { index: false, follow: true } });
    // /verkopen (webshop-verkooppartner) ook op noindex
    expect(await robotsVerborgen("/verkopen")).toEqual({ robots: { index: false, follow: true } });
    expect(await robotsVerborgen("/verkopen/start")).toEqual({ robots: { index: false, follow: true } });
    // de aanbod-ingang + elke /aanbod/<slug>-functiepagina, de open-klussen-blader-lijst en de klussen-kaart ook
    expect(await robotsVerborgen("/aanbod")).toEqual({ robots: { index: false, follow: true } });
    expect(await robotsVerborgen("/aanbod/flexwerkers-inhuren")).toEqual({ robots: { index: false, follow: true } });
    expect(await robotsVerborgen("/aanbod/inchecken-op-locatie")).toEqual({ robots: { index: false, follow: true } });
    expect(await robotsVerborgen("/klussen")).toEqual({ robots: { index: false, follow: true } });
    expect(await robotsVerborgen("/open-diensten")).toEqual({ robots: { index: false, follow: true } });
    // de partnerpagina's uit de voettekst
    expect(await robotsVerborgen("/voor-bureaus")).toEqual({ robots: { index: false, follow: true } });
    expect(await robotsVerborgen("/sales-partner")).toEqual({ robots: { index: false, follow: true } });
  });

  it("de voettekst verliest met de vlag aan de partnerlinks (bureaus, sales-partner)", async () => {
    const { STANDAARD_VOETTEKST } = await import("@/lib/ontwerp/menu");
    const alle = STANDAARD_VOETTEKST.kolommen.flatMap((k) => k.links.map((l) => l.href));
    expect(alle).toContain("/voor-bureaus");
    expect(alle).toContain("/sales-partner");
    const over = alle.filter((href) => !isNietFlexwerkPad(href));
    expect(over).not.toContain("/voor-bureaus");
    expect(over).not.toContain("/sales-partner");
    expect(over).toContain("/prijzen");
  });

  it("een flexwerk-pagina blijft indexeerbaar, ook met de vlag aan (incl. de losse klus-advertenties voor Google Vacatures)", async () => {
    h.vlagAan = true;
    expect(await robotsVerborgen("/uitzendbureau")).toEqual({});
    expect(await robotsVerborgen("/prijzen")).toEqual({});
    // de losse klus-advertentie /klussen/<id> blijft vindbaar (geen noindex), alleen de blader-lijst /klussen is verborgen
    expect(await robotsVerborgen("/klussen/abc123")).toEqual({});
  });
});

describe("de bedrijfskant met de vlag aan", () => {
  it("alleen personeel is een flexwerk-werkruimte", () => {
    expect(werkruimteIsFlexwerk("personeel")).toBe(true);
    for (const s of ["website", "webshop", "horeca", "rijschool"]) expect(werkruimteIsFlexwerk(s), s).toBe(false);
  });

  it("de aanmelding/dashboard-keuze toont met de vlag aan alleen personeel", () => {
    // waar RegisterForm, WerkruimteKiezer en DashboardWisselaar op filteren
    expect(WERKRUIMTES.filter(werkruimteIsFlexwerk)).toEqual(["personeel"]);
  });

  it("een bestaand bedrijf houdt zijn open niet-flexwerk-dashboard in de wisselaar (bereikbaar, geen 404)", () => {
    // de wisselaar/kiezer toont: flexwerk OF het open dashboard, zodat een horecazaak haar dashboard houdt
    const actief = "horeca";
    const getoond = WERKRUIMTES.filter((w) => werkruimteIsFlexwerk(w) || w === actief);
    expect(getoond).toContain("horeca");
    expect(getoond).toContain("personeel");
    expect(getoond).not.toContain("webshop");
  });

  it("uitbreidingen: met de vlag aan alleen de flexwerk-pijlers; zonder de vlag alle", () => {
    const alle = uitbreidingen(false).map((g) => g.pijler);
    for (const niet of NIET_FLEXWERK_PIJLERS) expect(alle, niet).toContain(niet);
    const flex = uitbreidingen(true).map((g) => g.pijler);
    for (const niet of NIET_FLEXWERK_PIJLERS) expect(flex, niet).not.toContain(niet);
    expect(flex).toContain("personeel");
  });

  it("het personeel-menu: met de vlag aan vallen telefonie, reviews, 'Jouw branche', mail, WhatsApp en wifi/vpn weg, de personeelsfuncties blijven", () => {
    const opties: MenuOpties = { heeftAfspraken: true, heeftRijschool: true, heeftHoreca: true, horecaModules: [], inApp: false, studio: true };
    // zonder vlag staan ze er gewoon in
    const uit = menuVoor("personeel", opties).map((p) => p.sleutel);
    for (const er of ["telefonie", "reviews", "branche", "mail", "whatsapp", "netwerk", "kalender", "planner", "agenda"]) expect(uit, er).toContain(er);
    expect(uit).not.toContain("planning");
    // met de vlag aan: de niet-flexwerk-items weg (ook branche, de website/webshop-items, de mailbox, WhatsApp en wifi/vpn)
    const aan = menuVoor("personeel", { ...opties, alleenFlexwerk: true }).map((p) => p.sleutel);
    for (const weg of ["telefonie", "reviews", "branche", "website", "winkel", "studio", "mail", "whatsapp", "netwerk", "locatie", "afspraken", "klanten"]) expect(aan, weg).not.toContain(weg);
    // de flexwerk-functies blijven, samengevoegd tot tien regels (zie de volgende test)
    for (const blijft of ["klussen", "planning", "uren", "facturen", "regels", "bedrijf", "cijfers", "berichten", "werkers"]) {
      expect(aan, blijft).toContain(blijft);
    }
  });

  it("samenvoegen met de vlag aan: Planning, Uren, Mijn werkers, Regels, Cijfers en Chat met tabbladen; tien regels", () => {
    const opties: MenuOpties = { heeftAfspraken: true, heeftRijschool: false, heeftHoreca: false, horecaModules: [], inApp: false, studio: true, alleenFlexwerk: true };
    const aan = menuVoor("personeel", opties).map((p) => p.sleutel);
    // de leden staan niet meer los in het menu
    for (const weg of ["kalender", "planner", "agenda", "inchecken", "favorieten", "geblokkeerd", "compliance", "overeenkomsten", "rapportages", "inkaart", "assistent"]) expect(aan, weg).not.toContain(weg);
    expect(aan).toEqual(["start", "klussen", "planning", "werkers", "berichten", "uren", "facturen", "cijfers", "regels", "bedrijf", "kennisbank", "hulp"]);
    // elke samenvoeging heeft tabbladen die precies de leden dekken, met de eerste als ingang
    for (const s of SAMENVOEGINGEN) {
      const groep = (Object.keys(SAMEN_GROEPEN) as (keyof typeof SAMEN_GROEPEN)[]).map((g) => SAMEN_GROEPEN[g]).find((g) => g.sleutel === s.sleutel);
      expect(groep, s.sleutel).toBeDefined();
      expect(groep!.tabs.map((t) => t.id), s.sleutel).toEqual([...s.leden]);
      for (const t of groep!.tabs) expect(t.href, t.id).toMatch(/^\/werkgever\//);
    }
    expect(PLANNING_SAMEN).toEqual(["kalender", "planner", "agenda"]);
    expect(PLANNING_TABS.map((t) => t.href)).toEqual(["/werkgever/kalender", "/werkgever/planner", "/werkgever/agenda"]);
    // en elke ledenpagina toont de tabbladen (bron-controle)
    const paginas: Record<string, string> = { kalender: "app/werkgever/kalender/page.tsx", planner: "app/werkgever/planner/page.tsx", agenda: "app/werkgever/agenda/page.tsx", uren: "app/werkgever/uren/page.tsx", inchecken: "app/werkgever/inchecken/page.tsx", favorieten: "app/werkgever/favorieten/page.tsx", geblokkeerd: "app/werkgever/geblokkeerd/page.tsx", compliance: "app/werkgever/compliance/page.tsx", overeenkomsten: "app/werkgever/overeenkomsten/page.tsx", rapportages: "app/werkgever/rapportages/page.tsx", inkaart: "app/werkgever/in-kaart/page.tsx", berichten: "app/werkgever/berichten/page.tsx", assistent: "app/werkgever/assistent/page.tsx" };
    for (const [id, pad] of Object.entries(paginas)) expect(readFileSync(pad, "utf8"), id).toMatch(/<(SamenTabs|PlanningTabs) /);
  });

  it("de werker-app en Instellingen verbergen de losse diensten met de vlag aan (bron-controle)", () => {
    const account = readFileSync("app/dashboard/account/page.tsx", "utf8");
    for (const pad of ["/dashboard/telefonie", "/dashboard/wifi", "/dashboard/portofoon", "/dashboard/toegangscodes", "/dashboard/voertuig"]) {
      expect(account, pad).toContain(`"${pad}"`);
    }
    expect(account).toContain("NIET_FLEXWERK_ACCOUNT.has(i.href)");
    expect(account).toContain("alleenFlexwerkAan()");
    const instellingen = readFileSync("app/werkgever/instellingen/page.tsx", "utf8");
    expect(instellingen).toContain('...(alleenFlexwerk ? [] : [{ title: s.cApiT');
    expect(instellingen).toContain('...(alleenFlexwerk ? [] : [{ title: "Abonnement en uitbreidingen"');
    expect(instellingen).toContain("...(alleenFlexwerk ? [] : [{ title: d.introductie.menu");
    // het startscherm als takenlijst, zonder de kop-banner en de cijfers; klus plaatsen in drie stappen
    const start = readFileSync("app/werkgever/page.tsx", "utf8");
    expect(start).toContain("{!startModus && alleenFlexwerk && teDoenBlok}");
    expect(start).toContain("{!startModus && !alleenFlexwerk && <EmployerDashboardHero />}");
    const nieuw = readFileSync("app/werkgever/diensten/nieuw/page.tsx", "utf8");
    expect(nieuw).toContain("<SnelPlaatsen");
    expect(nieuw).toContain("<details");
    // één woord voor hetzelfde: "klus", niet "dienst", in de teksten van de werkgeversapp
    const nl = readFileSync("lib/i18n/dictionaries.ts", "utf8");
    for (const oud of ['invShift: "Dienst', 'typeShift: "Dienst', 'sourceShift: "Dienst"', 'uitzetten: "Dienst', 'statDiensten: "diensten"']) expect(nl).not.toContain(oud);
    // de proefversie /flexwerk gaat met de vlag op noindex, /nieuwe-home stond al op noindex
    expect(readFileSync("app/(marketing)/flexwerk/page.tsx", "utf8")).toContain('robotsVerborgen("/flexwerk")');
    expect(readFileSync("app/(marketing)/nieuwe-home/page.tsx", "utf8")).toContain("robots: { index: false");
  });

  it("de abonnementspakketten verdwijnen met de vlag aan (prijs per gewerkt uur); de uitbreidingen blijven", () => {
    const huidig = { plan: "starter" as const, status: "actief" as const, tot: null };
    expect(planRegels(huidig).length).toBeGreaterThan(1);
    expect(planRegels(huidig, true)).toEqual([]);
  });

  it("een nieuw bedrijf zonder klus krijgt met de vlag aan een kort startmenu; na de eerste klus staat alles er weer", () => {
    const opties: MenuOpties = { heeftAfspraken: false, heeftRijschool: false, heeftHoreca: false, horecaModules: [], inApp: false, studio: true, alleenFlexwerk: true };
    const kort = menuVoor("personeel", { ...opties, nogGeenKlussen: true }).map((p) => p.sleutel);
    expect(kort).toEqual(["start", "klussen", "planning", "berichten", "uren", "facturen", "bedrijf", "kennisbank", "hulp"]);
    // wie klussen heeft, houdt alle personeelsfuncties, samengevoegd (mail, whatsapp en wifi/vpn komen niet terug: geen flexwerk)
    const vol = menuVoor("personeel", { ...opties, nogGeenKlussen: false }).map((p) => p.sleutel);
    for (const terug of ["werkers", "regels", "cijfers"]) expect(vol, terug).toContain(terug);
    for (const nooit of ["mail", "whatsapp", "netwerk", "planner", "agenda", "inchecken", "assistent"]) expect(vol, nooit).not.toContain(nooit);
    // zonder de vlag verandert er niets, ook niet voor een nieuw bedrijf
    const zonderVlag = menuVoor("personeel", { ...opties, alleenFlexwerk: false, nogGeenKlussen: true }).map((p) => p.sleutel);
    expect(zonderVlag).toContain("planner");
    expect(zonderVlag).toContain("telefonie");
    expect(zonderVlag).toContain("mail");
  });

  it("de andere dashboards worden niet gefilterd: een bestaand website-bedrijf houdt zijn menu (breek niet)", () => {
    const opties: MenuOpties = { heeftAfspraken: false, heeftRijschool: true, heeftHoreca: true, horecaModules: [], inApp: false, studio: true, alleenFlexwerk: true };
    const website = menuVoor("website", opties).map((p) => p.sleutel);
    expect(website).toContain("studio"); // "Website bouwen"
    expect(website).toContain("website"); // "Website-beheer"
  });
});

describe("de sitemap met de vlag aan", () => {
  async function bouwSitemap(): Promise<{ url: string }[]> {
    const mod = await import("@/app/sitemap");
    // de sitemap heeft een eigen geheugencache van tien minuten; leeg hem zodat de vlagwaarde telt
    const g = globalThis as typeof globalThis & { __zfSitemap?: { sitemap?: unknown } };
    if (g.__zfSitemap) g.__zfSitemap.sitemap = undefined;
    return (await mod.default()) as { url: string }[];
  }

  it("zonder vlag staan de niet-flexwerk-pagina's in de sitemap", async () => {
    h.vlagAan = false;
    const urls = (await bouwSitemap()).map((r) => r.url);
    expect(urls.some((u) => u.endsWith("/online"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/shop"))).toBe(true);
  });

  it("met de vlag aan vallen de verborgen pagina's uit de sitemap, de flexwerk-pagina's blijven", async () => {
    h.vlagAan = true;
    const urls = (await bouwSitemap()).map((r) => r.url);
    const padVan = (u: string) => u.replace(/^https?:\/\/[^/]+/, "");
    for (const u of urls) expect(isNietFlexwerkPad(padVan(u)), u).toBe(false);
    // de flexwerk-kern blijft; /klussen en /aanbod zijn nu verborgen
    expect(urls.some((u) => padVan(u) === "/")).toBe(true);
    expect(urls.some((u) => padVan(u) === "/prijzen")).toBe(true);
    expect(urls.some((u) => padVan(u) === "/uitzendbureau")).toBe(true);
    expect(urls.some((u) => padVan(u) === "/klussen")).toBe(false);
    expect(urls.some((u) => padVan(u) === "/aanbod")).toBe(false);
  });
});
