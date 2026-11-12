import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BEDRIJF } from "@/lib/marketing/bedrijfsgegevens";

describe("officiële bedrijfsgegevens in de footer", () => {
  it("noemt de juridische naam, het dossiernummer en het register van Delaware", () => {
    expect(BEDRIJF.naam).toBe("zekerflex, Inc.");
    expect(BEDRIJF.dossiernummer).toMatch(/^\d{7,8}$/);
    const url = new URL(BEDRIJF.registerUrl);
    expect(url.protocol).toBe("https:");
    expect(url.hostname.endsWith("delaware.gov")).toBe(true);
  });

  it("bevat geen woonadres van de bestuurder, alleen het officiële adres in Delaware", () => {
    const alles = JSON.stringify(BEDRIJF).toLowerCase();
    for (const prive of ["veendam", "bosscher", "9641", "netherlands", "nederland"]) expect(alles).not.toContain(prive);
    expect(BEDRIJF.registeredAgentAdres).toMatch(/DE 19713/);
  });

  it("de footer gebruikt deze gegevens en linkt veilig naar het register", () => {
    const footer = readFileSync(join(process.cwd(), "components/marketing/SiteFooter.tsx"), "utf8");
    expect(footer).toContain("BEDRIJF.dossiernummer");
    expect(footer).toContain("BEDRIJF.registerUrl");
    expect(footer).toMatch(/rel="noopener noreferrer"/);
  });
});
