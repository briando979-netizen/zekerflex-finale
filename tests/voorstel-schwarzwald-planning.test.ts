import { describe, expect, it } from "vitest";
import { indelen, maandagVan, weekDagen } from "@/lib/voorstel/schwarzwald-planning";

describe("weekplanning", () => {
  it("vindt de maandag van de week, ook vanaf een zondag", () => {
    expect(maandagVan("2026-11-04")).toBe("2026-11-02"); // woensdag
    expect(maandagVan("2026-11-08")).toBe("2026-11-02"); // zondag
    expect(maandagVan("2026-11-02")).toBe("2026-11-02"); // maandag zelf
    expect(weekDagen("2026-11-02")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
  });

  it("zet wat tegelijk loopt naast elkaar, en wat na elkaar komt op volle breedte", () => {
    const g = indelen([
      { id: "a", tijd: "14:00", duurMin: 60 },
      { id: "b", tijd: "14:00", duurMin: 90 },
      { id: "c", tijd: "15:00", duurMin: 60 }, // a is dan klaar: baan 0 weer vrij, b loopt nog
      { id: "d", tijd: "18:00", duurMin: 60 }, // nieuwe groep
    ]);
    const per = Object.fromEntries(g.map((x) => [x.item.id, x]));
    expect(per.a?.banen).toBe(2);
    expect(new Set([per.a?.baan, per.b?.baan])).toEqual(new Set([0, 1]));
    expect(per.c?.baan).toBe(per.a?.baan);
    expect(per.d).toMatchObject({ baan: 0, banen: 1 });
  });
});
