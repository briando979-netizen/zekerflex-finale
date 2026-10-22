import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { env } from "@/lib/env";
import { recordAudit } from "@/lib/audit";
import { employerTenant } from "@/lib/webhooks/employer";
import {
  calendarToken,
  CHAT_HOOK_EVENTS,
  getChatHook,
  removeChatHook,
  setChatHook,
  testChatHook,
  type ChatHookEvent,
} from "@/lib/integrations/employer-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const base = () => env.APP_BASE_URL.replace(/\/+$/, "");
const calendarUrl = (token: string) => `${base()}/api/public/v1/calendar/${token}.ics`;

// GET — the company's no-code integrations: agenda-feed + Slack/Teams.
export async function GET(): Promise<NextResponse> {
  try {
    const { tenantId } = await employerTenant(false);
    const hook = await getChatHook(tenantId);
    return NextResponse.json({
      calendarUrl: calendarUrl(await calendarToken(tenantId)),
      chatHook: hook ? { kind: hook.kind, events: hook.events, url: hook.url.replace(/\/[^/]{6,}$/, "/…") } : null,
      chatEvents: CHAT_HOOK_EVENTS,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const eventKeys = CHAT_HOOK_EVENTS.map((e) => e.key) as [ChatHookEvent, ...ChatHookEvent[]];
const schema = z.union([
  z.object({ action: z.literal("calendar-rotate") }),
  z.object({ action: z.literal("chat-set"), url: z.string().url().max(500), events: z.array(z.enum(eventKeys)).min(1) }),
  z.object({ action: z.literal("chat-remove") }),
  z.object({ action: z.literal("chat-test") }),
]);

// POST — manage them (hoofdbeheerder only).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { principal, tenantId } = await employerTenant(true);
    const body = schema.parse(await request.json().catch(() => ({})));
    if (body.action === "calendar-rotate") {
      const token = await calendarToken(tenantId, true);
      await recordAudit({ category: "SECURITY", action: "integration.calendar_rotated", actorUserId: principal.userId, actorLabel: "user", summary: "Agenda-link vernieuwd (oude link werkt niet meer)", targetType: "tenant", targetId: tenantId });
      return NextResponse.json({ calendarUrl: calendarUrl(token) });
    }
    if (body.action === "chat-set") {
      let hook;
      try {
        hook = await setChatHook(tenantId, body.url, body.events);
      } catch (err) {
        throw AppError.validation((err as Error).message);
      }
      await recordAudit({ category: "ADMIN", action: "integration.chat_hook_set", actorUserId: principal.userId, actorLabel: "user", summary: `${hook.kind === "slack" ? "Slack" : hook.kind === "teams" ? "Teams" : "Chat"}-koppeling ingesteld`, targetType: "tenant", targetId: tenantId });
      return NextResponse.json({ ok: true, kind: hook.kind, test: await testChatHook(tenantId) });
    }
    if (body.action === "chat-remove") {
      await removeChatHook(tenantId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: await testChatHook(tenantId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
