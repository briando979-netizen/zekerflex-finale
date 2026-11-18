import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { consultatieGegevens, consultatieTekst, wetPast } from "@/lib/nieuws/regels";
import { beoordeelBericht, getallenBuitenBron, leesAntwoord, leesRss, maakSlug, paginaTekst, rubriekVoor, type FeedItem, type NieuwsBericht } from "@/lib/nieuws/regels";
import { NIEUWS_BRONNEN } from "@/lib/nieuws/bronnen";
import { loopNieuwsNa, MAX_PER_RONDE, type NieuwsAfhankelijkheden } from "@/lib/nieuws/ronde";
import { nieuwsKaarten } from "@/lib/nieuws/lijst";
import type { NieuwsStand } from "@/lib/nieuws/store";

// De nieuwsroom (18 nov 2026): de site schrijft zelf korte berichten uit openbare bronnen. Wat hier bewaakt wordt: we
// kiezen alleen nieuws dat bij ons past, een verzonnen getal komt er nooit door, en zonder de vlag gaat er niets vanzelf
// op de site.

const NU = new Date("2026-11-18T10:40:00+01:00");
const lees = (pad: string) => readFileSync(join(process.cwd(), pad), "utf8");

const FEED = `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
<item><guid isPermaLink="false">{A}</guid><link>https://www.cbs.nl/nl-nl/nieuws/2026/46/werkloosheid-stijgt</link><title>Werkloosheid stijgt naar 4,1 procent</title><description>In oktober waren 412 duizend mensen werkloos.</description><pubDate>Tue, 17 Nov 2026 06:30:00 +01:00</pubDate></item>
<item><guid isPermaLink="false">{B}</guid><link>https://www.cbs.nl/nl-nl/nieuws/2026/47/datacenters</link><title>Datacenters verbruiken 5,0 procent van de elektriciteit</title><pubDate>Wed, 18 Nov 2026 06:30:00 +01:00</pubDate></item>
<item><guid isPermaLink="false">{C}</guid><link>https://www.cbs.nl/nl-nl/maatwerk/2026/47/tabel-banen</link><title>Banen van werknemers, tabel</title><pubDate>Wed, 18 Nov 2026 06:30:00 +01:00</pubDate></item>
<item><guid isPermaLink="false">{D}</guid><link>https://www.cbs.nl/nl-nl/nieuws/2026/40/oud</link><title>Meer vacatures in de horeca</title><pubDate>Thu, 01 Oct 2026 06:30:00 +02:00</pubDate></item>
<item><link>geen-adres</link><title>Kapot item</title><pubDate>onzin</pubDate></item>
</channel></rss>`;

const BRONTEKST =
  "Werkloosheid stijgt naar 4,1 procent. In oktober 2026 waren 412 duizend mensen werkloos. Dat is 4,1 procent van de beroepsbevolking. " +
  "Een maand eerder was dat 4,0 procent. Vooral onder jongeren nam de werkloosheid toe. Het aantal werkenden bleef vrijwel gelijk op 9,8 miljoen. ".repeat(3);

const GOED = {
  titel: "Werkloosheid loopt op naar 4,1 procent",
  samenvatting: "In oktober waren 412 duizend mensen werkloos. Vooral jongeren vinden minder snel werk.",
  blokken: [
    { kop: "Wat is er gebeurd?", alineas: ["In oktober waren 412 duizend mensen werkloos. Dat is 4,1 procent van de mensen die kunnen en willen werken. Een maand eerder was dat nog 4,0 procent, dus het cijfer loopt langzaam op."] },
    { kop: "Wie merkt het?", alineas: ["Vooral jongeren zijn vaker werkloos dan een maand geleden. Het aantal mensen met werk bleef ongeveer gelijk op 9,8 miljoen. De arbeidsmarkt verandert dus niet in één keer, maar het wordt voor sommige groepen wel iets lastiger."] },
    { kop: "Wat betekent dit voor jou?", alineas: ["Zoek je werk, dan helpt het om snel te reageren en je profiel compleet te hebben. Huur je mensen in, dan is de kans iets groter dat je op korte termijn iemand vindt. Het is goed om dit cijfer te kennen als je vooruit plant."] },
  ],
};

describe("de feed lezen en kiezen", () => {
  it("leest alleen items met een titel, een https-adres en een geldige datum", () => {
    const items = leesRss(FEED);
    expect(items.map((i) => i.id)).toEqual(["{A}", "{B}", "{C}", "{D}"]);
    expect(items[0]).toMatchObject({ titel: "Werkloosheid stijgt naar 4,1 procent", datum: "2026-11-17T05:30:00.000Z" });
  });

  it("kiest wat over werk, regels of ondernemen gaat en laat de rest liggen", () => {
    expect(rubriekVoor("Werkloosheid stijgt harder onder migranten")).toBe("arbeidsmarkt");
    expect(rubriekVoor("Ruim een kwart meer mkb-bedrijven afgelopen 5 jaar")).toBe("ondernemen");
    expect(rubriekVoor("Minimumloon omhoog per 1 januari")).toBe("regels");
    expect(rubriekVoor("Meer zzp'ers in de bouw")).toBe("regels");
    expect(rubriekVoor("Datacenters verbruiken 5,0 procent van de elektriciteit")).toBeNull();
    expect(rubriekVoor("Prognose levensverwachting 65-jarigen: 21 jaar in 2032")).toBeNull();
  });

  it("haalt de leesbare tekst uit een pagina, zonder menu en scripts", () => {
    const tekst = paginaTekst("<html><nav>Menu</nav><main><h1>Kop</h1><p>Eerste &amp; tweede.</p><script>x()</script></main><footer>Voet</footer></html>");
    expect(tekst).toBe("Kop\nEerste & tweede.");
    // een cijfertabel onder een grafiek telt niet als leestekst
    const metTabel = paginaTekst(`<main><p>De omzet was 9,4 procent hoger.</p><div>${"2021 1e kwartaal -0,9 -1,6 -1,3 ".repeat(12)}</div></main>`);
    expect(metTabel).toBe("De omzet was 9,4 procent hoger.");
  });

  it("maakt een nette slug", () => {
    expect(maakSlug("Werkloosheid stijgt: 4,1%!")).toBe("werkloosheid-stijgt-4-1");
    expect(maakSlug("???")).toBe("bericht");
  });
});

describe("de harde controle", () => {
  it("vindt een getal dat niet in de bron staat", () => {
    expect(getallenBuitenBron("Het is 4,1 procent, dat zijn 412 duizend mensen in 2026.", BRONTEKST, NU)).toEqual([]);
    expect(getallenBuitenBron("Het is 4,3 procent en dat kost € 1.250.", BRONTEKST, NU)).toEqual(["4,3", "1.250"]);
    // kleine telwoorden als cijfer mogen
    expect(getallenBuitenBron("Lees deze 3 punten.", BRONTEKST, NU)).toEqual([]);
  });

  it("keurt een goed bericht goed en een verzonnen cijfer, een belofte of een link af", () => {
    expect(beoordeelBericht(GOED, BRONTEKST, NU)).toEqual({ goed: true, reden: null });
    const metCijfer = { ...GOED, samenvatting: "In oktober waren 450 duizend mensen werkloos." };
    expect(beoordeelBericht(metCijfer, BRONTEKST, NU).reden).toContain("450");
    const metBelofte = { ...GOED, samenvatting: "Bij ZekerFlex vind je gegarandeerd werk." };
    expect(beoordeelBericht(metBelofte, BRONTEKST, NU).goed).toBe(false);
    const metLink = { ...GOED, samenvatting: "Lees meer op www.voorbeeld.example over dit onderwerp." };
    expect(beoordeelBericht(metLink, BRONTEKST, NU).goed).toBe(false);
    expect(beoordeelBericht({ ...GOED, blokken: [{ alineas: ["Te kort."] }] }, BRONTEKST, NU).reden).toContain("te kort");
    // zonder het slot "Wat betekent dit voor jou?" is het geen bericht van ons
    const zonderSlot = { ...GOED, blokken: GOED.blokken.map((x) => ({ ...x, kop: x.kop.replace("Wat betekent dit voor jou?", "Tot slot") })) };
    expect(beoordeelBericht(zonderSlot, BRONTEKST, NU).reden).toContain("Wat betekent dit voor jou?");
    // een vergelijking die de bron niet maakt
    const metSterkst = { ...GOED, samenvatting: "In oktober waren 412 duizend mensen werkloos. De horeca groeide het sterkst." };
    expect(beoordeelBericht(metSterkst, BRONTEKST, NU).reden).toContain("sterkst");
    expect(beoordeelBericht(metSterkst, `${BRONTEKST} De horeca groeide het sterkst.`, NU).goed).toBe(true);
  });

  it("leest het antwoord van het model soepel", () => {
    expect(leesAntwoord(GOED)).toEqual(GOED);
    // een object waar tekst hoort, alinea's als één tekst, en een leeg blok ertussen
    const scheef = { title: { tekst: GOED.titel }, intro: GOED.samenvatting, secties: [{ heading: "Kop", tekst: `${GOED.blokken[0]?.alineas[0]}\n\n${GOED.blokken[1]?.alineas[0]}` }, null, { kop: "Leeg", alineas: [] }] };
    const r = leesAntwoord(scheef);
    expect(r?.titel).toBe(GOED.titel);
    expect(r?.blokken).toHaveLength(1);
    expect(r?.blokken[0]?.alineas).toHaveLength(2);
    expect(leesAntwoord("geen json")).toBeNull();
    expect(leesAntwoord({ titel: "x" })).toBeNull();
  });
});

const CBS = NIEUWS_BRONNEN.find((b) => b.id === "cbs")!;
const WET = NIEUWS_BRONNEN.find((b) => b.id === "consultatie")!;

function proef(over: Partial<NieuwsAfhankelijkheden> = {}) {
  const bewaard: NieuwsBericht[] = [];
  const gezien = new Set<string>();
  const standen: NieuwsStand[] = [];
  const schrijf = vi.fn(async (): Promise<unknown> => GOED);
  const d: NieuwsAfhankelijkheden = {
    vanzelf: async () => false,
    bronnen: [CBS],
    haalFeed: async (): Promise<FeedItem[]> => leesRss(FEED),
    haalPagina: async () => BRONTEKST,
    schrijf,
    isGezien: async (id) => gezien.has(id),
    zetGezien: async (id) => void gezien.add(id),
    slugs: async () => bewaard.map((b) => b.slug),
    bewaar: async (b) => void bewaard.push(b),
    bewaarStand: async (s) => void standen.push(s),
    ruimOp: async () => 0,
    ...over,
  };
  return { d, bewaard, gezien, schrijf };
}

describe("een ronde", () => {
  it("schrijft alleen over vers nieuws dat past, en bewaart het als concept zolang de vlag uit staat", async () => {
    const { d, bewaard, gezien, schrijf } = proef();
    const s = await loopNieuwsNa(d, NU);
    // {A} past; {B} past niet; {C} is geen nieuwsbericht (maatwerk); {D} is te oud
    expect(schrijf).toHaveBeenCalledTimes(1);
    expect(s).toMatchObject({ vanzelf: false, bekeken: 2, paste: 1, geschreven: 1, geplaatst: 0 });
    expect(bewaard).toHaveLength(1);
    expect(bewaard[0]).toMatchObject({ status: "concept", rubriek: "arbeidsmarkt", slug: "werkloosheid-loopt-op-naar-4-1-procent", bron: { naam: "CBS", url: "https://www.cbs.nl/nl-nl/nieuws/2026/46/werkloosheid-stijgt" } });
    expect(bewaard[0]?.geplaatst).toBeUndefined();
    expect([...gezien].sort()).toEqual(["{A}", "{B}"]);
    // een tweede ronde doet niets dubbel
    const s2 = await loopNieuwsNa(d, NU);
    expect(s2.bekeken).toBe(0);
    expect(bewaard).toHaveLength(1);
  });

  it("plaatst vanzelf als de vlag aan staat", async () => {
    const { d, bewaard } = proef({ vanzelf: async () => true });
    const s = await loopNieuwsNa(d, NU);
    expect(s.geplaatst).toBe(1);
    expect(bewaard[0]).toMatchObject({ status: "geplaatst", door: "vanzelf", geplaatst: NU.toISOString() });
  });

  it("plaatst nooit een bericht met een verzonnen getal, ook niet met de vlag aan", async () => {
    const { d, bewaard, gezien } = proef({ vanzelf: async () => true, schrijf: async () => ({ ...GOED, samenvatting: "In oktober waren 500 duizend mensen werkloos." }) });
    const s = await loopNieuwsNa(d, NU);
    expect(bewaard).toHaveLength(0);
    expect(s.afgekeurd).toHaveLength(1);
    expect(s.afgekeurd[0]?.reden).toContain("500");
    expect(gezien.has("{A}")).toBe(true);
  });

  it("vraagt één keer om een langere versie als het model te kort schrijft", async () => {
    const kort = { ...GOED, blokken: [{ kop: "Wat betekent dit voor jou?", alineas: ["In oktober waren 412 duizend mensen werkloos, dat is goed om te weten."] }] };
    const schrijf = vi.fn(async (invoer: { teKort?: number }): Promise<unknown> => (invoer.teKort ? GOED : kort));
    const { d, bewaard } = proef({ schrijf });
    await loopNieuwsNa(d, NU);
    expect(schrijf).toHaveBeenCalledTimes(2);
    expect(schrijf.mock.calls[1]?.[0].teKort).toBeGreaterThan(10);
    expect(bewaard).toHaveLength(1);
    expect(bewaard[0]?.blokken).toHaveLength(3);
    // blijft het te kort, dan wordt het afgekeurd en niet geplaatst
    const altijdKort = vi.fn(async (): Promise<unknown> => kort);
    const twee = proef({ schrijf: altijdKort, vanzelf: async () => true });
    const s = await loopNieuwsNa(twee.d, NU);
    expect(altijdKort).toHaveBeenCalledTimes(2);
    expect(twee.bewaard).toHaveLength(0);
    expect(s.afgekeurd[0]?.reden).toContain("te kort");
  });

  it("probeert het later opnieuw als het model of de bron het niet doet", async () => {
    const { d, bewaard, gezien } = proef({
      schrijf: async () => {
        throw new Error("model stil");
      },
    });
    const s = await loopNieuwsNa(d, NU);
    expect(bewaard).toHaveLength(0);
    expect(s.fout).toContain("model stil");
    expect(gezien.has("{A}")).toBe(false);
  });

  it("schrijft hooguit een paar berichten per ronde en laat de rest staan voor de volgende", async () => {
    const veel: FeedItem[] = Array.from({ length: 5 }, (_, i) => ({ id: `w${i}`, titel: `Werkloosheid stijgt in regio ${i}`, url: `https://www.cbs.nl/nl-nl/nieuws/2026/47/w${i}`, datum: "2026-11-18T05:30:00.000Z", omschrijving: "" }));
    const { d, bewaard, gezien } = proef({ haalFeed: async () => veel });
    const s = await loopNieuwsNa(d, NU);
    expect(bewaard).toHaveLength(MAX_PER_RONDE);
    expect(s.paste).toBe(5);
    expect(gezien.size).toBe(MAX_PER_RONDE);
    // twee berichten met dezelfde titel krijgen een eigen adres
    expect(new Set(bewaard.map((b) => b.slug)).size).toBe(MAX_PER_RONDE);
  });

  it("gaat door als een feed niet te lezen is", async () => {
    const { d } = proef({
      haalFeed: async () => {
        throw new Error("status 503");
      },
    });
    const s = await loopNieuwsNa(d, NU);
    expect(s.fout).toContain("503");
    expect(s.bekeken).toBe(0);
  });
});

describe("wetsvoorstellen ter consultatie", () => {
  const PAGINA = (start: string, status: string, lijf: string) =>
    `<html><body><div>Menu van Overheid.nl</div><h1>Titel</h1><h2>In het kort</h2><p>${lijf}</p><h2>Consultatiegegevens</h2><table><tr><th>Startdatum consultatie</th><td>${start}</td></tr><tr><th>Einddatum consultatie</th><td>11-12-2026</td></tr><tr><th>Status</th><td>${status}</td></tr></table><h2>Voor wie belangrijk</h2><p>Voor werkgevers die mensen uitlenen.</p><h2>Relevante documenten</h2><p>Besluit PDF</p></body></html>`;
  const LIJF = "Vanaf 1 januari 2028 mogen bedrijven alleen nog werknemers uitlenen als zij daarvoor een toelating hebben. ".repeat(5);
  const WETFEED = `<rss><channel>
<item><guid isPermaLink="false">Toelating</guid><link>https://www.internetconsultatie.nl/toelating</link><title>Wijziging van de Wet allocatie arbeidskrachten door intermediairs</title></item>
<item><guid isPermaLink="false">Kenteken</guid><link>https://www.internetconsultatie.nl/kenteken</link><title>Wijziging van het Kentekenreglement</title></item>
<item><guid isPermaLink="false">Oud</guid><link>https://www.internetconsultatie.nl/oud</link><title>Wijziging Wet minimumloon</title></item>
</channel></rss>`;
  const WETBERICHT = {
    titel: "Voorstel: uitlenen van personeel alleen nog met een toelating",
    samenvatting: "De overheid wil dat bedrijven vanaf 1 januari 2028 alleen nog mensen uitlenen als zij een toelating hebben.",
    blokken: [
      { kop: "Wat staat er in het voorstel?", alineas: ["De overheid legt een voorstel voor waarin staat dat bedrijven vanaf 1 januari 2028 alleen nog werknemers mogen uitlenen als zij daarvoor een toelating hebben. Het is nog geen wet: iedereen kan er nu op reageren, en daarna beslist de politiek of het doorgaat."] },
      { kop: "Voor wie is dit belangrijk?", alineas: ["Het voorstel raakt werkgevers die mensen uitlenen aan andere bedrijven. Zij moeten straks kunnen laten zien dat zij zijn toegelaten. Voor bedrijven die personeel inlenen is het goed om te weten met wie zij zaken doen."] },
      { kop: "Wat betekent dit voor jou?", alineas: ["Werk je als uitzendkracht of huur je mensen in, dan verandert er op dit moment nog niets. Als dit doorgaat, is het verstandig om te letten op de toelating van het bureau waarmee je werkt. Reageren op het voorstel kan tot 11 december 2026."] },
    ],
  };

  it("kiest alleen voorstellen over werk, loon, zzp en ondernemen", () => {
    expect(wetPast("Wijziging van de Wet allocatie arbeidskrachten door intermediairs")).toBe(true);
    expect(wetPast("Wijziging van de Wet op de omzetbelasting 1968 in verband met elektronische facturatie")).toBe(true);
    expect(wetPast("Wijziging Besluit arbeidsvoorwaarden gedetacheerde werknemers in de EU")).toBe(true);
    expect(wetPast("Wijziging van het Kentekenreglement")).toBe(false);
    expect(wetPast("Wijziging Kieswet: Landelijke invoering nieuw stembiljet")).toBe(false);
  });

  it("leest een feed zonder datum en haalt start, einde en status van de pagina", () => {
    expect(leesRss(WETFEED)).toHaveLength(0);
    expect(leesRss(WETFEED, true).map((i) => [i.id, i.datum])).toEqual([["Toelating", ""], ["Kenteken", ""], ["Oud", ""]]);
    const tekst = consultatieTekst(PAGINA("16-11-2026", "Actief", LIJF));
    expect(tekst.startsWith("Startdatum consultatie 16-11-2026\nEinddatum consultatie 11-12-2026\nStatus Actief\nIn het kort")).toBe(true);
    expect(tekst).not.toContain("Menu van Overheid.nl");
    expect(tekst).not.toContain("Besluit PDF");
    expect(tekst).toContain("Voor werkgevers die mensen uitlenen.");
    expect(consultatieGegevens(tekst)).toEqual({ start: "2026-11-16T11:00:00.000Z", actief: true });
    expect(consultatieGegevens("geen gegevens")).toBeNull();
  });

  it("schrijft over een lopend voorstel in de rubriek Wet en regels, en slaat een gesloten of oud voorstel over", async () => {
    const paginas: Record<string, string> = {
      "https://www.internetconsultatie.nl/toelating": consultatieTekst(PAGINA("16-11-2026", "Actief", LIJF)),
      "https://www.internetconsultatie.nl/oud": consultatieTekst(PAGINA("01-09-2026", "Actief", LIJF)),
    };
    const schrijf = vi.fn(async (): Promise<unknown> => WETBERICHT);
    const { d, bewaard, gezien } = proef({ bronnen: [WET], haalFeed: async () => leesRss(WETFEED, true), haalPagina: async (url) => paginas[url] ?? "", schrijf });
    const s = await loopNieuwsNa(d, NU);
    expect(schrijf).toHaveBeenCalledTimes(1);
    expect(bewaard).toHaveLength(1);
    expect(bewaard[0]).toMatchObject({ rubriek: "regels", status: "concept", bron: { naam: WET.naam, url: "https://www.internetconsultatie.nl/toelating", datum: "2026-11-16T11:00:00.000Z" } });
    // het oude voorstel en het kenteken zijn afgehandeld en komen niet terug
    expect([...gezien].sort()).toEqual(["Kenteken", "Oud", "Toelating"]);
    expect(s).toMatchObject({ bekeken: 3, paste: 1, geschreven: 1 });
  });

  it("verdeelt de berichten van een ronde over de bronnen", async () => {
    const veel: FeedItem[] = Array.from({ length: 4 }, (_, i) => ({ id: `w${i}`, titel: `Werkloosheid stijgt in regio ${i}`, url: `https://www.cbs.nl/nl-nl/nieuws/2026/47/w${i}`, datum: "2026-11-18T05:30:00.000Z", omschrijving: "" }));
    const { d, bewaard } = proef({
      bronnen: [CBS, WET],
      haalFeed: async (bron) => (bron.id === "cbs" ? veel : leesRss(WETFEED, true)),
      haalPagina: async (_url, bron) => (bron.id === "cbs" ? BRONTEKST : consultatieTekst(PAGINA("16-11-2026", "Actief", LIJF))),
      schrijf: async ({ bron }) => (bron.id === "cbs" ? GOED : WETBERICHT),
    });
    await loopNieuwsNa(d, NU);
    expect(bewaard.map((b) => b.bron.naam).sort()).toEqual([CBS.naam, WET.naam].sort());
  });
});

describe("de lijst en de aansluitingen", () => {
  it("zet onze eigen uitleg over wetten in de rubriek Wet en regels", () => {
    const regels = nieuwsKaarten([]).filter((k) => k.rubriek === "regels").map((k) => k.href);
    expect(regels).toEqual(expect.arrayContaining(["/kennis/wet-dba-uitgelegd", "/kennis/stipp-pensioen", "/kennis/abu-fasensysteem", "/kennis/blog/handhaving-wet-dba-2026"]));
    // een blog over iets anders blijft bij Van ZekerFlex
    expect(nieuwsKaarten([]).find((k) => k.href === "/kennis/blog/dezelfde-dag-uitbetaald")?.rubriek).toBe("zekerflex");
  });

  it("toont alleen geplaatste berichten, samen met onze eigen blogs", () => {
    const basis: NieuwsBericht = { slug: "a", ...GOED, rubriek: "arbeidsmarkt", gemaakt: NU.toISOString(), geplaatst: NU.toISOString(), status: "geplaatst", bron: { naam: "CBS", titel: "t", url: "https://www.cbs.nl/nl-nl/nieuws/x", datum: NU.toISOString() } };
    const kaarten = nieuwsKaarten([basis, { ...basis, slug: "b", status: "concept" }, { ...basis, slug: "c", status: "verborgen" }]);
    expect(kaarten.filter((k) => k.href.startsWith("/nieuws/")).map((k) => k.href)).toEqual(["/nieuws/a"]);
    expect(kaarten.some((k) => k.rubriek === "zekerflex" && k.href.startsWith("/kennis/blog/"))).toBe(true);
    // zonder berichten is de nieuwsroom niet leeg
    expect(nieuwsKaarten([]).length).toBeGreaterThan(0);
  });

  it("is aangesloten: cron, hartslag, vlag standaard uit, beheer alleen voor de platformbeheerder, een concept blijft verborgen", () => {
    expect(lees("deploy/cron/entrypoint.sh")).toMatch(/40 6,10,14,18 \* \* \* wget .*\/api\/internal\/nieuws"/);
    expect(lees("lib/ops/heartbeat.ts")).toContain('job: "nieuws"');
    expect(lees("lib/flags/index.ts")).toMatch(/key: "nieuws-vanzelf-plaatsen",[\s\S]{0,700}default: false/);
    expect(lees("app/api/internal/nieuws/route.ts")).toContain("checkInternalToken");
    const beheer = lees("app/api/admin/nieuws/route.ts");
    expect(beheer.match(/withAdminAccess\(\["PLATFORM_ADMIN"\]/g)).toHaveLength(2);
    const pagina = lees("app/(marketing)/nieuws/[slug]/page.tsx");
    expect(pagina).toContain('hasRole(principal, "PLATFORM_ADMIN")');
    expect(pagina).toContain("ldJson(");
    expect(pagina).not.toContain("JSON.stringify");
    // elke bron is een https-feed van een officiële instantie
    for (const b of NIEUWS_BRONNEN) expect(b.feed.startsWith("https://") && b.alleenPad.startsWith("https://")).toBe(true);
  });
});
