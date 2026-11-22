import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { APP_PAGES } from "@/lib/dev/app-pages.generated";
import { HOME_SECTIES } from "@/lib/ontwerp/home";
import { isSeoPad } from "@/lib/ontwerp/seo";
import { isVastePagina } from "@/lib/ontwerp/vaste-paginas";

// 22 nov 2026 (gebruikersonderzoek, eigenaar: "samenvoegen tot één"): /bedrijven en /voor-bedrijven vertelden bijna hetzelfde.
// /bedrijven blijft: daar staat de zoekterm "personeel inhuren" (lib/ontwerp/seo.ts), het is de Homepage in de Site-ontwerper en
// de schakelaar in de kopbalk gaat er al heen. /voor-bedrijven stuurt voorgoed door (308). Het menu (lib/marketing/site-nav.ts,
// lib/ontwerp/menu.ts) linkt nog naar het oude adres en loopt via de omleiding, tot iemand het bijwerkt.

const ROOT = process.cwd();
const lees = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");
type Regel = { source: string; destination: string; permanent: boolean };

function bestanden(dir: string, uit: string[] = []): string[] {
  for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) bestanden(p, uit);
    else if (/\.(ts|tsx)$/.test(e.name)) uit.push(p);
  }
  return uit;
}

/** Zonder commentaar: een opmerking over de geschiedenis mag het oude adres noemen, een link niet. */
const zonderCommentaar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[\s;,{(])\/\/.*$/gm, "$1");

describe("/voor-bedrijven is opgegaan in /bedrijven", () => {
  it("het oude adres stuurt voorgoed door, en geen andere omleiding gaat er nog via", async () => {
    const mod = (await import(pathToFileURL(path.join(ROOT, "next.config.mjs")).href)) as { default: { redirects: () => Promise<Regel[]> } };
    const regels = await mod.default.redirects();
    expect(regels.find((r) => r.source === "/voor-bedrijven")).toMatchObject({ destination: "/bedrijven", permanent: true });
    expect(regels.filter((r) => r.destination === "/voor-bedrijven")).toEqual([]);
  });

  it("de pagina is weg, en staat niet meer in de sitemap, de rondgang, de SEO-lijst of de vaste pagina's", () => {
    expect(existsSync(path.join(ROOT, "app/(marketing)/voor-bedrijven/page.tsx"))).toBe(false);
    const sitemap = lees("app/sitemap.ts");
    expect(sitemap).not.toContain('entry("/voor-bedrijven"');
    expect(sitemap).toContain('entry("/bedrijven"');
    expect(APP_PAGES.some((p) => p.route === "/voor-bedrijven")).toBe(false);
    expect(isSeoPad("/voor-bedrijven")).toBe(false);
    expect(isSeoPad("/bedrijven")).toBe(true);
    expect(isVastePagina("voor-bedrijven")).toBe(false);
  });

  it("de beste blokken van /voor-bedrijven staan op /bedrijven: rekentools, per branche en stad, en de vragen", () => {
    expect(HOME_SECTIES.map((s) => s.id)).toContain("rekentools");
    const pagina = lees("app/(marketing)/bedrijven/page.tsx");
    for (const v of ['"/rekentools/kosten-uitzendkracht-berekenen"', '"/rekentools/wet-dba-check"', '"/tarieven-overzicht"', '<PerBrancheEnStad voor="bedrijven" />', "<BedrijfsVragen />"]) {
      expect(pagina, v).toContain(v);
    }
    for (const q of ["Hoe snel kan ik iemand hebben?", "Kan ik meerdere vestigingen beheren?"]) expect(pagina, q).toContain(q);
    // de knop in het donkere blok ging naar de andere bedrijvenpagina; nu naar een klus plaatsen
    expect(pagina).not.toContain('href="/voor-bedrijven"');
  });

  it("links in pagina's en onderdelen gaan naar /bedrijven; alleen het menu wacht nog", () => {
    const MENU = new Set(["lib/marketing/site-nav.ts", "lib/ontwerp/menu.ts"]);
    const oud = ["app", "components", "lib"]
      .flatMap((d) => bestanden(d))
      .filter((f) => !MENU.has(f) && zonderCommentaar(lees(f)).includes("/voor-bedrijven"));
    expect(oud).toEqual([]);
    // de standaardknop in de verkoopmail (de mail van 21 nov linkte naar /voor-bedrijven, dat nu doorstuurt)
    expect(lees("lib/sales/send.ts")).toContain("url: `${basis}/bedrijven`");
  });
});
