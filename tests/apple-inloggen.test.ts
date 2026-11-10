import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  APPLE_AUD,
  APPLE_GEHEIM_GELDIG_S,
  appleClientSecret,
  appleConfig,
  appleMailBevestigd,
  appleNaam,
  huidigAppleGeheim,
  isAppleRelay,
} from "@/lib/auth/apple";

// Inloggen met Apple (lib/auth/apple.ts): de config uit de omgeving, het client secret
// (een ES256-JWT die wij zelf tekenen) en de hulpjes voor de signIn-tak in nextauth.ts.
// Een testsleutel, nooit de echte.
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const OMGEVING = {
  APPLE_SIWA_SERVICES_ID: "com.zekerflex.web",
  APPLE_TEAM_ID: "SZ985SQP65",
  APPLE_SIWA_KEY_ID: "KEY1234567",
  APPLE_SIWA_KEY_P8: PEM,
} as unknown as NodeJS.ProcessEnv;
const met = (extra: Record<string, string>) => ({ ...OMGEVING, ...extra }) as unknown as NodeJS.ProcessEnv;
const zonder = (sleutel: string) => {
  const o: Record<string, unknown> = { ...OMGEVING };
  delete o[sleutel];
  return o as unknown as NodeJS.ProcessEnv;
};
const delen = (jwt: string) => {
  const [kop, inhoud, handtekening] = jwt.split(".");
  return {
    kop: JSON.parse(Buffer.from(kop!, "base64url").toString()),
    inhoud: JSON.parse(Buffer.from(inhoud!, "base64url").toString()),
    ok: verify("sha256", Buffer.from(`${kop}.${inhoud}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(handtekening!, "base64url")),
  };
};

describe("appleConfig: Apple staat uit tot alles er is", () => {
  it("zonder omgeving: uit", () => {
    expect(appleConfig({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("één ontbrekende sleutel is genoeg om uit te blijven", () => {
    for (const k of Object.keys(OMGEVING)) expect(appleConfig(zonder(k))).toBeNull();
  });

  it("een onleesbare sleutel of een verkeerde Key ID: uit, zonder te gooien", () => {
    expect(appleConfig(met({ APPLE_SIWA_KEY_P8: "geen sleutel" }))).toBeNull();
    expect(appleConfig(met({ APPLE_SIWA_KEY_P8: "-----BEGIN PRIVATE KEY-----\nrommel\n-----END PRIVATE KEY-----" }))).toBeNull();
    expect(appleConfig(met({ APPLE_SIWA_KEY_ID: "kort" }))).toBeNull();
  });

  it("compleet: aan, ook met de .p8 als base64", () => {
    expect(appleConfig(OMGEVING)).toMatchObject({ servicesId: "com.zekerflex.web", teamId: "SZ985SQP65", keyId: "KEY1234567" });
    expect(appleConfig(met({ APPLE_SIWA_KEY_P8: Buffer.from(PEM).toString("base64") }))?.servicesId).toBe("com.zekerflex.web");
  });
});

describe("appleClientSecret", () => {
  const c = appleConfig(OMGEVING)!;

  it("is een ES256-JWT met de claims die Apple eist, te controleren met de publieke sleutel", () => {
    const { kop, inhoud, ok } = delen(appleClientSecret(c, new Date("2026-11-10T12:00:00Z")));
    expect(kop).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(inhoud).toEqual({
      iss: "SZ985SQP65",
      sub: "com.zekerflex.web",
      aud: APPLE_AUD,
      iat: 1794312000,
      exp: 1794312000 + APPLE_GEHEIM_GELDIG_S,
    });
    expect(APPLE_AUD).toBe("https://appleid.apple.com");
    expect(ok).toBe(true);
  });

  it("geldt nooit langer dan 180 dagen (Apple: hooguit 6 maanden)", () => {
    const { inhoud } = delen(appleClientSecret(c));
    expect(inhoud.exp - inhoud.iat).toBeLessThanOrEqual(180 * 24 * 3600);
    expect(inhoud.exp - inhoud.iat).toBeGreaterThan(24 * 3600);
  });

  it("hetzelfde geheim binnen een dag, daarna een nieuw (een server die lang draait raakt het nooit kwijt)", () => {
    const t0 = Date.parse("2026-11-10T12:00:00Z");
    const eerste = huidigAppleGeheim(c, t0);
    expect(huidigAppleGeheim(c, t0 + 23 * 3600 * 1000)).toBe(eerste);
    const later = huidigAppleGeheim(c, t0 + 25 * 3600 * 1000);
    expect(later).not.toBe(eerste);
    expect(delen(later).inhoud.iat).toBe(Math.floor((t0 + 25 * 3600 * 1000) / 1000));
  });
});

describe("hulpjes voor de signIn-tak", () => {
  it("email_verified: boolean of tekst", () => {
    expect(appleMailBevestigd(true)).toBe(true);
    expect(appleMailBevestigd("true")).toBe(true);
    expect(appleMailBevestigd(false)).toBe(false);
    expect(appleMailBevestigd("false")).toBe(false);
    expect(appleMailBevestigd(undefined)).toBeNull();
  });

  it("herkent een privé-adres van Apple", () => {
    expect(isAppleRelay("x7k2abc@privaterelay.appleid.com")).toBe(true);
    expect(isAppleRelay("X7K2ABC@PrivateRelay.AppleID.com ")).toBe(true);
    expect(isAppleRelay("jan@icloud.com")).toBe(false);
    expect(isAppleRelay("privaterelay.appleid.com@evil.test")).toBe(false);
  });

  it("de naam komt alleen mee als Apple hem stuurt", () => {
    expect(appleNaam({ name: { firstName: "Nina", lastName: "de Vries" } })).toBe("Nina de Vries");
    expect(appleNaam({ name: { firstName: " Nina ", lastName: "" } })).toBe("Nina");
    expect(appleNaam({ name: {} })).toBeNull();
    expect(appleNaam(undefined)).toBeNull();
    expect(appleNaam({ email: "x@y.test" })).toBeNull();
  });
});
