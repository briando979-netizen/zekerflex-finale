import { describe, expect, it } from "vitest";
import { ACTIVITEITEN } from "@/lib/voorstel/schwarzwald";
import { AGENDA, STANDAARD, STANDAARD_OPEN, boekbaar, dagStatus, groepFout, inVenster, openOp, prijsIndicatie, slotFout, tijdsloten, wijzigFout } from "@/lib/voorstel/schwarzwald-agenda";

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

  it("maakt geblokkeerde tijden vol, per activiteit of voor alles", () => {
    const cfg = { ...STANDAARD, blokkades: [{ datum: "2026-11-07", van: "14:00", tot: "17:00", activiteit: "buggy-rijden", reden: "Besloten feest" }] };
    const buggy = tijdsloten("buggy-rijden", "2026-11-07", 8, [], cfg);
    // buggy duurt 1 uur: 13:00 eindigt om 14:00 en mag nog, 14:00 t/m 16:00 zijn dicht, 17:00 weer open
    expect(buggy.filter((s) => s.status === "vol").map((s) => s.tijd)).toEqual(["14:00", "15:00", "16:00"]);
    expect(buggy.find((s) => s.tijd === "13:00")?.status).toBe("vrij");
    expect(buggy.find((s) => s.tijd === "17:00")?.status).toBe("vrij");
    // een andere activiteit en een andere dag merken er niets van
    expect(tijdsloten("escaperoom", "2026-11-07", 4, [], cfg).every((s) => s.status !== "vol")).toBe(true);
    expect(tijdsloten("buggy-rijden", "2026-11-08", 8, [], cfg).every((s) => s.status !== "vol")).toBe(true);
    // zonder activiteit geldt het voor alles; boeken en verzetten weigeren het slot
    const alles = { ...STANDAARD, blokkades: [{ datum: "2026-11-07", van: "18:00", tot: "23:00", activiteit: "", reden: "Bedrijfsfeest" }] };
    expect(tijdsloten("escaperoom", "2026-11-07", 4, [], alles).find((s) => s.tijd === "19:00")?.status).toBe("vol");
    expect(slotFout("buggy-rijden", "2026-11-07", "15:00", 8, [], cfg)).toMatch(/vol/);
    // kever duurt 90 min: om 17:00 beginnen loopt door tot 18:30 en raakt het blok vanaf 18:00, om 16:00 niet
    const kever = tijdsloten("kever-rally", "2026-11-07", 8, [], alles);
    expect(kever.find((s) => s.tijd === "17:00")?.status).toBe("vol");
    expect(kever.find((s) => s.tijd === "16:00")?.status).toBe("vrij");
  });

  it("controleert dag en tijdstip bij boeken en verzetten", () => {
    expect(slotFout("buggy-rijden", "2026-11-04", "14:00", 8, [])).toBeNull();
    expect(slotFout("buggy-rijden", "2026-11-09", "14:00", 8, [])).toMatch(/gesloten/);
    expect(slotFout("buggy-rijden", "2026-11-04", "11:00", 8, [])).toMatch(/kan deze activiteit niet beginnen/);
    expect(slotFout("f1-sim-race", "2026-11-04", "14:00", 4, [{ activiteit: "f1-sim-race", tijd: "14:00", personen: 8 }])).toMatch(/vol/);
  });

  it("laat een gast zijn reservering wijzigen binnen dezelfde regels", () => {
    const b = { activiteit: "f1-sim-race", datum: "2026-11-04", tijd: "14:00", personen: 4, status: "nieuw" };
    const zo = (w: Partial<{ datum: string; tijd: string; personen: number }>) => ({ datum: b.datum, tijd: b.tijd, personen: b.personen, ...w });
    expect(wijzigFout(b, zo({ personen: 6 }), "2026-11-02", [])).toBeNull();
    expect(wijzigFout(b, zo({}), "2026-11-02", [])).toBe("Er is niets gewijzigd.");
    expect(wijzigFout(b, zo({ personen: 6 }), "2026-11-04", [])).toMatch(/tot de dag ervoor/);
    expect(wijzigFout({ ...b, status: "geannuleerd" }, zo({ personen: 6 }), "2026-11-02", [])).toMatch(/geannuleerd/);
    // F1 heeft 10 plekken: met 4 anderen erbij past 8 niet meer, 6 wel
    const anderen = [{ activiteit: "f1-sim-race", tijd: "14:00", personen: 4 }];
    expect(wijzigFout(b, zo({ personen: 8 }), "2026-11-02", anderen)).toMatch(/vol/);
    expect(wijzigFout(b, zo({ personen: 6 }), "2026-11-02", anderen)).toBeNull();
    // groepsgrenzen en maandag (alleen groepen vanaf 12)
    expect(wijzigFout(b, zo({ personen: 11 }), "2026-11-02", [])).toMatch(/maximaal/);
    expect(wijzigFout({ ...b, activiteit: "buggy-rijden", personen: 12, datum: "2026-11-09" }, { datum: "2026-11-09", tijd: "14:00", personen: 8 }, "2026-11-02", [])).toMatch(/gesloten/);
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
