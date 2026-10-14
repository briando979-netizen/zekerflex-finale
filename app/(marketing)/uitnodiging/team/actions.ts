"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth/nextauth";
import { getPrincipal } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { isBreached, scorePassword } from "@/lib/auth/password";
import { verifyTeamInviteToken } from "@/lib/team/invite";
import { acceptTeamInviteForExistingUser, registerNewUserFromTeamInvite } from "@/lib/team/accept";

export interface TeamAcceptState {
  error: string | null;
}

export async function acceptExistingUserAction(token: string): Promise<TeamAcceptState> {
  const payload = await verifyTeamInviteToken(token);
  if (!payload) return { error: "Deze uitnodiging is niet meer geldig." };

  const principal = await getPrincipal();
  if (!principal) return { error: "Je bent niet (meer) ingelogd." };
  if (principal.email.toLowerCase() !== payload.email.toLowerCase()) {
    return { error: `Deze uitnodiging is voor ${payload.email} — log in met dat e-mailadres.` };
  }

  try {
    await acceptTeamInviteForExistingUser(payload, principal.userId);
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Accepteren is mislukt. Probeer het opnieuw." };
  }

  redirect("/werkgever");
}

export async function registerAndAcceptAction(
  _prev: TeamAcceptState,
  formData: FormData,
): Promise<TeamAcceptState> {
  const token = String(formData.get("token") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  const payload = await verifyTeamInviteToken(token);
  if (!payload) return { error: "Deze uitnodiging is niet meer geldig." };
  if (fullName.length < 2) return { error: "Vul je volledige naam in." };
  if (password !== passwordConfirm) return { error: "De wachtwoorden komen niet overeen." };

  const strength = scorePassword(password, [payload.email, fullName]);
  if (strength.score < 2) return { error: strength.warnings[0] ?? "Kies een sterker wachtwoord." };
  if (await isBreached(password)) {
    return { error: "Dit wachtwoord staat in bekende datalekken. Kies een ander wachtwoord." };
  }

  try {
    await registerNewUserFromTeamInvite(payload, { fullName, password });
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Aanmaken van je account is mislukt. Probeer het opnieuw." };
  }

  try {
    await signIn("credentials", { email: payload.email, password, redirectTo: "/werkgever" });
    return { error: null };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Account aangemaakt, maar automatisch inloggen lukte niet. Log handmatig in." };
    }
    throw err; // a successful signIn throws NEXT_REDIRECT, which must propagate
  }
}
