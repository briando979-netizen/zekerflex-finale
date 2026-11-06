import { describe, expect, it, vi } from "vitest";

// Reparaties uit de beveiligingsreview van 6 nov 2026: SSRF-filter voor IPv6-vormen
// die een IPv4-adres verbergen, HTML-escaping voor interne mails, het interne
// geheim alleen via een kop en in constante tijd, en sleutelrotatie voor
// verzegelde geheimen.

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-geheim-voor-verzegelde-geheimen-0123456789abcdef";
  process.env.INTERNAL_CRON_TOKEN = "intern-geheim-0123456789abcdef";
});

import { isPrivateAddress } from "@/lib/security/public-host";
import { escapeHtml } from "@/lib/mail";
import { checkInternalToken } from "@/lib/internal-auth";

describe("SSRF-filter: privéadressen", () => {
  it("gewone IPv4- en IPv6-privéadressen", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fe80::1", "fd00::1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "37.97.226.24", "2a01:7c8:fffd:26f::1"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("IPv6-vormen die een privé-IPv4 verbergen worden ook geweigerd", () => {
    for (const ip of ["::ffff:127.0.0.1", "::ffff:7f00:1", "::FFFF:7F00:1", "::7f00:1", "0:0:0:0:0:ffff:7f00:1", "64:ff9b::7f00:1", "64:ff9b::127.0.0.1", "2002:7f00:1::", "2002:c0a8:101::", "2001:0:abcd::1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    // een openbaar IPv4-adres in zo'n vorm blijft openbaar
    for (const ip of ["::ffff:808:808", "64:ff9b::808:808", "2002:808:808::"]) expect(isPrivateAddress(ip), ip).toBe(false);
    // onleesbare vormen vallen terug op de gewone IPv6-controle, zonder fout
    expect(isPrivateAddress("::ffff:zzzz:1")).toBe(false);
    expect(isPrivateAddress("1::2::3")).toBe(false);
  });
});

describe("HTML in mails", () => {
  it("escapeHtml maakt elke bezoekerswaarde onschadelijk", () => {
    expect(escapeHtml('<a href="https://phish">Klik</a> & \'q\'')).toBe("&lt;a href=&quot;https://phish&quot;&gt;Klik&lt;/a&gt; &amp; &#39;q&#39;");
    expect(escapeHtml("Bakkerij Jansen")).toBe("Bakkerij Jansen");
  });
});

describe("intern geheim", () => {
  const vraag = (headers: Record<string, string>, url = "http://app:3000/api/internal/x") => new Request(url, { headers });
  it("alleen via een kop, niet via ?token= in de adresregel", () => {
    expect(checkInternalToken(vraag({ "x-internal-token": "intern-geheim-0123456789abcdef" })).ok).toBe(true);
    expect(checkInternalToken(vraag({ authorization: "Bearer intern-geheim-0123456789abcdef" })).ok).toBe(true);
    expect(checkInternalToken(vraag({}, "http://app:3000/api/internal/x?token=intern-geheim-0123456789abcdef")).ok).toBe(false);
    expect(checkInternalToken(vraag({ "x-internal-token": "intern-geheim-0123456789abcdeX" })).ok).toBe(false);
    expect(checkInternalToken(vraag({ "x-internal-token": "kort" })).ok).toBe(false);
  });
});

describe("verzegelde geheimen: sleutelrotatie", () => {
  it("een geheim dat met de vorige AUTH_SECRET is verzegeld, gaat nog open", async () => {
    vi.resetModules();
    process.env.AUTH_SECRET = "oude-sleutel-oude-sleutel-oude-sleutel-0001";
    delete process.env.AUTH_SECRET_PREVIOUS;
    const oud = await import("@/lib/security/sealed-secret");
    const verzegeld = oud.sealSecret("wachtwoord-123", "proef");
    expect(oud.openSecret(verzegeld, "proef")).toBe("wachtwoord-123");

    vi.resetModules();
    process.env.AUTH_SECRET = "nieuwe-sleutel-nieuwe-sleutel-nieuwe-0002";
    process.env.AUTH_SECRET_PREVIOUS = "oude-sleutel-oude-sleutel-oude-sleutel-0001";
    const nieuw = await import("@/lib/security/sealed-secret");
    expect(nieuw.openSecret(verzegeld, "proef")).toBe("wachtwoord-123");
    expect(nieuw.openSecret(nieuw.sealSecret("nieuw", "proef"), "proef")).toBe("nieuw");
    // een ander doel of een onbekende sleutel: dicht
    expect(() => nieuw.openSecret(verzegeld, "ander-doel")).toThrow();
    vi.resetModules();
    process.env.AUTH_SECRET = "weer-andere-sleutel-weer-andere-sleutel-03";
    delete process.env.AUTH_SECRET_PREVIOUS;
    const vreemd = await import("@/lib/security/sealed-secret");
    expect(() => vreemd.openSecret(verzegeld, "proef")).toThrow();
  });
});
