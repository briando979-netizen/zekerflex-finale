import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { getHostingConfig } from "@/lib/hosting/config";
import { dnsProviderLabels, resolveDnsProvider } from "@/lib/hosting/dns/providers";
import { SITE } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/hosting/apply — past de OPGESLAGEN DNS-records (incl. BIMI) toe
// op de ingestelde DNS-provider (Provider-API → "Provider" bepaalt welke adapter).
// Niet-destructief: alleen aanmaken/bijwerken, nooit verwijderen. Het token
// blijft server-side.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const body = (await request.json().catch(() => ({}))) as { dryRun?: unknown };
  const dryRun = body.dryRun === true;

  const cfg = await getHostingConfig();
  const provider = resolveDnsProvider(cfg.api.provider);
  if (!provider) {
    throw AppError.validation(`Onbekende of lege provider. Ondersteund: ${dnsProviderLabels().join(", ")}. Vul er één in bij Provider-API en sla op.`);
  }
  if (!cfg.api.token.trim()) {
    throw AppError.validation(`Geen API-token ingesteld (nodig: ${provider.tokenHint}).`);
  }

  let host = "jouwdomein.nl";
  try {
    host = new URL(SITE.url).host.replace(/^www\./, "");
  } catch {
    /* fallback blijft staan */
  }

  let result;
  try {
    result = await provider.apply(cfg, host, { dryRun });
  } catch (e) {
    throw AppError.validation(`Toepassen op ${provider.label} mislukt: ${e instanceof Error ? e.message : "onbekende fout"}`);
  }

  // Een dry-run wijzigt niets → geen audit.
  if (!dryRun) {
    await recordAudit({
      category: "ADMIN",
      action: "admin.hosting.dns_apply",
      severity: "info",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} paste DNS toe via ${result.provider} op zone ${result.zone} (${result.created.length} nieuw, ${result.updated.length} bijgewerkt, ${result.errors.length} fouten)`,
    });
  }

  return NextResponse.json(result);
});
