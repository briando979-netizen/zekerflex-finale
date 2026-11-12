import { createHash } from "node:crypto";

/**
 * 8 tekens van een hash van het e-mailadres (12 nov 2026, 86): genoeg om pogingen op één account te herkennen in de
 * docker-logs (mislukte aanmelding, slot), zonder het adres zelf. Het auditlog houdt de volledige gegevens voor de beheerder.
 */
export function emailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 8);
}
