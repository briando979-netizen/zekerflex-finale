import { describe, expect, it } from "vitest";
import { hoofddomein, isDienstAdres, isVacatureSprong } from "@/lib/sales/discovery/vacature-sprong";

const basis = new URL("https://www.hotelzuidbroek.test/");

describe("vacature-sprong: welke sprong mag de crawler maken", () => {
  it("alleen https naar <slug>.<dienst> van een bekende vacaturedienst", () => {
    expect(isVacatureSprong(new URL("https://hotelzuidbroek.recruitee.com/"), basis)).toBe(true);
    expect(isVacatureSprong(new URL("https://hotelzuidbroek.homerun.co/"), basis)).toBe(true);
    expect(isVacatureSprong(new URL("http://hotelzuidbroek.recruitee.com/"), basis)).toBe(false);
    // de dienst zelf, www of diepere hosts zijn geen bedrijfspagina
    expect(isVacatureSprong(new URL("https://recruitee.com/"), basis)).toBe(false);
    expect(isVacatureSprong(new URL("https://www.recruitee.com/"), basis)).toBe(false);
    expect(isVacatureSprong(new URL("https://a.b.recruitee.com/"), basis)).toBe(false);
    // een naam die op de dienst lijkt maar het niet is
    expect(isVacatureSprong(new URL("https://hotel.recruitee.com.evil.test/"), basis)).toBe(false);
    expect(isVacatureSprong(new URL("https://nietrecruitee.com/"), basis)).toBe(false);
  });

  it("werken-bij-subdomeinen van het eigen domein wel, van een ander domein niet", () => {
    expect(isVacatureSprong(new URL("https://werkenbij.hotelzuidbroek.test/"), basis)).toBe(true);
    expect(isVacatureSprong(new URL("https://careers.hotelzuidbroek.test/x"), basis)).toBe(true);
    expect(isVacatureSprong(new URL("https://jobs.hotelzuidbroek.test/"), basis)).toBe(true);
    expect(isVacatureSprong(new URL("https://werkenbij.ander.test/"), basis)).toBe(false);
    expect(isVacatureSprong(new URL("https://shop.hotelzuidbroek.test/"), basis)).toBe(false);
    // hetzelfde origin is geen sprong (dat pad volgt de crawler al)
    expect(isVacatureSprong(new URL("https://www.hotelzuidbroek.test/vacatures"), basis)).toBe(false);
  });

  it("willekeurige derden nooit", () => {
    for (const u of ["https://www.facebook.com/x", "https://linkedin.com/company/x", "https://indeed.com/cmp/x", "https://willekeurig.test/vacatures"]) {
      expect(isVacatureSprong(new URL(u), basis)).toBe(false);
    }
  });

  it("hoofddomein en dienstadressen", () => {
    expect(hoofddomein("www.Bidfood.nl")).toBe("bidfood.nl");
    expect(isDienstAdres("support@recruitee.com")).toBe(true);
    expect(isDienstAdres("x@mail.homerun.co")).toBe(true);
    expect(isDienstAdres("receptie@hotelzuidbroek.test")).toBe(false);
  });
});
