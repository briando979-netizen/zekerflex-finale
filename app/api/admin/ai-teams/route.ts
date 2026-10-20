import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { kvGet } from "@/lib/storage/kv";
import { llmConfigProblem } from "@/lib/ai/client";
import { feed, proposals, runTeams, setProposalStatus, TEAMS } from "@/lib/ai-teams";
import { executeProposal } from "@/lib/ai-teams/execute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/admin/ai-teams — teams, the live report and open proposals.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [items, props, lastRun] = await Promise.all([feed(200), proposals(), kvGet<string>("ai-teams-lastrun")]);
  return NextResponse.json({ teams: TEAMS, feed: items, proposals: props.filter((p) => p.status === "open"), done: props.filter((p) => p.status !== "open").slice(0, 30), lastRun, modelConnected: !llmConfigProblem() });
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("run") }),
  z.object({ action: z.literal("approve"), id: z.string().min(3) }),
  z.object({ action: z.literal("dismiss"), id: z.string().min(3) }),
]);

// POST /api/admin/ai-teams — run all teams now, or approve / dismiss a proposal.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const input = schema.parse(await request.json().catch(() => ({})));
  if (input.action === "run") return NextResponse.json(await runTeams());
  const p = (await proposals()).find((x) => x.id === input.id && x.status === "open");
  if (!p) throw AppError.notFound("Voorstel niet gevonden of al afgehandeld");
  if (input.action === "dismiss") return NextResponse.json({ proposal: await setProposalStatus(p.id, "dismissed") });
  const result = p.action ? await executeProposal(p.action, principal.email) : "geen actie nodig";
  await recordAudit({ category: "ORCHESTRATION", action: "ai_team.proposal_executed", actorUserId: principal.userId, summary: `AI-team ${p.team}: ${p.title} — ${result}`, targetType: "ai-proposal", targetId: p.id });
  return NextResponse.json({ proposal: await setProposalStatus(p.id, "done", result) });
});
