import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { ERASABLE_KV_PREFIXES, erasableKvWhere, isSecretField, keyBelongsTo, redactSecrets } from "@/lib/privacy/user-kv";

describe("isSecretField", () => {
  it("herkent geheimen in camelCase, snake_case en samengestelde namen", () => {
    for (const name of ["password", "smtpPassword", "access_token", "apiKey", "privateKey", "bsnHash", "totpSecret", "sealedPassword", "pin"]) {
      expect(isSecretField(name), name).toBe(true);
    }
  });

  it("laat gewone velden staan", () => {
    for (const name of ["passport", "footprint", "pinned", "signature", "km", "excluded", "title", "hashtag", "keyboard"]) {
      expect(isSecretField(name), name).toBe(false);
    }
  });
});

describe("redactSecrets", () => {
  it("schermt geheimen af op elke diepte, ook in lijsten", () => {
    expect(
      redactSecrets({ name: "Jan", imap: { host: "mail.nl", password: "x" }, keys: [{ label: "laptop", token: "zfj_1" }] }),
    ).toEqual({ name: "Jan", imap: { host: "mail.nl", password: "[afgeschermd]" }, keys: [{ label: "laptop", token: "[afgeschermd]" }] });
    expect(redactSecrets("tekst")).toBe("tekst");
    expect(redactSecrets(null)).toBeNull();
  });
});

describe("keyBelongsTo", () => {
  it("telt alleen de userId als los segment", () => {
    expect(keyBelongsTo("ritten:u1", "u1")).toBe(true);
    expect(keyBelongsTo("agenda:u1:abc", "u1")).toBe(true);
    expect(keyBelongsTo("agenda:u12:abc", "u1")).toBe(false);
    expect(keyBelongsTo("xu1", "u1")).toBe(false);
  });
});

describe("erasableKvWhere", () => {
  it("wist precies de sleutel of sleutel + ':' per prefix, niets anders", () => {
    const where = erasableKvWhere("u1");
    expect(where.OR).toHaveLength(ERASABLE_KV_PREFIXES.length * 2);
    expect(where.OR).toContainEqual({ key: { equals: "ritten-eigen:u1" } });
    expect(where.OR).toContainEqual({ key: { startsWith: "wa-chat:u1:" } });
    // geen kale prefix: "agenda:u1" mag "agenda:u12" niet raken
    expect(where.OR).not.toContainEqual({ key: { startsWith: "agenda:u1" } });
  });

  it("bevat geen sleutels met een wettelijke bewaarplicht", () => {
    for (const kept of ["fiscal:", "uitzend-contracts:", "factoring-terms:", "advance-request:", "bank-tax:", "bank-login:", "ref-code-of:"]) {
      expect(ERASABLE_KV_PREFIXES as readonly string[]).not.toContain(kept);
    }
  });
});
