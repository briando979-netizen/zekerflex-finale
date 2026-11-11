import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { readUpload } from "@/lib/storage/local";
import { fotoUploadId } from "@/lib/admin/kyc-weergave";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const welkSchema = z.enum(["front", "back", "selfie"]);

// GET /api/admin/gebruikers/<id>/identiteit/<checkId>/beeld?welk=front|back|selfie — een foto van een
// eigen ID-controle (lib/onboarding/verify.ts zet de upload-id's in rawPayload.uploadIds) voor de
// beoordelaar in Admin → Gebruikers. Alleen PLATFORM_ADMIN, alleen bij een controle van deze
// gebruiker, alleen afbeeldingen. Elke inzage komt in het auditlog (ID-documenten bevatten het BSN).
export const GET = withAdminAccess<{ id: string; checkId: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const welk = welkSchema.parse(new URL(request.url).searchParams.get("welk"));
  const check = await prisma.identityVerification.findFirst({
    where: { id: params.checkId, userId: params.id },
    select: { id: true, rawPayload: true },
  });
  if (!check) throw AppError.notFound("Controle niet gevonden.");
  const uploadId = fotoUploadId(check.rawPayload, welk);
  if (!uploadId) throw AppError.notFound("Deze foto is er niet (meer): na 30 dagen worden controles opgeruimd.");
  const file = await readUpload(uploadId);
  if (!file.mimeType.startsWith("image/")) throw AppError.notFound("Deze foto is er niet.");

  await recordAudit({
    category: "KYC",
    action: "kyc.beeld_bekeken",
    severity: "info",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} bekeek de ${welk === "front" ? "voorkant" : welk === "back" ? "achterkant" : "selfie"} van een identiteitscontrole`,
    targetType: "user",
    targetId: params.id,
    metadata: { checkId: check.id, welk },
  });

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": "inline",
      // niet in een gedeelde cache, en niet lang in die van de browser
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
