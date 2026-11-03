import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { createWebsiteProposal, listWebsiteProposals, proposalOffer } from "@/lib/sales/website-proposal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ---------------------------------------------------------------------------
// Buitendienst → Websitevoorstellen (/sales/websitevoorstellen): sales people
// make and follow up proposals. Prices and handing a site to a company stay
// with the platform admin (/api/admin/websitevoorstellen).
// GET  — the proposals and the current offer
// POST — make a proposal for a website address
// ---------------------------------------------------------------------------

const createSchema = z.object({ url: z.string().trim().min(1).max(500) });

export const GET = withAdminAccess(["SALES", "PLATFORM_ADMIN"], async () => {
  const [proposals, offer] = await Promise.all([listWebsiteProposals(), proposalOffer()]);
  return NextResponse.json({ proposals, offer });
});

export const POST = withAdminAccess(["SALES", "PLATFORM_ADMIN"], async (request, { principal }) => {
  const json = await request.json().catch(() => {
    throw AppError.validation("Body moet JSON zijn");
  });
  const proposal = await createWebsiteProposal(createSchema.parse(json), { userId: principal.userId, name: principal.fullName || principal.email });
  return NextResponse.json({ proposal }, { status: 201 });
});
