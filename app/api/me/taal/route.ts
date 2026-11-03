import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { LOCALES } from "@/lib/i18n/config";
import { setUserLocale } from "@/lib/i18n/worker-locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/me/taal { locale } — remember the app language on the server, so
// pushes (sent without a cookie) can be written in it. Called by setLocale in
// components/i18n/I18nProvider.tsx with sendBeacon, right before the reload.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const raw: unknown = await request.json().catch(() => ({}));
    const { locale } = z.object({ locale: z.enum(LOCALES) }).parse(raw);
    await setUserLocale(principal.userId, locale);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
