import { createHash, createPublicKey, createSign, createVerify, generateKeyPairSync, randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// "Inloggen met ZekerFlex": ZekerFlex als OpenID Connect-aanbieder, zodat eigen
// diensten op de server (de kennisbank Outline, later meer) de ZekerFlex-
// accounts gebruiken in plaats van een eigen wachtwoord. Dit bestand is het
// pure deel: sleutels maken, id-tokens tekenen (RS256) en controleren, PKCE.
// Opslag en de endpoints staan in lib/oidc/aanbieder.ts en app/api/oidc.
// ---------------------------------------------------------------------------

export interface Sleutelpaar {
  kid: string;
  /** PKCS#8 PEM, alleen op de server */
  privaat: string;
  /** publieke JWK voor /api/oidc/jwks */
  publiek: { kty: "RSA"; n: string; e: string; kid: string; use: "sig"; alg: "RS256" };
  gemaakt: string;
}

export function maakSleutelpaar(nu = new Date()): Sleutelpaar {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" }) as { kty: string; n: string; e: string };
  const kid = createHash("sha256").update(jwk.n).digest("hex").slice(0, 16);
  return {
    kid,
    privaat: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publiek: { kty: "RSA", n: jwk.n, e: jwk.e, kid, use: "sig", alg: "RS256" },
    gemaakt: nu.toISOString(),
  };
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** Een JWT (RS256) met deze claims, getekend met de privésleutel. */
export function tekenJwt(sleutel: Pick<Sleutelpaar, "kid" | "privaat">, claims: Record<string, unknown>): string {
  const kop = b64(JSON.stringify({ alg: "RS256", typ: "JWT", kid: sleutel.kid }));
  const inhoud = b64(JSON.stringify(claims));
  const handtekening = createSign("RSA-SHA256").update(`${kop}.${inhoud}`).sign(sleutel.privaat, "base64url");
  return `${kop}.${inhoud}.${handtekening}`;
}

/** Controleert handtekening (met de publieke JWK) en vervaltijd; geeft de claims of null. */
export function leesJwt(token: string, publiek: Sleutelpaar["publiek"], nu = Date.now()): Record<string, unknown> | null {
  const [kop, inhoud, handtekening] = token.split(".");
  if (!kop || !inhoud || !handtekening) return null;
  try {
    const h = JSON.parse(Buffer.from(kop, "base64url").toString()) as { alg?: string; kid?: string };
    if (h.alg !== "RS256" || (h.kid && h.kid !== publiek.kid)) return null;
    const sleutel = createPublicKey({ key: { kty: "RSA", n: publiek.n, e: publiek.e }, format: "jwk" });
    if (!createVerify("RSA-SHA256").update(`${kop}.${inhoud}`).verify(sleutel, Buffer.from(handtekening, "base64url"))) return null;
    const claims = JSON.parse(Buffer.from(inhoud, "base64url").toString()) as Record<string, unknown>;
    if (typeof claims.exp === "number" && claims.exp * 1000 <= nu) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Een willekeurig, niet te raden geheim (codes, toegangstokens). */
export const geheim = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");

/** PKCE (S256): klopt de verifier bij de challenge uit het autorisatieverzoek? */
export function pkceKlopt(verifier: string | undefined, challenge: string | undefined, methode: string | undefined): boolean {
  if (!challenge) return true; // geen PKCE gevraagd
  if (!verifier || (methode && methode !== "S256")) return false;
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}

/** Het discovery-document (/.well-known/openid-configuration). */
export function discovery(issuer: string) {
  const basis = issuer.replace(/\/$/, "");
  return {
    issuer: basis,
    authorization_endpoint: `${basis}/api/oidc/authorize`,
    token_endpoint: `${basis}/api/oidc/token`,
    userinfo_endpoint: `${basis}/api/oidc/userinfo`,
    jwks_uri: `${basis}/api/oidc/jwks`,
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    scopes_supported: ["openid", "profile", "email"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    claims_supported: ["sub", "email", "email_verified", "name", "given_name", "family_name", "preferred_username"],
  };
}

/** Voornaam en achternaam uit een volledige naam. */
export function splitsNaam(volledig: string): { voornaam: string; achternaam: string } {
  const delen = volledig.trim().split(/\s+/);
  return { voornaam: delen[0] ?? "", achternaam: delen.slice(1).join(" ") };
}
