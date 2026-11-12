import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// De juridische pagina's (LegalPage) stonden in de sitemap zonder canonical (gemeten op live, 12 nov: /dsa, /privacy,
// /voorwaarden, /voorwaarden/snelle-uitbetaling, /cookiebeleid, /toegankelijkheid, /verwerkersovereenkomst).
// Elke pagina met LegalPage zet nu canonical(<haar eigen pad>).

const ROOT = process.cwd();
const MARKETING = join(ROOT, "app", "(marketing)");

function paginas(dir: string): string[] {
  return readdirSync(dir).flatMap((naam) => {
    const vol = join(dir, naam);
    if (statSync(vol).isDirectory()) return paginas(vol);
    return naam === "page.tsx" ? [vol] : [];
  });
}

describe("juridische pagina's hebben een canonical", () => {
  it("elke pagina met LegalPage zet canonical(\"<eigen pad>\")", () => {
    const fout = paginas(MARKETING)
      .filter((f) => readFileSync(f, "utf8").includes("<LegalPage"))
      .flatMap((f) => {
        const pad = "/" + relative(MARKETING, f).split(sep).slice(0, -1).join("/");
        const bron = readFileSync(f, "utf8");
        return bron.includes(`canonical("${pad}"`) ? [] : [pad];
      });
    expect(fout).toEqual([]);
  });
});
