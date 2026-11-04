import { NextResponse } from "next/server";
import { fixedWindow } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { haalGesprek } from "@/lib/sitechat/gesprek";
import { voorGast } from "@/lib/sitechat/regels";
import { SCHWARZWALD_KANAAL } from "@/lib/voorstel/schwarzwald-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/voorstel/schwarzwald/chat/<id>?sinds=<n> — de widget haalt hier
// berichten van het team en meldingen op. Het id is een willekeurig token uit
// de browser van de gast; alleen teamberichten en de status gaan terug.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const poort = await fixedWindow(`rl:sitechat-ververs:${clientIp(request)}`, 40, 60).catch(() => ({ ok: true }));
  if (!poort.ok) return NextResponse.json({ status: "ai", totaal: 0, berichten: [] }, { status: 429 });
  const { id } = await params;
  const g = await haalGesprek(SCHWARZWALD_KANAAL, id);
  if (!g) return NextResponse.json({ status: "ai", totaal: 0, berichten: [] });
  const sinds = Math.max(0, Math.floor(Number(new URL(request.url).searchParams.get("sinds")) || 0));
  return NextResponse.json(voorGast(g, sinds), { headers: { "Cache-Control": "no-store" } });
}
