import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";

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

export async function updatePersonalInfo(userId: string, input: UpdatePersonalInfoInput): Promise<void> {
  const before = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, phone: true } });
  if (!before) throw AppError.notFound("Account niet gevonden.");

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
