import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { clientIp } from "@/lib/http/request";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { leverOverdrachtIn, type Foto } from "@/lib/kyc/overdracht";

// POST /api/id-overdracht/klaar — de telefoon levert de drie foto's en de
// documentgegevens in. Daarna is de code op; de laptop rondt de verificatie af
// (lib/kyc/overdracht.ts). Openbaar met de eenmalige code, IP-begrensd.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BYTES = 12_000_000;
const TOEGESTAAN = new Set(["image/jpeg", "image/png", "image/webp"]);

const velden = z.object({
  code: z.string().min(10).max(120),
  soort: z.enum(["PASSPORT", "ID_CARD", "DRIVERS_LICENSE"]),
  nummer: z.string().trim().min(4).max(20),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ongeldige datum"),
  naam: z.string().trim().min(2).max(120),
});

async function foto(form: FormData, veld: string, label: string): Promise<Foto> {
  const f = form.get(veld);
  if (!(f instanceof File) || f.size === 0) throw AppError.validation(`${label} ontbreekt`);
  if (f.size > MAX_BYTES) throw AppError.validation(`${label} is te groot (max 12 MB)`);
  if (!TOEGESTAAN.has(f.type.toLowerCase())) throw AppError.validation(`${label}: gebruik een JPG-, PNG- of WebP-foto`);
  return { filename: f.name || veld, mimeType: f.type, bytes: Buffer.from(await f.arrayBuffer()) };
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "id-overdracht-klaar", identifier: clientIp(request), limit: 10, windowSeconds: 600 });
    const form = await request.formData().catch(() => {
      throw AppError.validation("Verstuur de foto's als multipart/form-data");
    });
    const v = velden.safeParse({ code: form.get("code"), soort: form.get("soort"), nummer: form.get("nummer"), datum: form.get("datum"), naam: form.get("naam") });
    if (!v.success) throw AppError.validation(v.error.issues[0]?.message ?? "Controleer de gegevens");
    const [voor, achter, selfie] = await Promise.all([
      foto(form, "voor", "De voorkant"),
      foto(form, "achter", "De achterkant"),
      foto(form, "selfie", "De selfie"),
    ]);
    const ok = await leverOverdrachtIn(v.data.code, {
      soort: v.data.soort,
      gegevens: { nummer: v.data.nummer, datum: v.data.datum, naam: v.data.naam },
      voor,
      achter,
      selfie,
    });
    if (!ok) throw AppError.notFound("Deze link is niet (meer) geldig. Maak op je laptop een nieuwe QR-code.");
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) logger.error("overdracht inleveren mislukt", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
