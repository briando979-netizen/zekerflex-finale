import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { mayPublish, siteTenantOf } from "@/lib/sites/access";
import { listContactMessages, publishSite, setLiveBuild, siteOfTenant } from "@/lib/sites/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["publiceer", "terug", "offline"]),
  buildId: z.string().max(40).optional(),
});

// POST /api/werkgever/sites/publish — put the current version online, go back to an
// earlier one, or take the site offline. Needs the Website-beheer subscription.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const tenantId = await siteTenantOf(p);
    const site = await siteOfTenant(tenantId);
    if (!site) throw AppError.notFound("Maak eerst een website.");
    const input = schema.parse(await request.json().catch(() => ({})));
    const by = { userId: p.userId, name: p.fullName };
    if (input.action === "offline") return NextResponse.json({ site: await setLiveBuild(site.id, null, by) });
    if (!(await mayPublish(p, tenantId))) {
      throw AppError.forbidden("Online zetten hoort bij Website-beheer. Neem een abonnement via Website; bouwen en bekijken kan altijd.");
    }
    if (input.action === "terug") {
      if (!input.buildId) throw AppError.validation("Kies een versie.");
      return NextResponse.json({ site: await setLiveBuild(site.id, input.buildId, by) });
    }
    return NextResponse.json({ site: await publishSite(site.id, by) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// GET — messages visitors sent through the contact form.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const site = await siteOfTenant(await siteTenantOf(p));
    return NextResponse.json({ messages: site ? await listContactMessages(site.id) : [] });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
