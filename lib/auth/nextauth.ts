import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import {
  checkLoginAllowed,
  clearLoginFailures,
  registerLoginFailure,
  MAX_FAILURES,
} from "@/lib/auth/login-throttle";
import {
  decodeSession,
  encodeSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  REMEMBER_MAX_AGE_SECONDS,
  type RoleGrant,
} from "@/lib/auth/session";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  remember: z.string().optional(),
});

async function loadGrants(userId: string): Promise<RoleGrant[]> {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { scopedBranches: { select: { branchId: true } } },
  });
  return memberships.map((m) => ({
    role: m.role,
    organizationId: m.tenantId,
    locationIds: m.scopedBranches.map((b) => b.branchId),
  }));
}

interface DbAccount {
  id: string;
  fullName: string;
  email: string;
  grants: RoleGrant[];
}

/**
 * Resolve a ZekerFlex account from an e-mail address. Used by both the
 * credentials `authorize` and the OAuth `signIn` / `jwt` callbacks so a Google
 * login resolves to the SAME `User` row (and its RBAC grants) as a password
 * login. Returns null for unknown or disabled accounts.
 */
const PLATFORM_TENANT_ID = "org_platform";

/**
 * First Google login with an unknown (but Google-verified) e-mail: create a
 * freelancer account on the spot so the user lands straight in onboarding.
 * The e-mail is already verified by Google, so `emailVerifiedAt` is set.
 */
async function autoProvisionFromGoogle(
  rawEmail: string,
  name: string | null | undefined,
): Promise<string | null> {
  const email = rawEmail.toLowerCase().trim();
  if (!email) return null;
  try {
    const user = await prisma.user.create({
      data: {
        email,
        fullName: (name ?? email.split("@")[0] ?? "Nieuwe gebruiker").slice(0, 120),
        emailVerifiedAt: new Date(),
        memberships: { create: { tenantId: PLATFORM_TENANT_ID, role: "FREELANCER" } },
      },
      select: { id: true },
    });
    logger.info("auto-provisioned freelancer from google login", { email });
    return user.id;
  } catch (err) {
    logger.error("google auto-provision failed", { email, error: (err as Error).message });
    return null;
  }
}

async function resolveDbAccount(rawEmail: string): Promise<DbAccount | null> {
  const email = rawEmail.toLowerCase().trim();
  if (!email) return null;
  const user = await prisma.user.findFirst({
    where: { email, disabledAt: null },
    select: { id: true, fullName: true, email: true },
  });
  if (!user) return null;
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    grants: await loadGrants(user.id),
  };
}

const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: env.AUTH_TRUST_HOST,
  secret: env.AUTH_SECRET,
  // Cookie container spans the longest possible session; the real expiry is the
  // JWT `exp` set in `jwt.encode` (8h by default, 30d with "ingelogd blijven").
  session: { strategy: "jwt", maxAge: REMEMBER_MAX_AGE_SECONDS },
  pages: { signIn: "/login", error: "/login" },
  cookies: {
    sessionToken: {
      name: SESSION_COOKIE,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: env.NODE_ENV === "production",
      },
    },
  },
  // Mint / read the exact jose HS256 tokens the Edge middleware understands.
  jwt: {
    async encode({ token }) {
      if (!token?.sub) return "";
      const remember = token.remember === true;
      return encodeSession(
        {
          sub: token.sub,
          email: typeof token.email === "string" ? token.email : "",
          name: typeof token.name === "string" ? token.name : "",
          roles: Array.isArray(token.roles) ? (token.roles as RoleGrant[]) : [],
          remember,
        },
        remember ? REMEMBER_MAX_AGE_SECONDS : SESSION_MAX_AGE_SECONDS,
      );
    },
    async decode({ token }) {
      const claims = await decodeSession(token);
      if (!claims) return null;
      return {
        sub: claims.sub,
        email: claims.email,
        name: claims.name,
        roles: claims.roles,
        remember: claims.remember === true,
      };
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Wachtwoord", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase().trim();

        const gate = await checkLoginAllowed(email);
        if (!gate.allowed) {
          logger.warn("login attempt while locked out", { email });
          await recordAudit({
            category: "SECURITY",
            action: "auth.login.locked",
            severity: "warning",
            summary: `Inlogpoging voor ${email} geweigerd - tijdelijk geblokkeerd`,
            targetType: "email",
            targetId: email,
            metadata: { retryAfterSeconds: gate.retryAfterSeconds },
          });
          return null;
        }

        const registerFailure = async (userId: string | null) => {
          const { failures, locked } = await registerLoginFailure(email);
          logger.warn("failed login attempt", { email, failures, locked });
          await recordAudit({
            category: locked ? "SECURITY" : "AUTH",
            action: locked ? "auth.login.locked" : "auth.login.failed",
            severity: locked ? "warning" : "info",
            summary: locked
              ? `${email} geblokkeerd na ${MAX_FAILURES} mislukte inlogpogingen`
              : `Mislukte inlogpoging voor ${email}`,
            actorUserId: userId,
            targetType: "email",
            targetId: email,
            metadata: { failures },
          });
        };

        const user = await prisma.user.findFirst({
          where: { email, disabledAt: null },
        });
        if (!user?.passwordHash) {
          await registerFailure(user?.id ?? null);
          return null;
        }

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) {
          await registerFailure(user.id);
          return null;
        }

        await clearLoginFailures(email);
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        await recordAudit({
          category: "AUTH",
          action: "auth.login.succeeded",
          actorUserId: user.id,
          actorLabel: "user",
          summary: `Inloggen geslaagd: ${email}`,
          targetType: "user",
          targetId: user.id,
        });

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          roles: await loadGrants(user.id),
          remember: parsed.data.remember === "1",
        };
      },
    }),
    ...(googleEnabled
      ? [
          Google({
            clientId: env.GOOGLE_CLIENT_ID!,
            clientSecret: env.GOOGLE_CLIENT_SECRET!,
            allowDangerousEmailAccountLinking: true,
            authorization: {
              params: { prompt: "select_account", access_type: "offline" },
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    /**
     * Gatekeeper. Credentials logins are already validated in `authorize`.
     * A Google login is only accepted when the (verified) e-mail belongs to an
     * existing, enabled ZekerFlex account — we do not auto-provision here.
     */
    async signIn({ account, profile, user }) {
      if (!account || account.provider === "credentials") return true;

      if (account.provider === "google") {
        const verifiedClaim = (
          profile as { email_verified?: boolean } | null | undefined
        )?.email_verified;
        if (verifiedClaim === false) return false;

        const email = (profile?.email ?? user.email ?? "").toString();
        let dbAccount = await resolveDbAccount(email);
        let provisioned = false;
        if (!dbAccount) {
          const newId = await autoProvisionFromGoogle(email, profile?.name ?? user.name);
          if (!newId) return "/login?error=Configuration";
          dbAccount = await resolveDbAccount(email);
          provisioned = true;
          if (!dbAccount) return "/login?error=Configuration";
        }
        await prisma.user.update({
          where: { id: dbAccount.id },
          data: { lastLoginAt: new Date() },
        });
        await recordAudit({
          category: "AUTH",
          action: provisioned ? "auth.register.oauth" : "auth.login.succeeded",
          actorUserId: dbAccount.id,
          actorLabel: "user",
          summary: `${provisioned ? "Nieuw account via" : "Inloggen geslaagd via"} Google: ${dbAccount.email}`,
          targetType: "user",
          targetId: dbAccount.id,
          metadata: { provider: "google", provisioned },
        });
        return true;
      }

      return false;
    },

    async jwt({ token, user, account, trigger }) {
      // First call after a successful sign-in.
      if (user || account) {
        const credentialsRoles = (user as { roles?: RoleGrant[] } | undefined)
          ?.roles;
        if (credentialsRoles && user?.id) {
          token.sub = user.id;
          token.roles = credentialsRoles;
          token.name = user.name ?? token.name ?? null;
          token.email = user.email ?? token.email ?? null;
          token.remember = (user as { remember?: boolean }).remember === true;
        } else {
          // OAuth path: bind the token to our DB account, not the provider id.
          const email = (user?.email ?? token.email ?? "").toString();
          const dbAccount = await resolveDbAccount(email);
          if (dbAccount) {
            token.sub = dbAccount.id;
            token.name = dbAccount.fullName;
            token.email = dbAccount.email;
            token.roles = dbAccount.grants;
          } else {
            token.roles = [];
          }
        }
      } else if (trigger === "update" && token.sub) {
        token.roles = await loadGrants(token.sub);
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.roles = Array.isArray(token.roles)
          ? (token.roles as RoleGrant[])
          : [];
      }
      return session;
    },
  },
});
