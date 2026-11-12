import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { wisTestAlsBeheerder } from "@/lib/boekhouding/beheer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const invoer = z.object({ administratieId: z.string().trim().min(1).max(64) });

// POST of DELETE { administratieId }: wist een TEST-administratie met alles erin. Een ECHTE geeft 409 (ECHT_ONVERANDERLIJK).
const wis = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const body = invoer.parse(
    await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan: stuur een JSON-body met administratieId.");
    }),
  );
  const uitkomst = await wisTestAlsBeheerder(body.administratieId);
  await recordAudit({
    category: "ADMIN",
    action: "boekhouding.test_gewist",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: "Boekhouding: testadministratie gewist",
    targetType: "boekAdministratie",
    targetId: body.administratieId,
    metadata: { verwijderd: uitkomst.verwijderd },
  });
  return NextResponse.json(uitkomst);
});

export const POST = wis;
export const DELETE = wis;
