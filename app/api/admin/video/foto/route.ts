import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { editImage, generateImage } from "@/lib/ai/images";
import { STYLE_SUFFIX } from "@/lib/ai/image-prompts";
import { bestandAdres, bewaarBestand } from "@/lib/video/bestanden";
import { fotoAlsData } from "@/lib/video/foto-bron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MATEN = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
} as const;

const invoer = z.object({
  prompt: z.string().trim().min(2).max(800),
  formaat: z.enum(["9:16", "16:9", "1:1", "4:5"]).default("9:16"),
  model: z.enum(["gemini-3.1-flash-image", "gemini-3-pro-image"]).optional(),
  grootte: z.enum(["1K", "2K", "4K"]).optional(),
  /** Fotografisch (stijl toevoegen) of precies zoals beschreven. */
  foto: z.boolean().default(true),
  /** Bewerken: een foto uit de editor, een eigen stockfoto of Site-media. */
  bron: z.string().max(200).optional(),
});

// POST: maak (of bewerk) een foto met de beeld-AI en zet hem in de bestanden van de editor.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = invoer.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Beschrijf de foto in een paar woorden.");
  const i = parsed.data;
  const { width, height } = MATEN[i.formaat];
  const img = i.bron
    ? await editImage({ imageB64: (await fotoAlsData(i.bron, 2048)).dataUrl, prompt: i.prompt, width, height, purpose: "video:edit", ...(i.model ? { geminiModel: i.model } : {}) })
    : await generateImage({
        prompt: i.foto ? `${i.prompt}, ${STYLE_SUFFIX}` : i.prompt,
        width,
        height,
        purpose: "video:foto",
        ...(i.model ? { geminiModel: i.model } : {}),
        ...(i.grootte ? { geminiGrootte: i.grootte } : {}),
      });
  const item = await bewaarBestand(Buffer.from(img.b64, "base64"), `AI-foto ${i.prompt.slice(0, 50)}`, { herkomst: "ai-foto" });
  await recordAudit({
    category: "ADMIN",
    action: i.bron ? "video.foto.edit" : "video.foto",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `AI-foto voor de video-editor (${i.formaat})`,
    metadata: { backend: img.backend, model: i.model ?? null },
  });
  return NextResponse.json({ ok: true, item, adres: bestandAdres(item.id) });
});
