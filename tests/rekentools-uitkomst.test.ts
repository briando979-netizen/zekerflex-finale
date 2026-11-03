import { describe, expect, it } from "vitest";
import { DBA_QUESTIONS } from "@/lib/rekentools/dba-check";
import { buildUitkomst, escapeHtml, isBot, leadCompany, uitkomstSchema } from "@/lib/rekentools/uitkomst";

const contact = { email: "jan@bakkerij.nl", consent: true as const };
const kostenInput = { workers: 1, hoursPerWeek: 24, weeks: 12, wageCents: 1_600, factor: 1.9, rateCents: 2_500 };
const allDba = (a: "ja" | "nee") => Object.fromEntries(DBA_QUESTIONS.map((q) => [q.id, a]));

describe("stuur mij de uitkomst: schema", () => {
  it("accepts a complete kosten request", () => {
    expect(uitkomstSchema.safeParse({ tool: "kosten-uitzendkracht", input: kostenInput, ...contact }).success).toBe(true);
  });

  it("requires consent and a valid address", () => {
    expect(uitkomstSchema.safeParse({ tool: "kosten-uitzendkracht", input: kostenInput, email: "jan@bakkerij.nl", consent: false }).success).toBe(false);
    expect(uitkomstSchema.safeParse({ tool: "kosten-uitzendkracht", input: kostenInput, email: "geen-adres", consent: true }).success).toBe(false);
  });

  it("rejects out-of-range numbers and unknown answers", () => {
    expect(uitkomstSchema.safeParse({ tool: "kosten-uitzendkracht", input: { ...kostenInput, factor: 0 }, ...contact }).success).toBe(false);
    expect(uitkomstSchema.safeParse({ tool: "wet-dba-check", answers: { hoe: "misschien" }, ...contact }).success).toBe(false);
    expect(uitkomstSchema.safeParse({ tool: "iets-anders", ...contact }).success).toBe(false);
  });
});

describe("stuur mij de uitkomst: inhoud", () => {
  it("computes the kosten result itself", () => {
    const u = buildUitkomst({ tool: "kosten-uitzendkracht", input: kostenInput, ...contact });
    expect(u?.path).toBe("/rekentools/kosten-uitzendkracht-berekenen");
    expect(u?.text).toContain("30,40");
    expect(u?.text).toContain("28,50");
    expect(u?.leadNote).toContain("bespaar je");
  });

  it("gives nothing for zero hours or an unfinished check", () => {
    expect(buildUitkomst({ tool: "kosten-uitzendkracht", input: { ...kostenInput, hoursPerWeek: 0 }, ...contact })).toBeNull();
    expect(buildUitkomst({ tool: "wet-dba-check", answers: { hoe: "ja" }, ...contact })).toBeNull();
  });

  it("scores the DBA check and lists the tips", () => {
    const u = buildUitkomst({ tool: "wet-dba-check", answers: allDba("ja"), ...contact });
    expect(u?.text).toContain("Veel signalen van loondienst");
    expect(u?.text).toContain("Aandachtspunten:");
    expect(u?.leadNote).toContain("10 van 16");
  });

  it("ignores answers to questions that don't exist", () => {
    const u = buildUitkomst({ tool: "wet-dba-check", answers: { ...allDba("nee"), verzonnen: "ja" }, ...contact });
    expect(u?.text).toContain("signalen van loondienst");
    expect(u?.html).not.toContain("verzonnen");
  });
});

describe("stuur mij de uitkomst: veiligheid", () => {
  it("escapes html", () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe("&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
  });

  it("spots the honeypot", () => {
    expect(isBot({ website: "http://spam.example" })).toBe(true);
    expect(isBot({ website: "" })).toBe(false);
    expect(isBot({})).toBe(false);
    expect(isBot(null)).toBe(false);
  });

  it("falls back to the mail domain for the lead company", () => {
    expect(leadCompany("jan@bakkerij.nl", "  Bakkerij Jansen ")).toBe("Bakkerij Jansen");
    expect(leadCompany("jan@bakkerij.nl")).toBe("Onbekend bedrijf (bakkerij.nl)");
    expect(leadCompany("jan@bakkerij.nl", "   ")).toBe("Onbekend bedrijf (bakkerij.nl)");
  });
});
