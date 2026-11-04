import { afterEach, describe, expect, it, vi } from "vitest";
import { BUNDEL_TLDS, EXTENSIES, euroPrijs, extensie } from "@/lib/domeinen/extensies";
import { geldigLabel, leesDomein, leesNaam, teZoeken } from "@/lib/domeinen/naam";

vi.mock("@/lib/mail/hosting/transip", () => ({ transipConfigured: () => false, domainAvailability: async () => null }));
vi.mock("node:dns/promises", () => ({
  resolveNs: async (d: string) => {
    if (d.startsWith("bezet.")) return ["ns1.example.net"];
    const e = new Error("niet gevonden") as Error & { code: string };
    e.code = "ENOTFOUND";
    throw e;
  },
}));

import { beschikbaarheid, uitRdap } from "@/lib/domeinen/beschikbaar";

afterEach(() => vi.unstubAllGlobals());

describe("extensies", () => {
  it("unieke extensies, prijzen in hele centen, populaire voorop", () => {
    const tlds = EXTENSIES.map((e) => e.tld);
    expect(new Set(tlds).size).toBe(tlds.length);
    for (const e of EXTENSIES) {
      expect(Number.isInteger(e.prijsCent) && e.prijsCent > 0, e.tld).toBe(true);
      if (e.rdap) expect(e.rdap, e.tld).toMatch(/^https:\/\/[a-z0-9.-]+\/.*\/$|^https:\/\/[a-z0-9.-]+\/$/);
    }
    expect(EXTENSIES.filter((e) => e.populair).map((e) => e.tld)).toEqual(["nl", "com", "eu", "be"]);
    for (const t of BUNDEL_TLDS) expect(extensie(t)).toBeDefined();
  });
  it("euroPrijs", () => {
    expect(euroPrijs(995)).toBe("€ 9,95");
    expect(euroPrijs(1495)).toBe("€ 14,95");
  });
});

describe("naam lezen", () => {
  it("haalt adres, www en hoofdletters weg en herkent de extensie", () => {
    expect(leesNaam("https://www.BakkerijJansen.nl/contact?x=1")).toEqual({ label: "bakkerijjansen", tld: "nl" });
    expect(leesNaam("Bakkerij Jansen")).toEqual({ label: "bakkerij-jansen", tld: null });
    expect(leesNaam("bakkerij.jansen")).toEqual({ label: "bakkerij-jansen", tld: null });
    expect(leesNaam("jansen.restaurant")).toEqual({ label: "jansen", tld: "restaurant" });
  });
  it("accenten worden punycode", () => {
    expect(leesNaam("café.nl")).toEqual({ label: "xn--caf-dma", tld: "nl" });
  });
  it("weigert onzin", () => {
    expect(leesNaam("")).toBeNull();
    expect(leesNaam("---")).toBeNull();
    expect(leesNaam("a".repeat(64))).toBeNull();
    expect(leesNaam("<script>")).toBeNull();
    expect(geldigLabel("ab--cd")).toBe(false);
    expect(geldigLabel("xn--caf-dma")).toBe(true);
  });
  it("te zoeken: de getypte extensie eerst, dan de populaire", () => {
    const z = teZoeken({ label: "jansen", tld: "shop" }, 5);
    expect(z).toEqual(["jansen.shop", "jansen.nl", "jansen.com", "jansen.eu", "jansen.be"]);
    expect(teZoeken({ label: "jansen", tld: null }).length).toBe(10);
  });
  it("leesDomein vraagt een extensie die we aanbieden", () => {
    expect(leesDomein("jansen.nl")).toEqual({ label: "jansen", tld: "nl" });
    expect(leesDomein("jansen")).toBeNull();
    expect(leesDomein("jansen.xyz")).toBeNull();
  });
});

describe("beschikbaarheid", () => {
  it("RDAP: 404 vrij, 200 bezet, anders onbekend", () => {
    expect(uitRdap(404)).toBe("vrij");
    expect(uitRdap(200)).toBe("bezet");
    expect(uitRdap(429)).toBe("onbekend");
  });
  it("vraagt het vaste RDAP-adres van de extensie", async () => {
    const f = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", f);
    expect(await beschikbaarheid("vrijenaam-test1.nl")).toBe("vrij");
    expect(f).toHaveBeenCalledWith("https://rdap.sidn.nl/domain/vrijenaam-test1.nl", expect.anything());
  });
  it("zonder RDAP (.eu): DNS-controle", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await beschikbaarheid("bezet.eu")).toBe("bezet");
    expect(await beschikbaarheid("vrijenaam-test2.eu")).toBe("waarschijnlijk-vrij");
    expect(f).not.toHaveBeenCalled();
  });
  it("een storing bij het register geeft onbekend, niet vrij", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    expect(await beschikbaarheid("storing-test3.com")).toBe("onbekend");
  });
});
