import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { setLlmApiKey, llmKeyIsCustom, getLlmApiKey } from "@/lib/ai/llm-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: is er een eigen sleutel in KV gezet, en is er überhaupt een sleutel actief
// (KV óf env). De sleutel zelf geven we nooit terug.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () =>
  NextResponse.json({ custom: await llmKeyIsCustom(), configured: Boolean(await getLlmApiKey()) }),
);

const schema = z.object({ key: z.string().max(400) });

// PUT: zet (of wis met een lege waarde) de AI-node-sleutel server-side in KV —
// geen Vercel-env of redeploy meer nodig.
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (req) => {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "key ontbreekt" } }, { status: 400 });
  await setLlmApiKey(parsed.data.key);
  return NextResponse.json({ ok: true, custom: await llmKeyIsCustom(), configured: Boolean(await getLlmApiKey()) });
});
