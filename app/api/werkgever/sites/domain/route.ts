import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { mayPublish, siteTenantOf } from "@/lib/sites/access";
import { checkDomain, dnsRecords, getDomain, linkDomain, unlinkDomain } from "@/lib/sites/domain";
import { siteOfTenant } from "@/lib/sites/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("koppel"), domein: z.string().trim().min(1, "Vul je domeinnaam in.").max(300) }),
  z.object({ action: z.literal("controleer") }),
  z.object({ action: z.literal("ontkoppel") }),
]);

async function mySite() {
  const p = await requirePrincipal();
  const tenantId = await siteTenantOf(p);
  const site = await siteOfTenant(tenantId);
  if (!site) throw AppError.notFound("Maak eerst een website.");
  return { p, tenantId, site };
}

// GET /api/werkgever/sites/domain — the own domain of my website and the DNS records to set.
export async function GET(): Promise<NextResponse> {
  try {
    const { site } = await mySite();
    const domein = await getDomain(site.id);
    return NextResponse.json({ domein, records: domein ? dnsRecords(site.id, domein) : [] });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST { action: "koppel", domein } | { action: "controleer" } | { action: "ontkoppel" }.
// An own domain is part of hosting, so linking and checking need Website-beheer (or free access).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { p, tenantId, site } = await mySite();
    const input = schema.parse(await request.json().catch(() => ({})));
    const by = { userId: p.userId, name: p.fullName };
    if (input.action === "ontkoppel") {
      await unlinkDomain(site.id, by);
      return NextResponse.json({ domein: null, records: [] });
    }
    if (!(await mayPublish(p, tenantId))) {
      throw AppError.forbidden("Een eigen domein hoort bij Website-beheer. Neem een abonnement via Website; bouwen en bekijken kan altijd.");
    }
    const domein = input.action === "koppel" ? await linkDomain(site.id, input.domein, by) : await checkDomain(site.id, by);
    return NextResponse.json({ domein, records: dnsRecords(site.id, domein) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
