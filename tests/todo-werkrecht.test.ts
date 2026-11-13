import { describe, expect, it } from "vitest";
import { werkrechtEisTodo } from "@/lib/admin/todo-werkrecht";
import { kiesBeginHier } from "@/lib/admin/te-doen-eerst";

// De eigenaar-taak bij de vlag werkrecht-eis: wettelijk, zonder uiterste datum, vinkt zichzelf af zodra de vlag aan staat, en een
// leesfout (undefined) geeft geen taak om niets vals te tonen.

const NU = new Date("2026-11-14T10:00:00+01:00");

describe("werkrechtEisTodo", () => {
  it("vlag uit: de taak staat open, met reden wettelijk en zonder uiterste datum", () => {
    const t = werkrechtEisTodo(false);
    expect(t?.id).toBe("werkrecht-eis");
    expect(t?.group).toBe("Juridisch");
    expect(t?.done).toBe(false);
    expect(t?.auto).toBe(true);
    expect(t?.eerst).toEqual({ reden: "wettelijk" });
    expect(Object.keys(t?.eerst ?? {})).not.toContain("uiterlijk");
  });

  it("vlag aan: de taak is afgevinkt (en dus niet meer in Begin hier)", () => {
    const t = werkrechtEisTodo(true);
    expect(t?.done).toBe(true);
    expect(t?.doneNote).toContain("werkrecht-eis");
    expect(kiesBeginHier([t!], NU)).toEqual([]);
  });

  it("vlag uit: de taak staat in Begin hier", () => {
    const [eerste] = kiesBeginHier([werkrechtEisTodo(false)!], NU);
    expect(eerste?.todo.id).toBe("werkrecht-eis");
    expect(eerste?.reden).toBe("wettelijk");
    expect(eerste?.uiterlijk).toBeNull();
  });

  it("een leesfout geeft geen taak (geen wijziging, niets vals)", () => {
    expect(werkrechtEisTodo(undefined)).toBeNull();
  });

  it("de tekst noemt de Wav-boete, accountant of jurist, de vlag en waar je hem aanzet", () => {
    const t = werkrechtEisTodo(false)!;
    const alles = `${t.title} ${t.why} ${t.how.join(" ")}`;
    expect(alles).toContain("Wav");
    expect(alles).toContain("€ 8.000");
    expect(alles).toContain("accountant of jurist");
    expect(alles).toContain("werkrecht-eis");
    expect(alles).toContain("Functies aan en uit");
    // eerlijk over wat de vlag doet, en over wie er niets hoeft te doen
    expect(t.why).toContain("niets gevraagd en niets geblokkeerd");
    expect(alles).toContain("EU, de EER of Zwitserland");
    expect(alles).toContain("alleen voor een ID dat met onze eigen scan");
    expect(alles).toContain("buiten de EU");
  });

  it("geen verzonnen datum in de tekst", () => {
    const t = werkrechtEisTodo(false)!;
    expect(`${t.why} ${t.how.join(" ")}`).not.toMatch(/\b20\d\d\b/);
  });
});
