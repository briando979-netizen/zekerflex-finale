import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { GRENZEN } from "@/lib/community/regels";
import { maakFoto, wisFotos } from "@/lib/community/fotos";
import { bewaarLosseFoto } from "@/lib/community/store";
import { magSchrijven } from "@/lib/community/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/community/upload (multipart: foto): één foto voor een onderwerp of reactie. Alleen jpg, png, webp of heic tot
// 8 MB, herkend aan de eerste bytes; sharp maakt er een WebP van zonder EXIF/GPS (lib/community/fotos.ts). De foto hoort
// daarna bij jou tot je hem bij een bericht zet (24 uur). Achter de login, dus geen openbare groottegrens nodig.
export const POST = withAuth(async (request, { principal }) => {
  await magSchrijven(principal);
  await enforceRateLimit({ name: "community-upload", identifier: principal.userId, limit: 30, windowSeconds: 3600, message: "Je hebt veel foto's geüpload. Probeer het over een uur opnieuw." });
  const form = await request.formData().catch(() => {
    throw AppError.validation("Kies een foto.");
  });
  const foto = form.get("foto");
  if (!(foto instanceof File)) throw AppError.validation("Kies een foto.");
  if (foto.size > GRENZEN.fotoBytes) throw AppError.validation("Deze foto is groter dan 8 MB. Kies een kleinere foto.");
  const id = await maakFoto(Buffer.from(await foto.arrayBuffer()));
  const weg = await bewaarLosseFoto(principal.userId, id);
  await wisFotos(weg);
  return NextResponse.json({ ok: true, id }, { status: 201 });
});
