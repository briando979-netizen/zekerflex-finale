import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/kv", () => ({ kvGet: vi.fn(), kvListEntries: vi.fn(), kvSet: vi.fn() }));

import { bsnCijfers, hashBsn, validBsn } from "@/lib/fiscal/store";

// Verzonnen nummers die de elfproef halen (geen echte personen).
describe("BSN: elfproef en 8 cijfers (13 nov)", () => {
  it("een geldig BSN van 9 cijfers, ook met spaties of punten", () => {
    expect(validBsn("123456782")).toBe(true);
    expect(validBsn("1234.56.782")).toBe(true);
    expect(validBsn(" 123 456 782 ")).toBe(true);
  });

  it("een tikfout of twee omgedraaide cijfers valt door de proef", () => {
    expect(validBsn("123456783")).toBe(false);
    expect(validBsn("123456872")).toBe(false);
    expect(validBsn("213456782")).toBe(false);
  });

  it("een oud BSN van 8 cijfers krijgt de 0 ervoor en telt dan mee", () => {
    expect(bsnCijfers("12345672")).toBe("012345672");
    expect(validBsn("12345672")).toBe(true);
    expect(validBsn("012345672")).toBe(true);
    expect(hashBsn("12345672")).toEqual(hashBsn("012345672"));
    expect(hashBsn("12345672").last4).toBe("5672");
  });

  it("te kort, te lang of alleen nullen telt niet", () => {
    expect(validBsn("1234567")).toBe(false);
    expect(validBsn("1234567820")).toBe(false);
    expect(validBsn("00000000")).toBe(false);
    expect(validBsn("000000000")).toBe(false);
    expect(validBsn("")).toBe(false);
  });

  it("een al bewaarde hash van 9 cijfers blijft gelijk", () => {
    expect(hashBsn("123456782").hash).toBe(hashBsn("123 456 782").hash);
    expect(bsnCijfers("123456782")).toBe("123456782");
  });
});
