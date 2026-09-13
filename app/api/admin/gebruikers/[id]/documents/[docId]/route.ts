import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { readDoc } from "@/lib/compliance/documents";
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
