import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { submitFreelancerOnboarding, type DocKind } from "@/lib/onboarding/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fieldsSchema = z.object({
  kvkNumber: z.string().trim().min(6).max(20),
  postalCode: z.string().trim().regex(/^\s*\d{4}\s*[A-Za-z]{2}\s*$/, "Gebruik een geldige postcode, bijv. 1012 AB"),
  houseNumber: z.string().trim().min(1).max(12),
  payoutIban: z.string().trim().min(15).max(34),
  documentType: z.enum(["PASSPORT", "ID_CARD", "DRIVERS_LICENSE"]),
  documentNumber: z.string().trim().min(4).max(20),
  documentExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ongeldige datum"),
  nameOnDocument: z.string().trim().min(2).max(120),
});

const MAX_BYTES = 12_000_000;

export async function POST(request: Request): Promise<NextResponse> {
  const log = logger.child({ route: "POST /api/onboarding" });
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");

    const form = await request.formData().catch(() => {
      throw AppError.validation("Verstuur het formulier als multipart/form-data");
    });

    const parsed = fieldsSchema.safeParse({
      kvkNumber: form.get("kvkNumber"),
      postalCode: form.get("postalCode"),
      houseNumber: form.get("houseNumber"),
      payoutIban: form.get("payoutIban"),
      documentType: form.get("documentType"),
      documentNumber: form.get("documentNumber"),
      documentExpiry: form.get("documentExpiry"),
      nameOnDocument: form.get("nameOnDocument"),
    });
    if (!parsed.success) {
      throw AppError.validation(
        parsed.error.issues[0]?.message ?? "Controleer de ingevulde gegevens",
        parsed.error.flatten(),
      );
    }

    const file = form.get("document");
    if (!(file instanceof File) || file.size === 0) {
      throw AppError.validation("Upload een foto of scan van je identiteitsbewijs");
    }
    if (file.size > MAX_BYTES) {
      throw AppError.validation("Het bestand is te groot (max 12 MB)");
    }

    const bytes = Buffer.from(await file.arrayBuffer());

    const result = await submitFreelancerOnboarding({
      userId: principal.userId,
      kvkNumber: parsed.data.kvkNumber,
      postalCode: parsed.data.postalCode,
      houseNumber: parsed.data.houseNumber,
      payoutIban: parsed.data.payoutIban,
      documentType: parsed.data.documentType as DocKind,
      documentNumber: parsed.data.documentNumber,
      documentExpiry: parsed.data.documentExpiry,
      nameOnDocument: parsed.data.nameOnDocument,
      file: {
        filename: file.name || "document",
        mimeType: file.type || "application/octet-stream",
        bytes,
      },
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) log.error("onboarding failed", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
