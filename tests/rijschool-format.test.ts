import { describe, expect, it } from "vitest";
import { adresRegels, telefoonLink, telefoonWeergave } from "@/lib/rijschool/format";

describe("adres en telefoon op de rijschoolsite", () => {
  it("splitst het adres en schrijft de postcode netjes", () => {
    expect(adresRegels("Brodestraat 10,9742TC", "Groningen")).toEqual(["Brodestraat 10", "9742 TC Groningen"]);
    expect(adresRegels("Brodestraat 10, 9742 tc Groningen", "Groningen")).toEqual(["Brodestraat 10", "9742 TC Groningen"]);
    expect(adresRegels("Dorpsstraat 1", "Zwolle")).toEqual(["Dorpsstraat 1", "Zwolle"]);
    expect(adresRegels("", "Zwolle")).toEqual(["Zwolle"]);
    expect(adresRegels("", "")).toEqual([]);
  });

  it("maakt telefoonnummers leesbaar", () => {
    expect(telefoonWeergave("0612345678")).toBe("06 12 34 56 78");
    expect(telefoonWeergave("+31 6 12345678")).toBe("06 12 34 56 78");
    expect(telefoonWeergave("0501234567")).toBe("050 123 4567");
    expect(telefoonWeergave("+44 20 7946 0958")).toBe("+44 20 7946 0958");
  });

  it("maakt een internationale belink", () => {
    expect(telefoonLink("06 12 34 56 78")).toBe("+31612345678");
    expect(telefoonLink("+31612345678")).toBe("+31612345678");
    expect(telefoonLink("0031612345678")).toBe("+31612345678");
  });
});
