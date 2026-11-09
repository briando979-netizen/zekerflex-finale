import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { bewaarApnsToken, isApnsToken, verwijderApnsToken } from "@/lib/notifications/push/apns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/me/apns  { token }  — de iPhone-app meldt zijn apparaatcode van Apple
// (lib/notifications/push/apns.ts). De app doet dit vanuit de ingelogde pagina zelf
// (WKWebView, eigen sessiecookie), bij elke start: Apple kan de code vervangen.
// DELETE /api/me/apns { token } — bij uitloggen of meldingen uit.

async function leesToken(request: Request): Promise<string> {
  const body = (await request.json().catch(() => ({}))) as { token?: unknown };
  if (!isApnsToken(body.token)) throw AppError.validation("Ongeldige apparaatcode");
  return body.token;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({ name: "apns-token", identifier: p.userId, limit: 30, windowSeconds: 3600 });
    await bewaarApnsToken(p.userId, await leesToken(request));
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await verwijderApnsToken(p.userId, await leesToken(request));
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return jsonError(err);
  }
}
