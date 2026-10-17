import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { activatePolicy, cancelPolicy, getProducts, listPolicies, rejectPolicy, saveProducts } from "@/lib/bank/insurance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const product = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,40}$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300),
  coverage: z.string().trim().max(300),
  insurer: z.string().trim().max(80),
  monthlyPremiumCents: z.number().int().min(0).max(1_000_000),
  audience: z.enum(["personal", "organisation", "all"]),
  active: z.boolean(),
});
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activate"), id: z.string().uuid(), policyNumber: z.string().trim().min(1).max(60) }),
  z.object({ action: z.literal("reject"), id: z.string().uuid(), note: z.string().trim().min(1).max(300) }),
  z.object({ action: z.literal("cancel"), id: z.string().uuid() }),
]);

// GET /api/admin/bank/insurance — catalogue + every policy (requests first).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [products, policies] = await Promise.all([getProducts(), listPolicies()]);
  return NextResponse.json({ products, policies });
});

// PUT /api/admin/bank/insurance — save the catalogue (a product only goes on with an insurer).
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const { products } = z.object({ products: z.array(product).max(50) }).parse(await request.json().catch(() => ({})));
  const saved = await saveProducts(products);
  await recordAudit({
    category: "ADMIN",
    action: "bank.insurance_catalogue",
    actorUserId: principal.userId,
    summary: `Verzekeringen bijgewerkt: ${saved.filter((p) => p.active).map((p) => `${p.name} (${p.insurer})`).join(", ") || "geen actief"}`,
    targetType: "bank-insurance",
    targetId: "catalogue",
  });
  return NextResponse.json({ products: saved });
});

// POST /api/admin/bank/insurance — activate (insurer accepted), reject or cancel a policy.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const input = action.parse(await request.json().catch(() => ({})));
  const policy =
    input.action === "activate" ? await activatePolicy(input.id, input.policyNumber) : input.action === "reject" ? await rejectPolicy(input.id, input.note) : await cancelPolicy(input.id, null);
  await recordAudit({
    category: "ADMIN",
    action: `bank.insurance_${input.action}`,
    actorUserId: principal.userId,
    summary: `${policy.productName} voor ${policy.holderName} → ${policy.status}${policy.arrears ? " (eerste premie nog niet betaald)" : ""}`,
    targetType: "bank-account",
    targetId: policy.accountId,
  });
  return NextResponse.json({ policy });
});
