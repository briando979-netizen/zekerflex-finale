import { NextResponse } from "next/server";
import { indexNowKey } from "@/lib/seo/indexnow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// IndexNow keyLocation in the site root. A key file only vouches for URLs in
// its own folder and below, so the older /api/indexnow-key could only submit
// /api/* URLs (IndexNow answered 422 for every page).
export function GET(): Response {
  const key = indexNowKey();
  if (!key) return NextResponse.json({ error: "INDEXNOW_KEY niet ingesteld" }, { status: 404 });
  return new Response(key, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
