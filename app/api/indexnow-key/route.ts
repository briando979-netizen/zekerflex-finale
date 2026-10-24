import { NextResponse } from "next/server";
import { indexNowKey } from "@/lib/seo/indexnow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// IndexNow keyLocation: serveert de key als platte tekst zodat Bing/Yandex
// kunnen verifiëren dat wij de site bezitten.
export function GET(): Response {
  const key = indexNowKey();
  if (!key) return NextResponse.json({ error: "INDEXNOW_KEY niet ingesteld" }, { status: 404 });
  return new Response(key, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
