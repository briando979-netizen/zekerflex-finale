import { describe, expect, it } from "vitest";
import { FindingActionKind, FindingSeverity } from "@prisma/client";
import { LEEG_ANTWOORD, responseSchema, tekst } from "@/lib/orchestration/antwoord";

// 6 nov: het model gaf een object waar een string hoorde en de hele
// orchestratieronde mislukte ("invalid_type, expected string, received
// object"). Soepel lezen hoort hier, zeker met ons eigen kleinere model.

describe("antwoord van de orchestratiecyclus lezen", () => {
  it("maakt van een object toch leesbare tekst", () => {
    const uit = tekst(100).parse({ nl: "iets" });
    expect(uit).toBe('{"nl":"iets"}');
  });

  it("kort te lange tekst af in plaats van te weigeren", () => {
    expect(tekst(5).parse("abcdefghij")).toBe("abcde");
  });

  it("leest een net antwoord gewoon", () => {
    const p = responseSchema.safeParse({
      summary: "Alles gezond.",
      findings: [
        {
          severity: "HIGH",
          category: "geld",
          title: "Factuur blijft hangen",
          detail: "Twee facturen staan al een week open.",
          actionKind: "CONSOLE_QUERY",
          action: { query: "openstaande-facturen", params: {} },
        },
      ],
    });
    expect(p.success).toBe(true);
    const bevinding = p.success ? p.data.findings[0] : undefined;
    expect(bevinding?.severity).toBe(FindingSeverity.HIGH);
    expect(bevinding?.title).toBe("Factuur blijft hangen");
  });

  it("laat de ronde doorgaan als één bevinding scheef is", () => {
    const p = responseSchema.safeParse({
      summary: { tekst: "een object als samenvatting" },
      findings: [
        { title: { a: 1 }, detail: 42, severity: "ONZIN", actionKind: "BESTAATNIET" },
        { title: "Deze deugt wel", detail: "prima" },
        { zonder: "titel" },
      ],
    });
    expect(p.success).toBe(true);
    if (!p.success) return;
    expect(p.data.summary).toContain("een object als samenvatting");
    // de scheve bevinding is leesbaar gemaakt, die zonder titel is overgeslagen
    expect(p.data.findings).toHaveLength(2);
    expect(p.data.findings[0]?.severity).toBe(FindingSeverity.INFO);
    expect(p.data.findings[0]?.actionKind).toBe(FindingActionKind.NONE);
    expect(p.data.findings[0]?.detail).toBe("42");
    expect(p.data.findings[1]?.title).toBe("Deze deugt wel");
  });

  it("houdt het bij hoogstens twintig bevindingen", () => {
    const veel = Array.from({ length: 30 }, (_, i) => ({ title: `nummer ${i}` }));
    const p = responseSchema.parse({ findings: veel });
    expect(p.findings).toHaveLength(20);
  });

  it("een leeg of ontbrekend antwoord levert een lege ronde, geen fout", () => {
    expect(responseSchema.parse({}).findings).toEqual([]);
    expect(responseSchema.safeParse("geen object").success).toBe(false);
    expect(LEEG_ANTWOORD.findings).toEqual([]);
    expect(LEEG_ANTWOORD.summary.length).toBeGreaterThan(10);
  });
});
