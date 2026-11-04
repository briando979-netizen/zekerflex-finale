import { describe, expect, it } from "vitest";
import { cityFromText, cleanBedrijf, guessTemplate, iconHref, initialen, pageSummary, websiteOmschrijving } from "@/lib/klusconcept/website";

describe("guessTemplate", () => {
  it("herkent horeca aan de titel", () => {
    expect(guessTemplate({ title: "Brasserie De Haven | Restaurant in Utrecht", koppen: ["Onze menukaart"], tekst: "" })).toBe("horeca");
  });
  it("herkent café met een accent (geen ASCII-woordgrens)", () => {
    expect(guessTemplate({ title: "Eetcafé 't Hoekje", koppen: [], tekst: "" })).toBe("horeca");
  });
  it("de titel weegt zwaarder dan losse woorden in de tekst", () => {
    expect(guessTemplate({ title: "Van Dijk Logistiek en Transport", koppen: ["Warehousing"], tekst: "Ook lunch in onze kantine en een winkel." })).toBe("magazijn");
  });
  it("schoonmaak, supermarkt, winkel en kantoor", () => {
    expect(guessTemplate({ title: "Glans Schoonmaakbedrijf", koppen: [], tekst: "" })).toBe("schoonmaak");
    expect(guessTemplate({ title: "Supermarkt Jansen", koppen: [], tekst: "" })).toBe("vakkenvuller");
    expect(guessTemplate({ title: "Bakkerij Bol", koppen: [], tekst: "" })).toBe("kassa");
    expect(guessTemplate({ title: "Tandartspraktijk Zuid", koppen: [], tekst: "" })).toBe("receptie");
  });
  it("een activiteitencentrum met eten en drinken is horeca", () => {
    expect(guessTemplate({ title: "Het Schwarzwald", koppen: [], tekst: "Buggy's, quads, zes escaperooms en feesten. Activiteit, eten en drinken op één plek." })).toBe("horeca");
  });
  it("geen woord dat ergens op wijst: null", () => {
    expect(guessTemplate({ title: "Rijschool Snel", koppen: ["Lespakketten"], tekst: "Haal je rijbewijs." })).toBeNull();
  });
  it("een woord binnen een ander woord telt niet (mode in modern, bar in barbecue)", () => {
    expect(guessTemplate({ title: "Moderne barbecues", koppen: [], tekst: "" })).toBeNull();
  });
});

describe("pageSummary en iconHref", () => {
  const html = `<html><head><title>Bakkerij &amp; Lunch Bol</title>
    <meta name="description" content="Vers brood uit Utrecht.">
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/touch.png"></head><body></body></html>`;
  it("leest titel en omschrijving", () => {
    expect(pageSummary(html)).toEqual({ title: "Bakkerij & Lunch Bol", description: "Vers brood uit Utrecht." });
  });
  it("maakt het icoon absoluut", () => {
    expect(iconHref(html, "https://bol.example.com/home")).toBe("https://bol.example.com/icons/touch.png");
  });
  it("geen icoon of geen http: null", () => {
    expect(iconHref("<link rel=icon href=/x.ico>", "https://a.example.com/")).toBeNull();
    expect(iconHref('<link rel="apple-touch-icon" href="javascript:alert(1)">', "https://a.example.com/")).toBeNull();
  });
});

describe("cityFromText", () => {
  const steden = ["Den Haag", "Utrecht", "Amsterdam"];
  it("vindt een stad met hoofdletter", () => {
    expect(cityFromText("Restaurant in hartje Utrecht", steden)).toBe("Utrecht");
    expect(cityFromText("Strandtent in Den Haag", steden)).toBe("Den Haag");
  });
  it("niet binnen een woord en niet zonder hoofdletter", () => {
    expect(cityFromText("Amsterdammers", steden)).toBeNull();
    expect(cityFromText("in utrecht", steden)).toBeNull();
  });
});

describe("cleanBedrijf", () => {
  it("haalt Home en de slogan weg", () => {
    expect(cleanBedrijf("Home - Bakkerij Bol")).toBe("Bakkerij Bol");
    expect(cleanBedrijf("Bakkerij Bol | Vers brood sinds 1920")).toBe("Bakkerij Bol");
    expect(cleanBedrijf("Welkom bij Brasserie Zon")).toBe("Brasserie Zon");
  });
  it("een domeinnaam of niets: null", () => {
    expect(cleanBedrijf("bakkerijbol.nl")).toBeNull();
    expect(cleanBedrijf(null)).toBeNull();
  });
  it("hoogstens 60 tekens", () => {
    expect(cleanBedrijf("A".repeat(80))!.length).toBeLessThanOrEqual(60);
  });
});

describe("websiteOmschrijving en initialen", () => {
  it("maakt de omschrijving over het bedrijf", () => {
    const s = websiteOmschrijving("Gasten bedienen.", { bedrijf: "Brasserie Zon", plaats: "Utrecht", over: "Al dertig jaar aan de gracht." });
    expect(s).toBe("Gasten bedienen. Je werkt bij Brasserie Zon in Utrecht.\n\nOver Brasserie Zon: Al dertig jaar aan de gracht.");
  });
  it("zonder gegevens blijft de omschrijving van het sjabloon", () => {
    expect(websiteOmschrijving("Gasten bedienen.", { bedrijf: null, plaats: null, over: null })).toBe("Gasten bedienen.");
  });
  it("initialen zonder lidwoorden", () => {
    expect(initialen("De Bakkerij van Bol")).toBe("BB");
    expect(initialen(null)).toBe("?");
  });
});
