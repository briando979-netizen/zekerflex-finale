import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { alleIntroducties, koppelIntroductie, zoekBedrijven } from "@/lib/introducties/opslag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Beheer → Sales → Introducties ("Introduceer een bedrijf", lib/introducties). Alleen PLATFORM_ADMIN.
//   GET                → alle introducties met hun stand, koppeling en beloning
//   GET ?zoek=<naam>   → bedrijven om aan te koppelen (op naam of op het domein van een e-mailadres)
//   POST { actie: "koppel", leadId, tenantId } → "Gekoppeld aan bedrijf": twee weken geen platformkosten, in het auditspoor
// Het bol-tegoed als "verstuurd" afvinken gaat via Beheer → Te doen (POST /api/admin/todos, toggle op de taak-id).

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const zoek = new URL(request.url).searchParams.get("zoek");
  if (zoek !== null) return NextResponse.json({ bedrijven: await zoekBedrijven(zoek) });
  return NextResponse.json({ introducties: await alleIntroducties() });
});

const schema = z.object({
  actie: z.literal("koppel"),
  leadId: z.string().min(1).max(40),
  tenantId: z.string().min(1).max(40),
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const d = schema.parse(await request.json().catch(() => ({})));
  const koppeling = await koppelIntroductie({ leadId: d.leadId, tenantId: d.tenantId, actorUserId: principal.userId });
  return NextResponse.json({ koppeling, introducties: await alleIntroducties() });
});
