import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { siteTenantOf } from "@/lib/sites/access";
import { bewaarVerkoperFoto } from "@/lib/shop/verkoper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 15_000_000;

// POST /api/werkgever/verkopen/foto (multipart "file") — een productfoto voor de
// shop. Rechtop gezet, zonder EXIF/GPS, als WebP; pas zichtbaar als het product
// met deze foto is goedgekeurd.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({ name: "verkoper-foto", identifier: p.userId, limit: 60, windowSeconds: 3600, message: "Even rustig aan met foto's uploaden; probeer het zo opnieuw." });
    const tenantId = await siteTenantOf(p);
    const form = await request.formData().catch(() => {
      throw AppError.validation("Kies een foto.");
    });
    const file = form.get("file");
    if (!(file instanceof File)) throw AppError.validation("Kies een foto.");
    if (file.size > MAX_BYTES) throw AppError.validation("Deze foto is groter dan 15 MB.");
    const foto = await bewaarVerkoperFoto(tenantId, p.userId, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ foto }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
