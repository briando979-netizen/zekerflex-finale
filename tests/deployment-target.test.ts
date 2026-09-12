import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deploymentTarget,
  isDemoDeployment,
  deploymentNote,
} from "@/lib/config/deployment";

beforeEach(() => {
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("ZEKERFLEX_TARGET", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("deploymentTarget", () => {
  it("flags Vercel as a demo deployment", () => {
    vi.stubEnv("VERCEL", "1");
    expect(deploymentTarget()).toBe("vercel-demo");
    expect(isDemoDeployment()).toBe(true);
    expect(deploymentNote()).toMatch(/demo/i);
  });

  it("honours an explicit ZEKERFLEX_TARGET override", () => {
    vi.stubEnv("ZEKERFLEX_TARGET", "sovereign-box");
    expect(deploymentTarget()).toBe("sovereign-box");
    expect(isDemoDeployment()).toBe(false);
  });

  it("treats a plain production Node process as the Sovereign Box", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(deploymentTarget()).toBe("sovereign-box");
  });

  it("is 'unknown' outside production with no signal", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(deploymentTarget()).toBe("unknown");
    expect(isDemoDeployment()).toBe(false);
  });

  it("prefers the Vercel signal over NODE_ENV=production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "true");
    expect(deploymentTarget()).toBe("vercel-demo");
  });
});
