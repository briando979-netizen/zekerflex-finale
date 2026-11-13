import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { dagenTotVerlopen, toestemmingStand } from "@/lib/boekhouding/bank/koppeling/kern";
import { bankkoppelingSleutelsAanwezig } from "@/lib/boekhouding/bank/koppeling/omgeving";
import { BANKKOPPELING_FLAG, haalBankOp } from "@/lib/boekhouding/bank/koppeling/ophalen";
import { alleKoppelingStaten } from "@/lib/boekhouding/bank/koppeling/opslag";
import { featureEnabled } from "@/lib/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PRIVE = { "Cache-Control": "private, no-store" };

// GET: de stand van de bankkoppeling per bankrekening (zonder sessie-id of IBAN): geldig tot, hoeveel dagen nog, laatste
// ophaling en de laatste foutcode.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const nu = new Date();
  const staten = await alleKoppelingStaten();
  return NextResponse.json(
    {
      aan: await featureEnabled(BANKKOPPELING_FLAG),
      sleutelsAanwezig: bankkoppelingSleutelsAanwezig(),
      rekeningen: staten.map(({ bankRekeningId, staat }) => ({
        bankRekeningId,
        aanbieder: staat.aanbieder,
        geldigTot: staat.geldigTot,
        toestemming: toestemmingStand(staat.geldigTot, nu),
        dagenTotVerlopen: dagenTotVerlopen(staat.geldigTot, nu),
        laatsteSucces: staat.laatsteSucces,
        laatsteFout: staat.laatsteFout,
      })),
    },
    { headers: PRIVE },
  );
});

// POST: nu ophalen (de knop "Nu ophalen"). Alleen als de vlag aan staat. Geen invoer; in het auditspoor alleen aantallen.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (_request, { principal }) => {
  const uitkomst = await haalBankOp();
  if (uitkomst.status === "klaar") {
    await recordAudit({
      category: "ADMIN",
      action: "boekhouding.bankkoppeling_opgehaald",
      actorUserId: principal.userId,
      actorLabel: "user",
      severity: uitkomst.rekeningen.some((r) => r.status !== "ok") ? "warning" : "info",
      summary: `Boekhouding: bank opgehaald, ${uitkomst.rekeningen.reduce((n, r) => n + r.nieuw, 0)} nieuwe transacties`,
      metadata: { rekeningen: uitkomst.rekeningen.length, nieuw: uitkomst.rekeningen.reduce((n, r) => n + r.nieuw, 0) },
    });
  }
  return NextResponse.json({ uitkomst }, { headers: PRIVE });
});
