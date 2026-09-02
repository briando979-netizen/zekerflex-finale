import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { imageHealth } from "@/lib/ai/images";
import { PROMPT_PRESETS } from "@/lib/ai/image-prompts";
import { photoStatus, MARKETING_PHOTOS } from "@/lib/marketing/photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/studio — backend health + slot status + presets.
export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const [health] = await Promise.all([imageHealth()]);
    return NextResponse.json({
      health,
      slots: photoStatus().map((s) => ({ ...s, spec: MARKETING_PHOTOS[s.key] })),
      presets: PROMPT_PRESETS.map((p) => ({ key: p.key, label: p.label, slot: p.slot, aspect: p.aspect })),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
