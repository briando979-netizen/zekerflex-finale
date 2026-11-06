import { getPrincipal, hasRole } from "@/lib/auth";
import { kvSet, kvGet } from "@/lib/storage/kv";

const KV_KEY = "config:purchase-modes";

export async function GET() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const settings = await kvGet(KV_KEY);
  return Response.json(settings || {});
}

export async function PUT(req: Request) {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const settings = await req.json();
  await kvSet(KV_KEY, settings);

  return Response.json({ ok: true });
}
