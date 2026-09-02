import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditCategory, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/admin/audit
//
// Read-only window on the audit trail for PLATFORM_ADMIN. This is the safe
// half of the "admin console" - it reports, it never mutates. Cursor-paginated
// (opaque `nextCursor` = last row id), newest first.
// ---------------------------------------------------------------------------

const querySchema = z.object({
  category: z.nativeEnum(AuditCategory).optional(),
  action: z.string().min(1).max(80).optional(),
  actorUserId: z.string().min(1).max(128).optional(),
  targetType: z.string().min(1).max(64).optional(),
  targetId: z.string().min(1).max(128).optional(),
  severity: z.enum(["info", "warning", "critical"]).optional(),
  since: z.coerce.date().optional(),
  cursor: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(request: Request): Promise<NextResponse> {
  const log = logger.child({ route: "GET /api/admin/audit" });
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = querySchema.safeParse(params);
    if (!parsed.success) {
      throw AppError.validation("Invalid query", parsed.error.flatten());
    }
    const q = parsed.data;

    const where: Prisma.AuditLogWhereInput = {
      ...(q.category ? { category: q.category } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.actorUserId ? { actorUserId: q.actorUserId } : {}),
      ...(q.targetType ? { targetType: q.targetType } : {}),
      ...(q.targetId ? { targetId: q.targetId } : {}),
      ...(q.severity ? { severity: q.severity } : {}),
      ...(q.since ? { createdAt: { gte: q.since } } : {}),
    };

    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        actor: { select: { id: true, email: true, fullName: true } },
      },
    });

    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;

    return NextResponse.json({
      entries: page.map((r) => ({
        id: r.id,
        category: r.category,
        action: r.action,
        severity: r.severity,
        summary: r.summary,
        actor: r.actor
          ? { id: r.actor.id, email: r.actor.email, name: r.actor.fullName }
          : { id: null, email: null, name: r.actorLabel },
        ipAddress: r.ipAddress,
        targetType: r.targetType,
        targetId: r.targetId,
        metadata: r.metadata,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) {
      log.error("audit query failed", { error: (err as Error).message });
    }
    return NextResponse.json(body, { status });
  }
}
