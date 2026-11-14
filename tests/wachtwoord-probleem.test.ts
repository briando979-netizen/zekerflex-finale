import { describe, expect, it } from "vitest";
import { wachtwoordProbleem } from "@/lib/auth/password";

// Het gedeelde oordeel over een wachtwoord bij het aanmelden (formulier én /api/register), met een nagemaakte lekdienst.

describe("wachtwoordProbleem", () => {
  const gelekt = async () => true;
  const schoon = async () => false;
  const kapot = async () => {
    throw new Error("pwned offline");
  };

  it("zwak: de reden uit de sterktemeting, zonder de lekdienst te vragen", async () => {
    let gevraagd = false;
    const uit = await wachtwoordProbleem("wachtwoord123", [], async () => {
      gevraagd = true;
      return false;
    });
    expect(uit).toBeTruthy();
    expect(gevraagd).toBe(false);
  });

  it("gelekt: de vaste zin van het formulier", async () => {
    expect(await wachtwoordProbleem("Correct-Paard-Batterij-91!", [], gelekt)).toBe("Dit wachtwoord staat in bekende datalekken. Kies een ander wachtwoord.");
  });

  it("sterk: null, ook als de lekdienst faalt (aanmelden blokkeert nooit op een storing)", async () => {
    expect(await wachtwoordProbleem("Correct-Paard-Batterij-91!", [], schoon)).toBeNull();
    expect(await wachtwoordProbleem("Correct-Paard-Batterij-91!", [], kapot)).toBeNull();
  });

  it("het e-mailadres of de naam als wachtwoord telt als zwak", async () => {
    expect(await wachtwoordProbleem("jan@werker.test", ["jan@werker.test", "Jan Jansen"], schoon)).toBeTruthy();
  });
});
