import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { isVeoOperatie, veoStart, veoStatus } from "@/lib/ai/gemini-media";
import { bewaarBestand } from "@/lib/video/bestanden";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const invoer = z.object({
  prompt: z.string().trim().min(3).max(1000),
  verhouding: z.enum(["16:9", "9:16"]).default("9:16"),
});

// POST: laat Veo (Google) een echte AI-videoclip maken. Geeft de lopende opdracht terug.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = invoer.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Beschrijf in een paar woorden wat er in de clip gebeurt.");
  const operatie = await veoStart(parsed.data.prompt, parsed.data.verhouding);
  await recordAudit({
    category: "ADMIN",
    action: "video.clip",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `AI-videoclip gestart (${parsed.data.verhouding})`,
    metadata: { verhouding: parsed.data.verhouding },
  });
  return NextResponse.json({ ok: true, operatie });
});

// GET ?op=…&naam=…: is de clip klaar? Zo ja, dan staat hij bij de bestanden.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request) => {
  const url = new URL(request.url);
  const op = url.searchParams.get("op") ?? "";
  if (!isVeoOperatie(op)) throw AppError.validation("Onbekende video-opdracht.");
  const status = await veoStatus(op);
  if (!status.klaar) return NextResponse.json({ klaar: false });
  const item = await bewaarBestand(status.mp4, `AI-clip ${(url.searchParams.get("naam") ?? "").slice(0, 50)}`, { herkomst: "ai-clip", gemeld: "video/mp4", duur: 8 });
  return NextResponse.json({ klaar: true, item });
});
