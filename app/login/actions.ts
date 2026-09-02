"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { z } from "zod";
import { env } from "@/lib/env";
import { signIn } from "@/lib/auth/nextauth";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  callbackUrl: z.string().optional(),
  remember: z.string().optional(),
});

export interface LoginState {
  error: string | null;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
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
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/start";
}
