import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { leesTaak, startGratisTaak } from "@/lib/video/gratis-taken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const invoer = z.object({
  omschrijving: z.string().trim().min(3).max(800),
  duur: z.coerce.number().min(1).max(10).default(4),
  formaat: z.enum(["9:16", "16:9", "1:1", "4:5"]).default("9:16"),
  kwaliteit: z.enum(["snel", "scherp"]).default("scherp"),
  fotoBron: z.string().max(200).optional(),
});

// POST: start een gratis AI-clip (LTX-2.3). Geeft de taak terug; vraag hem op met GET ?taak=.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = invoer.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Beschrijf in een paar woorden wat er in de clip gebeurt.");
  const { fotoBron, ...rest } = parsed.data;
  const taak = await startGratisTaak({ ...rest, ...(fotoBron ? { fotoBron } : {}) });
  await recordAudit({
    category: "ADMIN",
    action: "video.gratis",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `Gratis AI-clip gestart (${rest.formaat}, ${rest.duur} s${fotoBron ? ", van een foto" : ""})`,
    metadata: { formaat: rest.formaat, duur: rest.duur, kwaliteit: rest.kwaliteit },
  });
  return NextResponse.json({ ok: true, taak });
});

// GET ?taak=…: de stand van een clip.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request) => {
  const taak = await leesTaak(new URL(request.url).searchParams.get("taak") ?? "");
  if (!taak) throw AppError.notFound("Deze clip-opdracht bestaat niet (meer).");
  return NextResponse.json({ taak });
});
