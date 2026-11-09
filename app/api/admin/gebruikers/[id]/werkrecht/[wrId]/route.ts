import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { beoordeel, leesBewijs } from "@/lib/werkrecht/store";
import { landNaam } from "@/lib/werkrecht/landen";
import { sendLocalizedPush } from "@/lib/notifications/localized-push";
import { runAfter } from "@/lib/run-after";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/gebruikers/<id>/werkrecht/<wrId>: het bewijs voor het recht om te werken
// bekijken. Op (userId, wrId) samen, en elke keer bekijken staat in de audit.
export const GET = withAdminAccess<{ id: string; wrId: string }>(["PLATFORM_ADMIN"], async (_request, { params, principal }) => {
  const doc = await leesBewijs(params.id, params.wrId);
  if (!doc) throw AppError.notFound("Document niet gevonden");
  await recordAudit({
    category: "SECURITY",
    action: "werkrecht.document.viewed",
    severity: "info",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `Document recht om te werken van gebruiker ${params.id} bekeken door ${principal.email}`,
    targetType: "user",
    targetId: params.id,
  });
  return new Response(new Uint8Array(doc.bytes), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.filename)}"`,
      "Cache-Control": "private, no-store",
    },
  });
});

const besluitSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(300).optional(),
});

// POST /api/admin/gebruikers/<id>/werkrecht/<wrId> { decision, note? }: goedkeuren of afwijzen.
export const POST = withAdminAccess<{ id: string; wrId: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const { decision, note } = besluitSchema.parse(await request.json().catch(() => ({})));
  if (decision === "reject" && !note) throw AppError.validation("Geef een reden: de werker ziet die.");
  const uit = await beoordeel(params.id, params.wrId, decision, principal.userId, note ?? null);
  if (!uit) throw AppError.notFound("Document niet gevonden");
  await recordAudit({
    category: "KYC",
    action: decision === "approve" ? "werkrecht.document.approved" : "werkrecht.document.rejected",
    severity: "info",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} heeft het document recht om te werken (${uit.land}) van gebruiker ${params.id} ${decision === "approve" ? "goedgekeurd" : "afgewezen"}`,
    targetType: "user",
    targetId: params.id,
  });
  // de werker weet het meteen, in zijn eigen app-taal
  runAfter(() =>
    sendLocalizedPush([params.id], (t, locale) => ({
      title: decision === "approve" ? t.werkrechtOkTitle : t.werkrechtAfTitle,
      body: (decision === "approve" ? t.werkrechtOkBody(landNaam(uit.land, locale)) : t.werkrechtAfBody(landNaam(uit.land, locale), note ?? "")).slice(0, 180),
      data: { type: "PROFILE", url: "/dashboard/verificatie", tag: `werkrecht-${uit.land}` },
      ttlSeconds: 3 * 86_400,
    })),
  );
  return NextResponse.json({ ok: true });
});
