import { describe, expect, it } from "vitest";
import { assertDemoSeedAllowed, demoSeedPassword } from "@/prisma/seed-guard";

describe("production seed guard", () => {
  it("allows the local demo seed in development", () => {
    expect(demoSeedPassword({ NODE_ENV: "development" })).toBe("Zeker!2026");
  });

  it("blocks production by default", () => {
    expect(() => assertDemoSeedAllowed({ NODE_ENV: "production" })).toThrow(
      "Demo seeding is disabled in production",
    );
  });

  it("rejects the published demo password even with the override", () => {
    expect(() => demoSeedPassword({
      NODE_ENV: "production",
      ALLOW_DEMO_SEED: "true",
      DEMO_SEED_PASSWORD: "Zeker!2026",
    })).toThrow("non-default DEMO_SEED_PASSWORD");
  });

  it("requires both production controls", () => {
    expect(demoSeedPassword({
      NODE_ENV: "production",
      ALLOW_DEMO_SEED: "true",
      DEMO_SEED_PASSWORD: "unique-production-acceptance-secret",
    })).toBe("unique-production-acceptance-secret");
  });
});
