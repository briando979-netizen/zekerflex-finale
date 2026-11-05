import { describe, expect, it } from "vitest";
import {
  MODULES,
  MODULE_DEFS,
  MODULE_LIJST,
  STATUS_LABEL,
  euro,
  isModule,
  leesbareCode,
  maandOverzicht,
  maandbedragCent,
  moduleActief,
  vpnOnbeperktVanaf,
  type NetwerkStand,
} from "@/lib/netwerk/modules";

// De netwerkpakketten (lib/netwerk/modules.ts): prijzen uit het voorstel van
// 5 nov 2026, het rekenwerk per maand en de leesbare wifi-wachtwoorden.

describe("de pakketten", () => {
  it("drie pakketten, elk met Nederlandse naam, prijs en wat de klant nodig heeft", () => {
    expect(MODULES).toEqual(["wifi", "vpn", "5g"]);
    for (const def of MODULE_LIJST) {
      expect(def.naam.length).toBeGreaterThan(5);
      expect(def.punten.length).toBeGreaterThanOrEqual(3);
      expect(def.prijsTekst).toMatch(/€/);
      expect(def.nodig.length).toBeGreaterThan(10);
      expect(Object.keys(STATUS_LABEL)).toHaveLength(4);
    }
    expect(isModule("wifi")).toBe(true);
    expect(isModule("5G")).toBe(false);
  });

  it("de prijzen uit het voorstel: € 49 per vestiging, € 4 per gebruiker of € 149 onbeperkt, 5G vanaf € 299 op aanvraag", () => {
    expect(MODULE_DEFS.wifi.prijsCent).toBe(4900);
    expect(MODULE_DEFS.vpn.prijsCent).toBe(400);
    expect(MODULE_DEFS.vpn.onbeperktCent).toBe(14900);
    expect(MODULE_DEFS["5g"].prijsCent).toBe(29900);
    expect(MODULE_DEFS["5g"].opAanvraag).toBe(true);
    expect(MODULE_DEFS.wifi.opAanvraag).toBe(false);
  });
});

describe("rekenen per maand", () => {
  it("wifi per vestiging, VPN per gebruiker of onbeperkt (voordeliger vanaf 38 gebruikers)", () => {
    expect(maandbedragCent("wifi", 1)).toBe(4900);
    expect(maandbedragCent("wifi", 3)).toBe(14700);
    expect(maandbedragCent("wifi", 0)).toBe(4900); // minstens één
    expect(maandbedragCent("vpn", 25, "per-gebruiker")).toBe(10000);
    expect(maandbedragCent("vpn", 25, "onbeperkt")).toBe(14900);
    expect(maandbedragCent("vpn", 200, "onbeperkt")).toBe(14900);
    expect(vpnOnbeperktVanaf()).toBe(38);
  });

  it("het overzicht telt alleen actieve pakketten en zet een kosteloos account op € 0", () => {
    const stand: NetwerkStand = {
      updatedAt: "",
      modules: {
        wifi: { status: "actief", sinds: "2026-11-05T10:00:00Z", aantal: 2 },
        vpn: { status: "actief", sinds: "2026-11-05T10:00:00Z", aantal: 25, variant: "per-gebruiker" },
        "5g": { status: "aangevraagd", sinds: "2026-11-05T10:00:00Z", aantal: 1 },
      },
    };
    const o = maandOverzicht(stand);
    expect(o.regels.map((r) => [r.sleutel, r.omschrijving, r.bedragCent])).toEqual([
      ["wifi", "2 vestigingen", 9800],
      ["vpn", "25 gebruikers", 10000],
    ]);
    expect(o.totaalCent).toBe(19800); // zoals in het voorstel: € 98 + € 100
    expect(moduleActief(stand, "wifi")).toBe(true);
    expect(moduleActief(stand, "5g")).toBe(false);
    expect(moduleActief(null, "wifi")).toBe(false);

    const gratis = maandOverzicht({ updatedAt: "", modules: { wifi: { status: "actief", sinds: "", aantal: 1, gratis: true }, vpn: { status: "actief", sinds: "", aantal: 1, variant: "onbeperkt" } } });
    expect(gratis.regels.map((r) => [r.omschrijving, r.bedragCent])).toEqual([
      ["1 vestiging", 0],
      ["hele bedrijf, onbeperkt", 14900],
    ]);
    expect(maandOverzicht(undefined).totaalCent).toBe(0);
  });

  it("bedragen als op een prijslijst", () => {
    expect(euro(4900)).toBe("€ 49");
    expect(euro(450)).toBe("€ 4,50");
    expect(euro(0)).toBe("€ 0");
    expect(euro(123456)).toBe("€ 1.234,56");
    expect(euro(-1000)).toBe("-€ 10");
  });
});

describe("leesbare codes", () => {
  it("vier groepen van vier, zonder 0/O, 1/l/I", () => {
    const bytes = new Uint8Array(16).map((_, i) => i * 17);
    const code = leesbareCode(bytes);
    expect(code).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(code).not.toMatch(/[01lio]/);
    expect(leesbareCode(bytes)).toBe(code); // zelfde bytes, zelfde code
    expect(leesbareCode(new Uint8Array(4), 1, 4)).toBe("aaaa");
  });
});
