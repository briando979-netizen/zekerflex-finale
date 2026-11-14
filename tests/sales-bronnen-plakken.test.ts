import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bronUrlSchema } from "@/lib/sales/bron-url";
import { MAX_BRONNEN_PLAKKEN, beoordeelBronnen, bronSleutel, deelRegels } from "@/lib/sales/bronnen-plakken";

// Admin → Sales → Vindbronnen: meerdere vacaturepagina's tegelijk plakken (14 nov). Voorvertoning nieuw / dubbel /
// ongeldig, ontdubbeld tegen wat er al staat, alleen https, dezelfde URL-controle als één bron toevoegen.

const geldig = (url: string) => bronUrlSchema.safeParse(url).success;
const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("regels lezen", () => {
  it("per regel een URL of 'label | URL'; lege regels tellen niet, het regelnummer blijft kloppen", () => {
    expect(deelRegels("https://a.example/werken-bij\n\n  Bakker | https://b.example/vacatures  \r\nx | y | https://c.example/jobs")).toEqual([
      { regel: 1, label: null, url: "https://a.example/werken-bij" },
      { regel: 3, label: "Bakker", url: "https://b.example/vacatures" },
      { regel: 4, label: "x | y", url: "https://c.example/jobs" },
    ]);
  });

  it("een leeg label wordt null, een lang label wordt afgekapt", () => {
    expect(deelRegels(" | https://a.example/")[0]?.label).toBeNull();
    expect(deelRegels(`${"l".repeat(300)} | https://a.example/`)[0]?.label).toHaveLength(120);
  });
});

describe("beoordelen", () => {
  it("nieuw, dubbel tegen wat er al staat, dubbel binnen de lijst, ongeldig en geen https", () => {
    const regels = deelRegels(
      [
        "https://www.Bakkerij.example/vacatures/",
        "https://bakkerij.example/vacatures",
        "https://bestaat.example/werken-bij",
        "http://onveilig.example/jobs",
        "geen url",
        "Garage | https://garage.example/werken-bij?regio=groningen",
      ].join("\n"),
    );
    const u = beoordeelBronnen(regels, ["https://bestaat.example/werken-bij/", null], geldig);
    expect(u.regels.map((r) => [r.regel, r.status, r.reden])).toEqual([
      [1, "nieuw", null],
      [2, "dubbel", "Staat hierboven al (regel 1)."],
      [3, "dubbel", "Staat al bij deze campagne."],
      [4, "ongeldig", "Alleen https."],
      [5, "ongeldig", "Geen geldige URL."],
      [6, "nieuw", null],
    ]);
    expect([u.nieuw, u.dubbel, u.ongeldig]).toEqual([2, 2, 2]);
    expect(u.regels[5]?.label).toBe("Garage");
  });

  it("dezelfde URL-controle als één bron: langer dan 400 tekens is ongeldig", () => {
    const lang = `https://a.example/${"x".repeat(400)}`;
    expect(beoordeelBronnen(deelRegels(lang), [], geldig).regels[0]?.status).toBe("ongeldig");
  });

  it("de sleutel negeert www., hoofdletters in de host en een slash aan het eind, maar niet de querystring", () => {
    expect(bronSleutel("https://WWW.A.example/Werken-Bij/")).toBe("a.example/Werken-Bij");
    expect(bronSleutel("https://a.example/x?p=1")).not.toBe(bronSleutel("https://a.example/x?p=2"));
    expect(bronSleutel("geen url")).toBeNull();
  });
});

describe("de route en het scherm", () => {
  const route = bron("app/api/admin/sales/sources/plakken/route.ts");

  it("alleen PLATFORM_ADMIN, hooguit 50 regels, eerst voorvertoning, één auditregel bij opslaan", () => {
    expect(MAX_BRONNEN_PLAKKEN).toBe(50);
    expect(route).toContain('withAdminAccess(["PLATFORM_ADMIN"]');
    expect(route).toContain("if (!opslaan) return NextResponse.json(uitslag);");
    expect(route.match(/recordAudit\(/g)).toHaveLength(1);
    expect(route).toContain('action: "sales.source.bulk_added"');
    // de voorvertoning schrijft niets: createMany staat pas na de terugkeer zonder opslaan
    expect(route.indexOf("if (!opslaan) return")).toBeLessThan(route.indexOf("createMany"));
  });

  it("één bron toevoegen en plakken gebruiken dezelfde URL-controle", () => {
    expect(bron("app/api/admin/sales/sources/route.ts")).toContain("url: bronUrlSchema.optional()");
    expect(route).toContain("bronUrlSchema.safeParse(url).success");
  });

  it("het scherm zegt dat toevoegen niets verstuurt, en waarschuwt bij autopilot", () => {
    const scherm = bron("components/admin/sales/CampaignsTab.tsx");
    expect(scherm).toContain("Toevoegen verstuurt niets: de crawler leest deze pagina's later en maakt hooguit conceptmails, die pas weggaan als jij ze goedkeurt.");
    expect(scherm).toContain('campaign.mode === "AUTOPILOT" && campaign.autopilotEnabledGlobally');
  });
});
