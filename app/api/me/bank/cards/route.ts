import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { requestCard } from "@/lib/bank/cards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  type: z.enum(["virtual", "physical"]),
  firstName: z.string().trim().min(1).max(40),
  lastName: z.string().trim().min(1).max(40),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  phone: z.string().trim().regex(/^\+?[\d ]{8,20}$/).optional().or(z.literal("")),
  line1: z.string().trim().min(3).max(100),
  postalCode: z.string().trim().min(4).max(10),
  city: z.string().trim().min(2).max(60),
  country: z.string().length(2).default("NL"),
  acceptTerms: z.literal(true),
  requestKey: z.string().regex(/^[\w-]{8,64}$/),
});

// POST /api/me/bank/cards — the holder requests a virtual or physical card (one-off fee from the balance).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({ name: "bank-card-request", identifier: p.userId, limit: 5, windowSeconds: 86400, message: "Te veel pasaanvragen vandaag." });
    const input = schema.parse(await request.json().catch(() => ({})));
    const { account, canMoveMoney } = await accountForPrincipal(p);
    if (!canMoveMoney) throw AppError.forbidden("Alleen de hoofdbeheerder kan een pas voor de bedrijfsrekening aanvragen");
    const user = await prisma.user.findUnique({ where: { id: p.userId }, select: { email: true } });
    const card = await requestCard({
      account,
      type: input.type,
      email: user?.email ?? null,
      requestKey: input.requestKey,
      details: {
        firstName: input.firstName,
        lastName: input.lastName,
        dob: input.dob,
        ...(input.phone ? { phone: input.phone.replace(/\s/g, "") } : {}),
        line1: input.line1,
        postalCode: input.postalCode,
        city: input.city,
        country: input.country.toUpperCase(),
        termsAcceptedIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0",
        termsAcceptedUserAgent: (request.headers.get("user-agent") ?? "unknown").slice(0, 200),
      },
    });
    await recordAudit({
      category: "BILLING",
      action: "bank.card_requested",
      actorUserId: p.userId,
      summary: `${input.type === "physical" ? "Fysieke" : "Virtuele"} pas …${card.last4} aangevraagd`,
      targetType: "bank-account",
      targetId: account.id,
    });
    return NextResponse.json(
      { card: { id: card.id, type: card.type, brand: card.brand, last4: card.last4, expMonth: card.expMonth, expYear: card.expYear, status: card.status } },
      { status: 201 },
    );
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
