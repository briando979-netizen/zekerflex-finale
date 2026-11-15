import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { liveGesprek, liveStuur } from "@/lib/whatsapp/brug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Eén gesprek van de gekoppelde WhatsApp: GET de berichten, POST { tekst } een antwoord versturen (geeft het gesprek
// terug zoals de brug het nu heeft). Alleen PLATFORM_ADMIN; de audit noemt geen tekst of nummer.

const paramsSchema = z.object({ jid: z.string().min(5).max(120) });
const stuurSchema = z.object({ tekst: z.string().trim().min(1).max(4000) });

const jidUit = (ruw: string) => {
  try {
    return decodeURIComponent(ruw);
  } catch {
    throw AppError.validation("Onbekend gesprek.");
  }
};

export const GET = withAdminAccess<{ jid: string }>(["PLATFORM_ADMIN"], async (_request, { params }) => {
  const { jid } = paramsSchema.parse(params);
  return NextResponse.json({ gesprek: await liveGesprek(jidUit(jid)) }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withAdminAccess<{ jid: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const { jid } = paramsSchema.parse(params);
  const parsed = stuurSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Typ eerst een bericht.");
  const doel = jidUit(jid);
  await liveStuur(doel, parsed.data.tekst);
  await recordAudit({
    category: "ADMIN",
    action: "admin.whatsapp.verstuurd",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} stuurde een WhatsApp-bericht vanuit Admin`,
  });
  return NextResponse.json({ gesprek: await liveGesprek(doel) });
});
