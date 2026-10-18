import { withAdminAccess } from "@/lib/auth/handlers";
import { ordersCsv } from "@/lib/shop/admin-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/shop/export?month=2026-10 — the month's orders as CSV (Excel, NL format).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const month = new URL(request.url).searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  const y = Number(m?.[1] ?? new Date().getUTCFullYear());
  const mo = Number(m?.[2] ?? new Date().getUTCMonth() + 1);
  const body = await ordersCsv(new Date(Date.UTC(y, mo - 1, 1)), new Date(Date.UTC(y, mo, 1)));
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="zekerflex-shop-bestellingen-${y}-${String(mo).padStart(2, "0")}.csv"` } });
});
