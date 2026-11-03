import { describe, expect, it } from "vitest";
import { parseWilReageren, wilReagerenValue } from "@/lib/worker/wil-reageren";

describe("wil reageren (klus onthouden tot na het aanmelden)", () => {
  const now = 1_700_000_000_000;

  it("reads back what the public klus page stored", () => {
    const v = parseWilReageren(wilReagerenValue("cmw0dczh000028x6p0k1m4fdh", "Kassamedewerker", now), now + 1000);
    expect(v).toEqual({ id: "cmw0dczh000028x6p0k1m4fdh", title: "Kassamedewerker", savedAt: now });
  });

  it("trims a very long title", () => {
    expect(parseWilReageren(wilReagerenValue("abcdefgh12", "x".repeat(300), now), now)?.title).toHaveLength(120);
  });

  it("drops broken, foreign or old values", () => {
    expect(parseWilReageren(null, now)).toBeNull();
    expect(parseWilReageren("{kapot", now)).toBeNull();
    expect(parseWilReageren(wilReagerenValue("../../admin", "Klus", now), now)).toBeNull();
    expect(parseWilReageren(wilReagerenValue("abcdefgh12", "", now), now)).toBeNull();
    expect(parseWilReageren(wilReagerenValue("abcdefgh12", "Klus", now), now + 15 * 24 * 3600_000)).toBeNull();
  });
});
