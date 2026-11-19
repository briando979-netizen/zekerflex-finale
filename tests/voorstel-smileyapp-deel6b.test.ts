import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// SmileyApp-voorstel, deel 6b (19 nov 2026): de vragenlijst zelf samenstellen,
// de rekenhulp "Hoeveel reacties mag je verwachten?", de vergelijking met een
// papieren enquête en de rest van de site in het Engels en het Duits. De harde
// regel van de eigenaar is: niets verzinnen. Deze test bewaakt dat in de regels
// zelf en in de broncode: de rekenhulp bestaat niet zonder een cijfer dat het
// team zelf invulde (met bron), elke Smileyapp-cel van de vergelijking is een
// zin die letterlijk in lib/voorstel/smileyapp.ts staat, de papierkolom heeft
// geen cijfers en geen merk, elk voorbeeld heet een voorbeeld, en de nieuwe
// beheeracties gaan langs herkomst, limiet, sessie en rol.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  principal: null as { userId: string; fullName: string; rollen: string[] } | null,
  kvKapot: false,
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "geheim-voor-de-test-van-minstens-32-tekens", APP_BASE_URL: "https://zekerflex.test" } }));
vi.mock("@/lib/storage/kv", () => {
  const kopie = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const rijen = (prefix: string) => [...h.kv.entries()].filter(([k]) => k.startsWith(prefix));
  return {
    kvGet: async (k: string) => {
      if (h.kvKapot) throw new Error("geen verbinding");
      return h.kv.has(k) ? kopie(h.kv.get(k)) : null;
    },
    kvSet: async (k: string, v: unknown) => void h.kv.set(k, kopie(v)),
    kvDelete: async (k: string) => void h.kv.delete(k),
    kvListValues: async (prefix: string) => rijen(prefix).map(([, v]) => kopie(v)),
    kvListEntries: async (prefix: string) => rijen(prefix).map(([key, value]) => ({ key, value: kopie(value) })),
  };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }) }));
vi.mock("@/lib/auth", () => ({
  getPrincipal: async () => h.principal,
  hasRole: (p: { rollen: string[] }, ...rollen: string[]) => rollen.some((r) => p.rollen.includes(r)),
}));
vi.mock("@/lib/mail", () => ({ sendMail: async () => ({ id: "t", delivered: true, transport: "mailbox" }) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => ({ ok: true }), fixedWindow: async () => ({ ok: true }) }));
vi.mock("@/lib/voorstel/smileyapp-cijfers", () => ({ telWeergave: async () => undefined, telDemoAanvraag: async () => undefined, smileyappCijfers: async () => ({}) }));

import { AppError } from "@/lib/errors";
import { BLOG, PAKKETTEN } from "@/lib/voorstel/smileyapp";
import { BERICHT_MAX } from "@/lib/voorstel/smileyapp-aanvraag-regels";
import { BRANCHES, BRANCHE_LIJST } from "@/lib/voorstel/smileyapp-branches";
import { bewaarPosterZin, bewaarRespons, smileyappInstellingen, smileyappRespons, wisRespons, zetWeekmail } from "@/lib/voorstel/smileyapp-instellingen";
import { BRON_MAX, BRON_MIN, KLANTEN_MAX, RESPONS_MAX, RESPONS_MIN, groepeer, leesKlanten, leesRespons, responsUitOpslag, verwachteReacties } from "@/lib/voorstel/smileyapp-rekenhulp-regels";
import {
  EIGEN_MAX,
  KEUZEVRAGEN,
  KEUZE_MAX,
  LEGE_KEUZE,
  brancheKeuze,
  isKeuzeId,
  isLeeg,
  keuzeAlsTekst,
  keuzeNaarZoek,
  keuzeUitZoek,
  schoonEigen,
  schoonKeuze,
  wisselVraag,
} from "@/lib/voorstel/smileyapp-samensteller";
import { VERTALINGEN } from "@/lib/voorstel/smileyapp-taal";
import { TEKSTEN, keuzevragenTaal, vergelijkRijenTaal } from "@/lib/voorstel/smileyapp-talen";
import { REKEN_NL, SAMENSTEL_NL, VERGELIJK_NL } from "@/lib/voorstel/smileyapp-teksten";
import {
  ANONIEM_ZIN,
  EIGEN_RIJEN_MAX,
  RIJ_VELD_MAX,
  STANDAARD_RIJEN,
  beheerRijen,
  isRijId,
  leesRij,
  leesStaat,
  metEigenRij,
  metVerborgenRij,
  smileyappBronnen,
  zichtbareRijen,
  zonderEigenRij,
  type VergelijkStaat,
} from "@/lib/voorstel/smileyapp-vergelijk-regels";
import { vergelijkRijen, vergelijkVoorBeheer, wijzigVergelijk } from "@/lib/voorstel/smileyapp-vergelijken";

const ROOT = process.cwd();
const lees = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");
const loop = (map: string, filter: (naam: string) => boolean): string[] =>
  readdirSync(path.join(ROOT, map)).flatMap((naam) => {
    const rel = `${map}/${naam}`;
    return statSync(path.join(ROOT, rel)).isDirectory() ? loop(rel, filter) : filter(naam) ? [rel] : [];
  });
/** Alle code van het voorstel: pagina's, onderdelen, routes en lib. */
const CODE = [
  ...loop("app/voorstel/smileyapp", (n) => /\.(ts|tsx)$/.test(n)),
  ...loop("components/voorstel/smileyapp", (n) => /\.(ts|tsx)$/.test(n)),
  ...loop("app/api/voorstel/smileyapp", (n) => n === "route.ts"),
  ...readdirSync(path.join(ROOT, "lib/voorstel")).filter((n) => n.startsWith("smileyapp")).map((n) => `lib/voorstel/${n}`),
];
/** Wat deel 6b toevoegde. */
const NIEUW_PAGINA = [
  "app/voorstel/smileyapp/samenstellen/page.tsx",
  "app/voorstel/smileyapp/vergelijken/page.tsx",
  ...VERTALINGEN.flatMap((t) => ["branches", "branches/[slug]", "klanten", "contact", "partner-worden", "samenstellen", "vergelijken"].map((p) => `app/voorstel/smileyapp/${t}/${p}/page.tsx`)),
];
const NIEUW_ONDERDEEL = ["Samensteller.tsx", "RekenHulp.tsx", "RekenBlok.tsx", "VergelijkTabel.tsx", "taal/Paginas.tsx", "taal/Contact.tsx", "taal/Hulp.tsx", "beheer/Rekenhulp.tsx", "beheer/VergelijkBeheer.tsx"].map((n) => `components/voorstel/smileyapp/${n}`);
const NIEUW_LIB = ["samensteller", "rekenhulp-regels", "vergelijk-regels", "vergelijken"].map((n) => `lib/voorstel/smileyapp-${n}.ts`);
const INHOUD = "app/api/voorstel/smileyapp/beheer/inhoud/route.ts";

async function fout(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error("er kwam geen fout");
}

beforeEach(() => {
  h.kv.clear();
  h.principal = null;
  h.kvKapot = false;
});

// ---------------------------------------------------------------------------
describe("A. vragenlijst zelf samenstellen", () => {
  it("de keuzelijst is die van de branches: vijfentwintig voorbeeldvragen met een vast id", () => {
    expect(KEUZE_MAX).toBe(5);
    expect(EIGEN_MAX).toBe(120);
    expect(KEUZEVRAGEN).toHaveLength(BRANCHE_LIJST.length * 5);
    expect(new Set(KEUZEVRAGEN.map((v) => v.id)).size).toBe(KEUZEVRAGEN.length);
    for (const v of KEUZEVRAGEN) {
      expect(v.id).toMatch(/^[a-z]+-[1-5]$/);
      const b = BRANCHES[v.branche];
      // de tekst is letterlijk de voorbeeldvraag van de branchepagina, niets nieuws
      expect(b?.vragen[Number(v.id.slice(-1)) - 1]?.tekst, v.id).toBe(v.tekst);
      expect(v.groep).toBe(b?.naam);
      expect(["rating", "open", "janee", "tekstveld"]).toContain(v.soort);
    }
    expect(isKeuzeId("horeca-1")).toBe(true);
    for (const x of ["constructor", "__proto__", "horeca-6", "horeca-0", "Horeca-1", "", 5, null, "horeca-1 "]) expect(isKeuzeId(x), String(x)).toBe(false);
    expect(brancheKeuze("zorg")).toEqual(["zorg-1", "zorg-2", "zorg-3", "zorg-4", "zorg-5"]);
    expect(brancheKeuze("constructor")).toEqual([]);
  });

  it("grenzen: hooguit vijf vaste vragen, elk één keer, en één eigen vraag van hooguit 120 tekens", () => {
    const alle = KEUZEVRAGEN.map((v) => v.id);
    expect(schoonKeuze(alle, "").ids).toEqual(alle.slice(0, 5));
    expect(schoonKeuze(["zorg-1", "zorg-1", "bestaat-niet", "constructor", 7, null, "horeca-2"], "").ids).toEqual(["zorg-1", "horeca-2"]);
    for (const geenLijst of ["zorg-1", null, undefined, 5, { 0: "zorg-1" }]) expect(schoonKeuze(geenLijst, "").ids).toEqual([]);
    expect(schoonEigen("x".repeat(120))).toHaveLength(120);
    expect(schoonEigen("x".repeat(500))).toHaveLength(120);
    expect(schoonEigen("  Hoe was\n\tde   koffie?\u0000 ")).toBe("Hoe was de koffie?");
    for (const x of [undefined, null, 5, {}, ["a"]]) expect(schoonEigen(x)).toBe("");
    // kiezen: de zesde gaat er niet bij, weghalen kan altijd
    let k = LEGE_KEUZE;
    for (const id of alle.slice(0, 7)) k = wisselVraag(k, id);
    expect(k.ids).toEqual(alle.slice(0, 5));
    expect(wisselVraag(k, alle[0] ?? "").ids).toEqual(alle.slice(1, 5));
    expect(wisselVraag(LEGE_KEUZE, "constructor")).toEqual(LEGE_KEUZE);
    expect(isLeeg(LEGE_KEUZE)).toBe(true);
    expect(isLeeg({ ids: [], eigen: "x" })).toBe(false);
  });

  it("de querystring heen en terug, en opschonen van wat iemand in de adresbalk typt", () => {
    const keuze = { ids: ["horeca-1", "zorg-3", "winkel-5"], eigen: "Wat vond je van de koffie & het gebak? #1 = top" };
    const zoek = keuzeNaarZoek(keuze);
    expect(zoek).toContain("vragen=horeca-1%2Czorg-3%2Cwinkel-5");
    const terug = new URLSearchParams(zoek);
    expect(keuzeUitZoek({ vragen: terug.get("vragen") ?? undefined, eigen: terug.get("eigen") ?? undefined })).toEqual(keuze);
    expect(keuzeNaarZoek(LEGE_KEUZE)).toBe("");
    expect(keuzeNaarZoek({ ids: ["zorg-1"], eigen: "" })).toBe("vragen=zorg-1");
    // alleen bestaande id's en een opgeschoonde eigen vraag komen erdoor; meer staat er nooit in de link
    expect([...new URLSearchParams(keuzeNaarZoek({ ids: ["zorg-1", "kwaad", "zorg-1"], eigen: "x".repeat(300) })).keys()]).toEqual(["vragen", "eigen"]);
    expect(keuzeNaarZoek({ ids: ["kwaad"], eigen: "  " })).toBe("");
    // de adresbalk: lijsten, rommel, te veel en te lang
    expect(keuzeUitZoek({ vragen: ["zorg-2,zorg-1", "horeca-1"], eigen: ["Eerste", "Tweede"] })).toEqual({ ids: ["zorg-2", "zorg-1"], eigen: "Eerste" });
    expect(keuzeUitZoek({ vragen: "zorg-1,,<script>,constructor,zorg-1, zorg-2", eigen: "<b>vet</b>\r\nregel" })).toEqual({ ids: ["zorg-1"], eigen: "<b>vet</b> regel" });
    expect(keuzeUitZoek({ vragen: KEUZEVRAGEN.map((v) => v.id).join(","), eigen: "y".repeat(5000) })).toEqual({ ids: KEUZEVRAGEN.slice(0, 5).map((v) => v.id), eigen: "y".repeat(120) });
    expect(keuzeUitZoek({})).toEqual(LEGE_KEUZE);
    expect(keuzeUitZoek({ vragen: "x".repeat(100_000) })).toEqual(LEGE_KEUZE);
  });

  it("de keuze als leesbare tekst voor het berichtveld: genummerd, in de taal van de pagina, en nooit te lang", () => {
    const keuze = { ids: ["horeca-1", "onderwijs-5"], eigen: "Wat miste je? $& $1" };
    const tekst = keuzeAlsTekst(keuze, KEUZEVRAGEN, SAMENSTEL_NL);
    expect(tekst.split("\n")).toEqual([
      "Mijn vragenlijst (samengesteld op de website):",
      `1. ${BRANCHES.horeca?.vragen[0]?.tekst ?? ""}`,
      `2. ${BRANCHES.onderwijs?.vragen[4]?.tekst ?? ""}`,
      "3. Eigen vraag: Wat miste je? $& $1",
    ]);
    expect(keuzeAlsTekst(LEGE_KEUZE, KEUZEVRAGEN, SAMENSTEL_NL)).toBe("");
    expect(keuzeAlsTekst({ ids: ["kwaad"], eigen: "" }, KEUZEVRAGEN, SAMENSTEL_NL)).toBe("");
    // de langste keuze past ruim in het berichtveld van de aanvraag, in elke taal
    const langste = (vragen: readonly { id: string; tekst: string }[]) => [...vragen].sort((a, b) => b.tekst.length - a.tekst.length).slice(0, 5).map((v) => v.id);
    expect(keuzeAlsTekst({ ids: langste(KEUZEVRAGEN), eigen: "x".repeat(120) }, KEUZEVRAGEN, SAMENSTEL_NL).length).toBeLessThan(BERICHT_MAX / 2);
    for (const t of VERTALINGEN) {
      const vragen = keuzevragenTaal(t);
      expect(vragen.map((v) => [v.id, v.soort])).toEqual(KEUZEVRAGEN.map((v) => [v.id, v.soort]));
      const vertaald = keuzeAlsTekst({ ids: langste(vragen), eigen: "x".repeat(120) }, vragen, TEKSTEN[t].samenstel);
      expect(vertaald.length).toBeLessThan(BERICHT_MAX / 2);
      expect(vertaald.startsWith(TEKSTEN[t].samenstel.berichtKop)).toBe(true);
      expect(vertaald).not.toMatch(/\{\w+\}/);
    }
    expect(keuzeAlsTekst({ ids: ["zorg-2"], eigen: "" }, keuzevragenTaal("en"), TEKSTEN.en.samenstel)).toBe("My questionnaire (put together on the website):\n1. How friendly was your welcome?");
  });

  it("het scherm: alles in de browser, elk voorbeeld heet een voorbeeld, en de knop gaat naar de demo-aanvraag", () => {
    const s = lees("components/voorstel/smileyapp/Samensteller.tsx");
    expect(s.startsWith('"use client";')).toBe(true);
    // niets bewaren vóór de aanvraag
    expect(s).not.toMatch(/fetch\(|localStorage|sessionStorage|document\.cookie|indexedDB/);
    expect(s).not.toMatch(/<form[\s>]|<h1[\s>]/);
    expect(s).toContain("href={`${demoPad}?${zoek}`}");
    expect(s).toContain("const zoek = keuzeNaarZoek({ ids: keuze.ids, eigen });");
    // elke vraag in de lijst draagt het etiket "Voorbeeld", en de uitleg staat erboven
    expect(s).toContain("{t.voorbeeldUitleg}");
    expect(s.match(/\{t\.voorbeeld\}/g)?.length).toBeGreaterThanOrEqual(2);
    expect(s).toContain("maxLength={EIGEN_MAX}");
    expect(s).toContain("disabled={!aan && vol}");
    // labels aan de velden, en de smiley is ook met het toetsenbord te bedienen (een schuifje)
    expect(s).toContain('<label htmlFor="sm-samen-eigen"');
    expect(s).toContain('type="range"');
    expect(SAMENSTEL_NL.demoKnop).toBe("Vraag een demo aan met deze vragenlijst");
    expect(SAMENSTEL_NL.voorbeeldUitleg).toContain("voorbeelden van ZekerFlex, geen vragen van een klant van Smileyapp");
    for (const t of VERTALINGEN) expect(TEKSTEN[t].samenstel.voorbeeldUitleg).toContain("ZekerFlex");
    // de pagina's: de Nederlandse en de vertaalde gebruiken hetzelfde onderdeel, met de keuze uit de adresbalk opgeschoond
    const pagina = lees("app/voorstel/smileyapp/samenstellen/page.tsx");
    expect(pagina).toContain("const begin = keuzeUitZoek(await searchParams);");
    expect(pagina).toContain("<Samensteller ");
    expect(lees("components/voorstel/smileyapp/taal/Hulp.tsx")).toContain("<Samensteller ");
    // het blok met de knop op de voorpagina
    const home = lees("app/voorstel/smileyapp/page.tsx");
    expect(home).toContain("href={`${BASE}/samenstellen`}");
    expect(home).toContain("{SAMENSTEL_NL.blokKnop}");
    expect(lees("components/voorstel/smileyapp/taal/Landing.tsx")).toContain("href={`${b}/samenstellen`}");
  });

  it("de demo-aanvraag zet de keuze als tekst in het berichtveld, in elke taal, en de bezoeker kan hem aanpassen", () => {
    const demo = lees("app/voorstel/smileyapp/demo/page.tsx");
    expect(demo).toContain("const vragenlijst = keuzeAlsTekst(keuzeUitZoek(sp), KEUZEVRAGEN, SAMENSTEL_NL);");
    expect(demo).toContain("{...(vragenlijst ? { beginBericht: vragenlijst } : {})}");
    const taal = lees("components/voorstel/smileyapp/taal/Demo.tsx");
    expect(taal).toContain("const vragenlijst = keuzeAlsTekst(keuzeUitZoek(zoek), keuzevragenTaal(taal), t.samenstel);");
    expect(taal).toContain("{...(vragenlijst ? { beginBericht: vragenlijst } : {})}");
    const formulier = lees("components/voorstel/smileyapp/AanvraagFormulier.tsx");
    // gewone beginwaarde van het veld: daarna is het de tekst van de bezoeker
    expect(formulier).toContain("const [bericht, setBericht] = useState(beginBericht);");
    expect(formulier).toContain('beginBericht = "",');
    // de pagina leest de adresbalk nooit rauw in het formulier: alleen via keuzeUitZoek
    for (const s of [demo, taal]) expect(s).not.toMatch(/beginBericht[:=]\s*\{?\s*(sp|zoek)\./);
  });
});

// ---------------------------------------------------------------------------
describe("B. rekenhulp: bestaat alleen met een cijfer en een bron van het team", () => {
  const BRON = "Gemiddelde van onze eigen klanten over het afgelopen jaar.";

  it("de instelling: een heel getal van 1 tot en met 100, en de bron is verplicht (10 tot 160 tekens)", () => {
    expect([RESPONS_MIN, RESPONS_MAX, BRON_MIN, BRON_MAX, KLANTEN_MAX]).toEqual([1, 100, 10, 160, 1_000_000]);
    for (const p of [1, 100, "1", "100", " 42 "]) expect(leesRespons({ percentage: p, bron: BRON }), String(p)).toMatchObject({ ok: true });
    expect(leesRespons({ percentage: "42", bron: `  ${BRON}\n ` })).toEqual({ ok: true, waarde: { percentage: 42, bron: BRON } });
    for (const p of [0, 101, -5, 12.5, "12,5", "12.5", "1e2", "", "abc", "50%", null, undefined, Number.NaN, Number.POSITIVE_INFINITY, [50], true]) {
      expect(leesRespons({ percentage: p, bron: BRON }), String(p)).toMatchObject({ ok: false, veld: "percentage" });
    }
    expect(leesRespons({ percentage: 50, bron: "x".repeat(10) })).toMatchObject({ ok: true });
    expect(leesRespons({ percentage: 50, bron: "x".repeat(160) })).toMatchObject({ ok: true });
    for (const bron of ["", "   ", "x".repeat(9), "x".repeat(161), undefined, null, 5, `kort${" ".repeat(40)}`]) {
      expect(leesRespons({ percentage: 50, bron }), String(bron)).toMatchObject({ ok: false, veld: "bron" });
    }
  });

  it("geen instelling = niets: uit een lege, halve of kapotte opslag komt nooit een percentage", () => {
    for (const ruw of [null, undefined, "", 50, [], {}, { percentage: 50 }, { bron: BRON }, { percentage: "50", bron: BRON }, { percentage: 0, bron: BRON }, { percentage: 50, bron: "kort" }, { percentage: 150, bron: BRON }]) {
      expect(responsUitOpslag(ruw), JSON.stringify(ruw)).toBeNull();
    }
    expect(responsUitOpslag({ percentage: 50, bron: BRON, extra: 1 })).toEqual({ percentage: 50, bron: BRON });
    // en zonder percentage is er geen uitkomst: er wordt nooit met een aangenomen waarde gerekend
    for (const p of [undefined, null, 0, 101, 12.5, "50", Number.NaN]) expect(verwachteReacties(1000, p), String(p)).toBeNull();
  });

  it("de schatting: klanten × percentage, naar beneden afgerond, binnen 1 tot 1.000.000", () => {
    expect(verwachteReacties(1000, 25)).toBe(250);
    expect(verwachteReacties(199, 1)).toBe(1);
    expect(verwachteReacties(99, 1)).toBe(0);
    expect(verwachteReacties(7, 29)).toBe(2);
    expect(verwachteReacties(333, 33)).toBe(109);
    expect(verwachteReacties(1, 100)).toBe(1);
    expect(verwachteReacties(KLANTEN_MAX, 100)).toBe(KLANTEN_MAX);
    for (const k of [0, -1, KLANTEN_MAX + 1, 10.5, Number.NaN, "100", null]) expect(verwachteReacties(k, 50), String(k)).toBeNull();
    // wat de bezoeker typt
    for (const [typ, n] of [["1", 1], ["250", 250], [" 1000000 ", 1_000_000], ["1.000", 1000], ["12 500", 12_500], ["1,000,000", 1_000_000], ["1.000.000", 1_000_000]] as const) expect(leesKlanten(typ), typ).toBe(n);
    for (const typ of ["", "0", "1000001", "1.5", "1,5", "-5", "1e3", "abc", "12.50", "1.000.000.000", "0x10", "1 000 0"]) expect(leesKlanten(typ), typ).toBeNull();
    expect(leesKlanten(250)).toBeNull();
    expect(groepeer(1_000_000, ".")).toBe("1.000.000");
    expect(groepeer(12_500, ",")).toBe("12,500");
    expect(groepeer(999, ".")).toBe("999");
  });

  it("bewaren en leeg maken: zonder instelling ontbreekt de sleutel, en leeg maken haalt hem weer weg", async () => {
    expect(await smileyappRespons()).toBeNull();
    expect("respons" in (await smileyappInstellingen())).toBe(false);
    // de andere instellingen blijven staan
    await zetWeekmail(false);
    await bewaarPosterZin("Scan en vertel het ons");
    expect((await fout(bewaarRespons({ percentage: "0", bron: BRON }))).status).toBe(422);
    expect((await fout(bewaarRespons({ percentage: "40", bron: "kort" }))).details).toEqual({ veld: "bron" });
    expect(await smileyappRespons()).toBeNull();
    expect(await bewaarRespons({ percentage: "40", bron: BRON })).toEqual({ weekmail: false, posterZin: "Scan en vertel het ons", respons: { percentage: 40, bron: BRON } });
    expect(await smileyappRespons()).toEqual({ percentage: 40, bron: BRON });
    expect(await wisRespons()).toEqual({ weekmail: false, posterZin: "Scan en vertel het ons" });
    expect(await smileyappRespons()).toBeNull();
    expect("respons" in ((h.kv.get("voorstel-smileyapp:instellingen") ?? {}) as object)).toBe(false);
    // een opslag die niet antwoordt of een rij die niet klopt: liever geen blok dan een verkeerd cijfer
    await bewaarRespons({ percentage: "40", bron: BRON });
    h.kvKapot = true;
    expect(await smileyappRespons()).toBeNull();
    h.kvKapot = false;
    h.kv.set("voorstel-smileyapp:instellingen", { respons: { percentage: "40", bron: BRON } });
    expect(await smileyappRespons()).toBeNull();
  });

  it("de site toont de rekenhulp alleen met een instelling, en nergens staat een percentage in de code", () => {
    const blok = lees("components/voorstel/smileyapp/RekenBlok.tsx");
    expect(blok).toContain("const respons = await smileyappRespons();");
    expect(blok.indexOf("if (!respons) return null;")).toBeGreaterThan(0);
    expect(blok.indexOf("if (!respons) return null;")).toBeLessThan(blok.indexOf("<RekenHulp "));
    expect(blok).toContain("<RekenHulp percentage={respons.percentage} bron={respons.bron}");
    // het rekenonderdeel staat nergens anders: elke pagina gaat via het blok dat eerst de instelling leest
    expect(CODE.filter((f) => lees(f).includes("<RekenHulp ")).sort()).toEqual(["components/voorstel/smileyapp/RekenBlok.tsx"]);
    expect(CODE.filter((f) => /<RekenBlok[ /]/.test(lees(f))).sort()).toEqual([
      "app/voorstel/smileyapp/page.tsx",
      "app/voorstel/smileyapp/samenstellen/page.tsx",
      "components/voorstel/smileyapp/taal/Hulp.tsx",
      "components/voorstel/smileyapp/taal/Landing.tsx",
    ]);
    const hulp = lees("components/voorstel/smileyapp/RekenHulp.tsx");
    expect(hulp).not.toMatch(/fetch\(|localStorage|sessionStorage|document\.cookie/);
    // geen standaardwaarde en geen voorbeeldpercentage: het cijfer komt alleen als prop uit de instelling
    expect(hulp).toContain("percentage: number;");
    for (const f of ["components/voorstel/smileyapp/RekenHulp.tsx", "components/voorstel/smileyapp/RekenBlok.tsx", "lib/voorstel/smileyapp-rekenhulp-regels.ts", "lib/voorstel/smileyapp-instellingen.ts"]) {
      const s = lees(f);
      expect(s, f).not.toMatch(/\d\s?%/);
      expect(s, f).not.toMatch(/percentage\s*(?:=|\?\?|\|\|)\s*\d/);
      expect(s, f).not.toMatch(/percentage\s*=\s*\d|STANDAARD|VOORBEELD_P/);
    }
    for (const t of [REKEN_NL, TEKSTEN.en.reken, TEKSTEN.de.reken]) {
      for (const [sleutel, tekst] of Object.entries(t)) expect(tekst, sleutel).not.toMatch(/\d\s?%/);
      expect(t.gerekend).toContain("{p}");
      expect(t.uitkomst).toContain("{n}");
    }
    // onder de uitkomst: de bron van het team en "een schatting, geen belofte"
    expect(hulp).toContain("{t.bron}");
    expect(hulp).toContain("{bron}");
    expect(hulp).toContain("{t.schatting}");
    expect(REKEN_NL.schatting).toBe("Een schatting, geen belofte.");
    expect(REKEN_NL.uitkomst).toBe("Ongeveer {n} reacties per maand");
    // toegankelijk: een label aan het veld en de fout met role="alert"
    expect(hulp).toContain('<label htmlFor="sm-reken-klanten"');
    expect(hulp).toContain('role="alert"');
  });
});

// ---------------------------------------------------------------------------
describe("C. vergelijken: Smileyapp of een papieren enquête?", () => {
  const smileyappTs = lees("lib/voorstel/smileyapp.ts");

  it("elke standaardrij van Smileyapp is een zin die letterlijk in de teksten van smileyapp.nl staat", () => {
    expect(STANDAARD_RIJEN.length).toBeGreaterThanOrEqual(6);
    expect(new Set(STANDAARD_RIJEN.map((r) => r.id)).size).toBe(STANDAARD_RIJEN.length);
    const bronnen = smileyappBronnen();
    for (const r of STANDAARD_RIJEN) {
      expect(r.smileyapp.length, r.id).toBeGreaterThan(10);
      // in een bronzin van hun site (lib/voorstel/smileyapp.ts), als geheel of als hele zin daarbinnen
      expect(bronnen.some((b) => b.includes(r.smileyapp)), `${r.id}: ${r.smileyapp}`).toBe(true);
      // en letterlijk in het bestand zelf: de test leest de broncode, niet alleen de constante
      expect(smileyappTs.includes(r.smileyapp), `${r.id} staat niet letterlijk in lib/voorstel/smileyapp.ts`).toBe(true);
      expect(r.bron.trim(), r.id).not.toBe("");
      expect(r.id).toMatch(/^[a-z]+$/);
    }
    // de zin over anoniem komt uit hun eigen blogbericht
    expect(BLOG.some((b) => b.inhoud.some((blok) => blok.type === "alinea" && blok.tekst.includes(ANONIEM_ZIN)))).toBe(true);
    // en geen prijs of pakketnaam als "eigenschap": die staan bij de pakketten
    for (const r of STANDAARD_RIJEN) for (const p of PAKKETTEN) expect(r.smileyapp, r.id).not.toContain(p.naam);
  });

  it("de papierkolom: geen cijfers, geen merk of concurrent, en niets over Smileyapp", () => {
    const MERK = /smileyapp|google|microsoft|surveymonkey|typeform|\b(?:word|excel)\b|concurrent|competitor|konkurr|wettbewerb|andere aanbieder/i;
    const VERGELIJKEND = /\d|%|€|keer (sneller|zo)|sneller|trager|langzamer|duurder|goedkoper|slechter|beter|omslachtig|ouderwets|foutgevoelig/i;
    const papier = [...STANDAARD_RIJEN.map((r) => ({ id: r.id, kenmerk: r.kenmerk, papier: r.papier })), ...VERTALINGEN.flatMap((t) => Object.entries(TEKSTEN[t].vergelijk.rijen).map(([id, r]) => ({ id: `${t}:${id}`, kenmerk: r.kenmerk, papier: r.papier })))];
    expect(papier).toHaveLength(STANDAARD_RIJEN.length * 3);
    for (const r of papier) {
      expect(r.papier, r.id).not.toMatch(/\d|%|€/);
      expect(r.kenmerk, r.id).not.toMatch(/\d|%|€/);
      expect(r.papier, r.id).not.toMatch(MERK);
      expect(r.papier.trim().length, r.id).toBeGreaterThan(10);
    }
    for (const r of STANDAARD_RIJEN) expect(r.papier, r.id).not.toMatch(VERGELIJKEND);
    // ook de teksten om de tabel heen beloven niets met een cijfer
    for (const t of [VERGELIJK_NL, TEKSTEN.en.vergelijk, TEKSTEN.de.vergelijk]) {
      for (const tekst of [t.kop, t.intro, t.uitleg, t.slot, t.bijPakketten, t.link]) expect(tekst).not.toMatch(/\d|%|€/);
    }
    expect(VERGELIJK_NL.kop).toBe("Smileyapp of een papieren enquête?");
  });

  it("de vertaling: precies de standaardrijen, en een eigen rij van het team blijft zoals hij is ingevoerd", () => {
    const ids = STANDAARD_RIJEN.map((r) => r.id).sort();
    for (const t of VERTALINGEN) {
      expect(Object.keys(TEKSTEN[t].vergelijk.rijen).sort(), t).toEqual(ids);
      const rijen = vergelijkRijenTaal(zichtbareRijen({ verborgen: ["rapport"], eigen: [{ id: "a".repeat(16), kenmerk: "Eigen", smileyapp: "Tekst van het team", papier: "Papier van het team" }] }), t);
      expect(rijen.map((r) => r.id)).toEqual([...STANDAARD_RIJEN.filter((r) => r.id !== "rapport").map((r) => r.id), "a".repeat(16)]);
      expect(rijen.filter((r) => !r.vertaald)).toEqual([{ id: "a".repeat(16), kenmerk: "Eigen", smileyapp: "Tekst van het team", papier: "Papier van het team", eigen: true, vertaald: false }]);
      expect(rijen[0]?.smileyapp).toBe(TEKSTEN[t].vergelijk.rijen.invullen?.smileyapp);
      // de vertaling van een Smileyapp-cel is de bestaande vertaling van dezelfde bronzin
      expect(TEKSTEN[t].vergelijk.rijen.invullen?.smileyapp).toBe(TEKSTEN[t].hoe.stappen[0]?.tekst);
      expect(TEKSTEN[t].vergelijk.rijen.resultaten?.smileyapp).toBe(TEKSTEN[t].hoe.stappen[1]?.tekst);
      expect(TEKSTEN[t].vergelijk.rijen.delen?.smileyapp).toBe(TEKSTEN[t].faq.hoeAntwoord);
    }
    expect(lees("components/voorstel/smileyapp/taal/Hulp.tsx")).toContain('...(vertaald ? {} : { lang: "nl" })');
  });

  it("eigen rijen: hooguit twaalf, elk veld verplicht en hooguit 140 tekens", () => {
    expect([EIGEN_RIJEN_MAX, RIJ_VELD_MAX]).toEqual([12, 140]);
    const goed = { kenmerk: "Meerdere locaties", smileyapp: "  Eén dashboard\nvoor  elke locatie ", papier: "Per locatie een eigen stapel formulieren" };
    expect(leesRij(goed)).toEqual({ ok: true, waarde: { kenmerk: "Meerdere locaties", smileyapp: "Eén dashboard voor elke locatie", papier: "Per locatie een eigen stapel formulieren" } });
    expect(leesRij({ ...goed, papier: "x".repeat(140) })).toMatchObject({ ok: true });
    expect(leesRij({ ...goed, papier: "x".repeat(141) })).toMatchObject({ ok: false, veld: "papier" });
    expect(leesRij({ ...goed, kenmerk: " " })).toMatchObject({ ok: false, veld: "kenmerk" });
    expect(leesRij({ ...goed, smileyapp: 5 })).toMatchObject({ ok: false, veld: "smileyapp" });
    expect(leesRij({})).toMatchObject({ ok: false, veld: "kenmerk" });
    let staat: VergelijkStaat | null = null;
    for (let i = 0; i < EIGEN_RIJEN_MAX; i += 1) {
      const u = metEigenRij(staat, goed, i.toString(16).padStart(16, "0"));
      expect(u.ok, String(i)).toBe(true);
      if (u.ok) staat = u.staat;
    }
    expect(staat?.eigen).toHaveLength(12);
    expect(metEigenRij(staat, goed, "f".repeat(16))).toMatchObject({ ok: false });
    // een id dat niet klopt of al bestaat wordt geweigerd
    expect(metEigenRij(null, goed, "kort")).toMatchObject({ ok: false });
    expect(metEigenRij(staat?.eigen.length ? { verborgen: [], eigen: staat.eigen.slice(0, 1) } : null, goed, "0".repeat(16))).toMatchObject({ ok: false });
    expect(metEigenRij(null, { ...goed, kenmerk: "" }, "a".repeat(16))).toMatchObject({ ok: false, veld: "kenmerk" });
    expect(isRijId("invullen")).toBe(true);
    expect(isRijId("a".repeat(16))).toBe(true);
    for (const x of ["constructor", "", "A".repeat(16), "a".repeat(15), 5, null]) expect(isRijId(x), String(x)).toBe(false);
  });

  it("verbergen en verwijderen: zonder wijzigingen de standaard, en er blijft altijd een rij staan", () => {
    expect(zichtbareRijen(null).map((r) => [r.id, r.smileyapp, r.papier, r.eigen])).toEqual(STANDAARD_RIJEN.map((r) => [r.id, r.smileyapp, r.papier, false]));
    const u = metVerborgenRij(null, "rapport", true);
    expect(u).toEqual({ ok: true, staat: { verborgen: ["rapport"], eigen: [] } });
    if (!u.ok) return;
    expect(zichtbareRijen(u.staat).map((r) => r.id)).not.toContain("rapport");
    expect(beheerRijen(u.staat).find((r) => r.id === "rapport")).toMatchObject({ verborgen: true, eigen: false });
    // weer tonen: alles is de standaard, dus de opslag kan leeg
    expect(metVerborgenRij(u.staat, "rapport", false)).toEqual({ ok: true, staat: null });
    expect(metVerborgenRij(null, "a".repeat(16), true)).toMatchObject({ ok: false });
    expect(metVerborgenRij(null, "constructor", true)).toMatchObject({ ok: false });
    // alles verbergen lukt niet: de laatste rij blijft
    let staat: VergelijkStaat | null = null;
    const uitkomsten = STANDAARD_RIJEN.map((r) => {
      const x = metVerborgenRij(staat, r.id, true);
      if (x.ok) staat = x.staat;
      return x.ok;
    });
    expect(uitkomsten.filter(Boolean)).toHaveLength(STANDAARD_RIJEN.length - 1);
    expect(zichtbareRijen(staat)).toHaveLength(1);
    // met één eigen rij erbij mag de laatste standaardrij wel weg, maar de eigen rij daarna niet meer
    const metEigen = metEigenRij(staat, { kenmerk: "Eigen", smileyapp: "Tekst", papier: "Papier" }, "b".repeat(16));
    expect(metEigen.ok).toBe(true);
    if (!metEigen.ok) return;
    const laatste = STANDAARD_RIJEN[STANDAARD_RIJEN.length - 1]?.id ?? "";
    const allesWeg = metVerborgenRij(metEigen.staat, laatste, true);
    expect(allesWeg.ok).toBe(true);
    if (!allesWeg.ok) return;
    expect(zichtbareRijen(allesWeg.staat).map((r) => r.id)).toEqual(["b".repeat(16)]);
    expect(zonderEigenRij(allesWeg.staat, "b".repeat(16))).toMatchObject({ ok: false });
    expect(zonderEigenRij(metEigen.staat, "b".repeat(16))).toMatchObject({ ok: true });
    expect(zonderEigenRij(null, "b".repeat(16))).toMatchObject({ ok: false });
  });

  it("de opslag wordt soepel gelezen: een onbruikbare rij valt weg, en een lege tabel bestaat niet", async () => {
    expect(leesStaat(null)).toBeNull();
    expect(leesStaat("rommel")).toBeNull();
    expect(leesStaat({ verborgen: [], eigen: [] })).toBeNull();
    expect(
      leesStaat({
        verborgen: ["rapport", "rapport", "constructor", 5],
        eigen: [{ id: "a".repeat(16), kenmerk: "Eigen", smileyapp: "Tekst", papier: "Papier" }, { id: "kapot", kenmerk: "x", smileyapp: "y", papier: "z" }, "rommel", { id: "c".repeat(16), kenmerk: "Te lang", smileyapp: "x".repeat(141), papier: "Papier" }],
      }),
    ).toEqual({ verborgen: ["rapport"], eigen: [{ id: "a".repeat(16), kenmerk: "Eigen", smileyapp: "Tekst", papier: "Papier" }] });
    // alles verborgen zonder eigen rij (kan alleen door een kapotte opslag): dan gelden de standaardrijen
    expect(leesStaat({ verborgen: STANDAARD_RIJEN.map((r) => r.id), eigen: [] })).toBeNull();
    // bewaren via de opslag: toevoegen, verbergen, verwijderen; terug bij de standaard is de sleutel weg
    expect(await vergelijkRijen()).toHaveLength(STANDAARD_RIJEN.length);
    const na = await wijzigVergelijk({ soort: "toevoegen", kenmerk: "Eigen", smileyapp: "Tekst van het team", papier: "Papier van het team" });
    expect(na.aangepast).toBe(true);
    const eigen = na.rijen.find((r) => r.eigen);
    expect(eigen?.id).toMatch(/^[a-f0-9]{16}$/);
    expect(h.kv.has("voorstel-smileyapp:vergelijken")).toBe(true);
    expect((await wijzigVergelijk({ soort: "verbergen", id: "huisstijl", verborgen: true })).rijen.find((r) => r.id === "huisstijl")?.verborgen).toBe(true);
    expect((await vergelijkRijen()).map((r) => r.id)).not.toContain("huisstijl");
    expect((await fout(wijzigVergelijk({ soort: "toevoegen", kenmerk: "", smileyapp: "x", papier: "y" }))).status).toBe(422);
    expect((await fout(wijzigVergelijk({ soort: "verwijderen", id: "../x" }))).status).toBe(404);
    await wijzigVergelijk({ soort: "verbergen", id: "huisstijl", verborgen: false });
    expect(await wijzigVergelijk({ soort: "verwijderen", id: eigen?.id ?? "" })).toMatchObject({ aangepast: false });
    expect(h.kv.has("voorstel-smileyapp:vergelijken")).toBe(false);
    // een opslag die niet antwoordt haalt de pagina niet onderuit
    h.kvKapot = true;
    expect((await vergelijkRijen()).map((r) => r.id)).toEqual(STANDAARD_RIJEN.map((r) => r.id));
    h.kvKapot = false;
    expect(await vergelijkVoorBeheer()).toMatchObject({ aangepast: false });
  });

  it("de pagina: een tabel die op de telefoon kaarten wordt, en een link in de footer en bij de pakketten", () => {
    const tabel = lees("components/voorstel/smileyapp/VergelijkTabel.tsx");
    expect(tabel).toContain('<caption className="sr-only">{t.tabelNaam}</caption>');
    // het verborgen bijschrift zit in een afgeknipt kader: dat kader is zelf gepositioneerd
    expect(tabel).toMatch(/className="sm-onthul relative hidden overflow-hidden[^"]*md:block"/);
    expect(tabel).toContain('<ul className="space-y-4 md:hidden">');
    expect(tabel).toContain('<th scope="row"');
    expect(tabel).toContain("{t.uitleg}");
    const pagina = lees("app/voorstel/smileyapp/vergelijken/page.tsx");
    expect(pagina).toContain("const rijen = await vergelijkRijen();");
    expect(pagina).toContain('export const dynamic = "force-dynamic";');
    expect(lees("app/voorstel/smileyapp/layout.tsx")).toContain("href={`${BASE}/vergelijken`}");
    const home = lees("app/voorstel/smileyapp/page.tsx");
    expect(home.indexOf("<PakketKiezer pakketten={pakketten} />")).toBeLessThan(home.indexOf("href={`${BASE}/vergelijken`}"));
    expect(home.indexOf("href={`${BASE}/vergelijken`}")).toBeLessThan(home.indexOf("{/* Functies */}"));
    // en op /en en /de naar de vertaalde pagina
    expect(lees("components/voorstel/smileyapp/taal/Landing.tsx")).toContain("href={`${b}/vergelijken`}");
    const kader = lees("components/voorstel/smileyapp/taal/Kader.tsx");
    for (const p of ["branches", "klanten", "samenstellen", "vergelijken", "partner-worden", "contact"]) expect(kader, p).toContain(`\`\${b}/${p}\``);
    // de blog blijft Nederlands, en zo heet de link ook
    expect(kader).toContain('<Link href={`${BASE}/blog`} hrefLang="nl"');
  });
});

// ---------------------------------------------------------------------------
describe("D. de nieuwe beheeracties: herkomst, limiet, sessie en rol", () => {
  const URL_INHOUD = "http://app:3000/api/voorstel/smileyapp/beheer/inhoud";
  const KOPPEN = { "x-forwarded-host": "smileyapp.zekerflex.com", origin: "https://smileyapp.zekerflex.com" };
  type Antwoord = { status: number; json: Record<string, unknown> & { error?: { message?: string; details?: { veld?: string } } } };
  const haal = async (deel: string, koppen: Record<string, string> = KOPPEN): Promise<Antwoord> => {
    const { GET } = await import("@/app/api/voorstel/smileyapp/beheer/inhoud/route");
    const res = await GET(new Request(`${URL_INHOUD}?deel=${deel}`, { headers: koppen }));
    return { status: res.status, json: (await res.json()) as Antwoord["json"] };
  };
  const stuur = async (body: unknown, koppen: Record<string, string> = {}): Promise<Antwoord> => {
    const { POST } = await import("@/app/api/voorstel/smileyapp/beheer/inhoud/route");
    const res = await POST(new Request(URL_INHOUD, { method: "POST", headers: { "content-type": "application/json", ...KOPPEN, ...koppen }, body: JSON.stringify(body) }));
    return { status: res.status, json: (await res.json()) as Antwoord["json"] };
  };
  const BRON = "Gemiddelde van onze eigen klanten over het afgelopen jaar.";
  const ACTIES = [
    { actie: "respons-bewaren", percentage: "40", bron: BRON },
    { actie: "respons-wissen" },
    { actie: "vergelijk-toevoegen", kenmerk: "Eigen", smileyapp: "Tekst van het team", papier: "Papier van het team" },
    { actie: "vergelijk-verwijderen", id: "a".repeat(16) },
    { actie: "vergelijk-verbergen", id: "rapport", verborgen: true },
  ];

  it("zonder sessie: 401, en er wordt niets bewaard; van een andere website: geweigerd vóór de sessie", async () => {
    for (const a of ACTIES) expect((await stuur(a)).status, a.actie).toBe(401);
    expect((await haal("vergelijken")).status).toBe(401);
    expect((await haal("instellingen")).status).toBe(401);
    expect(h.kv.size).toBe(0);
    h.principal = { userId: "u1", fullName: "Eigenaar ZekerFlex", rollen: ["PLATFORM_ADMIN"] };
    for (const a of ACTIES) expect((await stuur(a, { origin: "https://evil.example" })).status, a.actie).toBe(403);
    expect((await stuur(ACTIES[0], { "content-type": "text/plain" })).status).toBe(422);
    expect(h.kv.size).toBe(0);
  });

  it("als beheerder: de rekenhulp instellen en leeg maken, en rijen toevoegen, verbergen en verwijderen", async () => {
    h.principal = { userId: "u1", fullName: "Eigenaar ZekerFlex", rollen: ["PLATFORM_ADMIN"] };
    // via ZekerFlex binnen: het cijfer en een eigen rij staan op de site als woorden van Smileyapp, dus die zet alleen iemand van SmileyApp zelf
    expect((await stuur({ actie: "respons-bewaren", percentage: "40", bron: BRON })).json.error?.message).toContain("via ZekerFlex ingelogd");
    expect((await stuur({ actie: "vergelijk-toevoegen", kenmerk: "Eigen", smileyapp: "Tekst van het team", papier: "Papier van het team" })).json.error?.message).toContain("via ZekerFlex ingelogd");
    expect(h.kv.size).toBe(0);
    // vanaf hier: een beheerder met een eigen SmileyApp-account
    const accounts = await import("@/lib/voorstel/smileyapp-accounts");
    const sessie = vi.spyOn(accounts, "eisToegang").mockResolvedValue({ naam: "Martijn", email: "martijn@smileyapp.test", rol: "beheerder", via: "smileyapp", id: "martijn@smileyapp.test" });
    expect("respons" in (await haal("instellingen")).json).toBe(false);
    expect((await stuur({ actie: "respons-bewaren", percentage: "40", bron: "kort" })).json.error?.details?.veld).toBe("bron");
    expect((await stuur({ actie: "respons-bewaren", percentage: "140", bron: BRON })).json.error?.details?.veld).toBe("percentage");
    // de vorm: een getal in plaats van tekst, of een bron die veel te lang is, komt niet eens bij de regels
    expect((await stuur({ actie: "respons-bewaren", percentage: 40, bron: BRON })).status).toBe(422);
    expect((await stuur({ actie: "respons-bewaren", percentage: "40", bron: "x".repeat(601) })).status).toBe(422);
    expect(await smileyappRespons()).toBeNull();
    expect((await stuur({ actie: "respons-bewaren", percentage: "40", bron: BRON })).json.respons).toEqual({ percentage: 40, bron: BRON });
    expect((await haal("instellingen")).json.respons).toEqual({ percentage: 40, bron: BRON });
    expect("respons" in (await stuur({ actie: "respons-wissen" })).json).toBe(false);
    expect(await smileyappRespons()).toBeNull();

    const start = await haal("vergelijken");
    expect(start.json).toMatchObject({ aangepast: false });
    const na = await stuur({ actie: "vergelijk-toevoegen", kenmerk: "Eigen", smileyapp: "Tekst van het team", papier: "Papier van het team" });
    expect(na.status).toBe(200);
    const rijen = na.json.rijen as { id: string; eigen: boolean; verborgen: boolean }[];
    const eigen = rijen.find((r) => r.eigen);
    expect(rijen).toHaveLength(STANDAARD_RIJEN.length + 1);
    expect((await stuur({ actie: "vergelijk-toevoegen", kenmerk: "Eigen", smileyapp: "x".repeat(141), papier: "Papier" })).json.error?.details?.veld).toBe("smileyapp");
    expect(((await stuur({ actie: "vergelijk-verbergen", id: "rapport", verborgen: true })).json.rijen as typeof rijen).find((r) => r.id === "rapport")?.verborgen).toBe(true);
    expect((await stuur({ actie: "vergelijk-verbergen", id: eigen?.id, verborgen: true })).status).toBe(422);
    expect((await stuur({ actie: "vergelijk-verwijderen", id: "../x" })).status).toBe(404);
    expect((await stuur({ actie: "vergelijk-verbergen", id: "rapport", verborgen: "ja" })).status).toBe(422);
    await stuur({ actie: "vergelijk-verbergen", id: "rapport", verborgen: false });
    expect((await stuur({ actie: "vergelijk-verwijderen", id: eigen?.id })).json).toMatchObject({ aangepast: false });
    expect(h.kv.has("voorstel-smileyapp:vergelijken")).toBe(false);
    sessie.mockRestore();
  });

  it("in de route: poort (herkomst en limiet) → sessie → body → limiet per persoon → rol → pas dan bewaren", () => {
    const s = lees(INHOUD);
    const post = s.split(/\nexport async function /).slice(1).find((x) => x.startsWith("POST(")) ?? "";
    const get = s.split(/\nexport async function /).slice(1).find((x) => x.startsWith("GET(")) ?? "";
    const volgorde = ["await smileyPoort(request, { json: true })", "const ik = await eisToegang();", "await jsonBegrensd(request", "schema.safeParse(", 'name: "smileyapp-inhoud", identifier: ik.id'].map((t) => post.indexOf(t));
    expect(volgorde.every((i) => i >= 0)).toBe(true);
    expect([...volgorde].sort((a, b) => a - b)).toEqual(volgorde);
    // de rol: alleen een beheerder, met 423 (geen 403), en de controle staat vóór elke schrijfactie
    const rekenRol = post.indexOf('if (ik.rol !== "beheerder") throw AppError.alleenBeheerder("Alleen een beheerder kan de rekenhulp op de site instellen.");');
    const vergelijkRol = post.indexOf('if (ik.rol !== "beheerder") throw AppError.alleenBeheerder("Alleen een beheerder kan de vergelijking wijzigen.");');
    expect(rekenRol).toBeGreaterThan(volgorde[4] ?? 0);
    expect(vergelijkRol).toBeGreaterThan(volgorde[4] ?? 0);
    for (const schrijf of ["await wisRespons()", "await bewaarRespons("]) {
      expect(post.indexOf(schrijf), schrijf).toBeGreaterThan(rekenRol);
      expect(post.split(schrijf).length - 1, schrijf).toBe(1);
    }
    expect(post.indexOf("await wijzigVergelijk(")).toBeGreaterThan(vergelijkRol);
    // elke schrijfactie van de vergelijking staat ná de rolcontrole
    expect(post.slice(0, vergelijkRol)).not.toContain("wijzigVergelijk(");
    expect(post.slice(0, rekenRol)).not.toMatch(/bewaarRespons\(|wisRespons\(/);
    expect(s).not.toContain("AppError.forbidden");
    expect(s).not.toMatch(/request\.(json|text|formData|arrayBuffer|blob)\(/);
    // lezen mag het hele team, na de poort en de sessie
    expect(get).toContain('if (deel === "vergelijken") return NextResponse.json(await vergelijkVoorBeheer(), geenCache);');
    expect(get.indexOf("await smileyPoort(request);")).toBeLessThan(get.indexOf("await eisToegang();"));
    expect(get.indexOf("await eisToegang();")).toBeLessThan(get.indexOf("vergelijkVoorBeheer()"));
    // de vorm is begrensd vóór de regels
    for (const vorm of ['z.object({ actie: z.literal("respons-bewaren"), percentage: z.string().max(10), bron: z.string().max(600) })', 'z.object({ actie: z.literal("vergelijk-verbergen"), id: RIJ_ID, verborgen: z.boolean() })']) expect(s).toContain(vorm);
    // de opslag: onder voorstel-smileyapp:, zonder gegevens van een bezoeker
    expect(lees("lib/voorstel/smileyapp-vergelijken.ts")).toContain('const SLEUTEL = "voorstel-smileyapp:vergelijken";');
    expect(lees("lib/voorstel/smileyapp-instellingen.ts")).toContain('const SLEUTEL = "voorstel-smileyapp:instellingen";');
  });

  it("in het beheer: de rekenhulp staat bij het overzicht, de vergelijking heeft een tabblad, en alleen een beheerder wijzigt", () => {
    const beheer = lees("components/voorstel/smileyapp/beheer/SmileyBeheer.tsx");
    expect(beheer).toContain('{tab === "overzicht" && data && <Rekenhulp rol={data.ik.rol} />}');
    expect(beheer).toContain('["vergelijken", "Vergelijken"]');
    expect(beheer).toContain('{tab === "vergelijken" && data && <VergelijkBeheer rol={data.ik.rol} />}');
    const reken = lees("components/voorstel/smileyapp/beheer/Rekenhulp.tsx");
    expect(reken).toContain('const beheerder = rol === "beheerder";');
    expect(reken).toContain('actie: "respons-bewaren"');
    expect(reken).toContain('actie: "respons-wissen"');
    // het scherm neemt de versie van de server over, en heeft zelf geen cijfer klaarstaan
    expect(reken).toContain("neemOver(await vraag<Instellingen>(URL_INHOUD, { method: \"POST\", body }));");
    expect(reken).toContain('const [percentage, setPercentage] = useState("");');
    expect(reken).not.toMatch(/\d\s?%|placeholder=/);
    expect(reken).toContain('<label htmlFor="sm-respons-bron"');
    const vergelijk = lees("components/voorstel/smileyapp/beheer/VergelijkBeheer.tsx");
    expect(vergelijk).toContain('const magWijzigen = rol === "beheerder";');
    expect(vergelijk).toContain("setData(await vraag<Gegevens>(URL_INHOUD, { method: \"POST\", body }));");
    expect(vergelijk).toContain("maxLength={RIJ_VELD_MAX}");
  });
});

// ---------------------------------------------------------------------------
describe("E. bronbewakers deel 6b", () => {
  it("de scan vindt de nieuwe bestanden", () => {
    for (const f of [...NIEUW_PAGINA, ...NIEUW_ONDERDEEL, ...NIEUW_LIB]) expect(CODE, f).toContain(f);
    expect(NIEUW_PAGINA).toHaveLength(16);
  });

  it("geen JSON-LD of canonical, geen adres van buiten, geen formulier-element en geen kop van het eerste niveau in een onderdeel", () => {
    for (const f of [...NIEUW_PAGINA, ...NIEUW_ONDERDEEL, ...NIEUW_LIB]) {
      const s = lees(f);
      expect(s, f).not.toMatch(/application\/ld\+json|ldJson\(|canonical\(|LocalBusiness|alternates|hreflang=/);
      // niets van derden: geen adres, geen script, geen lettertype, geen beeld van buiten
      expect(s, f).not.toMatch(/https?:\/\//);
      expect(s, f).not.toMatch(/<script|<iframe|@import|fonts\.googleapis|next\/script/);
      expect(s, f).not.toMatch(/<form[\s>]/);
      // useEffect geeft nooit een waarde terug
      expect(s, f).not.toMatch(/useEffect\(\(\) => [a-zA-Z]/);
      // geen lookbehind: deze code bereikt de browser (Safari vóór 16.4)
      expect(s, f).not.toMatch(/\(\?<[=!]/);
    }
    for (const f of [...NIEUW_ONDERDEEL, ...NIEUW_LIB]) expect(lees(f), f).not.toMatch(/<h1[\s>]/);
    // elke nieuwe pagina: precies één kop, en noindex komt van de layout (de vertaalde pagina's zetten het er zelf ook op)
    for (const p of NIEUW_PAGINA) expect(lees(p).match(/<h1[\s>]/g) ?? [], p).toHaveLength(1);
    expect(lees("app/voorstel/smileyapp/layout.tsx")).toContain("robots: { index: false, follow: false");
  });

  it("client-onderdelen laden geen opslag, mail of zod; een servercomponent geeft alleen gegevens door", () => {
    for (const f of ["Samensteller.tsx", "RekenHulp.tsx", "beheer/Rekenhulp.tsx", "beheer/VergelijkBeheer.tsx"]) {
      const s = lees(`components/voorstel/smileyapp/${f}`);
      expect(s.startsWith('"use client";'), f).toBe(true);
      expect(s, f).not.toMatch(/@\/lib\/(storage|mail|prisma|redis|errors)|from "zod"|smileyapp-(talen|vergelijken|instellingen|vragen|pakketten|accounts|aanvragen)"/);
    }
    // de servercomponenten zelf zijn geen clientbestand
    for (const f of ["RekenBlok.tsx", "VergelijkTabel.tsx", "taal/Paginas.tsx", "taal/Contact.tsx", "taal/Hulp.tsx"]) expect(lees(`components/voorstel/smileyapp/${f}`), f).not.toContain('"use client"');
    // wat de pagina aan de samensteller geeft, zijn platte gegevens: id, groep, soort en tekst
    for (const f of ["app/voorstel/smileyapp/samenstellen/page.tsx", "components/voorstel/smileyapp/taal/Hulp.tsx"]) expect(lees(f), f).toContain(".map(({ id, groep, soort, tekst }) => ({ id, groep, soort, tekst }))");
    for (const t of [SAMENSTEL_NL, REKEN_NL, VERGELIJK_NL]) expect(JSON.parse(JSON.stringify(t))).toEqual(t);
  });

  it("de nieuwe vaste pagina's staan in de lijst van de nachtelijke rondgang, en nergens in de sitemap", () => {
    const generated = lees("lib/dev/app-pages.generated.ts");
    for (const p of NIEUW_PAGINA) expect(generated, p).toContain(`"file":"${p}"`);
    expect(lees("app/sitemap.ts")).not.toContain("/voorstel/smileyapp");
  });

  it("lange Duitse woorden breken netjes: de koppen houden afbreken op de telefoon", () => {
    for (const p of ["app/voorstel/smileyapp/samenstellen/page.tsx", "app/voorstel/smileyapp/vergelijken/page.tsx"]) {
      const regel = lees(p).split("\n").find((r) => r.includes("<h1 ")) ?? "";
      expect(regel, p).toContain("[hyphens:auto] md:[hyphens:manual]");
      expect(regel, p).toContain("break-words");
    }
    // de vertaalde pagina's gebruiken de klasse van de bestaande vertaalde koppen
    const klasse = lees("components/voorstel/smileyapp/taal/Landing.tsx").split("\n").find((r) => r.startsWith("export const DEMO_KOP_KLASSE")) ?? "";
    expect(klasse).toContain("break-words");
    expect(klasse).toContain("[hyphens:auto] md:[hyphens:manual]");
    for (const p of NIEUW_PAGINA.filter((x) => /\/(en|de)\//.test(x))) expect(lees(p), p).toContain("<h1 className={DEMO_KOP_KLASSE}>");
  });
});
// Nalezing 19 nov: een eigen vraag uit de adresbalk mag niet op een half teken
// eindigen (server en browser tonen dan iets anders) en geen richtingstekens houden.
describe("de eigen vraag uit de adresbalk", () => {
  it("knipt op hele tekens en haalt opmaaktekens weg", async () => {
    const { schoonEigen: schoon } = await import("@/lib/voorstel/smileyapp-samensteller");
    const lang = schoon(`${"a".repeat(119)}\u{1F600}\u{1F600}`);
    expect([...lang]).toHaveLength(120);
    expect(lang.endsWith("\u{1F600}")).toBe(true);
    expect(lang).not.toMatch(/[\uD800-\uDBFF]$/);
    expect(schoon("Hoe was\u202E het \u200Bvandaag?")).toBe("Hoe was het vandaag?");
  });
});
