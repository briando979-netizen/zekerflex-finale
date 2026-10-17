import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { book } from "@/lib/bank/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("freeze"), reason: z.string().trim().min(3).max(200) }),
  z.object({ action: z.literal("unfreeze") }),
  z.object({
    action: z.literal("adjust"),
    amountCents: z.number().int().refine((v) => v !== 0 && Math.abs(v) <= 10_000_000, "Ongeldig bedrag"),
    reason: z.string().trim().min(3).max(200),
  }),
]);

// GET /api/admin/bank/accounts/:id — one account with its latest bookings.
export const GET = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_req, { params }) => {
  const account = await prisma.bankAccount.findUnique({ where: { id: params.id } });
  if (!account) throw AppError.notFound("Rekening niet gevonden");
  const entries = await prisma.bankEntry.findMany({ where: { accountId: account.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({ account, entries });
});

// POST /api/admin/bank/accounts/:id — block/unblock, or a correction booking with a reason (always audited).
export const POST = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const input = schema.parse(await request.json().catch(() => ({})));
  const account = await prisma.bankAccount.findUnique({ where: { id: params.id } });
  if (!account) throw AppError.notFound("Rekening niet gevonden");

  if (input.action === "freeze" || input.action === "unfreeze") {
    await prisma.bankAccount.update({
      where: { id: account.id },
      data: input.action === "freeze" ? { frozenAt: new Date(), frozenReason: input.reason } : { frozenAt: null, frozenReason: null },
    });
    await recordAudit({
      category: "ADMIN",
      action: input.action === "freeze" ? "bank.account_frozen" : "bank.account_unfrozen",
      actorUserId: principal.userId,
      summary: `${account.holderName} (${account.number}) ${input.action === "freeze" ? `geblokkeerd: ${input.reason}` : "gedeblokkeerd"}`,
      targetType: "bank-account",
      targetId: account.id,
    });
    return NextResponse.json({ ok: true });
  }

  const entry = await book(
    account.id,
    { amountCents: input.amountCents, kind: "ADJUSTMENT", description: `Correctie: ${input.reason}`, counterparty: "ZekerFlex B.V.", idempotencyKey: `adjust:${randomUUID()}` },
    { allowFrozen: true },
  );
  await recordAudit({
    category: "ADMIN",
    action: "bank.adjustment",
    actorUserId: principal.userId,
    summary: `Correctie ${(input.amountCents / 100).toFixed(2)} EUR op ${account.holderName}: ${input.reason}`,
    targetType: "bank-account",
    targetId: account.id,
  });
  return NextResponse.json({ entry });
});
