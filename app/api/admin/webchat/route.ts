import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { appendMessage, getConversation, listConversations, markRead, setStatus } from "@/lib/chat/webchat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/webchat[?id=…][&status=open|human|closed] — website-chat tickets, or one conversation.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    const conv = await getConversation(id);
    if (conv) await markRead(id);
    return NextResponse.json({ conversation: conv });
  }
  const status = url.searchParams.get("status");
  const filter = status === "open" || status === "human" || status === "closed" ? status : "all";
  const list = await listConversations(filter, 200);
  return NextResponse.json({
    conversations: list.map((c) => ({
      id: c.id,
      status: c.status,
      startedAt: c.startedAt,
      lastAt: c.lastAt,
      page: c.page ?? null,
      unread: c.unread,
      count: c.messages.length,
      preview: [...c.messages].reverse().find((m) => m.role === "user")?.content.slice(0, 120) ?? "",
    })),
  });
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), id: z.string().min(12).max(48), text: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("takeover"), id: z.string().min(12).max(48) }),
  z.object({ action: z.literal("release"), id: z.string().min(12).max(48) }),
  z.object({ action: z.literal("close"), id: z.string().min(12).max(48) }),
]);

// POST /api/admin/webchat — reply as an agent (takes the conversation over), hand back to the AI, or close.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const input = schema.parse(await request.json().catch(() => ({})));
  if (input.action === "reply") {
    const first = principal.fullName.split(" ")[0] ?? "ZekerFlex";
    await appendMessage(input.id, { role: "agent", content: input.text, by: `${first} (ZekerFlex)` });
    await setStatus(input.id, "human");
  } else {
    await setStatus(input.id, input.action === "takeover" ? "human" : input.action === "release" ? "open" : "closed");
  }
  await recordAudit({ category: "ADMIN", action: `webchat.${input.action}`, actorUserId: principal.userId, summary: `Website-chat ${input.id}: ${input.action}`, targetType: "webchat", targetId: input.id });
  return NextResponse.json({ conversation: await getConversation(input.id) });
});
