import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { saveFreelancerBase, submitFreelancerOnboarding, type DocKind } from "@/lib/onboarding/verify";
import { startStripeIdentity, stripeIdentityAvailable } from "@/lib/kyc/stripe-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const baseSchema = z.object({
  kvkNumber: z.string().trim().max(20).optional(),
  vatNumber: z.string().trim().max(20).optional(),
  postalCode: z.string().trim().regex(/^\s*\d{4}\s*[A-Za-z]{2}\s*$/, "Gebruik een geldige postcode, bijv. 1012 AB"),
  houseNumber: z.string().trim().min(1).max(12),
  payoutIban: z.string().trim().min(15).max(34),
});

const fieldsSchema = z.object({
  // absent for uitzendkrachten — they don't have a KVK (and not when a btw-nummer is used)
  kvkNumber: z.string().trim().max(20).optional(),
  vatNumber: z.string().trim().max(20).optional(),
  postalCode: z.string().trim().regex(/^\s*\d{4}\s*[A-Za-z]{2}\s*$/, "Gebruik een geldige postcode, bijv. 1012 AB"),
  houseNumber: z.string().trim().min(1).max(12),
  payoutIban: z.string().trim().min(15).max(34),
  documentType: z.enum(["PASSPORT", "ID_CARD", "DRIVERS_LICENSE"]),
  documentNumber: z.string().trim().min(4).max(20),
  documentExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ongeldige datum"),
  nameOnDocument: z.string().trim().min(2).max(120),
});

const MAX_BYTES = 12_000_000;

async function readImage(
  form: FormData,
  field: string,
  label: string,
): Promise<{ filename: string; mimeType: string; bytes: Buffer }> {
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) {
    throw AppError.validation(`Upload ${label}`);
  }
  if (file.size > MAX_BYTES) {
    throw AppError.validation(`${label} is te groot (max 12 MB)`);
  }
  return {
    filename: file.name || field,
    mimeType: file.type || "application/octet-stream",
    bytes: Buffer.from(await file.arrayBuffer()),
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  const log = logger.child({ route: "POST /api/onboarding" });
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");

    const form = await request.formData().catch(() => {
      throw AppError.validation("Verstuur het formulier als multipart/form-data");
    });
    const str = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" && v.trim() ? v : undefined;
    };

    // Route 1: identity via Stripe — save the rest now, then send the user to Stripe.
    if (form.get("identityMethod") === "stripe" && (await stripeIdentityAvailable())) {
      const base = baseSchema.safeParse({
        kvkNumber: str("kvkNumber"),
        vatNumber: str("vatNumber"),
        postalCode: form.get("postalCode"),
        houseNumber: form.get("houseNumber"),
        payoutIban: form.get("payoutIban"),
      });
      if (!base.success) throw AppError.validation(base.error.issues[0]?.message ?? "Controleer de ingevulde gegevens");
      const saved = await saveFreelancerBase({
        userId: principal.userId,
        kvkNumber: base.data.kvkNumber ?? "",
        vatNumber: base.data.vatNumber,
        postalCode: base.data.postalCode,
        houseNumber: base.data.houseNumber,
        payoutIban: base.data.payoutIban,
      });
      const redirectUrl = await startStripeIdentity(principal.userId, principal.email);
      return NextResponse.json({ redirectUrl, checks: saved.checks }, { status: 200 });
    }

    const parsed = fieldsSchema.safeParse({
      kvkNumber: str("kvkNumber"),
      vatNumber: str("vatNumber"),
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

    // Three separate captures in one submission — front, back, selfie — so
    // the freelancer never has to come back for a second, duplicate upload
    // (submitFreelancerOnboarding also satisfies the compliance "id" slot
    // from the front image, see lib/onboarding/verify.ts).
    const [documentFront, documentBack, selfie] = await Promise.all([
      readImage(form, "documentFront", "de voorkant van je document"),
      readImage(form, "documentBack", "de achterkant van je document"),
      readImage(form, "selfie", "een selfie"),
    ]);

    const result = await submitFreelancerOnboarding({
      userId: principal.userId,
      kvkNumber: parsed.data.kvkNumber ?? "",
      vatNumber: parsed.data.vatNumber,
      postalCode: parsed.data.postalCode,
      houseNumber: parsed.data.houseNumber,
      payoutIban: parsed.data.payoutIban,
      documentType: parsed.data.documentType as DocKind,
      documentNumber: parsed.data.documentNumber,
      documentExpiry: parsed.data.documentExpiry,
      nameOnDocument: parsed.data.nameOnDocument,
      files: { front: documentFront, back: documentBack, selfie },
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) log.error("onboarding failed", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
