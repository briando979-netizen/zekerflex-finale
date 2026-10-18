import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ keys: new Map<string, Record<string, unknown>>() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `k${db.keys.size + 1}`;
        db.keys.set(id, { id, revokedAt: null, ...data });
        return { id, prefix: data.prefix };
      },
      findUnique: async ({ where }: { where: { id?: string; prefix?: string } }) =>
        [...db.keys.values()].find((k) => (where.id ? k.id === where.id : k.prefix === where.prefix)) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(db.keys.get(where.id)!, data),
    },
  },
}));

import { createApiKey, rotateApiKey, verifyApiKey } from "@/lib/integrations/api-keys";

beforeEach(() => db.keys.clear());

describe("API key rotation", () => {
  it("issues a new key and keeps the old one valid during the grace period", async () => {
    const old = await createApiKey({ name: "Boekhouding", tenantId: "t1", scopes: ["invoices:read"], createdById: "u1" });
    const fresh = await rotateApiKey(old.id, "u1", 24);
    expect(await verifyApiKey(old.raw)).not.toBeNull();
    expect(await verifyApiKey(fresh.raw)).toMatchObject({ tenantId: "t1", scopes: ["invoices:read"] });
    db.keys.get(old.id)!.revokedAt = new Date(Date.now() - 1000);
    expect(await verifyApiKey(old.raw)).toBeNull();
  });

  it("grace 0 cuts the old key off immediately", async () => {
    const old = await createApiKey({ name: "x", tenantId: "t1", scopes: [], createdById: "u1" });
    await rotateApiKey(old.id, "u1", 0);
    await new Promise((r) => setTimeout(r, 5));
    expect(await verifyApiKey(old.raw)).toBeNull();
    expect(createHash("sha256").update(old.raw).digest("hex")).toBe(db.keys.get(old.id)!.hashedKey);
  });
});
