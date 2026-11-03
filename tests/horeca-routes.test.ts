import { describe, expect, it } from "vitest";
import { isPublicApiRoute } from "@/lib/auth/public-routes";

describe("horeca-routes", () => {
  it("bestellen via de QR-code en volgen zijn openbaar", () => {
    expect(isPublicApiRoute("/api/horeca/site/cafe-de-brug/bestellen")).toBe(true);
    expect(isPublicApiRoute("/api/horeca/site/cafe-de-brug/bestelling")).toBe(true);
  });

  it("het beheer blijft achter de login", () => {
    expect(isPublicApiRoute("/api/horeca/beheer")).toBe(false);
  });
});
