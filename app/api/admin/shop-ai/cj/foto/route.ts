import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { cleanImage } from "@/lib/media/clean-image";
import { fetchResource } from "@/lib/website-check/fetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** zo groot halen we een voorbeeldfoto hooguit op; zo breed geven we hem terug */
const MAX_BYTES = 4_000_000;
const BREEDTE_PX = 480;

// GET /api/admin/shop-ai/cj/foto?u=<https-adres> — een voorbeeldfoto van de leverancier via onze eigen
// herkomst, verkleind. Het beheerscherm mag van de CSP alleen eigen foto's tonen (img-src 'self'), en zo
// ziet de leverancier ook het adres van de beheerder niet. Alleen voor ingelogde beheerders, alleen https,
// nooit een intern adres (fetchResource weigert die), nooit opgeslagen: pas bij overnemen komt de foto in
// onze opslag (lib/shop/cj/importeer.ts). Mislukt het, dan een lege 404 zonder details.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  await enforceRateLimit({ name: "shop-cj-foto", identifier: principal.userId, limit: 1500, windowSeconds: 3600, message: "Even rustig aan met voorbeeldfoto's." });
  const u = new URL(request.url).searchParams.get("u")?.trim() ?? "";
  if (!/^https:\/\/[^\s"'<>]{8,600}$/.test(u)) throw AppError.validation("Geen geldig foto-adres.");

  const res = await fetchResource(u, { maxBytes: MAX_BYTES, timeoutMs: 10_000 }).catch(() => null);
  if (!res || res.status !== 200 || res.truncated || res.data.length === 0) return new NextResponse(null, { status: 404 });
  const type = (res.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (type && !type.startsWith("image/") && type !== "application/octet-stream") return new NextResponse(null, { status: 404 });

  const foto = await cleanImage(res.data, BREEDTE_PX).catch(() => null);
  if (!foto) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(foto.bytes), {
    headers: {
      "content-type": foto.mime,
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
});
