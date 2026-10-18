import { NextResponse } from "next/server";
import { fixedWindow } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { getConversation } from "@/lib/chat/webchat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/chat/conversation/:id?since=<n> — the widget polls this for agent
// replies. Public (like the chat itself); the id is an unguessable token held
// only by the visitor's browser, and only agent messages + status are returned.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const gate = await fixedWindow(`rl:webchat-poll:${clientIp(request)}`, 40, 60);
  if (!gate.ok) return NextResponse.json({ messages: [], status: "open" }, { status: 429 });
  const { id } = await params;
  const conv = await getConversation(id);
  if (!conv) return NextResponse.json({ messages: [], status: "open", total: 0 });
  const since = Math.max(0, Number(new URL(request.url).searchParams.get("since")) || 0);
  const agent = conv.messages.map((m, i) => ({ ...m, i })).filter((m) => m.role === "agent" && m.i >= since);
  return NextResponse.json({ status: conv.status, total: conv.messages.length, messages: agent.map((m) => ({ content: m.content, by: m.by ?? "ZekerFlex", at: m.at })) });
}
