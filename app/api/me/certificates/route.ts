import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { addCertificate, listCertificates, CERT_TYPES, type CertType } from "@/lib/certificates/store";
import { fixedWindow } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BYTES = 12_000_000;

export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    requireRole(p, "FREELANCER");
    return NextResponse.json({ certificates: await listCertificates(p.userId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const fields = z.object({
  type: z.string().refine((t): t is CertType => t in CERT_TYPES, "Onbekend type"),
  customLabel: z.string().trim().max(80).optional(),
  number: z.string().trim().max(40).optional(),
  issuedOn: z.string().regex(DATE).optional(),
  expiresOn: z.string().regex(DATE).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    requireRole(p, "FREELANCER");

    const gate = await fixedWindow(`me-certificates:rl:${p.userId}`, 20, 600);
    if (!gate.ok) throw AppError.validation("Te veel uploads — probeer het over enkele minuten opnieuw.");

    const form = await request.formData().catch(() => {
      throw AppError.validation("Verstuur als multipart/form-data");
    });
    const parsed = fields.safeParse({
      type: form.get("type"),
      customLabel: form.get("customLabel") ?? undefined,
      number: form.get("number") ?? undefined,
      issuedOn: form.get("issuedOn") ?? undefined,
      expiresOn: form.get("expiresOn") ?? undefined,
    });
    if (!parsed.success) {
      throw AppError.validation(parsed.error.issues[0]?.message ?? "Controleer de gegevens");
    }

    let file: { filename: string; mimeType: string; bytes: Buffer } | undefined;
    const f = form.get("file");
    if (f instanceof File && f.size > 0) {
      if (f.size > MAX_BYTES) throw AppError.validation("Bestand te groot (max 12 MB)");
      file = {
        filename: f.name || "certificaat",
        mimeType: f.type || "application/octet-stream",
        bytes: Buffer.from(await f.arrayBuffer()),
      };
    }

    const cert = await addCertificate(p.userId, { ...parsed.data, ...(file ? { file } : {}) });
    return NextResponse.json({ certificate: cert }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
