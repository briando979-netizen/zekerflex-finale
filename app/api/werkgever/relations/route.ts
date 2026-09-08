import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { prisma } from "@/lib/prisma";
import { toErrorBody, AppError } from "@/lib/errors";
import { updateEmployerRelation, getEmployerRelations } from "@/lib/employer/relations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["favorite", "unfavorite", "block", "unblock"]),
  userId: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  note: z.string().trim().max(300).optional(),
});

// GET /api/werkgever/relations — the caller org's favourites + blocks.
export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "HQ_ADMIN", "LOCAL_MANAGER", "DISPUTE_MANAGER", "PLATFORM_ADMIN");
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.forbidden("Geen organisatie");
    return NextResponse.json(await getEmployerRelations(tenantId));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/werkgever/relations { action, userId, name, note? }
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "HQ_ADMIN", "LOCAL_MANAGER", "DISPUTE_MANAGER", "PLATFORM_ADMIN");
    const input = schema.parse(await request.json().catch(() => ({})));

    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.forbidden("Geen organisatie");

    // The target must be a real freelancer.
    const target = await prisma.user.findFirst({
      where: { id: input.userId, freelancerProfile: { isNot: null } },
      select: { id: true, fullName: true },
    });
    if (!target) throw AppError.notFound("Kracht niet gevonden");

    const rel = await updateEmployerRelation(tenantId, input.action, {
      userId: target.id,
      name: target.fullName || input.name,
      ...(input.note ? { note: input.note } : {}),
    });

    revalidatePath("/werkgever/favorieten");
    revalidatePath("/werkgever/geblokkeerd");
    return NextResponse.json({
      ok: true,
      favorites: rel.favorites.length,
      blocked: rel.blocked.length,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
