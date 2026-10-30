import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { listTenantHosts, saveTenantHosts } from "@/lib/tenancy/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/tenancy — alle host->tenant-koppelingen (white-label hosting).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ entries: await listTenantHosts() });
});

const entrySchema = z.object({
  host: z.string().trim().min(1).max(255),
  tenantId: z.string().trim().min(1).max(60),
  brand: z.object({
    name: z.string().trim().max(120),
    primaryColor: z.string().trim().max(32),
    logoUrl: z.string().trim().max(500),
  }),
});
const schema = z.object({ entries: z.array(entrySchema).max(1000) });

// PUT /api/admin/tenancy — de volledige lijst opslaan.
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Controleer de klant-koppelingen");
  await saveTenantHosts(parsed.data.entries);
  await recordAudit({
    category: "ADMIN",
    action: "tenancy.hosts.updated",
    severity: "info",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} wijzigde de white-label host-koppelingen (${parsed.data.entries.length})`,
  });
  return NextResponse.json({ ok: true });
});
