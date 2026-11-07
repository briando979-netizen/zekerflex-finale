import { hasTwoFactor } from "@/lib/auth/two-factor";
import { AppError } from "@/lib/errors";

/**
 * Admin security requirements:
 * - All admins must have 2FA enabled
 * - Enforced at login and dashboard access
 */

export async function requireAdminTwoFactor(userId: string): Promise<void> {
  const has2fa = await hasTwoFactor(userId);
  if (!has2fa) {
    throw AppError.precondition(
      "Beheerders moeten tweestapsverificatie inschakelen voor veiligheid. Ga naar Account → Beveiliging om deze in te stellen.",
    );
  }
}

export async function requireAdminTwoFactorOptional(userId: string): Promise<{ required: boolean }> {
  const has2fa = await hasTwoFactor(userId);
  return { required: !has2fa };
}
