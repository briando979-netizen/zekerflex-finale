import { describe, expect, it } from "vitest";
import { AUTOMAILS } from "@/lib/rijschool/automail-soorten";
import { beheerActieSchema } from "@/lib/rijschool/schema";

describe("automailer van de rijschool", () => {
  it("elke soort mail is aan en uit te zetten via het beheer", () => {
    for (const m of AUTOMAILS) {
      expect(beheerActieSchema.safeParse({ actie: "automail", id: m.id, aan: false }).success).toBe(true);
    }
    expect(beheerActieSchema.safeParse({ actie: "automail", id: "spam", aan: true }).success).toBe(false);
  });

  it("elke soort heeft een titel en uitleg voor het beheer", () => {
    for (const m of AUTOMAILS) {
      expect(m.titel.length).toBeGreaterThan(3);
      expect(m.uitleg.length).toBeGreaterThan(20);
    }
  });
});
