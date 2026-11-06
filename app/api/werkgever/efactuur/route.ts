import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { bewaarEfactuurInstellingen, efactuurInstellingen, peppolIdGeldig, peppolIngesteld } from "@/lib/efactuur/instellingen";
import { efactuurStanden } from "@/lib/efactuur/bezorging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  peppolId: z.string().trim().max(60).optional(),
  ontvangstEmail: z.string().trim().max(200).optional(),
  automatisch: z.boolean().optional(),
});

async function tenantOf(): Promise<{ tenantId: string; userId: string }> {
  const principal = await requirePrincipal();
  requireRole(principal, "HQ_ADMIN", "LOCAL_MANAGER", "PLATFORM_ADMIN");
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");
  return { tenantId, userId: principal.userId };
}

async function view(tenantId: string) {
  const [instellingen, tenant, recent] = await Promise.all([
    efactuurInstellingen(tenantId),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { kvkNumber: true, vatNumber: true } }),
    prisma.invoice.findMany({ where: { recipientTenantId: tenantId, status: { in: ["ISSUED", "PAID"] } }, select: { id: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const standen = await efactuurStanden(recent.map((i) => i.id));
  const afgeleid = tenant?.kvkNumber ? `0106:${tenant.kvkNumber}` : tenant?.vatNumber ? `9944:${tenant.vatNumber}` : null;
  return {
    instellingen,
    afgeleidPeppolId: afgeleid,
    peppolNetwerk: peppolIngesteld(),
    standen: Object.fromEntries(standen),
  };
}

// GET /api/werkgever/efactuur — instellingen + de stand van de laatste facturen.
export async function GET(): Promise<NextResponse> {
  try {
    const { tenantId } = await tenantOf();
    return NextResponse.json(await view(tenantId));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// PUT /api/werkgever/efactuur — instellingen bewaren.
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await tenantOf();
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw AppError.validation("Controleer de ingevulde gegevens", parsed.error.flatten());
    const d = parsed.data;
    if (d.peppolId && !peppolIdGeldig(d.peppolId)) throw AppError.validation("Een Peppol-adres ziet eruit als 0106:12345678 (KVK) of 9944:NL123456789B01 (btw).");
    if (d.ontvangstEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.ontvangstEmail)) throw AppError.validation("Controleer het mailadres van je boekhoudpakket.");
    await bewaarEfactuurInstellingen(tenantId, {
      ...(d.peppolId !== undefined ? { peppolId: d.peppolId } : {}),
      ...(d.ontvangstEmail !== undefined ? { ontvangstEmail: d.ontvangstEmail } : {}),
      ...(d.automatisch !== undefined ? { automatisch: d.automatisch } : {}),
    });
    await recordAudit({
      category: "BILLING",
      action: "employer.efactuur.settings",
      actorUserId: userId,
      actorLabel: "user",
      summary: "Instellingen e-facturatie bijgewerkt",
      targetType: "tenant",
      targetId: tenantId,
      metadata: { velden: Object.keys(d) },
    });
    return NextResponse.json(await view(tenantId));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
