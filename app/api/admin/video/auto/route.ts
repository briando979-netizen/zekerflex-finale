import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { maakAutoVideo } from "@/lib/video/auto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const invoer = z.object({
  onderwerp: z.string().trim().min(3).max(400),
  formaat: z.enum(["9:16", "16:9", "1:1", "4:5"]).default("9:16"),
  lengte: z.coerce.number().int().min(10).max(90).default(30),
  stijl: z.enum(["zakelijk", "vrolijk", "stoer", "rustig", "luxe"]).default("vrolijk"),
  stem: z.boolean().default(true),
  stemNaam: z.enum(["Kore", "Aoede", "Leda", "Charon", "Puck", "Orus"]).default("Kore"),
  aiFotos: z.boolean().default(true),
  beeldModel: z.enum(["gemini-3.1-flash-image", "gemini-3-pro-image"]).optional(),
  ondertiteling: z.boolean().default(true),
});

// POST: laat de AI een hele video maken (scenario, beelden, stem, ondertiteling).
// Het resultaat is een opgeslagen project dat de editor meteen opent.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = invoer.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Beschrijf in een paar woorden waar de video over gaat.");
  const { beeldModel, ...rest } = parsed.data;
  const resultaat = await maakAutoVideo({ ...rest, ...(beeldModel ? { beeldModel } : {}) });
  await recordAudit({
    category: "ADMIN",
    action: "video.auto",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `AI-video gemaakt: ${resultaat.project.naam}`,
    metadata: { formaat: rest.formaat, lengte: rest.lengte, clips: resultaat.project.clips.length },
  });
  return NextResponse.json(resultaat);
});
