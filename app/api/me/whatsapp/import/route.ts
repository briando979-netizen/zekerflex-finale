import { after, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { importWhatsAppFile } from "@/lib/whatsapp/import";
import { scanWhatsAppChat } from "@/lib/agenda/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel caps a request body at 4.5 MB — an export *with* media won't fit,
// which is why the UI asks for "Zonder media".
const MAX_BYTES = 4 * 1024 * 1024;

// POST /api/me/whatsapp/import — multipart "file": a chat export (.txt/.zip) or contacts (.vcf).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({
      name: "whatsapp-import",
      identifier: p.userId,
      limit: 30,
      windowSeconds: 3600,
      message: "Te veel imports — probeer het later opnieuw.",
    });
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") throw AppError.validation("Kies een bestand om te importeren.");
    if (file.size > MAX_BYTES) {
      throw AppError.validation("Bestand is te groot (max. 4 MB). Exporteer het gesprek 'Zonder media'.");
    }
    const result = await importWhatsAppFile(p.userId, file.name || "export.txt", Buffer.from(await file.arrayBuffer()));
    if (result.kind === "chat") after(() => scanWhatsAppChat(p.userId, result.chat.id));
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
