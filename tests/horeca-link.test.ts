import { describe, expect, it } from "vitest";
import { leesMet, tekenMet } from "@/lib/horeca/link";

const geheim = "x".repeat(40);
const id = "clz9k2abc0001xyz";

describe("horeca-links", () => {
  it("een eigen link werkt", () => {
    expect(leesMet(geheim, "annuleer", tekenMet(geheim, "annuleer", id))).toBe(id);
  });

  it("vervalst, ander geheim of kapot werkt niet", () => {
    const t = tekenMet(geheim, "annuleer", id);
    const [data, sig] = t.split(".");
    const ander = Buffer.from("clz9k2abc0002xyz").toString("base64url");
    expect(leesMet(geheim, "annuleer", `${ander}.${sig}`)).toBeNull();
    expect(leesMet("y".repeat(40), "annuleer", t)).toBeNull();
    expect(leesMet(geheim, "annuleer", `${data}`)).toBeNull();
    expect(leesMet(geheim, "annuleer", undefined)).toBeNull();
    expect(leesMet(geheim, "annuleer", "a".repeat(300))).toBeNull();
  });
});
