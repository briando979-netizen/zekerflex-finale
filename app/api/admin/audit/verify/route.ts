import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { verifyAuditChain } from "@/lib/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/audit/verify — walk the tamper-evident audit chain and report
// the first broken link (if any). PLATFORM_ADMIN only. `?fromSeq=` resumes from
// a checkpoint.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const fromRaw = new URL(request.url).searchParams.get("fromSeq");
  const fromSeq =
    fromRaw && /^\d+$/.test(fromRaw) ? BigInt(fromRaw) : undefined;

  const result = await verifyAuditChain(fromSeq ? { fromSeq } : {});
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
});
