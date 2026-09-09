import { NextResponse } from "next/server";
import { z } from "zod";
import { RagSourceType } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { retrieveContext } from "@/lib/rag/query";
import { chunkStats } from "@/lib/rag/store";
import { isRagEnabled } from "@/lib/rag/embed";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().min(2).max(400),
  types: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(25).default(8),
});

// GET /api/admin/rag/search?q=...&types=CODE,LEGAL
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    throw AppError.validation("Invalid query", parsed.error.flatten());
  }
  const { q, types, limit } = parsed.data;
  const sourceTypes = types
    ?.split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t): t is RagSourceType => t in RagSourceType);

  const { hits } = await retrieveContext(q, {
    limit,
    ...(sourceTypes && sourceTypes.length > 0 ? { sourceTypes } : {}),
  });

  return NextResponse.json({
    enabled: isRagEnabled(),
    stats: await chunkStats(),
    hits: hits.map((h) => ({
      sourceType: h.sourceType,
      sourceRef: h.sourceRef,
      title: h.title,
      score: Number(h.score.toFixed(4)),
      excerpt: h.content.slice(0, 500),
    })),
  });
});
