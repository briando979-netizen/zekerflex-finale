import { describe, expect, it } from "vitest";
import { aantalMet } from "@/lib/tekst/aantal";

describe("aantalMet", () => {
  it("0 en meer dan 1 krijgen het meervoud, precies 1 het enkelvoud", () => {
    expect(aantalMet(0, "taak", "taken")).toBe("0 taken");
    expect(aantalMet(1, "uitvoering", "uitvoeringen")).toBe("1 uitvoering");
    expect(aantalMet(2, "artikel", "artikelen")).toBe("2 artikelen");
  });
});
