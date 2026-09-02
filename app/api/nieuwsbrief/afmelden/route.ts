import { NextResponse } from "next/server";
import { unsubscribe } from "@/lib/newsletter/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function token(req: Request): string {
  return new URL(req.url).searchParams.get("token") ?? "";
}

// RFC 8058 one-click unsubscribe (mail clients POST here).
export async function POST(req: Request): Promise<NextResponse> {
  await unsubscribe(token(req)).catch(() => null);
  return NextResponse.json({ ok: true });
}

// A plain link click lands here too — bounce to the friendly page.
export async function GET(req: Request): Promise<NextResponse> {
  const t = token(req);
  await unsubscribe(t).catch(() => null);
  return NextResponse.redirect(new URL(`/nieuwsbrief/afmelden?done=1`, req.url));
}
