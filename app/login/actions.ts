"use server";

import { redirect, RedirectType } from "next/navigation";
import { AuthError } from "next-auth";
import { z } from "zod";
import { env } from "@/lib/env";
import { signIn } from "@/lib/auth/nextauth";
import { appleConfig } from "@/lib/auth/apple";
import { mintLoginChallenge, openLoginChallenge } from "@/lib/auth/two-factor";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  callbackUrl: z.string().optional(),
  remember: z.string().optional(),
});

export interface LoginState {
  error: string | null;
  /** Two-step login: the password was right, now ask for the authenticator code. */
  needsCode?: boolean;
  challenge?: string;
  email?: string;
  remember?: boolean;
}

// NextAuth v5 sometimes wraps the thrown CredentialsSignin; read the code from
// the error itself or its cause so 2FA detection never silently fails.
const codeOf = (err: unknown): string | undefined => {
  const e = err as { code?: string; cause?: { err?: { code?: string } } };
  return e?.code ?? e?.cause?.err?.code;
};

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  // Step 2 of a two-step login: challenge (from step 1) + authenticator/recovery code.
  const challenge = String(formData.get("challenge") ?? "");
  if (challenge) {
    const otp = String(formData.get("otp") ?? "").trim();
    const email = String(formData.get("email") ?? "");
    const remember = formData.get("remember") === "1" ? "1" : "";
    let doel: unknown;
    try {
      doel = await signIn("credentials", { challenge, otp, remember, redirect: false, redirectTo: safeCallback((formData.get("callbackUrl") as string) || undefined) });
    } catch (err) {
      if (err instanceof AuthError) {
        // Temporarily locked after too many failures — say so, don't blame the code.
        if (codeOf(err) === "locked") {
          return { error: "Te veel pogingen — je account is ongeveer 15 minuten geblokkeerd. Wacht even en probeer daarna opnieuw.", needsCode: true, challenge, email, remember: remember === "1" };
        }
        // Decide wrong-code vs expired from the challenge itself, not from the
        // NextAuth error code (which doesn't always survive the wrapping). As
        // long as the challenge is still valid we keep the 2FA form open so a
        // mistyped code never bounces the user back to the password step.
        const stillValid = openLoginChallenge(challenge) !== null;
        return stillValid
          ? { error: "Die code klopt niet (of is al gebruikt). Probeer de nieuwste code uit je app.", needsCode: true, challenge, email, remember: remember === "1" }
          : { error: "Je inlogpoging is verlopen. Log opnieuw in." };
      }
      throw err;
    }
    naarDoel(doel);
  }

  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    callbackUrl: formData.get("callbackUrl") || undefined,
    remember: formData.get("remember") || undefined,
  });
  if (!parsed.success) {
    return { error: "Vul een geldig e-mailadres en wachtwoord in." };
  }

  let doel: unknown;
  try {
    doel = await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      remember: parsed.data.remember === "1" ? "1" : "",
      redirect: false,
      redirectTo: safeCallback(parsed.data.callbackUrl),
    });
  } catch (err) {
    // Only auth failures are handled here; anything else is rethrown.
    if (err instanceof AuthError) {
      if (codeOf(err) === "2fa_required") {
        return {
          error: null,
          needsCode: true,
          challenge: mintLoginChallenge(parsed.data.email),
          email: parsed.data.email,
          remember: parsed.data.remember === "1",
        };
      }
      return { error: "Ongeldige inloggegevens." };
    }
    throw err;
  }
  naarDoel(doel);
}

/** Uitkomst van een passkey-inlog die niet doorging: de code (het scherm kiest de zin); n telt, zodat elke poging een nieuwe staat geeft. */
export interface PasskeyLoginState {
  code: string | null;
  n: number;
}

/**
 * Inloggen met een passkey: de browser gaf het antwoord van het toestel
 * (navigator.credentials.get) als JSON; de passkey-provider controleert het
 * (lib/auth/passkey/inloggen.ts) en maakt dezelfde sessie als het wachtwoord.
 * Gelukt → door naar het doel (naarDoel). Mislukt → de code.
 */
export async function passkeyLoginAction(prev: PasskeyLoginState, formData: FormData): Promise<PasskeyLoginState> {
  const n = (prev?.n ?? 0) + 1;
  const response = String(formData.get("response") ?? "");
  if (!response || response.length > 100_000) return { code: "passkey_mislukt", n };
  let doel: unknown;
  try {
    doel = await signIn("passkey", {
      response,
      remember: formData.get("remember") === "1" ? "1" : "",
      redirect: false,
      redirectTo: safeCallback((formData.get("callbackUrl") as string) || undefined),
    });
  } catch (err) {
    if (err instanceof AuthError) return { code: codeOf(err) ?? "passkey_mislukt", n };
    throw err;
  }
  naarDoel(doel);
}

/**
 * Kick off the Google OAuth flow: `signIn` gives the Google address (and sets the
 * state cookies); naarDoel sends the browser there, replacing /login in the history.
 */
export async function googleLoginAction(formData: FormData): Promise<void> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    redirect("/login?error=Configuration");
  }
  const callbackUrl = safeCallback(
    (formData.get("callbackUrl") as string) || undefined,
  );
  naarDoel(await signIn("google", { redirect: false, redirectTo: callbackUrl }));
}

/** Inloggen met Apple (lib/auth/apple.ts): net als Google een doorverwijzing; Apple POST daarna terug. */
export async function appleLoginAction(formData: FormData): Promise<void> {
  if (!appleConfig()) redirect("/login?error=Configuration");
  naarDoel(await signIn("apple", { redirect: false, redirectTo: safeCallback((formData.get("callbackUrl") as string) || undefined) }));
}

/**
 * Na een gelukte login (of op weg naar Google/Apple) de stap in de geschiedenis vervangen, niet toevoegen: een
 * redirect() in een server-actie is anders een push, en dan brengt de terugknop iemand die al ingelogd is terug
 * op het inlogformulier (13 nov: twee van de drie nieuwe werkers met /login als laatste pagina). signIn geeft
 * met redirect: false het adres terug dat hij anders zelf had gekozen.
 */
function naarDoel(doel: unknown): never {
  redirect(typeof doel === "string" && doel ? doel : "/start", RedirectType.replace);
}

/** Only allow same-origin relative callback paths. */
function safeCallback(raw: string | undefined): string {
  if (!raw) return "/start";
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") && !raw.includes("\\")) return raw;
  return "/start";
}
