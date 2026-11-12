import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Elke openbare pagina heeft een <h1>. Gemeten op live (12 nov): de sectorpagina's, /freelance-werk (en de 20 steden),
// /personeel-inhuren (en de 20 steden), /klussen en /review-check hadden er geen: de paginakop kwam uit SectionHead, die
// standaard een h2 is. Wie op een openbare pagina SectionHead als paginakop gebruikt, geeft die kop="h1" (of de pagina
// heeft zelf een <h1>, of een onderdeel dat er een maakt).

const ROOT = process.cwd();
const MARKETING = join(ROOT, "app", "(marketing)");

function paginas(dir: string): string[] {
  return readdirSync(dir).flatMap((naam) => {
    const vol = join(dir, naam);
    if (statSync(vol).isDirectory()) return paginas(vol);
    return naam === "page.tsx" ? [vol] : [];
  });
}

// Onderdelen die zelf de <h1> van de pagina maken.
const MET_EIGEN_H1 = ["<SectorHub", "<SectorCity", "<SectorWorkerHub", "<SectorWorkerCity", "<UitzendJobBoard", "<HeroStage", "<LegalPage", "<WebsiteCheck", "<ZakelijkSecties"];

describe("openbare pagina's met SectionHead hebben een h1", () => {
  it("elke pagina met SectionHead heeft kop=\"h1\", een eigen <h1> of een onderdeel dat er een maakt", () => {
    const zonder = paginas(MARKETING)
      .filter((f) => {
        const bron = readFileSync(f, "utf8");
        if (!bron.includes("<SectionHead")) return false;
        return !(bron.includes('kop="h1"') || /<h1[\s>]/.test(bron) || MET_EIGEN_H1.some((c) => bron.includes(c)));
      })
      .map((f) => relative(ROOT, f).split(sep).join("/"));
    expect(zonder).toEqual([]);
  });

  it.each([
    "app/(marketing)/freelance-werk/page.tsx",
    "app/(marketing)/freelance-werk/[stad]/page.tsx",
    "app/(marketing)/personeel-inhuren/page.tsx",
    "app/(marketing)/personeel-inhuren/[stad]/page.tsx",
    "app/(marketing)/klussen/page.tsx",
    "app/(marketing)/review-check/page.tsx",
  ])("%s: precies één kop=\"h1\"", (f) => {
    expect(readFileSync(join(ROOT, f), "utf8").match(/kop="h1"/g) ?? []).toHaveLength(1);
  });
});
