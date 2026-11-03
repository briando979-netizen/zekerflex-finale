import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { bouwer, bouwerGezond, bouwerIngesteld, bouwerInstellingen, bouwerLlm, type TaakKort } from "@/lib/bouwer/werker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin → ZekerFlex AI → Bouwer: lijst + nieuwe opdracht (zie lib/bouwer/werker.ts).

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [gezond, instellingen] = await Promise.all([bouwerGezond(), bouwerInstellingen()]);
  const lijst = gezond ? await bouwer<{ bezig: string | null; taken: TaakKort[] }>("/taken").catch(() => null) : null;
  return NextResponse.json({
    geinstalleerd: bouwerIngesteld(),
    online: Boolean(gezond?.ok),
    bezig: lijst?.bezig ?? gezond?.bezig ?? null,
    taken: lijst?.taken ?? [],
    instellingen,
  });
});

const schema = z.object({
  opdracht: z.string().trim().min(5).max(6000),
  // optioneel een schermafbeelding ("dit moet anders"); in de browser al verkleind
  afbeelding: z
    .string()
    .max(5_600_000)
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
    .optional(),
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Beschrijf de opdracht in 5 tot 6000 tekens (een afbeelding mag een PNG, JPEG of WebP van hooguit 4 MB zijn)");

  const llm = await bouwerLlm();
  const taak = await bouwer<TaakKort>("/taken", {
    method: "POST",
    body: { opdracht: parsed.data.opdracht, door: principal.email, llm, ...(parsed.data.afbeelding ? { afbeelding: parsed.data.afbeelding } : {}) },
  });

  await recordAudit({
    category: "ADMIN",
    action: "admin.bouwer.opdracht",
    severity: "info",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} gaf de Bouwer een opdracht (${llm.model}): ${parsed.data.opdracht.slice(0, 200)}`,
  });
  return NextResponse.json(taak, { status: 202 });
});
