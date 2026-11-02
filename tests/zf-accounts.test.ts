import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Een eigen adres maken: zonder TransIP-sleutel wordt het gereserveerd (met
// verzegeld wachtwoord), met sleutel meteen aangemaakt én gekoppeld. Een adres
// kan nooit twee keer uitgegeven worden, en als TransIP faalt komt het vrij.

const store = new Map<string, unknown>();
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
  },
}));
const connections = new Map<string, { email: string; username: string; imap: { host: string }; smtp: { host: string } }>();
vi.mock("@/lib/mail/mailbox-connection", () => ({
  getMailboxConnection: async (id: string) => connections.get(id) ?? null,
  saveMailboxConnection: async (c: { userId: string; email: string; username: string; imap: { host: string }; smtp: { host: string } }) => void connections.set(c.userId, c),
  deleteMailboxConnection: async (id: string) => void connections.delete(id),
  sealMailboxPassword: (pw: string) => `verzegeld(${pw.length})`,
}));
vi.mock("@/lib/security/sealed-secret", () => ({
  sealSecret: (pw: string) => `verzegeld:${Buffer.from(pw).toString("base64")}`,
  openSecret: (s: string) => Buffer.from(s.replace("verzegeld:", ""), "base64").toString(),
}));
const alertOwner = vi.fn().mockResolvedValue("sent");
vi.mock("@/lib/ops/alert", () => ({ alertOwner: (...a: unknown[]) => alertOwner(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
const host = { live: false, boxes: [] as { localPart: string }[], create: vi.fn() };
vi.mock("@/lib/mail/hosting/transip", () => ({
  transipConfigured: () => host.live,
  listMailboxes: async () => host.boxes,
  listMailForwards: async () => [],
  createMailbox: (...a: unknown[]) => host.create(...a),
}));

import { _resetZfMailCache, adminAction, checkAddress, createAccount } from "@/lib/mail/zf-accounts";

const jan = { userId: "u1", email: "jan@bakkerij.nl", fullName: "Jan de Vries", tenantId: "t1" };
const input = { localPart: "jan.devries", displayName: "Jan de Vries", password: "paars-Fiets-73-boom", acceptTerms: true as const };

beforeEach(() => {
  store.clear();
  connections.clear();
  alertOwner.mockClear();
  host.live = false;
  host.boxes = [];
  host.create = vi.fn().mockResolvedValue(undefined);
  _resetZfMailCache();
});

describe("eigen adres zonder TransIP-sleutel", () => {
  it("reserveert het adres met een verzegeld wachtwoord en meldt het de eigenaar", async () => {
    const a = await createAccount(jan, input);
    expect(a).toMatchObject({ address: "jan.devries@zekerflex.com", status: "aangevraagd", recoveryEmail: "jan@bakkerij.nl" });
    expect(a.pendingPasswordSealed).toMatch(/^verzegeld:/);
    expect(a.pendingPasswordSealed).not.toContain(input.password);
    expect(connections.size).toBe(0);
    expect(alertOwner).toHaveBeenCalledOnce();
    expect(await checkAddress("Jan.DeVries")).toMatchObject({ available: false, reason: "Dit adres is al in gebruik." });
  });

  it("geeft een adres nooit twee keer uit, en één adres per persoon", async () => {
    await createAccount(jan, input);
    await expect(createAccount({ ...jan, userId: "u2", email: "x@y.nl" }, input)).rejects.toMatchObject({ status: 422 });
    await expect(createAccount(jan, { ...input, localPart: "jan.vries" })).rejects.toMatchObject({ status: 409 });
  });

  it("weigert gereserveerde namen en zwakke wachtwoorden", async () => {
    await expect(createAccount(jan, { ...input, localPart: "info" })).rejects.toThrow(/gereserveerd/);
    await expect(createAccount(jan, { ...input, password: "welkom12345" })).rejects.toThrow(/raden/);
    await expect(createAccount(jan, { ...input, displayName: "ZekerFlex Support" })).rejects.toThrow(/ZekerFlex zelf/);
  });

  it("stuurt geen melding voor testadressen", async () => {
    await createAccount({ ...jan, email: "zf-test@zekerflex.test" }, input);
    expect(alertOwner).not.toHaveBeenCalled();
  });
});

describe("eigen adres met TransIP-sleutel", () => {
  it("maakt de mailbox meteen en koppelt hem aan de mailpagina", async () => {
    host.live = true;
    const a = await createAccount(jan, input);
    expect(host.create).toHaveBeenCalledWith("zekerflex.com", { localPart: "jan.devries", password: input.password, maxDiskUsage: 2048 });
    expect(a.status).toBe("actief");
    expect(a.pendingPasswordSealed).toBeUndefined();
    expect(connections.get("u1")).toMatchObject({ email: "jan.devries@zekerflex.com", username: "jan.devries@zekerflex.com", imap: { host: "imap.transip.email" }, smtp: { host: "smtp.transip.email" } });
  });

  it("laat het adres weer vrij als TransIP het aanmaken weigert", async () => {
    host.live = true;
    host.create = vi.fn().mockRejectedValue(new Error("TransIP: fout 500"));
    await expect(createAccount(jan, input)).rejects.toThrow(/500/);
    expect(await checkAddress("jan.devries")).toMatchObject({ available: true });
    expect(connections.size).toBe(0);
  });

  it("ziet adressen die al bij TransIP bestaan (zoals info@ van de eigenaar) als bezet", async () => {
    host.live = true;
    host.boxes = [{ localPart: "Briando" }];
    expect(await checkAddress("briando")).toMatchObject({ available: false });
  });
});

describe("beheer", () => {
  const admin = { userId: "a1", name: "Beheer" };

  it("activeert een gereserveerd adres pas als de sleutel er is, met het bewaarde wachtwoord", async () => {
    await createAccount(jan, input);
    await expect(adminAction({ action: "activeer", address: "jan.devries@zekerflex.com" }, admin)).rejects.toThrow(/TransIP-sleutel/);
    host.live = true;
    const a = await adminAction({ action: "activeer", address: "jan.devries@zekerflex.com" }, admin);
    expect(host.create).toHaveBeenCalledWith("zekerflex.com", { localPart: "jan.devries", password: input.password, maxDiskUsage: 2048 });
    expect(a.status).toBe("actief");
    expect(a.pendingPasswordSealed).toBeUndefined();
    expect(connections.get("u1")?.email).toBe("jan.devries@zekerflex.com");
  });

  it("blokkeren haalt het adres uit de mailpagina, deblokkeren zet het terug", async () => {
    host.live = true;
    await createAccount(jan, input);
    expect((await adminAction({ action: "blokkeer", address: "jan.devries@zekerflex.com" }, admin)).status).toBe("geblokkeerd");
    expect(connections.has("u1")).toBe(false);
    expect((await adminAction({ action: "deblokkeer", address: "jan.devries@zekerflex.com" }, admin)).status).toBe("actief");
  });
});
