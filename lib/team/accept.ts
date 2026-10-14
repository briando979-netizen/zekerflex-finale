import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { getTeamInvite, markTeamInviteAccepted, type TeamInviteTokenPayload } from "@/lib/team/invite";

async function assertStillPending(payload: TeamInviteTokenPayload): Promise<void> {
  const invite = await getTeamInvite(payload.tenantId, payload.id);
  if (!invite || invite.status !== "pending") {
    throw AppError.precondition("Deze uitnodiging is niet meer geldig — vraag een nieuwe aan.");
  }
}

async function attachBranches(tx: Prisma.TransactionClient, membershipId: string, branchIds: string[]): Promise<void> {
  if (branchIds.length === 0) return;
  await tx.branchManager.createMany({
    data: branchIds.map((branchId) => ({ membershipId, branchId })),
    skipDuplicates: true,
  });
}

/** The invited email already has an account — attach the membership to it. */
export async function acceptTeamInviteForExistingUser(
  payload: TeamInviteTokenPayload,
  userId: string,
): Promise<void> {
  await assertStillPending(payload);

  const existing = await prisma.membership.findFirst({
    where: { userId, tenantId: payload.tenantId, role: payload.role },
    select: { id: true },
  });
  if (!existing) {
    await prisma.$transaction(async (tx) => {
      const membership = await tx.membership.create({
        data: { userId, tenantId: payload.tenantId, role: payload.role },
        select: { id: true },
      });
      if (payload.role === "LOCAL_MANAGER") await attachBranches(tx, membership.id, payload.branchIds);
    });
  }

  await markTeamInviteAccepted(payload.tenantId, payload.id);
  await recordAudit({
    category: "AUTH",
    action: "team.invite.accepted",
    actorUserId: userId,
    actorLabel: "user",
    summary: `${payload.email} accepteerde teamuitnodiging voor ${payload.tenantName} (${payload.role})`,
    targetType: "user",
    targetId: userId,
    metadata: { tenantId: payload.tenantId, role: payload.role },
  });
}

/**
 * No account exists yet for the invited email — create one and attach the
 * membership in the same transaction, instead of a new tenant (the branch
 * lib/auth/register.ts's registerAccount takes for a brand-new "bedrijf").
 * emailVerifiedAt is set immediately: receiving and clicking this link is
 * itself proof of owning the mailbox, the same property a verification mail
 * would establish — no separate round trip needed.
 */
export async function registerNewUserFromTeamInvite(
  payload: TeamInviteTokenPayload,
  input: { fullName: string; password: string },
): Promise<{ userId: string }> {
  await assertStillPending(payload);

  const existing = await prisma.user.findUnique({ where: { email: payload.email }, select: { id: true } });
  if (existing) {
    throw AppError.conflict("Er bestaat al een account met dit e-mailadres — log in om de uitnodiging te accepteren.");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const userId = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: payload.email,
        fullName: input.fullName,
        passwordHash,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    const membership = await tx.membership.create({
      data: { userId: user.id, tenantId: payload.tenantId, role: payload.role },
      select: { id: true },
    });
    if (payload.role === "LOCAL_MANAGER") await attachBranches(tx, membership.id, payload.branchIds);
    return user.id;
  });

  await markTeamInviteAccepted(payload.tenantId, payload.id);
  await recordAudit({
    category: "AUTH",
    action: "team.invite.accepted",
    actorUserId: userId,
    actorLabel: "user",
    summary: `${payload.email} maakte een account aan en accepteerde de teamuitnodiging voor ${payload.tenantName} (${payload.role})`,
    targetType: "user",
    targetId: userId,
    metadata: { tenantId: payload.tenantId, role: payload.role },
  });

  return { userId };
}
