"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { z } from "zod";
import { env } from "@/lib/env";
import { signIn } from "@/lib/auth/nextauth";
import { mintLoginChallenge } from "@/lib/auth/two-factor";

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
}

const codeOf = (err: unknown) => (err as { code?: string }).code;

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
    try {
      await signIn("credentials", { challenge, otp, remember, redirectTo: safeCallback((formData.get("callbackUrl") as string) || undefined) });
      return { error: null };
    } catch (err) {
      if (err instanceof AuthError) {
        return codeOf(err) === "2fa_invalid"
          ? { error: "Die code klopt niet (of is al gebruikt). Probeer de nieuwste code uit je app.", needsCode: true, challenge, email }
          : { error: "Je inlogpoging is verlopen. Log opnieuw in." };
      }
      throw err;
    }
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

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      remember: parsed.data.remember === "1" ? "1" : "",
      redirectTo: safeCallback(parsed.data.callbackUrl),
    });
    return { error: null };
  } catch (err) {
    // A successful `signIn` throws a NEXT_REDIRECT (not an AuthError); rethrow
    // it so Next performs the redirect. Only auth failures are handled here.
    if (err instanceof AuthError) {
      if (codeOf(err) === "2fa_required") {
        return { error: null, needsCode: true, challenge: mintLoginChallenge(parsed.data.email), email: parsed.data.email };
      }
      return { error: "Ongeldige inloggegevens." };
    }
    throw err;
  }
}

/**
 * Kick off the Google OAuth flow. `signIn` redirects (throws NEXT_REDIRECT),
 * which must propagate so Next performs the redirect.
 */
export async function googleLoginAction(formData: FormData): Promise<void> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    redirect("/login?error=Configuration");
  }
  const callbackUrl = safeCallback(
    (formData.get("callbackUrl") as string) || undefined,
  );
  await signIn("google", { redirectTo: callbackUrl });
}

/** Only allow same-origin relative callback paths. */
function safeCallback(raw: string | undefined): string {
  if (!raw) return "/start";
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") && !raw.includes("\\")) return raw;
  return "/start";
}
