import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { withAdminAccess } from "@/lib/auth/handlers";
import { siteSaveSchema } from "@/lib/sites/schema";
import { saveSite } from "@/lib/sites/store";
import { SECTOR_TEMPLATES, THEME_PRESETS } from "@/lib/sites/types";
import { editableProposalSite } from "@/lib/sales/website-proposal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// The website of a proposal in the builder (Admin → Websitevoorstellen →
// Aanpassen): the same API shape as /api/werkgever/sites, for one proposal's
// site. The proposal mark stays on, so the banner, noindex and inert form stay.
// GET — the site for the builder; PUT — save it (visitors see it after publishing)
// ---------------------------------------------------------------------------

export const GET = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_request, { params }) => {
  const site = await editableProposalSite(params.id);
  return NextResponse.json({
    site,
    address: `${env.APP_BASE_URL.replace(/\/+$/, "")}/site/${site.slug}`,
    templates: SECTOR_TEMPLATES.map(({ id, naam, omschrijving, theme }) => ({ id, naam, omschrijving, theme })),
    presets: THEME_PRESETS,
    defaults: site.bedrijf,
    canPublish: true,
  });
});

export const PUT = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params }) => {
  const site = await editableProposalSite(params.id);
  const json = await request.json().catch(() => {
    throw AppError.validation("Body moet JSON zijn");
  });
  return NextResponse.json({ site: await saveSite(site.id, siteSaveSchema.parse(json)) });
});
