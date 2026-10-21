import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { mergeDuplicateDirectThreads } from "@/lib/messaging/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/admin/chat/merge-duplicates — merge every pair's duplicate direct
// threads (old one-thread-per-klus behaviour) into one main thread.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (_request, { principal }) => {
  const result = await mergeDuplicateDirectThreads();
  await recordAudit({
    category: "ADMIN",
    action: "chat.duplicates_merged",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} voegde dubbele gesprekken samen: ${result.merged} gesprekken in ${result.pairs} paren, ${result.messagesMoved} berichten verplaatst`,
    targetType: "chat",
    targetId: "all",
    metadata: result,
  });
  return NextResponse.json({ ok: true, ...result });
});
