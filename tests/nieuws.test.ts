import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

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

function proef(over: Partial<NieuwsAfhankelijkheden> = {}) {
  const bewaard: NieuwsBericht[] = [];
  const gezien = new Set<string>();
  const standen: NieuwsStand[] = [];
  const schrijf = vi.fn(async (): Promise<unknown> => GOED);
  const d: NieuwsAfhankelijkheden = {
    vanzelf: async () => false,
    bronnen: NIEUWS_BRONNEN,
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

describe("de lijst en de aansluitingen", () => {
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
