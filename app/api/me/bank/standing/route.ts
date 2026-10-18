import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { createStanding, listStanding } from "@/lib/bank/standing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  target: z.discriminatedUnion("kind", [z.object({ kind: z.literal("account"), number: z.string().min(12).max(20) }), z.object({ kind: z.literal("pot"), potId: z.string().min(1).max(40) })]),
  amountCents: z.number().int().min(100).max(250_000),
  description: z.string().max(140).default(""),
  interval: z.enum(["weekly", "monthly"]),
  firstRun: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// GET /api/me/bank/standing — the caller's vaste opdrachten.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { account } = await accountForPrincipal(p);
    return NextResponse.json({ orders: (await listStanding(account.id)).filter((o) => o.lastError !== "verwijderd") });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/me/bank/standing — new recurring transfer (to an account or an own pot).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const input = schema.parse(await request.json().catch(() => ({})));
    const { account, canMoveMoney, role } = await accountForPrincipal(p);
    if (!canMoveMoney || role === "platform") throw AppError.forbidden("Je kunt op deze rekening geen vaste opdrachten maken");
    const firstRun = new Date(`${input.firstRun}T06:00:00Z`);
    if (firstRun.getTime() < Date.now() - 86_400_000) throw AppError.validation("De eerste datum ligt in het verleden");
    const order = await createStanding({ accountId: account.id, target: input.target, amountCents: input.amountCents, description: input.description, interval: input.interval, firstRun });
    await recordAudit({
      category: "BILLING",
      action: "bank.standing_created",
      actorUserId: p.userId,
      summary: `Vaste opdracht ${(order.amountCents / 100).toFixed(2)} EUR ${order.interval === "weekly" ? "per week" : "per maand"} naar ${order.target.kind === "account" ? order.target.holderName : order.target.potName}`,
      targetType: "bank-account",
      targetId: account.id,
    });
    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
