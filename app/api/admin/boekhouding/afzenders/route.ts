import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { leesEigenAfzenders, schrijfEigenAfzenders } from "@/lib/boekhouding/bonnen/afzenders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: de lijst eigen afzenders. PUT { afzenders: string[] }: vervangt de lijst (de server controleert elke regel).
// Alleen mail van deze afzenders wordt vanzelf geboekt, en dan alleen met geslaagde SPF en DKIM.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json({ afzenders: await leesEigenAfzenders() }));

const invoer = z.object({ afzenders: z.array(z.string().max(200)).max(200) });

export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const body = invoer.parse(
    await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan: stuur een JSON-body met afzenders.");
    }),
  );
  const afzenders = await schrijfEigenAfzenders(body.afzenders);
  await recordAudit({
    category: "ADMIN",
    action: "boekhouding.afzenders_gewijzigd",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: "Boekhouding: lijst eigen afzenders gewijzigd",
    targetType: "boekhouding",
    targetId: "eigen-afzenders",
    metadata: { aantal: afzenders.length },
  });
  return NextResponse.json({ afzenders });
});
