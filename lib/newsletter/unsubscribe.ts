import { optOutAccountMail, verifyAccountOptOutToken } from "@/lib/newsletter/audience";
import { unsubscribe, unsubscribeByEmail } from "@/lib/newsletter/store";

/**
 * One entry point for every unsubscribe link: a newsletter-subscriber token,
 * or a signed account opt-out token from an admin broadcast to users. An
 * account opt-out also ends any newsletter subscription for that address.
 * Geeft terug of de code geldig was (16 nov 2026): zonder geldige code zegt de pagina niet meer "Je bent afgemeld".
 */
export async function unsubscribeAny(token: string): Promise<boolean> {
  if (!token) return false;
  const email = verifyAccountOptOutToken(token);
  if (email) {
    await optOutAccountMail(email);
    await unsubscribeByEmail(email).catch(() => null);
    return true;
  }
  return (await unsubscribe(token)) !== null;
}
