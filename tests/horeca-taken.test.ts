import { describe, expect, it } from "vitest";
import { VOORBEELD_LIJSTEN, alsRegel, leesRegel, leesRegels, leesTaken, periode, waardeOk } from "@/lib/horeca/taken";

describe("horeca-takenlijsten", () => {
  it("een gewone regel is een vinkje, met (min/max) een meting", () => {
    expect(leesRegel("  Werkbanken   schoon ")).toEqual({ tekst: "Werkbanken schoon", meten: false });
    expect(leesRegel("Temperatuur koelcel (max 7)")).toEqual({ tekst: "Temperatuur koelcel", meten: true, max: 7 });
    expect(leesRegel("Vriezer (min -25 max -18)")).toEqual({ tekst: "Vriezer", meten: true, min: -25, max: -18 });
    expect(leesRegel("Kerntemperatuur (min 75)")).toEqual({ tekst: "Kerntemperatuur", meten: true, min: 75 });
    expect(leesRegel("Soep (bijna op)")).toEqual({ tekst: "Soep (bijna op)", meten: false });
    expect(leesRegel("   ")).toBeNull();
  });

  it("tekstvak heen en terug", () => {
    const t = leesRegels("Koelcel (max 7)\n\nVloer gedweild\r\nVriezer (min -25 max -18)");
    expect(t).toHaveLength(3);
    expect(t.map(alsRegel)).toEqual(["Koelcel (max 7)", "Vloer gedweild", "Vriezer (min -25 max -18)"]);
  });

  it("waarde binnen de grens, met komma of punt", () => {
    const koel = { tekst: "Koelcel", meten: true, max: 7 };
    expect(waardeOk(koel, "4,5")).toBe(true);
    expect(waardeOk(koel, "7")).toBe(true);
    expect(waardeOk(koel, "8.2")).toBe(false);
    expect(waardeOk(koel, "warm")).toBeNull();
    expect(waardeOk({ tekst: "Kern", meten: true, min: 75 }, "70")).toBe(false);
  });

  it("wekelijks = de maandag van die week; anders de dag zelf", () => {
    expect(periode("wekelijks", "2026-11-05")).toBe("2026-11-02"); // donderdag → maandag
    expect(periode("wekelijks", "2026-11-08")).toBe("2026-11-02"); // zondag → maandag ervoor
    expect(periode("opening", "2026-11-05")).toBe("2026-11-05");
  });

  it("taken uit de database veilig terug; voorbeelden zijn geldig", () => {
    expect(leesTaken([{ tekst: "A", meten: true, max: 7 }, { tekst: 1 }, "x", { tekst: "B", meten: false, max: 3 }])).toEqual([
      { tekst: "A", meten: true, max: 7 },
      { tekst: "B", meten: false },
    ]);
    for (const l of VOORBEELD_LIJSTEN) expect(leesRegels(l.regels.join("\n"))).toHaveLength(l.regels.length);
  });
});
