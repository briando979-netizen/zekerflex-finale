import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http/errors";
import { eisBeheerder } from "@/lib/voorstel/schwarzwald-accounts";
import { dashboardCijfers } from "@/lib/voorstel/schwarzwald-crm";
import { alleReviews } from "@/lib/voorstel/schwarzwald-reviews";
import { alleSollicitaties } from "@/lib/voorstel/schwarzwald-sollicitaties";
import { alleWachtplekken } from "@/lib/voorstel/schwarzwald-wachtlijst";
import { teDoen } from "@/lib/voorstel/te-doen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Alle cijfers voor het beheer-dashboard in één keer, plus de lijst "Te doen"
// (alles wat aandacht vraagt, met het tabblad waar het team het afhandelt).
export async function GET(): Promise<NextResponse> {
  try {
    await eisBeheerder();
    const [cijfers, reviews, sollicitaties, wachtlijst] = await Promise.all([dashboardCijfers(), alleReviews(), alleSollicitaties(), alleWachtplekken()]);
    const lijst = teDoen({
      teBevestigen: cijfers.teBevestigen,
      nieuweAanvragen: cijfers.pijplijn.find((p) => p.status === "nieuw")?.aantal ?? 0,
      wachtOpAntwoord: cijfers.klanten.wachtOpAntwoord.length,
      reviewsNieuw: reviews.filter((r) => r.status === "nieuw").length,
      sollicitatiesNieuw: sollicitaties.filter((s) => s.status === "nieuw").length,
      wachtlijstVrij: wachtlijst.filter((w) => w.plekVrij).length,
      openTaken: cijfers.taken.length,
    });
    return NextResponse.json({ ...cijfers, teDoen: lijst });
  } catch (err) {
    return jsonError(err);
  }
}
