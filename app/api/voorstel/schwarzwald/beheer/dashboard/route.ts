import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http/errors";
import { begeleiderTellingen } from "@/lib/voorstel/begeleider-regels";
import { AGENDA } from "@/lib/voorstel/schwarzwald-agenda";
import { eisBeheerder } from "@/lib/voorstel/schwarzwald-accounts";
import { alleBoekingen } from "@/lib/voorstel/schwarzwald-boekingen";
import { dashboardCijfers } from "@/lib/voorstel/schwarzwald-crm";
import { agendaConfig } from "@/lib/voorstel/schwarzwald-instellingen";
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
    const [cijfers, reviews, sollicitaties, wachtlijst, boekingen, cfg] = await Promise.all([
      dashboardCijfers(),
      alleReviews(),
      alleSollicitaties(),
      alleWachtplekken(),
      alleBoekingen(),
      agendaConfig(),
    ]);
    const duur = Object.fromEntries([...Object.entries(AGENDA), ...Object.entries(cfg.regels)].map(([slug, r]) => [slug, r.duurMin]));
    const lijst = teDoen({
      ...begeleiderTellingen(boekingen, duur, cijfers.vandaag),
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
