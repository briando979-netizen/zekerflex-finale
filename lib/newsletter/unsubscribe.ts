import { optOutAccountMail, verifyAccountOptOutToken } from "@/lib/newsletter/audience";
import { unsubscribe, unsubscribeByEmail } from "@/lib/newsletter/store";

/**
 * One entry point for every unsubscribe link: a newsletter-subscriber token,
 * or a signed account opt-out token from an admin broadcast to users. An
 * account opt-out also ends any newsletter subscription for that address.
 */
export async function unsubscribeAny(token: string): Promise<void> {
  const email = verifyAccountOptOutToken(token);
  if (email) {
    await optOutAccountMail(email);
    await unsubscribeByEmail(email).catch(() => null);
    return;
  }
  await unsubscribe(token);
}
