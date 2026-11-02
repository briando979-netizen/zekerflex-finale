import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { env } from "@/lib/env";
import { SECTOR_TEMPLATES, THEME_PRESETS } from "@/lib/sites/types";
import { createSchema, siteSaveSchema } from "@/lib/sites/schema";
import { companyDefaults, mayPublish, siteTenantOf } from "@/lib/sites/access";
import { createSite, saveSite, siteOfTenant } from "@/lib/sites/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const addressOf = (slug: string) => `${env.APP_BASE_URL.replace(/\/+$/, "")}/site/${slug}`;

// GET /api/werkgever/sites — my company's website (or null), the templates, and what we already know.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const tenantId = await siteTenantOf(p);
    const [site, defaults, canPublish] = await Promise.all([siteOfTenant(tenantId), companyDefaults(tenantId, p), mayPublish(p, tenantId)]);
    return NextResponse.json({
      site,
      address: site ? addressOf(site.slug) : null,
      templates: SECTOR_TEMPLATES.map(({ id, naam, omschrijving, theme }) => ({ id, naam, omschrijving, theme })),
      presets: THEME_PRESETS,
      defaults,
      canPublish,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST — start a website from a sector template.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const tenantId = await siteTenantOf(p);
    const input = createSchema.parse(await request.json().catch(() => ({})));
    const site = await createSite(tenantId, { userId: p.userId, name: p.fullName }, input);
    return NextResponse.json({ site, address: addressOf(site.slug) }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// PUT — save the pages, theme and company details (the live site changes only on publish).
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const tenantId = await siteTenantOf(p);
    const site = await siteOfTenant(tenantId);
    if (!site) throw AppError.notFound("Maak eerst een website.");
    const saved = await saveSite(site.id, siteSaveSchema.parse(await request.json().catch(() => ({}))));
    return NextResponse.json({ site: saved });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
