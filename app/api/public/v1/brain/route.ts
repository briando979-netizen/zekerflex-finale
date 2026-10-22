import { NextResponse } from "next/server";
import { z } from "zod";
import { principalForUser, type Principal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { requireApiKey } from "@/lib/api-keys/gateway";
import { rateLimitHeaders } from "@/lib/http/rate-limit-headers";
import { prisma } from "@/lib/prisma";
import { think } from "@/lib/brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  question: z.string().trim().min(1).max(1500),
  /** extra context from the automation (e.g. a webhook payload) — treated as data, never as instructions */
  context: z.union([z.string().max(6000), z.record(z.unknown())]).optional(),
});

/**
 * Who the brain answers as for this key: the key's creator, limited to the
 * key's own organisation. A key without a (still active) creator, or whose
 * creator has no role in that organisation, gets knowledge-only answers.
 */
async function principalForKey(key: { id: string; tenantId: string | null }): Promise<Principal> {
  const row = await prisma.apiKey.findUnique({ where: { id: key.id }, select: { createdById: true } });
  const creator = row?.createdById ? await principalForUser(row.createdById) : null;
  const guest: Principal = { userId: `apikey:${key.id}`, email: "", fullName: "Automatisering", emailVerifiedAt: null, grants: [], memberships: [], managedBranchIds: [] };
  if (!creator) return guest;
  if (!key.tenantId) return creator; // platform key made by an admin
  const grants = creator.grants.filter((g) => g.organizationId === key.tenantId && g.role !== "PLATFORM_ADMIN");
  if (!grants.length) return guest;
  return {
    ...creator,
    grants,
    memberships: grants.map((g) => ({ tenantId: g.organizationId, role: g.role })),
    managedBranchIds: [...new Set(grants.flatMap((g) => g.locationIds))],
  };
}

// POST /api/public/v1/brain — ask the ZekerFlex brain from n8n / Make / Zapier / your own code.
// Scope "brain:ask". Same brain as in the app (agentic RAG + CAG + read-only data tools), stateless.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { key, rate } = await requireApiKey(request, "brain:ask");
    const input = schema.parse(await request.json().catch(() => ({})));
    const principal = await principalForKey(key);
    const ctx = input.context === undefined ? "" : typeof input.context === "string" ? input.context : JSON.stringify(input.context);
    const res = await think(principal, input.question, { stateless: true, ...(ctx ? { context: ctx } : {}) });
    return NextResponse.json(
      {
        answer: res.answer,
        mode: res.mode,
        tools: res.tools,
        sources: res.sources,
        links: res.links.map((l) => ({ ...l, url: new URL(l.href, request.url).toString() })),
      },
      { headers: rateLimitHeaders(rate) },
    );
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
