import { describe, expect, it } from "vitest";
import { domeinNaam, domeinPastBijNaam, eigendomVanEmail, emailDomein, isGratisMail, naamWoorden } from "@/lib/company/eigendom";

describe("bedrijf: hoort de aanmelder erbij", () => {
  it("leest het domein en het naamdeel", () => {
    expect(emailDomein("Info@Bakkerij-Jansen.NL")).toBe("bakkerij-jansen.nl");
    expect(domeinNaam("mail.bakkerij-jansen.nl")).toBe("bakkerijjansen");
    expect(domeinNaam("jansen.co.uk")).toBe("jansen");
    expect(domeinNaam("nl")).toBe("");
  });

  it("haalt rechtsvorm en vulwoorden uit de naam", () => {
    expect(naamWoorden("Bakkerij Jansen B.V.")).toEqual(["bakkerij", "jansen"]);
    expect(naamWoorden("Café 't Hoekje V.O.F.")).toEqual(["cafe", "hoekje"]);
    expect(naamWoorden("Van der Berg Holding B.V.")).toEqual(["berg"]);
  });

  it("keurt een eigen domein goed dat bij de naam past", () => {
    expect(domeinPastBijNaam("bakkerijjansen.nl", "Bakkerij Jansen B.V.")).toBe(true);
    expect(domeinPastBijNaam("bakkerij-jansen.nl", "Bakkerij Jansen B.V.")).toBe(true);
    expect(domeinPastBijNaam("jansenschoonmaak.nl", "Jansen Schoonmaak en Onderhoud B.V.")).toBe(true);
    expect(domeinPastBijNaam("zekerflex.nl", "ZekerFlex B.V.")).toBe(true);
    expect(domeinPastBijNaam("abc.nl", "Aannemersbedrijf Bouw Combinatie B.V.")).toBe(true);
  });

  it("keurt een domein dat er niet bij past niet goed", () => {
    // alleen het branchewoord is niet genoeg
    expect(domeinPastBijNaam("bakkerijdevries.nl", "Bakkerij Jansen B.V.")).toBe(false);
    expect(domeinPastBijNaam("ah.nl", "Albert Heijn B.V.")).toBe(false);
    expect(domeinPastBijNaam("x.nl", "Bakkerij Jansen B.V.")).toBe(false);
  });

  it("gratis mail gaat altijd naar een controle met de hand", () => {
    expect(isGratisMail("gmail.com")).toBe(true);
    expect(eigendomVanEmail("bakkerijjansen@gmail.com", ["Bakkerij Jansen B.V."])).toEqual({ ok: false, reden: "gratis-mail" });
  });

  it("geeft per aanmelder één oordeel, ook met handelsnaam", () => {
    expect(eigendomVanEmail("info@bakkerijjansen.nl", ["Jansen Holding B.V.", "Bakkerij Jansen"])).toEqual({ ok: true, via: "domein", domein: "bakkerijjansen.nl" });
    expect(eigendomVanEmail("piet@anderbedrijf.nl", ["Bakkerij Jansen B.V.", null])).toEqual({ ok: false, reden: "domein-past-niet" });
    expect(eigendomVanEmail("geen-at-teken", ["Bakkerij Jansen B.V."])).toEqual({ ok: false, reden: "geen-domein" });
  });
});
