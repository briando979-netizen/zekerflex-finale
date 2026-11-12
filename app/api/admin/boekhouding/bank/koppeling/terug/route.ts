import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { voltooiToestemming } from "@/lib/boekhouding/bank/koppeling/toestemming";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?code&state: waar de bank de eigenaar naartoe terugstuurt. Dit is een gewone beheerroute (alleen PLATFORM_ADMIN,
// de eigenaar is ingelogd in dezelfde browser), dus geen openbare route. De code en het state-token komen nergens in een
// log; het state-token is eenmalig en hoort bij degene die de aanvraag startte. Daarna terug naar Beheer, Boekhouding.
// Achter Caddy is request.url intern: het terugsturen gaat daarom naar AUTH_URL.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const q = new URL(request.url).searchParams;
  const code = q.get("code") ?? "";
  const state = q.get("state") ?? "";
  const basis = env.AUTH_URL ?? "";
  const terug = (uitslag: "gekoppeld" | "mislukt") => NextResponse.redirect(`${basis.replace(/\/+$/, "")}/admin/boekhouding?bankkoppeling=${uitslag}`, { status: 303, headers: { "Cache-Control": "private, no-store" } });
  if (!basis) throw AppError.validation("Het adres van de site (AUTH_URL) is niet ingesteld.");
  if (q.get("error") || !code || !state) {
    await recordAudit({ category: "ADMIN", action: "boekhouding.bankkoppeling_geweigerd", actorUserId: principal.userId, actorLabel: "user", severity: "warning", summary: "Boekhouding: de toestemming bij de bank is niet gegeven" });
    return terug("mislukt");
  }
  const r = await voltooiToestemming({ code, state, doorId: principal.userId });
  await recordAudit({
    category: "ADMIN",
    action: "boekhouding.bankkoppeling_gekoppeld",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: "Boekhouding: bankkoppeling toestemming gegeven",
    targetType: "boekBankRekening",
    targetId: r.bankRekeningId,
    metadata: { geldigTot: r.geldigTot.slice(0, 10) },
  });
  return terug("gekoppeld");
});
