import NextAuth, { CredentialsSignin, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import bcrypt from "bcryptjs";
import { emailHash } from "@/lib/auth/email-hash";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { featureEnabled } from "@/lib/flags";
import { recordAudit } from "@/lib/audit";
import { recordLoginFailure } from "@/lib/metrics";
import { hasTwoFactor, openLoginChallenge, verifySecondFactor } from "@/lib/auth/two-factor";
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
import { INSPECT_SESSION_SECONDS } from "@/lib/auth/inspect";
import { bezorgingMislukt } from "@/lib/mail/test-adres";
import { appleConfig, appleMailBevestigd, appleNaam, huidigAppleGeheim, isAppleRelay } from "@/lib/auth/apple";

const credentialsSchema = z.union([
  z.object({ email: z.string().email(), password: z.string().min(1), remember: z.string().optional() }),
  // second step of a two-step login: the sealed challenge from the password step + the code
  z.object({ challenge: z.string().min(20), otp: z.string().min(6).max(20), remember: z.string().optional() }),
]);

/** Password was right, but this account also needs its authenticator code. (Code is URL-safe, reveals nothing secret.) */
export class SecondFactorRequired extends CredentialsSignin {
  override code = "2fa_required";
}
export class SecondFactorInvalid extends CredentialsSignin {
  override code = "2fa_invalid";
}
/** Too many recent failures — the account is temporarily locked. */
export class LoginLocked extends CredentialsSignin {
  override code = "locked";
}
/** Passkey-inlog geweigerd; de code zegt het inlogscherm waarom (lib/auth/passkey/inloggen.ts). */
export class PasskeySignin extends CredentialsSignin {
  constructor(code: string) {
    super();
    this.code = code;
  }
}

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

type OAuthProvider = "google" | "apple";
const PROVIDER_NAAM: Record<OAuthProvider, string> = { google: "Google", apple: "Apple" };

/**
 * First Google or Apple login with an unknown (but provider-verified) e-mail:
 * create a freelancer account on the spot so the user lands straight in onboarding.
 * Vlag `google-verificatiemail` (standaard aan, geldt voor Google en Apple): het
 * account krijgt dan dezelfde bevestigingsmail (link + code) als bij een gewone
 * aanmelding en geldt pas als bevestigd na de code; /start stuurt het intussen naar
 * /verifieer-email. Uit: de aanbieder heeft het adres al bevestigd, dus
 * `emailVerifiedAt` staat meteen. Een privé-adres van Apple ("Verberg mijn
 * e-mailadres") geldt altijd meteen als bevestigd: Apple stuurt alleen mail door van
 * afzenders die bij Apple zijn aangemeld (owner-todo "apple-inloggen"), dus een
 * code kan daar blijven hangen.
 */
async function autoProvisionFromOAuth(
  provider: OAuthProvider,
  rawEmail: string,
  name: string | null | undefined,
): Promise<string | null> {
  const email = rawEmail.toLowerCase().trim();
  if (!email) return null;
  const relay = provider === "apple" && isAppleRelay(email);
  const verifyByMail = !relay && (await featureEnabled("google-verificatiemail"));
  try {
    // een privé-adres van Apple is een willekeurige reeks: dan geen naam daaruit (de start vraagt hem)
    const fullName = (name ?? (relay ? "Nieuwe gebruiker" : email.split("@")[0]) ?? "Nieuwe gebruiker").slice(0, 120);
    const user = await prisma.user.create({
      data: {
        email,
        fullName,
        ...(verifyByMail ? {} : { emailVerifiedAt: new Date() }),
        memberships: { create: { tenantId: PLATFORM_TENANT_ID, role: "FREELANCER" } },
      },
      select: { id: true },
    });
    logger.info("auto-provisioned freelancer from oauth login", { userId: user.id, provider, verifyByMail });
    // Mail is best-effort: faalt hij, dan vraagt de gebruiker op /verifieer-email zelf een nieuwe code aan.
    try {
      const { sendVerificationEmail, sendWelcomeToUser } = await import("@/lib/auth/email-verify");
      if (verifyByMail) {
        const mail = await sendVerificationEmail(user.id, email, fullName);
        if (mail.sent && bezorgingMislukt(mail)) logger.warn(`verificatiemail (${PROVIDER_NAAM[provider]}) niet afgeleverd`, { userId: user.id, transport: mail.transport });
      } else {
        await sendWelcomeToUser(user.id);
      }
    } catch (err) {
      logger.warn(`mail na ${PROVIDER_NAAM[provider]}-aanmelding mislukt`, { userId: user.id, error: (err as Error).message });
    }
    return user.id;
  } catch (err) {
    logger.error("oauth auto-provision failed", { provider, emailHash: emailHash(email), error: (err as Error).message });
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
// zonder volledige config (lib/auth/apple.ts) is Apple uit en verandert er niets
const apple = appleConfig();

// Apple stuurt de aanmelding terug als POST vanaf appleid.apple.com (response_mode=form_post):
// een cross-site POST, en daarbij stuurt de browser geen cookies met SameSite=Lax mee. Dan
// faalt de controle op state/nonce en weet NextAuth niet meer waarheen. Deze kortlevende
// cookies staan in productie daarom op SameSite=None (altijd met Secure); de sessie zelf
// blijft Lax. Namen zoals NextAuth ze zelf kiest achter https (__Secure-), zodat een
// aanmelding die tijdens een uitrol loopt gewoon doorgaat.
const PROD = env.NODE_ENV === "production";
const terugPostCookie = (naam: string, maxAge?: number) => ({
  name: `${PROD ? "__Secure-" : ""}authjs.${naam}`,
  options: {
    httpOnly: true,
    sameSite: PROD ? ("none" as const) : ("lax" as const),
    path: "/",
    secure: PROD,
    ...(maxAge ? { maxAge } : {}),
  },
});

/**
 * The full NextAuth v5 config. Exported (not just handed straight to
 * `NextAuth()`) so `tests/auth-signin.test.ts` can exercise the pieces we
 * actually depend on — the credentials `authorize`, the `jwt.encode/decode`
 * hooks that mint/read our jose tokens, and the Google `signIn` gate — without
 * standing up the whole framework. See docs/DEPENDENCIES.md for why this
 * package is pinned to a beta.
 */
export const authOptions: NextAuthConfig = {
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
    state: terugPostCookie("state", 15 * 60),
    nonce: terugPostCookie("nonce", 15 * 60),
    pkceCodeVerifier: terugPostCookie("pkce.code_verifier", 15 * 60),
    callbackUrl: terugPostCookie("callback-url"),
  },
  // Mint / read the exact jose HS256 tokens the Edge middleware understands.
  jwt: {
    async encode({ token }) {
      if (!token?.sub) return "";
      const remember = token.remember === true;
      // A read-only inspection session must stay read-only and short when
      // NextAuth rolls the cookie (lib/auth/inspect.ts).
      const inspect = token.inspect === true;
      return encodeSession(
        {
          sub: token.sub,
          email: typeof token.email === "string" ? token.email : "",
          name: typeof token.name === "string" ? token.name : "",
          roles: Array.isArray(token.roles) ? (token.roles as RoleGrant[]) : [],
          remember: remember && !inspect,
          inspect,
        },
        inspect ? INSPECT_SESSION_SECONDS : remember ? REMEMBER_MAX_AGE_SECONDS : SESSION_MAX_AGE_SECONDS,
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
        inspect: claims.inspect === true,
      };
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Wachtwoord", type: "password" },
        challenge: { type: "text" },
        otp: { label: "Code", type: "text" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const twoStep = "challenge" in parsed.data ? parsed.data : null;
        const challengeEmail = twoStep ? openLoginChallenge(twoStep.challenge) : null;
        if (twoStep && !challengeEmail) return null; // expired or forged challenge

        const email = (challengeEmail ?? ("email" in parsed.data ? parsed.data.email : "")).toLowerCase().trim();

        const gate = await checkLoginAllowed(email);
        if (!gate.allowed) {
          logger.warn("login attempt while locked out", { emailHash: emailHash(email) });
          await recordAudit({
            category: "SECURITY",
            action: "auth.login.locked",
            severity: "warning",
            summary: `Inlogpoging voor ${email} geweigerd - tijdelijk geblokkeerd`,
            targetType: "email",
            targetId: email,
            metadata: { retryAfterSeconds: gate.retryAfterSeconds },
          });
          // Distinct from a wrong password/code, so the UI can say "temporarily
          // locked" instead of "invalid credentials" / "wrong code".
          throw new LoginLocked();
        }

        const registerFailure = async (userId: string | null) => {
          const { failures, locked } = await registerLoginFailure(email);
          recordLoginFailure();
          logger.warn("failed login attempt", { emailHash: emailHash(email), failures, locked });
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

        if (twoStep) {
          // step 2: the challenge proves the password was right minutes ago
          const second = await verifySecondFactor(user.id, twoStep.otp);
          if (!second.ok) {
            await registerFailure(user.id);
            throw new SecondFactorInvalid();
          }
        } else {
          const ok = await bcrypt.compare("password" in parsed.data ? parsed.data.password : "", user.passwordHash);
          if (!ok) {
            await registerFailure(user.id);
            return null;
          }
          if (await hasTwoFactor(user.id)) throw new SecondFactorRequired();
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
    // Passkey (vingerafdruk, gezicht of pincode van het toestel): dezelfde
    // controles en dezelfde sessie als hierboven, zie lib/auth/passkey/inloggen.ts.
    // Pas bij gebruik geladen: die module trekt Redis en de WebAuthn-controle mee.
    Credentials({
      id: "passkey",
      name: "Passkey",
      credentials: {
        response: { type: "text" },
        remember: { type: "text" },
      },
      async authorize(raw, request) {
        const { authorizePasskey } = await import("@/lib/auth/passkey/inloggen");
        const uit = await authorizePasskey(raw, request);
        if (!uit.ok) throw new PasskeySignin(uit.code);
        return { ...uit.user, roles: await loadGrants(uit.user.id) };
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
    ...(apple
      ? [
          Apple({
            clientId: apple.servicesId,
            // Een getter: NextAuth leest de provider bij elke aanvraag opnieuw in
            // (parseProviders), dus het geheim vernieuwt zichzelf zonder herstart.
            get clientSecret() {
              return huidigAppleGeheim(apple);
            },
            // Apple stuurt de naam alleen de eerste keer mee; daarna null (nooit het e-mailadres als naam)
            profile(p) {
              return { id: p.sub, name: appleNaam(p.user), email: p.email ?? null, image: null };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    /**
     * Gatekeeper. Credentials and passkey logins are already validated in `authorize`.
     * A Google or Apple login binds to the ZekerFlex account with the same (verified)
     * e-mail; an unknown address gets a new freelancer account (autoProvisionFromOAuth).
     * Apple: email_verified kan de tekst "true" zijn, en een privé-adres
     * (@privaterelay.appleid.com) is een eigen, geldig adres.
     */
    async signIn({ account, profile, user }) {
      if (!account || account.provider === "credentials" || account.provider === "passkey") return true;

      if (account.provider === "google" || account.provider === "apple") {
        const provider: OAuthProvider = account.provider;
        const claims = profile as { email?: unknown; email_verified?: unknown; name?: unknown; user?: unknown } | null | undefined;
        if (provider === "google" && claims?.email_verified === false) return false;
        if (provider === "apple" && appleMailBevestigd(claims?.email_verified) === false) return "/login?error=AppleLogin";

        const email = String(claims?.email ?? user.email ?? "");
        if (provider === "apple" && !email.trim()) return "/login?error=AppleLogin";
        const name = provider === "apple" ? (appleNaam(claims?.user) ?? user.name) : (profile?.name ?? user.name);
        let dbAccount = await resolveDbAccount(email);
        let provisioned = false;
        if (!dbAccount) {
          const newId = await autoProvisionFromOAuth(provider, email, name);
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
          summary: `${provisioned ? "Nieuw account via" : "Inloggen geslaagd via"} ${PROVIDER_NAAM[provider]}: ${dbAccount.email}`,
          targetType: "user",
          targetId: dbAccount.id,
          metadata: { provider, provisioned },
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
};

export const { handlers, signIn, signOut, auth } = NextAuth(authOptions);
