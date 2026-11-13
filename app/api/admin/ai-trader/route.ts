import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { AlpacaFout, alpacaSleutelInfo, bewaarAlpacaSleutel, controleerAlpacaSleutel, verwijderAlpacaSleutel } from "@/lib/trader/alpaca";
import { controleerSleutel } from "@/lib/trader/alpaca-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Beheer -> AI-trader: de Alpaca-PAPIER-sleutel. Alleen platformbeheer. De sleutel komt nooit terug in een antwoord,
// log of audit (alleen "opgeslagen" of "verwijderd"). Er worden hier geen orders geplaatst; Alpaca wordt alleen gelezen.
const schema = z.object({ keyId: z.string().max(100), secret: z.string().max(200) });

// GET: staat er een sleutel? (nooit de waarde)
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ sleutel: await alpacaSleutelInfo() });
});

// PUT { keyId, secret }: controleert de sleutel bij Alpaca (één GET) en bewaart hem pas dan, verzegeld.
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) throw AppError.validation("Vul het sleutel-id en het geheim in.");
  const fout = controleerSleutel(body.data.keyId, body.data.secret);
  if (fout) throw AppError.validation(fout);
  const sleutel = { id: body.data.keyId.trim(), geheim: body.data.secret.trim() };
  try {
    await controleerAlpacaSleutel(sleutel);
  } catch (e) {
    if (e instanceof AlpacaFout) throw AppError.validation(e.message);
    throw e;
  }
  await bewaarAlpacaSleutel(sleutel);
  await recordAudit({ category: "ADMIN", action: "admin.ai-trader.sleutel", severity: "info", actorUserId: principal.userId, actorLabel: "user", summary: "Alpaca-papiersleutel opgeslagen" });
  return NextResponse.json({ sleutel: await alpacaSleutelInfo() });
});

// DELETE: haalt de sleutel weg.
export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (_request, { principal }) => {
  await verwijderAlpacaSleutel();
  await recordAudit({ category: "ADMIN", action: "admin.ai-trader.sleutel", severity: "info", actorUserId: principal.userId, actorLabel: "user", summary: "Alpaca-papiersleutel verwijderd" });
  return NextResponse.json({ sleutel: await alpacaSleutelInfo() });
});