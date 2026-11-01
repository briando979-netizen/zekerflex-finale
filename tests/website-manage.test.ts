import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedWebsite } from "@prisma/client";

let row: (Partial<ManagedWebsite> & { id: string; tenantId: string }) | null = null;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    managedWebsite: {
      findUnique: vi.fn(async () => row),
      findFirst: vi.fn(async () => row),
      create: vi.fn(async ({ data }: { data: Partial<ManagedWebsite> & { tenantId: string } }) => {
        row = { id: "mw-new", ...data };
        return row;
      }),
      update: vi.fn(async ({ data }: { data: Partial<ManagedWebsite> }) => {
        row = { ...row!, ...data };
        return row;
      }),
    },
  },
}));
const recordAudit = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));
vi.mock("@/lib/billing/stripe", () => ({ ensureStripeCustomer: vi.fn(), createWebsiteManagementCheckoutSession: vi.fn() }));

import type Stripe from "stripe";
import {
  activateManagedWebsite,
  cancelManagedWebsiteBySub,
  isUnlocked,
  revealWebsiteSecrets,
  saveWebsiteDetails,
} from "@/lib/website/manage";

const PRIVATE_KEY = "-----BEGIN OPENSSH PRIVATE KEY-----\ngeheim\n-----END OPENSSH PRIVATE KEY-----";
const session = (tenantId: string | undefined) =>
  ({ id: "cs_1", subscription: "sub_1", metadata: tenantId ? { managedWebsiteTenantId: tenantId } : {} }) as unknown as Stripe.Checkout.Session;

beforeEach(() => {
  row = { id: "mw1", tenantId: "t1", status: "ONBOARDING", plan: "basis", domain: null };
});
afterEach(() => vi.clearAllMocks());

describe("slot op website-beheer", () => {
  it("is alleen open na betaling", () => {
    expect(isUnlocked(null)).toBe(false);
    expect(isUnlocked({ status: "PENDING_PAYMENT" })).toBe(false);
    expect(isUnlocked({ status: "CANCELLED" })).toBe(false);
    expect(isUnlocked({ status: "ONBOARDING" })).toBe(true);
    expect(isUnlocked({ status: "ACTIVE" })).toBe(true);
  });

  it("weigert opslaan zonder betaald abonnement", async () => {
    row = { id: "mw1", tenantId: "t1", status: "PENDING_PAYMENT" };
    await expect(saveWebsiteDetails("t1", { domain: "x.nl" })).rejects.toThrow("abonnement");
    row = null;
    await expect(saveWebsiteDetails("t1", { domain: "x.nl" })).rejects.toThrow("abonnement");
  });

  it("laat de platform-beheerder zonder abonnement opslaan", async () => {
    row = null;
    await saveWebsiteDetails("t1", { domain: "x.nl", sshHost: "1.2.3.4" }, { adminOverride: true });
    expect(row).toMatchObject({ tenantId: "t1", status: "ACTIVE", domain: "x.nl" });
  });
});

describe("betaling via Stripe", () => {
  it("ontgrendelt na betaling en bewaart het abonnement", async () => {
    row = { id: "mw1", tenantId: "t1", status: "PENDING_PAYMENT" };
    await activateManagedWebsite(session("t1"));
    expect(row).toMatchObject({ status: "ONBOARDING", stripeSubId: "sub_1" });
  });

  it("zet een site die al draait niet terug naar het formulier", async () => {
    row = { id: "mw1", tenantId: "t1", status: "ACTIVE" };
    await activateManagedWebsite(session("t1"));
    expect(row!.status).toBe("ACTIVE");
  });

  it("negeert een sessie zonder website-gegevens", async () => {
    row = { id: "mw1", tenantId: "t1", status: "PENDING_PAYMENT" };
    await activateManagedWebsite(session(undefined));
    expect(row!.status).toBe("PENDING_PAYMENT");
  });

  it("zet het record op opgezegd", async () => {
    row = { id: "mw1", tenantId: "t1", status: "ACTIVE", stripeSubId: "sub_1" };
    await cancelManagedWebsiteBySub("sub_1");
    expect(row!.status).toBe("CANCELLED");
    expect(isUnlocked(row as ManagedWebsite)).toBe(false);
  });
});

describe("toegangsgegevens", () => {
  it("bewaart SSH-sleutel en wachtwoord nooit leesbaar", async () => {
    await saveWebsiteDetails("t1", { domain: "x.nl", sshPrivateKey: PRIVATE_KEY, hostingPassword: "wachtwoord123" });
    const stored = JSON.stringify(row);
    expect(row!.secretsSealed).toBeTruthy();
    expect(stored).not.toContain("geheim");
    expect(stored).not.toContain("wachtwoord123");
    expect(row!.status).toBe("SUBMITTED");
  });

  it("zet geen geheimen in het auditspoor", async () => {
    await saveWebsiteDetails("t1", { domain: "x.nl", sshPrivateKey: PRIVATE_KEY, hostingPassword: "wachtwoord123" });
    const audit = JSON.stringify(recordAudit.mock.calls);
    expect(audit).not.toContain("geheim");
    expect(audit).not.toContain("wachtwoord123");
  });

  it("geeft de beheerder de gegevens terug en legt dat vast", async () => {
    await saveWebsiteDetails("t1", { domain: "x.nl", sshHost: "1.2.3.4", sshPrivateKey: PRIVATE_KEY });
    recordAudit.mockClear();
    const secrets = await revealWebsiteSecrets("mw1", "admin-1");
    expect(secrets).toMatchObject({ sshHost: "1.2.3.4", sshPrivateKey: PRIVATE_KEY });
    expect(recordAudit).toHaveBeenCalledOnce();
    const entry = recordAudit.mock.calls[0]![0] as { action: string; actorUserId: string; severity: string };
    expect(entry).toMatchObject({ action: "website.secrets.revealed", actorUserId: "admin-1", severity: "warning" });
  });

  it("overschrijft bestaande gegevens niet als er niets nieuws is ingevuld", async () => {
    await saveWebsiteDetails("t1", { domain: "x.nl", sshPrivateKey: PRIVATE_KEY });
    const sealed = row!.secretsSealed;
    await saveWebsiteDetails("t1", { domain: "y.nl" });
    expect(row!.secretsSealed).toBe(sealed);
    expect(row!.domain).toBe("y.nl");
  });

  it("geeft niets terug als er geen gegevens zijn", async () => {
    expect(await revealWebsiteSecrets("mw1", "admin-1")).toBeNull();
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
