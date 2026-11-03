import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { transferWebsiteProposal, updateWebsiteProposal } from "@/lib/sales/website-proposal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/admin/websitevoorstellen/<id> — what happened to a proposal: sent
// (by a person), the company said no, withdraw it (site offline, address free),
// give it more time, give a launch place back, or after a yes hand the site to
// the company's own account ("overzetten", by the e-mail of that company's admin).
// Platform admins only; sales people use /api/sales/websitevoorstellen/<id>.

const schema = z.object({
  action: z.enum(["verstuurd", "afgewezen", "ingetrokken", "verlengen", "plek-vrijgeven", "overzetten"]),
  email: z.string().trim().max(200).optional(),
});

export const PATCH = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const json = await request.json().catch(() => {
    throw AppError.validation("Body moet JSON zijn");
  });
  const { action, email } = schema.parse(json);
  const by = { userId: principal.userId, name: principal.fullName || principal.email };
  if (action === "overzetten") {
    if (!email) throw AppError.validation("Vul het e-mailadres van de beheerder van het bedrijf in.");
    return NextResponse.json({ proposal: await transferWebsiteProposal(params.id, email, by) });
  }
  return NextResponse.json({ proposal: await updateWebsiteProposal(params.id, action, by) });
});
