import { describe, expect, it } from "vitest";
import { LOCALES } from "@/lib/i18n/config";
import { WELKOM_DICTS } from "@/lib/i18n/welkom";
import {
  AANTAL_SLIDES,
  cookieIsGezien,
  gezienCookie,
  instroomBestemming,
  registerHref,
  slideNaSwipe,
  slideVanScroll,
  volgendeSlide,
  vorigeSlide,
} from "@/lib/welkom/slides";

describe("welkomstcarrousel: slides", () => {
  it("loopt niet voorbij het begin of einde", () => {
    expect(volgendeSlide(0)).toBe(1);
    expect(volgendeSlide(AANTAL_SLIDES - 1)).toBe(AANTAL_SLIDES - 1);
    expect(vorigeSlide(1)).toBe(0);
    expect(vorigeSlide(0)).toBe(0);
  });

  it("leest de slide uit de scrollpositie", () => {
    expect(slideVanScroll(0, 390)).toBe(0);
    expect(slideVanScroll(400, 390)).toBe(1);
    expect(slideVanScroll(5000, 390)).toBe(AANTAL_SLIDES - 1);
    expect(slideVanScroll(100, 0)).toBe(0);
  });

  it("swipe naar links is volgende, naar rechts vorige, klein telt niet", () => {
    expect(slideNaSwipe(0, -80)).toBe(1);
    expect(slideNaSwipe(1, 80)).toBe(0);
    expect(slideNaSwipe(1, 10)).toBe(1);
  });
});

describe("welkomstcarrousel: onthouden en instroom", () => {
  it("herkent de cookie die de carrousel als gezien markeert", () => {
    expect(cookieIsGezien(gezienCookie())).toBe(true);
    expect(cookieIsGezien("a=b; zf_welkom=1; c=d")).toBe(true);
    expect(cookieIsGezien("xzf_welkom=1")).toBe(false);
    expect(cookieIsGezien(null)).toBe(false);
  });

  it("stuurt alleen een eerste bezoeker in de app naar /welkom", () => {
    expect(instroomBestemming({ inApp: true, gezien: false })).toBe("/welkom");
    expect(instroomBestemming({ inApp: true, gezien: true })).toBe("/login");
    expect(instroomBestemming({ inApp: false, gezien: false })).toBe("/login");
    expect(instroomBestemming({ inApp: false, gezien: true })).toBe("/login");
  });

  it("behoudt bestaande registratie-parameters en laat onbekende weg", () => {
    expect(registerHref({})).toBe("/register");
    expect(registerHref({ type: "zzp", utm: "x" })).toBe("/register?type=zzp");
    expect(registerHref({ type: ["uitzendkracht", "zzp"], email: "a@b.test" })).toBe(
      "/register?type=uitzendkracht&email=a%40b.test",
    );
  });
});

describe("welkomstteksten in vijf talen", () => {
  for (const l of LOCALES) {
    it(`${l}: alle teksten ingevuld`, () => {
      const d = WELKOM_DICTS[l];
      expect(d.slides).toHaveLength(AANTAL_SLIDES);
      for (const s of d.slides) {
        expect(s.title.trim()).not.toBe("");
        expect(s.text.trim()).not.toBe("");
        expect(s.alt.trim()).not.toBe("");
      }
      for (const v of [
        d.lang, d.carousel, d.prev, d.next, d.note, d.create, d.login, d.back,
        d.loginHero.title, d.loginHero.subtitle, d.registerHero.title, d.registerHero.subtitle,
      ]) {
        expect(v.trim()).not.toBe("");
      }
      expect(d.slideOf).toContain("{n}");
      expect(d.slideOf).toContain("{total}");
    });
  }
});
