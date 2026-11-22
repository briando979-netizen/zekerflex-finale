import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { INDEXNOW_MAX, INDEXNOW_VERSIE_KV, RECENT_DAGEN, VASTE_PADEN, gemeldeVersie, kiesIndexNowUrls, type SitemapRegel } from "@/lib/seo/indexnow-keuze";

// IndexNow (22 nov 2026): de dagelijkse ronde meldde elke dag dezelfde 13 vaste paden, en Bing had maar 1 pagina opgenomen.
// Nu na een nieuwe versie de hele sitemap (hooguit 10.000), en anders de vaste paden plus wat de sitemap de laatste 3 dagen
// als gewijzigd noemt. De klok staat vast (een `nu` gaat mee), dus geen tijdbom.

const BASIS = "https://zekerflex.com";
const NU = new Date("2026-11-22T05:00:00+01:00");
const DAG = 86_400_000;

const REGELS: SitemapRegel[] = [
  { url: `${BASIS}/` },
  { url: `${BASIS}/prijzen` },
  { url: `${BASIS}/werken-als/orderpicker` },
  { url: `${BASIS}/klussen/oud`, lastModified: new Date("2026-11-01T08:00:00+01:00") },
  { url: `${BASIS}/klussen/nieuw`, lastModified: new Date("2026-11-21T08:00:00+01:00") },
  { url: `${BASIS}/nieuws/vandaag`, lastModified: "2026-11-22T03:00:00.000Z" },
  { url: `${BASIS}/p/kapot`, lastModified: "geen datum" },
];

const kies = (o: Partial<Parameters<typeof kiesIndexNowUrls>[0]> = {}) =>
  kiesIndexNowUrls({ versie: "b".repeat(40), vorige: "a".repeat(40), regels: REGELS, vast: VASTE_PADEN, basis: BASIS, nu: NU, ...o });

describe("IndexNow: welke URL's de dagelijkse ronde meldt", () => {
  it("één sleutel voor de hele site (niet per gebruiker), en de vaste paden zijn eigen paden", () => {
    expect(INDEXNOW_VERSIE_KV).toBe("indexnow:laatste-versie");
    expect(RECENT_DAGEN).toBe(3);
    expect(INDEXNOW_MAX).toBe(10_000);
    for (const p of VASTE_PADEN) expect(p, p).toMatch(/^\//);
    for (const p of ["/", "/voor-freelancers", "/bijbaan", "/werken-als"]) expect(VASTE_PADEN, p).toContain(p);
  });

  it("een nieuwe versie: de hele sitemap, de vaste paden eerst, en de versie onthouden", () => {
    const k = kies();
    expect(k.soort).toBe("alles");
    expect(k.onthoud).toBe("b".repeat(40));
    for (const r of REGELS) expect(k.urls, r.url).toContain(r.url);
    expect(k.urls.slice(0, VASTE_PADEN.length)).toEqual(VASTE_PADEN.map((p) => `${BASIS}${p}`));
    expect(new Set(k.urls).size).toBe(k.urls.length);
    // de eerste keer (nog niets in KV) telt ook als nieuw
    expect(kies({ vorige: null }).soort).toBe("alles");
  });

  it("dezelfde versie: de vaste paden plus wat de laatste 3 dagen veranderde, en niets onthouden", () => {
    const k = kies({ vorige: "b".repeat(40) });
    expect(k.soort).toBe("gewijzigd");
    expect(k.onthoud).toBeNull();
    expect(k.urls).toContain(`${BASIS}/klussen/nieuw`);
    expect(k.urls).toContain(`${BASIS}/nieuws/vandaag`);
    expect(k.urls).toContain(`${BASIS}/prijzen`);
    expect(k.urls).not.toContain(`${BASIS}/klussen/oud`);
    expect(k.urls).not.toContain(`${BASIS}/werken-als/orderpicker`);
    expect(k.urls).not.toContain(`${BASIS}/p/kapot`);
    expect(k.urls).toHaveLength(VASTE_PADEN.length + 2);
  });

  it("een onbekende versie (lokaal, geen VERSIE-bestand) meldt nooit de hele sitemap", () => {
    const k = kies({ versie: null, vorige: null });
    expect(k.soort).toBe("gewijzigd");
    expect(k.onthoud).toBeNull();
  });

  it("de grens van 3 dagen is precies: op de grens wel, een milliseconde ervoor niet", () => {
    const op = { url: `${BASIS}/op-de-grens`, lastModified: new Date(NU.getTime() - 3 * DAG) };
    const net = { url: `${BASIS}/net-te-oud`, lastModified: new Date(NU.getTime() - 3 * DAG - 1) };
    const k = kies({ vorige: "b".repeat(40), regels: [op, net] });
    expect(k.urls).toContain(op.url);
    expect(k.urls).not.toContain(net.url);
  });

  it("hooguit 10.000 URL's, alleen de eigen host, geen dubbele", () => {
    const veel: SitemapRegel[] = Array.from({ length: 12_000 }, (_, i) => ({ url: `${BASIS}/klussen/k${i}` }));
    const k = kies({ regels: [...veel, { url: "https://ander.example/pagina" }, { url: `${BASIS}/` }] });
    expect(k.urls).toHaveLength(INDEXNOW_MAX);
    expect(k.urls[0]).toBe(`${BASIS}/`);
    expect(k.urls.every((u) => u.startsWith(`${BASIS}/`))).toBe(true);
    expect(k.urls).not.toContain("https://ander.example/pagina");
    // een basis met een schuine streep erachter en een pad zonder schuine streep geven dezelfde URL's
    expect(kies({ basis: `${BASIS}/`, vast: ["prijzen"], regels: [] }).urls).toEqual([`${BASIS}/prijzen`]);
  });

  it("leest de opgeslagen versie soepel", () => {
    expect(gemeldeVersie({ versie: "abc", op: "2026-11-22T04:00:00.000Z", aantal: 3 })).toBe("abc");
    expect(gemeldeVersie("abc")).toBe("abc");
    expect(gemeldeVersie("")).toBeNull();
    expect(gemeldeVersie({ versie: 5 })).toBeNull();
    expect(gemeldeVersie([])).toBeNull();
    expect(gemeldeVersie(null)).toBeNull();
    expect(gemeldeVersie(undefined)).toBeNull();
  });

  it("de route gebruikt de keuze, de live versie en onthoudt pas na een geslaagde melding", () => {
    const bron = readFileSync(path.join(process.cwd(), "app/api/internal/seo/indexnow/route.ts"), "utf8").split("\r\n").join("\n");
    expect(bron).toContain("kiesIndexNowUrls({");
    expect(bron).toContain("liveVersie()?.sha");
    expect(bron).toContain("kvGet<unknown>(INDEXNOW_VERSIE_KV)");
    expect(bron).toContain("if (keuze.onthoud && result.ok && sitemapOk)");
    expect(bron).toContain("pingIndexNow(keuze.urls)");
    // een route.ts met andere exports laat de build falen
    const namen = [...bron.matchAll(/^export\s+(?:const|async function|function)\s+(\w+)/gm)].map((m) => m[1]);
    expect(namen.sort()).toEqual(["GET", "dynamic", "maxDuration", "runtime"]);
  });
});
