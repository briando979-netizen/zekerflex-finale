import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "@/lib/i18n/config";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

// Bewaker (13 nov 2026, opdracht ae): de stappenlijst uit getFreelancerOverview (lib/dashboard/freelancer.ts, `onboarding`)
// heeft Nederlandse labels. Een scherm in de vijftalige werker-app toont ze via fd.profiel.stappen[id] (met het label als
// terugval), nooit kaal: zo glipte de lijst op het klaarscherm van /dashboard/verificatie erdoor, want werker-taal-bewaker
// leest alleen .tsx en die korte labels hebben geen functiewoorden. Een nieuw stap-id zonder vertaling vangt tsc al
// (stappen is getypeerd op de ids); deze test vangt een nieuw scherm dat {s.label} rechtstreeks toont.

const ROOT = process.cwd();
const lees = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");

function tsx(dir: string, uit: string[] = []): string[] {
  for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) tsx(p, uit);
    else if (e.name.endsWith(".tsx")) uit.push(p);
  }
  return uit;
}

/** Per bestand de namen waarmee een stap uit `.onboarding.map(` wordt doorlopen (bijv. "s"). */
function doorlopers(src: string): string[] {
  return [...src.matchAll(/\.onboarding\.map\(\(\s*(\w+)\s*\)/g)].map((m) => m[1]!);
}

describe("stappenlijst van de werker in de app-taal", () => {
  const schermen = [...tsx("app/dashboard"), ...tsx("components/app")].filter((f) => doorlopers(lees(f)).length > 0);

  it("de scan vindt de schermen met de stappenlijst", () => {
    expect(schermen).toEqual(expect.arrayContaining(["app/dashboard/profiel/page.tsx", "app/dashboard/verificatie/page.tsx"]));
  });

  it("geen scherm toont het Nederlandse label kaal; elk gebruikt stappen[id]", () => {
    const fout: string[] = [];
    for (const f of schermen) {
      const src = lees(f);
      for (const s of doorlopers(src)) {
        // zichtbare tekst {s.label}; een attribuut als key={s.label} telt niet
        if (new RegExp(`(?<!=)\\{\\s*${s}\\.label\\s*\\}`).test(src)) fout.push(`${f}: {${s}.label} zonder vertaling`);
        if (!new RegExp(`stappen\\[${s}\\.id\\]`).test(src)) fout.push(`${f}: geen stappen[${s}.id]`);
      }
    }
    expect(fout, "toon het label als fd.profiel.stappen[s.id] ?? s.label (lib/i18n/freelancer.ts)").toEqual([]);
  });

  it("elk stap-id uit de overview heeft een vertaling in alle vijf talen", () => {
    const ids = [...new Set([...lees("lib/dashboard/freelancer.ts").matchAll(/\{\s*id:\s*"(\w+)",\s*label:/g)].map((m) => m[1]!))];
    expect(ids.length).toBeGreaterThanOrEqual(6);
    for (const taal of LOCALES) {
      const stappen = FREELANCER_DICTS[taal].profiel.stappen as Record<string, string | undefined>;
      for (const id of ids) expect(stappen[id]?.trim(), `${taal}: ${id}`).toBeTruthy();
    }
  });
});
