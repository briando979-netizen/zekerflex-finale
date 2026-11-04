import { describe, expect, it } from "vitest";
import {
  BEWAAR_DAGEN,
  MAX_BERICHTEN,
  aiMagAntwoorden,
  antwoordZonderModel,
  bouwSysteem,
  isGesprekId,
  kiesFragmenten,
  metBericht,
  nieuwGesprek,
  verlopen,
  voorGast,
  wilBoeken,
  wilMens,
  woorden,
  type Fragment,
} from "@/lib/sitechat/regels";

const NU = "2026-11-04T12:00:00.000Z";

describe("gesprek", () => {
  it("telt ongelezen berichten van de gast en zet ze op 0 na een antwoord van het team", () => {
    let g = nieuwGesprek("schwarzwald", "a".repeat(20), NU);
    g = metBericht(g, { rol: "gast", tekst: "Hoi" }, NU);
    g = metBericht(g, { rol: "gast", tekst: "Nog een vraag" }, NU);
    expect(g.ongelezen).toBe(2);
    g = metBericht(g, { rol: "medewerker", tekst: "Hallo!", door: "Rita" }, NU);
    expect(g.ongelezen).toBe(0);
    expect(g.berichten.at(-1)).toEqual({ rol: "medewerker", tekst: "Hallo!", op: NU, door: "Rita" });
  });

  it("heropent een gesloten gesprek als de gast weer schrijft", () => {
    const g = { ...nieuwGesprek("x1", "a".repeat(20), NU), status: "gesloten" as const };
    expect(metBericht(g, { rol: "gast", tekst: "Toch nog iets" }, NU).status).toBe("ai");
    expect(metBericht(g, { rol: "systeem", tekst: "melding" }, NU).status).toBe("gesloten");
  });

  it("bewaart hooguit het maximum aantal berichten", () => {
    let g = nieuwGesprek("x1", "a".repeat(20), NU);
    for (let i = 0; i < MAX_BERICHTEN + 5; i++) g = metBericht(g, { rol: "gast", tekst: `bericht ${i}` }, NU);
    expect(g.berichten).toHaveLength(MAX_BERICHTEN);
    expect(g.berichten[0]?.tekst).toBe("bericht 5");
  });

  it("laat de assistent alleen antwoorden zolang niemand heeft overgenomen", () => {
    expect(aiMagAntwoorden({ status: "ai" })).toBe(true);
    expect(aiMagAntwoorden({ status: "wacht" })).toBe(true);
    expect(aiMagAntwoorden({ status: "mens" })).toBe(false);
    expect(aiMagAntwoorden({ status: "gesloten" })).toBe(false);
  });

  it("geeft de gast alleen berichten van het team en meldingen vanaf een positie", () => {
    let g = nieuwGesprek("x1", "a".repeat(20), NU);
    g = metBericht(g, { rol: "gast", tekst: "vraag" }, NU);
    g = metBericht(g, { rol: "ai", tekst: "antwoord" }, NU);
    g = metBericht(g, { rol: "systeem", tekst: "Rita leest mee" }, NU);
    g = metBericht(g, { rol: "medewerker", tekst: "Ik help je", door: "Rita" }, NU);
    expect(voorGast(g, 0).berichten.map((b) => b.tekst)).toEqual(["Rita leest mee", "Ik help je"]);
    expect(voorGast(g, 3).berichten.map((b) => b.tekst)).toEqual(["Ik help je"]);
    // elke regel draagt zijn positie, zodat de widget nooit iets dubbel toont
    expect(voorGast(g, 0).berichten.map((b) => b.i)).toEqual([2, 3]);
    expect(voorGast(g, 4)).toEqual({ status: "ai", totaal: 4, berichten: [] });
  });

  it("controleert id's en laat oude gesprekken vervallen", () => {
    expect(isGesprekId("abcdefghijklmnop")).toBe(true);
    expect(isGesprekId("kort")).toBe(false);
    expect(isGesprekId("../../geheim/abcdefghij")).toBe(false);
    const oud = new Date(Date.parse(NU) - (BEWAAR_DAGEN + 1) * 86_400_000).toISOString();
    expect(verlopen(oud, new Date(NU))).toBe(true);
    expect(verlopen(NU, new Date(NU))).toBe(false);
  });
});

describe("herkennen", () => {
  it("ziet wanneer een gast een mens wil spreken", () => {
    expect(wilMens("Kan ik een medewerker spreken?")).toBe(true);
    expect(wilMens("ik wil iemand spreken")).toBe(true);
    expect(wilMens("Wat kost de buggy tour?")).toBe(false);
  });

  it("ziet wanneer een gast wil reserveren", () => {
    expect(wilBoeken("Kunnen we zaterdag reserveren voor 12 personen?")).toBe(true);
    expect(wilBoeken("Is er nog plek vrij op vrijdag?")).toBe(true);
    expect(wilBoeken("Hoe laat gaan jullie dicht?")).toBe(false);
  });
});

describe("kennis", () => {
  const F: Fragment[] = [
    { titel: "Contact", tekst: "Bel 0548 51 85 05.", altijd: true },
    { titel: "Buggy rijden", tekst: "Een uur off-road in tweepersoons buggy's. € 65 p.p." },
    { titel: "Escaperoom", tekst: "Zes rooms, per room maximaal 10 spelers." },
    { titel: "Quad rijden", tekst: "Quads over de crossbaan, vanaf 4 personen." },
  ];

  it("maakt woorden zonder accenten en stopwoorden", () => {
    // "één" wordt "een" en valt dan als stopwoord weg
    expect(woorden("Wat kost één café-avond?")).toEqual(["kost", "cafe", "avond"]);
    expect(woorden("quads")).toEqual(woorden("Quad"));
  });

  it("stuurt de vaste fragmenten en de best passende mee, beste eerst", () => {
    expect(kiesFragmenten("Wat kost buggy rijden?", F).map((f) => f.titel).slice(0, 2)).toEqual(["Contact", "Buggy rijden"]);
    expect(kiesFragmenten("Hebben jullie quads?", F).map((f) => f.titel)).toEqual(["Contact", "Quad rijden"]);
    expect(kiesFragmenten("Hoi", F).map((f) => f.titel)).toEqual(["Contact"]);
    expect(kiesFragmenten("escaperoom en quad", F, 1).map((f) => f.titel)).toHaveLength(2);
  });

  it("zet bedrijf, regels en gegevens in de systeemtekst", () => {
    const s = bouwSysteem({ bedrijf: "Het Schwarzwald", omschrijving: "Uitjes in Rijssen.", regels: ["Verwijs voor reserveren naar de knop Reserveren."] }, F.slice(0, 2));
    expect(s).toContain("website van Het Schwarzwald");
    expect(s).toContain("- Verwijs voor reserveren naar de knop Reserveren.");
    expect(s).toContain("## Buggy rijden");
    expect(s).toContain("Verzin geen prijzen");
  });

  it("antwoordt zonder model met het best passende fragment of verwijst eerlijk door", () => {
    expect(antwoordZonderModel("prijs buggy", F, "bel 0548 51 85 05")).toMatch(/^Buggy rijden: Een uur off-road/);
    expect(antwoordZonderModel("parkeren", F, "bel 0548 51 85 05")).toMatch(/^Daar weet ik niet direct het antwoord op/);
  });
});
