import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { llmHealth, servedModels } from "@/lib/ai/client";
import { getMainModelOverride, setMainModelOverride } from "@/lib/ai/llm-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/jarvis/brain — which brain is live (for the console badge) and
// which local models the node serves (for the model picker). "cloud" = the
// model server is NOT a local/private address, i.e. a hosted gateway; otherwise
// it's the sovereign local node (token-free). Never throws.
const PRIVATE_HOST =
  /^(localhost|127\.|0\.0\.0\.0|\[::1\]|.*\.local|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i;

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [h, models, override] = await Promise.all([llmHealth(), servedModels(), getMainModelOverride()]);
  let host = "";
  try {
    host = new URL(h.baseUrl).host;
  } catch {
    host = h.baseUrl;
  }
  const cloud = host.length > 0 && !PRIVATE_HOST.test(host);
  return NextResponse.json({
    ok: h.ok,
    model: h.model,
    host,
    cloud,
    detail: h.detail ?? null,
    models,
    selected: override ?? h.model,
    custom: override !== null,
  });
});

// POST /api/admin/jarvis/brain { model } — kies het lokale hoofdmodel (token-vrij,
// geen redeploy). Lege string = terug naar de env-default.
const bodySchema = z.object({ model: z.string().max(120) });

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const body = bodySchema.parse(await request.json());
  await setMainModelOverride(body.model);
  return NextResponse.json({ ok: true, selected: body.model.trim() || null });
});
