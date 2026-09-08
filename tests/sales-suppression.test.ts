import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

const suppFindUnique = vi.fn();
const userFindUnique = vi.fn();
const userFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    salesSuppression: {
      findUnique: (...a: unknown[]) => suppFindUnique(...a),
      upsert: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      findFirst: (...a: unknown[]) => userFindFirst(...a),
    },
  },
}));

const mailAllowed = vi.fn();
vi.mock("@/lib/mail/prefs", () => ({ mailAllowed: (...a: unknown[]) => mailAllowed(...a) }));

import { isSuppressed, domainOf } from "@/lib/sales/suppression";

afterEach(() => vi.clearAllMocks());

function allowAll() {
  suppFindUnique.mockResolvedValue(null);
  mailAllowed.mockResolvedValue(true);
  userFindUnique.mockResolvedValue(null);
  userFindFirst.mockResolvedValue(null);
}

describe("sales suppression", () => {
  it("passes a clean business address", async () => {
    allowAll();
    const r = await isSuppressed("hr@schoonbedrijf.nl");
    expect(r.blocked).toBe(false);
  });

  it("blocks an address on the explicit suppression list", async () => {
    allowAll();
    suppFindUnique.mockResolvedValue({ email: "x@y.nl", reason: "bounce" });
    const r = await isSuppressed("x@y.nl");
    expect(r).toMatchObject({ blocked: true, reason: "bounce" });
  });

  it("blocks an address that opted out of the sales-outreach category", async () => {
    allowAll();
    mailAllowed.mockResolvedValue(false);
    const r = await isSuppressed("nee@bedrijf.nl");
    expect(r).toMatchObject({ blocked: true, reason: "category-opt-out" });
  });

  it("blocks an address whose domain is already a customer", async () => {
    allowAll();
    userFindFirst.mockResolvedValue({ id: "usr_1" });
    const r = await isSuppressed("iemand@klantbedrijf.nl");
    expect(r).toMatchObject({ blocked: true, reason: "existing-customer" });
  });

  it("does not domain-match free mail providers", async () => {
    allowAll();
    // findFirst would only be consulted for business domains.
    await isSuppressed("someone@gmail.com");
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("rejects a malformed address outright", async () => {
    allowAll();
    const r = await isSuppressed("not-an-email");
    expect(r.blocked).toBe(true);
  });

  it("domainOf extracts the domain", () => {
    expect(domainOf("A.B@Example.NL")).toBe("example.nl");
    expect(domainOf("bad")).toBeNull();
  });
});
