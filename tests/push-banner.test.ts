import { describe, expect, it } from "vitest";
import { BANNER_WEER_NA_MS, bannerWeerTonen, PUSH_BANNER_NL } from "@/components/app/push-banner-texts";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

const NU = Date.parse("2026-11-09T15:00:00+01:00");

describe("pushbanner: wanneer hij weer verschijnt", () => {
  it("toont hem als hij nooit is weggeklikt", () => {
    expect(bannerWeerTonen(null, NU)).toBe(true);
  });
  it("toont hem weer bij de oude 'voor altijd weg'-waarde", () => {
    expect(bannerWeerTonen("1", NU)).toBe(true);
  });
  it("houdt hem 14 dagen weg na wegklikken, daarna weer zichtbaar", () => {
    expect(bannerWeerTonen(String(NU - 1000), NU)).toBe(false);
    expect(bannerWeerTonen(String(NU - BANNER_WEER_NA_MS + 1000), NU)).toBe(false);
    expect(bannerWeerTonen(String(NU - BANNER_WEER_NA_MS), NU)).toBe(true);
  });
  it("een rare waarde telt als niet weggeklikt", () => {
    expect(bannerWeerTonen("onzin", NU)).toBe(true);
  });
});

describe("pushbanner-teksten", () => {
  it("de werker-app heeft ze in alle vijf de talen, en ze noemen klussen", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      for (const k of Object.keys(PUSH_BANNER_NL) as (keyof typeof PUSH_BANNER_NL)[]) {
        expect(d.pushBanner[k].trim().length, `${taal}.${k}`).toBeGreaterThan(1);
      }
    }
    expect(FREELANCER_DICTS.nl.pushBanner.aanzetten).toMatch(/klus/);
  });
});
