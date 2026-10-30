import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { analyzeOffer, recordOffer, listOffers, setOfferStatus, sweepSalesOffers } from "@/lib/sales/offers";
import { imapConfig } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/offertes — recente verwerkte offerteaanvragen + config.
export const GET = withAdminAccess(["PLATFORM_ADMIN", "HQ_ADMIN"], async () => {
  const offers = await listOffers(80);
  return NextResponse.json({ mailboxConnected: Boolean(imapConfig()), offers });
});

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("analyze"),
    fromName: z.string().trim().max(160).optional(),
    fromAddress: z.string().trim().max(200).optional(),
    subject: z.string().trim().max(300).optional(),
    body: z.string().trim().min(1).max(20000),
    save: z.boolean().optional(),
  }),
  z.object({ action: z.literal("status"), id: z.string().trim().max(40), status: z.enum(["nieuw", "beantwoord", "afgewezen"]) }),
  z.object({ action: z.literal("sweep") }),
]);

// POST /api/admin/offertes — { action: "analyze" | "status" | "sweep" }.
export const POST = withAdminAccess(["PLATFORM_ADMIN", "HQ_ADMIN"], async (request) => {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Ongeldig verzoek", parsed.error.flatten());
  const body = parsed.data;

  if (body.action === "status") {
    const rec = await setOfferStatus(body.id, body.status);
    if (!rec) throw AppError.notFound("Offerte niet gevonden");
    return NextResponse.json({ ok: true, offer: rec });
  }

  if (body.action === "sweep") {
    const result = await sweepSalesOffers();
    return NextResponse.json(result);
  }

  // action === "analyze"
  const input = {
    body: body.body,
    ...(body.fromName ? { fromName: body.fromName } : {}),
    ...(body.fromAddress ? { fromAddress: body.fromAddress } : {}),
    ...(body.subject ? { subject: body.subject } : {}),
  };
  const analysis = await analyzeOffer(input);
  if (body.save && analysis.isOffer) {
    const rec = await recordOffer(input, analysis);
    return NextResponse.json({ ok: true, analysis, offer: rec });
  }
  return NextResponse.json({ ok: true, analysis });
});
