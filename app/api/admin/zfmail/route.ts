import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { transipConfigured } from "@/lib/mail/hosting/transip";
import { adminAction, adminActionSchema, listAccounts, publicAccount } from "@/lib/mail/zf-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/zfmail — every ZekerFlex address, and whether the TransIP key is set.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const accounts = await listAccounts();
  return NextResponse.json({
    live: transipConfigured(),
    accounts: accounts.map((a) => ({ ...publicAccount(a), userId: a.userId, tenantId: a.tenantId, history: a.history })),
  });
});

// POST — { action: "activeer" | "blokkeer" | "deblokkeer", address, note? }
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const input = adminActionSchema.parse(await request.json().catch(() => ({})));
  const account = await adminAction(input, { userId: principal.userId, name: principal.fullName });
  return NextResponse.json({ account: publicAccount(account) });
});
