import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { llmHealth, servedModels } from "@/lib/ai/client";
import { modelFleet } from "@/lib/ai/models";
import { getFleet, setFleetRole, setMainModelOverride } from "@/lib/ai/llm-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/jarvis/brain — which brain is live (badge), which local models
// the node serves (picker), and the per-role assignment ("slim schakelen"). A
// non-local/private host = a hosted gateway ("cloud"); otherwise the sovereign
// local node (token-free). Never throws.
const PRIVATE_HOST =
  /^(localhost|127\.|0\.0\.0\.0|\[::1\]|.*\.local|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i;

// The roles that matter for the chat/switcher, in display order.
const PICKABLE = ["main", "reasoning", "fast", "code"] as const;
const SHORT: Record<string, string> = { main: "hoofd", reasoning: "redeneren", fast: "snel", code: "code" };

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [h, models, fleet] = await Promise.all([llmHealth(), servedModels(), getFleet()]);
  let host = "";
  try {
    host = new URL(h.baseUrl).host;
  } catch {
    host = h.baseUrl;
  }
  const cloud = host.length > 0 && !PRIVATE_HOST.test(host);
  const byRole = new Map(modelFleet().map((r) => [r.role as string, r]));
  const roles = PICKABLE.map((role) => {
    const f = byRole.get(role);
    return { role, label: SHORT[role] ?? role, model: f?.model ?? "", recommended: f?.recommended ?? "" };
  });
  return NextResponse.json({ ok: h.ok, model: h.model, host, cloud, detail: h.detail ?? null, models, fleet, roles });
});

// POST /api/admin/jarvis/brain { model, role? } — wijs een model toe aan een rol
// (token-vrij, geen redeploy). Lege string = terug naar auto/env. Geen role = hoofdmodel.
const bodySchema = z.object({ role: z.string().max(20).optional(), model: z.string().max(120) });

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const body = bodySchema.parse(await request.json());
  if (body.role) await setFleetRole(body.role, body.model);
  else await setMainModelOverride(body.model);
  return NextResponse.json({ ok: true, role: body.role ?? "main", model: body.model.trim() || null });
});
