import { describe, expect, it } from "vitest";
import { mailProviderFor } from "@/lib/auth/mail-providers";

describe("mailProviderFor (snelknop op /verifieer-email)", () => {
  it("kent Gmail en Outlook, ook met hoofdletters", () => {
    expect(mailProviderFor("jan@gmail.com")?.naam).toBe("Gmail");
    expect(mailProviderFor("Jan@Hotmail.NL")?.naam).toBe("Outlook");
  });
  it("geeft niets voor een onbekend domein of een rare invoer", () => {
    expect(mailProviderFor("jan@bedrijf.nl")).toBeNull();
    expect(mailProviderFor("geenadres")).toBeNull();
    expect(mailProviderFor("jan@constructor")).toBeNull();
    expect(mailProviderFor("")).toBeNull();
  });
});
