import { describe, expect, it } from "vitest";
import { ACTIVITEITEN } from "@/lib/voorstel/schwarzwald";
import { AGENDA, STANDAARD_OPEN, boekbaar, dagStatus, groepFout, inVenster, openOp, prijsIndicatie, tijdsloten } from "@/lib/voorstel/schwarzwald-agenda";

// 2026-11-04 = woensdag, 11-07 = zaterdag, 11-08 = zondag, 11-09 = maandag
describe("Schwarzwald-agenda", () => {
  it("volgt de openingstijden van hun site", () => {
    expect(openOp("2026-11-04", 8)).toEqual({ van: 13 * 60, tot: 22 * 60 + 30 });
    expect(openOp("2026-11-07", 8)).toEqual({ van: 11 * 60, tot: 22 * 60 + 30 });
    expect(openOp("2026-11-09", 8)).toBeNull();
    // ma/di wel voor groepen vanaf 12
    expect(openOp("2026-11-09", 12)).not.toBeNull();
  });

  it("maakt sloten per heel uur die binnen de openingstijd eindigen", () => {
    const s = tijdsloten("buggy-rijden", "2026-11-04", 8, []);
    expect(s[0]?.tijd).toBe("13:00");
    expect(s.at(-1)?.tijd).toBe("21:00");
    // kever duurt 1,5 uur: om 21:00 beginnen eindigt precies bij sluiting (22:30), dat mag nog
    expect(tijdsloten("kever-rally", "2026-11-04", 8, []).at(-1)?.tijd).toBe("21:00");
    expect(tijdsloten("buggy-rijden", "2026-11-09", 8, [])).toEqual([]);
  });

  it("telt overlappende boekingen mee en meldt vol", () => {
    const bezet = [{ activiteit: "f1-sim-race", tijd: "14:00", personen: 8 }];
    const s = tijdsloten("f1-sim-race", "2026-11-04", 4, bezet);
    expect(s.find((x) => x.tijd === "14:00")?.status).toBe("vol");
    expect(s.find((x) => x.tijd === "15:00")?.status).toBe("vrij");
    // een andere activiteit telt niet mee
    expect(tijdsloten("escaperoom", "2026-11-04", 4, bezet).find((x) => x.tijd === "14:00")?.status).toBe("vrij");
    // kever (90 min) om 14:00 overlapt ook het slot van 15:00
    const kever = tijdsloten("kever-rally", "2026-11-04", 8, [{ activiteit: "kever-rally", tijd: "14:00", personen: 20 }]);
    expect(kever.find((x) => x.tijd === "15:00")?.status).toBe("vol");
    expect(kever.find((x) => x.tijd === "16:00")?.status).toBe("vrij");
  });

  it("geeft een dagstatus binnen het boekbare venster", () => {
    expect(dagStatus("buggy-rijden", "2026-11-02", 8, "2026-11-02", [])).toBe("verleden");
    expect(dagStatus("buggy-rijden", "2026-11-09", 8, "2026-11-02", [])).toBe("gesloten");
    expect(dagStatus("buggy-rijden", "2026-11-04", 8, "2026-11-02", [])).toBe("vrij");
    expect(inVenster("2027-06-01", "2026-11-02")).toBe(false);
  });

  it("rekent een prijsindicatie, met het zondagtarief en per escaperoom", () => {
    expect(prijsIndicatie("buggy-rijden", 10, "2026-11-07")).toBe(650);
    expect(prijsIndicatie("buggy-rijden", 10, "2026-11-08")).toBe(600);
    expect(prijsIndicatie("escaperoom", 12, "2026-11-04")).toBe(250);
    expect(prijsIndicatie("f1-sim-race", 4, "2026-11-04")).toBeNull();
  });

  it("bewaakt de groepsgrootte", () => {
    expect(groepFout("buggy-rijden", 7)).toMatch(/Minimaal 8/);
    expect(groepFout("buggy-rijden", 8)).toBeNull();
    expect(groepFout("f1-sim-race", 11)).toMatch(/maximaal 10/);
    expect(groepFout("anti-slipcursus", 10)).toMatch(/niet online/);
  });

  it("volgt de instellingen van de beheerder: gesloten dag, eigen prijs, activiteit uit", () => {
    const { "f1-sim-race": _uit, ...zonderF1 } = AGENDA;
    const cfg = {
      regels: { ...zonderF1, "buggy-rijden": { ...AGENDA["buggy-rijden"]!, prijsPP: 70, prijsPPZondag: 70 } },
      open: { ...STANDAARD_OPEN, 1: { van: 12 * 60, tot: 18 * 60 } },
      gesloten: ["2026-11-11"],
    };
    expect(openOp("2026-11-11", 8, cfg)).toBeNull();
    expect(dagStatus("buggy-rijden", "2026-11-11", 8, "2026-11-02", [], cfg)).toBe("gesloten");
    expect(openOp("2026-11-09", 8, cfg)).toEqual({ van: 720, tot: 1080 });
    expect(prijsIndicatie("buggy-rijden", 8, "2026-11-08", cfg)).toBe(560);
    expect(ACTIVITEITEN.filter((a) => boekbaar(a, cfg)).some((a) => a.slug === "f1-sim-race")).toBe(false);
    expect(groepFout("f1-sim-race", 4, cfg)).toMatch(/niet online/);
  });

  it("heeft regels voor elke boekbare activiteit, behalve de anti-slipcursus", () => {
    const zonder = ACTIVITEITEN.filter((a) => !boekbaar(a)).map((a) => a.slug);
    expect(zonder).toEqual(["anti-slipcursus"]);
    for (const [slug, r] of Object.entries(AGENDA)) {
      expect(r.min, slug).toBeLessThanOrEqual(r.max);
      expect(r.max, slug).toBeLessThanOrEqual(r.capaciteit);
    }
  });
});
