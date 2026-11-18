"use server";

import { signOut } from "@/lib/auth/nextauth";

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

/**
 * "Terug naar inloggen" op /verifieer-email (18 nov 2026): wie daar staat is ingelogd met een nog onbevestigd account.
 * Een gewone link naar /login stuurde hem als ingelogde meteen weer naar /start → /verifieer-email: de link leek niets
 * te doen ("ik kan niet op inloggen klikken"). Eerst uitloggen, dan het inlogformulier.
 */
export async function uitloggenNaarInloggen(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
