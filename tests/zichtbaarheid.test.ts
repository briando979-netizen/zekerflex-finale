import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AANBOD, aanbodHref, eigenPaginas } from "@/lib/marketing/aanbod";
import { aanbodBeeld, aanbodBeelden } from "@/lib/marketing/aanbod-beeld";
import { pijlerIsFlexwerk } from "@/lib/marketing/flexwerk-only";

// Zichtbaarheid in Google en bij AI-assistenten (16 nov 2026, eigenaar: "boven in de zoekresultaten, met schermafbeeldingen
// en betere foto's"): elk product toont zijn eigen beeld (een echt scherm, anders de eigen foto) bij het delen, in de JSON-LD
// en in de beeld-sitemap; llms.txt noemt het hele aanbod en belooft niets wat nu niet kan.

const lees = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

describe("het beeld van een product", () => {
  it("horeca: het eerste echte scherm (de kassa), met zijn echte maat; de telefoon niet", () => {
    const horeca = AANBOD.find((a) => a.slug === "horeca");
    expect(horeca && aanbodBeeld(horeca)).toMatchObject({ pad: "/aanbod/inkijk/horeca-kassa.webp", breedte: 1600, hoogte: 1075 });
    expect(horeca ? aanbodBeelden(horeca).some((b) => b.pad.includes("telefoon")) : true).toBe(false);
  });

  it("elke eigen productpagina heeft een beeld (behalve de bekende uitzondering), en dat bestand bestaat", () => {
    // telefonie: da bouwt die pagina (16 nov); e-facturatie: eigen ontwerp zonder beeld, een echt scherm van de facturen volgt.
    // Zet er een scherm of foto bij en haal hem dan uit deze lijst
    const ZONDER_BEELD = new Set(["telefonie", "e-facturatie"]);
    const zonder = eigenPaginas().filter((a) => !aanbodBeeld(a)).map((a) => a.slug);
    expect(zonder.filter((s) => !ZONDER_BEELD.has(s))).toEqual([]);
    for (const a of eigenPaginas()) {
      for (const x of aanbodBeelden(a)) expect(existsSync(join(process.cwd(), "public", x.pad)), `${a.slug}: ${x.pad}`).toBe(true);
    }
  });

  it("de pagina geeft het beeld mee aan Google, de deelkaart en de JSON-LD; de sitemap ook", () => {
    const pagina = lees("app/(marketing)/aanbod/[slug]/page.tsx");
    expect(pagina).toContain("image: beeldUrl, imageSize: { width: beeld.breedte, height: beeld.hoogte }, imageAlt: beeld.alt");
    expect(pagina).toContain('twitter: { card: "summary_large_image"');
    expect(pagina).toContain('"@type": "ImageObject"');
    expect(lees("app/sitemap.ts")).toContain("images: beelden");
  });
});

describe("llms.txt voor AI-assistenten", () => {
  it("noemt elk beschikbaar product met zijn adres, en belooft geen snelle uitbetaling", async () => {
    const { GET } = await import("@/app/llms.txt/route");
    const tekst = await (await GET()).text();
    expect(tekst).toContain("## Aanbod");
    // 22 nov 2026: alleen flexwerk (eigenaar: "we zijn voor zzp, uitzend en flexwerk gegaan"); online en branche staan er niet meer in
    for (const a of AANBOD.filter((x) => x.status === "beschikbaar" && pijlerIsFlexwerk(x.pijler))) expect(tekst, a.slug).toContain(`${aanbodHref(a)}`);
    for (const a of AANBOD.filter((x) => !pijlerIsFlexwerk(x.pijler))) expect(tekst, a.slug).not.toContain(`- ${a.naam}:`);
    for (const a of AANBOD.filter((x) => x.status !== "beschikbaar")) expect(tekst, a.slug).not.toContain(`- ${a.naam}:`);
    expect(tekst).not.toMatch(/same-day|30-day payout/i);
  });
});
