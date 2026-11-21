import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { INCHECK_KASTJES_AAN } from "@/lib/incheck/aan";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";

// 21 nov 2026 (eigenaar): "we gaan niet met kastjes werken of met NFC-checks … We kunnen prima met de QR-code en dat personeel
// het moet gaan scannen". Uit: terminal, NFC-sticker, sleutelhanger, Bluetooth-baken. De QR-poster per vestiging blijft.
// En (eigenaar: "haal dit weg"): geen API-blok op /prijzen.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("inchecken zonder kastjes", () => {
  it("de schakelaar staat uit", () => {
    expect(INCHECK_KASTJES_AAN).toBe(false);
  });

  it("elke API van de kastjes geeft meteen een nette fout (geen 403), in elke handler", () => {
    for (const f of ["app/api/terminal/[sleutel]/route.ts", "app/api/werkgever/terminals/route.ts", "app/api/dashboard/incheck/route.ts"]) {
      const src = lees(f);
      const handlers = src.match(/export async function (GET|POST|PATCH|DELETE)\(/g) ?? [];
      const uit = src.match(/if \(!INCHECK_KASTJES_AAN\) return NextResponse\.json\(\{ error: \{ code: "KASTJES_UIT"/g) ?? [];
      expect(uit.length, f).toBe(handlers.length);
      expect(src, f).not.toMatch(/status: 403 \}\);\n/);
    }
  });

  it("de pagina's van terminal, sticker en NFC-link sturen door", () => {
    expect(lees("app/terminal/[sleutel]/page.tsx")).toContain("if (!INCHECK_KASTJES_AAN) notFound();");
    expect(lees("app/i/[code]/route.ts")).toContain("if (!INCHECK_KASTJES_AAN) return NextResponse.redirect(");
    expect(lees("app/dashboard/incheck/page.tsx")).toContain('if (!INCHECK_KASTJES_AAN) redirect("/dashboard/klussen");');
    expect(lees("app/werkgever/inchecken/sticker/[id]/page.tsx")).toContain('if (!INCHECK_KASTJES_AAN) redirect("/werkgever/inchecken");');
  });

  it("de werkgever ziet de uitleg over de QR-poster, in het Nederlands en het Engels", () => {
    expect(lees("app/werkgever/inchecken/page.tsx")).toContain("(await getDict()).incheckQr");
    expect(nl.incheckQr.titel).toBe("Inchecken met een QR-code");
    expect(en.incheckQr.titel).toBe("Check in with a QR code");
    expect(nl.nav.inchecken).toBe("Inchecken met QR-code");
    expect(lees("components/werkgever/BakenInstellingen.tsx")).toContain("{INCHECK_KASTJES_AAN && (");
  });

  it("/prijzen heeft geen API-blok meer", () => {
    const src = lees("app/(marketing)/prijzen/page.tsx");
    expect(src).not.toContain("pr.api.");
    expect(src).not.toContain("/developers");
    expect(src).not.toContain("/voor-bureaus");
  });
});
