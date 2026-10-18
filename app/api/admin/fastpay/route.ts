import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { kvListEntries } from "@/lib/storage/kv";
import { decideCredit, runCreditCheck, getFastPay, type FastPaySettings } from "@/lib/payouts/fastpay";
import { kvSet } from "@/lib/storage/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/fastpay — every client that asked for fast payout, borderline cases first.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const rows = await kvListEntries<FastPaySettings>("fastpay:", 2000);
  const ids = rows.map((r) => r.key.slice("fastpay:".length));
  const names = new Map((await prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
  const order = { review: 0, rejected: 1, approved: 2, none: 3 } as const;
  const list = rows
    .map((r) => ({ tenantId: r.key.slice("fastpay:".length), name: names.get(r.key.slice("fastpay:".length)) ?? "—", ...r.value }))
    .filter((r) => r.offerFastPay || r.credit?.status !== "none")
    .sort((a, b) => order[a.credit.status] - order[b.credit.status]);
  return NextResponse.json({ clients: list });
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("decide"), tenantId: z.string().min(1), status: z.enum(["approved", "rejected"]), note: z.string().trim().min(1).max(300) }),
  z.object({ action: z.literal("recheck"), tenantId: z.string().min(1) }),
]);

// POST /api/admin/fastpay — approve/reject a credit case, or rerun the check.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const input = schema.parse(await request.json().catch(() => ({})));
  const s =
    input.action === "decide"
      ? await decideCredit(input.tenantId, input.status, principal.fullName, input.note)
      : await (async () => {
          const cur = await getFastPay(input.tenantId);
          const next = { ...cur, credit: await runCreditCheck(input.tenantId) };
          await kvSet(`fastpay:${input.tenantId}`, next);
          return next;
        })();
  await recordAudit({ category: "ADMIN", action: `fastpay.${input.action}`, actorUserId: principal.userId, summary: `Kredietcheck ${input.tenantId}: ${s.credit.status} (${s.credit.score}/100)`, targetType: "tenant", targetId: input.tenantId });
  return NextResponse.json(s);
});
