import { describe, expect, it } from "vitest";
import {
  displayNameProblem,
  localPartProblem,
  normalizeLocalPart,
  passwordProblem,
  passwordStrength,
  suggestLocalParts,
} from "@/lib/mail/zf-address";

// De regels voor een eigen adres op zekerflex.com: wat mag, wat gereserveerd
// blijft (niemand schrijft "als ZekerFlex"), en de voorstellen uit een naam.

describe("adres kiezen", () => {
  it("maakt van wat iemand typt een net adresdeel", () => {
    expect(normalizeLocalPart("  Jan de Vries ")).toBe("jan.de.vries");
    expect(normalizeLocalPart("Zoë@gmail.com")).toBe("zoe");
    expect(normalizeLocalPart("a..b")).toBe("a.b");
    expect(normalizeLocalPart("Tim!#")).toBe("tim");
  });

  it("weigert te kort, rare tekens, alleen cijfers en dubbele leestekens", () => {
    expect(localPartProblem("jo")).toMatch(/minstens 3/);
    expect(localPartProblem(".jan")).toMatch(/Begin en eindig/);
    expect(localPartProblem("jan_-x")).toMatch(/twee leestekens/);
    expect(localPartProblem("12345")).toMatch(/letters/);
    expect(localPartProblem("jan.devries")).toBeNull();
  });

  it("houdt rol- en merknamen vrij, ook met leestekens of in een samenstelling", () => {
    for (const name of ["info", "sales", "support", "no-reply", "postmaster", "admin", "zekerflex", "zeker.flex", "team.zekerflex"]) {
      expect(localPartProblem(name), name).not.toBeNull();
    }
  });

  it("stelt adressen voor uit een naam, met de Nederlandse tussenvoegsels", () => {
    expect(suggestLocalParts("Jan de Vries")).toEqual(["jan", "jan.devries", "jdevries", "jandevries", "devries.jan"]);
    expect(suggestLocalParts("Sanne van der Berg", 10)).toContain("sanne.berg");
    expect(suggestLocalParts("Ö", 5)).toEqual([]); // te kort: geen voorstel
    expect(suggestLocalParts("Info")).toEqual([]); // gereserveerd: geen voorstel
  });
});

describe("wachtwoord en afzendernaam", () => {
  it("vraagt een sterk wachtwoord zonder je adres of naam erin", () => {
    expect(passwordProblem("kort1")).toMatch(/minstens 10/);
    expect(passwordProblem("alleenletters")).toMatch(/letters én cijfers/);
    expect(passwordProblem("Wachtwoord2026!")).toMatch(/makkelijk/);
    expect(passwordProblem("jan.devries-77!", { localPart: "jan.devries" })).toMatch(/mailadres/);
    expect(passwordProblem("Jan-groen-tafel-9", { name: "Jan de Vries" })).toMatch(/naam/);
    expect(passwordProblem("paars-Fiets-73-boom")).toBeNull();
    expect(passwordProblem("eenheellangzinzondercijfers")).toBeNull(); // 16+ tekens mag zonder cijfers
  });

  it("meet de sterkte van 0 tot 4", () => {
    expect(passwordStrength("abc")).toBe(0);
    expect(passwordStrength("paars-Fiets-73-boom")).toBe(4);
  });

  it("laat geen afzendernaam toe die op ZekerFlex zelf lijkt", () => {
    expect(displayNameProblem("ZekerFlex Support")).not.toBeNull();
    expect(displayNameProblem("Zeker Flex")).not.toBeNull();
    expect(displayNameProblem("Jan <jan@x.nl>")).not.toBeNull();
    expect(displayNameProblem("Jan de Vries")).toBeNull();
  });
});
