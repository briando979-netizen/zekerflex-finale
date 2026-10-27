import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { llmHealth } from "@/lib/ai/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/jarvis/brain — which brain is live right now (for the console
// badge). "cloud" = the model server is NOT a local/private address, i.e. a
// hosted gateway giving Claude-level quality; otherwise it's the sovereign
// local node. Never throws — a bad config just reports ok:false with a hint.
const PRIVATE_HOST =
  /^(localhost|127\.|0\.0\.0\.0|\[::1\]|.*\.local|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i;

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const h = await llmHealth();
  let host = "";
  try {
    host = new URL(h.baseUrl).host;
  } catch {
    host = h.baseUrl;
  }
  const cloud = host.length > 0 && !PRIVATE_HOST.test(host);
  return NextResponse.json({ ok: h.ok, model: h.model, host, cloud, detail: h.detail ?? null });
});
