const DEVELOPMENT_DEMO_PASSWORD = "Zeker!2026";

type SeedEnvironment = Partial<
  Pick<NodeJS.ProcessEnv, "NODE_ENV" | "ALLOW_DEMO_SEED" | "DEMO_SEED_PASSWORD">
>;

/**
 * Keep demo identities out of production by default. The override is intended
 * only for a deliberate, temporary acceptance environment: it requires both
 * an explicit flag and a non-default password.
 */
export function assertDemoSeedAllowed(env: SeedEnvironment): void {
  if (env.NODE_ENV !== "production") return;
  if (env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Demo seeding is disabled in production");
  }
  if (!env.DEMO_SEED_PASSWORD || env.DEMO_SEED_PASSWORD === DEVELOPMENT_DEMO_PASSWORD) {
    throw new Error("Production demo seeding requires a non-default DEMO_SEED_PASSWORD");
  }
}

export function demoSeedPassword(env: SeedEnvironment): string {
  assertDemoSeedAllowed(env);
  return env.DEMO_SEED_PASSWORD || DEVELOPMENT_DEMO_PASSWORD;
}
