import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { createWebsiteProposal, listWebsiteProposals, pricingIsSet, pricingSchema, proposalOffer, saveProposalPricing } from "@/lib/sales/website-proposal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// reading their site, fetching their photos and building the new one takes a while
export const maxDuration = 120;

// ---------------------------------------------------------------------------
// Admin → Websitevoorstellen (lib/sales/website-proposal.ts), platform admins
// only like every /api/admin route. Sales people use /api/sales/websitevoorstellen.
// GET  — the proposals, the prices and how many launch places are left
// POST — make a proposal for a lead or a website address
// PUT  — set the prices and the launch discount
// ---------------------------------------------------------------------------

const createSchema = z.object({ leadId: z.string().min(1).max(128).optional(), url: z.string().trim().max(500).optional() }).refine((v) => v.leadId || v.url, "Kies een lead of vul een website in.");

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [proposals, offer, set] = await Promise.all([listWebsiteProposals(), proposalOffer(), pricingIsSet()]);
  return NextResponse.json({ proposals, offer, pricingSet: set });
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const json = await request.json().catch(() => {
    throw AppError.validation("Body moet JSON zijn");
  });
  const proposal = await createWebsiteProposal(createSchema.parse(json), { userId: principal.userId, name: principal.fullName || principal.email });
  return NextResponse.json({ proposal }, { status: 201 });
});

export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const json = await request.json().catch(() => {
    throw AppError.validation("Body moet JSON zijn");
  });
  const pricing = await saveProposalPricing(pricingSchema.parse(json), principal.userId);
  return NextResponse.json({ pricing, offer: await proposalOffer() });
});
