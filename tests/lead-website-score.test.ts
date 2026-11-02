import { describe, expect, it } from "vitest";
import { leadWebsiteUrl, needsWebsiteCheck, websiteCheckOf } from "@/lib/sales/website-score-shared";

// Websitescore per sales-lead: alleen de echte bedrijfssite, nooit onze eigen
// site of interne paden, en maximaal één keer per 30 dagen opnieuw.

describe("welke website we checken", () => {
  it("neemt de homepage van de bedrijfssite", () => {
    expect(leadWebsiteUrl("https://www.bakkerij.nl/vacatures/bakker")).toBe("https://www.bakkerij.nl/");
    expect(leadWebsiteUrl("http://bakkerij.nl")).toBe("http://bakkerij.nl/");
  });

  it("slaat onze eigen site, mailadressen en losse paden over", () => {
    for (const bad of ["https://zekerflex.com/demo", "https://www.zekerflex.nl/", "sales@zekerflex.com", "/demo", "", null, undefined, "ftp://bakkerij.nl"]) {
      expect(leadWebsiteUrl(bad)).toBeNull();
    }
  });
});

describe("opgeslagen score", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  const check = { checkId: "abc", host: "bakkerij.nl", score: 54, problems: 2, attention: 5, platform: "WordPress", at: "2026-10-20T08:00:00Z" };

  it("leest de score uit de verrijking en negeert rommel", () => {
    expect(websiteCheckOf({ websiteCheck: check, other: 1 })).toEqual(check);
    expect(websiteCheckOf({ websiteCheck: { score: "hoog" } })).toBeNull();
    expect(websiteCheckOf(null)).toBeNull();
  });

  it("checkt opnieuw na 30 dagen, niet eerder", () => {
    expect(needsWebsiteCheck({}, now)).toBe(true);
    expect(needsWebsiteCheck({ websiteCheck: check }, now)).toBe(false); // 13 dagen oud
    expect(needsWebsiteCheck({ websiteCheck: { ...check, at: "2026-09-20T08:00:00Z" } }, now)).toBe(true); // 43 dagen
  });
});
