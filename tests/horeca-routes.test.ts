import { describe, expect, it } from "vitest";
import { isPublicApiRoute } from "@/lib/auth/public-routes";

describe("horeca-routes", () => {
  it("bestellen via de QR-code en volgen zijn openbaar", () => {
    expect(isPublicApiRoute("/api/horeca/site/cafe-de-brug/bestellen")).toBe(true);
    expect(isPublicApiRoute("/api/horeca/site/cafe-de-brug/bestelling")).toBe(true);
    expect(isPublicApiRoute("/api/horeca/site/cafe-de-brug/oproep")).toBe(true);
  });

  it("schermen en koppelen zijn openbaar (eigen cookie, code)", () => {
    expect(isPublicApiRoute("/api/horeca/scherm")).toBe(true);
    expect(isPublicApiRoute("/api/horeca/scherm/koppel")).toBe(true);
  });

  it("het beheer blijft achter de login", () => {
    expect(isPublicApiRoute("/api/horeca/beheer")).toBe(false);
  });
});
