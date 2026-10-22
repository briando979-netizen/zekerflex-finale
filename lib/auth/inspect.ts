import { SignJWT, jwtVerify } from "jose";
import { encodeSession, type RoleGrant } from "@/lib/auth/session";

// ---------------------------------------------------------------------------
// Read-only inspection links — let an AI (Claude, ChatGPT, Gemini…) or a
// screenshot script look at the site and the Android-app view AS A TEST
// ACCOUNT, without that account's password and without being able to change
// anything.
//
//   - An admin mints a link for one test account (never an admin/sales one):
//     a signed JWT (aud "zekerflex.inspect") carrying a snapshot of that
//     account's identity + roles, valid at most 72 hours.
//   - Any URL with ?zf_inspect=<token> is served as that account: middleware
//     verifies the token (edge-safe, no DB), mints a short session carrying
//     `inspect: true`, forwards it and sets it as the session cookie.
//     &app=1 additionally switches on Android-app mode.
//   - Every non-GET request from an inspect session is refused (403), so
//     forms, server actions and API writes can't run.
// ---------------------------------------------------------------------------

export const INSPECT_PARAM = "zf_inspect";
/** Admin "Bekijk als" (lib/auth/view-as.ts): read-only session used outside /admin. */
export const VIEW_AS_COOKIE = "zf_view_as";
export const INSPECT_MAX_HOURS = 72;
const ISSUER = "zekerflex";
const AUDIENCE = "zekerflex.inspect";
/** Session lifetime minted from a link — short; the link itself can be reused. */
export const INSPECT_SESSION_SECONDS = 2 * 60 * 60;

function key(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET missing");
  return new TextEncoder().encode(secret);
}

export interface InspectTarget {
  sub: string;
  email: string;
  name: string;
  roles: RoleGrant[];
}

const FORBIDDEN_ROLES = new Set(["PLATFORM_ADMIN", "SALES"]);

/** Whether this account may be inspected at all (never admin/sales accounts). */
export function inspectable(roles: RoleGrant[]): boolean {
  return !roles.some((r) => FORBIDDEN_ROLES.has(r.role));
}

export async function mintInspectLink(target: InspectTarget, hours: number): Promise<{ token: string; expiresAt: Date }> {
  if (!inspectable(target.roles)) throw new Error("Admin- en salesaccounts kunnen niet geïnspecteerd worden.");
  const h = Math.max(1, Math.min(INSPECT_MAX_HOURS, Math.round(hours)));
  const now = Math.floor(Date.now() / 1000);
  const exp = now + h * 3600;
  const token = await new SignJWT({ email: target.email, name: target.name, roles: target.roles })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(target.sub)
    .setIssuedAt(now)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(exp)
    .sign(key());
  return { token, expiresAt: new Date(exp * 1000) };
}

/** Verify a link token; returns the target or null. Edge-safe (no DB). */
export async function verifyInspectLink(token: string | null | undefined): Promise<InspectTarget | null> {
  if (!token || token.length > 4000) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: ISSUER, audience: AUDIENCE, algorithms: ["HS256"] });
    const roles = payload.roles as RoleGrant[] | undefined;
    if (typeof payload.sub !== "string" || typeof payload.email !== "string" || typeof payload.name !== "string" || !Array.isArray(roles)) {
      return null;
    }
    if (!inspectable(roles)) return null;
    return { sub: payload.sub, email: payload.email, name: payload.name, roles };
  } catch {
    return null;
  }
}

/** The short-lived, read-only session a valid link turns into. */
export async function inspectSessionFor(target: InspectTarget): Promise<string> {
  return encodeSession({ ...target, inspect: true }, INSPECT_SESSION_SECONDS);
}
