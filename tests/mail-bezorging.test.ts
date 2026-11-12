import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bezorgingMislukt } from "@/lib/mail/test-adres";

// Een testadres (.test) gaat bewust nooit naar de mailserver: de mail blijft in de eigen postbus (transport "mailbox").
// Dat is geen mislukte bezorging. 12 nov gaf elke aanmelding met een .test-adres "verificatiemail niet afgeleverd" in
// het foutenlogboek (gezien bij de route van een nieuw bedrijf).

describe("bezorgingMislukt", () => {
  it("alleen als de mailserver het probeerde en het niet lukte", () => {
    expect(bezorgingMislukt({ delivered: false, transport: "smtp" })).toBe(true);
    expect(bezorgingMislukt({ delivered: true, transport: "smtp" })).toBe(false);
    expect(bezorgingMislukt({ delivered: false, transport: "mailbox" })).toBe(false);
    expect(bezorgingMislukt(null)).toBe(false);
    expect(bezorgingMislukt(undefined)).toBe(false);
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
