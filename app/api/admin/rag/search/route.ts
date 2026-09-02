import { NextResponse } from "next/server";
import { z } from "zod";
import { RagSourceType } from "@prisma/client";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { retrieveContext } from "@/lib/rag/query";
import { chunkStats } from "@/lib/rag/store";
import { isRagEnabled } from "@/lib/rag/embed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().min(2).max(400),
  types: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(25).default(8),
});

// GET /api/admin/rag/search?q=...&types=CODE,LEGAL
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

    const parsed = querySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_FAILED", message: "Invalid query" } },
        { status: 422 },
      );
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
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
