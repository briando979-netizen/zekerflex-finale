import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// De app tekent de voorbeeld-link (lib/bouwer/werker.ts), de bouwer-container
// controleert hem (deploy/bouwer/werker/voorbeeld.mjs). Die twee moeten exact
// dezelfde handtekening gebruiken, en een verlopen of vervalste link weigeren.

const TOKEN = "proef-token-van-minstens-24-tekens-lang";

describe("live voorbeeld: getekende link", () => {
  let voorbeeldLink: (now?: number) => string;
  let geldig: (waarde: string) => boolean;

  beforeAll(async () => {
    vi.stubEnv("BOUWER_TOKEN", TOKEN);
    vi.stubEnv("BOUWER_VOORBEELD_HOST", "voorbeeld.test.local");
    vi.resetModules();
    ({ voorbeeldLink } = await import("@/lib/bouwer/werker"));
    // gewone .mjs zonder typen (draait in de bouwer-container)
    const pad = new URL("../deploy/bouwer/werker/voorbeeld.mjs", import.meta.url).href;
    ({ geldig } = (await import(/* @vite-ignore */ pad)) as { geldig: (waarde: string) => boolean });
  }, 120_000);
  afterAll(() => vi.unstubAllEnvs());

  const sleutel = (link: string) => new URL(link).searchParams.get("zf_vb") ?? "";

  it("wijst naar het voorbeeldadres en wordt door de bouwer geaccepteerd", () => {
    const link = voorbeeldLink();
    expect(new URL(link).host).toBe("voorbeeld.test.local");
    expect(geldig(sleutel(link))).toBe(true);
  });

  it("geldt twee uur", () => {
    const now = Date.now();
    const [exp] = sleutel(voorbeeldLink(now)).split(".");
    expect(Number(exp) - now).toBe(2 * 60 * 60_000);
  });

  it("weigert een verlopen of vervalste link", () => {
    expect(geldig(sleutel(voorbeeldLink(Date.now() - 3 * 60 * 60_000)))).toBe(false);
    const [exp, sig] = sleutel(voorbeeldLink()).split(".");
    expect(geldig(`${Number(exp) + 1}.${sig}`)).toBe(false);
    expect(geldig(`${exp}.${sig}x`)).toBe(false);
    expect(geldig("")).toBe(false);
  });
});
