import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { insurancePdf } from "@/lib/pdf/insurance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/insurance — download your ZekerFlex insurance certificate (PDF).
export async function GET(): Promise<Response> {
  try {
    const p = await requirePrincipal();
    const doc = await insurancePdf(p.userId);
    if (!doc) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Niet gevonden" } }, { status: 404 });
    return new Response(new Uint8Array(doc.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${doc.filename}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
