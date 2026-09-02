import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { generateImage } from "@/lib/ai/images";
import {
  PROMPT_PRESETS,
  NEGATIVE_PROMPT,
  aspectToSize,
  composePrompt,
  enhancePrompt,
} from "@/lib/ai/image-prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const bodySchema = z.object({
  presetKey: z.string().max(60).optional(),
  idea: z.string().trim().max(600).optional(),
  extra: z.string().trim().max(400).optional(),
  negativePrompt: z.string().trim().max(600).optional(),
  aspect: z.enum(["portrait", "landscape", "wide"]).optional(),
  steps: z.coerce.number().int().min(8).max(50).optional(),
  seed: z.coerce.number().int().optional(),
  enhance: z.boolean().optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const log = logger.child({ route: "POST /api/admin/studio/generate" });
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

    const input = bodySchema.parse(
      await request.json().catch(() => {
        throw AppError.validation("Body must be JSON");
      }),
    );

    const preset = input.presetKey
      ? PROMPT_PRESETS.find((p) => p.key === input.presetKey)
      : undefined;

    let prompt: string;
    if (preset) {
      prompt = composePrompt(preset.base, input.extra);
    } else if (input.idea) {
      prompt = input.enhance ? await enhancePrompt(input.idea) : composePrompt(input.idea, input.extra);
    } else {
      throw AppError.validation("Kies een sjabloon of beschrijf zelf een idee.");
    }

    const aspect = input.aspect ?? preset?.aspect ?? "landscape";
    const { width, height } = aspectToSize(aspect);

    const image = await generateImage({
      prompt,
      negativePrompt: input.negativePrompt ?? NEGATIVE_PROMPT,
      width,
      height,
      ...(input.steps ? { steps: input.steps } : {}),
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
      purpose: `studio:${preset?.key ?? "custom"}`,
    });

    await recordAudit({
      category: "ADMIN",
      action: "studio.generate",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `Marketingbeeld gegenereerd (${aspect}, ${width}x${height})`,
      metadata: { preset: preset?.key ?? null, backend: image.backend },
    });

    return NextResponse.json({
      b64: image.b64,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      seed: image.seed ?? input.seed ?? null,
      prompt,
      aspect,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) log.error("studio generate failed", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
