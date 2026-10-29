import { describe, expect, it } from "vitest";
import { DEFAULT_HOSTING, type HostingConfig, type DnsRecord } from "@/lib/hosting/config";
import { hostingChecks } from "@/lib/hosting/check";
import { bimiRecordName, buildBimiRecord } from "@/lib/hosting/bimi";

// Zuivere helpers → geen mocks nodig. We bouwen fixtures bovenop DEFAULT_HOSTING.
function cfg(patch: (c: HostingConfig) => void): HostingConfig {
  const c = JSON.parse(JSON.stringify(DEFAULT_HOSTING)) as HostingConfig;
  patch(c);
  return c;
}
const rec = (type: string, name: string, value: string): DnsRecord => ({ type, name, value, ttl: "3600" });
const titles = (c: HostingConfig, host = "zekerflex.nl") => hostingChecks(c, host).map((w) => w.title);

const BIMI_TITLES = [
  "BIMI werkt niet zonder DMARC",
  "DMARC-handhaving te laag voor BIMI",
  "Geen BIMI-logo ingesteld",
  "BIMI-logo moet via HTTPS",
  "BIMI-logo lijkt geen SVG",
  "Geen BIMI DNS-record",
  "Nog geen VMC-certificaat",
];

describe("buildBimiRecord / bimiRecordName", () => {
  it("geeft null zonder logo", () => {
    expect(buildBimiRecord(DEFAULT_HOSTING)).toBeNull();
  });

  it("bouwt v=BIMI1 met logo en voegt a= toe met VMC", () => {
    const withLogo = cfg((c) => {
      c.bimi.logoUrl = "https://zekerflex.nl/bimi-logo.svg";
    });
    expect(buildBimiRecord(withLogo)).toEqual({
      name: "default._bimi",
      value: "v=BIMI1; l=https://zekerflex.nl/bimi-logo.svg",
    });

    const withVmc = cfg((c) => {
      c.bimi.logoUrl = "https://zekerflex.nl/bimi-logo.svg";
      c.bimi.vmcUrl = "https://zekerflex.nl/vmc.pem";
    });
    expect(buildBimiRecord(withVmc)?.value).toBe(
      "v=BIMI1; l=https://zekerflex.nl/bimi-logo.svg; a=https://zekerflex.nl/vmc.pem",
    );
  });

  it("gebruikt de selector in de recordnaam, met 'default' als fallback", () => {
    expect(bimiRecordName("")).toBe("default._bimi");
    expect(bimiRecordName("brand")).toBe("brand._bimi");
    const c = cfg((x) => {
      x.bimi.selector = "brand";
      x.bimi.logoUrl = "https://zekerflex.nl/l.svg";
    });
    expect(buildBimiRecord(c)?.name).toBe("brand._bimi");
  });
});

describe("hostingChecks — nameservers", () => {
  it("waarschuwt bij ontbrekende primaire en secundaire nameserver", () => {
    const t = titles(DEFAULT_HOSTING);
    expect(t).toContain("Geen primaire nameserver");
    expect(t).toContain("Geen secundaire nameserver");
  });

  it("geen nameserver-waarschuwing als beide zijn ingevuld", () => {
    const c = cfg((x) => {
      x.dns.primaryNs = "ns1.zekerflex.nl";
      x.dns.secondaryNs = ["ns2.zekerflex.nl", "", ""];
    });
    const t = titles(c);
    expect(t).not.toContain("Geen primaire nameserver");
    expect(t).not.toContain("Geen secundaire nameserver");
  });
});

describe("hostingChecks — mail-DNS", () => {
  it("waarschuwt voor ontbrekende MX/SPF/DMARC/DKIM als er een mailserver is", () => {
    const c = cfg((x) => {
      x.mail.smtpHost = "mail.zekerflex.nl";
    });
    const t = titles(c);
    expect(t).toContain("Geen MX-record");
    expect(t).toContain("Geen SPF-record");
    expect(t).toContain("Geen DMARC-record");
    expect(t).toContain("Nog geen DKIM-record");
  });

  it("geen mail-waarschuwingen zonder mailserver", () => {
    const t = titles(DEFAULT_HOSTING);
    expect(t).not.toContain("Geen MX-record");
    expect(t).not.toContain("Geen SPF-record");
  });

  it("geen mail-waarschuwingen met correcte records", () => {
    const c = cfg((x) => {
      x.mail.smtpHost = "mail.zekerflex.nl";
      x.dns.records = [
        rec("MX", "@", "10 mail.zekerflex.nl."),
        rec("TXT", "@", "v=spf1 mx -all"),
        rec("TXT", "_dmarc", "v=DMARC1; p=quarantine; rua=mailto:postmaster@zekerflex.nl"),
        rec("TXT", "default._domainkey", "v=DKIM1; k=rsa; p=MIGf..."),
      ];
    });
    const t = titles(c);
    expect(t).not.toContain("Geen MX-record");
    expect(t).not.toContain("Geen SPF-record");
    expect(t).not.toContain("Geen DMARC-record");
    expect(t).not.toContain("Nog geen DKIM-record");
  });
});

describe("hostingChecks — BIMI", () => {
  it("waarschuwt dat BIMI zonder DMARC niet werkt", () => {
    const c = cfg((x) => {
      x.bimi.enabled = true;
      x.bimi.logoUrl = "https://zekerflex.nl/bimi-logo.svg";
    });
    expect(titles(c)).toContain("BIMI werkt niet zonder DMARC");
  });

  it("waarschuwt bij DMARC p=none dat de handhaving te laag is", () => {
    const c = cfg((x) => {
      x.bimi.enabled = true;
      x.bimi.logoUrl = "https://zekerflex.nl/bimi-logo.svg";
      x.dns.records = [rec("TXT", "_dmarc", "v=DMARC1; p=none")];
    });
    const t = titles(c);
    expect(t).toContain("DMARC-handhaving te laag voor BIMI");
    expect(t).not.toContain("BIMI werkt niet zonder DMARC");
  });

  it("waarschuwt dat het logo via HTTPS moet", () => {
    const c = cfg((x) => {
      x.bimi.enabled = true;
      x.bimi.logoUrl = "http://zekerflex.nl/bimi-logo.svg";
      x.dns.records = [rec("TXT", "_dmarc", "v=DMARC1; p=reject")];
    });
    expect(titles(c)).toContain("BIMI-logo moet via HTTPS");
  });

  it("waarschuwt bij een ontbrekend _bimi-record", () => {
    const c = cfg((x) => {
      x.bimi.enabled = true;
      x.bimi.logoUrl = "https://zekerflex.nl/bimi-logo.svg";
      x.dns.records = [rec("TXT", "_dmarc", "v=DMARC1; p=reject")];
    });
    expect(titles(c)).toContain("Geen BIMI DNS-record");
  });

  it("geen BIMI-waarschuwingen bij een volledig correcte opzet", () => {
    const c = cfg((x) => {
      x.bimi.enabled = true;
      x.bimi.logoUrl = "https://zekerflex.nl/bimi-logo.svg";
      x.bimi.vmcUrl = "https://zekerflex.nl/vmc.pem";
      x.dns.records = [
        rec("TXT", "_dmarc", "v=DMARC1; p=quarantine; rua=mailto:postmaster@zekerflex.nl"),
        rec("TXT", "default._bimi", "v=BIMI1; l=https://zekerflex.nl/bimi-logo.svg; a=https://zekerflex.nl/vmc.pem"),
      ];
    });
    const t = titles(c);
    for (const warn of BIMI_TITLES) expect(t).not.toContain(warn);
  });

  it("geen BIMI-check als BIMI uit staat en geen logo is ingevuld", () => {
    const t = titles(DEFAULT_HOSTING);
    for (const warn of BIMI_TITLES) expect(t).not.toContain(warn);
  });
});
