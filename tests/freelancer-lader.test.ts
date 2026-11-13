import { describe, expect, it, vi } from "vitest";

// Een nagemaakte taal "xx": het gegenereerde bestand vertaalt twee sleutels, een override verbetert er één.
vi.mock("@/lib/i18n/gen", () => ({
  GEN_LADERS: {
    xx: async () => ({ dict: { nav: { discover: "X-ontdek", chat: "X-chat" }, nietBestaand: { a: "b" } } }),
    kapot: async () => {
      throw new Error("bestand ontbreekt");
    },
  },
}));
vi.mock("@/lib/i18n/overrides", () => ({
  OVERRIDE_LADERS: { xx: async () => ({ overrides: { nav: { chat: "X-chat beter" } } }) },
}));

import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { laadFreelancerDict, voegSamen, heeftVastWoordenboek } from "@/lib/i18n/freelancer-lader";
import type { Locale } from "@/lib/i18n/config";

describe("laadFreelancerDict", () => {
  it("geeft een handgemaakte taal direct terug", async () => {
    expect(await laadFreelancerDict("pl")).toBe(FREELANCER_DICTS.pl);
    expect(heeftVastWoordenboek("pl")).toBe(true);
    expect(heeftVastWoordenboek("xx")).toBe(false);
  });

  it("legt gegenereerd en override over het Engels; de rest blijft Engels", async () => {
    const d = await laadFreelancerDict("xx" as Locale);
    expect(d.nav.discover).toBe("X-ontdek");
    expect(d.nav.chat).toBe("X-chat beter"); // override wint
    expect(d.nav.account).toBe(FREELANCER_DICTS.en.nav.account); // niet vertaald: Engels
    expect((d as unknown as Record<string, unknown>)["nietBestaand"]).toBeUndefined();
    expect(await laadFreelancerDict("xx" as Locale)).toBe(d); // gecachet
  });

  it("valt terug op Engels als het bestand ontbreekt of niet laadt", async () => {
    expect(await laadFreelancerDict("onbekend" as Locale)).toBe(FREELANCER_DICTS.en);
    expect(await laadFreelancerDict("kapot" as Locale)).toBe(FREELANCER_DICTS.en);
  });

  it("voegSamen vervangt alleen waar het type klopt", () => {
    expect(voegSamen({ a: "x", b: ["1"], c: { d: "y" } }, { a: "z", c: {} })).toEqual({ a: "z", b: ["1"], c: { d: "y" } });
    expect(voegSamen({ a: "x" } as { a: unknown }, { a: 5 })).toEqual({ a: "x" });
  });
});