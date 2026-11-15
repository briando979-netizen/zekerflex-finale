"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth/nextauth";
import { getPrincipal } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { isBreached, scorePassword } from "@/lib/auth/password";
import { koppelBestaandAccount, maakMedewerkerAccount } from "@/lib/horeca-personeel/accept";
import { leesUitnodigingsToken } from "@/lib/horeca-personeel/store";

export interface PersoneelAcceptState {
  error: string | null;
}

const ONGELDIG = "Deze uitnodiging is niet meer geldig. Vraag je werkgever om een nieuwe.";

/** Een nieuw account maken met de uitnodiging en meteen inloggen. */
export async function maakAccountAction(_vorige: PersoneelAcceptState, formData: FormData): Promise<PersoneelAcceptState> {
  const token = String(formData.get("token") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const herhaal = String(formData.get("passwordConfirm") ?? "");

  const t = await leesUitnodigingsToken(token);
  if (!t) return { error: ONGELDIG };
  if (fullName.length < 2) return { error: "Vul je volledige naam in." };
  if (password !== herhaal) return { error: "De wachtwoorden komen niet overeen." };
  const sterkte = scorePassword(password, [t.email, fullName]);
  if (sterkte.score < 2) return { error: sterkte.warnings[0] ?? "Kies een sterker wachtwoord." };
  if (await isBreached(password)) return { error: "Dit wachtwoord staat in bekende datalekken. Kies een ander wachtwoord." };

  try {
    await maakMedewerkerAccount(t, { fullName, password });
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Aanmaken van je account is mislukt. Probeer het opnieuw." };
  }

  try {
    await signIn("credentials", { email: t.email, password, redirectTo: "/personeel" });
    return { error: null };
  } catch (err) {
    if (err instanceof AuthError) return { error: "Account aangemaakt, maar automatisch inloggen lukte niet. Log handmatig in." };
    throw err; // een gelukte signIn gooit NEXT_REDIRECT en die moet doorgaan
  }
}

/**
 * Uitloggen en terug naar het inlogscherm met de uitnodiging als doel: voor wie met een ander account is ingelogd dan het adres van
 * de uitnodiging. Zonder dit stuurt /login een ingelogde bezoeker meteen terug naar de uitnodiging, en zit hij in een kring.
 */
export async function uitloggenVoorUitnodigingAction(token: string): Promise<void> {
  const t = await leesUitnodigingsToken(token);
  if (!t) redirect("/login");
  await signOut({ redirectTo: `/login?callbackUrl=${encodeURIComponent(`/personeel/uitnodiging?token=${token}`)}` });
}

/** Een bestaand account (al ingelogd met hetzelfde e-mailadres) aan de zaak koppelen. */
export async function koppelBestaandAction(token: string): Promise<PersoneelAcceptState> {
  const t = await leesUitnodigingsToken(token);
  if (!t) return { error: ONGELDIG };
  const p = await getPrincipal();
  if (!p) return { error: "Je bent niet (meer) ingelogd." };
  try {
    await koppelBestaandAccount(t, p.userId, p.email);
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Koppelen is mislukt. Probeer het opnieuw." };
  }
  redirect("/personeel");
}
