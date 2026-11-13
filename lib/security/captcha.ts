import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Captcha / human check on sensitive endpoints (register, …). Pluggable:
//   - "pow"       (default, sovereign): a proof-of-work the browser solves — no
//                 external service, no data leaves the box, no tracking.
//   - "turnstile" (Cloudflare) / "hcaptcha": verified server-side if a provider
//                 + secret is configured.
// Off by default so the live signup flow keeps working; the owner turns it on
// with CAPTCHA_PROVIDER (+ secret for the external ones).
// ---------------------------------------------------------------------------

export type CaptchaProvider = "pow" | "turnstile" | "hcaptcha";

export function captchaProvider(): CaptchaProvider | null {
  const p = env.CAPTCHA_PROVIDER;
  return p === "pow" || p === "turnstile" || p === "hcaptcha" ? p : null;
}

export function captchaEnabled(): boolean {
  return captchaProvider() !== null;
}

/* ---------------------------- proof of work ---------------------------- */
// The server issues a signed challenge; the client finds a nonce so that
// sha256(challenge + "." + nonce) starts with powBits() zero bits. Verifying is
// one hash. Signing binds the challenge to a short TTL so it can't be reused.

function powBits(): number {
  const n = Number(env.CAPTCHA_POW_BITS);
  return Number.isFinite(n) && n >= 8 && n <= 24 ? Math.floor(n) : 18;
}
const POW_TTL_MS = 10 * 60_000;

function powSecret(): Buffer {
  return Buffer.from(env.AUTH_SECRET ?? "dev-secret");
}

export function issuePowChallenge(): { challenge: string; bits: number } {
  const ts = Date.now();
  const rand = randomBytes(12).toString("hex");
  const body = `${ts}.${rand}`;
  const sig = createHmac("sha256", powSecret()).update(body).digest("hex").slice(0, 16);
  return { challenge: `${body}.${sig}`, bits: powBits() };
}

function leadingZeroBits(hex: string): number {
  let bits = 0;
  for (const ch of hex) {
    const v = parseInt(ch, 16);
    if (v === 0) {
      bits += 4;
      continue;
    }
    bits += Math.clz32(v) - 28; // zeros in the top nibble
    break;
  }
  return bits;
}

function validChallenge(challenge: string): boolean {
  const parts = challenge.split(".");
  if (parts.length !== 3) return false;
  const [ts, rand, sig] = parts;
  if (Date.now() - Number(ts) > POW_TTL_MS) return false;
  const expected = createHmac("sha256", powSecret()).update(`${ts}.${rand}`).digest("hex").slice(0, 16);
  const a = Buffer.from(sig!);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyPow(token: string | undefined): boolean {
  if (!token) return false;
  const [challenge, nonce] = token.split("#");
  if (!challenge || !nonce || !validChallenge(challenge)) return false;
  const hash = createHash("sha256").update(`${challenge}.${nonce}`).digest("hex");
  return leadingZeroBits(hash) >= powBits();
}

/* --------------------------- external providers --------------------------- */

type RemoteUitslag = { uitslag: "geldig" } | { uitslag: "geweigerd" } | { uitslag: "onbereikbaar"; soort: "time-out" | "netwerk" | "5xx" };

const REMOTE_TIMEOUT_MS = 4000;
/** Bij een onbereikbare aanbieder laten we door, maar per IP maar zo vaak per uur (strenger dan de gewone aanmeldgrens van 10). */
const ONBEREIKBAAR_LIMIET = 3;
const ONBEREIKBAAR_VENSTER_S = 3600;

/**
 * "De dienst zegt nee" (success: false, of een antwoord dat we niet begrijpen) is geweigerd. "De dienst is
 * onbereikbaar" (netwerkfout, time-out, 5xx) is een andere uitkomst: dan mag aanmelden niet stilvallen.
 */
async function verifyRemote(url: string, secret: string, token: string, remoteip?: string): Promise<RemoteUitslag> {
  let res: Response;
  try {
    const form = new URLSearchParams({ secret, response: token, ...(remoteip ? { remoteip } : {}) });
    res = await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS) });
  } catch (err) {
    const naam = err instanceof Error ? err.name : "";
    return { uitslag: "onbereikbaar", soort: naam === "TimeoutError" || naam === "AbortError" ? "time-out" : "netwerk" };
  }
  if (res.status >= 500) return { uitslag: "onbereikbaar", soort: "5xx" };
  const data = (await res.json().catch(() => null)) as { success?: boolean } | null;
  return { uitslag: data?.success === true ? "geldig" : "geweigerd" };
}

/** Een onbereikbare aanbieder: loggen (alleen host en soort) en doorlaten onder een strengere limiet per IP. */
async function bijOnbereikbaar(url: string, soort: string, remoteip?: string): Promise<boolean> {
  const { logger } = await import("@/lib/logger");
  logger.warn("captcha-onbereikbaar", { host: new URL(url).host, soort });
  // zonder bekend IP kunnen we niet per bron tellen; niet iedereen op één emmer zetten
  if (!remoteip || remoteip === "local") return true;
  try {
    const { fixedWindow, privateRateLimitIdentifier } = await import("@/lib/rate-limit");
    // het IP staat versleuteld (HMAC) in de sleutel, niet leesbaar; een storing in Redis laat door (fail-open)
    const gate = await fixedWindow(`captcha-onbereikbaar:rl:${privateRateLimitIdentifier(remoteip)}`, ONBEREIKBAAR_LIMIET, ONBEREIKBAAR_VENSTER_S);
    return gate.ok;
  } catch {
    return true;
  }
}

async function verifyProvider(url: string, token: string, remoteip?: string): Promise<boolean> {
  const r = await verifyRemote(url, env.CAPTCHA_SECRET ?? "", token, remoteip);
  if (r.uitslag === "onbereikbaar") return bijOnbereikbaar(url, r.soort, remoteip);
  return r.uitslag === "geldig";
}

/**
 * Verify a captcha token for the configured provider. Returns true when captcha
 * is OFF (nothing to check) so callers can always `if (!(await verifyCaptcha(..))) reject`.
 * Een extern captcha dat onbereikbaar is, laat door (met strengere limiet per IP); een token dat de
 * aanbieder zelf afwijst, of een ontbrekend token, blijft geweigerd.
 */
export async function verifyCaptcha(token: string | undefined, remoteip?: string): Promise<boolean> {
  const provider = captchaProvider();
  if (!provider) return true;
  if (provider === "pow") return verifyPow(token);
  if (!token) return false;
  if (provider === "turnstile") return verifyProvider("https://challenges.cloudflare.com/turnstile/v0/siteverify", token, remoteip);
  return verifyProvider("https://api.hcaptcha.com/siteverify", token, remoteip);
}