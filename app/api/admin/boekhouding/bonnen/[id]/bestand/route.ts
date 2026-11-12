import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { bonBestandVoor } from "@/lib/boekhouding/scherm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[a-z0-9]{10,40}$/i;

// GET: het bestand van een bon, uit storage/ (nooit uit public/). Alleen platformbeheerders. Niet te bewaren door tussen-
// liggende servers (private, no-store) en nooit als pagina te laten uitvoeren (nosniff en een dichte CSP; het Content-Type komt
// uit de eerste bytes van het bestand, niet uit de bestandsnaam).
export const GET = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_request, { params }) => {
  if (!ID.test(params.id)) throw AppError.validation("Dit is geen geldige bon.");
  const { bytes, mimeType, extensie } = await bonBestandVoor(params.id);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="bon-${params.id}.${extensie}"`,
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
      "Referrer-Policy": "no-referrer",
    },
  });
});
