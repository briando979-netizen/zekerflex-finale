import { describe, expect, it } from "vitest";
import { ROMMEL_DOMEINEN, isRommelAdres } from "@/lib/sales/discovery/rommel-adres";

// 17 nov 2026: de careers-crawl van een logistiekbedrijf gaf de sleutel van een foutenmelder
// (…@o1308802.ingest.sentry.io) als "emailFound". De oude regex keek alleen naar het eerste label (@sentry.).

describe("rommel-adres: wat is nooit het adres van het bedrijf", () => {
  it("een Sentry-sleutel, op elk subdomein van sentry.io", () => {
    expect(isRommelAdres("0123456789abcdef0123456789abcdef@o1308802.ingest.sentry.io")).toBe(true);
    expect(isRommelAdres("abc@ingest.us.sentry.io")).toBe(true);
    expect(isRommelAdres("abc@sentry.io")).toBe(true);
    // de 32-tekens-sleutel is ook zonder sentry in het domein geen adres
    expect(isRommelAdres("0123456789abcdef0123456789abcdef@o1.ingest.foutenmelder.test")).toBe(true);
  });

  it("webbouwers, platforms en voorbeeldadressen", () => {
    expect(isRommelAdres("webmaster@wixpress.com")).toBe(true);
    expect(isRommelAdres("x@static.parastorage.wixpress.com")).toBe(true);
    expect(isRommelAdres("support@godaddy.com")).toBe(true);
    expect(isRommelAdres("info@example.com")).toBe(true);
    expect(isRommelAdres("naam@domain.com")).toBe(true);
    expect(isRommelAdres("naam@email.com")).toBe(true);
  });

  it("bestandsnamen en onzin", () => {
    expect(isRommelAdres("logo@2x.png")).toBe(true);
    expect(isRommelAdres("app@1.2.3.js")).toBe(true);
    expect(isRommelAdres("geen-apenstaartje")).toBe(true);
    expect(isRommelAdres("a@b")).toBe(true);
  });

  it("een gewoon bedrijfsadres blijft staan", () => {
    expect(isRommelAdres("personeel@logistiek.test")).toBe(false);
    expect(isRommelAdres("Info@Acme.nl")).toBe(false);
    expect(isRommelAdres("jan.de.vries@bakkerij-acme.co.uk")).toBe(false);
    // een bedrijf dat toevallig 'sentry' of 'wix' in zijn naam heeft, maar op een eigen domein zit
    expect(isRommelAdres("info@sentrybeveiliging.nl")).toBe(false);
    expect(isRommelAdres("info@wixbouw.nl")).toBe(false);
  });

  it("de lijst is klein, zonder www en zonder subdomeinen", () => {
    for (const d of ROMMEL_DOMEINEN) {
      expect(d).toMatch(/^[a-z0-9-]+\.[a-z]+$/);
    }
  });
});
