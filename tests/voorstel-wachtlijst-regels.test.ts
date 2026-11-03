import { describe, expect, it } from "vitest";
import { plekVrij, wachtlijstFout } from "@/lib/voorstel/wachtlijst-regels";

// 2026-11-04 = woensdag; F1 heeft 10 plekken
describe("wachtlijst", () => {
  const vol = [{ activiteit: "f1-sim-race", tijd: "14:00", personen: 10 }];
  const w = { activiteit: "f1-sim-race", datum: "2026-11-04", tijd: "14:00", personen: 4 };

  it("alleen voor een tijdslot dat echt vol is", () => {
    expect(wachtlijstFout(w, "2026-11-02", vol)).toBeNull();
    expect(wachtlijstFout(w, "2026-11-02", [])).toMatch(/gewoon boeken/);
    expect(wachtlijstFout({ ...w, tijd: "11:00" }, "2026-11-02", vol)).toMatch(/niet beginnen/);
  });

  it("binnen het boekvenster en de groepsgrootte", () => {
    expect(wachtlijstFout(w, "2026-11-04", vol)).toMatch(/niet \(meer\) te boeken/);
    expect(wachtlijstFout({ ...w, personen: 11 }, "2026-11-02", vol)).toMatch(/maximaal/);
    expect(wachtlijstFout({ ...w, datum: "2026-11-09" }, "2026-11-02", [])).toMatch(/gesloten/);
  });

  it("ziet weer plek zodra er genoeg ruimte is", () => {
    expect(plekVrij(w, vol)).toBe(false);
    expect(plekVrij(w, [{ activiteit: "f1-sim-race", tijd: "14:00", personen: 6 }])).toBe(true);
    expect(plekVrij(w, [{ activiteit: "f1-sim-race", tijd: "14:00", personen: 7 }])).toBe(false);
  });
});
