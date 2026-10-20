import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { listSubscribers } from "@/lib/newsletter/store";

// ---------------------------------------------------------------------------
// Who an admin broadcast goes to. "subscribers" are the double-opt-in
// newsletter list; the account audiences are registered users with a verified
// address, mailed as existing customers (soft opt-in) — so every such mail
// carries a one-click opt-out, stored as "mail-optout:<sha256(email)>".
// Anyone who opted out here, or unsubscribed from the newsletter, is skipped
// for every audience.
// ---------------------------------------------------------------------------

export const AUDIENCES = ["subscribers", "users", "freelancers", "employers", "everyone"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABEL: Record<Audience, string> = {
  subscribers: "Nieuwsbrief-abonnees",
  users: "Alle gebruikers",
  freelancers: "Freelancers",
  employers: "Werkgevers",
  everyone: "Iedereen (abonnees + gebruikers)",
};

export interface Recipient {
  email: string;
  /** unsubscribe token for the mail footer */
  token: string;
  /** why they get it — drives the footer text */
  reason: "subscriber" | "account";
}

const OPTOUT_PREFIX = "mail-optout:";
const hashEmail = (email: string) => createHash("sha256").update(email).digest("hex");

function sign(email: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(`optout:${email}`).digest("base64url").slice(0, 22);
}

/** Opt-out token for an account holder: "u.<base64url(email)>.<hmac>". */
export function accountOptOutToken(email: string): string {
  return `u.${Buffer.from(email).toString("base64url")}.${sign(email)}`;
}

/** Returns the e-mail address when the token is a valid account opt-out token. */
export function verifyAccountOptOutToken(token: string): string | null {
  const m = /^u\.([A-Za-z0-9_-]{4,400})\.([A-Za-z0-9_-]{22})$/.exec(token);
  if (!m) return null;
  const email = Buffer.from(m[1]!, "base64url").toString("utf8");
  const a = Buffer.from(sign(email));
  const b = Buffer.from(m[2]!);
  return a.length === b.length && timingSafeEqual(a, b) ? email : null;
}

export async function optOutAccountMail(email: string): Promise<void> {
  const key = `${OPTOUT_PREFIX}${hashEmail(email)}`;
  if (await kvGet(key)) return;
  await kvSet(key, { email, at: new Date().toISOString() });
}

async function optedOut(): Promise<Set<string>> {
  const rows = await kvListValues<{ email: string }>(OPTOUT_PREFIX, 50_000);
  return new Set(rows.map((r) => r.email.toLowerCase()));
}

async function accountEmails(audience: Audience): Promise<string[]> {
  const roles =
    audience === "freelancers"
      ? (["FREELANCER"] as const)
      : audience === "employers"
        ? (["HQ_ADMIN", "LOCAL_MANAGER"] as const)
        : null;
  const users = await prisma.user.findMany({
    where: {
      disabledAt: null,
      emailVerifiedAt: { not: null },
      ...(roles ? { memberships: { some: { role: { in: [...roles] } } } } : {}),
    },
    select: { email: true },
  });
  return users.map((u) => u.email.toLowerCase());
}

export async function resolveAudience(audience: Audience): Promise<Recipient[]> {
  const [subs, blocked] = await Promise.all([listSubscribers(), optedOut()]);
  for (const s of subs) if (s.status === "unsubscribed") blocked.add(s.email.toLowerCase());

  const out = new Map<string, Recipient>();
  if (audience === "subscribers" || audience === "everyone") {
    for (const s of subs) {
      if (s.status !== "confirmed" || blocked.has(s.email)) continue;
      out.set(s.email, { email: s.email, token: s.token, reason: "subscriber" });
    }
  }
  if (audience !== "subscribers") {
    for (const email of await accountEmails(audience)) {
      if (blocked.has(email) || out.has(email)) continue;
      out.set(email, { email, token: accountOptOutToken(email), reason: "account" });
    }
  }
  return [...out.values()];
}

export async function audienceCounts(): Promise<Record<Audience, number>> {
  const entries = await Promise.all(AUDIENCES.map(async (a) => [a, (await resolveAudience(a)).length] as const));
  return Object.fromEntries(entries) as Record<Audience, number>;
}
