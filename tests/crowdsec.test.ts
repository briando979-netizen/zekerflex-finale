import { describe, expect, it } from "vitest";
import { cijfersUit, duurTekst, meldingAdres, samenvatBlokkades, scenarioTekst, vlagVan, type Blokkade } from "@/lib/ops/crowdsec-tekst";

// Aanvalsbescherming (CrowdSec): de pure helpers achter Admin → Beveiliging en /beveiliging.

const blok = (over: Partial<Blokkade>): Blokkade => ({
  id: 1,
  origin: "crowdsec",
  type: "ban",
  scope: "Ip",
  value: "203.0.113.5",
  duration: "3h59m12.4s",
  scenario: "crowdsecurity/http-probing",
  ...over,
});

describe("samenvatBlokkades", () => {
  it("telt eigen, community en handmatige blokkades apart en de eigen scenario's per soort", () => {
    const s = samenvatBlokkades([
      blok({ id: 1 }),
      blok({ id: 2, value: "203.0.113.6", scenario: "crowdsecurity/http-bad-user-agent" }),
      blok({ id: 3, value: "203.0.113.7" }),
      blok({ id: 4, origin: "CAPI", scenario: "crowdsecurity/community-blocklist", value: "198.51.100.1" }),
      blok({ id: 5, origin: "lists", scenario: "firehol", value: "198.51.100.2" }),
      blok({ id: 6, origin: "cscli", scenario: "manual", value: "198.51.100.3" }),
    ]);
    expect(s.totaal).toBe(6);
    expect(s.eigen).toBe(3);
    expect(s.community).toBe(2);
    expect(s.handmatig).toBe(1);
    expect(s.perScenario).toEqual([
      { scenario: "crowdsecurity/http-probing", aantal: 2 },
      { scenario: "crowdsecurity/http-bad-user-agent", aantal: 1 },
    ]);
  });

  it("is leeg zonder blokkades", () => {
    expect(samenvatBlokkades([])).toEqual({ totaal: 0, eigen: 0, community: 0, handmatig: 0, perScenario: [] });
  });
});

describe("scenarioTekst", () => {
  it("vertaalt bekende scenario's naar gewone taal", () => {
    expect(scenarioTekst("crowdsecurity/http-probing")).toBe("Zoekt naar kwetsbare pagina's");
    expect(scenarioTekst("crowdsecurity/ssh-bf")).toBe("Probeert in te loggen op de server (ssh)");
    expect(scenarioTekst("crowdsecurity/http-cve-2021-41773")).toBe("Bekende kwetsbaarheid (CVE)");
    expect(scenarioTekst("crowdsecurity/community-blocklist")).toBe("Bekende aanvaller (community-lijst)");
  });

  it("geeft van een onbekend scenario de korte naam", () => {
    expect(scenarioTekst("iemand/iets-nieuws")).toBe("iets-nieuws");
  });
});

describe("duurTekst", () => {
  it("rondt de resterende duur af op minuten", () => {
    expect(duurTekst("3h12m4.5s")).toBe("nog 3 u 12 min");
    expect(duurTekst("45m50s")).toBe("nog 46 min");
    expect(duurTekst("2h")).toBe("nog 2 u");
  });

  it("noemt dagen bij lange blokkades", () => {
    expect(duurTekst("72h30m")).toBe("nog 3 d");
    expect(duurTekst("50h")).toBe("nog 2 d 2 u");
  });

  it("herkent een verlopen of lege duur", () => {
    expect(duurTekst("-1h2m3s")).toBe("verlopen");
    expect(duurTekst("")).toBe("verlopen");
    expect(duurTekst(undefined)).toBe("verlopen");
    expect(duurTekst("20s")).toBe("nog minder dan een minuut");
  });
});

describe("vlagVan en meldingAdres", () => {
  it("maakt van een landcode een vlag en valt terug op een wereldbol", () => {
    expect(vlagVan("NL")).toBe("🇳🇱");
    expect(vlagVan("de")).toBe("🇩🇪");
    expect(vlagVan(undefined)).toBe("🌐");
    expect(vlagVan("XYZ")).toBe("🌐");
  });

  it("neemt het ip, anders de waarde", () => {
    expect(meldingAdres({ id: 1, created_at: "", scenario: "", source: { ip: "203.0.113.1", value: "203.0.113.1" } })).toBe("203.0.113.1");
    expect(meldingAdres({ id: 1, created_at: "", scenario: "", source: { value: "203.0.113.0/24" } })).toBe("203.0.113.0/24");
    expect(meldingAdres({ id: 1, created_at: "", scenario: "", source: {} })).toBe("?");
  });
});

describe("cijfersUit", () => {
  it("geeft alleen aantallen door voor de openbare pagina", () => {
    const c = cijfersUit({ totaal: 12, eigen: 2, community: 9, handmatig: 1, perScenario: [] }, 17, new Date("2026-11-05T10:00:00Z"));
    expect(c).toEqual({ blokkadesNu: 12, community: 9, eigen: 3, meldingen7d: 17, bijgewerkt: "2026-11-05T10:00:00.000Z" });
  });
});
