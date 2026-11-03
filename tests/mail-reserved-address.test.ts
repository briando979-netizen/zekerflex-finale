import { describe, expect, it } from "vitest";
import { isReservedTestAddress } from "@/lib/mail";

// Adressen op domeinen die voor tests en documentatie gereserveerd zijn (RFC 2606/6761)
// komen nooit aan. sendMail bewaart ze alleen in de eigen mailbox, zodat ze niet
// terugkaatsen bij de mailserver en een test nooit een echte inbox bereikt.

describe("gereserveerde testadressen", () => {
  it("herkent .test, .example, .invalid en localhost", () => {
    for (const a of ["klant@zekerflex-test.test", "Jan@devries.TEST", "x@sub.bedrijf.example", "a@b.invalid", "root@localhost", "u@host.localhost"]) {
      expect(isReservedTestAddress(a)).toBe(true);
    }
  });

  it("laat echte adressen gewoon door", () => {
    for (const a of ["info@bakkerij.nl", "jan@testbedrijf.nl", "piet@example.com", "a@test.nl", "invalid@gmail.com", "x@mytest.com"]) {
      expect(isReservedTestAddress(a)).toBe(false);
    }
  });
});
