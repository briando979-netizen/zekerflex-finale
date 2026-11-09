import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { naamGelijk } from "@/lib/kyc/naam-match";

// ---------------------------------------------------------------------------
// Self-service edits to a user's own name/phone (User, shared between every
// role). Previously there was no way to change these at all after
// registration — every "Persoonlijke gegevens" menu entry (freelancer and
// employer) pointed at a page with no actual edit form.
// ---------------------------------------------------------------------------

export const updatePersonalInfoSchema = z.object({
  fullName: z.string().trim().min(2, "Vul je volledige naam in").max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
});
export type UpdatePersonalInfoInput = z.infer<typeof updatePersonalInfoSchema>;

export const NAAM_VAST_BERICHT =
  "Je naam is bevestigd met je identiteitsbewijs. Wil je hem wijzigen? Neem contact op met support.";

/**
 * Een naam die met een identiteitsbewijs (of bank-inlog) is bevestigd, staat vast: anders kan een
 * gekaapt account zijn naam aanpassen aan de rekening van een ander en zo de naamcontrole omzeilen.
 * Een andere schrijfwijze van dezelfde naam (naamGelijk) blijft vrij.
 */
async function naamIsVast(userId: string, kycStatus: string | undefined): Promise<boolean> {
  if (kycStatus === "VERIFIED") return true;
  try {
    const { getBankLogin } = await import("@/lib/kyc/bank-login");
    return (await getBankLogin(userId))?.status === "verified";
  } catch {
    return false; // KV of bank-module even niet bereikbaar: inloggen en profiel blijven werken
  }
}

/** `byAdmin`: een beheerder mag een vaste naam wel wijzigen (wordt geauditeerd). */
export async function updatePersonalInfo(
  userId: string,
  input: UpdatePersonalInfoInput,
  opts: { byAdmin?: boolean; actorUserId?: string } = {},
): Promise<void> {
  const before = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, phone: true, kycStatus: true } });
  if (!before) throw AppError.notFound("Account niet gevonden.");

  const naamAndersDanBevestigd = !naamGelijk(before.fullName, input.fullName);
  if (naamAndersDanBevestigd && (await naamIsVast(userId, before.kycStatus))) {
    if (!opts.byAdmin) {
      await recordAudit({
        category: "SECURITY",
        action: "user.name_change_blocked",
        severity: "warning",
        actorUserId: userId,
        actorLabel: "user",
        summary: "Naamswijziging geweigerd: de naam is bevestigd met een identiteitsbewijs of bank-inlog.",
        targetType: "user",
        targetId: userId,
      }).catch(() => undefined);
      throw AppError.naamVastgezet(NAAM_VAST_BERICHT);
    }
    await recordAudit({
      category: "SECURITY",
      action: "user.name_changed_by_admin",
      severity: "warning",
      actorUserId: opts.actorUserId ?? userId,
      actorLabel: "admin",
      summary: "Vaste (bevestigde) naam door een beheerder gewijzigd.",
      targetType: "user",
      targetId: userId,
    }).catch(() => undefined);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { fullName: input.fullName, phone: input.phone || null },
  });

  await recordAudit({
    category: "SECURITY",
    action: "user.personal_info_updated",
    actorUserId: userId,
    actorLabel: "user",
    summary: `Persoonlijke gegevens bijgewerkt door gebruiker zelf.`,
    targetType: "user",
    targetId: userId,
    metadata: {
      fullNameChanged: before.fullName !== input.fullName,
      phoneChanged: (before.phone ?? "") !== (input.phone ?? ""),
    },
  });
}
