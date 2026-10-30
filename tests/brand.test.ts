import { describe, expect, it } from "vitest";
import { fixBrandName } from "@/lib/ai/brand";

describe("fixBrandName — merknaam-correctie", () => {
  it("corrigeert fonetische verbasteringen naar ZekerFlex", () => {
    expect(fixBrandName("Welkom bij SeekerFlex!")).toBe("Welkom bij ZekerFlex!");
    expect(fixBrandName("Seeker Flex is top")).toBe("ZekerFlex is top");
    expect(fixBrandName("Zeker Flex")).toBe("ZekerFlex");
    expect(fixBrandName("het ZekerFlecks platform")).toBe("het ZekerFlex platform");
    expect(fixBrandName("seekerflex")).toBe("ZekerFlex");
    expect(fixBrandName("Seeker-Flex")).toBe("ZekerFlex");
  });

  it("laat de juiste naam met rust (idempotent)", () => {
    expect(fixBrandName("ZekerFlex")).toBe("ZekerFlex");
    expect(fixBrandName("Dit is ZekerFlex, het platform.")).toBe("Dit is ZekerFlex, het platform.");
  });

  it("raakt ongerelateerde tekst niet", () => {
    expect(fixBrandName("")).toBe("");
    expect(fixBrandName("flexwerk en zekerheid")).toBe("flexwerk en zekerheid");
  });
});
