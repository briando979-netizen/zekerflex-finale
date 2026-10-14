import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { sendMail, teamInvitedEmail } from "@/lib/mail";
import { INVITABLE_ROLES, createTeamInvite, listPendingTeamInvites, teamInviteUrl } from "@/lib/team/invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/werkgever/team — the caller's own tenant's members + pending invites.
export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");

    const [memberships, invites] = await Promise.all([
      prisma.membership.findMany({
        where: { tenantId },
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: { select: { id: true, fullName: true, email: true } },
          scopedBranches: { select: { branch: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: "asc" },
      }),
      listPendingTeamInvites(tenantId),
    ]);

    return NextResponse.json({
      members: memberships.map((m) => ({
        id: m.id,
        role: m.role,
        createdAt: m.createdAt,
        user: m.user,
        branches: m.scopedBranches.map((b) => b.branch),
      })),
      invites: invites.map((i) => ({ id: i.id, email: i.email, role: i.role, createdAt: i.createdAt })),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const schema = z.object({
  email: z.string().email().max(160),
  role: z.enum(INVITABLE_ROLES),
  branchIds: z.array(z.string().min(1).max(128)).max(50).optional(),
});

// POST /api/werkgever/team — invite a colleague into the caller's own tenant.
// Only an HQ_ADMIN manages who's on the team (same gate as /werkgever/locaties).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");

    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw AppError.validation("Controleer de ingevulde gegevens", parsed.error.flatten());
    const email = parsed.data.email.toLowerCase().trim();

    const [tenant, existingMembership] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      prisma.membership.findFirst({ where: { tenantId, user: { email } }, select: { id: true } }),
    ]);
    if (!tenant) throw AppError.precondition("Organisatie niet gevonden");
    if (existingMembership) throw AppError.conflict("Deze persoon is al onderdeel van je team.");

    if (parsed.data.role === "LOCAL_MANAGER" && parsed.data.branchIds?.length) {
      const ownedCount = await prisma.branch.count({ where: { id: { in: parsed.data.branchIds }, tenantId } });
      if (ownedCount !== parsed.data.branchIds.length) {
        throw AppError.validation("Een of meer gekozen vestigingen horen niet bij je organisatie.");
      }
    }

    const { record, token } = await createTeamInvite({
      tenantId,
      tenantName: tenant.name,
      email,
      role: parsed.data.role,
      branchIds: parsed.data.role === "LOCAL_MANAGER" ? parsed.data.branchIds ?? [] : [],
      invitedByUserId: principal.userId,
      invitedByName: principal.fullName,
    });

    const mail = teamInvitedEmail(tenant.name, principal.fullName, teamInviteUrl(token));
    await sendMail({ ...mail, to: email }).catch(() => undefined);

    await recordAudit({
      category: "COMPANY",
      action: "employer.team.invited",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} nodigde ${email} uit als ${parsed.data.role}`,
      targetType: "teamInvite",
      targetId: record.id,
      metadata: { tenantId, role: parsed.data.role, branchIds: parsed.data.branchIds ?? [] },
    });

    return NextResponse.json({ invite: { id: record.id, email: record.email, role: record.role } }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
