import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { getHostingConfig } from "@/lib/hosting/config";
import { applyDnsToCloudflare } from "@/lib/hosting/cloudflare";
import { SITE } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/hosting/apply — past de OPGESLAGEN DNS-records (incl. BIMI) toe
// op Cloudflare via het opgeslagen provider-API-token. Niet-destructief: alleen
// aanmaken/bijwerken, nooit verwijderen. Het token blijft server-side.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (_req, { principal }) => {
  const cfg = await getHostingConfig();
  if (!/cloudflare/i.test(cfg.api.provider)) {
    throw AppError.validation("Zet bij Provider-API 'Cloudflare' als provider en sla op.");
  }
  if (!cfg.api.token.trim()) {
    throw AppError.validation("Geen Cloudflare API-token ingesteld (nodig: Zone:Read + DNS:Edit).");
  }

  let host = "jouwdomein.nl";
  try {
    host = new URL(SITE.url).host.replace(/^www\./, "");
  } catch {
    /* fallback blijft staan */
  }

  let result;
  try {
    result = await applyDnsToCloudflare(cfg, host);
  } catch (e) {
    throw AppError.validation(`Toepassen op Cloudflare mislukt: ${e instanceof Error ? e.message : "onbekende fout"}`);
  }

  await recordAudit({
    category: "ADMIN",
    action: "admin.hosting.cloudflare_apply",
    severity: "info",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} paste DNS toe op Cloudflare-zone ${result.zone} (${result.created.length} nieuw, ${result.updated.length} bijgewerkt, ${result.errors.length} fouten)`,
  });

  return NextResponse.json(result);
});
