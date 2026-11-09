import { describe, expect, it } from "vitest";
import { zuiverLog, zuiverRegistraties } from "@/lib/locatie/avg-regels";

describe("AVG: iemands kentekens en logregels", () => {
  it("haalt alleen de kentekens van deze persoon weg", () => {
    const map = {
      AB123C: { userId: "u1", naam: "Sanne" },
      XX99XX: { userId: "u2", naam: "Jan" },
      ZZ11ZZ: { naam: "Bakkerij Smit" },
    };
    const { map: uit, verwijderd } = zuiverRegistraties(map, "u1");
    expect(verwijderd).toBe(1);
    expect(Object.keys(uit).sort()).toEqual(["XX99XX", "ZZ11ZZ"]);
  });

  it("maakt naam en userId van deze persoon onherkenbaar in het logboek, het moment blijft", () => {
    const log = [
      { at: "2026-11-05T08:00:00Z", userId: "u1", naam: "Sanne", besluit: { open: true } },
      { at: "2026-11-05T09:00:00Z", userId: "u2", naam: "Jan", besluit: { open: false } },
    ];
    const { log: uit, geraakt } = zuiverLog(log, "u1");
    expect(geraakt).toBe(1);
    expect(uit[0]).toMatchObject({ at: "2026-11-05T08:00:00Z", naam: "verwijderd", userId: "verwijderd", besluit: { open: true } });
    expect(uit[1]).toEqual(log[1]);
  });

  it("doet niets als de persoon nergens voorkomt", () => {
    expect(zuiverRegistraties({ AB123C: { userId: "u2", naam: "Jan" } }, "u9").verwijderd).toBe(0);
    expect(zuiverLog([{ userId: "u2", naam: "Jan" }], "u9").geraakt).toBe(0);
  });
});
