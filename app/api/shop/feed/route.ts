import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { bouwProductFeed } from "@/lib/shop/feed";
import { laadProducten } from "@/lib/shop/agent-handel-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/shop/feed — de productfeed (Google Shopping-formaat) voor Google Merchant Center, Meta Commerce Manager
// (Instagram- en Facebook-shop) en TikTok. Openbaar (de winkel zelf is ook openbaar), alleen lezen, tien minuten
// te cachen: de portalen halen hem één keer per dag op. Geen persoonsgegevens: alleen producten.
export async function GET(): Promise<NextResponse> {
  try {
    const basis = env.APP_BASE_URL.replace(/\/+$/, "");
    const { xml, aantal } = bouwProductFeed(await laadProducten(), basis);
    return new NextResponse(xml, {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=600, s-maxage=600",
        "x-zekerflex-feed-items": String(aantal),
      },
    });
  } catch (e) {
    logger.error("shop feed mislukt", { error: (e as Error).message });
    return new NextResponse("<?xml version=\"1.0\"?><rss version=\"2.0\"><channel><title>ZekerFlex Shop</title></channel></rss>", { status: 500, headers: { "content-type": "application/xml; charset=utf-8" } });
  }
}
