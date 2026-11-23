import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";
import { accentMetAlpha, vlakAchtergrond } from "@/lib/shifts/beeld-vlak";
import { SHIFT_CATEGORIES } from "@/lib/shifts/category";
import { SJABLOON_EN, SJABLOON_NL } from "@/lib/shifts/sjabloon-kiezer-teksten";
import { SNEL_EN, SNEL_NL } from "@/components/werkgever/snel-teksten";

// 23 nov 2026 (eigenaar, na het bekijken van de live site):
// (a) het voorbeeld in het veld Kledingvoorschriften werd op een telefoon (390 px) aan het eind afgekapt: kortere voorbeeldtekst en
//     tekstvakken die meegroeien met hun tekst;
// (b) het voorbeeld rechts in de klus-wizard (en op /klus-plaatsen) toonde bij "Algemeen" een foto van een vrouw: de eigenaar wil geen
//     foto's van mensen, dus een rustig vlak in de brancheskleur. Alleen in die voorbeelden; de echte kaarten in de werker-app en de
//     openbare marketing- en vacaturepagina's houden hun foto.

const lees = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

describe("het vlak in de brancheskleur", () => {
  it("zet een doorzichtigheid achter een kleur uit de categorieën", () => {
    expect(accentMetAlpha("#0E5C4A", 0.16)).toBe("#0E5C4A29");
    expect(accentMetAlpha("#0E5C4A", 0)).toBe("#0E5C4A00");
    expect(accentMetAlpha("#0E5C4A", 1)).toBe("#0E5C4AFF");
    expect(accentMetAlpha("#0E5C4A", 7)).toBe("#0E5C4AFF");
    expect(accentMetAlpha("#0E5C4A", -1)).toBe("#0E5C4A00");
  });

  it("laat een kleur die geen zes hexcijfers is ongemoeid", () => {
    expect(accentMetAlpha("rgb(1, 2, 3)", 0.5)).toBe("rgb(1, 2, 3)");
    expect(accentMetAlpha("#abc", 0.5)).toBe("#abc");
  });

  it("maakt voor elke branche een zachte tint van twee kleuren", () => {
    expect(SHIFT_CATEGORIES.length).toBeGreaterThan(10);
    for (const c of SHIFT_CATEGORIES) {
      expect(vlakAchtergrond(c.accent), c.key).toMatch(/^linear-gradient\(135deg, #[0-9A-F]{8}, #[0-9A-F]{8}\)$/);
    }
    expect(vlakAchtergrond("#0E5C4A")).toBe("linear-gradient(135deg, #0E5C4A29, #0E5C4A0F)");
  });
});

describe("geen foto's van mensen in het voorbeeld van de wizard en op /klus-plaatsen", () => {
  it("het voorbeeld in de klus-wizard toont een vlak, geen foto van de branche", () => {
    const form = lees("components/app/NewShiftForm.tsx");
    expect(form).not.toContain("cat.photo");
    expect(form).not.toMatch(/<img src=\{cat\./);
    expect(form).toContain("<KlusBeeldVlak accent={cat.accent} label={cat.label}>");
    // de miniatuur van "Branchebeeld" (voorheen "Foto van de branche") bij de keuze tussen branchebeeld en logo is ook een vlak
    expect(form).toContain("<KlusBeeldVlak accent={cat.accent} label={cat.label} klein />");
    // het logo van het bedrijf zelf blijft staan (dat is geen foto van mensen)
    expect(form).toContain("src={beeld.logoUrl}");
  });

  it("de kaart op /klus-plaatsen (KlusKaart, ook in de simulatie) toont een vlak", () => {
    const kaart = lees("components/marketing/KlusKaart.tsx");
    expect(kaart).not.toContain("cat.photo");
    expect(kaart).not.toMatch(/<img/);
    expect(kaart).toContain("<KlusBeeldVlak accent={cat.accent} label={cat.label} />");
  });

  it("het vlak zelf heeft geen afbeelding en past bij het donkere thema (alleen bestaande klassen)", () => {
    const vlak = lees("components/app/KlusBeeldVlak.tsx");
    expect(vlak).not.toMatch(/<img|\.photo|\.jpg|url\(/);
    expect(vlak).toContain("bg-paper-soft");
    expect(vlak).toContain("bg-white");
    expect(vlak).toContain("text-ink");
    const css = lees("app/globals.css");
    for (const klasse of ["bg-paper-soft", "bg-white", "text-ink", "border-hair"]) {
      expect(css, klasse).toContain(`.app-scope[data-theme="dark"] .${klasse}`);
    }
  });

  it("de echte kaarten in de werker-app en de openbare pagina's houden hun foto (niet aangeraakt)", () => {
    expect(lees("components/app/ShiftCard.tsx")).toContain("src={cat.photo}");
    expect(lees("components/app/EmployerShiftCard.tsx")).toContain("src={cat.photo}");
    expect(lees("components/marketing/BranchShowcase.tsx")).toContain("src={b.photo}");
  });
});

describe("tekstvakken in de klus-wizard worden niet afgekapt", () => {
  const form = lees("components/app/NewShiftForm.tsx");

  it("de voorbeeldtekst bij de kleding is kort genoeg voor twee regels op een telefoon", () => {
    for (const [taal, tekst] of [["nl", nl.newShiftForm.kledingPlaceholder], ["en", en.newShiftForm.kledingPlaceholder]] as const) {
      expect(tekst.length, taal).toBeLessThanOrEqual(45);
      expect(tekst, taal).not.toMatch(/…|\.\.\./);
    }
    expect(nl.newShiftForm.kledingPlaceholder).toBe("Bijv. veiligheidsschoenen, geen sieraden");
    expect(en.newShiftForm.kledingPlaceholder).toBe("E.g. safety shoes, no jewellery");
  });

  it("geen enkele voorbeeldtekst in de wizard is lang (een invoerveld van één regel kapt hem af)", () => {
    for (const d of [nl.newShiftForm, en.newShiftForm]) {
      for (const k of ["titelPlaceholder", "zoekAdres", "kledingPlaceholder"] as const) {
        expect(d[k].length, k).toBeLessThanOrEqual(45);
      }
    }
    const literal = [...lees("components/marketing/KlusConcept.tsx").matchAll(/placeholder="([^"]*)"/g)].map((m) => m[1] ?? "");
    expect(literal.length).toBeGreaterThan(0);
    for (const p of literal) expect(p.length, p).toBeLessThanOrEqual(45);
  });

  it("ook de zoekvelden van de functiekiezer en van Snel een klus plaatsen hebben een korte voorbeeldtekst", () => {
    for (const [taal, t] of [["nl", SJABLOON_NL], ["en", SJABLOON_EN]] as const) expect(t.zoekPlaceholder.length, `kiezer ${taal}`).toBeLessThanOrEqual(45);
    for (const [taal, t] of [["nl", SNEL_NL], ["en", SNEL_EN]] as const) expect(t.titelPlaceholder.length, `snel ${taal}`).toBeLessThanOrEqual(45);
    // de lange tekst blijft de melding bij een te korte titel; alleen het voorbeeld in het veld is korter
    const snel = lees("components/werkgever/SnelPlaatsen.tsx");
    expect(snel).toContain("placeholder={t.titelPlaceholder}");
    expect(snel).toContain("setMelding(t.titelHint)");
  });

  it("de omschrijving en de kleding groeien mee met hun tekst, ook na het terugkeren naar stap 1", () => {
    expect(form).toContain("useAutoHoogte(omschrijvingRef, description, toon1);");
    expect(form).toContain("useAutoHoogte(kledingRef, dresscode, toon1);");
    expect(form).toContain("ref={omschrijvingRef}");
    expect(form).toContain("ref={kledingRef}");
    // niet meer de vaste vuistregel: meer dan 160 tekens = 7 regels, daarna afkappen
    expect(form).not.toContain("description.length > 160");
  });

  it("de hook meet niet in een verborgen stap (0) en geeft in useEffect alleen een opruimfunctie terug", () => {
    const hook = lees("components/app/useAutoHoogte.ts");
    expect(hook).toContain("if (ta.scrollHeight === 0) return;");
    expect(hook).toContain("if (!ta || !zichtbaar) return;");
    expect(hook).toContain("return () => window.removeEventListener(\"resize\", pas);");
    expect(hook).not.toMatch(/useEffect\(\(\) => (ref|ta|pas)/);
    // client-veilig: niets dat prisma, kv, mail of zod meeneemt
    expect(hook).not.toMatch(/@\/lib\/(prisma|storage\/kv|mail)|from "zod"/);
  });
});
