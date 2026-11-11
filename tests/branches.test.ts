import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KOPPELINGEN, MODULES, koppelingWerkt, moduleVan } from "@/lib/branches/modules";
import { BRANCHES, bouwvolgorde, brancheVan, dekkingVan, gemiddeldeDekking, isBranche, koppelingenVan, modulesVan } from "@/lib/branches/branches";

// De branchemotor: de lijsten moeten kloppen met elkaar én met wat er echt in app/ staat. Een "klaar" module met een
// dode link is precies het soort fout dat de motor moet voorkomen.

const ROOT = process.cwd();
/** /werkgever/planner → app/werkgever/planner/page.tsx, /studio/website → app/studio/website/page.tsx */
const paginaBestaat = (href: string) => existsSync(path.join(ROOT, "app", ...href.split("/").filter(Boolean), "page.tsx"));

describe("modules", () => {
  it("hebben unieke sleutels en elke sleutel is een nette slug", () => {
    const sleutels = MODULES.map((m) => m.sleutel);
    expect(new Set(sleutels).size).toBe(sleutels.length);
    for (const s of sleutels) expect(s).toMatch(/^[a-z][a-z0-9-]{1,40}$/);
  });

  it("een klaar module heeft een echte pagina, een gepland module heeft geen adres", () => {
    for (const m of MODULES) {
      if (m.status === "klaar") {
        expect(m.href, m.sleutel).toMatch(/^\/(werkgever|studio)\/[a-z0-9-/]+$/);
        expect(paginaBestaat(m.href!), `${m.sleutel} → ${m.href}`).toBe(true);
      } else {
        expect(m.href, m.sleutel).toBeNull();
      }
    }
  });

  it("alle teksten zijn gevuld en zonder Engelse vakwoorden", () => {
    for (const m of MODULES) {
      expect(m.naam.length).toBeGreaterThan(3);
      expect(m.wat.length).toBeGreaterThan(15);
      expect(`${m.naam} ${m.wat}`).not.toMatch(/dashboard|workflow|booking|CRM|checkout/i);
    }
  });

  it("moduleVan kent alleen eigen sleutels", () => {
    expect(moduleVan("flexwerk")?.naam).toBe("Flexwerkers inhuren");
    expect(moduleVan("constructor")).toBeUndefined();
  });
});

describe("koppelingen", () => {
  it("verwijzen naar bestaande modules, zonder dubbelen of een module met zichzelf", () => {
    const ids = KOPPELINGEN.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const k of KOPPELINGEN) {
      expect(moduleVan(k.van), `${k.id} van`).toBeDefined();
      expect(moduleVan(k.naar), `${k.id} naar`).toBeDefined();
      expect(k.van).not.toBe(k.naar);
      expect(k.wat.length).toBeGreaterThan(15);
    }
  });

  it("een koppeling waarvan beide kanten klaar zijn maar die zelf niet gebouwd is, werkt niet (nooit meer claimen dan er is)", () => {
    const ongebouwd = KOPPELINGEN.filter((k) => !k.gebouwd);
    expect(ongebouwd.length).toBeGreaterThan(0);
    for (const k of ongebouwd) expect(koppelingWerkt(k), k.id).toBe(false);
    // een gebouwde koppeling waarvan een kant nog gepland is, werkt ook niet
    for (const k of KOPPELINGEN.filter((x) => x.gebouwd)) expect(["klaar"], k.id).toContain(moduleVan(k.van)?.status);
  });

  it("werkt pas als beide kanten klaar zijn", () => {
    const uren = KOPPELINGEN.find((k) => k.id === "uren-facturen")!;
    const werkbon = KOPPELINGEN.find((k) => k.id === "werkbonnen-uren")!;
    expect(koppelingWerkt(uren)).toBe(true);
    expect(koppelingWerkt(werkbon)).toBe(false); // werkbonnen zijn nog gepland
  });
});

describe("branches", () => {
  it("hebben unieke sleutels, een naam en alleen bestaande modules, zonder dubbelen", () => {
    const sleutels = BRANCHES.map((b) => b.sleutel);
    expect(new Set(sleutels).size).toBe(sleutels.length);
    for (const b of BRANCHES) {
      expect(b.sleutel).toMatch(/^[a-z][a-z0-9-]{2,40}$/);
      expect(b.naam.length).toBeGreaterThan(3);
      expect(b.voorWie.length).toBeGreaterThan(15);
      expect(new Set(b.modules).size, `${b.sleutel} dubbele module`).toBe(b.modules.length);
      for (const s of b.modules) expect(moduleVan(s), `${b.sleutel} → ${s}`).toBeDefined();
      expect(modulesVan(b)).toHaveLength(b.modules.length);
    }
  });

  it("elke branche kan nu al iets: minstens drie modules zijn klaar", () => {
    for (const b of BRANCHES) expect(dekkingVan(b).klaar, b.sleutel).toBeGreaterThanOrEqual(3);
  });

  it("de dekking telt klaar tegen het totaal en rondt af", () => {
    const horeca = brancheVan("horeca")!;
    expect(dekkingVan(horeca)).toEqual({ klaar: 13, totaal: 13, procent: 100 });
    const kapper = brancheVan("kapper-schoonheid")!;
    const d = dekkingVan(kapper);
    expect(d.totaal).toBe(10);
    expect(d.klaar).toBe(10); // afspraken, klantenkaart en voorraad staan sinds 11 nov
    expect(d.procent).toBe(100);
    // ook de bouw, schoonmaak en winkel hebben nu alles van hun lijst (werkbonnen, offertes, checklists en voorraad staan)
    for (const s of ["bouw-installatie", "schoonmaak", "winkel"]) expect(dekkingVan(brancheVan(s)!).procent, s).toBe(100);
    // ook transport (ritten), hotel (kamers) en sport (lidmaatschappen) hebben nu alles van hun lijst
    for (const s of ["transport-logistiek", "hotel-verblijf", "sport-fitness"]) expect(dekkingVan(brancheVan(s)!).procent, s).toBe(100);
    // wat nog ontbreekt: het dossier (zorg)
    expect(dekkingVan(brancheVan("zorgpraktijk")!)).toEqual({ klaar: 8, totaal: 9, procent: 89 });
    // het gemiddelde ligt tussen de laagste en de hoogste
    const alle = BRANCHES.map((b) => dekkingVan(b).procent);
    expect(gemiddeldeDekking()).toBeGreaterThanOrEqual(Math.min(...alle));
    expect(gemiddeldeDekking()).toBeLessThanOrEqual(Math.max(...alle));
  });

  it("de koppelingen van een branche gelden alleen als beide kanten bij hem horen, en zeggen of ze al werken", () => {
    const horeca = koppelingenVan(brancheVan("horeca")!);
    const uren = horeca.find((k) => k.koppeling.id === "uren-facturen");
    expect(uren?.werkt).toBe(true);
    expect(horeca.some((k) => k.koppeling.id === "werkbonnen-uren")).toBe(false);
    // afspraken en de klantenkaart zijn allebei klaar: die koppeling werkt in de kapper-branche
    const kapper = koppelingenVan(brancheVan("kapper-schoonheid")!);
    expect(kapper.find((k) => k.koppeling.id === "afspraken-klantenkaart")?.werkt).toBe(true);
    // beide kanten zijn klaar, maar de koppeling zelf (herinneringen via de chat) is niet gebouwd: dus werkt hij niet
    expect(kapper.find((k) => k.koppeling.id === "afspraken-berichten")?.werkt).toBe(false);
    const bouw = koppelingenVan(brancheVan("bouw-installatie")!);
    expect(bouw.find((k) => k.koppeling.id === "werkbonnen-uren")?.werkt).toBe(false);
    expect(bouw.find((k) => k.koppeling.id === "offertes-werkbonnen")?.werkt).toBe(false);
  });

  it("isBranche laat alleen eigen sleutels door (ook niet 'constructor' uit een adres)", () => {
    expect(isBranche("horeca")).toBe(true);
    expect(isBranche("constructor")).toBe(false);
    expect(isBranche("__proto__")).toBe(false);
    expect(isBranche(undefined)).toBe(false);
  });
});

describe("bouwvolgorde", () => {
  const volgorde = bouwvolgorde();

  it("bevat alleen geplande modules die een branche nodig heeft", () => {
    expect(volgorde.length).toBeGreaterThan(0);
    for (const s of volgorde) {
      expect(s.module.status).toBe("gepland");
      expect(s.branches.length).toBeGreaterThan(0);
      for (const b of s.branches) expect(b.modules).toContain(s.module.sleutel);
    }
  });

  it("wat gebouwd is, staat er niet meer in; wat overblijft is alleen het dossier", () => {
    const sleutels = volgorde.map((s) => s.module.sleutel);
    for (const klaar of ["afspraken", "klantenkaart", "voorraad", "werkbonnen", "offertes", "checklists", "ritten", "kamers", "lidmaatschappen"]) expect(sleutels, klaar).not.toContain(klaar);
    expect([...sleutels].sort()).toEqual(["dossier"]);
  });

  it("een geblokkeerd onderdeel (het dossier: eerst een jurist) staat onderaan (en het enige dat nog gepland is)", () => {
    const dossier = volgorde.find((s) => s.module.sleutel === "dossier")!;
    expect(dossier.module.blokkade).toMatch(/jurist/);
    expect(volgorde.at(-1)!.module.sleutel).toBe("dossier");
  });

  it("de winst is de dekking die de branches samen erbij krijgen, in procentpunten", () => {
    const dossier = volgorde.find((s) => s.module.sleutel === "dossier")!;
    // zorgpraktijk heeft 9 modules: één erbij is 11 procentpunten
    expect(dossier.winst).toBe(11);
  });
});
