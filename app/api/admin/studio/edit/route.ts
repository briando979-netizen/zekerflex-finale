import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { editImage } from "@/lib/ai/images";
import { NEGATIVE_PROMPT, aspectToSize } from "@/lib/ai/image-prompts";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/admin/studio/edit — bewerkt een bestaande foto met een instructie
// (img2img) op de self-hosted beeldgenerator. De soevereine tegenhanger van
// "Nano Banana": geen cloud, geen credits.
const bodySchema = z.object({
  imageB64: z.string().min(16).max(6_000_000), // base64 bron (JSON-body-limiet ~4,5 MB op Vercel)
  instruction: z.string().trim().min(2).max(600),
  negativePrompt: z.string().trim().max(600).optional(),
  aspect: z.enum(["portrait", "landscape", "wide"]).optional(),
  denoise: z.coerce.number().min(0.05).max(1).optional(),
  steps: z.coerce.number().int().min(8).max(50).optional(),
  seed: z.coerce.number().int().optional(),
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const input = bodySchema.parse(
    await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }),
  );

  const aspect = input.aspect ?? "landscape";
  const { width, height } = aspectToSize(aspect);

  const image = await editImage({
    imageB64: input.imageB64,
    prompt: input.instruction,
    negativePrompt: input.negativePrompt ?? NEGATIVE_PROMPT,
    width,
    height,
    ...(input.denoise !== undefined ? { denoise: input.denoise } : {}),
    ...(input.steps ? { steps: input.steps } : {}),
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
    purpose: "studio:edit",
  });

  await recordAudit({
    category: "ADMIN",
    action: "studio.edit",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `Beeld bewerkt met instructie (${aspect}, ${width}x${height})`,
    metadata: { backend: image.backend },
  });

  return NextResponse.json({
    b64: image.b64,
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    seed: image.seed ?? input.seed ?? null,
    instruction: input.instruction,
    aspect,
  });
});
