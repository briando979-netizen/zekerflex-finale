import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "unit-test-secret-0123456789abcdefghijkl" } }));

const lookup = vi.fn();
vi.mock("node:dns/promises", () => ({ lookup: (...a: unknown[]) => lookup(...a) }));

import { openSecret, sealSecret } from "@/lib/security/sealed-secret";
import { isPrivateAddress, resolvePublicHost } from "@/lib/security/public-host";
import { buildPlainMessage } from "@/lib/mail/compose";

describe("sealed secrets", () => {
  it("round-trips, with a fresh IV every time", () => {
    const a = sealSecret("app-wachtwoord-123", "mailbox-password");
    const b = sealSecret("app-wachtwoord-123", "mailbox-password");
    expect(a).not.toBe(b);
    expect(a).not.toContain("app-wachtwoord");
    expect(openSecret(a, "mailbox-password")).toBe("app-wachtwoord-123");
  });

  it("refuses a tampered ciphertext or one sealed for another purpose", () => {
    const sealed = sealSecret("geheim", "mailbox-password");
    const parts = sealed.split(".");
    const body = parts[3]!;
    parts[3] = (body[0] === "A" ? "B" : "A") + body.slice(1);
    expect(() => openSecret(parts.join("."), "mailbox-password")).toThrow();
    expect(() => openSecret(sealed, "webhook-secret")).toThrow();
  });
});

describe("public host guard", () => {
  it("classifies private, loopback, link-local and metadata ranges", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fd00::5", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    for (const ip of ["86.105.244.2", "8.8.8.8", "172.32.0.1", "2a00:1450:4001:80b::200e"]) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });

  it("rejects local names and private literals without asking DNS", async () => {
    await expect(resolvePublicHost("localhost")).rejects.toThrow(/geen geldige servernaam/);
    await expect(resolvePublicHost("mail.internal")).rejects.toThrow();
    await expect(resolvePublicHost("10.0.0.5")).rejects.toThrow(/openbaar/);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects a public-looking name that resolves to a private address", async () => {
    lookup.mockResolvedValueOnce([{ address: "86.105.244.2" }, { address: "192.168.0.7" }]);
    await expect(resolvePublicHost("imap.evil.example")).rejects.toThrow(/openbaar/);
  });

  it("returns a vetted address to connect to", async () => {
    lookup.mockResolvedValueOnce([{ address: "86.105.244.2" }]);
    await expect(resolvePublicHost("imap.transip.email")).resolves.toBe("86.105.244.2");
  });
});

describe("buildPlainMessage", () => {
  const decodeBody = (raw: string) => Buffer.from(raw.split("\r\n\r\n")[1]!.replace(/\r\n/g, ""), "base64").toString("utf8");

  it("keeps user input on one header line (no header injection)", () => {
    const { raw } = buildPlainMessage({
      fromAddress: "planning@bakkerijbol.nl",
      fromName: "Bol\r\nBcc: victim@example.com",
      to: "jan@example.nl",
      subject: "Rooster\r\nBcc: victim@example.com",
      text: "Hoi Jan,\n\nTot morgen!",
    });
    const headers = raw.split("\r\n\r\n")[0]!.split("\r\n");
    expect(headers.some((h) => h.startsWith("Bcc:"))).toBe(false);
    expect(decodeBody(raw)).toBe("Hoi Jan,\n\nTot morgen!");
  });

  it("encodes a non-ASCII sender name without quotes (RFC 2047) and threads replies", () => {
    const { raw, messageId } = buildPlainMessage({
      fromAddress: "info@cafe.nl",
      fromName: "Café de Hoek",
      to: "klant@example.nl",
      subject: "Re: Bestelling",
      text: "Prima!",
      inReplyTo: "abc123@mail.example.nl",
    });
    expect(raw).toContain(`From: =?UTF-8?B?${Buffer.from("Café de Hoek").toString("base64")}?= <info@cafe.nl>`);
    expect(raw).toContain("In-Reply-To: <abc123@mail.example.nl>");
    expect(messageId.endsWith("@cafe.nl")).toBe(true);
  });

  it("refuses an address that could smuggle extra recipients", () => {
    expect(() =>
      buildPlainMessage({ fromAddress: "a@b.nl", to: "x@y.nl, z@q.nl", subject: "s", text: "t" }),
    ).toThrow();
  });
});
