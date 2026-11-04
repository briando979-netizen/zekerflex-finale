import { describe, expect, it } from "vitest";
import { BEWAAR_DAGEN, indoorExport, schoonInteresses, telPerInteresse, verlopen, voegInteressesSamen } from "@/lib/voorstel/indoor-regels";

describe("schoonInteresses", () => {
  it("houdt alleen bekende interesses over, zonder dubbele, in vaste volgorde", () => {
    expect(schoonInteresses(["bedrijfsuitje", "onzin", "kinderfeestje", "bedrijfsuitje"])).toEqual(["kinderfeestje", "bedrijfsuitje"]);
  });

  it("geeft een lege lijst als er niets klopt", () => {
    expect(schoonInteresses(["<script>", ""])).toEqual([]);
  });
});

describe("voegInteressesSamen", () => {
  it("neemt de interesses van beide aanmeldingen", () => {
    expect(voegInteressesSamen(["familie"], ["vrije-tijd", "familie"])).toEqual(["familie", "vrije-tijd"]);
  });
});

describe("verlopen", () => {
  const nu = new Date("2026-11-04T12:00:00Z");

  it("bewaart een recente aanmelding", () => {
    expect(verlopen("2026-01-01T10:00:00Z", nu)).toBe(false);
  });

  it("laat een aanmelding na de bewaartermijn vervallen", () => {
    const oud = new Date(nu.getTime() - (BEWAAR_DAGEN + 1) * 86_400_000).toISOString();
    expect(verlopen(oud, nu)).toBe(true);
  });

  it("ruimt een onleesbare datum op", () => {
    expect(verlopen("geen datum", nu)).toBe(true);
  });
});

describe("telPerInteresse", () => {
  it("telt per interesse, ook de nullen", () => {
    expect(telPerInteresse([{ interesses: ["kinderfeestje", "familie"] }, { interesses: ["kinderfeestje"] }])).toEqual({
      kinderfeestje: 2,
      familie: 1,
      bedrijfsuitje: 0,
      vrijgezellen: 0,
      "vrije-tijd": 0,
    });
  });
});

describe("indoorExport", () => {
  it("geeft een kop en leesbare labels", () => {
    expect(indoorExport([{ dag: "2026-11-04", naam: "Rita", email: "rita@example.com", interesses: ["bedrijfsuitje"], groep: 25 }])).toEqual([
      ["Aangemeld", "Naam", "E-mailadres", "Interesse", "Groepsgrootte"],
      ["2026-11-04", "Rita", "rita@example.com", "Bedrijfsuitje", "25"],
    ]);
  });
});
