"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth/nextauth";
import { registerAccount, registerSchema } from "@/lib/auth/register";
import { sendVerificationEmail } from "@/lib/auth/email-verify";
import { isBreached, scorePassword } from "@/lib/auth/password";
import { AppError } from "@/lib/errors";

export interface RegisterState {
  error: string | null;
}

export async function registerAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const parsed = registerSchema.safeParse({
    type: formData.get("type"),
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm") ?? undefined,
    phone: formData.get("phone") || undefined,
    companyName: formData.get("companyName") || undefined,
    kvkNumber: formData.get("kvkNumber") || undefined,
    workerKind: formData.get("workerKind") || undefined,
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Controleer de ingevulde gegevens.";
    return { error: first };
  }

  // Password quality — mirrors the live checks, enforced server-side.
  const strength = scorePassword(parsed.data.password, [parsed.data.email, parsed.data.fullName]);
  if (strength.score < 2) {
    return { error: strength.warnings[0] ?? "Kies een sterker wachtwoord." };
  }
  if (await isBreached(parsed.data.password)) {
    return { error: "Dit wachtwoord staat in bekende datalekken. Kies een ander wachtwoord." };
  }

  let account;
  try {
    account = await registerAccount(parsed.data);
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Aanmaken van het account is mislukt. Probeer het opnieuw." };
  }

  await sendVerificationEmail(account.userId, account.email, parsed.data.fullName).catch(() => undefined);

  try {
    await signIn("credentials", {
      email: parsed.data.email.toLowerCase().trim(),
      password: parsed.data.password,
      redirectTo: "/verifieer-email",
    });
    return { error: null };
  } catch (err) {
    // A successful signIn throws NEXT_REDIRECT which must propagate.
    if (err instanceof AuthError) {
      return { error: "Account aangemaakt, maar automatisch inloggen lukte niet. Log handmatig in." };
    }
    throw err;
  }
}
