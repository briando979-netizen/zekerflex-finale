import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Zakelijke e-mail op het eigen domein van een bedrijf (16 nov 2026, eigenaar: "binnenkort weg, maak het echt"): alleen op een
// domein van dat bedrijf dat via ZekerFlex is vastgelegd; zonder de vlag wacht de aanvraag op Beheer (kosten bij TransIP);
// bij het activeren eerst de mailregels op het domein (MX, SPF, DKIM, DMARC), dan de mailbox, en een mail "je adres werkt".

const store = new Map<string, unknown>();
const h = vi.hoisted(() => ({ domeinen: [] as { domein: string }[], vlag: false, live: true, dns: [] as unknown[], mailboxen: [] as unknown[], mails: [] as { to: string; subject: string }[] }));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => store.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void store.set(k, v),
  kvDelete: async (k: string) => void store.delete(k),
  kvListValues: async (prefix: string) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    keyValueStore: {
      create: async ({ data }: { data: { key: string; value: unknown } }) => {
        if (store.has(data.key)) throw new Prisma.PrismaClientKnownRequestError("dubbel", { code: "P2002", clientVersion: "5" });
        store.set(data.key, data.value);
        return data;
      },
    },
    domeinBestelling: { findMany: async () => h.domeinen },
  },
}));
vi.mock("@/lib/mail/mailbox-connection", () => ({
  getMailboxConnection: async () => null,
  saveMailboxConnection: async () => undefined,
  deleteMailboxConnection: async () => undefined,
  sealMailboxPassword: (pw: string) => `verzegeld(${pw.length})`,
}));
vi.mock("@/lib/security/sealed-secret", () => ({
  sealSecret: (pw: string) => `verzegeld:${Buffer.from(pw).toString("base64")}`,
  openSecret: (s: string) => Buffer.from(s.replace("verzegeld:", ""), "base64").toString(),
}));
vi.mock("@/lib/ops/alert", () => ({ alertOwner: vi.fn().mockResolvedValue("sent") }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/flags", () => ({ featureEnabled: async () => h.vlag }));
vi.mock("@/lib/mail", () => ({
  sendMail: async (m: { to: string; subject: string }) => void h.mails.push(m),
  mailShell: (_t: string, b: string) => b,
  mailButton: (href: string, l: string) => `<a href="${href}">${l}</a>`,
}));
vi.mock("@/lib/mail/hosting/transip", () => ({
  transipConfigured: () => h.live,
  listMailboxes: async () => [],
  listMailForwards: async () => [],
  createMailbox: async (domein: string, i: { localPart: string }) => void h.mailboxen.push({ domein, localPart: i.localPart }),
  addDnsEntry: async (domein: string, r: { name: string; type: string }) => void h.dns.push({ domein, name: r.name, type: r.type }),
}));

import { adminAction, checkEigenAdres, createAccount, eigenMailDomeinen } from "@/lib/mail/zf-accounts";
import { TRANSIP_MAIL_DNS } from "@/lib/mail/hosting/transip-mail-dns";
import { valideerDnsRecord } from "@/lib/mail/hosting/dns-record";
import { eigenLocalPartProblem, localPartProblem } from "@/lib/mail/zf-address";
import { AANBOD } from "@/lib/marketing/aanbod";

const lees = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const jan = { userId: "u1", email: "jan@proefzaak.test", fullName: "Jan Proef", tenantId: "t1" };
const invoer = { localPart: "info", displayName: "Jan Proef", password: "paars-Fiets-73-boom", acceptTerms: true as const, domein: "proefzaak.nl" };

beforeEach(() => {
  store.clear();
  h.domeinen = [{ domein: "proefzaak.nl" }];
  h.vlag = false;
  h.live = true;
  h.dns = [];
  h.mailboxen = [];
  h.mails = [];
});

describe("de mailregels van TransIP", () => {
  it("zijn geldige records: MX, SPF, drie DKIM-verwijzingen en DMARC", () => {
    for (const r of TRANSIP_MAIL_DNS) expect(valideerDnsRecord(r).ok, `${r.name} ${r.type}`).toBe(true);
    expect(TRANSIP_MAIL_DNS).toContainEqual(expect.objectContaining({ name: "@", type: "MX", content: "10 mx.transip.email." }));
    expect(TRANSIP_MAIL_DNS).toContainEqual(expect.objectContaining({ name: "@", type: "TXT", content: "v=spf1 include:_spf.transip.email ~all" }));
    expect(TRANSIP_MAIL_DNS.filter((r) => r.name.endsWith("._domainkey"))).toHaveLength(3);
  });
});

describe("een adres op het eigen domein", () => {
  it("rolnamen als info mogen op je eigen domein (op zekerflex.com niet)", () => {
    expect(eigenLocalPartProblem("info")).toBeNull();
    expect(eigenLocalPartProblem("j")).toBeNull();
    expect(localPartProblem("info")).not.toBeNull();
    expect(eigenLocalPartProblem("-info")).not.toBeNull();
    expect(eigenLocalPartProblem("in..fo")).not.toBeNull();
  });

  it("alleen op een domein van je eigen bedrijf", async () => {
    expect(await eigenMailDomeinen("t1")).toEqual(["proefzaak.nl"]);
    expect(await eigenMailDomeinen(null)).toEqual([]);
    await expect(createAccount(jan, { ...invoer, domein: "andermansdomein.nl" })).rejects.toMatchObject({ status: 422 });
  });

  it("zonder de vlag: aangevraagd, met een verzegeld wachtwoord, en niets bij TransIP", async () => {
    const a = await createAccount(jan, invoer);
    expect(a).toMatchObject({ address: "info@proefzaak.nl", domain: "proefzaak.nl", status: "aangevraagd" });
    expect(a.pendingPasswordSealed).toMatch(/^verzegeld:/);
    expect(h.dns).toHaveLength(0);
    expect(h.mailboxen).toHaveLength(0);
    expect(await checkEigenAdres("info", "proefzaak.nl")).toMatchObject({ available: false });
  });

  it("activeren in Beheer: eerst de mailregels op het domein, dan de mailbox, dan een mail 'je adres werkt'", async () => {
    await createAccount(jan, invoer);
    const a = await adminAction({ action: "activeer", address: "info@proefzaak.nl" }, { userId: "admin", name: "Eigenaar" });
    expect(a.status).toBe("actief");
    expect(h.dns).toHaveLength(TRANSIP_MAIL_DNS.length);
    for (const d of h.dns) expect(d).toMatchObject({ domein: "proefzaak.nl" });
    expect(h.mailboxen).toEqual([{ domein: "proefzaak.nl", localPart: "info" }]);
    expect(h.mails).toHaveLength(1);
    expect(h.mails[0]).toMatchObject({ to: "jan@proefzaak.test", subject: "Je mailadres info@proefzaak.nl werkt" });
  });

  it("met de vlag aan: meteen gemaakt, mét de mailregels", async () => {
    h.vlag = true;
    const a = await createAccount(jan, invoer);
    expect(a.status).toBe("actief");
    expect(h.dns).toHaveLength(TRANSIP_MAIL_DNS.length);
    expect(h.mailboxen).toEqual([{ domein: "proefzaak.nl", localPart: "info" }]);
  });

  it("een adres op zekerflex.com krijgt geen mailregels (die staan er al)", async () => {
    const a = await createAccount(jan, { ...invoer, localPart: "jan.proef", domein: undefined as unknown as string });
    expect(a.address).toBe("jan.proef@zekerflex.com");
    expect(h.dns).toHaveLength(0);
  });
});

describe("nergens meer 'binnenkort'", () => {
  it("het aanbod Zakelijke e-mail is beschikbaar, en /domeinnaam en het mailscherm zeggen geen binnenkort meer", () => {
    expect(AANBOD.find((a) => a.slug === "zakelijke-mail")?.status).toBe("beschikbaar");
    expect(lees("app/(marketing)/domeinnaam/page.tsx")).not.toMatch(/binnenkort/i);
    expect(lees("components/app/ZfMailSignup.tsx")).not.toContain("ownDomainSoon");
    expect(lees("lib/i18n/dictionaries.ts")).not.toContain("ownDomainSoon");
  });
});
