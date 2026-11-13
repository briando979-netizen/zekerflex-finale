import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Bewaker voor de vijftalige werker-app: een onderdeel dat /dashboard laadt mag geen nieuwe vaste Nederlandse zin krijgen.
// Nieuwe tekst hoort in lib/i18n/freelancer.ts (client: useFT(), server: getFreelancerDict()) of in een `texts`-prop met NL-standaard.
// De zinnen die er nog staan, staan hieronder met een reden. Haal je er een weg, verlaag dan het getal (of schrap de regel):
// de lijst mag alleen kleiner worden.

const BASISLIJN: Record<string, { max: number; reden: string }> = {
  "app/dashboard/klussen/[shiftId]/page.tsx": { max: 1, reden: "omschrijving van het agenda-item (.ics): een agenda-item volgt niet de app-taal" },
  "components/app/AvatarUpload.tsx": { max: 1, reden: "de Nederlandse standaard van de texts-prop; de werker-app geeft zijn eigen taal mee" },
  "components/app/ColorLegend.tsx": { max: 1, reden: "de Nederlandse kolom van de eigen vijftalige tabel" },
  "components/kaart/VolgKaart.tsx": { max: 1, reden: "de Nederlandse standaard van de teksten-prop (de klantpagina blijft Nederlands)" },
  "components/privacy/ErasureScopeInfo.tsx": { max: 1, reden: "de Nederlandse standaard van de texts-prop (de openbare pagina blijft Nederlands)" },
};

const ROOT = process.cwd();
const lees = (f: string) => readFileSync(f, "utf8").split("\r\n").join("\n");
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");

function bestanden(dir: string, uit: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) bestanden(p, uit);
    else if (/\.tsx?$/.test(e.name)) uit.push(p);
  }
  return uit;
}

function los(van: string, spec: string): string | null {
  let basis: string;
  if (spec.startsWith("@/")) basis = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) basis = path.resolve(path.dirname(van), spec);
  else return null;
  for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const p = basis + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

/** Alles wat vanuit app/dashboard/** bereikbaar is via imports in components/ of app/dashboard/. */
function bereikbaar(): Set<string> {
  const bereikt = new Set<string>();
  const rij = bestanden(path.join(ROOT, "app/dashboard"));
  while (rij.length) {
    const f = rij.pop()!;
    if (bereikt.has(f)) continue;
    bereikt.add(f);
    for (const m of lees(f).matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
      const r = los(f, (m[1] ?? m[2])!);
      if (r && /\/(components|app\/dashboard)\//.test(r.split(path.sep).join("/")) && !bereikt.has(r)) rij.push(r);
    }
  }
  return bereikt;
}

const NL = /\b(je|jij|jouw|jou|het|een|niet|voor|naar|bij|van|met|deze|zijn|wordt|kun|kunt|geen|nog|ook|als|maar|dan|wat|hoe|om|aan|uit|zodat|worden|heb|hebt|hier|alle|tot|per|onze|ons|u|uw)\b/gi;
const ZIN = /["'`>]\s*([A-ZÀ-Ý][^"'`<>{}\n]{12,}|[a-zà-ý][^"'`<>{}\n]{18,})/g;
// Onderdelen die de werker-app niet toont maar die wel via een import bereikbaar zijn (beheer, winkel, bank, chat met eigen tabel, …).
const BUITEN = /^components\/(admin|chat|marketing|bank|brain|shop|rewards|i18n|auth)\//;

function hardeZinnen(src: string): number {
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && !/^\s*import /.test(l))
    .join("\n")
    .replace(/className=("[^"]*"|\{`[^`]*`\})/g, "");
  let n = 0;
  for (const m of code.matchAll(ZIN)) {
    const z = m[1]!.trim();
    if (z.split(/\s+/).length < 3) continue;
    if ((z.match(NL) ?? []).length >= 2 && !/^(https?:|\/|[a-z-]+:)/.test(z) && !/^[a-z]+(\.[a-zA-Z]+)+/.test(z)) n += 1;
  }
  return n;
}

function tel(): Record<string, number> {
  const uit: Record<string, number> = {};
  for (const f of bereikbaar()) {
    const r = rel(f);
    if (!f.endsWith(".tsx") || BUITEN.test(r)) continue;
    const n = hardeZinnen(lees(f));
    if (n) uit[r] = n;
  }
  return uit;
}

describe("werker-app: geen nieuwe vaste Nederlandse zinnen", () => {
  const gevonden = tel();

  it("het onderdeel dat /dashboard laadt is gevonden (de scan werkt)", () => {
    expect(bereikbaar().size).toBeGreaterThan(150);
  });

  it("geen bestand heeft meer vaste zinnen dan de basislijn toestaat", () => {
    const fout = Object.entries(gevonden)
      .filter(([f, n]) => n > (BASISLIJN[f]?.max ?? 0))
      .map(([f, n]) => `${f}: ${n} (basislijn ${BASISLIJN[f]?.max ?? 0})`);
    expect(fout, "zet de tekst in lib/i18n/freelancer.ts (useFT of getFreelancerDict) of geef hem als texts-prop mee").toEqual([]);
  });

  it("de basislijn wordt alleen kleiner: een opgelost bestand verlaagt zijn getal", () => {
    const teHoog = Object.entries(BASISLIJN)
      .filter(([f, b]) => (gevonden[f] ?? 0) < b.max)
      .map(([f, b]) => `${f}: ${gevonden[f] ?? 0} gevonden, basislijn ${b.max}`);
    expect(teHoog).toEqual([]);
  });

  it("elke regel van de basislijn heeft een reden", () => {
    for (const [f, b] of Object.entries(BASISLIJN)) {
      expect(b.reden.length, f).toBeGreaterThan(10);
      expect(existsSync(path.join(ROOT, f)), `${f} bestaat niet meer: schrap de regel`).toBe(true);
    }
  });

  it("de scan herkent een harde Nederlandse zin en laat vertaalde tekst met rust", () => {
    expect(hardeZinnen('<p>Je kunt hier niet meer inloggen met dit adres</p>')).toBe(1);
    expect(hardeZinnen("<p>{t.hint}</p>\n{/* je kunt hier niets mee doen in een commentaar */}")).toBe(0);
  });
});
