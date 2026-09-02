import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { MARKETING_PHOTOS, saveMarketingPhoto, removeMarketingPhoto } from "@/lib/marketing/photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLOTS = Object.keys(MARKETING_PHOTOS) as (keyof typeof MARKETING_PHOTOS)[];

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    slot: z.enum(SLOTS as [string, ...string[]]),
    b64: z.string().min(64).max(20_000_000),
  }),
  z.object({
    action: z.literal("remove"),
    slot: z.enum(SLOTS as [string, ...string[]]),
  }),
]);

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

    const input = bodySchema.parse(
      await request.json().catch(() => {
        throw AppError.validation("Body must be JSON");
      }),
    );
    const slot = input.slot as keyof typeof MARKETING_PHOTOS;

    if (input.action === "remove") {
      await removeMarketingPhoto(slot);
      await recordAudit({
        category: "ADMIN",
        action: "studio.photo.remove",
        actorUserId: principal.userId,
        actorLabel: "user",
        summary: `Marketingfoto verwijderd: ${slot}`,
      });
      return NextResponse.json({ ok: true, slot, ready: false });
    }

    const bytes = Buffer.from(input.b64.replace(/^data:image\/\w+;base64,/, ""), "base64");
    if (bytes.length < 1024) throw AppError.validation("Afbeelding is leeg of ongeldig.");
    if (bytes.length > 12_000_000) throw AppError.validation("Afbeelding is te groot (max 12 MB).");

    const url = await saveMarketingPhoto(slot, bytes);
    await recordAudit({
      category: "ADMIN",
      action: "studio.photo.save",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `Marketingfoto geplaatst: ${slot} (${(bytes.length / 1024).toFixed(0)} kB)`,
      metadata: { slot, bytes: bytes.length },
    });
    return NextResponse.json({ ok: true, slot, ready: true, url });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
