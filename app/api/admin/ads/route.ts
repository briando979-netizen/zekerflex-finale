import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { generateAdCopy, type AdAudience } from "@/lib/ads/generate";
import { saveAd, listAds } from "@/lib/ads/store";
import { generateImage } from "@/lib/ai/images";
import { composePrompt, NEGATIVE_PROMPT } from "@/lib/ai/image-prompts";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // image render on a local CPU backend can be slow — see app/api/admin/studio/generate/route.ts

const IMAGE_BRIEF: Record<AdAudience, string> = {
  freelancer:
    "a Dutch freelance worker in their late 20s, confident and relaxed, walking through an Amsterdam street, checking their phone",
  werkgever:
    "a Dutch branch manager in their 40s on a retail shop floor holding a tablet, calm and in control, colleagues working softly out of focus behind",
};

// GET /api/admin/ads — list previously generated ads (newest first).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ ads: await listAds() });
});

const schema = z.object({
  audience: z.enum(["freelancer", "werkgever"]),
  angle: z.string().trim().max(300).optional(),
  withImage: z.boolean().default(true),
});

// POST /api/admin/ads — generate ad copy (always) and a matching image (best
// effort — if the local image backend isn't configured/reachable, the ad is
// still saved with just the copy, never silently faked).
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const input = schema.parse(
    await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }),
  );

  const copy = await generateAdCopy({ audience: input.audience, ...(input.angle ? { angle: input.angle } : {}) });

  let imageB64: string | null = null;
  let imageMimeType: string | null = null;
  let imagePrompt: string | null = null;
  if (input.withImage) {
    try {
      const prompt = input.angle
        ? composePrompt(IMAGE_BRIEF[input.audience], input.angle)
        : composePrompt(IMAGE_BRIEF[input.audience]);
      const image = await generateImage({
        prompt,
        negativePrompt: NEGATIVE_PROMPT,
        width: 1024,
        height: 1024,
        purpose: "ad-generator",
      });
      imageB64 = image.b64;
      imageMimeType = image.mimeType;
      imagePrompt = prompt;
    } catch (err) {
      logger.warn("ad image generation skipped (ad still saved with copy only)", { error: (err as Error).message });
    }
  }

  const ad = await saveAd({
    audience: input.audience,
    angle: input.angle ?? null,
    ...copy,
    imageB64,
    imageMimeType,
    imagePrompt,
    createdById: principal.userId,
  });

  await recordAudit({
    category: "ADMIN",
    action: "ads.generated",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `Advertentie gegenereerd voor ${input.audience}${imageB64 ? " (met beeld)" : " (alleen tekst)"}`,
    targetType: "ad",
    targetId: ad.id,
    metadata: { audience: input.audience, angle: input.angle ?? null, hasImage: Boolean(imageB64) },
  });

  return NextResponse.json({ ad }, { status: 201 });
});
