import { beforeEach, describe, expect, it, vi } from "vitest";

// Cert-ronde (13 nov 2026): Caddy vernieuwt zelf, maar een mislukte vernieuwing stond alleen in zijn log en de rondgang zag
// het pas na het verlopen. Nu meet de rondgang elke nacht bij Caddy hoe lang elk certificaat nog geldt (lib/ops/certificaten.ts):
// 14 dagen vooraf een waarschuwing, onder 7 dagen of bij een verkeerd/onbetrouwbaar certificaat kritiek. Een klantdomein telt
// alleen als het ask-eindpunt hem kent én zijn DNS naar ons wijst.

const NU = Date.parse("2026-11-13T04:20:00Z");

type NepCert = { cert?: { valid_to?: string; subjectaltname?: string }; authorized?: boolean; reden?: string; fout?: string };

const h = vi.hoisted(() => ({
  tls: {} as Record<string, NepCert>,
  dns: {} as Record<string, string[]>,
  kv: [] as string[],
  bekend: new Set<string>(),
  meldingen: [] as unknown[],
  verbindingen: [] as { host: string; servername: string }[],
}));

vi.mock("node:tls", async () => {
  const { EventEmitter } = await import("node:events");
  const connect = (opts: { host: string; servername: string }) => {
    h.verbindingen.push({ host: opts.host, servername: opts.servername });
    const nep = h.tls[opts.servername] ?? {};
    const s = Object.assign(new EventEmitter(), {
      authorized: nep.authorized ?? true,
      authorizationError: nep.reden,
      setTimeout: () => undefined,
      destroy: () => undefined,
      getPeerCertificate: () => nep.cert ?? {},
    });
    queueMicrotask(() => (nep.fout ? s.emit("error", new Error(nep.fout)) : s.emit("secureConnect")));
    return s;
  };
  const checkServerIdentity = (host: string, cert: { subjectaltname?: string }) =>
    (cert.subjectaltname ?? "").split(", ").includes(`DNS:${host}`) ? undefined : new Error("andere naam");
  return { default: { connect, checkServerIdentity } };
});
vi.mock("node:dns", () => ({
  promises: {
    resolve4: async (host: string) => {
      const ips = h.dns[host];
      if (!ips) throw new Error("ENOTFOUND");
      return ips;
    },
  },
}));
vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zekerflex.com" } }));
vi.mock("@/lib/prisma", () => ({
  prisma: { keyValueStore: { findMany: async () => h.kv.map((key) => ({ key })) } },
}));
vi.mock("@/lib/ops/alert", () => ({ alertOwner: async (a: unknown) => void h.meldingen.push(a) }));
vi.mock("@/lib/sites/domain", () => ({ mayIssueCertificate: async (host: string) => h.bekend.has(host) }));
vi.mock("@/lib/rijschool/domein", () => ({ rijschoolMagCertificaat: async () => false }));

import { certOordeel, controleerCertificaten, leesCertificaat, teMetenDomeinen } from "@/lib/ops/certificaten";

const geldig = (host: string, tot: string): NepCert => ({ cert: { valid_to: tot, subjectaltname: `DNS:${host}` } });

beforeEach(() => {
  h.tls = { "zekerflex.com": geldig("zekerflex.com", "Jan 28 15:33:04 2027 GMT"), "www.zekerflex.com": geldig("www.zekerflex.com", "Jan 28 15:33:03 2027 GMT") };
  h.dns = { "zekerflex.com": ["37.97.226.24"] };
  h.kv = [];
  h.bekend = new Set();
  h.meldingen = [];
  h.verbindingen = [];
});

describe("een certificaat lezen", () => {
  it("geeft de vervaldatum, gemeten bij Caddy met de naam als SNI", async () => {
    expect(await leesCertificaat("zekerflex.com")).toEqual({ host: "zekerflex.com", geldigTot: "2027-01-28T15:33:04.000Z" });
    expect(h.verbindingen).toEqual([{ host: "caddy", servername: "zekerflex.com" }]);
  });

  it("een certificaat voor een andere naam, een onbetrouwbaar certificaat of geen verbinding is een fout", async () => {
    h.tls["a.nl"] = { cert: { valid_to: "Jan 28 15:33:04 2027 GMT", subjectaltname: "DNS:b.nl" } };
    h.tls["c.nl"] = { ...geldig("c.nl", "Jan 28 15:33:04 2027 GMT"), authorized: false, reden: "DEPTH_ZERO_SELF_SIGNED_CERT" };
    h.tls["d.nl"] = { fout: "Client network socket disconnected before secure TLS connection was established" };
    expect((await leesCertificaat("a.nl")).fout).toBe("certificaat hoort bij een andere naam");
    expect((await leesCertificaat("c.nl")).fout).toBe("niet vertrouwd (DEPTH_ZERO_SELF_SIGNED_CERT)");
    expect(await leesCertificaat("d.nl")).toMatchObject({ geldigTot: null, fout: expect.stringContaining("disconnected") });
  });

  it("verlopen telt in dagen, niet als 'niet vertrouwd'", async () => {
    h.tls["oud.nl"] = { ...geldig("oud.nl", "Nov 10 00:00:00 2026 GMT"), authorized: false, reden: "CERT_HAS_EXPIRED" };
    expect(await leesCertificaat("oud.nl")).toEqual({ host: "oud.nl", geldigTot: "2026-11-10T00:00:00.000Z" });
  });
});

describe("oordeel", () => {
  const m = (host: string, dagen: number) => ({ host, geldigTot: new Date(NU + dagen * 86_400_000).toISOString() });

  it("lang genoeg geldig: geen melding", () => {
    expect(certOordeel([m("zekerflex.com", 76), m("www.zekerflex.com", 14)], NU)).toBeNull();
  });

  it("binnen 14 dagen een waarschuwing, onder 7 dagen kritiek, verlopen ook", () => {
    expect(certOordeel([m("zekerflex.com", 10)], NU)).toMatchObject({ key: "tls:certificaten", severity: "warning" });
    expect(certOordeel([m("zekerflex.com", 10)], NU)?.detail).toContain("zekerflex.com: verloopt over 10 dagen");
    expect(certOordeel([m("zekerflex.com", 5)], NU)?.severity).toBe("critical");
    expect(certOordeel([m("zekerflex.com", 1)], NU)?.detail).toContain("over 1 dag");
    expect(certOordeel([m("zekerflex.com", -2)], NU)?.detail).toContain("zekerflex.com: verlopen op");
  });

  it("geen certificaat of een fout is kritiek; meer dan één in de titel", () => {
    const o = certOordeel([{ host: "klant.nl", geldigTot: null, fout: "geen antwoord" }, { host: "zekerflex.com", geldigTot: m("x", 50).geldigTot, fout: "certificaat hoort bij een andere naam" }], NU);
    expect(o?.severity).toBe("critical");
    expect(o?.title).toBe("2 certificaten niet in orde");
    expect(o?.detail).toContain("klant.nl: geen certificaat (geen antwoord)");
  });
});

describe("welke domeinen en de nachtelijke meting", () => {
  it("eigen domein en www; klantdomeinen alleen als het ask-eindpunt ze kent én de DNS naar ons wijst", async () => {
    h.kv = ["site-host:klant.nl", "site-host:elders.nl", "site-host:onbekend.nl", "site-host:zekerflex.com"];
    h.bekend = new Set(["klant.nl", "elders.nl", "zekerflex.com"]);
    h.dns["klant.nl"] = ["37.97.226.24"];
    h.dns["elders.nl"] = ["185.1.2.3"];
    h.dns["onbekend.nl"] = ["37.97.226.24"];
    expect(await teMetenDomeinen()).toEqual({ eigen: ["zekerflex.com", "www.zekerflex.com"], klanten: ["klant.nl"], elders: ["elders.nl"] });
  });

  it("alles in orde: gemeten, geen melding", async () => {
    const r = await controleerCertificaten(NU);
    expect(r.metingen.map((x) => x.host)).toEqual(["zekerflex.com", "www.zekerflex.com"]);
    expect(r.gemeld).toBe(false);
    expect(h.meldingen).toEqual([]);
  });

  it("een klantdomein zonder certificaat: melding aan de eigenaar", async () => {
    h.kv = ["site-host:klant.nl"];
    h.bekend = new Set(["klant.nl"]);
    h.dns["klant.nl"] = ["37.97.226.24"];
    h.tls["klant.nl"] = { fout: "tlsv1 alert internal error" };
    const r = await controleerCertificaten(NU);
    expect(r.gemeld).toBe(true);
    expect(h.meldingen).toEqual([expect.objectContaining({ key: "tls:certificaten", severity: "critical" })]);
  });
});
