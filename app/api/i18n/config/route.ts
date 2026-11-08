import { NextResponse } from "next/server";
import { getCurrency, getTimezone } from "@/lib/i18n/currency";
import { getDirection } from "@/lib/i18n/rtl";
import { getCulturalConfig } from "@/lib/i18n/cultural";

export async function GET(request: Request): Promise<NextResponse> {
  const lang = new URL(request.url).searchParams.get("lang") || "nl";

  return NextResponse.json({
    lang,
    currency: getCurrency(lang),
    timezone: getTimezone(lang),
    direction: getDirection(lang),
    cultural: getCulturalConfig(lang),
  });
}
