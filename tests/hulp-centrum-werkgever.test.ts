import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HULP_TEKSTEN_WERKGEVER, hulpTekstenWerkgever } from "@/lib/hulp/werkgever-teksten";
import { HULP_TEKSTEN } from "@/lib/hulp/teksten";
import { SUPPORT_CHAT, SUPPORT_CHAT_WERKGEVER, zoekVragen, type HulpTeksten } from "@/lib/hulp/hulpjes";
import { nl as woordenNl } from "@/lib/i18n/dictionaries";
import { en as woordenEn } from "@/lib/i18n/dictionary-en";
import { LOCALES } from "@/lib/i18n/config";

// Het hulpcentrum voor bedrijven (15 nov 2026): een eigen versie naast die voor werkers, achter het vraagteken in de kopbalk van de
// werkgeversapp. Eigen vragen en eigen nieuws, dezelfde indeling. Menunamen moeten precies zijn zoals de app ze toont, elke link moet
// naar een bestaande pagina gaan, en de twee versies mogen elkaar niet in de weg zitten.

const ROOT = process.cwd();
const nl = HULP_TEKSTEN_WERKGEVER.nl;
const en = HULP_TEKSTEN_WERKGEVER.en;
const bron = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");

function functiesIn(waarde: unknown, pad = ""): string[] {
  if (typeof waarde === "function") return [pad || "(wortel)"];
  if (!waarde || typeof waarde !== "object") return [];
  return Object.entries(waarde as Record<string, unknown>).flatMap(([k, v]) => functiesIn(v, pad ? `${pad}.${k}` : k));
}
function legeTeksten(waarde: unknown, pad = ""): string[] {
  if (typeof waarde === "string") return waarde.trim() ? [] : [pad];
  if (!waarde || typeof waarde !== "object") return [];
  return Object.entries(waarde as Record<string, unknown>).flatMap(([k, v]) => legeTeksten(v, pad ? `${pad}.${k}` : k));
}
const links = (t: HulpTeksten): string[] => [...t.vragen, ...t.nieuwsItems].flatMap((x) => (x.link ? [x.link.href] : []));
const tekstVan = (t: HulpTeksten, id: string) => {
  const v = t.vragen.find((x) => x.id === id);
  return v ? `${v.v} ${v.a}` : "";
};

describe("de teksten van het hulpcentrum voor bedrijven", () => {
  it("heeft Nederlands en Engels, zonder functies of lege teksten, en kiest Nederlands als terugval", () => {
    for (const [taal, t] of Object.entries(HULP_TEKSTEN_WERKGEVER)) {
      expect(functiesIn(t), `taal ${taal}`).toEqual([]);
      expect(legeTeksten(t), `taal ${taal}`).toEqual([]);
      expect(t.hulp.leeg, `taal ${taal}`).toContain("{q}");
    }
    expect(hulpTekstenWerkgever("en")).toBe(en);
    expect(hulpTekstenWerkgever("nl")).toBe(nl);
    for (const taal of LOCALES) if (taal !== "en") expect(hulpTekstenWerkgever(taal)).toBe(nl);
  });

  it("heeft in beide talen dezelfde vragen en hetzelfde nieuws, met dezelfde links", () => {
    expect(en.vragen.map((v) => v.id)).toEqual(nl.vragen.map((v) => v.id));
    expect(en.nieuwsItems.map((n) => `${n.id}|${n.dag}`)).toEqual(nl.nieuwsItems.map((n) => `${n.id}|${n.dag}`));
    expect(links(en)).toEqual(links(nl));
    expect(new Set(nl.vragen.map((v) => v.id)).size).toBe(nl.vragen.length);
    expect(new Set(nl.nieuwsItems.map((n) => n.id)).size).toBe(nl.nieuwsItems.length);
  });

  it("zet het nieuws op datum, nieuwste eerst, met een geldige dag", () => {
    const dagen = nl.nieuwsItems.map((n) => n.dag);
    for (const d of dagen) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect([...dagen].sort().reverse()).toEqual(dagen);
  });

  it("linkt alleen naar pagina's die bestaan, en de chat gaat naar de chat van het bedrijf", () => {
    for (const href of [...links(nl), SUPPORT_CHAT_WERKGEVER, "/status", "/kennis/faq"]) {
      const pad = href.split("?")[0] ?? "";
      const kandidaten = [`app${pad}/page.tsx`, `app/(marketing)${pad}/page.tsx`];
      expect(kandidaten.some((k) => existsSync(path.join(ROOT, k))), href).toBe(true);
    }
    expect(SUPPORT_CHAT_WERKGEVER.startsWith("/werkgever/")).toBe(true);
    expect(nl.vragen.find((v) => v.id === "probleem")?.link?.href).toBe(SUPPORT_CHAT_WERKGEVER);
    // en niet die van de werker-app
    expect(links(nl)).not.toContain(SUPPORT_CHAT);
  });

  it("noemt de menu's precies zoals de werkgeversapp ze noemt (Nederlands en Engels)", () => {
    const moet: [string, string][] = [
      [tekstVan(nl, "klus-uitzetten"), woordenNl.start.placeShift],
      [tekstVan(nl, "bedrijf-verifieren"), woordenNl.nav.start],
      [tekstVan(nl, "wie-inplannen"), woordenNl.nav.klussen],
      [tekstVan(nl, "wie-inplannen"), woordenNl.nav.chat],
      [tekstVan(nl, "favorieten"), woordenNl.nav.favorieten],
      [tekstVan(nl, "uren"), woordenNl.nav.urenGoedkeuren],
      [tekstVan(nl, "facturen"), woordenNl.nav.facturen],
      [tekstVan(nl, "chat"), woordenNl.nav.chat],
      [tekstVan(nl, "geblokkeerd"), woordenNl.nav.geblokkeerd],
      [tekstVan(nl, "overeenkomsten"), woordenNl.nav.overeenkomsten],
      [tekstVan(nl, "overeenkomsten"), woordenNl.nav.compliance],
      [tekstVan(nl, "meldingen"), woordenNl.nav.instellingen],
      // de Engelse app toont Engelse menunamen: de Engelse tekst noemt die, geen Nederlandse
      [tekstVan(en, "klus-uitzetten"), woordenEn.start.placeShift],
      [tekstVan(en, "bedrijf-verifieren"), woordenEn.nav.start],
      [tekstVan(en, "wie-inplannen"), woordenEn.nav.klussen],
      [tekstVan(en, "favorieten"), woordenEn.nav.favorieten],
      [tekstVan(en, "uren"), woordenEn.nav.urenGoedkeuren],
      [tekstVan(en, "facturen"), woordenEn.nav.facturen],
      [tekstVan(en, "geblokkeerd"), woordenEn.nav.geblokkeerd],
      [tekstVan(en, "overeenkomsten"), woordenEn.nav.overeenkomsten],
      [tekstVan(en, "overeenkomsten"), woordenEn.nav.compliance],
      [tekstVan(en, "meldingen"), woordenEn.nav.instellingen],
    ];
    for (const [tekst, naam] of moet) expect(tekst, `"${naam}"`).toContain(naam);
  });

  it("belooft niets wat niet kan: niets over ZekerFlex Bank, een voorschot of een tegoed", () => {
    const alles = JSON.stringify(nl) + JSON.stringify(en);
    expect(alles).not.toMatch(/ZekerFlex Bank|voorschot|tegoed|advance payment|credit balance/i);
  });

  it("zoeken werkt in de vragen voor bedrijven", () => {
    expect(zoekVragen(nl.vragen, "factuur").map((v) => v.id)).toContain("facturen");
    expect(zoekVragen(en.vragen, "invoices").map((v) => v.id)).toContain("facturen");
    expect(zoekVragen(nl.vragen, "zwembad")).toEqual([]);
  });
});

describe("twee aparte versies: werkers en bedrijven", () => {
  it("de vragen en het nieuws verschillen van die voor werkers", () => {
    const werker = HULP_TEKSTEN.nl;
    expect(nl.vragen.find((v) => v.id === "klus-uitzetten")).toBeDefined();
    expect(werker.vragen.find((v) => v.id === "klus-uitzetten")).toBeUndefined();
    expect(werker.vragen.find((v) => v.id === "inchecken")).toBeDefined();
    expect(nl.vragen.find((v) => v.id === "inchecken")).toBeUndefined();
    expect(nl.onder).not.toBe(werker.onder);
  });

  it("de werker-versie kent het nieuws van 15 nov over de chat en de branches, in alle vijf de talen", () => {
    for (const taal of LOCALES) {
      const t = HULP_TEKSTEN[taal];
      expect(t.nieuwsItems[0]?.id, `taal ${taal}`).toBe("2026-11-15-chat");
      expect(t.nieuwsItems.some((n) => n.id === "2026-11-10-branches"), `taal ${taal}`).toBe(true);
      expect(t.vragen.some((v) => v.id === "chat"), `taal ${taal}`).toBe(true);
    }
  });

  it("de werkgeversapp toont het hulpcentrum voor bedrijven, de werker-app dat voor werkers", () => {
    const shell = bron("components/app/EmployerShell.tsx");
    expect(shell).toMatch(/<HulpCentrum t=\{hulp\} soort="bedrijf"/);
    expect(bron("app/werkgever/layout.tsx")).toMatch(/hulp=\{hulpTekstenWerkgever\(locale\)\}/);
    expect(bron("components/app/FreelancerShell.tsx")).toMatch(/<HulpCentrum t=\{hulp\} handleidingen/);
    expect(bron("app/dashboard/layout.tsx")).toMatch(/hulp=\{hulpTeksten\(locale\)\}/);
  });

  it("het hulpcentrum kiest de chat per versie, en de rondleiding van de werker staat er alleen in de werker-versie", () => {
    const c = bron("components/app/HulpCentrum.tsx");
    expect(c).toMatch(/soort === "bedrijf" \? SUPPORT_CHAT_WERKGEVER : SUPPORT_CHAT/);
    expect(c).toMatch(/\{soort === "werker" && <RondleidingRegel sluit=\{sluit\} \/>\}/);
    // useFT (de woordenlijst van de werker) staat alleen in die ene regel, niet in het hulpcentrum zelf
    const hoofd = c.slice(c.indexOf("export function HulpCentrum"));
    expect(hoofd).not.toContain("useFT(");
  });

  it("een clientbestand haalt de teksten voor bedrijven niet in de browser binnen (alleen typen)", () => {
    for (const f of ["components/app/EmployerShell.tsx", "components/app/HulpCentrum.tsx"]) {
      expect(bron(f), f).not.toMatch(/import\s+(?!type\b)[^;]*from ["']@\/lib\/hulp\/werkgever-teksten["']/);
    }
  });
});
