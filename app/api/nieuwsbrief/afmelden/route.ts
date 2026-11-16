import { NextResponse } from "next/server";
import { unsubscribeAny } from "@/lib/newsletter/unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function token(req: Request): string {
  return new URL(req.url).searchParams.get("token") ?? "";
}

// RFC 8058 one-click unsubscribe (mail clients POST here).
export async function POST(req: Request): Promise<NextResponse> {
  await unsubscribeAny(token(req)).catch(() => null);
  return NextResponse.json({ ok: true });
}

// A plain link click lands here too — bounce to the friendly page. Alleen met een geldige code "afgemeld" (16 nov 2026).
export async function GET(req: Request): Promise<NextResponse> {
  const t = token(req);
  const ok = await unsubscribeAny(t).catch(() => false);
  return NextResponse.redirect(new URL(ok ? "/nieuwsbrief/afmelden?done=1" : "/nieuwsbrief/afmelden?ongeldig=1", req.url));
}
