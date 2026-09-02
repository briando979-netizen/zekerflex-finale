import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { docStatus, listDocs, storeDoc, type DocKind } from "@/lib/compliance/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/documents — my verification documents + completeness.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const [docs, status] = await Promise.all([listDocs(p.userId), docStatus(p.userId)]);
    return NextResponse.json({ docs, status });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/me/documents  (multipart: file, kind=id|bank|other)
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const form = await request.formData().catch(() => {
      throw AppError.validation("Verwacht multipart/form-data");
    });
    const file = form.get("file");
    const kind = String(form.get("kind") ?? "other") as DocKind;
    if (!(file instanceof File)) throw AppError.validation("Veld 'file' ontbreekt");
    if (!["id", "bank", "other"].includes(kind)) throw AppError.validation("Ongeldig documenttype");
    const bytes = Buffer.from(await file.arrayBuffer());
    try {
      const doc = await storeDoc(p.userId, kind, {
        filename: file.name || "document",
        mimeType: file.type || "application/octet-stream",
        bytes,
      });
      const status = await docStatus(p.userId);
      return NextResponse.json({ doc, status }, { status: 201 });
    } catch (e) {
      throw AppError.validation((e as Error).message);
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
