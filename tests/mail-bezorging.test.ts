import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bezorgingMislukt } from "@/lib/mail/test-adres";

// Een testadres (.test) gaat bewust nooit naar de mailserver: de mail blijft in de eigen postbus (transport "mailbox").
// Dat is geen mislukte bezorging. 12 nov gaf elke aanmelding met een .test-adres "verificatiemail niet afgeleverd" in
// het foutenlogboek (gezien bij de route van een nieuw bedrijf).

describe("bezorgingMislukt", () => {
  const ECHT = "iemand@bedrijf.nl";
  const TEST = "ondernemertest-1@zekerflex.test";

  it("een testadres in de eigen postbus is geen fout", () => {
    expect(bezorgingMislukt({ delivered: false, transport: "mailbox" }, TEST)).toBe(false);
  });

  it("een echt adres dat niet bezorgd is, is wél een fout: ook zonder SMTP-instellingen (transport mailbox)", () => {
    expect(bezorgingMislukt({ delivered: false, transport: "mailbox" }, ECHT)).toBe(true);
    expect(bezorgingMislukt({ delivered: false, transport: "smtp" }, ECHT)).toBe(true);
  });

  it("bezorgd, afgemeld of geen resultaat: geen fout", () => {
    expect(bezorgingMislukt({ delivered: true, transport: "smtp" }, ECHT)).toBe(false);
    expect(bezorgingMislukt({ delivered: false, transport: "mailbox", suppressed: "afgemeld voor \"Nieuws\"" }, ECHT)).toBe(false);
    expect(bezorgingMislukt(null, ECHT)).toBe(false);
    expect(bezorgingMislukt(undefined, ECHT)).toBe(false);
  });

  it.each(["app/register/actions.ts", "app/api/register/route.ts", "lib/auth/nextauth.ts", "app/api/werkgever/team/route.ts"])(
    "%s waarschuwt alleen bij een echte mislukking",
    (bestand) => {
      const bron = readFileSync(bestand, "utf8");
      expect(bron).toContain("bezorgingMislukt(");
      expect(bron).not.toMatch(/!\s*\w+\.delivered\)\s*(logger|log)\.warn/);
    },
  );
});
