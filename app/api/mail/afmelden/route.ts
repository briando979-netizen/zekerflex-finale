import { NextResponse } from "next/server";
import { findByToken, setCategory, setUnsubscribedAll } from "@/lib/mail/prefs";
import { isOptionalCategory } from "@/lib/mail/categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function apply(req: Request): Promise<boolean> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const cat = url.searchParams.get("c") ?? "";
  const rec = await findByToken(token);
  if (!rec) return false;
  if (cat && isOptionalCategory(cat)) await setCategory(rec.email, cat, false);
  else await setUnsubscribedAll(rec.email, true);
  return true;
}

// RFC 8058 one-click unsubscribe (mail clients POST here).
export async function POST(req: Request): Promise<NextResponse> {
  await apply(req).catch(() => false);
  return NextResponse.json({ ok: true });
}

// A plain link click — apply, then bounce to the preferences page.
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  await apply(req).catch(() => false);
  return NextResponse.redirect(
    new URL(`/mail/voorkeuren?token=${encodeURIComponent(token)}&done=1`, req.url),
  );
}
