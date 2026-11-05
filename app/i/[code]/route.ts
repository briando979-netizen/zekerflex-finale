import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isCode } from "@/lib/incheck/regels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De korte link op de NFC-sticker en in de QR op het terminalscherm:
// zekerflex.com/i/<code>[?k=<code van dit moment>]. Een tik met de telefoon opent
// hem en komt op de incheckpagina van de kracht uit (na inloggen als dat nodig is).
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code } = await params;
  const base = new URL(env.APP_BASE_URL).origin;
  if (!isCode(code)) return NextResponse.redirect(`${base}/dashboard/incheck`, 302);
  const k = new URL(request.url).searchParams.get("k") ?? "";
  const q = new URLSearchParams({ t: code, ...(/^[A-HJ-NP-Z2-9]{6}$/.test(k) ? { k } : {}) });
  return NextResponse.redirect(`${base}/dashboard/incheck?${q}`, 302);
}
