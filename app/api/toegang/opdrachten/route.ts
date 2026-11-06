import { NextResponse } from "next/server";
import { toErrorBody } from "@/lib/errors";
import { clientIp } from "@/lib/http/request";
import { enforceRateLimit } from "@/lib/rate-limit";
import { haalOpdrachten, kastjeGezien, vestigingVanToken } from "@/lib/locatie/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/toegang/opdrachten — het kastje vraagt elke 2 s of de beheerder op
// "Open" drukte (lib/locatie/toegang.ts, openHandmatig). Zelfde token als
// /api/toegang/kenteken. De opdrachten zijn na het ophalen weg.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "toegang-opdrachten", identifier: clientIp(request), limit: 120, windowSeconds: 60 });
    const h = request.headers.get("x-toegang-token");
    const auth = request.headers.get("authorization");
    const token = h?.trim() || (auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null);
    const hit = await vestigingVanToken(token);
    if (!hit) return NextResponse.json({ ok: false, reden: "token-onbekend" }, { status: 401 });
    const [opdrachten] = await Promise.all([haalOpdrachten(hit.branchId), kastjeGezien(hit.tenantId, hit.branchId, request.headers.get("x-apparaat"))]);
    return NextResponse.json({ ok: true, opdrachten });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
