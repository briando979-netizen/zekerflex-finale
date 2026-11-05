import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { discovery, leesJwt, maakSleutelpaar, pkceKlopt, splitsNaam, tekenJwt } from "@/lib/oidc/jwt";

describe("oidc: sleutels en tokens", () => {
  const s = maakSleutelpaar(new Date("2026-11-05T00:00:00Z"));
  it("maakt een RSA-sleutelpaar met een publieke JWK en een kid", () => {
    expect(s.privaat).toContain("BEGIN PRIVATE KEY");
    expect(s.publiek).toMatchObject({ kty: "RSA", use: "sig", alg: "RS256", kid: s.kid });
    expect(s.publiek.n.length).toBeGreaterThan(300);
  });
  it("een getekend id-token is te controleren met de publieke sleutel, en niet met een andere", () => {
    const nu = Math.floor(Date.now() / 1000);
    const t = tekenJwt(s, { iss: "https://zekerflex.com", sub: "u1", aud: "outline", exp: nu + 60, email: "a@b.nl" });
    expect(leesJwt(t, s.publiek)).toMatchObject({ sub: "u1", aud: "outline", email: "a@b.nl" });
    expect(leesJwt(t, maakSleutelpaar().publiek)).toBeNull();
    expect(leesJwt(`${t}x`, s.publiek)).toBeNull();
    expect(leesJwt(tekenJwt(s, { sub: "u1", exp: nu - 1 }), s.publiek)).toBeNull();
  });
  it("PKCE S256 klopt alleen met de juiste verifier; zonder challenge is er niets te controleren", () => {
    const verifier = "abc-def-123";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(pkceKlopt(verifier, challenge, "S256")).toBe(true);
    expect(pkceKlopt("anders", challenge, "S256")).toBe(false);
    expect(pkceKlopt(verifier, challenge, "plain")).toBe(false);
    expect(pkceKlopt(undefined, "", undefined)).toBe(true);
  });
  it("discovery wijst naar de eigen endpoints", () => {
    const d = discovery("https://zekerflex.com/");
    expect(d.issuer).toBe("https://zekerflex.com");
    expect(d.authorization_endpoint).toBe("https://zekerflex.com/api/oidc/authorize");
    expect(d.jwks_uri).toBe("https://zekerflex.com/api/oidc/jwks");
    expect(d.response_types_supported).toEqual(["code"]);
  });
  it("splitst een naam in voor- en achternaam", () => {
    expect(splitsNaam("Jan van Lummel")).toEqual({ voornaam: "Jan", achternaam: "van Lummel" });
    expect(splitsNaam("Mona")).toEqual({ voornaam: "Mona", achternaam: "" });
  });
});
