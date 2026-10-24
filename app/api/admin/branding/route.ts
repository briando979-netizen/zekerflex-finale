import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { getBranding, setBranding } from "@/lib/branding/settings";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ branding: await getBranding() });
});

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Gebruik een hex-kleur zoals #0E5C4A");
const schema = z.object({ primaryHex: hex.optional(), mintHex: hex.optional() });

export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  const input = schema.parse(
    await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }),
  );
  const patch: Partial<{ primaryHex: string; mintHex: string }> = {};
  if (input.primaryHex !== undefined) patch.primaryHex = input.primaryHex;
  if (input.mintHex !== undefined) patch.mintHex = input.mintHex;
  const branding = await setBranding(patch);
  await recordAudit({
    category: "ADMIN",
    action: "branding.update",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: "Huisstijl-kleuren bijgewerkt",
  });
  return NextResponse.json({ branding });
});
