import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeCompany } from "@/lib/integrations/kvkbase";
import { mapDiditStatus, verifyWebhook } from "@/lib/integrations/didit";

describe("normalizeCompany (KVKBase)", () => {
  it("maps an enriched KVKBase v1 payload to the neutral profile", () => {
    const profile = normalizeCompany({
      kvkNumber: "68750110",
      name: "ACME Handel B.V.",
      tradingNames: ["ACME", "ACME Shop"],
      legalForm: "Besloten Vennootschap",
      isActive: true,
      registrationDate: "2017-05-02",
      address: {
        street: "Kanaalweg",
        houseNumber: "12",
        postalCode: "3526 KL",
        city: "Utrecht",
        country: "NL",
      },
      activities: [
        { sbiCode: "4791", description: "Postorderbedrijven", isMain: true },
        { sbiCode: "4771", description: "Kledingwinkels", isMain: false },
      ],
      vat: {
        number: "NL857612378B01",
        valid: true,
        status: "validated",
        validatedAt: "2026-03-15T12:00:00Z",
        checksumValid: true,
      },
    });

    expect(profile.kvkNumber).toBe("68750110");
    expect(profile.legalName).toBe("ACME Handel B.V.");
    expect(profile.tradeName).toBe("ACME");
    expect(profile.status).toBe("ACTIVE");
    expect(profile.address.city).toBe("Utrecht");
    expect(profile.sbiCodes).toEqual(["4791", "4771"]);
    expect(profile.activities[0]?.isMain).toBe(true);
    expect(profile.registrationDate).toMatch(/^2017-05-02/);
    expect(profile.vat?.valid).toBe(true);
    expect(profile.vat?.number).toBe("NL857612378B01");
  });

  it("marks an inactive registration as DISSOLVED", () => {
    const profile = normalizeCompany({
      kvkNumber: "12345678",
      name: "Oud Bedrijf",
      isActive: false,
    });
    expect(profile.status).toBe("DISSOLVED");
    expect(profile.isActive).toBe(false);
    expect(profile.vat).toBeNull();
  });

  it("treats null isActive on an enriched basisprofiel as ACTIVE", () => {
    const p = normalizeCompany({
      kvkNumber: "24330087",
      name: "Coolblue B.V.",
      statutoryName: "Coolblue B.V.",
      legalForm: "Besloten Vennootschap",
      isActive: null,
      insolvency: null,
      enriched: true,
      employees: { fullTime: 0, partTime: 0, total: 110 },
      address: { city: "Rotterdam", country: "Nederland" },
    });
    expect(p.status).toBe("ACTIVE");
    expect(p.employeeCount).toBe(110);
    expect(p.address.country).toBe("NL");
  });

  it("null isActive without enrichment is UNKNOWN, insolvency is DISSOLVED", () => {
    expect(
      normalizeCompany({ kvkNumber: "1", name: "X", isActive: null }).status,
    ).toBe("UNKNOWN");
    expect(
      normalizeCompany({
        kvkNumber: "1",
        name: "X",
        isActive: null,
        enriched: true,
        insolvency: { type: "faillissement" },
      }).status,
    ).toBe("DISSOLVED");
  });

  it("drops an 'Onbekend' legal form", () => {
    expect(
      normalizeCompany({ kvkNumber: "1", name: "X", legalForm: "Onbekend" })
        .legalForm,
    ).toBeNull();
  });
});

describe("mapDiditStatus", () => {
  it("maps Didit statuses to KYC states", () => {
    expect(mapDiditStatus("Approved")).toBe("VERIFIED");
    expect(mapDiditStatus("Declined")).toBe("REJECTED");
    expect(mapDiditStatus("In Review")).toBe("PENDING");
    expect(mapDiditStatus("Kyc Expired")).toBe("EXPIRED");
    expect(mapDiditStatus("Not Started")).toBe("NOT_STARTED");
    expect(mapDiditStatus(undefined)).toBe("PENDING");
  });
});

describe("verifyWebhook (Didit)", () => {
  const secret = "didit-webhook-secret-000000000000";

  it("accepts a valid Simple-scheme signature", () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      session_id: "sess_123",
      status: "Approved",
      webhook_type: "status.updated",
      created_at: now,
      timestamp: now,
      vendor_data: "usr_1",
    };
    const raw = JSON.stringify(payload);
    const canonical = `${now}:sess_123:Approved:status.updated`;
    const sig = createHmac("sha256", secret).update(canonical).digest("hex");

    const result = verifyWebhook(raw, { "x-signature-simple": sig });
    expect(result.valid).toBe(true);
    expect(result.method).toBe("simple");
  });

  it("rejects a tampered body", () => {
    const now = Math.floor(Date.now() / 1000);
    const canonical = `${now}:sess_123:Approved:status.updated`;
    const sig = createHmac("sha256", secret).update(canonical).digest("hex");
    const raw = JSON.stringify({
      session_id: "sess_123",
      status: "Declined", // changed
      webhook_type: "status.updated",
      created_at: now,
    });
    expect(verifyWebhook(raw, { "x-signature-simple": sig }).valid).toBe(false);
  });

  it("rejects a stale timestamp", () => {
    const old = Math.floor(Date.now() / 1000) - 4000;
    const canonical = `${old}:s:Approved:t`;
    const sig = createHmac("sha256", secret).update(canonical).digest("hex");
    const raw = JSON.stringify({
      session_id: "s",
      status: "Approved",
      webhook_type: "t",
      created_at: old,
      timestamp: old,
    });
    expect(verifyWebhook(raw, { "x-signature-simple": sig }).valid).toBe(false);
  });
});
