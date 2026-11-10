import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HULP_TEKSTEN, hulpTeksten } from "@/lib/hulp/teksten";
import { SUPPORT_CHAT, heeftNieuwsOngezien, zoekVragen, type HulpTeksten } from "@/lib/hulp/hulpjes";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { LOCALES } from "@/lib/i18n/config";

// Het hulpcentrum achter het vraagteken in de werker-app (components/app/HulpCentrum.tsx).
// De teksten gaan van de server naar een clientcomponent: dus geen functies erin. De antwoorden
// noemen menunamen: die moeten precies zo in de app staan, anders zoekt een werker naar een
// knop die niet bestaat. En elke link moet naar een bestaande pagina gaan.

const ROOT = process.cwd();
const nl = HULP_TEKSTEN.nl;

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
function links(t: HulpTeksten): string[] {
  return [...t.vragen, ...t.nieuwsItems].flatMap((x) => (x.link ? [x.link.href] : []));
}
const tekstVan = (t: HulpTeksten, id: string) => {
  const v = t.vragen.find((x) => x.id === id);
  return v ? `${v.v} ${v.a}` : "";
};
const nieuwsVan = (t: HulpTeksten, id: string) => {
  const n = t.nieuwsItems.find((x) => x.id === id);
  return n ? `${n.titel} ${n.tekst}` : "";
};

describe("teksten van het hulpcentrum", () => {
  it("heeft alle vijf talen, zonder functies of lege teksten, en valt terug op Nederlands", () => {
    expect(Object.keys(HULP_TEKSTEN).sort()).toEqual([...LOCALES].sort());
    for (const [taal, t] of Object.entries(HULP_TEKSTEN)) {
      expect(functiesIn(t), `taal ${taal}`).toEqual([]);
      expect(legeTeksten(t), `taal ${taal}`).toEqual([]);
      expect(t.hulp.leeg, `taal ${taal}`).toContain("{q}");
    }
    expect(hulpTeksten("nl").titel).toBe("Hulpcentrum");
  });

  it("heeft in elke taal dezelfde vragen en hetzelfde nieuws, met dezelfde links", () => {
    for (const [taal, t] of Object.entries(HULP_TEKSTEN)) {
      expect(t.vragen.map((v) => v.id), `taal ${taal}`).toEqual(nl.vragen.map((v) => v.id));
      expect(t.nieuwsItems.map((n) => `${n.id}|${n.dag}`), `taal ${taal}`).toEqual(nl.nieuwsItems.map((n) => `${n.id}|${n.dag}`));
      expect(links(t), `taal ${taal}`).toEqual(links(nl));
    }
    expect(new Set(nl.vragen.map((v) => v.id)).size).toBe(nl.vragen.length);
    expect(new Set(nl.nieuwsItems.map((n) => n.id)).size).toBe(nl.nieuwsItems.length);
  });

  it("zet het nieuws op datum, nieuwste eerst, met een geldige dag", () => {
    const dagen = nl.nieuwsItems.map((n) => n.dag);
    for (const d of dagen) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect([...dagen].sort().reverse()).toEqual(dagen);
  });

  it("linkt alleen naar pagina's die bestaan", () => {
    for (const href of [...links(nl), SUPPORT_CHAT, "/status", "/kennis/faq"]) {
      const pad = href.split("?")[0] ?? "";
      const kandidaten = [`app${pad}/page.tsx`, `app/(marketing)${pad}/page.tsx`];
      expect(kandidaten.some((k) => existsSync(path.join(ROOT, k))), href).toBe(true);
    }
  });

  it("noemt de menu's precies zoals de app ze noemt, in elke taal", () => {
    for (const taal of LOCALES) {
      const t = HULP_TEKSTEN[taal];
      const d = FREELANCER_DICTS[taal];
      const moet: [string, string][] = [
        [tekstVan(t, "klus-vinden"), d.nav.discover],
        [tekstVan(t, "klus-vinden"), d.market.saved],
        [tekstVan(t, "mijn-klussen"), d.nav.myJobs],
        [tekstVan(t, "uren"), d.nav.hours],
        [tekstVan(t, "betaling"), d.acct.invoices],
        [tekstVan(t, "betaling"), d.acct.payroll],
        [tekstVan(t, "meldingen"), d.nav.account],
        [tekstVan(t, "gegevens-wijzigen"), d.acct.personal],
        [tekstVan(t, "gegevens-downloaden"), d.acct.download],
        [tekstVan(t, "gegevens-downloaden"), d.acct.delete],
        [nieuwsVan(t, "2026-11-09-passkey"), d.acct.passkey],
        [nieuwsVan(t, "2026-11-09-bewaard"), d.market.saved],
      ];
      for (const [tekst, naam] of moet) expect(tekst, `taal ${taal}: "${naam}"`).toContain(naam);
    }
  });
});

describe("zoeken in de vragen", () => {
  it("geeft alles bij een lege zoekterm", () => {
    expect(zoekVragen(nl.vragen, "")).toHaveLength(nl.vragen.length);
    expect(zoekVragen(nl.vragen, "  a ")).toHaveLength(nl.vragen.length);
  });

  it("vindt op elk woord, zonder op hoofdletters of accenten te letten", () => {
    expect(zoekVragen(nl.vragen, "uren").map((v) => v.id)).toContain("uren");
    expect(zoekVragen(nl.vragen, "PASSKEY").map((v) => v.id)).toEqual(["beveiligen"]);
    expect(zoekVragen(HULP_TEKSTEN.ro.vragen, "notificari").map((v) => v.id)).toContain("meldingen");
    expect(zoekVragen(nl.vragen, "passkey vingerafdruk").map((v) => v.id)).toEqual(["beveiligen"]);
    expect(zoekVragen(nl.vragen, "passkey zwembad")).toEqual([]);
  });
});

describe("stip voor nieuws", () => {
  it("staat aan tot het nieuwste bericht is gezien", () => {
    const nieuwste = nl.nieuwsItems[0]?.id ?? "";
    expect(heeftNieuwsOngezien(nl.nieuwsItems, null)).toBe(true);
    expect(heeftNieuwsOngezien(nl.nieuwsItems, "ouder-bericht")).toBe(true);
    expect(heeftNieuwsOngezien(nl.nieuwsItems, nieuwste)).toBe(false);
    expect(heeftNieuwsOngezien([], null)).toBe(false);
  });
});

describe("talen in de browser", () => {
  it("geen client-component haalt alle teksten van het hulpcentrum binnen (alleen typen)", () => {
    const bestanden = (dir: string): string[] =>
      readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
        const rel = path.join(dir, e.name);
        if (e.isDirectory()) return bestanden(rel);
        return /\.tsx?$/.test(e.name) ? [rel] : [];
      });
    const fout = [...bestanden("app"), ...bestanden("components")].filter((f) => {
      const bron = readFileSync(path.join(ROOT, f), "utf8");
      return /^\s*["']use client["']/.test(bron) && /import\s+(?!type\b)[^;]*from ["']@\/lib\/hulp\/teksten["']/.test(bron);
    });
    expect(fout).toEqual([]);
  });

  it("het vraagteken staat in de kopbalk en de chat opent Support vanuit het hulpcentrum", () => {
    expect(readFileSync(path.join(ROOT, "components/app/FreelancerShell.tsx"), "utf8")).toMatch(/<HulpCentrum\b/);
    expect(readFileSync(path.join(ROOT, "app/dashboard/layout.tsx"), "utf8")).toMatch(/hulp=\{hulpTeksten\(locale\)\}/);
    expect(readFileSync(path.join(ROOT, "components/chat/InboxPage.tsx"), "utf8")).toMatch(/searchParams\.get\("support"\) !== "1"/);
  });
});
