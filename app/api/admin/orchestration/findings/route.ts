import { NextResponse } from "next/server";
import { z } from "zod";
import { FindingSeverity, FindingStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z.nativeEnum(FindingStatus).optional(),
  severity: z.nativeEnum(FindingSeverity).optional(),
  runId: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// GET /api/admin/orchestration/findings
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    throw AppError.validation("Invalid query", parsed.error.flatten());
  }
  const q = parsed.data;
  const where: Prisma.OrchestrationFindingWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.severity ? { severity: q.severity } : {}),
    ...(q.runId ? { runId: q.runId } : {}),
  };
  const findings = await prisma.orchestrationFinding.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: q.limit,
  });
  return NextResponse.json({
    findings: findings.map((f) => ({
      id: f.id,
      runId: f.runId,
      severity: f.severity,
      category: f.category,
      title: f.title,
      detail: f.detail,
      actionKind: f.actionKind,
      actionPayload: f.actionPayload,
      status: f.status,
      createdAt: f.createdAt.toISOString(),
    })),
  });
});
