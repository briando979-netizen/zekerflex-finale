import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { getReminderSettings, overdueInvoices, remindTenantNow, setReminderSettings } from "@/lib/billing/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/invoices/overdue — client invoices past their due date + reminder progress.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () =>
  NextResponse.json({ invoices: await overdueInvoices(), settings: await getReminderSettings() }),
);

// PUT /api/admin/invoices/overdue { enabled } — automatic reminders on/off.
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (req, { principal }) => {
  const { enabled } = z.object({ enabled: z.boolean() }).parse(await req.json().catch(() => ({})));
  await setReminderSettings(enabled, principal.userId);
  return NextResponse.json({ settings: { enabled } });
});

// POST /api/admin/invoices/overdue { tenantId } — send that company's next reminder now.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (req, { principal }) => {
  const { tenantId } = z.object({ tenantId: z.string().min(5).max(64) }).parse(await req.json().catch(() => ({})));
  if (!(await remindTenantNow(tenantId, principal.userId))) throw AppError.validation("Geen achterstallige facturen of geen e-mailadres voor dit bedrijf.");
  return NextResponse.json({ ok: true });
});
