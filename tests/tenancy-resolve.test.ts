import { describe, expect, it } from "vitest";
import { matchTenantHost, normalizeHost, type TenantHostEntry } from "@/lib/tenancy/resolve";

const brand = { name: "X", primaryColor: "#000", logoUrl: "" };
const entries: TenantHostEntry[] = [
  { host: "klant1.jouwplatform.nl", tenantId: "t1", brand },
  { host: "www.eigendomein.nl", tenantId: "t2", brand },
  { host: "*.wildcard.nl", tenantId: "tw", brand },
];

describe("normalizeHost", () => {
  it("lowercase, poort/punt/www eraf", () => {
    expect(normalizeHost("WWW.Klant1.NL:3000")).toBe("klant1.nl");
    expect(normalizeHost("host.example.com.")).toBe("host.example.com");
    expect(normalizeHost("")).toBe("");
  });
});

describe("matchTenantHost", () => {
  it("exacte match (ook met www of poort)", () => {
    expect(matchTenantHost("klant1.jouwplatform.nl", entries)?.tenantId).toBe("t1");
    expect(matchTenantHost("www.klant1.jouwplatform.nl:443", entries)?.tenantId).toBe("t1");
    expect(matchTenantHost("eigendomein.nl", entries)?.tenantId).toBe("t2"); // entry had www, genormaliseerd gelijk
  });

  it("wildcard dekt elk subdomein van de basis", () => {
    expect(matchTenantHost("a.wildcard.nl", entries)?.tenantId).toBe("tw");
    expect(matchTenantHost("diep.a.wildcard.nl", entries)?.tenantId).toBe("tw");
    expect(matchTenantHost("wildcard.nl", entries)?.tenantId).toBe("tw");
  });

  it("geen match → null (standaardmerk)", () => {
    expect(matchTenantHost("onbekend.com", entries)).toBeNull();
    expect(matchTenantHost("", entries)).toBeNull();
  });
});
