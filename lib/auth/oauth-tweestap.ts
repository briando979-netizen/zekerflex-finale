import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { challengeIsOauth, mintLoginChallenge, openLoginChallenge } from "@/lib/auth/two-factor";

// ---------------------------------------------------------------------------
// Tweestapsverificatie na inloggen met Google of Apple (19 nov 2026). Tot nu toe
// sloeg zo'n aanmelding de code uit de app over: wie het Google-account van een
// beheerder had, was binnen. Nu geeft de aanmelding bij de aanbieder alleen een
// verzegelde uitdaging (10 minuten geldig, zoals na een goed wachtwoord) en
// vraagt /login om de code. De uitdaging reist in een httpOnly-cookie, niet in
// het adres: zo komt hij in geen enkel logboek.
// ---------------------------------------------------------------------------

export const OAUTH_2FA_COOKIE = "zf-2fa-oauth";
const GELDIG_SECONDEN = 10 * 60;

/** Na een geslaagde aanmelding bij Google/Apple voor een account met tweestapsverificatie. */
export async function zetOauthUitdaging(email: string): Promise<void> {
  (await cookies()).set(OAUTH_2FA_COOKIE, mintLoginChallenge(email, Date.now(), "oauth"), {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/login",
    maxAge: GELDIG_SECONDEN,
  });
}

/** Op /login?stap=code: de uitdaging uit de cookie, als die nog geldig is en van een aanbieder komt. */
export async function leesOauthUitdaging(): Promise<{ challenge: string; email: string } | null> {
  const challenge = (await cookies()).get(OAUTH_2FA_COOKIE)?.value;
  if (!challenge || !challengeIsOauth(challenge)) return null;
  const email = openLoginChallenge(challenge);
  return email ? { challenge, email } : null;
}
