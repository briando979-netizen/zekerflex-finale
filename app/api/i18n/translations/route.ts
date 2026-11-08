import { NextRequest, NextResponse } from "next/server";
import { loadTranslations } from "@/lib/i18n/translations";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const lang = request.nextUrl.searchParams.get("lang") || "nl";

  try {
    const translations = await loadTranslations(lang);
    return NextResponse.json({ lang, translations });
  } catch (err) {
    return NextResponse.json({ error: "Translations not found" }, { status: 404 });
  }
}
