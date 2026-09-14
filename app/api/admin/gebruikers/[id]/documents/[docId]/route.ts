import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { readDoc, setDocStatus } from "@/lib/compliance/documents";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/gebruikers/<id>/documents/<docId> — stream one of a
// freelancer's uploaded verification documents (ID/bank) to an admin.
// readDoc() looks up by (userId, docId) together, so a docId can never be
// used to read a different user's file. Access is logged: this is personal,
// sensitive data being viewed on someone else's behalf.
export const GET = withAdminAccess<{ id: string; docId: string }>(
  ["PLATFORM_ADMIN"],
  async (_request, { params, principal }) => {
    const doc = await readDoc(params.id, params.docId);
    if (!doc) throw AppError.notFound("Document niet gevonden");

    await recordAudit({
      category: "SECURITY",
      action: "compliance.document.viewed",
      severity: "info",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `Document van gebruiker ${params.id} bekeken door ${principal.email}`,
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
  },
);

const decisionSchema = z.object({ decision: z.enum(["approve", "reject"]) });

// POST /api/admin/gebruikers/<id>/documents/<docId> — approve/reject a
// document by hand (bank statements and anything else uploaded outside the
// self-serve identity flow). Not for kind "id": that one is governed by
// approving the linked identity check instead, which also needs to update
// the user's kycStatus in the same step.
export const POST = withAdminAccess<{ id: string; docId: string }>(
  ["PLATFORM_ADMIN"],
  async (request, { params, principal }) => {
    const { decision } = decisionSchema.parse(await request.json().catch(() => ({})));
    const status = decision === "approve" ? "approved" : "rejected";
    const doc = await setDocStatus(params.id, params.docId, status);
    if (!doc) throw AppError.notFound("Document niet gevonden");

    await recordAudit({
      category: "KYC",
      action: decision === "approve" ? "compliance.document.approved" : "compliance.document.rejected",
      severity: "info",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} heeft een document (${doc.kind}) van gebruiker ${params.id} ${decision === "approve" ? "goedgekeurd" : "afgewezen"}`,
      targetType: "user",
      targetId: params.id,
    });

    return NextResponse.json({ ok: true, doc });
  },
);
