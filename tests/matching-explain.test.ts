import { describe, expect, it } from "vitest";
import { explainMatch } from "@/lib/matching/explain";

describe("explainMatch", () => {
  it("zet score + breakdown om in leesbare redenen", () => {
    const ex = explainMatch({
      score: 0.82,
      travelMinutes: 15,
      distanceMeters: 4200,
      withinGeofence: true,
      breakdown: { reliability: 0.9, skill: 0.8, travel: 0.7, badge: 0.05, weights: {}, penalties: [] },
    });
    expect(ex.scorePct).toBe(82);
    expect(ex.verdict).toBe("Sterke match");
    const labels = ex.reasons.map((r) => r.label);
    expect(labels).toEqual(expect.arrayContaining(["Betrouwbaarheid", "Vaardigheid", "Reistijd", "Badge-bonus"]));
    const reli = ex.reasons.find((r) => r.label === "Betrouwbaarheid");
    expect(reli?.strength).toBe("goed");
    expect(reli?.detail).toContain("90%");
    const travel = ex.reasons.find((r) => r.label === "Reistijd");
    expect(travel?.detail).toContain("15 min");
    expect(travel?.detail).toContain("4.2 km");
    expect(travel?.detail).toContain("in de buurt");
  });

  it("is defensief bij een lege/kapotte breakdown — gooit niet, toont wel reistijd", () => {
    const ex = explainMatch({ score: 0.2, travelMinutes: 55, breakdown: null });
    expect(ex.scorePct).toBe(20);
    expect(ex.verdict).toBe("Zwakke match");
    const labels = ex.reasons.map((r) => r.label);
    expect(labels).toEqual(["Reistijd"]); // geen reliability/skill/badge zonder data
    expect(ex.reasons[0]!.strength).toBe("zwak"); // 55 min reistijd
  });

  it("vertaalt penalty's en markeert ze als zwak", () => {
    const ex = explainMatch({
      score: 0.6,
      travelMinutes: 10,
      breakdown: { reliability: 0.5, penalties: ["travel estimated (routing API unavailable)"] },
    });
    expect(ex.verdict).toBe("Goede match");
    const warn = ex.reasons.find((r) => r.label === "Let op");
    expect(warn?.strength).toBe("zwak");
    expect(warn?.detail).toContain("geschat");
  });

  it("klampt de score en rondt netjes af", () => {
    expect(explainMatch({ score: 1.4, travelMinutes: 5 }).scorePct).toBe(100);
    expect(explainMatch({ score: -0.3, travelMinutes: 5 }).scorePct).toBe(0);
  });
});
