import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { STRUCTUUR, STRUCTUUR_STATUSSEN } from "@/lib/accountant/structuur";
import { bewaarVraag, getStructuur, getVragen, zetStructuur } from "@/lib/accountant/store";
import { beantwoordVraag } from "@/lib/accountant/vraag";
import { KENNIS } from "@/lib/accountant/kennis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/admin/accountant: structuurcheck met status en de laatste vragen.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () =>
  NextResponse.json({ structuur: await getStructuur(), vragen: await getVragen(), kennisRegels: KENNIS.length }),
);

const invoer = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("structuur"), id: z.enum(STRUCTUUR.map((p) => p.id) as [string, ...string[]]), status: z.enum(STRUCTUUR_STATUSSEN as [string, ...string[]]) }),
  z.object({ actie: z.literal("vraag"), vraag: z.string().trim().min(5, "Typ je vraag iets uitgebreider.").max(500) }),
]);

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const input = invoer.parse(
    await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
    }),
  );
  if (input.actie === "structuur") {
    const structuur = await zetStructuur(input.id, input.status as "open" | "bezig" | "klaar");
    await recordAudit({
      category: "ADMIN",
      action: "accountant.structuur",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `Structuurcheck: ${input.id} op ${input.status} gezet`,
      targetType: "accountant",
      targetId: input.id,
    });
    return NextResponse.json({ structuur });
  }
  const antwoord = await beantwoordVraag(input.vraag);
  await bewaarVraag(input.vraag, antwoord);
  return NextResponse.json({ antwoord });
});
