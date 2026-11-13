import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { readUpload } from "@/lib/storage/local";
import { fotoUploadId } from "@/lib/admin/kyc-weergave";
import { stripeIdFoto } from "@/lib/kyc/stripe-fotos";
import { kleineVersie } from "@/lib/admin/foto-klein";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const welkSchema = z.enum(["front", "back", "selfie", "selfie2"]);
const WELK_LABEL = { front: "voorkant", back: "achterkant", selfie: "selfie", selfie2: "tweede selfie (hoofd gedraaid)" } as const;

// GET /api/admin/gebruikers/<id>/identiteit/<checkId>/beeld?welk=front|back|selfie — een foto van een
// eigen ID-controle (lib/onboarding/verify.ts zet de upload-id's in rawPayload.uploadIds) voor de
// beoordelaar in Admin → Gebruikers. Alleen PLATFORM_ADMIN, alleen bij een controle van deze
// gebruiker, alleen afbeeldingen. Elke inzage komt in het auditlog (ID-documenten bevatten het BSN).
// Een Stripe-controle: de kopie bij ons als die er is (lib/kyc/stripe-kopie.ts), anders rechtstreeks van Stripe (lib/kyc/stripe-fotos.ts).
// &klein=1: een kleine versie voor de tegels (lib/admin/foto-klein.ts), nergens bewaard; lukt dat niet, dan het origineel.
export const GET = withAdminAccess<{ id: string; checkId: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const zoek = new URL(request.url).searchParams;
  const welk = welkSchema.parse(zoek.get("welk"));
  const klein = zoek.get("klein") === "1";
  const check = await prisma.identityVerification.findFirst({
    where: { id: params.checkId, userId: params.id },
    select: { id: true, provider: true, sessionId: true, rawPayload: true },
  });
  if (!check) throw AppError.notFound("Controle niet gevonden.");
  let file: { bytes: Uint8Array; mimeType: string };
  // een kopie bij ons (ook van een Stripe-controle, lib/kyc/stripe-kopie.ts) gaat voor; zonder kopie live van Stripe
  const kopieId = fotoUploadId(check.rawPayload, welk);
  const bron = kopieId ? (check.provider === "STRIPE_IDENTITY" ? "stripe-kopie" : "eigen") : check.provider === "STRIPE_IDENTITY" ? "stripe" : "eigen";
  if (bron === "stripe") {
    if (!check.sessionId) throw AppError.notFound("Deze controle heeft geen Stripe-sessie.");
    const foto = await stripeIdFoto(check.sessionId, welk);
    if (!foto.ok) throw AppError.notFound(foto.reden);
    file = foto;
  } else {
    const uploadId = fotoUploadId(check.rawPayload, welk);
    if (!uploadId) throw AppError.notFound("Deze foto is er niet (meer): na 30 dagen worden controles opgeruimd.");
    const eigen = await readUpload(uploadId);
    file = { bytes: new Uint8Array(eigen.bytes), mimeType: eigen.mimeType };
  }
  if (!file.mimeType.startsWith("image/")) throw AppError.notFound("Deze foto is er niet.");

  await recordAudit({
    category: "KYC",
    action: "kyc.beeld_bekeken",
    severity: "info",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} bekeek de ${WELK_LABEL[welk]} van een identiteitscontrole`,
    targetType: "user",
    targetId: params.id,
    metadata: { checkId: check.id, welk, bron, ...(klein ? { klein: true } : {}) },
  });

  const kleintje = klein ? await kleineVersie(file.bytes) : null;
  if (kleintje) {
    return new Response(new Uint8Array(kleintje), {
      headers: { "Content-Type": "image/jpeg", "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  }
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": "inline",
      // niet in een gedeelde cache, en niet lang in die van de browser; een foto van Stripe helemaal niet bewaren
      "Cache-Control": bron === "stripe" ? "private, no-store" : "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
