import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { listRecentTurns } from "@/lib/jarvis/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/jarvis/turns - recent turns + the live multi-agent panel.
export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

    const [turns, agentEvents] = await Promise.all([
      listRecentTurns(principal.userId),
      prisma.jarvisEvent.findMany({
        where: { kind: { in: ["AGENT_DELEGATION", "TOOL_CALL", "TOOL_RESULT"] } },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { agent: true, kind: true, title: true, createdAt: true, turnId: true },
      }),
    ]);

    const byAgent = new Map<string, { agent: string; lastTitle: string; lastKind: string; at: string; turnId: string }>();
    for (const e of agentEvents) {
      if (!byAgent.has(e.agent)) {
        byAgent.set(e.agent, {
          agent: e.agent,
          lastTitle: e.title,
          lastKind: e.kind,
          at: e.createdAt.toISOString(),
          turnId: e.turnId,
        });
      }
    }

    return NextResponse.json({
      turns: turns.map((t) => ({
        id: t.id,
        prompt: t.prompt,
        status: t.status,
        answer: t.answer,
        startedAt: t.startedAt.toISOString(),
        endedAt: t.endedAt?.toISOString() ?? null,
      })),
      agents: [...byAgent.values()],
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
