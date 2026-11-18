import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PARTNERDEAL_STANDAARD,
  PROEF_INVULLING,
  aanhefVoor,
  bedragenIn,
  beoordeelCampagneTekst,
  invullingVoor,
  knopUrlGeldig,
  knopVan,
  maakCampagneMail,
  overgeblevenPlaatshouders,
  toegestaneBedragen,
  vulIn,
} from "@/lib/sales/campagne-tekst";
import { BASE_FEE_PER_HOUR_CENTS } from "@/lib/pricing/tiers";

// De vaste tekst per campagne (18 nov 2026): één aanbodmail van de eigenaar in plaats van een mail van het model.
// De regels hier beschermen tegen wat een mail nooit mag beloven (bank, voorschot, verzekering, garantie, een verzonnen
// bedrag) en tegen een plaatshouder die niet ingevuld wordt. Onderaan bewaken we de bron: wie mag erbij, en dat de
// voorbeeldmail geen bedrijf benadert.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const goed = PARTNERDEAL_STANDAARD;

describe("campagnetekst: invullen", () => {
  it("vult {bedrijf}, {aanhef} en {plaats} in, ook als ze vaker voorkomen", () => {
    expect(vulIn("Beste {aanhef}, {bedrijf} in {plaats}. Nogmaals {bedrijf}.", { bedrijf: "Acme", aanhef: "Jan", plaats: "Zwolle" })).toBe(
      "Beste Jan, Acme in Zwolle. Nogmaals Acme.",
    );
  });

  it("vult in één keer in: een bedrijfsnaam met accolades wordt niet opnieuw ingevuld", () => {
    expect(vulIn("{bedrijf} en {aanhef}", { bedrijf: "{aanhef}", aanhef: "Jan", plaats: "" })).toBe("{aanhef} en Jan");
  });

  it("een onbekende plaatshouder blijft staan en is daarna te vinden", () => {
    const uit = vulIn("Hallo {naam} van {bedrijf}", PROEF_INVULLING);
    expect(uit).toBe("Hallo {naam} van Voorbeeld B.V.");
    expect(overgeblevenPlaatshouders(uit)).toEqual(["{naam}"]);
    expect(overgeblevenPlaatshouders(vulIn("Hallo {bedrijf}", PROEF_INVULLING))).toEqual([]);
  });

  it("de aanhef is de naam, of heer/mevrouw als we die niet kennen", () => {
    expect(aanhefVoor("  Jan   de Vries ")).toBe("Jan de Vries");
    expect(aanhefVoor(null)).toBe("heer/mevrouw");
    expect(aanhefVoor("   ")).toBe("heer/mevrouw");
    expect(aanhefVoor(undefined)).toBe("heer/mevrouw");
  });

  it("de invulling voor een bedrijf zonder plaats leest nog goed", () => {
    expect(invullingVoor({ companyName: " Acme ", contactName: null, city: null })).toEqual({ bedrijf: "Acme", aanhef: "heer/mevrouw", plaats: "je regio" });
    expect(invullingVoor({ companyName: "Acme", contactName: "Sanne", city: "Zwolle" })).toEqual({ bedrijf: "Acme", aanhef: "Sanne", plaats: "Zwolle" });
  });

  it("de mail voor één bedrijf: onderwerp en tekst ingevuld", () => {
    const mail = maakCampagneMail(goed, { bedrijf: "Bakkerij Jansen", aanhef: "heer/mevrouw", plaats: "Rotterdam" });
    expect(mail.subject).toBe("Een maand zonder platformkosten voor Bakkerij Jansen");
    expect(mail.body.startsWith("Beste heer/mevrouw,\n\nHeb je weleens een gat in je rooster")).toBe(true);
    expect(mail.body).toContain("Ons aanbod voor Bakkerij Jansen:");
    expect(mail.body).not.toMatch(/\{[a-z]+\}/);
  });
});

describe("campagnetekst: het Partnerdeal-voorbeeld", () => {
  it("is goed volgens de eigen regels", () => {
    expect(beoordeelCampagneTekst(goed)).toEqual({ goed: true, redenen: [] });
  });

  it("heeft de afgesproken knop en benadert ook bedrijven zonder vacature", () => {
    expect(goed.knopTekst).toBe("Maak gratis een account");
    expect(goed.knopUrl).toBe("/register?type=bedrijf");
    expect(goed.zonderVacature).toBe(true);
  });

  it("noemt de prijs uit lib/pricing/tiers.ts en de vijf stappen, alinea's gescheiden door een lege regel", () => {
    expect(BASE_FEE_PER_HOUR_CENTS).toBe(350);
    expect(goed.tekst).toContain("Normaal is dat € 3,50 per gewerkt uur");
    expect(goed.tekst).toContain("Zo werkt het:\n1. Je maakt gratis een account aan");
    expect(goed.tekst).toContain("\n5. De werker checkt in met de telefoon.");
    expect(goed.tekst.split("\n\n")).toHaveLength(7);
    expect(goed.tekst.endsWith("Groet,\nBriando van Essen\nZekerFlex\n+31 970 102 51797")).toBe(true);
  });
});

describe("campagnetekst: afkeuren", () => {
  const met = (extra: string) => ({ ...goed, tekst: `${goed.tekst}\n\n${extra}` });
  const reden = (t: Parameters<typeof beoordeelCampagneTekst>[0]) => beoordeelCampagneTekst(t).redenen.join(" | ");

  it("verboden woorden, hoofdletterongevoelig, met een reden per treffer", () => {
    for (const [zin, woord] of [
      ["Je krijgt een Betaalpas.", "betaalpas"],
      ["Met onze bankpas.", "bankpas"],
      ["Via de ZekerFlex  Bank.", "ZekerFlex Bank"],
      ["Wij geven een VOORSCHOT.", "voorschot"],
      ["Alle krachten zijn verzekerd.", "verzekerd"],
      ["Inclusief verzekering.", "verzekering"],
      ["Met garantie.", "garantie"],
      ["Gegarandeerd iemand.", "gegarandeerd"],
      ["Wij zijn marktleider.", "marktleider"],
      ["De goedkoopste van Nederland.", "goedkoopste"],
      ["Werkers worden direct uitbetaald.", "direct uitbetaald"],
      ["Betaal met iDEAL.", "iDEAL"],
      ["Je krijgt een betaallink.", "betaallink"],
    ] as const) {
      const oordeel = beoordeelCampagneTekst(met(zin));
      expect(oordeel.goed, zin).toBe(false);
      expect(oordeel.redenen.join(" | "), zin).toContain(`"${woord}"`);
    }
  });

  it("'ideale' en 'idealiter' zijn geen iDEAL", () => {
    expect(beoordeelCampagneTekst(met("De ideale oplossing, idealiter deze week.")).goed).toBe(true);
  });

  it("een vreemd bedrag mag niet; de platformkosten uit de staffel wel", () => {
    expect(toegestaneBedragen()).toEqual(["3,50", "3,25"]);
    expect(beoordeelCampagneTekst(met("Vanaf 500 uur per maand € 3,25 per uur.")).goed).toBe(true);
    expect(reden(met("Je betaalt maar € 2,95 per uur."))).toContain("€ 2,95");
    expect(reden(met("Je krijgt €50 korting."))).toContain("€ 50,00");
    expect(reden(met("Je krijgt 25 euro tegoed."))).toContain("€ 25,00");
    expect(bedragenIn("€ 3,50, €3.25 en 10 euro, maar niet 100 werkers of +31 970 102 51797")).toEqual(["3,50", "3,25", "10,00"]);
  });

  it("een overgebleven plaatshouder", () => {
    expect(reden(met("Tot ziens in {stad}, {voornaam}."))).toContain("Onbekende plaatshouder: {stad}, {voornaam}");
  });

  it("te kort, te lang, en zonder {bedrijf}", () => {
    expect(reden({ ...goed, tekst: "Beste {aanhef}, hallo {bedrijf}." })).toContain("De tekst moet 200 tot 2500 tekens zijn");
    expect(reden({ ...goed, tekst: `${goed.tekst}${" extra".repeat(300)}` })).toContain("De tekst moet 200 tot 2500 tekens zijn");
    expect(reden({ ...goed, onderwerp: "Hoi" })).toContain("Het onderwerp moet 5 tot 90 tekens zijn");
    expect(reden({ ...goed, onderwerp: "Een aanbod", tekst: goed.tekst.split("{bedrijf}").join("jullie") })).toContain("Noem het bedrijf");
    expect(beoordeelCampagneTekst({}).goed).toBe(false);
  });

  it("de knop mag alleen naar onze eigen site", () => {
    expect(knopUrlGeldig("/register?type=bedrijf")).toBe(true);
    expect(knopUrlGeldig("https://zekerflex.com/voor-bedrijven")).toBe(true);
    for (const fout of ["//kwaad.example/x", "https://zekerflex.com.kwaad.example/", "http://zekerflex.com/", "https://kwaad.example/", "javascript:alert(1)", "/a b", '/x"y']) {
      expect(knopUrlGeldig(fout), fout).toBe(false);
      expect(beoordeelCampagneTekst({ ...goed, knopUrl: fout }).goed, fout).toBe(false);
    }
    expect(reden({ ...goed, knopUrl: "" })).toContain("Een eigen knop heeft een tekst én een adres nodig");
    const zonder = { onderwerp: goed.onderwerp, tekst: goed.tekst, zonderVacature: false };
    expect(beoordeelCampagneTekst(zonder).goed).toBe(true);
  });

  it("de knop in de mail: een pad wordt een volledig adres; zonder (geldige) knop de gewone", () => {
    expect(knopVan(goed, "https://zekerflex.com/")).toEqual({ url: "https://zekerflex.com/register?type=bedrijf", tekst: "Maak gratis een account" });
    expect(knopVan({ knopTekst: "Klik", knopUrl: "https://kwaad.example/" }, "https://zekerflex.com")).toBeNull();
    expect(knopVan({ knopTekst: "Klik" }, "https://zekerflex.com")).toBeNull();
    expect(knopVan(null, "https://zekerflex.com")).toBeNull();
  });
});

describe("campagnetekst: bronbewakers", () => {
  const TESTMAIL = "app/api/admin/sales/campaigns/[id]/testmail/route.ts";
  const TEKST = "app/api/admin/sales/campaigns/[id]/tekst/route.ts";

  it("de voorbeeldmail-route en de tekst-route zijn strikt voor platformbeheerders", () => {
    for (const f of [TESTMAIL, TEKST]) {
      const s = bron(f);
      const rollen = [...s.matchAll(/withAdminAccess(?:<[^(]*>)?\(\s*(\[[^\]]*\])/g)].map((m) => m[1]);
      const methoden = [...s.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
      expect(rollen.length, f).toBe(methoden.length);
      expect(rollen.every((r) => r === '["PLATFORM_ADMIN"]'), f).toBe(true);
    }
    expect([...bron(TEKST).matchAll(/export const (GET|PUT|DELETE)\b/g)]).toHaveLength(3);
  });

  it("de voorbeeldmail benadert geen bedrijf: geen onderdrukkingslijst, geen lead, geen concept, en een eigen soort", () => {
    const s = bron(TESTMAIL);
    expect(s).not.toContain("isSuppressed");
    expect(s).not.toMatch(/salesOutreach/i);
    expect(s).not.toMatch(/salesLead/i);
    expect(s).not.toContain("@/lib/prisma");
    expect(s).toContain('kind: "sales-test"');
    expect(s).not.toContain('kind: "sales-outreach"');
    // alleen naar de beheerder zelf of een adres dat de eigenaar zelf in de opslag heeft vastgelegd; een privéadres
    // staat nooit in de code
    expect(s).toContain('const KV_EIGEN_ADRESSEN = "sales:voorbeeld-adressen";');
    expect(s).toContain("if (aan !== eigen && !extra.includes(aan))");
    expect(s).not.toMatch(/["'][^"'\s]+@(gmail|hotmail|outlook)\.[a-z]+["']/i);
    // dezelfde opbouw als de echte mail
    expect(s).toContain("bouwOutreachMail(");
    expect(s).toContain('const VOORVOEGSEL = "[Voorbeeld] ";');
  });

  it("de tekst-route keurt af met 422 en de redenen", () => {
    const s = bron(TEKST);
    expect(s).toContain("beoordeelCampagneTekst(kandidaat)");
    expect(s).toContain("redenen: oordeel.redenen");
    expect(s).toContain("{ status: 422 }");
  });

  it("de motor leest de campagnetekst, één keer per campagne, en geeft hem mee", () => {
    const s = bron("lib/sales/engine.ts");
    expect(s.match(/leesCampagneTekst\(/g)).toHaveLength(1);
    expect(s).toContain("const vast = await leesCampagneTekst(campaign.id);");
    expect(s).toContain("...(vast?.zonderVacature ? {} : { vacancySignal: { not: null } }),");
    expect(s).toContain("draftOutreach(lead.id, null, lead.sequenceStep, { campagneTekst: vast })");
    // gelezen vóór de lus over de leads, niet erin
    expect(s.indexOf("leesCampagneTekst(campaign.id)")).toBeLessThan(s.indexOf("for (const lead of due)"));
  });

  it("send.ts zet bij een mail die niet aankwam geen SENT", () => {
    const s = bron("lib/sales/send.ts");
    const mislukt = s.indexOf('if (!mailResult.delivered && mailResult.transport === "smtp")');
    const verstuurd = s.indexOf('status: "SENT"');
    expect(mislukt).toBeGreaterThan(0);
    expect(verstuurd).toBeGreaterThan(mislukt);
    const tak = s.slice(mislukt, verstuurd);
    expect(tak).toContain('status: "FAILED"');
    expect(tak).toContain('return { status: "failed"');
    expect(tak).not.toContain("sequenceStep");
  });

  it("de voorbeeldmail telt niet als outreach en krijgt geen 'automatisch bericht'-regel", async () => {
    const { isAutomatedKind, isOptionalCategory, mailCategoryForKind } = await import("@/lib/mail/categories");
    expect(mailCategoryForKind("sales-test")).toBe("essential");
    expect(isOptionalCategory(mailCategoryForKind("sales-test"))).toBe(false);
    expect(isAutomatedKind("sales-test")).toBe(false);
    const { blokBijBounce } = await import("@/lib/mail/bounce");
    expect(blokBijBounce("sales-test")).toBe(false);
  });

  it("de KV-sleutel is per campagne, niet per gebruiker", () => {
    expect(bron("lib/sales/campagne-tekst-opslag.ts")).toContain("`sales:campagne-tekst:${campaignId}`");
  });
});
