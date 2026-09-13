import { requirePrincipal } from "@/lib/auth";
import { jsonError } from "@/lib/http/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordAudit, auditContext } from "@/lib/audit";
import { exportUserData, exportFilename } from "@/lib/privacy/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/gegevens/export — AVG art. 15/20: download everything the
// platform holds about you, as one JSON file.
export async function GET(request: Request): Promise<Response> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({
      name: "data-export",
      identifier: p.userId,
      limit: 3,
      windowSeconds: 3600,
      message: "Je kunt maximaal 3 exports per uur maken.",
    });

    const data = await exportUserData(p.userId);

    await recordAudit({
      category: "SECURITY",
      action: "privacy.data.exported",
      actorUserId: p.userId,
      actorLabel: "user",
      summary: `Gegevensexport (AVG art. 15) gedownload`,
      targetType: "user",
      targetId: p.userId,
      ...auditContext(request),
    });

    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${exportFilename(p.userId)}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
