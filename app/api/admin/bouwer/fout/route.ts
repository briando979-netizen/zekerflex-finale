import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { isErrorGroupId, listErrorGroups } from "@/lib/ops/error-journal";
import { foutOpdracht, kanBouwerOplossen } from "@/lib/bouwer/fout-opdracht";
import { bouwer, bouwerLlm, type TaakKort } from "@/lib/bouwer/werker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/bouwer/fout { id } — "Laat de Bouwer dit oplossen" bij een
// foutmelding. Alleen het id komt uit de browser; de opdracht bouwt de server
// zelf uit het foutenlogboek (zie lib/bouwer/fout-opdracht.ts voor de afbakening).
const schema = z.object({ id: z.string().refine(isErrorGroupId) });

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Onbekende melding");

  const groep = (await listErrorGroups()).find((g) => g.id === parsed.data.id);
  if (!groep) throw AppError.notFound("Deze melding staat niet (meer) in het logboek");
  if (!kanBouwerOplossen(groep)) throw AppError.validation("Deze melding kan tekst van bezoekers bevatten; die gaat niet naar de Bouwer");

  const llm = await bouwerLlm();
  const taak = await bouwer<TaakKort>("/taken", {
    method: "POST",
    body: { opdracht: foutOpdracht(groep), door: principal.email, llm },
  });

  await recordAudit({
    category: "ADMIN",
    action: "admin.bouwer.opdracht",
    severity: "info",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} liet de Bouwer foutmelding ${groep.id} oplossen (${llm.model}): ${groep.message.slice(0, 120)}`,
  });
  return NextResponse.json(taak, { status: 202 });
});
