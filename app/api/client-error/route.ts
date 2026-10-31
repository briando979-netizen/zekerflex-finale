import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/client-error — de crash-boundary (app/error.tsx) stuurt hier de
// echte client-side fout naartoe (bericht + stacktrace + scherm), zodat die in
// de serverlogs terechtkomt en te diagnosticeren is. Publiek + IP-begrensd;
// best-effort, geeft altijd 200 terug (rapporteren mag nooit zelf crashen).
const schema = z.object({
  message: z.string().max(2000).optional(),
  stack: z.string().max(8000).optional(),
  digest: z.string().max(200).optional(),
  url: z.string().max(500).optional(),
  userAgent: z.string().max(400).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "client-error",
      identifier: clientIp(request),
      limit: 30,
      windowSeconds: 60,
      message: "Te veel foutmeldingen.",
    });
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (parsed.success) {
      logger.error("client error boundary", {
        clientMessage: parsed.data.message ?? "",
        digest: parsed.data.digest ?? "",
        url: parsed.data.url ?? "",
        userAgent: parsed.data.userAgent ?? "",
        stack: (parsed.data.stack ?? "").slice(0, 4000),
      });
    }
  } catch {
    /* rate-limited of ongeldig — stil negeren */
  }
  return NextResponse.json({ ok: true });
}
